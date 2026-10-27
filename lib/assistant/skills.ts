import { resolveExplainAlert } from "@/lib/assistant/explain-guard";
import { ENGINEER_DISCLAIMER } from "@/lib/ops/disclaimer";
import { buildShiftHandover } from "@/lib/ops/handover";
import {
  getContainmentStatus,
  getMassBalance,
  getPlumeDemo,
  getTransportIntegrity,
  massStatusLabel,
  OPS_FIXTURE,
} from "@/lib/ops/inventory";
import { offlineRecovery, rateLimitRecovery, sseDropRecovery, timeoutRecovery, tokenRecovery } from "@/lib/ops/errors";
import { riskIntervalMs, takeRateLimit } from "@/lib/ops/rate-limit";
import { createRequestId } from "@/lib/ops/request-id";
import { fetchUpstream, isTimeout } from "@/lib/ops/retry";
import { telemetrySource } from "@/lib/ops/telemetry-source";
import { ageHours, formatShanghai } from "@/lib/ops/time";
import { authHeaders, offlineMessage, petroConfig, upstreamMessage } from "@/lib/petro/config";
import { mockAnalyzeStream } from "@/lib/petro/mock";
import { iterateSse } from "@/lib/petro/sse";
import { listThreads, registerAnalyzeThread } from "@/lib/petro/threads";
import type { PetroChart, PetroResult, PhysicsCheck, QualityGate, RiskDecision, HumanReview } from "@/lib/petro/types";
import { probePetroHealth } from "@/lib/petro/upstream";
import { RESEARCH_FIXTURE, selectResearchNotes } from "@/lib/research/notes";
import {
  ALERTS,
  SEGMENTS,
  SNAP,
  activeAlerts,
  alertsFor,
  assessmentDraft,
  dutyRecommendations,
  getSegment,
  massBalance,
  describeTrend,
  overallStatus,
  plant,
  series,
  sortedAlerts,
  utilizationPct,
  type Alert,
  type AlertStatus,
  type ProcessStatus,
  type SegmentId,
  type Severity,
} from "@/lib/telemetry";

export type { SkillName } from "@/lib/assistant/skill-labels";

const STATUS_LABEL: Record<ProcessStatus, string> = {
  normal: "正常",
  warning: "关注",
  critical: "告警",
};

const SEGMENT_IDS: SegmentId[] = ["capture", "transport", "storage", "mva"];

function demoProvenance() {
  return {
    source: telemetrySource.kind,
    sourceLabel: "演示数据" as const,
    timezone: "Asia/Shanghai" as const,
    asOf: plant.asOf,
    asOfLabel: plant.asOfLabel,
    stale: true,
    ageHours: ageHours(plant.asOf),
    scada: false,
    snapshot_id: plant.snapshotId,
  };
}

function demoEnvelope() {
  return {
    source: "演示数据" as const,
    as_of: plant.asOf,
    confidence: "high" as const,
    snapshot_id: plant.snapshotId,
  };
}

function opsEnvelope(confidence: "high" | "low" = "high") {
  return {
    source: "演示数据" as const,
    as_of: plant.asOf,
    confidence,
    snapshot_id: OPS_FIXTURE.snapshot_id,
    snapshots: [
      { source: "演示数据" as const, as_of: plant.asOf, snapshot_id: plant.snapshotId },
      { source: "演示数据" as const, as_of: plant.asOf, snapshot_id: OPS_FIXTURE.snapshot_id },
    ],
  };
}

function shortAlert(alert: Alert) {
  return {
    id: alert.id,
    severity: alert.severity,
    status: alert.status,
    segment: alert.segment,
    title: alert.title,
    summary: alert.summary,
    reading: alert.reading,
    threshold: alert.threshold,
    unitHint: alert.reading,
    nextCheck: alert.nextChecks[0] ?? "",
    openedAt: alert.openedAt,
    timezone: "Asia/Shanghai" as const,
  };
}

