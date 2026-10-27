export type RetryMode = "read" | "post" | "approve";

function backoffMs(attempt: number) {
  return [400, 1200, 2800][attempt] ?? 2800;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 每种模式能试几次。
 *
 * `approve` 是 1，不是 2。批准不是幂等操作：同一个 thread 批两次，上游要么报错、
 * 要么按第二次的 payload 覆盖第一次 —— 而两次之间用户可能改了意见。
 * 所以它必须是「至多一次」，不是「失败重试」。
 */
export function attemptsFor(mode: RetryMode, requested?: number) {
  const base = mode === "read" ? 3 : mode === "approve" ? 1 : 2;
  if (requested === undefined) return base;
  if (mode === "approve") return 1; // 调用方传多大都不放行：语义是至多一次
  return Math.max(1, Math.floor(requested));
}

function shouldRetryStatus(status: number, mode: RetryMode) {
  if (mode === "approve") return false;
  return status === 502 || status === 503 || status === 504;
}

export async function fetchUpstream(
  url: string,
  init: RequestInit,
  opts?: { attempts?: number; timeoutMs?: number; mode?: RetryMode },
) {
  const mode = opts?.mode ?? "read";
  const attempts = attemptsFor(mode, opts?.attempts);
  const timeoutMs = opts?.timeoutMs ?? (mode === "read" ? 8_000 : 60_000);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const response = await fetch(url, { ...init, signal, cache: "no-store" });
      if (shouldRetryStatus(response.status, mode) && attempt < attempts - 1) {
        await sleep(backoffMs(attempt), init.signal ?? undefined);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      // 传输层失败（超时、连不上、连接被掐）只对读请求重试。
      //
      // post / approve 都是「会开跑」或「会落决定」的请求。超时和网络错误都无法区分
      // 「请求没到上游」和「到了、也执行了、只是响应没回来」；默认重试等于赌是前一种，
      // 赌错就是同一个 thread 批两次、同一段评估开两遍。
      // 收到响应头的 5xx 是另一回事 —— 那说明请求没被处理，由 shouldRetryStatus 单独判断。
      if (mode !== "read") throw error;
      const aborted = init.signal?.aborted || (error instanceof Error && error.name === "AbortError");
      if (aborted && !isTimeout(error)) throw error;
      if (attempt === attempts - 1) throw error;
      await sleep(backoffMs(attempt), init.signal ?? undefined);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("上游请求失败");
}

export function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" && /timeout/i.test(error.message));
}
