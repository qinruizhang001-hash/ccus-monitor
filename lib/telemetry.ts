import { formatNum, formatPct } from "./format";

/**
 * Demo snapshot only. Live numbers would come from a TelemetrySource
 * (see lib/ops/telemetry-source.ts). OPC-UA and MQTT are extension points,
 * not connectors in this build.
 */

export type ProcessStatus = "normal" | "warning" | "critical";
export type Severity = "critical" | "warning" | "info";
export type SegmentId = "capture" | "transport" | "storage" | "mva";
export type AlertStatus = "active" | "acknowledged" | "cleared";

export type Point = { t: string; v: number };

export type Kpi = {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "ok" | "warn" | "alarm" | "neutral";
};

export type ChartSpec = {
  id: string;
  title: string;
  unit: string;
  color: string;
  points: Point[];
  digits: number;
  reference?: { y: number; label: string };
};

export type Equipment = {
  tag: string;
  name: string;
  state: "running" | "standby" | "alarm" | "maintenance";
  detail: string;
};

export type Reading = { label: string; value: string; tone?: Kpi["tone"] };

export const plant = {
  name: "渤西 CCUS 示范工程",
  code: "BX-CCUS-01",
  operator: "华碳能源",
  site: "河北唐山 · 曹妃甸",
  source: "2×660 MW 机组烟气侧线",
  solvent: "30 wt% MEA",
  pipelineKm: 38,
  storage: "渤海湾盆地东营组咸水层",
  designCaptureMtA: 1,
  permittedMt: 28,
  storedMt: 10.32,
  commissioned: "2024-06-18",
  asOf: "2026-10-26T14:40:00+08:00",
  asOfLabel: "2026-10-26 14:40 Asia/Shanghai",
  snapshotId: "demo-bx-ccus-20261026T1440+08",
  shift: "白班 · 甲班",
};

export const SNAP = {
  captureRate: 91.4,
  captureTph: 118.6,
  energy: 3.15,
  energyTarget: 2.7,
  flueVol: "52.4 万 Nm³/h",
  inletCo2: 12.6,
  outletCo2: 1.08,
  lean: 0.18,
  rich: 0.49,
  reboilerMw: 104,
  inletP: 9.4,
  outletP: 8.72,
  pipeTph: 117.2,
  tempC: 22.6,
  dp: 0.42,
  dpBaseline: 0.27,
  leak: 0.61,
  leakWatch: 0.45,
  leakTrip: 0.8,
  buffer: 51,
  injTph: 112.4,
  whp: 12.8,
  bhp: 18.6,
  annulus: 4.1,
  plumeM: 680,
  microseismicPerDay: 0.4,
  microseismicMag: -0.6,
  soilPpm: 1240,
  soilLow: 420,
  soilHigh: 480,
  dicDelta: 18,
} as const;

export const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const hour = (15 + i) % 24;
  return `${String(hour).padStart(2, "0")}:00`;
});

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTo(value: number, digits: number) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function buildSeries(opts: {
  start: number;
  end: number;
  wobble: number;
  seed: number;
  digits: number;
  dip?: { at: number; depth: number };
  spike?: { at: number; height: number };
}) {
  const rand = mulberry32(opts.seed);
  const values: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    const t = i / 23;
    let v = opts.start + (opts.end - opts.start) * t;
    v += (rand() - 0.5) * 2 * opts.wobble;
    if (opts.dip) {
      const d = i - opts.dip.at;
      v -= opts.dip.depth * Math.exp(-(d * d) / 3.2);
    }
    if (opts.spike) {
      const d = i - opts.spike.at;
      v += opts.spike.height * Math.exp(-(d * d) / 3.2);
    }
    values.push(roundTo(v, opts.digits));
  }
  values[23] = roundTo(opts.end, opts.digits);
  return values;
}

export function toPoints(values: number[]): Point[] {
  return HOUR_LABELS.map((t, i) => ({ t, v: values[i] ?? 0 }));
}

export function describeTrend(values: number[], digits: number) {
  const last = values.at(-1) ?? 0;
  const prev = values.at(-6) ?? last;
  const delta = last - prev;
  const eps = 10 ** -digits / 2;
  const dir = delta > eps ? "上升" : delta < -eps ? "下降" : "基本持平";
  return `近 6 小时${dir}，${formatNum(prev, digits)} → ${formatNum(last, digits)}`;
}