export function getOverview() {
  const alerts = activeAlerts();
  const status = overallStatus();
  const inventory = getMassBalance();
  return {
    skill: "get_overview" as const,
    ok: true,
    ...demoEnvelope(),
    summary: `${plant.name} ${plant.asOfLabel}，全流程${STATUS_LABEL[status]}。捕集率 ${SNAP.captureRate}%，注入 ${SNAP.injTph} t/h，活跃告警 ${alerts.length} 条。演示质量衡算不平衡 ${inventory.imbalance_pct}%。`,
    inventory,
    note: "演示遥测快照，不是现场 SCADA，也不是 OPC-UA / MQTT。",
    provenance: demoProvenance(),
    thresholds: {
      captureRatePct: "≥90%",
      energyGjPerT: `≤${SNAP.energyTarget} GJ/t`,
      leakIndexWatch: SNAP.leakWatch,
      leakIndexTrip: SNAP.leakTrip,
      soilCo2Ppm: `${SNAP.soilLow}–${SNAP.soilHigh} ppm`,
    },
    nextChecks: dutyRecommendations(),
    plant: {
      name: plant.name,
      code: plant.code,
      site: plant.site,
      shift: plant.shift,
      asOf: plant.asOfLabel,
      storage: plant.storage,
      designCaptureMtA: plant.designCaptureMtA,
    },
    status,
    statusLabel: STATUS_LABEL[status],
    kpis: {
      captureRatePct: SNAP.captureRate,
      captureTph: SNAP.captureTph,
      energyGjPerT: SNAP.energy,
      energyTargetGjPerT: SNAP.energyTarget,
      inletPressureMpa: SNAP.inletP,
      injectionTph: SNAP.injTph,
      storedMt: plant.storedMt,
      permittedMt: plant.permittedMt,
      utilizationPct: Math.round(utilizationPct() * 10) / 10,
      soilCo2Ppm: SNAP.soilPpm,
    },
    segments: SEGMENTS.map((segment) => ({
      id: segment.id,
      name: segment.name,
      status: segment.status,
      summary: segment.summary,
    })),
    massBalance: massBalance(),
    activeAlerts: alerts.map(shortAlert),
    duty: dutyRecommendations(),
  };
}

export function getSegmentMetrics(segmentId: string) {
  if (!SEGMENT_IDS.includes(segmentId as SegmentId)) {
    return {
      skill: "get_segment_metrics" as const,
      ok: false,
      source: "演示数据" as const,
      as_of: plant.asOf,
      confidence: "unknown" as const,
      snapshot_id: plant.snapshotId,
      summary: `未知/需接入数据源。没有工段 ${segmentId}。可用：capture、transport、storage、mva。`,
    };
  }
  const segment = getSegment(segmentId as SegmentId);
  return {
    skill: "get_segment_metrics" as const,
    ok: true,
    ...demoEnvelope(),
    summary: `${segment.name}：${segment.summary}`,
    provenance: demoProvenance(),
    segment: {
      id: segment.id,
      name: segment.name,
      status: segment.status,
      statusLabel: STATUS_LABEL[segment.status],
      primary: segment.primary,
      kpis: segment.kpis,
      readings: segment.readings,
      equipment: segment.equipment,
      note: segment.note ?? null,
    },
  };
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "严重",
  warning: "警告",
  info: "提示",
};

const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  active: "活跃",
  acknowledged: "已确认",
  cleared: "已恢复",
};

const ALERT_TREND: Record<string, { name: string; values: number[]; digits: number }> = {
  "ALM-2041": { name: "GW-07 土壤气", values: series.soil, digits: 0 },
  "ALM-1988": { name: "B3 段压差", values: series.differential, digits: 2 },
  "ALM-1972": { name: "再生能耗", values: series.energy, digits: 2 },
  "ALM-1955": { name: "注入速率", values: series.injection, digits: 1 },
};

const ALERT_IMPLICATION: Record<string, string> = {
  "ALM-2041":
    "先按单点异常处理：相邻监测井没有同步升高之前，不要把它升成区域性羽流突破，也不要据此关井。",
  "ALM-1988":
    "泄漏指数还在关注区和关断阈之间，维持输量并核对阀门与流量差。指数到 0.80 再降输并关 VS-04。",
  "ALM-1972":
    "捕集率仍在 90% 以上，能耗偏高优先查贫液负荷和再沸器蒸汽，不必先降烟气侧线负荷。",
  "ALM-1955": "这是计划检修转热备，不是故障停井。今晚仍由 IW-03 单井承担注入。",
  "ALM-1866": "振动越限已经复位。本班看趋势即可，不必再降压缩机负荷。",
};

