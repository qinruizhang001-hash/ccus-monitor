import { getTransportIntegrity, massStatusLabel } from "@/lib/ops/inventory";
import { cn } from "@/lib/utils";

export function TransportStrip() {
  const line = getTransportIntegrity();
  return (
    <section className="panel rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">运输完整性</h2>
        <span className={cn("text-xs", line.leak_status === "warning" ? "text-warn" : line.leak_status === "critical" ? "text-alarm" : "text-ok")}>
          泄漏风险指数 {line.leak_index} · {massStatusLabel(line.leak_status)}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        关注 {line.leak_watch} · 关断 {line.leak_trip}。{line.leak_note}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="首站压力" value={`${line.pack_inlet_mpa} MPa`} />
        <Metric label="末站压力" value={`${line.pack_outlet_mpa} MPa`} />
        <Metric label="管存" value={`${line.linepack_t} t`} hint={`变化 ${line.delta_linepack_t} t`} />
        <Metric label="进出口质量差" value={line.inlet_outlet_mass_label} hint={line.inlet_outlet_note} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        瞬时捕集−管输 {line.rate_gap_capture_pipe_tph} t/h。{line.rate_gap_note} B3 压差 {line.differential_mpa} MPa，基线{" "}
        {line.differential_baseline_mpa} MPa。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {line.valves.map((valve) => (
          <span
            key={valve.tag}
            className={cn(
              "rounded-full border px-2 py-1 text-[11px]",
              valve.state === "alarm" ? "border-alarm/50 text-alarm" : "border-white/10 text-muted-foreground",
            )}
          >
            {valve.tag} {valve.name} · {valve.tripped ? "已动作" : valve.state === "alarm" ? "告警未关断" : valve.state === "armed" ? "ESD 待命" : "开启"}
          </span>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-lg bg-black/20 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
      {hint ? <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</div> : null}
    </article>
  );
}