const captureRate = buildSeries({
  start: 91.8,
  end: SNAP.captureRate,
  wobble: 0.18,
  seed: 3,
  digits: 1,
  dip: { at: 15, depth: 4.1 },
});
const energy = buildSeries({
  start: 2.82,
  end: SNAP.energy,
  wobble: 0.03,
  seed: 7,
  digits: 2,
  spike: { at: 15, height: 0.26 },
});
const injection = buildSeries({
  start: 118,
  end: SNAP.injTph,
  wobble: 1.1,
  seed: 11,
  digits: 1,
  dip: { at: 12, depth: 16 },
});
const inletPressure = buildSeries({
  start: 9.32,
  end: SNAP.inletP,
  wobble: 0.03,
  seed: 13,
  digits: 2,
});
const differential = buildSeries({
  start: 0.24,
  end: SNAP.dp,
  wobble: 0.008,
  seed: 17,
  digits: 2,
});
const soil = buildSeries({
  start: 630,
  end: SNAP.soilPpm,
  wobble: 10,
  seed: 19,
  digits: 0,
});
const captureFlow = buildSeries({
  start: 121,
  end: SNAP.captureTph,
  wobble: 0.6,
  seed: 23,
  digits: 1,
  dip: { at: 15, depth: 5 },
});
const pipeFlow = buildSeries({
  start: 119.4,
  end: SNAP.pipeTph,
  wobble: 0.5,
  seed: 29,
  digits: 1,
});
const bufferLevel = buildSeries({
  start: 46,
  end: SNAP.buffer,
  wobble: 0.3,
  seed: 31,
  digits: 0,
});

export const series = {
  captureRate,
  energy,
  injection,
  inletPressure,
  differential,
  soil,
  captureFlow,
  pipeFlow,
  bufferLevel,
};

export type Alert = {
  id: string;
  severity: Severity;
  status: AlertStatus;
  segment: SegmentId;
  title: string;
  summary: string;
  openedAt: string;
  equipment: string;
  reading: string;
  threshold: string;
  likelyCauses: string[];
  nextChecks: string[];
};

export const ALERTS: Alert[] = [
  {
    id: "ALM-2041",
    severity: "critical",
    status: "active",
    segment: "mva",
    title: "GW-07 浅层二氧化碳异常",
    summary:
      "监测井 GW-07 溶解无机碳较基线升高 18%，井周土壤气 CO₂ 1240 ppm，高于背景带 420–480 ppm。",
    openedAt: "10-26 11:26",
    equipment: "GW-07",
    reading: "土壤气 1240 ppm · DIC +18%",
    threshold: "背景带 420–480 ppm",
    likelyCauses: [
      "井口密封或采样管路漏入大气，造成假异常",
      "近井浅层逸散，盖层或固井质量需要复核",
      "相邻点尚未同步升高，暂不像区域性羽流突破",
    ],
    nextChecks: [
      "复测 GW-07，排除采样管路漏气后再谈泄漏",
      "对比 GW-06 与 GW-08 的土壤气和 DIC",
      "核对 IW-03 环空压力是否偏离 4.1 MPa",
      "若相邻井同步升高，再升泄漏分级",
    ],
  },
  {
    id: "ALM-1988",
    severity: "warning",
    status: "active",
    segment: "transport",
    title: "管段 B3 压差持续爬升",
    summary:
      "K18+400 管段 B3 压差 0.42 MPa，高于 7 日基线 0.27 MPa。泄漏风险指数 0.61，超过关注阈 0.45，未到 0.80 关断阈。",
    openedAt: "10-26 09:05",
    equipment: "B3 / VS-04",
    reading: "压差 0.42 MPa · 风险指数 0.61",
    threshold: "关注 0.45 · 关断 0.80",
    likelyCauses: [
      "低洼段积液或温度下降导致密相密度变化",
      "VS-04 阀门开度或引压管漂移",
      "微小泄漏尚未在首末站流量差里放大",
    ],
    nextChecks: [
      "对比 VS-04 上下游压力和温度",
      "核对首站与末站质量流量差",
      "巡线 K18+200 至 K18+600，重点看低洼点",
      "风险指数若超过 0.80，降输并关闭 VS-04",
    ],
  },
  {
    id: "ALM-1972",
    severity: "warning",
    status: "active",
    segment: "capture",
    title: "再生能耗高于目标",
    summary:
      "吸收塔再生能耗 3.15 GJ/t，目标 ≤2.70 GJ/t。再沸器负荷约 104 MW，按目标能耗折合约 89 MW。",
    openedAt: "10-26 06:40",
    equipment: "T-102 / E-103",
    reading: "3.15 GJ/t · 再沸器 104 MW",
    threshold: "目标 ≤2.70 GJ/t",
    likelyCauses: [
      "贫液负荷 0.18 mol/mol 偏低，再生深度偏大",
      "06:00 溶剂过滤器切换后短暂发泡",
      "蒸汽压力波动推高再沸器负荷",
    ],
    nextChecks: [
      "核对贫液、富液负荷化验和在线密度",
      "检查再沸器蒸汽压力与凝液",
      "看过滤器压差是否已经回到切换前",
    ],
  },
  {
    id: "ALM-1955",
    severity: "info",
    status: "acknowledged",
    segment: "storage",
    title: "IW-02 明日恢复热备",
    summary: "注入井 IW-02 计划 10-27 06:00 由检修转热备。今晚 IW-03 继续单井注入。",
    openedAt: "10-25 18:10",
    equipment: "IW-02",
    reading: "检修中 · 计划热备",
    threshold: "切换窗口 06:00",
    likelyCauses: ["计划检修，不是异常停井"],
    nextChecks: ["确认 IW-02 井下压力恢复曲线", "准备切换程序和井口阀门清单"],
  },
  {
    id: "ALM-1866",
    severity: "info",
    status: "cleared",
    segment: "transport",
    title: "压缩机 C-201 振动短时越限",
    summary: "昨日振动短时越过关注值，已复位，当前运行。",
    openedAt: "10-25 16:22",
    equipment: "C-201",
    reading: "已恢复",
    threshold: "振动关注值",
    likelyCauses: ["负荷调整瞬间"],
    nextChecks: ["本班继续看振动趋势即可"],
  },
];