const ALERT_NOT_THIS: Record<string, string> = {
  "ALM-2041": "这不是已证实的盖层失效，羽流半径也不是实测反演。",
  "ALM-1988": "首末站流量差还没有放大成明确泄漏，不要直接关断全线。",
  "ALM-1972": "捕集率短时跌到约 87% 是过滤器切换，现已回到 91% 上方，不要和能耗告警混成一条。",
  "ALM-1955": "不要把它算进活跃异常。切换窗口是明天 06:00。",
  "ALM-1866": "告警已恢复，不要再写进本班异常清单的头条。",
};

export function listAlerts(input?: {
  status?: AlertStatus | "all";
  segment?: SegmentId;
  severity?: Severity | "all";
}) {
  const status = input?.status ?? "all";
  const severity = input?.severity ?? "all";
  const alerts = sortedAlerts(alertsFor(input?.segment, status)).filter((alert) =>
    severity === "all" ? true : alert.severity === severity,
  );
  const active = alerts.filter((alert) => alert.status === "active").length;
  const severityText = severity === "all" ? "" : `${SEVERITY_LABEL[severity]}`;
  return {
    skill: "list_alerts" as const,
    ok: true,
    ...demoEnvelope(),
    summary: `筛出 ${alerts.length} 条${severityText}告警，其中活跃 ${active} 条。`,
    filter: { status, segment: input?.segment ?? null, severity },
    provenance: demoProvenance(),
    alerts: alerts.map(shortAlert),
  };
}

export function explainAlert(alertId: string) {
  const resolved = resolveExplainAlert(alertId);
  if (!resolved.ok) {
    return {
      skill: "explain_alert" as const,
      ok: false,
      ...demoEnvelope(),
      summary: `未知/需接入数据源。没有编号 ${resolved.id ?? alertId} 的告警。演示快照里的编号是 ${ALERTS.map((item) => item.id).join("、")}。`,
      alert: null,
    };
  }
  const alert = resolved.alert;
  const segment = getSegment(alert.segment);
  const trend = ALERT_TREND[alert.id];
  const related = sortedAlerts(ALERTS.filter((item) => item.segment === alert.segment && item.id !== alert.id)).map(
    (item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      severityLabel: SEVERITY_LABEL[item.severity],
      status: item.status,
      statusLabel: ALERT_STATUS_LABEL[item.status],
    }),
  );
  const tags = alert.equipment.split(/[/·,\s]+/).filter((tag) => tag.length > 1);
  const equipment = segment.equipment.filter(
    (item) => tags.some((tag) => item.tag.includes(tag) || item.name.includes(tag)) || alert.equipment.includes(item.tag),
  );
  const trendText = trend
    ? `${trend.name}${describeTrend(trend.values, trend.digits)}。`
    : "这条告警没有单独的小时曲线，以当前读数为准。";
  const implication = ALERT_IMPLICATION[alert.id] ?? alert.nextChecks[0] ?? alert.summary;
  const notThis = ALERT_NOT_THIS[alert.id] ?? "按告警正文核查，不要把演示快照写成现场事故结论。";
  const summary = `${alert.id} 是${segment.name}的${SEVERITY_LABEL[alert.severity]}告警，当前${ALERT_STATUS_LABEL[alert.status]}。${alert.summary} 建议先做：${alert.nextChecks[0] ?? "按正文核查"}。`;
  return {
    skill: "explain_alert" as const,
    ok: true,
    ...demoEnvelope(),
    summary,
    provenance: demoProvenance(),
    nextChecks: alert.nextChecks,
    threshold: alert.threshold,
    alert: {
      ...alert,
      severityLabel: SEVERITY_LABEL[alert.severity],
      statusLabel: ALERT_STATUS_LABEL[alert.status],
    },
    context: {
      segmentName: segment.name,
      segmentStatus: segment.status,
      segmentStatusLabel: STATUS_LABEL[segment.status],
      segmentSummary: segment.summary,
      segmentNote: segment.note ?? null,
      trend: trendText,
      implication,
      notThis,
      related,
      equipment: equipment.map((item) => ({ tag: item.tag, name: item.name, state: item.state, detail: item.detail })),
    },
  };
}

