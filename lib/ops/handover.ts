import { ENGINEER_DISCLAIMER } from "./disclaimer";
import {
  getContainmentStatus,
  getMassBalance,
  getPlumeDemo,
  getTransportIntegrity,
  massStatusLabel,
  OPS_FIXTURE,
} from "./inventory";
import { plant } from "../telemetry";

export const NOT_A_FILING = "本交接不是监管报送，也不能代替 MMV 报表或现场操作票。";

export type HandoverHitl = { id: string; phase: string; expiresAt: string };
export type HandoverAlert = { id: string; title: string; severity: string };
export type HandoverHealth = { summary: string; reachable: boolean; mock: boolean };

export function buildShiftHandover(input: {
  alerts: HandoverAlert[];
  hitl: HandoverHitl[];
  health: HandoverHealth;
}) {
  const mass = getMassBalance();
  const containment = getContainmentStatus();
  const transport = getTransportIntegrity();
  const plume = getPlumeDemo();
  const critical = input.alerts.filter((alert) => alert.severity === "critical");
  const date = plant.asOfLabel.slice(0, 10);
  const filename = `渤西CCUS交接班-${date}.md`;
  const hitlLines = input.hitl.length
    ? input.hitl.map((item) => `- ${item.id} · ${item.phase} · 到期 ${item.expiresAt}`)
    : ["- 当前没有待批准或已驳回待再确认的 HITL 线程。"];
  const alertLines = critical.length
    ? critical.map((alert) => `- **${alert.id}** ${alert.title}`)
    : ["- 无未关闭的严重告警。"];
  const containmentLines = containment.rows.map(
    (row) => `- ${row.barrier_label} · ${row.tag} ${row.label}：${row.value}（${massStatusLabel(row.status)}）。${row.note}`,
  );
  const base = plume.scenarios.find((item) => item.id === "base");
  const lines = [
    `# ${plant.name}交接班`,
    "",
    `- 班次：${plant.shift}`,
    `- 快照：${plant.asOfLabel}`,
    `- 遥测快照：${plant.snapshotId}`,
    `- 衡算快照：${OPS_FIXTURE.snapshot_id}`,
    "- 时区：Asia/Shanghai",
    "",
    "## 未关闭严重告警",
    "",
    ...alertLines,
    "",
    "## 人工复核",
    "",
    ...hitlLines,
    "",
    "## 演示质量衡算",
    "",
    `- 滚动捕集 ${mass.captured_t} t`,
    `- 管存 ${mass.linepack_t} t（变化 ${mass.delta_linepack_t} t）`,
    `- 滚动注入 ${mass.injected_rolling_t} t`,
    `- 已封存 ${mass.stored_mt} Mt（${mass.stored_t} t，快照字段）`,
    `- 累计注入计量表：${mass.injected_cumulative_label}`,
    `- 不平衡 ${mass.imbalance_pct}%（${massStatusLabel(mass.status)}，关注 ${mass.watch_pct}% / 告警 ${mass.alarm_pct}%）`,
    `- ${mass.reading}`,
    "",
    "## 遏制",
    "",
    ...containmentLines,
    "",
    "## 运输",
    "",
    `- 首站 ${transport.pack_inlet_mpa} MPa / 末站 ${transport.pack_outlet_mpa} MPa`,
    `- 泄漏风险指数 ${transport.leak_index}（关注 ${transport.leak_watch} · 关断 ${transport.leak_trip}）`,
    `- 进出口质量差：${transport.inlet_outlet_mass_label}。${transport.inlet_outlet_note}`,
    "",
    "## 教学羽流",
    "",
    `- 模型 ${plume.model_id}。${plume.not_a_simulator}`,
    `- 基线半径 ${base?.radius_at_elapsed_m ?? "未知/需接入数据源"} m`,
    `- 快照另一读数 ${plume.reported_plume_m} m。${plume.reported_plume_note}`,
    `- 压力足迹：未知/需接入数据源。${plume.pressure_note}`,
    "",
    "## 评估服务",
    "",
    input.health.summary,
    "",
    "## 声明",
    "",
    NOT_A_FILING,
    "",
    ENGINEER_DISCLAIMER,
  ];
  const markdown = lines.join("\n");
  const summary = `交接班已写好。严重告警 ${critical.length} 条，衡算${massStatusLabel(mass.status)}，不平衡 ${mass.imbalance_pct}%。HITL 待处理 ${input.hitl.length} 条。${NOT_A_FILING}`;
  return { filename, markdown, summary, mass, containment, transport, plume };
}
