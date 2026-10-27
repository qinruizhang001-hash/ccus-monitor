import { getContainmentStatus, massStatusLabel, OPS_FIXTURE, type BarrierId } from "@/lib/ops/inventory";
import { cn } from "@/lib/utils";

const TONE = {
  normal: "text-ok",
  warning: "text-warn",
  critical: "text-alarm",
} as const;

export function ContainmentPanel({ focus = "all" }: { focus?: "all" | "barriers" | "monitoring" }) {
  const board = getContainmentStatus();
  const rows = board.rows.filter((row) => {
    if (focus === "barriers") return row.barrier !== "tertiary_monitoring";
    if (focus === "monitoring") return row.barrier === "tertiary_monitoring";
    return true;
  });
  return (
    <section className="panel rounded-xl p-4">
      <h2 className="text-sm font-medium">遏制与 MMV</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {board.barrier_note} 快照 {OPS_FIXTURE.snapshot_id}。
      </p>
      <ul className="mt-3 divide-y divide-white/8">
        {rows.map((row) => (
          <li key={row.tag + row.label} className="grid gap-1 py-2 text-sm md:grid-cols-[9rem_1fr_auto]">
            <div>
              <div className="font-mono text-xs text-primary">{row.tag}</div>
              <div className="text-[11px] text-muted-foreground">{barrierShort(row.barrier)}</div>
            </div>
            <div>
              <div>{row.label}</div>
              <div className="font-mono text-xs text-foreground">{row.value}</div>
              <div className="text-[11px] text-muted-foreground">
                {row.threshold}
                {row.alert_id ? ` · ${row.alert_id}` : ""}
              </div>
            </div>
            <div className={cn("text-xs md:text-right", TONE[row.status])}>{massStatusLabel(row.status)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function barrierShort(barrier: BarrierId) {
  if (barrier === "primary_wellbore") return "一次屏障 · 井筒";
  if (barrier === "secondary_caprock") return "二次屏障 · 盖层";
  return "三次屏障 · 监测";
}