export function draftOpsReport() {
  const status = overallStatus();
  const active = sortedAlerts(activeAlerts());
  const resting = sortedAlerts(ALERTS.filter((alert) => alert.status !== "active"));
  const balance = massBalance();
  const duty = dutyRecommendations();
  const critical = active.filter((alert) => alert.severity === "critical").length;
  const warning = active.filter((alert) => alert.severity === "warning").length;
  const date = plant.asOfLabel.slice(0, 10);
  const filename = `渤西CCUS值班日报-${date}.md`;
  const segmentLines = SEGMENTS.map(
    (segment) =>
      `- **${segment.name}**（${STATUS_LABEL[segment.status]}）：${segment.summary}${segment.note ? ` ${segment.note}` : ""}`,
  );
  const alertLines = active.length
    ? active.map(
        (alert) =>
          `- **${alert.id}** ${SEVERITY_LABEL[alert.severity]} · ${ALERT_STATUS_LABEL[alert.status]} · ${alert.title}。读数 ${alert.reading}（对照 ${alert.threshold}）。先做：${alert.nextChecks[0] ?? alert.summary}`,
      )
    : ["- 无活跃告警。"];
  const restingLines = resting.map(
    (alert) => `- ${alert.id} ${SEVERITY_LABEL[alert.severity]} · ${ALERT_STATUS_LABEL[alert.status]} · ${alert.title}`,
  );
  const lines = [
    `# ${plant.name}值班日报`,
    "",
    `- 日期：${date}`,
    `- 班次：${plant.shift}`,
    `- 现场：${plant.site}`,
    `- 快照：${plant.asOfLabel}`,
    "- 数据来源：演示数据，非 SCADA，未接 OPC-UA / MQTT",
    `- 编制：碳衡助手 · 技能 draft_ops_report`,
    "",
    "## 一、今日结论",
    "",
    `${plant.name}全流程${STATUS_LABEL[status]}。捕集侧线仍在目标捕集率以上，再生能耗偏高；38 km 管输维持密相，B3 段压差处于关注区但未到关断；注入由 IW-03 单井承担，库容仍有余量。当前唯一红色测点是 GW-07 浅层二氧化碳，相邻井尚未同步升高，先复测再谈泄漏分级。`,
    "",
    `活跃告警 ${active.length} 条，其中严重 ${critical} 条、警告 ${warning} 条。本报数字全部来自 ${plant.asOfLabel} 的演示遥测，不是现场 SCADA，也不能代替 petro-rag-agent 的封存评估。`,
    "",
    "## 二、关键指标",
    "",
    "| 指标 | 当前 | 对照 |",
    "| --- | --- | --- |",
    `| 捕集率 | ${SNAP.captureRate}% | 目标 ≥90% |`,
    `| 瞬时捕集 | ${SNAP.captureTph} t/h | 设计 ${plant.designCaptureMtA.toFixed(1)} Mt/a |`,
    `| 再生能耗 | ${SNAP.energy} GJ/t | 目标 ≤${SNAP.energyTarget} GJ/t |`,
    `| 再沸器负荷 | ${SNAP.reboilerMw} MW | 按目标能耗约 89 MW |`,
    `| 首站 / 末站压力 | ${SNAP.inletP} / ${SNAP.outletP} MPa | 温度 ${SNAP.tempC} ℃ |`,
    `| 管输流量 | ${SNAP.pipeTph} t/h | B3 压差 ${SNAP.dp} MPa（基线 ${SNAP.dpBaseline}） |`,
    `| 泄漏风险指数 | ${SNAP.leak} | 关注 ${SNAP.leakWatch} · 关断 ${SNAP.leakTrip} |`,
    `| 注入速率 | ${SNAP.injTph} t/h | IW-03 单井 |`,
    `| 井口 / 井底 | ${SNAP.whp} / ${SNAP.bhp} MPa | 环空 ${SNAP.annulus} MPa |`,
    `| 已封存 | ${plant.storedMt} / ${plant.permittedMt} Mt | 利用率 ${Math.round(utilizationPct() * 10) / 10}% |`,
    `| GW-07 土壤气 | ${SNAP.soilPpm} ppm | 背景 ${SNAP.soilLow}–${SNAP.soilHigh} ppm，DIC +${SNAP.dicDelta}% |`,
    "",
    "## 三、质量平衡",
    "",
    `同一时刻捕集 ${balance.captureTph} t/h、管输 ${balance.pipeTph} t/h、注入 ${balance.injTph} t/h。捕集比管输高 ${balance.captureToPipe.toFixed(1)} t/h，按脱水排气和计量偏差解释。管输比注入高 ${balance.pipeToWell.toFixed(1)} t/h，进入末站缓冲罐（液位 ${balance.buffer}%，${balance.bufferTrend}）。差额有去向，不是丢数。`,
    "",
    "## 四、分工段",
    "",
    ...segmentLines,
    "",
    "## 五、告警",
    "",
    ...alertLines,
    "",
    restingLines.length ? "已确认或已恢复，不占本班头条：" : "",
    ...restingLines,
    "",
    "## 六、交下一班",
    "",
    ...duty.map((item, index) => `${index + 1}. ${item.id}：${item.text}`),
    `${duty.length + 1}. 若要做封存完整性判断，另请碳衡助手调用风险评估技能。流式评估返回的线程不能直接批准。`,
    "",
    "## 附注",
    "",
    "本日报由技能 draft_ops_report 在站内根据演示 KPI 和告警直接写成，没有另起模型，也没有连接 petro-rag-agent。羽流前缘是演示地质模型。",
    "",
    ENGINEER_DISCLAIMER,
  ].filter((line) => line !== undefined);
  const markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return {
    skill: "draft_ops_report" as const,
    ok: true,
    ...demoEnvelope(),
    disclaimer: ENGINEER_DISCLAIMER,
    summary: `${date} 值班日报已写好。全流程${STATUS_LABEL[status]}，活跃告警 ${active.length} 条（严重 ${critical}、警告 ${warning}）。可以下载 Markdown，或在卡片里打印成 PDF。${ENGINEER_DISCLAIMER}`,
    provenance: demoProvenance(),
    filename,
    markdown,
  };
}

