"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { nudgeValue, sliceWindow, useTelemetryView } from "@/components/dashboard/view-controls";
import type { ChartSpec } from "@/lib/telemetry";

function domainFor(spec: ChartSpec): [number, number] {
  const values = spec.points.map((point) => point.v);
  if (spec.reference) values.push(spec.reference.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 10 ** -spec.digits);
  return [min - span * 0.18, max + span * 0.22];
}

export function MetricChart({ spec, height = 240 }: { spec: ChartSpec; height?: number }) {
  const { hours, live, tick } = useTelemetryView();
  const points = sliceWindow(spec.points, hours).map((point, index, rows) => {
    if (!live || index !== rows.length - 1) return point;
    return { ...point, v: nudgeValue(point.v, tick, spec.title.length) };
  });
  const view = { ...spec, points };
  if (points.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">这个时间窗没有点。</p>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: "#93a4b8", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            domain={domainFor(view)}
            tick={{ fill: "#93a4b8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(value: number) => value.toFixed(view.digits)}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = payload[0]?.value;
              return (
                <div className="rounded-md border border-border bg-[#0c141d] px-3 py-2 text-xs shadow-xl">
                  <div className="font-mono text-muted-foreground">{label}</div>
                  <div className="mt-1 font-mono text-foreground">
                    {typeof value === "number" ? value.toFixed(spec.digits) : value} {spec.unit}
                  </div>
                </div>
              );
            }}
          />
          {spec.reference ? (
            <ReferenceLine y={spec.reference.y} stroke="#e8b339" strokeDasharray="4 4" />
          ) : null}
          <Line
            type="monotone"
            dataKey="v"
            name={spec.title}
            stroke={spec.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
