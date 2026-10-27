"use client";

import { ageHours } from "@/lib/ops/time";
import { plant } from "@/lib/telemetry";

export function ProvenanceMark({ where = "这块" }: { where?: string }) {
  const age = ageHours(plant.asOf);
  return (
    <p className="text-[11px] leading-5 text-muted-foreground">
      <span className="font-medium text-warn">演示数据</span>
      <span> · {where} · 快照 {plant.asOfLabel}</span>
      <span>{age == null ? "" : ` · 滞后约 ${age} 小时`}</span>
      <span> · 非实时 · 非 SCADA</span>
    </p>
  );
}
