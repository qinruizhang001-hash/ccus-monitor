import { offlineRecovery, rateLimitRecovery, timeoutRecovery } from "@/lib/ops/errors";
import { riskIntervalMs, takeRateLimit } from "@/lib/ops/rate-limit";
import { requestIdFrom } from "@/lib/ops/request-id";
import { fetchUpstream, isTimeout } from "@/lib/ops/retry";
import { authHeaders, offlineMessage, petroConfig } from "@/lib/petro/config";
import { mockAnalyzeStream } from "@/lib/petro/mock";
import { withRequest } from "@/lib/petro/respond";
import { trackAnalyzeStream } from "@/lib/petro/track-stream";
import { jsonError, upstreamMessage } from "@/lib/petro/upstream";

export const maxDuration = 300;

const streamHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const body = (await request.json().catch(() => null)) as { user_input?: string } | null;
  const userInput = body?.user_input?.trim() ?? "";
  if (userInput.length < 8) {
    return withRequest(
      { error: "bad_request", message: "项目描述至少 8 个字，写明井、压力或告警后再评估。", recovery: ["不要用空描述连点评估。"] },
      requestId,
      400,
    );
  }
  const limit = takeRateLimit("risk-assess", riskIntervalMs());
  if (!limit.ok) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    return withRequest(
      {
        error: "rate_limited",
        message: `评估请求过于密集。请 ${seconds} 秒后再试。`,
        recovery: rateLimitRecovery(seconds),
        retry_after_ms: limit.retryAfterMs,
      },
      requestId,
      429,
    );
  }

  const { baseUrl, token, mock } = petroConfig();
  const headers = { ...streamHeaders, "X-Request-Id": requestId };
  if (mock) {
    return new Response(trackAnalyzeStream(mockAnalyzeStream(userInput), requestId), { headers });
  }

  try {
    const upstream = await fetchUpstream(`${baseUrl}/api/analyze`, {
      method: "POST",
      signal: request.signal,
      headers: authHeaders(token, {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Request-Id": requestId,
      }),
      body: JSON.stringify({ user_input: userInput }),
    }, { mode: "post", timeoutMs: 240_000, attempts: 2 });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return jsonError(upstreamMessage(text, upstream.status), upstream.status || 502);
    }
    return new Response(trackAnalyzeStream(upstream.body, requestId), { headers });
  } catch (error) {
    if (request.signal.aborted) {
      return withRequest({ error: "aborted", message: "评估已取消。没有结论，也没有批准。", recovery: [] }, requestId, 499);
    }
    const timeout = isTimeout(error);
    return withRequest(
      {
        error: timeout ? "timeout" : "offline",
        message: timeout ? "连接评估服务超时。这次没有结论。" : offlineMessage(),
        recovery: timeout ? timeoutRecovery() : offlineRecovery(),
      },
      requestId,
      timeout ? 504 : 503,
    );
  }
}