const utilization = (plant.storedMt / plant.permittedMt) * 100;
const captureToPipe = SNAP.captureTph - SNAP.pipeTph;
const pipeToWell = SNAP.pipeTph - SNAP.injTph;

export function utilizationPct() {
  return utilization;
}

export type SegmentModel = {
  id: SegmentId;
  name: string;
  href: "/capture" | "/transport" | "/storage" | "/mva";
  status: ProcessStatus;
  summary: string;
  primary: string;
  kpis: Kpi[];
  charts: ChartSpec[];
  readings: Reading[];
  equipment: Equipment[];
  note?: string;
};

export const SEGMENTS: SegmentModel[] = [
  {
    id: "capture",
    name: "捕集",
    href: "/capture",
    status: "warning",
    summary: "侧线烟气处理正常，捕集率在目标内，再生能耗偏高。",
    primary: formatPct(SNAP.captureRate),
    kpis: [
      {
        label: "捕集率",
        value: formatNum(SNAP.captureRate, 1),
        unit: "%",
        hint: "目标 ≥90%",
        tone: "ok",
      },
      {
        label: "瞬时捕集",
        value: formatNum(SNAP.captureTph, 1),
        unit: "t/h",
        hint: `折合约 ${formatNum((SNAP.captureTph * 24 * 365) / 1e6, 2)} Mt/a`,
        tone: "neutral",
      },
      {
        label: "再生能耗",
        value: formatNum(SNAP.energy, 2),
        unit: "GJ/t",
        hint: `目标 ≤${formatNum(SNAP.energyTarget, 2)}`,
        tone: "warn",
      },
      {
        label: "再沸器负荷",
        value: formatNum(SNAP.reboilerMw, 0),
        unit: "MW",
        hint: "按目标能耗约 89 MW",
        tone: "warn",
      },
    ],
    charts: [
      {
        id: "capture-rate",
        title: "捕集率",
        unit: "%",
        color: "#3ee0c5",
        points: toPoints(captureRate),
        digits: 1,
        reference: { y: 90, label: "目标 90%" },
      },
      {
        id: "energy",
        title: "再生能耗",
        unit: "GJ/t",
        color: "#e8b339",
        points: toPoints(energy),
        digits: 2,
        reference: { y: SNAP.energyTarget, label: "目标 2.70" },
      },
    ],
    readings: [
      { label: "进塔烟气", value: SNAP.flueVol },
      { label: "入口 CO₂", value: `${formatNum(SNAP.inletCo2, 1)} vol%` },
      { label: "出口 CO₂", value: `${formatNum(SNAP.outletCo2, 2)} vol%`, tone: "ok" },
      { label: "贫液负荷", value: `${formatNum(SNAP.lean, 2)} mol/mol`, tone: "warn" },
      { label: "富液负荷", value: `${formatNum(SNAP.rich, 2)} mol/mol` },
      { label: "溶剂", value: plant.solvent },
    ],
    equipment: [
      { tag: "T-101", name: "吸收塔", state: "running", detail: "负荷 94%，压降 6.8 kPa" },
      { tag: "T-102", name: "再生塔", state: "running", detail: "贫液负荷偏低" },
      { tag: "E-103", name: "再沸器", state: "alarm", detail: "104 MW，高于能耗目标对应值" },
      { tag: "P-104", name: "贫液泵", state: "running", detail: "电流稳定" },
      { tag: "B-101", name: "引风机", state: "running", detail: "侧线烟气 52.4 万 Nm³/h" },
    ],
    note: "06:00 溶剂过滤器切换造成捕集率短时跌到约 87%，现已回到 91% 上方。",
  },
  {
    id: "transport",
    name: "运输",
    href: "/transport",
    status: "warning",
    summary: "38 km 密相管输在运。B3 段压差爬升，泄漏指数处于关注区。",
    primary: `${formatNum(SNAP.inletP, 2)} MPa`,
    kpis: [
      {
        label: "首站压力",
        value: formatNum(SNAP.inletP, 2),
        unit: "MPa",
        hint: "压缩机出口 9.62 MPa",
        tone: "neutral",
      },
      {
        label: "末站压力",
        value: formatNum(SNAP.outletP, 2),
        unit: "MPa",
        hint: "密相液相，22.6 ℃",
        tone: "neutral",
      },
      {
        label: "质量流量",
        value: formatNum(SNAP.pipeTph, 1),
        unit: "t/h",
        hint: describeTrend(pipeFlow, 1),
        tone: "neutral",
      },
      {
        label: "泄漏风险指数",
        value: formatNum(SNAP.leak, 2),
        unit: "",
        hint: `关注 ${formatNum(SNAP.leakWatch, 2)} · 关断 ${formatNum(SNAP.leakTrip, 2)}`,
        tone: "warn",
      },
    ],
    charts: [
      {
        id: "inlet-p",
        title: "首站压力",
        unit: "MPa",
        color: "#e8b339",
        points: toPoints(inletPressure),
        digits: 2,
      },
      {
        id: "dp",
        title: "B3 段压差",
        unit: "MPa",
        color: "#ff5d6c",
        points: toPoints(differential),
        digits: 2,
        reference: { y: 0.35, label: "关注 0.35" },
      },
    ],
    readings: [
      { label: "温度", value: `${formatNum(SNAP.tempC, 1)} ℃` },
      { label: "B3 压差", value: `${formatNum(SNAP.dp, 2)} MPa`, tone: "warn" },
      { label: "7 日压差基线", value: `${formatNum(SNAP.dpBaseline, 2)} MPa` },
      { label: "末站缓冲罐", value: `${formatNum(SNAP.buffer, 0)}%`, tone: "neutral" },
      { label: "管径 / 里程", value: "16 in · 38 km" },
      { label: "相态", value: "密相液态 CO₂" },
    ],
    equipment: [
      { tag: "C-201", name: "增压压缩机", state: "running", detail: "出口 9.62 MPa，振动正常" },
      { tag: "PS-1", name: "首站", state: "running", detail: "0 km · 9.40 MPa" },
      { tag: "VS-02", name: "阀室 02", state: "running", detail: "8.2 km · 9.21 MPa" },
      { tag: "VS-04", name: "阀室 04", state: "alarm", detail: "18.4 km · 下游 B3 压差升高" },
      { tag: "TS-1", name: "末站", state: "running", detail: "38 km · 8.72 MPa · 缓冲 51%" },
    ],
    note: "捕集与管输相差约 1.4 t/h，按脱水排气和计量偏差解释；管输高于注入的部分进入末站缓冲罐。",
  },
  {
    id: "storage",
    name: "注入与封存",
    href: "/storage",
    status: "normal",
    summary: "IW-03 单井注入。井口与环空稳定，库容仍有余量。羽流为演示地质模型。",
    primary: `${formatNum(SNAP.injTph, 1)} t/h`,
    kpis: [
      {
        label: "注入速率",
        value: formatNum(SNAP.injTph, 1),
        unit: "t/h",
        hint: describeTrend(injection, 1),
        tone: "ok",
      },
      {
        label: "井口压力",
        value: formatNum(SNAP.whp, 1),
        unit: "MPa",
        hint: `井底 ${formatNum(SNAP.bhp, 1)} MPa`,
        tone: "neutral",
      },
      {
        label: "库容利用率",
        value: formatNum(utilization, 1),
        unit: "%",
        hint: `${formatNum(plant.storedMt, 2)} / ${formatNum(plant.permittedMt, 1)} Mt`,
        tone: "ok",
      },
      {
        label: "羽流前缘",
        value: formatNum(SNAP.plumeM, 0),
        unit: "m",
        hint: "演示模型，不是反演",
        tone: "neutral",
      },
    ],
    charts: [
      {
        id: "injection",
        title: "注入速率",
        unit: "t/h",
        color: "#79b8ff",
        points: toPoints(injection),
        digits: 1,
      },
    ],
    readings: [
      { label: "IW-03 井口", value: `${formatNum(SNAP.whp, 1)} MPa`, tone: "ok" },
      { label: "IW-03 井底", value: `${formatNum(SNAP.bhp, 1)} MPa` },
      { label: "环空压力", value: `${formatNum(SNAP.annulus, 1)} MPa`, tone: "ok" },
      { label: "已封存", value: `${formatNum(plant.storedMt, 2)} Mt` },
      { label: "许可容量", value: `${formatNum(plant.permittedMt, 1)} Mt` },
      { label: "盖层", value: "完整性正常（演示）", tone: "ok" },
    ],
    equipment: [
      { tag: "IW-03", name: "注入井", state: "running", detail: "承担全部注入" },
      { tag: "IW-02", name: "注入井", state: "maintenance", detail: "检修，明日 06:00 热备" },
      { tag: "IW-01", name: "注入井", state: "standby", detail: "关井，井下压力 17.9 MPa" },
    ],
    note: "羽流半径来自演示地质模型，不能当作实测反演。03:00 有过一次注入低点，对应井切换准备。",
  },
  {
    id: "mva",
    name: "MVA 监测",
    href: "/mva",
    status: "critical",
    summary: "微地震仍是背景。GW-07 土壤气和 DIC 越出背景带，是当前唯一红色测点。",
    primary: "GW-07",
    kpis: [
      {
        label: "传感器在线",
        value: "23/24",
        hint: "1 路异常，无离线",
        tone: "warn",
      },
      {
        label: "微地震",
        value: formatNum(SNAP.microseismicPerDay, 1),
        unit: "次/日",
        hint: `背景水平，最大 M ${formatNum(SNAP.microseismicMag, 1)}`,
        tone: "ok",
      },
      {
        label: "GW-07 土壤气",
        value: formatNum(SNAP.soilPpm, 0),
        unit: "ppm",
        hint: `背景 ${SNAP.soilLow}–${SNAP.soilHigh}`,
        tone: "alarm",
      },
      {
        label: "InSAR",
        value: "−2.1",
        unit: "mm/年",
        hint: "沉降在预期内",
        tone: "ok",
      },
    ],
    charts: [
      {
        id: "soil",
        title: "GW-07 土壤气 CO₂",
        unit: "ppm",
        color: "#ff5d6c",
        points: toPoints(soil),
        digits: 0,
        reference: { y: 480, label: "背景上限 480" },
      },
    ],
    readings: [
      { label: "DIC 偏离", value: `+${SNAP.dicDelta}%`, tone: "alarm" },
      { label: "大气本底站", value: "428 ppm", tone: "ok" },
      { label: "GW-04 土壤气", value: "560 ppm", tone: "warn" },
      { label: "压力计 P-12", value: "正常", tone: "ok" },
      { label: "台站", value: "12/12 在线", tone: "ok" },
      { label: "地下水井", value: "8 口，1 口异常", tone: "alarm" },
    ],
    equipment: [
      { tag: "GW-07", name: "地下水 / 土壤气", state: "alarm", detail: "1240 ppm，DIC +18%" },
      { tag: "GW-04", name: "土壤气", state: "running", detail: "560 ppm，接近背景上限，未立案" },
      { tag: "GW-06", name: "土壤气", state: "running", detail: "450 ppm，背景内" },
      { tag: "SA-12", name: "微地震台阵", state: "running", detail: `${formatNum(SNAP.microseismicPerDay, 1)} 次/日` },
      { tag: "P-12", name: "井下压力", state: "running", detail: "无越限" },
    ],
    note: "GW-04 的 560 ppm 只作观察，正式告警仍是 ALM-2041。",
  },
];

