"use client";

import { useMemo, useState } from "react";
import { AlertList } from "@/components/dashboard/alert-list";
import { useAlertOps } from "@/components/dashboard/alert-ops";
import { ProvenanceMark } from "@/components/dashboard/provenance";
import { ALERTS, sortedAlerts, type AlertStatus, type Severity } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

const SEVERITIES: { id: Severity | "all"; label: string }[] = [
  { id: "all", label: "全部级别" },
  { id: "critical", label: "严重" },
  { id: "warning", label: "警告" },
  { id: "info", label: "提示" },
];

const STATUSES: { id: AlertStatus | "all"; label: string }[] = [
  { id: "all", label: "全部状态" },
  { id: "active", label: "活跃" },
  { id: "acknowledged", label: "已确认" },
  { id: "cleared", label: "已恢复" },
];

export function AlertsView() {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [status, setStatus] = useState<AlertStatus | "all">("active");
  const [query, setQuery] = useState("");
  const [hideSilenced, setHideSilenced] = useState(false);
  const { silenced } = useAlertOps();
  const counts = useMemo(() => {
    const pool = ALERTS.filter((alert) => status === "all" || alert.status === status);
    return {
      all: pool.length,
      critical: pool.filter((alert) => alert.severity === "critical").length,
      warning: pool.filter((alert) => alert.severity === "warning").length,
      info: pool.filter((alert) => alert.severity === "info").length,
    };
  }, [status]);
  const alerts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedAlerts(
      ALERTS.filter((alert) => {
        if (severity !== "all" && alert.severity !== severity) return false;
        if (hideSilenced && silenced(alert.id)) return false;
        if (status !== "all" && alert.status !== status) return false;
        if (!q) return true;
        return [alert.id, alert.title, alert.summary, alert.equipment].join(" ").toLowerCase().includes(q);
      }),
    );
  }, [hideSilenced, query, severity, silenced, status]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">告警</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          按严重级别和状态筛选。焦点在卡片上时，A 确认，E 升级，S 静默。静默要写原因；严重告警还要勾选并输入编号。审计只追加。点「交给碳衡助手」会打开助手并填入这条告警。
        </p>
        <ProvenanceMark where="告警" />
      </header>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <a className="text-primary hover:underline" href="/api/ops/alerts/export">
          导出 CSV
        </a>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setHideSilenced((value) => !value)}>
          {hideSilenced ? "显示已静默" : "隐藏已静默"}
        </button>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索编号、设备或描述"
          className="h-9 w-full rounded-md border border-border bg-black/20 px-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:max-w-xs"
        />
        <div className="flex gap-1 overflow-x-auto pb-1">
          {SEVERITIES.map((item) => (
            <FilterButton key={item.id} active={severity === item.id} onClick={() => setSeverity(item.id)}>
              {`${item.label} ${counts[item.id]}`}
            </FilterButton>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {STATUSES.map((item) => (
            <FilterButton key={item.id} active={status === item.id} onClick={() => setStatus(item.id)}>
              {item.label}
            </FilterButton>
          ))}
        </div>
      </div>
      {alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-muted-foreground">
          <p>这个筛选下没有告警。</p>
          <button
            type="button"
            className="mt-3 min-h-8 text-primary hover:underline"
            onClick={() => {
              setSeverity("all");
              setStatus("all");
              setQuery("");
              setHideSilenced(false);
            }}
          >
            清除筛选
          </button>
        </div>
      ) : (
        <AlertList alerts={alerts} />
      )}
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}