export function readMassBalance() {
  const mass = getMassBalance();
  return {
    skill: "get_mass_balance" as const,
    ok: true,
    ...opsEnvelope(),
    summary: `演示质量衡算：滚动捕集 ${mass.captured_t} t，管存 ${mass.linepack_t} t，滚动注入 ${mass.injected_rolling_t} t，已封存 ${mass.stored_mt} Mt，累计注入${mass.injected_cumulative_label}，不平衡 ${mass.imbalance_pct}%（${massStatusLabel(mass.status)}）。`,
    mass,
  };
}

export function readContainment() {
  const containment = getContainmentStatus();
  const flags = containment.rows
    .filter((row) => row.status !== "normal")
    .map((row) => `${row.tag} ${massStatusLabel(row.status)}`)
    .join("、");
  return {
    skill: "get_containment_status" as const,
    ok: true,
    ...opsEnvelope(),
    summary: `遏制盘${massStatusLabel(containment.status)}。${flags || "演示阈值内没有越限点"}。监测触发不等于屏障失效。`,
    containment,
  };
}

export function readTransportIntegrity() {
  const transport = getTransportIntegrity();
  return {
    skill: "get_transport_integrity" as const,
    ok: true,
    ...opsEnvelope(),
    summary: `运输完整性：首站 ${transport.pack_inlet_mpa} MPa，末站 ${transport.pack_outlet_mpa} MPa，管存 ${transport.linepack_t} t，泄漏风险指数 ${transport.leak_index}（${massStatusLabel(transport.leak_status)}）。进出口质量差${transport.inlet_outlet_mass_label}。`,
    transport,
  };
}

export function readPlumeDemo() {
  const plume = getPlumeDemo();
  const base = plume.scenarios.find((item) => item.id === "base");
  return {
    skill: "get_plume_demo" as const,
    ok: true,
    ...opsEnvelope(),
    snapshots: [
      { source: "演示数据" as const, as_of: plant.asOf, snapshot_id: plant.snapshotId },
      { source: "演示数据" as const, as_of: plant.asOf, snapshot_id: OPS_FIXTURE.snapshot_id },
      { source: "知识卡" as const, as_of: RESEARCH_FIXTURE.curated_as_of, snapshot_id: RESEARCH_FIXTURE.fixture_id },
    ],
    summary: `教学羽流模型 ${plume.model_id}：基线半径 ${base?.radius_at_elapsed_m ?? "未知/需接入数据源"} m。快照另一读数 ${plume.reported_plume_m} m，不是这条公式的输出。压力足迹未知/需接入数据源。${plume.not_a_simulator}`,
    plume,
  };
}

