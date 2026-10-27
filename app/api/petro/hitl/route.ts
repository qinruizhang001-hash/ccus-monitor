import { offlineRecovery } from "@/lib/ops/errors";
import { requestIdFrom } from "@/lib/ops/request-id";
import { petroConfig } from "@/lib/petro/config";
import { mockStartHitl } from "@/lib/petro/mock";
import { rewriteUpstream, withRequest } from "@/lib/petro/respond";
import { registerHitlThread } from "@/lib/petro/threads";
import { proxyJson } from "@/lib/petro/upstream";

export const maxDuration = 300;

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const body = (await request.json().catch(() => null)) as { user_input?: string } | null;
  const userInput = body?.user_input?.trim() ?? "";
  if (userInput.length < 8) {
    return withRequest(
      { error: "bad_request", message: "请先填写项目描述，至少 8 个字。", recovery: ["用评估卡片里的同一段描述发起 HITL。"] },
      requestId,
      400,
    );
  }
  if (petroConfig().mock) {
    const started = mockStartHitl(userInput);
    const threadId = started.thread_id;
    if (!threadId) {
      return withRequest({ error: "failed", message: "演示流没有返回 HITL 线程。", recovery: ["重新发起。"] }, requestId, 502);
    }
    const thread = registerHitlThread(threadId, requestId, { input: userInput });
    return withRequest(
      {
        ...started,
        thread_state: thread?.phase ?? "awaiting_approval",
        expires_at: thread?.expiresAt,
        note: "已发起人工复核。系统不会自动批准。",
      },
      requestId,
    );
  }
  const upstream = await proxyJson("/api/analyze/hitl", { user_input: userInput }, {
    signal: request.signal,
    mode: "post",
    timeoutMs: 60_000,
    requestId,
  });
  if (!upstream.ok) {
    const rewritten = await rewriteUpstream(upstream, requestId);
    return rewritten;
  }
  const rewritten = await rewriteUpstream(upstream, requestId);
  const payload = (await rewritten.clone().json().catch(() => null)) as { thread_id?: string } | null;
  if (payload?.thread_id) {
    const thread = registerHitlThread(payload.thread_id, requestId, { input: userInput });
    const bodyJson = (await rewritten.clone().json()) as Record<string, unknown>;
    return withRequest(
      {
        ...bodyJson,
        thread_state: thread?.kind === "hitl" ? thread.phase : "failed",
        expires_at: thread?.expiresAt,
        recovery: thread?.kind === "hitl" ? [] : ["上游返回的线程已被记成分析流，不能批准。请重新发起 HITL。"],
      },
      requestId,
      thread?.kind === "hitl" ? 200 : 409,
    );
  }
  return withRequest(
    {
      error: "offline",
      message: "HITL 没有返回 thread_id。这次没有进入待确认。",
      recovery: offlineRecovery(),
    },
    requestId,
    502,
  );
}
