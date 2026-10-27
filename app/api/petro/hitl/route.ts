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
    return rewriteUpstream(upstream, requestId);
  }
  const rewritten = await rewriteUpstream(upstream, requestId);
  // 只解析一次。原来这里先 `.catch(() => null)` 解析一遍拿 thread_id，
  // 再无条件 `await clone().json()` 解析第二遍 —— 上游返回非 JSON 时第二遍会抛，
  // 于是线程已经登记了，客户端却收到一个没有 requestId、没有中文说明的 500。
  const payload = (await rewritten.clone().json().catch(() => null)) as Record<string, unknown> | null;
  const threadId = typeof payload?.thread_id === "string" ? payload.thread_id : "";
  if (!threadId) {
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
  const thread = registerHitlThread(threadId, requestId, { input: userInput });
  const registered = thread?.kind === "hitl";
  return withRequest(
    {
      ...(payload ?? {}),
      thread_state: registered ? thread?.phase : "failed",
      expires_at: registered ? thread?.expiresAt : undefined,
      recovery: registered ? [] : ["上游返回的线程已被记成分析流，不能批准。请重新发起 HITL。"],
    },
    requestId,
    registered ? 200 : 409,
  );
}