export async function draftShiftHandover() {
  const health = await checkBackendHealth();
  const probe = health.health;
  const hitl = listThreads()
    .filter((row) => row.kind === "hitl" && (row.phase === "awaiting_approval" || row.phase === "rejected"))
    .map((row) => ({
      id: row.id,
      phase: row.phase === "awaiting_approval" ? "待批准" : "已驳回",
      expiresAt: formatShanghai(row.expiresAt),
    }));
  const alerts = activeAlerts().map((alert) => ({ id: alert.id, title: alert.title, severity: alert.severity }));
  const note = buildShiftHandover({
    alerts,
    hitl,
    health: {
      summary: health.summary,
      reachable: health.ok,
      mock: Boolean(probe && typeof probe === "object" && "mock" in probe && probe.mock),
    },
  });
  return {
    skill: "draft_shift_handover" as const,
    ok: true,
    ...opsEnvelope(health.ok ? "high" : "low"),
    disclaimer: ENGINEER_DISCLAIMER,
    filing: "本交接不是监管报送。",
    summary: note.summary,
    filename: note.filename,
    markdown: note.markdown,
  };
}

export function ccusResearchNotes(input?: { segment?: string; id?: string; query?: string }) {
  const notes = selectResearchNotes(input);
  const fixtureId = RESEARCH_FIXTURE.fixture_id;
  const asOf = RESEARCH_FIXTURE.curated_as_of;
  if (notes.length === 0) {
    return {
      skill: "ccus_research_notes" as const,
      ok: false,
      source: "知识卡" as const,
      as_of: asOf,
      confidence: "high" as const,
      snapshot_id: fixtureId,
      summary: "未知/需接入数据源。知识卡里没有对上的条目。本技能不从网上补标准、DOI 或临界参数。",
      notes: [],
    };
  }
  return {
    skill: "ccus_research_notes" as const,
    ok: true,
    source: "知识卡" as const,
    as_of: asOf,
    confidence: "high" as const,
    snapshot_id: fixtureId,
    summary: notes.map((note) => `${note.standard_id}（${note.year}）：${note.takeaway}`).join("\n"),
    notes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      year: note.year,
      standard_id: note.standard_id,
      doi: note.doi,
      url: note.url,
      segments: note.segments,
      takeaway: note.takeaway,
    })),
  };
}

export async function checkBackendHealth() {
  const health = await probePetroHealth();
  const asOf = formatShanghai(new Date(), true);
  return {
    skill: "check_backend_health" as const,
    ok: health.reachable,
    source: health.mock ? ("petro-rag-mock" as const) : ("petro-rag-agent" as const),
    as_of: asOf,
    confidence: health.reachable ? ("high" as const) : ("low" as const),
    snapshot_id: health.mock ? "petro-rag-mock" : "petro-rag-live",
    summary: health.message,
    recovery: health.recovery ?? [],
    health,
  };
}

type RiskNode = { node: string; label?: string; status?: string };

export type RiskSnapshot = {
  skill: "run_risk_assessment";
  phase: "running" | "done" | "error";
  ok: boolean;
  offline: boolean;
  mock: boolean;
  summary: string;
  nodes: RiskNode[];
  report: string;
  uq: Record<string, unknown> | null;
  chart: PetroChart | null;
  physics_check: PhysicsCheck | null;
  quality_gate: QualityGate | null;
  risk_decision: RiskDecision | null;
  human_review: HumanReview | null;
  gate_status: string | null;
  analyze_thread_id: string | null;
  elapsed_s: number | null;
  note: string;
  requestId: string;
  recovery: string[];
  source: "petro-rag-mock" | "petro-rag-agent";
  as_of: string;
  confidence: "high" | "low" | "unknown";
  snapshot_id: string;
  disclaimer: string;
};

function upsertNode(nodes: RiskNode[], event: { node?: string; label?: string; status?: string }) {
  if (!event.node) return nodes;
  const next = nodes.slice();
  const index = next.findIndex((item) => item.node === event.node);
  const row: RiskNode = {
    node: event.node,
    label: event.label ?? next[index]?.label,
    status: event.status ?? next[index]?.status,
  };
  if (index === -1) next.push(row);
  else next[index] = row;
  return next;
}

