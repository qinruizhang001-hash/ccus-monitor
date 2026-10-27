"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { overviewChart } from "@/lib/telemetry";
import { nudgeValue, sliceWindow, useTelemetryView } from "@/components/dashboard/view-controls";

export function OverviewChart() {
  const { hours, live, tick } = useTelemetryView();
  const data = sliceWindow(overviewChart(), hours).map((row, index, rows) => {
    if (!live || index !== rows.length - 1) return row;
    return {
      ...row,
      capture: nudgeValue(row.capture, tick, 3),
      injection: nudgeValue(row.injection, tick, 11),
    };
  });
  if (data.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">这个时间窗没有点。</p>;
  }
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: "#93a4b8", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            yAxisId="capture"
            tick={{ fill: "#93a4b8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={42}
            domain={[80, 96]}
          />
          <YAxis
            yAxisId="injection"
            orientation="right"
            tick={{ fill: "#93a4b8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={42}
            domain={[80, 130]}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border border-border bg-[#0c141d] px-3 py-2 text-xs shadow-xl">
                  <div className="mb-1 font-mono text-muted-foreground">{label}</div>
                  {payload.map((item) => (
                    <div key={String(item.dataKey)} className="flex justify-between gap-4">
                      <span style={{ color: item.color }}>{item.name}</span>
                      <span className="font-mono">
                        {typeof item.value === "number" ? item.value.toFixed(1) : item.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#93a4b8" }} />
          <Line yAxisId="capture" type="monotone" dataKey="capture" name="捕集率 %" stroke="#3ee0c5" strokeWidth={2} dot={false} />
          <Line yAxisId="injection" type="monotone" dataKey="injection" name="注入 t/h" stroke="#79b8ff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
