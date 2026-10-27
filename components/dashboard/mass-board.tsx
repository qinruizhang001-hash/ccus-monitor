import { getMassBalance, massStatusLabel, OPS_FIXTURE } from "@/lib/ops/inventory";
import { plant } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

const TONE = {
  normal: "text-ok",
  warning: "text-warn",
  critical: "text-alarm",
} as const;

export function MassBoard() {
  const mass = getMassBalance();
  const cells = [
    ["滚动捕集", `${mass.captured_t}`, "t", "24 个演示小时点"],
    ["管存（在途）", `${mass.linepack_t}`, "t", `变化 ${mass.delta_linepack_t} t`],
    ["滚动注入", `${mass.injected_rolling_t}`, "t", "同一窗口"],
    ["已封存", `${mass.stored_mt}`, "Mt", `${mass.stored_t} t · 快照`],
    ["累计注入", mass.injected_cumulative_label, "", "没有独立计量表"],
    ["不平衡", mass.imbalance_pct == null ? "—" : `${mass.imbalance_pct}`, "%", massStatusLabel(mass.status)],
  ] as const;
  return (
    <section className="panel rounded-xl p-4" title={mass.formula}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">演示质量衡算</h2>
        <span className={cn("font-mono text-xs", TONE[mass.status])}>
          {massStatusLabel(mass.status)} · 关注 {mass.watch_pct}% · 告警 {mass.alarm_pct}%
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        快照 {plant.snapshotId} · 假设 {OPS_FIXTURE.snapshot_id}。不平衡先核对脱水排气和缓冲罐，不要直接写成泄漏。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        {cells.map(([label, value, unit, hint]) => (
          <article key={label} className="rounded-lg bg-black/20 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="mt-1 font-mono text-lg leading-tight">
              {value}
              {unit ? <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span> : null}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
          </article>
        ))}
      </div>
      <details className="mt-3 text-xs leading-5 text-muted-foreground">
        <summary className="cursor-pointer text-foreground">公式与假设</summary>
        <p className="mt-2">{mass.formula}</p>
        <p className="mt-1">
          管径 {OPS_FIXTURE.linepack.diameter_m} m（{OPS_FIXTURE.linepack.diameter_note}）长度 {OPS_FIXTURE.linepack.length_m} m，密度{" "}
          {OPS_FIXTURE.linepack.density_kg_m3} kg/m³。{OPS_FIXTURE.linepack.density_note}
          {mass.threshold_note}
        </p>
      </details>
    </section>
  );
}
