import { notHitlRecovery, VIEWER_APPROVE_MESSAGE } from "@/lib/ops/errors";
import { requestIdFrom } from "@/lib/ops/request-id";
import { opsSession, denialMessage } from "@/lib/ops/session";
import { petroConfig } from "@/lib/petro/config";
import { mockApprove, mockRestore } from "@/lib/petro/mock";
import { rewriteUpstream, withRequest } from "@/lib/petro/respond";
import { assertApprovable, getThread, markHitlDecision } from "@/lib/petro/threads";
import { proxyJson } from "@/lib/petro/upstream";
import type { PetroResult } from "@/lib/petro/types";

export const maxDuration = 300;

function restoreMock(threadId: string) {
  const saved = getThread(threadId);
  if (!saved || saved.kind !== "hitl" || !saved.input) return;
  mockRestore({
    id: saved.id,
    input: saved.input,
    rejections: saved.rejections,
    finished: saved.phase === "approved",
    blocking: Boolean(saved.blocking),
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const body = (await request.json().catch(() => null)) as {
    thread_id?: string;
    approved?: boolean;
    reviewer?: string;
    comment?: string;
  } | null;
  if (!body?.thread_id || typeof body.approved !== "boolean") {
    return withRequest(
      { error: "bad_request", message: "缺少 thread_id 或 approved。", recovery: notHitlRecovery() },
      requestId,
      400,
    );
  }
  if (body.approved && opsSession().role !== "operator") {
    return withRequest(
      {
        error: "forbidden",
        message: denialMessage(VIEWER_APPROVE_MESSAGE),
        recovery: ["驳回仍可由观察员提交。通过只留给值班员。"],
      },
      requestId,
      403,
    );
  }
  if (!body.approved && (body.comment ?? "").trim().length < 2) {
    return withRequest(
      { error: "note_required", message: "驳回必须写意见，至少两个字。", recovery: ["意见会交给重写，不要空驳回。"] },
      requestId,
      400,
    );
  }
  const gate = assertApprovable(body.thread_id);
  if (!gate.ok) {
    return withRequest(
      { error: gate.error, message: gate.message, recovery: gate.recovery, thread_state: getThread(body.thread_id)?.phase ?? null },
      requestId,
      gate.status,
    );
  }
  const payload = {
    thread_id: body.thread_id,
    approved: body.approved,
    reviewer: body.reviewer?.trim() || opsSession().actor,
    comment: body.comment ?? "",
  };
  if (petroConfig().mock) {
    restoreMock(body.thread_id);
    const result = mockApprove(payload);
    if (result.status === 200 && result.body && "thread_id" in result.body) {
      const review = (result.body as PetroResult).human_review;
      markHitlDecision(body.thread_id, body.approved, review?.rejections ?? gate.thread.rejections);
    }
    const thread = getThread(body.thread_id);
    return withRequest(
      { ...result.body, thread_state: thread?.phase ?? null, expires_at: thread?.expiresAt ?? null },
      requestId,
      result.status,
    );
  }
  const upstream = await proxyJson("/api/approve", payload, {
    signal: request.signal,
    mode: "approve",
    timeoutMs: 20_000,
    requestId,
  });
  if (upstream.ok) {
    const parsed = (await upstream.clone().json().catch(() => null)) as PetroResult | null;
    markHitlDecision(body.thread_id, body.approved, parsed?.human_review?.rejections ?? (body.approved ? gate.thread.rejections : gate.thread.rejections + 1));
  }
  return rewriteUpstream(upstream, requestId);
}
