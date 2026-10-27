import { connection } from "next/server";
import { notHitlRecovery } from "@/lib/ops/errors";
import { requestIdFrom } from "@/lib/ops/request-id";
import { fetchUpstream } from "@/lib/ops/retry";
import { authHeaders, petroConfig } from "@/lib/petro/config";
import { mockGetReview, mockRestore } from "@/lib/petro/mock";
import { rewriteUpstream, withRequest } from "@/lib/petro/respond";
import { getThread } from "@/lib/petro/threads";

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  await connection();
  const requestId = requestIdFrom(request);
  const { threadId } = await params;
  const id = decodeURIComponent(threadId || "");
  if (!id) {
    return withRequest({ error: "bad_request", message: "缺少 thread_id。", recovery: notHitlRecovery() }, requestId, 400);
  }
  const tracked = getThread(id);
  if (!tracked) {
    return withRequest(
      { error: "not_hitl", message: "本服务没有跟踪这条线程。", recovery: notHitlRecovery() },
      requestId,
      404,
    );
  }
  if (tracked.kind !== "hitl") {
    return withRequest(
      {
        error: "not_hitl",
        message: `线程 ${id} 来自流式评估，不能当作待批准项。`,
        thread_state: tracked.phase,
        recovery: notHitlRecovery(),
      },
      requestId,
      409,
    );
  }
  if (tracked.phase === "expired") {
    return withRequest(
      {
        error: "expired",
        message: "这条人工复核已超时，未批准。",
        thread_state: "expired",
        expires_at: tracked.expiresAt,
        recovery: ["重新发起 HITL。超时不会自动通过。"],
      },
      requestId,
      410,
    );
  }
  if (petroConfig().mock) {
    if (!mockGetReview(id) && tracked.input) {
      mockRestore({
        id,
        input: tracked.input,
        rejections: tracked.rejections,
        finished: tracked.phase === "approved",
        blocking: Boolean(tracked.blocking),
      });
    }
    const review = mockGetReview(id);
    if (!review) {
      return withRequest(
        {
          error: "not_found",
          message: "线程记录还在，但演示复核内容已丢失。请重新发起 HITL。",
          thread_state: tracked.phase,
          recovery: ["备份文件是 .data/hitl-threads.json。没有原文时不能恢复报告正文。"],
        },
        requestId,
        404,
      );
    }
    return withRequest({ ...review, thread_state: tracked.phase, expires_at: tracked.expiresAt }, requestId);
  }
  const { baseUrl, token } = petroConfig();
  try {
    const response = await fetchUpstream(`${baseUrl}/api/review/${encodeURIComponent(id)}`, {
      headers: authHeaders(token, { Accept: "application/json", "X-Request-Id": requestId }),
    }, { mode: "read", timeoutMs: 8_000 });
    return rewriteUpstream(response, requestId);
  } catch {
    return withRequest(
      {
        error: "offline",
        message: "读不到上游复核状态。本地仍记着这条 HITL，但没有新正文。",
        thread_state: tracked.phase,
        recovery: ["确认评估服务在线后再刷新。不要因为刷新失败就点通过。"],
      },
      requestId,
      503,
    );
  }
}
