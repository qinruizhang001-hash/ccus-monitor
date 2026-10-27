"use client";

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { plant } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

export type RangeHours = 6 | 12 | 24;

type TelemetryView = {
  hours: RangeHours;
  live: boolean;
  tick: number;
  setHours: (hours: RangeHours) => void;
  setLive: (live: boolean) => void;
};

const DEFAULT_VIEW: TelemetryView = {
  hours: 24,
  live: false,
  tick: 0,
  setHours: () => {},
  setLive: () => {},
};

const TelemetryViewContext = createContext<TelemetryView>(DEFAULT_VIEW);

export function TelemetryViewProvider({ children }: { children: ReactNode }) {
  const [hours, setHours] = useState<RangeHours>(24);
  const [live, setLiveState] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 4000);
    return () => window.clearInterval(timer);
  }, [live]);

  const value = useMemo<TelemetryView>(
    () => ({
      hours,
      live,
      tick,
      setHours,
      setLive: (next) => {
        setLiveState(next);
        if (next) setTick((value) => value + 1);
      },
    }),
    [hours, live, tick],
  );

  return <TelemetryViewContext value={value}>{children}</TelemetryViewContext>;
}

export function useTelemetryView() {
  return use(TelemetryViewContext);
}

export function sliceWindow<T>(rows: T[], hours: RangeHours) {
  if (hours >= rows.length) return rows;
  return rows.slice(rows.length - hours);
}

export function nudgeValue(value: number, tick: number, seed: number) {
  if (!tick) return value;
  const amp = Math.max(Math.abs(value) * 0.003, 10 ** -2);
  return Math.round((value + Math.sin(tick * 0.85 + seed) * amp) * 1000) / 1000;
}

export function demoClock(tick: number) {
  const date = new Date(plant.asOf);
  if (tick > 0) date.setMinutes(date.getMinutes() + tick);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

const RANGES: RangeHours[] = [6, 12, 24];

export function DashboardToolbar() {
  const { hours, live, tick, setHours, setLive } = useTelemetryView();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {RANGES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setHours(item)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-xs",
              hours === item ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground",
            )}
          >
            近 {item} 小时
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLive(!live)}
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-xs",
            live ? "border-warn/50 bg-warn/10 text-warn" : "border-white/10 text-muted-foreground",
          )}
          aria-pressed={live}
        >
          {live ? "演示刷新开" : "演示刷新"}
        </button>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        {live ? `演示时刻 ${demoClock(tick)} Asia/Shanghai · 只拨动最后一个点` : `快照 ${plant.asOfLabel}`}
        。演示数据，不是 SCADA。
      </p>
    </div>
  );
}
