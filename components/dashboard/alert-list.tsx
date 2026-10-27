"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { opsBadge, useAlertOps } from "@/components/dashboard/alert-ops";
import { SeverityPill } from "@/components/dashboard/status-pill";
import { Button } from "@/components/ui/button";
import { labelShiftStamp } from "@/lib/ops/time";
import { explainPrompt, type Alert } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

const SEGMENT_NAME = {
  capture: "捕集",
  transport: "运输",
  storage: "注入封存",
  mva: "MVA",
} as const;

export function AlertList({
  alerts,
  compact = false,
}: {
  alerts: Alert[];
  compact?: boolean;
}) {
  const router = useRouter();
  const ops = useAlertOps();
  const [silenceFor, setSilenceFor] = useState<Alert | null>(null);
  const [reason, setReason] = useState("");
  const [typedId, setTypedId] = useState("");
  const [secondConfirm, setSecondConfirm] = useState(false);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  function openSilence(alert: Alert) {
    setReason("");
    setTypedId("");
    setSecondConfirm(false);
    setSilenceFor(alert);
  }

  async function run(
    alert: Alert,
    action: "ack" | "silence" | "unsilence" | "escalate",
    note?: string,
    extra?: { confirm?: string; secondConfirm?: boolean },
  ) {
    const message = await ops.act(alert.id, action, note, extra);
    setErrorById((current) => {
      const next = { ...current };
      if (message) next[alert.id] = message;
      else delete next[alert.id];
      return next;
    });
    return !message;
  }

  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">这个筛选下没有告警。</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {alerts.map((alert) => {
          const record = ops.record(alert.id);
          const state = record?.state;
          const viewerBlocked = alert.severity === "critical" && ops.role !== "operator";
          const cleared = alert.status === "cleared";
          return (
            <li
              key={alert.id}
              id={alert.id}
              tabIndex={0}
              aria-keyshortcuts="A E S"
              onKeyDown={(event) => {
                if (event.metaKey || event.ctrlKey || event.altKey) return;
                const target = event.target as HTMLElement;
                if (target.closest("input, textarea, a, button")) return;
                const key = event.key.toLowerCase();
                if (key === "a" && !cleared && !viewerBlocked) {
                  event.preventDefault();
                  void run(alert, "ack");
                } else if (key === "e" && !cleared) {
                  event.preventDefault();
                  void run(alert, "escalate");
                } else if (key === "s" && !cleared && ops.role === "operator") {
                  event.preventDefault();
                  openSilence(alert);
                }
              }}
              className={cn(
                "rounded-lg border border-white/8 bg-black/20 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                alert.severity === "critical" && "border-l-2 border-l-alarm",
                alert.severity === "warning" && "border-l-2 border-l-warn",
                alert.severity === "info" && "border-l-2 border-l-info",
                (alert.status === "cleared" || state === "silenced") && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
                <SeverityPill severity={alert.severity} />
                <span className="text-[11px] text-muted-foreground">{SEGMENT_NAME[alert.segment]}</span>
                <span className="text-[11px] text-muted-foreground">
                  {alert.status === "active" ? "源：活跃" : alert.status === "acknowledged" ? "源：已确认" : "源：已恢复"}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-foreground">
                  {opsBadge(state, record?.silenceExpired)}
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{labelShiftStamp(alert.openedAt)}</span>
              </div>
              <h3 className="mt-2 text-sm font-medium">{alert.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{alert.summary}</p>
              {!compact ? (
                <div className="mt-3 grid gap-3 text-xs leading-5 text-muted-foreground md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-foreground">可能原因</div>
                    <ul className="list-disc space-y-1 pl-4">
                      {alert.likelyCauses.map((cause) => (
                        <li key={cause}>{cause}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 text-foreground">下一步核查</div>
                    <ol className="list-decimal space-y-1 pl-4">
                      {alert.nextChecks.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                <span className="font-mono text-muted-foreground">{alert.reading}</span>
                <span className="text-muted-foreground">对照 {alert.threshold}</span>
                <Link href={`/alerts#${alert.id}`} className="inline-flex min-h-8 items-center text-primary hover:underline">
                  告警详情
                </Link>
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center text-primary hover:underline"
                  onClick={() => {
                    const prompt = explainPrompt(alert.id);
                    router.push(`/assistant?alert=${encodeURIComponent(alert.id)}&q=${encodeURIComponent(prompt)}`);
                  }}
                >
                  交给碳衡助手
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center rounded-md border border-white/10 px-2 text-foreground disabled:opacity-40"
                  disabled={cleared || viewerBlocked}
                  title={viewerBlocked ? "观察员不能确认严重告警" : "快捷键 A"}
                  onClick={() => void run(alert, "ack")}
                >
                  确认
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center rounded-md border border-white/10 px-2 text-foreground disabled:opacity-40"
                  disabled={cleared}
                  title="快捷键 E"
                  onClick={() => void run(alert, "escalate")}
                >
                  升级
                </button>
                {state === "silenced" ? (
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-md border border-white/10 px-2 text-foreground disabled:opacity-40"
                    disabled={ops.role !== "operator"}
                    onClick={() => void run(alert, "unsilence")}
                  >
                    取消静默
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-md border border-alarm/40 px-2 text-alarm disabled:opacity-40"
                    disabled={cleared || ops.role !== "operator"}
                    title={ops.role === "operator" ? "快捷键 S，需要原因" : "观察员不能静默"}
                    onClick={() => openSilence(alert)}
                  >
                    静默
                  </button>
                )}
              </div>
              {record?.audit.length ? (
                <ul className="mt-2 space-y-0.5 text-[11px] leading-5 text-muted-foreground">
                  {record.audit.slice(-3).map((entry) => (
                    <li key={`${entry.seq}-${entry.at}-${entry.action}`}>
                      {entry.at} · {entry.actor}（{entry.role === "operator" ? "值班员" : "观察员"}）· {entry.action}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {errorById[alert.id] ? <p className="mt-2 text-xs leading-5 text-alarm">{errorById[alert.id]}</p> : null}
            </li>
          );
        })}
      </ul>
      <Dialog.Root open={silenceFor !== null} onOpenChange={(open) => !open && setSilenceFor(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(100vw-2rem,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#0c1218] p-4">
            <Dialog.Title className="text-sm font-semibold">确认静默 {silenceFor?.id}</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs leading-5 text-muted-foreground">
              {silenceFor?.severity === "critical"
                ? "严重告警静默要两次确认：勾选核对，并输入告警编号。静默不会清测点。审计只追加，已写入的行不会改。8 小时后界面显示「静默已到期（日志未改写）」。"
                : "静默 8 小时内不出现在总览活跃列表。测点不会复位，也不是 SCADA 确认。时限过后界面显示「静默已到期（日志未改写）」，已写入的审计行不会改。"}
            </Dialog.Description>
            <label className="mt-3 block text-xs text-muted-foreground" htmlFor="silence-reason">
              原因
            </label>
            <input
              id="silence-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-black/30 px-2 text-sm outline-none focus:border-primary/50"
              placeholder="本班为何先不盯，何时再看"
            />
            {silenceFor?.severity === "critical" ? (
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 text-xs leading-5 text-foreground">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={secondConfirm}
                    onChange={(event) => setSecondConfirm(event.target.checked)}
                  />
                  第二次核对：我知道静默不会清测点，也不能代替值班签字
                </label>
                <label className="block text-xs text-muted-foreground" htmlFor="silence-confirm-id">
                  输入告警编号 {silenceFor.id}
                </label>
                <input
                  id="silence-confirm-id"
                  value={typedId}
                  onChange={(event) => setTypedId(event.target.value)}
                  className="h-9 w-full rounded-md border border-white/10 bg-black/30 px-2 font-mono text-sm outline-none focus:border-primary/50"
                  placeholder={silenceFor.id}
                  autoComplete="off"
                />
              </div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSilenceFor(null)}>
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={
                  reason.trim().length < 2 ||
                  !silenceFor ||
                  (silenceFor.severity === "critical" && (typedId.trim() !== silenceFor.id || !secondConfirm))
                }
                onClick={() => {
                  if (!silenceFor) return;
                  const critical = silenceFor.severity === "critical";
                  void run(
                    silenceFor,
                    "silence",
                    reason.trim(),
                    critical ? { confirm: typedId.trim(), secondConfirm: true } : undefined,
                  ).then((ok) => {
                    if (ok) setSilenceFor(null);
                  });
                }}
              >
                确认静默
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
