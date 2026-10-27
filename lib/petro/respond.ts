import { tokenRecovery } from "@/lib/ops/errors";
import { upstreamMessage } from "@/lib/petro/config";

export function withRequest(body: unknown, requestId: string, status = 200) {
  const payload =
    body && typeof body === "object"
      ? { ...(body as Record<string, unknown>), request_id: requestId }
      : { body, request_id: requestId };
  return Response.json(payload, {
    status,
    headers: { "X-Request-Id": requestId },
  });
}

export async function rewriteUpstream(response: Response, requestId: string) {
  const text = await response.text();
  if (response.status === 401) {
    return withRequest(
      {
        error: "unauthorized",
        message: "评估服务拒绝了令牌。这次没有放行。",
        detail: upstreamMessage(text, 401),
        recovery: tokenRecovery(),
      },
      requestId,
      401,
    );
  }
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }
  return withRequest(parsed, requestId, response.status);
}
