"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AlertOpsRecord, AlertOpsState } from "@/lib/ops/alert-ops";
import type { OpsRole } from "@/lib/ops/session";

type AlertOpsContextValue = {
  role: OpsRole;
  actor: string;
  ready: boolean;
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
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ops/alerts", { cache: "no-store" });
      const body = (await response.json()) as {
        role?: OpsRole;
        actor?: string;
        records?: Record<string, AlertOpsRecord>;
      };
      if (body.role === "viewer" || body.role === "operator") setRole(body.role);
      if (body.actor) setActor(body.actor);
      setRecords(body.records ?? {});
    } catch {
      /* keep the last snapshot; the page still shows demo alarms */
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
      if (!response.ok || !body.record) return body.message || "处置没有记下。";
      setRecords((current) => ({ ...current, [body.record!.alertId]: body.record! }));
      return null;
    },
    [],
  );

  const value = useMemo<AlertOpsContextValue>(
    () => ({
      role,
      actor,
      ready,
      record: (alertId) => records[alertId],
      silenced: (alertId) => records[alertId]?.state === "silenced" && !records[alertId]?.silenceExpired,
      act,
    }),
    [act, actor, ready, records, role],
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
