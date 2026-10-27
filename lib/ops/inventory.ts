import fixtureJson from "../../content/ops-demo.json" with { type: "json" };
import { SNAP, plant, series } from "../telemetry";

export const OPS_FIXTURE = fixtureJson;

export type OpsStatus = "normal" | "warning" | "critical";

export type BarrierId = "primary_wellbore" | "secondary_caprock" | "tertiary_monitoring";

export const BARRIER_LABEL: Record<BarrierId, string> = {
  primary_wellbore: "一次屏障 · 井筒",
  secondary_caprock: "二次屏障 · 盖层",
  tertiary_monitoring: "三次屏障 · 监测",
};

const MASS_FORMULA = [
  "演示质量衡算，不是 SCADA 累计器。",
  "滚动捕集 (t) = Σ 捕集小时点 (t/h) × 1 h。共 24 个演示小时点，不是自然日 00:00–24:00。",
  "滚动注入 (t) = Σ 注入小时点 (t/h) × 1 h。",
  "管存 (t) = π × (D/2)² × L × ρ / 1000。D、L、ρ 见演示假设。",
  "本窗口管存变化 (t) = 0，因为快照只有一个密度。",
  "不平衡 (t) = 滚动捕集 − 滚动注入 − 管存变化。",
  "不平衡 (%) = 不平衡 (t) / 滚动捕集 (t) × 100。百分比用已四舍五入到 0.1 t 的量。",
  "已封存 (t) = 快照 storedMt × 1e6。这不是本窗口积分。",
  "累计注入计量表：未知/需接入数据源。不用已封存代替累计注入。",
].join("");

