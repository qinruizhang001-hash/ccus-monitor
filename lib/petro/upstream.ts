import { offlineRecovery, tokenRecovery } from "@/lib/ops/errors";
import { fetchUpstream, isTimeout } from "@/lib/ops/retry";
import { authHeaders, offlineMessage, petroConfig, upstreamMessage } from "@/lib/petro/config";
import type { HealthCheck } from "@/lib/petro/types";

type HealthBody = {
  status?: string;
  auth?: string;
  service?: string;
  checks?: Record<string, HealthCheck>;
};

function isHealthPayload(value: unknown): value is HealthBody {
  if (!value || typeof value !== "object") return false;
  const body = value as HealthBody;
  return body.status === "ok" || body.status === "degraded" || typeof body.checks === "object";
}

async function probeOnce(url: string, token: string, withAuth: boolean) {
  const response = await fetchUpstream(url, {
    headers: withAuth ? authHeaders(token, { Accept: "application/json" }) : { Accept: "application/json" },
  }, { mode: "read", attempts: 2, timeoutMs: 4000 });
  const text = await response.text();
  try {
    const json = JSON.parse(text) as unknown;
    if (isHealthPayload(json)) {
      return { response, json };
    }
  } catch {
    /* HTML from the wrong upstream, try the next path */
  }
  return { response, json: null as HealthBody | null };
}

export async function probePetroHealth() {
  const { baseUrl, token, mock } = petroConfig();
  if (mock) {
    return {
      reachable: true,
      mock: true,
      status: "mock" as const,
      baseUrl,
      authConfigured: Boolean(token),
      message:
        "PETRO_RAG_MOCK=1。风险评估走内置演示流，没有连接 petro-rag-agent，也没有调用 Ollama。这不是现场 SCADA。",
      recovery: ["演示流不会自动批准。人工复核仍走 HITL 三个接口，线程记在 .data/hitl-threads.json。"],
      checks: null,
    };
  }

  const paths = ["/health", "/api/health"];
  let lastError = "";
  for (const path of paths) {
    try {
      let probed = await probeOnce(`${baseUrl}${path}`, token, false);
      if (!probed.json && probed.response.status === 401 && token) {
        probed = await probeOnce(`${baseUrl}${path}`, token, true);
      }
      if (probed.json) {
        const status = probed.json.status === "degraded" ? "degraded" : "ok";
        const failed = Object.entries(probed.json.checks ?? {})
          .filter(([, check]) => check && check.ok === false)
          .map(([name]) => name);
        const tokenNote = token ? "" : " 未配置 PETRO_RAG_API_TOKEN。上游若开启鉴权，评估会 401，本站不会放行。";
        const message =
          status === "ok"
            ? `petro-rag-agent 可达（${path}）。依赖探针正常。${tokenNote}`
            : `petro-rag-agent 进程在，但依赖降级${failed.length ? `：${failed.join("、")}` : ""}。${tokenNote}`;
        return {
          reachable: true,
          mock: false,
          status: status as "ok" | "degraded",
          baseUrl,
          authConfigured: Boolean(token),
          probedPath: path,
          message,
          recovery: status === "ok" ? (token ? [] : tokenRecovery()) : ["查看 checks 里 ok=false 的依赖，修好后再做风险评估。", ...(!token ? tokenRecovery() : [])],
          auth: probed.json.auth,
          service: probed.json.service,
          checks: probed.json.checks ?? null,
        };
      }
      lastError = `${path} 返回 ${probed.response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络错误";
    }
  }

  return {
    reachable: false,
    mock: false,
    status: "offline" as const,
    baseUrl,
    authConfigured: Boolean(token),
    message: `${offlineMessage()}（最近一次探测：${lastError || "无响应"}）`,
    recovery: offlineRecovery(),
    checks: null,
  };
}

export async function proxyJson(
  path: string,
  body: unknown,
  opts?: { signal?: AbortSignal; mode?: "post" | "approve"; timeoutMs?: number; requestId?: string },
) {
  const { baseUrl, token } = petroConfig();
  const requestId = opts?.requestId;
  try {
    const response = await fetchUpstream(`${baseUrl}${path}`, {
      method: "POST",
      signal: opts?.signal,
      headers: authHeaders(token, {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      }),
      body: JSON.stringify(body),
    }, {
      mode: opts?.mode ?? "post",
      timeoutMs: opts?.timeoutMs ?? 60_000,
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
    });
  } catch (error) {
    const timeout = isTimeout(error);
    return Response.json(
      {
        error: timeout ? "timeout" : "offline",
        message: timeout ? "连接 petro-rag-agent 超时。这次没有放行。" : offlineMessage(),
        recovery: timeout
          ? ["确认上游还在响应，间隔后再试。", "不要把没有返回的线程当成已批准。"]
          : offlineRecovery(),
        request_id: requestId,
      },
      { status: timeout ? 504 : 503, headers: requestId ? { "X-Request-Id": requestId } : undefined },
    );
  }
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: status === 503 ? "offline" : "upstream", message }, { status });
}

export { upstreamMessage };
