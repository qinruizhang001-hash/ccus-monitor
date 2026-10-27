import { cn } from "@/lib/utils";
import type { ProcessStatus, Severity } from "@/lib/telemetry";

const PROCESS = {
  normal: { label: "正常", pill: "border-ok/30 bg-ok/10 text-ok", dot: "bg-ok" },
  warning: { label: "关注", pill: "border-warn/30 bg-warn/10 text-warn", dot: "bg-warn" },
  critical: { label: "告警", pill: "border-alarm/30 bg-alarm/10 text-alarm", dot: "bg-alarm" },
} as const;

const SEVERITY = {
  critical: { label: "严重", pill: "border-alarm/30 bg-alarm/10 text-alarm" },
  warning: { label: "警告", pill: "border-warn/30 bg-warn/10 text-warn" },
  info: { label: "提示", pill: "border-info/30 bg-info/10 text-info" },
} as const;

export function StatusPill({ status, className }: { status: ProcessStatus; className?: string }) {
  const tone = PROCESS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]", tone.pill, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {tone.label}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const tone = SEVERITY[severity];
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px]", tone.pill)}>
      {tone.label}
    </span>
  );
}

export const EQUIPMENT_STATE = {
  running: "运行",
  standby: "备用",
  alarm: "异常",
  maintenance: "检修",
} as const;
