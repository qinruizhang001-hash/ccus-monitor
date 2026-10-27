"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useAlertOps } from "@/components/dashboard/alert-ops";
import { RecoveryList } from "@/components/ops/recovery-list";
import { Button } from "@/components/ui/button";
import { formatShanghai } from "@/lib/ops/time";

type ReviewBody = {
  thread_id?: string;
  report?: string;
  note?: string;
  message?: string;
  detail?: string;
  error?: string;
  request_id?: string;
  thread_state?: string;
  expires_at?: string;
  recovery?: string[];
  human_review?: {
    approved?: boolean | null;
    reviewer?: string;
    comment?: string;
    rejections?: number;
    max_rejections?: number;
  };
};

const STATE_LABEL: Record<string, string> = {
  awaiting_approval: "待确认",
  rejected: "已驳回，待再确认",
  approved: "已通过",
  expired: "已超时，未批准",
  completed: "分析流，不能批准",
  failed: "失败",
};

function messageFrom(body: ReviewBody, status: number) {
  return body.message || body.detail || body.note || (status === 503 ? "评估服务未连接，复核没有发出去。" : `复核请求失败（${status}）。`);
}

export function HitlPanel({ projectDescription }: { projectDescription: string }) {
  const { role, actor } = useAlertOps();
  const [threadId, setThreadId] = useState("");
  const [review, setReview] = useState<ReviewBody | null>(null);
  const [reviewer, setReviewer] = useState(actor || "值班员");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"start" | "refresh" | "decide" | null>(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function readBody(response: Response) {
    const text = await response.text();
    try {
      return JSON.parse(text) as ReviewBody;
    } catch {
      return { message: text || `复核请求失败（${response.status}）。` };
    }
  }

  function fail(body: ReviewBody, status: number) {
    setError(messageFrom(body, status));
    setRecovery(Array.isArray(body.recovery) ? body.recovery : []);
  }

  async function start() {
    setBusy("start");
    setError("");
    setRecovery([]);
    try {
      const response = await fetch("/api/petro/hitl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_input: projectDescription }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.thread_id) {
        fail(body, response.status);
        return;
      }
      setThreadId(body.thread_id);
      setReview(body);
    } catch {
      setError("复核请求没有发出去。评估服务可能不在线。");
      setRecovery(["看 /api/health。离线时不要点通过。"]);
    } finally {
      setBusy(null);
    }
  }

  async function refresh(id = threadId) {
    if (!id) return;
    setBusy("refresh");
    setError("");
    setRecovery([]);
    try {
      const response = await fetch(`/api/petro/review/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await readBody(response);
      if (!response.ok) {
        fail(body, response.status);
        return;
      }
      setReview(body);
    } catch {
      setError("读取复核状态失败。评估服务可能不在线。");
      setRecovery(["刷新失败不等于已批准。"]);
    } finally {
      setBusy(null);
    }
  }

  async function decide(approved: boolean) {
    if (!threadId) return;
    if (!approved && comment.trim().length < 2) {
      setError("驳回必须写意见。");
      setRecovery(["写明要改的压力、测点或结论。"]);
      return;
    }
    setBusy("decide");
    setError("");
    setRecovery([]);
    try {
      const response = await fetch("/api/petro/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, approved, reviewer, comment }),
      });
      const body = await readBody(response);
      if (!response.ok) {
        fail(body, response.status);
        return;
      }
      setReview({ ...body, thread_id: body.thread_id || threadId });
      setConfirmOpen(false);
    } catch {
      setError("批准请求没有发出去。评估服务可能不在线。");
      setRecovery(["没有收到响应就不要当成已放行。间隔后再刷新状态。"]);
    } finally {
      setBusy(null);
    }
  }

  const state = review?.thread_state ?? "";
  const approved = review?.human_review?.approved === true || state === "approved";
  const pending = Boolean(threadId) && !approved && state !== "expired";
  const viewer = role !== "operator";

  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-xs font-medium text-foreground">人工复核</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        状态机：未发起 → 待确认 → 驳回后仍待确认 → 已通过或超时。流式评估线程不能进入通过。系统不会自动批准。
        {viewer ? " 当前是观察员，通过按钮已关闭。" : ""}
      </p>
      {!threadId ? (
        <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={busy !== null || !projectDescription.trim()} onClick={() => void start()}>
          {busy === "start" ? "正在发起…" : "发起人工复核"}
        </Button>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="font-mono text-[11px] text-primary">
            thread {threadId}
            {review?.request_id ? ` · ${review.request_id}` : ""}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {STATE_LABEL[state] ?? (approved ? "已通过" : "待确认")}
            {review?.human_review
              ? ` · 已驳回 ${review.human_review.rejections ?? 0}/${review.human_review.max_rejections ?? 2} 次`
              : ""}
            {approved && review?.human_review?.reviewer ? ` · ${review.human_review.reviewer}` : ""}
            {review?.expires_at ? ` · 截止 ${formatShanghai(review.expires_at)}` : ""}
            {review?.note ? `。${review.note}` : ""}
          </p>
          {pending ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                  placeholder="审核人"
                  className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs outline-none focus:border-primary/50"
                />
                <input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="意见，驳回时必填"
                  className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy !== null || viewer} title={viewer ? "观察员不能批准" : "通过前会再确认"} onClick={() => setConfirmOpen(true)}>
                  通过
                </Button>
                <Button type="button" size="sm" variant="danger" disabled={busy !== null || comment.trim().length < 2} onClick={() => void decide(false)}>
                  驳回
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void refresh()}>
                  {busy === "refresh" ? "读取中…" : "刷新状态"}
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void refresh()}>
              刷新状态
            </Button>
          )}
        </div>
      )}
      {error ? (
        <div className="mt-2 text-xs leading-5 text-alarm">
          <p>{error}</p>
          <RecoveryList steps={recovery} />
        </div>
      ) : null}
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(100vw-2rem,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#0c1218] p-4">
            <Dialog.Title className="text-sm font-semibold">确认放行这条 HITL</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs leading-5 text-muted-foreground">
              只放行 {threadId || "当前 HITL 线程"}。流式评估的线程不会被这次操作批准，系统也不会自动补批。
            </Dialog.Description>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decide(true)}>
                {busy === "decide" ? "正在提交…" : "确认通过"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
