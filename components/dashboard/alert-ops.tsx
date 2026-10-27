"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AlertOpsRecord, AlertOpsState, ChainStatus } from "@/lib/ops/alert-ops";
import type { OpsRole } from "@/lib/ops/session";

type AlertOpsContextValue = {
  role: OpsRole;
  actor: string;
  ready: boolean;
  /** null = 还没读到，不是「链条正常」。没读过就说正常，是这一类界面最典型的谎。 */
  chain: ChainStatus | null;
  rejectedRole: string | null;
  record: (alertId: string) => AlertOpsRecord | undefined;
  silenced: (alertId: string) => boolean;
  act: (
    alertId: string,
    action: "ack" | "silence" | "unsilence" | "escalate",
    note?: string,
    extra?: { confirm?: string; secondConfirm?: boolean },
  ) => Promise<string | null>;
};

const AlertOpsContext = createContext<AlertOpsContextValue | null>(null);

export function useAlertOps() {
  const value = use(AlertOpsContext);
  if (!value) throw new Error("告警处置还没有挂上。");
  return value;
}

export function AlertOpsProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<OpsRole>("operator");
  const [actor, setActor] = useState("值班员");
  const [records, setRecords] = useState<Record<string, AlertOpsRecord>>({});
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [rejectedRole, setRejectedRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ops/alerts", { cache: "no-store" });
      const body = (await response.json()) as {
        role?: OpsRole;
        actor?: string;
        records?: Record<string, AlertOpsRecord>;
        chain?: ChainStatus;
        rejectedRole?: string;
      };
      if (body.role === "viewer" || body.role === "operator") setRole(body.role);
      if (body.actor) setActor(body.actor);
      setRecords(body.records ?? {});
      setChain(body.chain ?? null);
      setRejectedRole(body.rejectedRole ?? null);
    } catch {
      /* 保留上一份快照；告警本身是演示数据，页面照常显示。
         但 chain 不跟着保留 —— 读不到就是读不到，不能拿上一次的「正常」顶着。 */
      setChain(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = useCallback(
    async (
      alertId: string,
      action: "ack" | "silence" | "unsilence" | "escalate",
      note?: string,
      extra?: { confirm?: string; secondConfirm?: boolean },
    ) => {
      const response = await fetch("/api/ops/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, action, note, confirm: extra?.confirm, secondConfirm: extra?.secondConfirm }),
      });
      const body = (await response.json()) as { message?: string; record?: AlertOpsRecord };
      if (!response.ok || !body.record) {
        // 失败多半意味着链条断了。只把文案弹出来、不刷新 chain，
        // 横幅就会一直停在「正常」，而用户刚好在这一刻才最需要看到它。
        void load();
        return body.message || "处置没有记下。";
      }
      setRecords((current) => ({ ...current, [body.record!.alertId]: body.record! }));
      return null;
    },
    [load],
  );

  const value = useMemo<AlertOpsContextValue>(
    () => ({
      role,
      actor,
      ready,
      chain,
      rejectedRole,
      record: (alertId) => records[alertId],
      silenced: (alertId) => records[alertId]?.state === "silenced" && !records[alertId]?.silenceExpired,
      act,
    }),
    [act, actor, chain, ready, records, rejectedRole, role],
  );

  return <AlertOpsContext value={value}>{children}</AlertOpsContext>;
}

export function opsBadge(state: AlertOpsState | undefined, silenceExpired = false) {
  if (silenceExpired) return "静默已到期（日志未改写）";
  if (state === "acknowledged") return "已确认";
  if (state === "silenced") return "已静默";
  if (state === "escalated") return "已升级";
  return "未处置";
}

/**
 * 审计链与角色的实情横幅。
 *
 * 这两件事的共同点是：出问题时界面上一切照常。链条断了，处置照旧能点、能写、能看，
 * 只是那些记录再也证不了是谁写的；角色拼错了，观察员照旧能看全部页面，
 * 只是点到批准才会 403 —— 而那时用户会去怀疑令牌和上游。
 * 所以它们必须在**动手之前**就显示出来，而不是等操作失败再解释。
 */
export function OpsIntegrityBanner() {
  const { chain, rejectedRole, ready } = useAlertOps();
  if (!ready) return null;
  const broken = chain !== null && !chain.ok;
  if (!broken && !rejectedRole) return null;

  return (
    <div className="space-y-2">
      {broken ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-alarm"
        >
          <p className="font-medium">审计日志的哈希链不完整：{chain?.reason}</p>
          <p className="mt-1 leading-6 text-alarm/80">
            已写入的 {chain?.lines ?? 0} 行仍在，但第 {chain?.brokenAt ?? "?"} 行起无法证明未被改动。
            在本服务里再处置告警会被拒绝 —— 往断链上追加，会把断裂处盖在中间，之后再也验不出来。
            先备份 <code className="font-mono text-xs">.data/alert-audit.jsonl</code>，再逐行核对。
          </p>
        </div>
      ) : null}
      {rejectedRole ? (
        <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <p className="font-medium">
            CCUS_ROLE=<code className="font-mono text-xs">{rejectedRole}</code> 无法识别，已按观察员处理。
          </p>
          <p className="mt-1 leading-6 text-warn/80">
            可用的值是 operator 或 viewer。认不出来的值一律降级，不会升级 —— 否则少写一个字母就会拿到批准权限。
            改完环境变量要重启 Next。
          </p>
        </div>
      ) : null}
    </div>
  );
}