export function getSegment(id: SegmentId) {
  const segment = SEGMENTS.find((item) => item.id === id);
  if (!segment) {
    throw new Error(`unknown segment ${id}`);
  }
  return segment;
}

export function alertsFor(segment?: SegmentId, status?: AlertStatus | "all") {
  return ALERTS.filter((alert) => {
    if (segment && alert.segment !== segment) return false;
    if (status && status !== "all" && alert.status !== status) return false;
    return true;
  });
}

export function activeAlerts() {
  return ALERTS.filter((alert) => alert.status === "active");
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function sortedAlerts(alerts: Alert[]) {
  return [...alerts].sort((a, b) => {
    const statusRank = Number(a.status !== "active") - Number(b.status !== "active");
    if (statusRank !== 0) return statusRank;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });
}

export function overallStatus(): ProcessStatus {
  if (SEGMENTS.some((segment) => segment.status === "critical")) return "critical";
  if (SEGMENTS.some((segment) => segment.status === "warning")) return "warning";
  return "normal";
}

export function dutyRecommendations() {
  return sortedAlerts(activeAlerts())
    .slice(0, 3)
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      text: alert.nextChecks[0] ?? alert.summary,
    }));
}

export function massBalance() {
  return {
    captureTph: SNAP.captureTph,
    pipeTph: SNAP.pipeTph,
    injTph: SNAP.injTph,
    captureToPipe,
    pipeToWell,
    buffer: SNAP.buffer,
    bufferTrend: describeTrend(bufferLevel, 0),
  };
}

