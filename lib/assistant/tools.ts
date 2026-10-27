import { tool } from "ai";
import { z } from "zod";
import { groundingCheck } from "@/lib/assistant/grounding";
import {
  ccusResearchNotes,
  checkBackendHealth,
  draftOpsReport,
  draftShiftHandover,
  readContainment,
  readMassBalance,
  readPlumeDemo,
  readTransportIntegrity,
  explainAlert,
  getOverview,
  getSegmentMetrics,
  listAlerts,
  streamRiskAssessment,
} from "@/lib/assistant/skills";

const segmentSchema = z.enum(["capture", "transport", "storage", "mva"]).describe(
  "工段。capture 捕集，transport 运输，storage 注入与封存，mva 监测",
);

export const supervisorTools = {
  get_overview: tool({
    description:
      "读取渤西 CCUS 示范工程当前演示遥测总览：全流程状态、KPI、质量平衡、各工段一句话、活跃告警。数字只来自这个技能，不要凭记忆编造。",
    inputSchema: z.object({}),
    execute: async () => getOverview(),
  }),
  get_segment_metrics: tool({
    description: "读取某一个工段的 KPI、测点、设备和备注。问捕集、运输、注入封存或 MVA 的具体数字时调用。",
    inputSchema: z.object({ segment: segmentSchema }),
    execute: async ({ segment }) => getSegmentMetrics(segment),
  }),
  list_alerts: tool({
    description: "列出告警。可按严重级别、状态和工段筛选。解释某一条具体告警时改用 explain_alert。",
    inputSchema: z.object({
      status: z.enum(["active", "acknowledged", "cleared", "all"]).optional().describe("默认 all"),
      severity: z.enum(["critical", "warning", "info", "all"]).optional().describe("严重 critical，警告 warning，提示 info"),
      segment: segmentSchema.optional(),
    }),
    execute: async (input) => listAlerts(input),
  }),
  explain_alert: tool({
    description:
      "按告警编号解释一条告警：读数与阈值、工段现状、近几小时趋势、同工段其他告警、不该过度推断的边界，以及建议核查。编号形如 ALM-2041。",
    inputSchema: z.object({
      alert_id: z
        .string()
        .regex(/^ALM-\d+$/i, "告警编号形如 ALM-2041")
        .describe("告警编号，例如 ALM-2041"),
    }),
    execute: async ({ alert_id }) => explainAlert(alert_id),
  }),
  run_risk_assessment: tool({
    description:
      "把项目描述转发给 petro-rag-agent 的 POST /api/analyze。只转述返回字段，不补物理机理。失败或离线时原样转述 summary。流式 thread_id 不能批准。",
    inputSchema: z.object({
      project_description: z
        .string()
        .trim()
        .min(8, "描述至少 8 个字")
        .max(8000, "描述不能超过 8000 字")
        .describe("用户给出的项目或工况描述。保留压力、井深和告警，不要补充未给出的地质参数。过短会被拒绝。"),
    }),
    execute: async function* ({ project_description }, options) {
      yield* streamRiskAssessment(project_description, options.abortSignal);
    },
  }),
  check_backend_health: tool({
    description: "探测 petro-rag-agent 是否可达。调用 GET /health（必要时再试 /api/health）。问评估服务、Ollama 或后端是否在线时调用。",
    inputSchema: z.object({}),
    execute: async () => checkBackendHealth(),
  }),
  draft_ops_report: tool({
    description: "用当前演示 KPI 和告警在本地写一份中文值班日报，并给出可下载的 Markdown。不调用别的模型，也不连接 petro-rag-agent。日报不能代替持证工程师签字。",
    inputSchema: z.object({}),
    execute: async () => draftOpsReport(),
  }),
  get_mass_balance: tool({
    description:
      "读取演示质量衡算：滚动捕集、管存、滚动注入、快照已封存、不平衡百分比。累计注入计量表若快照没有，必须写未知/需接入数据源。不要把不平衡写成泄漏量。",
    inputSchema: z.object({}),
    execute: async () => readMassBalance(),
  }),
  get_containment_status: tool({
    description:
      "读取遏制盘：环空/油管、盖层上方压力、微地震、土壤气、地下水。屏障语言只使用一次井筒、二次盖层、三次监测。监测告警不是盖层失效结论。",
    inputSchema: z.object({}),
    execute: async () => readContainment(),
  }),
  get_transport_integrity: tool({
    description:
      "读取运输完整性：首末站压力、管存、ESD/阀室演示状态、泄漏风险指数。指数和阈值只来自快照。没有分计质量流量时，进出口质量差写未知/需接入数据源。",
    inputSchema: z.object({}),
    execute: async () => readTransportIntegrity(),
  }),
  get_plume_demo: tool({
    description:
      "读取教学羽流半径。只转述 demo-radial-volume 公式、假设和情景。不要把它说成油藏模拟器或现场反演。压力足迹若为 null，写未知/需接入数据源。SNAP.plumeM 是另一套演示读数。",
    inputSchema: z.object({}),
    execute: async () => readPlumeDemo(),
  }),
  draft_shift_handover: tool({
    description:
      "写交接班 Markdown：未关闭严重告警、待处理 HITL、质量衡算、遏制、运输、教学羽流和评估服务健康。必须声明这不是监管报送，也不能代替持证工程师签字。",
    inputSchema: z.object({}),
    execute: async () => draftShiftHandover(),
  }),
  ccus_research_notes: tool({
    description:
      "只读仓库里的 CCUS 知识卡。返回 title、year、standard_id、doi（没有则为 null）和一两句 takeaway。不要凭记忆补充 DOI、论文或法规。没有对上的条目就说未知/需接入数据源。",
    inputSchema: z.object({
      segment: segmentSchema.optional().describe("只看与该工段有关的卡片"),
      id: z.string().optional().describe("知识卡 id 或标准号"),
      query: z.string().optional().describe("在标题、标准号和要点里查找的短词，例如 27914 或 密相"),
    }),
    execute: async (input) => ccusResearchNotes(input),
  }),
  grounding_check: tool({
    description:
      "回答出口前调用。draft 是准备说的话，evidence 必须是本轮技能 JSON 原文。返回的 answer 才是可以对用户说的正文。技能没返回的数字、井号、标准号和 DOI 会被改成未知/需接入数据源。",
    inputSchema: z.object({
      draft: z.string().trim().min(1).max(12000).describe("准备对值班员说的草稿"),
      evidence: z.string().max(50000).optional().describe("本轮技能返回的 JSON 原文，不要自己编造数字填进来"),
    }),
    execute: async ({ draft, evidence }) => {
      const citations = citationsFromEvidence(evidence);
      return groundingCheck(draft, {
        toolsUsed: Boolean(evidence && evidence.trim().length >= 20),
        evidenceText: evidence,
        citations,
      });
    },
  }),
};

function citationsFromEvidence(evidence: string | undefined) {
  if (!evidence) return [];
  const ids = [...evidence.matchAll(/"snapshot_id"\s*:\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
  const sources = [...evidence.matchAll(/"source"\s*:\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
  const times = [...evidence.matchAll(/"as_of"\s*:\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
  const skills = [...evidence.matchAll(/"skill"\s*:\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
  const unique = [...new Set(ids.filter(Boolean))];
  return unique.map((snapshot_id) => {
    const index = ids.indexOf(snapshot_id);
    return {
      skill: skills[index] || undefined,
      source: sources[index] || sources[0] || "技能",
      as_of: times[index] || times[0] || "",
      snapshot_id,
    };
  });
}