function gateWording(gate: string, blocked: boolean) {
  if (blocked || gate === "failed" || gate === "fail") {
    return "质量闸门未通过：正文不得当作可交付结论，也不得进入批准。";
  }
  if (gate === "passed" || gate === "success" || gate === "pass") {
    return "质量闸门通过：这只是本次返回的闸门状态，不是持证工程师签字。";
  }
  return "";
}

function summarizeRisk(done: PetroResult) {
  const gate = done.quality_gate?.status || done.gate_status || "";
  const blocked =
    done.physics_check?.blocking === true || done.quality_gate?.quarantined === true || gate === "failed";
  const level = done.risk_decision?.level_label || done.risk_decision?.level;
  const pieces = ["以下只转述返回字段。"];
  if (gate) pieces.push(`闸门状态 ${gate}。`);
  const wording = gateWording(gate, blocked);
  if (wording) pieces.push(wording);
  if (level) pieces.push(`风险等级 ${level}。`);
  if (done.risk_decision?.text) pieces.push(done.risk_decision.text);
  pieces.push(ENGINEER_DISCLAIMER);
  return pieces.join("");
}

function blankRisk(mock: boolean, summary: string, phase: RiskSnapshot["phase"], requestId: string): RiskSnapshot {
  return {
    skill: "run_risk_assessment",
    phase,
    ok: false,
    offline: false,
    mock,
    summary,
    nodes: [],
    report: "",
    uq: null,
    chart: null,
    physics_check: null,
    quality_gate: null,
    risk_decision: null,
    human_review: null,
    gate_status: null,
    analyze_thread_id: null,
    elapsed_s: null,
    note: "未出现在返回字段里的机理不写入结论。若必须口头补充边界，句首标「推测」。",
    requestId,
    recovery: [],
    source: mock ? "petro-rag-mock" : "petro-rag-agent",
    as_of: formatShanghai(new Date(), true),
    confidence: phase === "done" ? "high" : phase === "error" ? "low" : "unknown",
    snapshot_id: requestId,
    disclaimer: ENGINEER_DISCLAIMER,
  };
}