export function overviewChart() {
  return HOUR_LABELS.map((t, i) => ({
    t,
    capture: captureRate[i] ?? 0,
    injection: injection[i] ?? 0,
  }));
}

export function explainPrompt(alertId: string) {
  const alert = ALERTS.find((item) => item.id.toLowerCase() === alertId.toLowerCase());
  if (!alert) return `解释告警 ${alertId}。说明读数、同工段情况和建议核查。`;
  return `解释告警 ${alert.id}（${alert.title}）。说明读数、同工段情况和建议核查。`;
}

export function assessmentDraft(alertId?: string) {
  const alert = alertId
    ? ALERTS.find((item) => item.id.toLowerCase() === alertId.toLowerCase())
    : undefined;
  const base = [
    `${plant.name}（${plant.site}），设计捕集 ${plant.designCaptureMtA.toFixed(1)} Mt/a，`,
    `${plant.storage}，许可封存 ${plant.permittedMt} Mt，已封存 ${plant.storedMt} Mt。`,
    `快照 ${plant.asOfLabel}：捕集率 ${SNAP.captureRate}% ，瞬时捕集 ${SNAP.captureTph} t/h，`,
    `再生能耗 ${SNAP.energy} GJ/t（目标 ≤${SNAP.energyTarget}）。`,
    `${plant.pipelineKm} km 密相管输，首站 ${SNAP.inletP} MPa，末站 ${SNAP.outletP} MPa，流量 ${SNAP.pipeTph} t/h；`,
    `管段 B3（K18+400）压差 ${SNAP.dp} MPa，泄漏风险指数 ${SNAP.leak}。`,
    `注入井 IW-03 速率 ${SNAP.injTph} t/h，井口 ${SNAP.whp} MPa，井底 ${SNAP.bhp} MPa；评估时按储层埋深 2100 m。`,
    `MVA：GW-07 土壤气 CO₂ ${SNAP.soilPpm} ppm（背景 ${SNAP.soilLow}–${SNAP.soilHigh}），溶解无机碳较基线 +${SNAP.dicDelta}%。`,
  ].join("");
  if (!alert) {
    return `${base}\n\n请评估运输段泄漏迹象和浅层 CO₂ 异常是否构成封存完整性问题，并指出应先核查的测点。`;
  }
  return `${base}\n\n请重点评估告警 ${alert.id}：${alert.title}。${alert.summary}`;
}
