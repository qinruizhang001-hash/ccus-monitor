"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertList } from "@/components/dashboard/alert-list";
import { useAlertOps } from "@/components/dashboard/alert-ops";
import { ChartBoundary } from "@/components/dashboard/chart-boundary";
import { ContainmentPanel } from "@/components/dashboard/containment-panel";
import { PlumeDemo } from "@/components/dashboard/plume-demo";
import { ProvenanceMark } from "@/components/dashboard/provenance";
import { TransportStrip } from "@/components/dashboard/transport-strip";
import { ResearchTips } from "@/components/dashboard/research-tips";
import { DashboardToolbar } from "@/components/dashboard/view-controls";

const MetricChart = dynamic(
  () => import("@/components/dashboard/metric-chart").then((mod) => mod.MetricChart),
  { ssr: false, loading: () => <div className="h-[240px] animate-pulse rounded-lg bg-white/5" /> },
);
import { EQUIPMENT_STATE, StatusPill } from "@/components/dashboard/status-pill";
import { alertsFor, getSegment, plant, sortedAlerts, utilizationPct, type SegmentId } from "@/lib/telemetry";
import { formatNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE = {
  ok: "text-ok",
  warn: "text-warn",
  alarm: "text-alarm",
  neutral: "text-foreground",
} as const;

export function SegmentView({ id }: { id: SegmentId }) {
  const segment = getSegment(id);
  const { silenced } = useAlertOps();
  const related = sortedAlerts(alertsFor(id)).filter((alert) => !silenced(alert.id));
  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            总览
          </Link>
          <span className="px-1.5">/</span>
          {segment.name}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{segment.name}</h1>
          <StatusPill status={segment.status} />
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{segment.summary}</p>
        <ProvenanceMark where={segment.name} />
        <div className="mt-3">
          <DashboardToolbar />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {segment.kpis.map((kpi) => (
          <article key={kpi.label} className="panel rounded-xl px-3 py-3">
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div className={cn("mt-2 font-mono text-[1.6rem] leading-none", TONE[kpi.tone ?? "neutral"])}>
              {kpi.value}
              {kpi.unit ? <span className="ml-1 text-xs text-muted-foreground">{kpi.unit}</span> : null}
            </div>
            {kpi.hint ? <div className="mt-2 text-xs text-muted-foreground">{kpi.hint}</div> : null}
            <div className="mt-1 text-[10px] tracking-wide text-warn">演示数据</div>
          </article>
        ))}
      </section>

      <section className={cn("grid gap-4", segment.charts.length > 1 && "xl:grid-cols-2")}>
        {segment.charts.map((chart) => (
          <article key={chart.id} className="panel rounded-xl p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">{chart.title}</h2>
              <span className="font-mono text-xs text-muted-foreground">{chart.unit} · 演示数据</span>
            </div>
            <ProvenanceMark where="曲线" />
            <ChartBoundary>
              <MetricChart spec={chart} />
            </ChartBoundary>
            {chart.reference ? (
              <p className="mt-2 text-xs text-warn">虚线：{chart.reference.label}</p>
            ) : null}
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <article className="panel rounded-xl p-4 lg:col-span-2">
          <h2 className="text-sm font-medium">测点</h2>
          <dl className="mt-3 divide-y divide-white/6">
            {segment.readings.map((reading) => (
              <div key={reading.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                <dt className="text-muted-foreground">{reading.label}</dt>
                <dd className={cn("font-mono", TONE[reading.tone ?? "neutral"])}>{reading.value}</dd>
              </div>
            ))}
          </dl>
          {id === "storage" ? (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>许可库容</span>
                <span>{formatNum(utilizationPct(), 1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-info" style={{ width: `${utilizationPct()}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {plant.storage}。羽流前缘是演示模型，不是实测反演。
              </p>
            </div>
          ) : null}
        </article>
        <article className="panel rounded-xl p-4 lg:col-span-3">
          <h2 className="text-sm font-medium">{id === "transport" ? "站场" : "设备"}</h2>
          <ul className="mt-3 space-y-2 md:hidden">
            {segment.equipment.map((row) => (
              <li key={row.tag} className="rounded-lg border border-white/8 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{row.tag}</span>
                  <span
                    className={cn(
                      "text-xs",
                      row.state === "alarm" && "text-alarm",
                      row.state === "maintenance" && "text-warn",
                      row.state === "running" && "text-ok",
                      row.state === "standby" && "text-muted-foreground",
                    )}
                  >
                    {EQUIPMENT_STATE[row.state]}
                  </span>
                </div>
                <div className="mt-1">{row.name}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
              </li>
            ))}
          </ul>
          <table className="mt-3 hidden w-full text-left text-sm md:table">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">位号</th>
                <th className="pb-2 font-medium">名称</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {segment.equipment.map((row) => (
                <tr key={row.tag} className="border-t border-white/6">
                  <td className="py-2 font-mono text-xs">{row.tag}</td>
                  <td className="py-2">{row.name}</td>
                  <td className="py-2">
                    <span
                      className={cn(
                        row.state === "alarm" && "text-alarm",
                        row.state === "maintenance" && "text-warn",
                        row.state === "running" && "text-ok",
                        row.state === "standby" && "text-muted-foreground",
                      )}
                    >
                      {EQUIPMENT_STATE[row.state]}
                    </span>
                  </td>
                  <td className="py-2 text-muted-foreground">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {segment.note ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{segment.note}</p> : null}
        </article>
      </section>

      {id === "transport" ? <TransportStrip /> : null}
      {id === "storage" ? (
        <>
          <ContainmentPanel focus="barriers" />
          <PlumeDemo />
        </>
      ) : null}
      {id === "mva" ? <ContainmentPanel focus="monitoring" /> : null}

      <ResearchTips segment={id} />

      <article className="panel rounded-xl p-4">
        <h2 className="mb-3 text-sm font-medium">本段告警</h2>
        <AlertList alerts={related} />
      </article>
    </div>
  );
}