export function roundTo(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function linepackTonnes() {
  const { diameter_m, length_m, density_kg_m3 } = OPS_FIXTURE.linepack;
  const volume = Math.PI * (diameter_m / 2) ** 2 * length_m;
  return (volume * density_kg_m3) / 1000;
}

export function rollingTonnes(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function statusByHigh(value: number, watch: number, alarm: number): OpsStatus {
  if (value >= alarm) return "critical";
  if (value >= watch) return "warning";
  return "normal";
}

export function getMassBalance() {
  const captured = roundTo(rollingTonnes(series.captureFlow), 1);
  const injected = roundTo(rollingTonnes(series.injection), 1);
  const linepack = roundTo(linepackTonnes(), 1);
  const deltaLinepack = OPS_FIXTURE.linepack.delta_linepack_t;
  const imbalanceT = roundTo(captured - injected - deltaLinepack, 1);
  const imbalancePct = captured === 0 ? null : roundTo((imbalanceT / captured) * 100, 2);
  const status: OpsStatus =
    imbalancePct == null
      ? "critical"
      : Math.abs(imbalancePct) >= OPS_FIXTURE.imbalance_alarm_pct
        ? "critical"
        : Math.abs(imbalancePct) >= OPS_FIXTURE.imbalance_watch_pct
          ? "warning"
          : "normal";
  return {
    label: "演示质量衡算",
    formula: MASS_FORMULA,
    window: "24 个演示小时点 × 1 h",
    captured_t: captured,
    linepack_t: linepack,
    delta_linepack_t: deltaLinepack,
    injected_rolling_t: injected,
    stored_t: Math.round(plant.storedMt * 1_000_000),
    stored_mt: plant.storedMt,
    injected_cumulative_t: null as number | null,
    injected_cumulative_label: "未知/需接入数据源",
    imbalance_t: imbalanceT,
    imbalance_pct: imbalancePct,
    watch_pct: OPS_FIXTURE.imbalance_watch_pct,
    alarm_pct: OPS_FIXTURE.imbalance_alarm_pct,
    status,
    instantaneous_capture_tph: SNAP.captureTph,
    instantaneous_pipe_tph: SNAP.pipeTph,
    instantaneous_injection_tph: SNAP.injTph,
    assumptions: OPS_FIXTURE.linepack,
    threshold_note: OPS_FIXTURE.imbalance_threshold_note,
    reading: "不平衡先核对脱水排气和末站缓冲，不要直接写成泄漏。",
  };
}

export type ContainmentRow = {
  tag: string;
  barrier: BarrierId;
  barrier_label: string;
  label: string;
  value: string;
  threshold: string;
  status: OpsStatus;
  note: string;
  alert_id: string | null;
};

export function getContainmentStatus() {
  const annulusStatus = statusByHigh(SNAP.annulus, OPS_FIXTURE.annulus_watch_mpa, OPS_FIXTURE.annulus_alarm_mpa);
  const above = OPS_FIXTURE.above_zone;
  const aboveStatus = statusByHigh(above.value_mpa, above.watch_mpa, above.alarm_mpa);
  const seismicStatus = statusByHigh(
    SNAP.microseismicPerDay,
    OPS_FIXTURE.microseismic_watch_per_day,
    OPS_FIXTURE.microseismic_alarm_per_day,
  );
  const soilStatus: OpsStatus = SNAP.soilPpm > SNAP.soilHigh ? "critical" : SNAP.soilPpm > SNAP.soilLow ? "warning" : "normal";
  const dicStatus = statusByHigh(SNAP.dicDelta, OPS_FIXTURE.dic_watch_pct, OPS_FIXTURE.dic_alarm_pct);
  const deltaP = roundTo(SNAP.whp - SNAP.annulus, 1);
  const rows: ContainmentRow[] = [
    {
      tag: "IW-03",
      barrier: "primary_wellbore",
      barrier_label: BARRIER_LABEL.primary_wellbore,
      label: "环空 / 油管",
      value: `环空 ${SNAP.annulus} MPa · 油管 ${SNAP.whp} MPa · ΔP ${deltaP} MPa`,
      threshold: `环空关注 ${OPS_FIXTURE.annulus_watch_mpa} MPa · 告警 ${OPS_FIXTURE.annulus_alarm_mpa} MPa`,
      status: annulusStatus,
      note: OPS_FIXTURE.annulus_note,
      alert_id: null,
    },
    {
      tag: above.tag,
      barrier: "secondary_caprock",
      barrier_label: BARRIER_LABEL.secondary_caprock,
      label: "盖层上方压力",
      value: `${above.value_mpa} MPa`,
      threshold: `关注 ${above.watch_mpa} MPa · 告警 ${above.alarm_mpa} MPa`,
      status: aboveStatus,
      note: above.note,
      alert_id: null,
    },
    {
      tag: "SA-12",
      barrier: "tertiary_monitoring",
      barrier_label: BARRIER_LABEL.tertiary_monitoring,
      label: "微地震",
      value: `${SNAP.microseismicPerDay} 次/日 · 最大 M ${SNAP.microseismicMag}`,
      threshold: `关注 ${OPS_FIXTURE.microseismic_watch_per_day} 次/日 · 告警 ${OPS_FIXTURE.microseismic_alarm_per_day} 次/日`,
      status: seismicStatus,
      note: "次数和震级用演示快照 SNAP，不另造事件。",
      alert_id: null,
    },
    {
      tag: "GW-07",
      barrier: "tertiary_monitoring",
      barrier_label: BARRIER_LABEL.tertiary_monitoring,
      label: "土壤气",
      value: `${SNAP.soilPpm} ppm`,
      threshold: `背景 ${SNAP.soilLow}–${SNAP.soilHigh} ppm`,
      status: soilStatus,
      note: "ALM-2041 落在三次监测，不是盖层失效结论。",
      alert_id: "ALM-2041",
    },
    {
      tag: "GW-07-DIC",
      barrier: "tertiary_monitoring",
      barrier_label: BARRIER_LABEL.tertiary_monitoring,
      label: "地下水 DIC",
      value: `+${SNAP.dicDelta}%`,
      threshold: `关注 +${OPS_FIXTURE.dic_watch_pct}% · 告警 +${OPS_FIXTURE.dic_alarm_pct}%`,
      status: dicStatus,
      note: "与土壤气同一条告警 ALM-2041。",
      alert_id: "ALM-2041",
    },
  ];
  const status: OpsStatus = rows.some((row) => row.status === "critical")
    ? "critical"
    : rows.some((row) => row.status === "warning")
      ? "warning"
      : "normal";
  return {
    label: "遏制与 MMV",
    status,
    rows,
    barrier_note: "一次井筒、二次盖层、三次监测。监测触发不等于屏障已经失效。",
  };
}

export function getTransportIntegrity() {
  const leakStatus: OpsStatus =
    SNAP.leak >= SNAP.leakTrip ? "critical" : SNAP.leak >= SNAP.leakWatch ? "warning" : "normal";
  const linepack = roundTo(linepackTonnes(), 1);
  return {
    label: "运输完整性",
    pack_inlet_mpa: SNAP.inletP,
    pack_outlet_mpa: SNAP.outletP,
    differential_mpa: SNAP.dp,
    differential_baseline_mpa: SNAP.dpBaseline,
    linepack_t: linepack,
    delta_linepack_t: OPS_FIXTURE.linepack.delta_linepack_t,
    inlet_outlet_mass_t: null as number | null,
    inlet_outlet_mass_label: "未知/需接入数据源",
    inlet_outlet_note: "首末站没有分计质量流量，进出口质量差不在本快照里。",
    rate_gap_capture_pipe_tph: roundTo(SNAP.captureTph - SNAP.pipeTph, 1),
    rate_gap_note: "这是瞬时流量差，不是管存变化，也不是泄漏量。",
    leak_index: SNAP.leak,
    leak_watch: SNAP.leakWatch,
    leak_trip: SNAP.leakTrip,
    leak_status: leakStatus,
    leak_note: "泄漏风险只引用演示快照的指数和阈值，不另算泄漏速率。",
    valves: OPS_FIXTURE.esd,
  };
}

export function plumeRadiusM(hours: number, saturation: number) {
  const plume = OPS_FIXTURE.plume;
  const massKg = plume.rate_t_per_h * 1000 * hours;
  const volume = massKg / plume.density_kg_m3;
  return Math.sqrt(volume / (Math.PI * plume.phi * plume.thickness_m * saturation));
}

export function getPlumeDemo() {
  const plume = OPS_FIXTURE.plume;
  const scenarios = plume.scenarios.map((scenario) => ({
    ...scenario,
    radius_at_elapsed_m: roundTo(plumeRadiusM(plume.elapsed_hours, scenario.saturation), 1),
    series: plume.hours.map((hours, index) => ({
      hours,
      label: plume.hour_labels[index] ?? String(hours),
      radius_m: roundTo(plumeRadiusM(hours, scenario.saturation), 1),
    })),
  }));
  return {
    label: "教学羽流",
    model_id: plume.model_id,
    model_name: plume.model_name,
    style: plume.style,
    citation_id: plume.citation_id,
    formula: "r = sqrt( (q × 1000 × t / ρ) / (π × φ × h × S) )，q 为 t/h，t 为 h，r 为 m。",
    assumptions: {
      phi: plume.phi,
      thickness_m: plume.thickness_m,
      density_kg_m3: plume.density_kg_m3,
      rate_t_per_h: plume.rate_t_per_h,
      rate_note: plume.rate_note,
      elapsed_hours: plume.elapsed_hours,
      elapsed_note: plume.elapsed_note,
    },
    scenarios,
    reported_plume_m: SNAP.plumeM,
    reported_plume_note: plume.snapshot_plume_note,
    pressure_footprint_m: plume.pressure_footprint,
    pressure_note: plume.pressure_note,
    not_a_simulator: "这不是油藏模拟器，不是历史拟合，也不是现场真值。",
  };
}

export function massStatusLabel(status: OpsStatus) {
  if (status === "critical") return "告警";
  if (status === "warning") return "关注";
  return "正常";
}
