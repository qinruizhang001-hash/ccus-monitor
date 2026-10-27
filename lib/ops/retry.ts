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
  const attempts = opts?.attempts ?? (mode === "read" ? 3 : 2);
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
