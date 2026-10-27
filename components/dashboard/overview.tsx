"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertList } from "@/components/dashboard/alert-list";

const OverviewChart = dynamic(
  () => import("@/components/dashboard/overview-chart").then((mod) => mod.OverviewChart),
  { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded-lg bg-white/5" /> },
);
import { useAlertOps } from "@/components/dashboard/alert-ops";
import { ChartBoundary } from "@/components/dashboard/chart-boundary";
import { ProvenanceMark } from "@/components/dashboard/provenance";
import { ResearchTips } from "@/components/dashboard/research-tips";
import { RecoveryList } from "@/components/ops/recovery-list";
import { ContainmentPanel } from "@/components/dashboard/containment-panel";
import { MassBoard } from "@/components/dashboard/mass-board";
import { PipelineStrip } from "@/components/dashboard/pipeline-strip";
import { PlumeDemo } from "@/components/dashboard/plume-demo";
import { TransportStrip } from "@/components/dashboard/transport-strip";
import { DashboardToolbar, useTelemetryView } from "@/components/dashboard/view-controls";
import { StatusPill } from "@/components/dashboard/status-pill";
import { useAssistant } from "@/components/assistant/assistant-provider";
import { Badge } from "@/components/ui/badge";
import { formatNum } from "@/lib/format";
import {
  SNAP,
  activeAlerts,
  assessmentDraft,
  dutyRecommendations,
  massBalance,
  overallStatus,
  plant,
  sortedAlerts,
  utilizationPct,
} from "@/lib/telemetry";

const kpis = [
  { label: "捕集率", value: formatNum(SNAP.captureRate, 1), unit: "%", hint: "目标 ≥90%", tone: "text-ok" },
  { label: "瞬时注入", value: formatNum(SNAP.injTph, 1), unit: "t/h", hint: "IW-03 单井", tone: "text-foreground" },
  { label: "首站压力", value: formatNum(SNAP.inletP, 2), unit: "MPa", hint: "末站 8.72", tone: "text-foreground" },
  { label: "再生能耗", value: formatNum(SNAP.energy, 2), unit: "GJ/t", hint: "目标 ≤2.70", tone: "text-warn" },
  {
    label: "库容利用率",
    value: formatNum(utilizationPct(), 1),
    unit: "%",
    hint: `${formatNum(plant.storedMt, 2)} / ${formatNum(plant.permittedMt, 0)} Mt`,
    tone: "text-foreground",
  },
  {
    label: "活跃告警",
    value: String(activeAlerts().length),
    unit: "条",
    hint: "严重 1 · 警告 2",
    tone: "text-alarm",
  },
];

export function Overview() {
  const balance = massBalance();
  const { ask, health } = useAssistant();
  const { silenced } = useAlertOps();
  const { hours } = useTelemetryView();
  const healthTone =
    health?.status === "ok" ? "ok" : health?.status === "degraded" ? "warn" : health?.status === "mock" ? "info" : "alarm";
  const healthLabel =
    health?.status === "ok"
      ? "评估服务正常"
      : health?.status === "degraded"
        ? "评估服务降级"
        : health?.status === "mock"
          ? "评估演示流"
          : health?.status === "offline"
            ? "评估服务未连接"
            : "正在探测评估服务";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-primary">FULL CHAIN</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">全流程总览</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {plant.name} · {plant.source} · 设计捕集 {plant.designCaptureMtA.toFixed(1)} Mt/a。数字是{" "}
            {plant.asOfLabel} 的演示快照，不连接现场 SCADA，也没有 OPC-UA / MQTT。
          </p>
          <ProvenanceMark where="总览 KPI" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={overallStatus()} />
          <Badge tone={healthTone}>{healthLabel}</Badge>
        </div>
      </header>

      {health?.status === "offline" ? (
        <div className="rounded-lg border border-alarm/30 bg-alarm/10 px-3 py-2 text-xs leading-5 text-alarm">
          <p>{health.message}</p>
          <RecoveryList steps={health.recovery ?? []} />
        </div>
      ) : health == null ? (
        <p className="text-xs text-muted-foreground">正在探测评估服务。</p>
      ) : null}

      <DashboardToolbar />

      <PipelineStrip />
      <MassBoard />
      <TransportStrip />
      <div className="grid gap-4 xl:grid-cols-2">
        <ContainmentPanel />
        <PlumeDemo compact />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="panel rounded-xl px-3 py-3">
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div className={`mt-2 font-mono text-[1.65rem] leading-none tracking-tight ${kpi.tone}`}>
              {kpi.value}
              <span className="ml-1 text-xs text-muted-foreground">{kpi.unit}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{kpi.hint}</div>
            <div className="mt-1 text-[10px] tracking-wide text-warn">演示数据</div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <article className="panel rounded-xl p-4 xl:col-span-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">近 {hours} 小时捕集率与注入</h2>
            <span className="text-xs text-muted-foreground">
              {hours === 24 ? "06:00 捕集短时下跌 · 03:00 注入低点" : "按演示小时点截取"}
            </span>
          </div>
          <ProvenanceMark where="曲线" />
          <ChartBoundary>
            <OverviewChart />
          </ChartBoundary>
        </article>
        <article className="panel rounded-xl p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">活跃告警</h2>
            <Link href="/alerts" className="text-xs text-primary hover:underline">
              全部告警
            </Link>
          </div>
          <AlertList alerts={sortedAlerts(activeAlerts()).filter((alert) => !silenced(alert.id))} compact />
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel rounded-xl p-4">
          <h2 className="text-sm font-medium">值班建议</h2>
          <p className="mt-1 text-xs text-muted-foreground">按严重级别取每条活跃告警的第一步核查。</p>
          <ol className="mt-3 space-y-2 text-sm leading-6">
            {dutyRecommendations().map((item, index) => (
              <li key={item.id} className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
                <span>
                  <span className="font-mono text-xs text-primary">{item.id}</span> {item.text}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="mt-4 text-sm text-primary hover:underline"
            onClick={() => ask(`用当前工况做封存风险评估。\n\n${assessmentDraft()}`)}
          >
            用当前工况问碳衡助手
          </button>
        </article>
        <article className="panel rounded-xl p-4">
          <h2 className="text-sm font-medium">质量平衡</h2>
          <p className="mt-1 text-xs text-muted-foreground">同一时刻的三处流量，差额有解释，不是丢数。</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["捕集", balance.captureTph],
              ["管输", balance.pipeTph],
              ["注入", balance.injTph],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-black/20 px-2 py-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-xl">{formatNum(Number(value), 1)}</div>
                <div className="text-[11px] text-muted-foreground">t/h</div>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
            <li>捕集比管输高 {formatNum(balance.captureToPipe, 1)} t/h，按脱水排气和计量偏差解释。</li>
            <li>
              管输比注入高 {formatNum(balance.pipeToWell, 1)} t/h，末站缓冲罐 {balance.buffer}%（{balance.bufferTrend}）。
            </li>
          </ul>
        </article>
      </section>

      <ResearchTips />
    </div>
  );
}