export async function* streamRiskAssessment(
  projectDescription: string,
  signal?: AbortSignal,
): AsyncGenerator<RiskSnapshot> {
  const requestId = createRequestId();
  const trimmed = projectDescription.trim();
  const userInput = trimmed || assessmentDraft();
  if (trimmed.length > 0 && trimmed.length < 8) {
    yield {
      ...blankRisk(false, "描述太短。请写明井、压力或告警编号后再评估。", "error", requestId),
      recovery: ["至少 8 个字。空描述不会替你补一份封存结论。"],
    };
    return;
  }
  if (userInput.length > 8000) {
    yield {
      ...blankRisk(false, "描述超过 8000 字，请先压缩再评估。", "error", requestId),
      recovery: ["保留压力、井深和告警编号，删掉无关段落。"],
    };
    return;
  }
  const limit = takeRateLimit("risk-assess", riskIntervalMs());
  if (!limit.ok) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    yield {
      ...blankRisk(false, `评估请求过于密集。请 ${seconds} 秒后再试。请求 ${requestId}。`, "error", requestId),
      recovery: rateLimitRecovery(seconds),
    };
    return;
  }

  const { baseUrl, token, mock } = petroConfig();
  let snapshot = blankRisk(
    mock,
    mock ? "演示流已开始，正在走节点。" : "正在连接 petro-rag-agent 的 /api/analyze。",
    "running",
    requestId,
  );
  yield snapshot;

  let response: Response;
  try {
    response = mock
      ? new Response(mockAnalyzeStream(userInput), {
          headers: { "Content-Type": "text/event-stream; charset=utf-8", "X-Request-Id": requestId },
        })
      : await fetchUpstream(
          `${baseUrl}/api/analyze`,
          {
            method: "POST",
            signal,
            headers: authHeaders(token, {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "X-Request-Id": requestId,
            }),
            body: JSON.stringify({ user_input: userInput }),
          },
          { mode: "post", timeoutMs: 240_000, attempts: 2 },
        );
  } catch (error) {
    const timeout = isTimeout(error);
    const aborted = signal?.aborted && !timeout;
    yield {
      ...snapshot,
      phase: "error",
      confidence: "low",
      offline: !timeout && !aborted,
      summary: aborted ? "风险评估已停止。" : timeout ? `连接评估服务超时。请求 ${requestId}。` : offlineMessage(),
      recovery: aborted ? [] : timeout ? timeoutRecovery() : offlineRecovery(),
    };
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    const unauthorized = response.status === 401;
    const offline = response.status === 503 || response.status === 504;
    yield {
      ...snapshot,
      phase: "error",
      confidence: "low",
      offline,
      summary: unauthorized
        ? `评估服务拒绝了令牌。请求 ${requestId}。`
        : offline
          ? offlineMessage()
          : upstreamMessage(text, response.status),
      recovery: unauthorized ? tokenRecovery() : offline ? offlineRecovery() : ["看请求号后到服务日志里对一下这次调用。"],
    };
    return;
  }

  let done: PetroResult | null = null;
  let streamError = "";
  let sinceYield = 0;
  try {
    for await (const event of iterateSse(response)) {
      if (signal?.aborted) break;
      if (event.type === "node") {
        snapshot = {
          ...snapshot,
          nodes: upsertNode(snapshot.nodes, event),
          summary: `${event.label || event.node || "节点"}${event.status === "end" ? "完成" : "进行中"}。`,
        };
        yield snapshot;
        sinceYield = 0;
      } else if (event.type === "token" && event.text) {
        snapshot = { ...snapshot, report: snapshot.report + event.text, summary: "报告正在成稿。" };
        sinceYield += event.text.length;
        if (sinceYield >= 72) {
          yield snapshot;
          sinceYield = 0;
        }
      } else if (event.type === "uq") {
        snapshot = { ...snapshot, uq: event.uq ?? snapshot.uq, summary: "收到不确定性片段。" };
        yield snapshot;
      } else if (event.type === "chart") {
        snapshot = { ...snapshot, chart: event.chart ?? snapshot.chart, summary: "收到曲线摘要。" };
        yield snapshot;
      } else if (event.type === "error") {
        streamError = event.message || "评估流返回错误。";
      } else if (event.type === "done") {
        done = event;
      }
    }
  } catch (error) {
    const aborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");
    yield {
      ...snapshot,
      phase: "error",
      confidence: "low",
      summary: aborted ? "风险评估已停止。" : `评估流中断。请求 ${requestId}。`,
      recovery: aborted ? [] : sseDropRecovery(),
    };
    return;
  }

  if (signal?.aborted) {
    yield { ...snapshot, phase: "error", confidence: "low", summary: "风险评估已停止。", recovery: [] };
    return;
  }

  if (streamError || !done) {
    yield {
      ...snapshot,
      phase: "error",
      confidence: "low",
      summary: streamError || `评估流结束，但没有 done。请求 ${requestId}。这次没有结论。`,
      recovery: sseDropRecovery(),
    };
    return;
  }

  const result = done;
  if (result.thread_id) registerAnalyzeThread(result.thread_id, requestId);
  const blocked =
    result.physics_check?.blocking === true || result.quality_gate?.quarantined === true || result.gate_status === "failed";
  yield {
    ...snapshot,
    phase: "done",
    confidence: "high",
    ok: !blocked,
    summary: summarizeRisk(result),
    report: result.report ?? snapshot.report,
    uq: result.uq ?? snapshot.uq,
    chart: result.chart ?? snapshot.chart,
    physics_check: result.physics_check ?? null,
    quality_gate: result.quality_gate ?? null,
    risk_decision: result.risk_decision ?? null,
    human_review: result.human_review ?? null,
    gate_status: result.gate_status ?? result.status ?? null,
    analyze_thread_id: result.thread_id ?? null,
    elapsed_s: result.elapsed_s ?? null,
    note: mock
      ? "以下只转述返回字段。PETRO_RAG_MOCK=1，这是内置演示流，没有连接 petro-rag-agent，也没有调用 Ollama。系统不会自动批准。流式 thread_id 不能拿来放行。未出现在返回字段里的机理，句首标「推测」。"
      : "以下只转述返回字段。结果来自 petro-rag-agent 的 POST /api/analyze。系统不会自动批准。流式 thread_id 不能拿来放行，人工复核要在卡片里另行发起。未出现在返回字段里的机理，句首标「推测」。",
    recovery: [],
  };
}
