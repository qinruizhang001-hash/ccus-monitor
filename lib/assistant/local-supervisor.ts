import type { UIMessage, UIMessageStreamWriter } from "ai";
import { groundingCheck, type GroundingCitation } from "@/lib/assistant/grounding";
import type { SkillName } from "@/lib/assistant/skill-labels";
import {
  ccusResearchNotes,
  checkBackendHealth,
  draftOpsReport,
  draftShiftHandover,
  explainAlert,
  getOverview,
  getSegmentMetrics,
  listAlerts,
  readContainment,
  readMassBalance,
  readPlumeDemo,
  readTransportIntegrity,
  streamRiskAssessment,
} from "@/lib/assistant/skills";
import { assessmentDraft, type SegmentId } from "@/lib/telemetry";

type SkillCall = { skill: SkillName; input: Record<string, unknown> };

const SEGMENT_WORDS: Array<{ id: SegmentId; pattern: RegExp }> = [
  { id: "capture", pattern: /捕集|吸收塔|再生能耗|再沸器/ },
  { id: "transport", pattern: /运输|管段|管输|首站|末站|泄漏风险指数|B3/ },
  { id: "storage", pattern: /注入|封存|井口|井底|库容|IW-0/ },
  { id: "mva", pattern: /MVA|监测井|土壤气|微地震|GW-07/i },
];

function lastUserText(messages: UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const fromParts = parts
      .filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (fromParts) return fromParts;
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }
  return "";
}

function researchQuery(text: string) {
  if (/27914/.test(text)) return "27914";
  if (/27913/.test(text)) return "27913";
  if (/Z741|CSA/i.test(text)) return "Z741";
  if (/Class VI|Subpart H|\b146\b/.test(text)) return "146";
  if (/NETL|1847/.test(text)) return "NETL";
  if (/IPCC/.test(text)) return "IPCC";
  if (/超临界|密相/.test(text)) return "密相";
  if (/井完整性|机械完整/.test(text)) return "完整性";
  if (/225861|数字孪生/.test(text)) return "225861";
  if (/Nordbotten|羽流解析|体积衡算/i.test(text)) return "Nordbotten";
  if (/MVA/i.test(text)) return "MVA";
  if (/监测/.test(text)) return "监测";
  return "";
}

function detectSegment(text: string): SegmentId | null {
  const hit = SEGMENT_WORDS.find((item) => item.pattern.test(text));
  return hit?.id ?? null;
}

export function planSkills(text: string): SkillCall[] {
  const alertId = text.match(/ALM-\d+/i)?.[0]?.toUpperCase();
  const wantsHealth = /健康|是否在线|在不在|连上|离线|ollama|评估服务|后端/i.test(text);
  const wantsReport = /简报|日报|值班小结|值班报告/.test(text);
  const wantsExplain = Boolean(alertId) && /解释|说明|原因|核查|为什么|告警/.test(text);
  const wantsAlerts = /告警/.test(text) && !wantsExplain;
  const severity = /严重/.test(text) ? "critical" : /警告/.test(text) ? "warning" : /提示级|提示告警|信息级/.test(text) ? "info" : undefined;
  const wantsRisk =
    /风险评估|封存风险|物理闸门|analyze/i.test(text) ||
    (/完整性/.test(text) && !/标准|ISO|CSA|知识卡|监测概念/.test(text)) ||
    (/评估/.test(text) && !/评估服务/.test(text));
  const segment = detectSegment(text);
  const wantsSegment = Boolean(segment) && /指标|工况|怎么样|多少|能耗|压力|注入速率|捕集率|土壤气/.test(text);
  const wantsOverview = /总览|全流程|概况|现在什么|当前工况|整体|什么情况/.test(text);
  const wantsResearch = /标准|ISO|CSA|知识卡|文献|监测概念|Class VI|NETL|IPCC|超临界|密相|井完整性|Nordbotten|数字孪生|225861/i.test(text);
  const wantsMass = /质量衡算|物料平衡|管存|不平衡/.test(text);
  const wantsHandover = /交接班|交接记录|交班/.test(text);
  const wantsContainment = /遏制|上方压力|盖层上方|一次屏障|二次屏障|三次屏障|环空差/.test(text);
  const wantsTransportOps = /ESD|阀室|管完整|泄漏风险指数/.test(text);
  const wantsPlume = /羽流|压力足迹|教学模型/.test(text);

  const calls: SkillCall[] = [];
  if (wantsHealth) calls.push({ skill: "check_backend_health", input: {} });
  if (wantsReport) calls.push({ skill: "draft_ops_report", input: {} });
  if (wantsExplain && alertId) calls.push({ skill: "explain_alert", input: { alert_id: alertId } });
  if (wantsAlerts) {
    calls.push({
      skill: "list_alerts",
      input: {
        status: /全部|历史|已恢复|已确认/.test(text) ? "all" : "active",
        ...(severity ? { severity } : {}),
        ...(segment ? { segment } : {}),
      },
    });
  }
  if (wantsSegment && segment && !wantsRisk) {
    calls.push({ skill: "get_segment_metrics", input: { segment } });
  }
  if (wantsMass) calls.push({ skill: "get_mass_balance", input: {} });
  if (wantsContainment) calls.push({ skill: "get_containment_status", input: {} });
  if (wantsTransportOps) calls.push({ skill: "get_transport_integrity", input: {} });
  if (wantsPlume) calls.push({ skill: "get_plume_demo", input: {} });
  if (wantsHandover) calls.push({ skill: "draft_shift_handover", input: {} });
  if (wantsResearch) {
    const query = researchQuery(text);
    calls.push({
      skill: "ccus_research_notes",
      input: {
        ...(segment ? { segment } : {}),
        ...(query ? { query } : {}),
      },
    });
  }
  if (wantsOverview || (calls.length === 0 && !wantsResearch)) calls.push({ skill: "get_overview", input: {} });
  if (wantsRisk) {
    const description = text.length > 80 ? text : `${text}\n\n${assessmentDraft(alertId)}`;
    calls.push({ skill: "run_risk_assessment", input: { project_description: description } });
  }
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.skill}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runSkill(call: SkillCall) {
  switch (call.skill) {
    case "get_overview":
      return getOverview();
    case "get_segment_metrics":
      return getSegmentMetrics(String(call.input.segment ?? ""));
    case "list_alerts":
      return listAlerts(
        call.input as {
          status?: "active" | "acknowledged" | "cleared" | "all";
          segment?: SegmentId;
          severity?: "critical" | "warning" | "info" | "all";
        },
      );
    case "explain_alert":
      return explainAlert(String(call.input.alert_id ?? ""));
    case "check_backend_health":
      return checkBackendHealth();
    case "draft_ops_report":
      return draftOpsReport();
    case "draft_shift_handover":
      return draftShiftHandover();
    case "get_mass_balance":
      return readMassBalance();
    case "get_containment_status":
      return readContainment();
    case "get_transport_integrity":
      return readTransportIntegrity();
    case "get_plume_demo":
      return readPlumeDemo();
    case "ccus_research_notes":
      return ccusResearchNotes({
        segment: typeof call.input.segment === "string" ? call.input.segment : undefined,
        id: typeof call.input.id === "string" ? call.input.id : undefined,
        query: typeof call.input.query === "string" ? call.input.query : undefined,
      });
    default:
      return {
        skill: call.skill,
        ok: false,
        source: "依据核对",
        as_of: "",
        confidence: "unknown" as const,
        snapshot_id: "none",
        summary: "未知/需接入数据源。没有这项技能。",
      };
  }
}

function compose(results: Array<{ skill?: string; summary?: string }>) {
  const lines = results
    .map((result) => (typeof result.summary === "string" ? result.summary : ""))
    .filter(Boolean);
  if (lines.length === 0) return "这次没有拿到技能结果。未知/需接入数据源。";
  return lines.join("\n\n");
}

function citationsFrom(results: unknown[]): GroundingCitation[] {
  const citations: GroundingCitation[] = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const row = result as {
      skill?: string;
      source?: string;
      as_of?: string;
      snapshot_id?: string;
      snapshots?: Array<{ source?: string; as_of?: string; snapshot_id?: string }>;
    };
    const listed = [
      ...(row.snapshot_id && row.source
        ? [{ source: row.source, as_of: row.as_of ?? "", snapshot_id: row.snapshot_id }]
        : []),
      ...(Array.isArray(row.snapshots) ? row.snapshots : []),
    ];
    for (const item of listed) {
      if (!item.snapshot_id || !item.source) continue;
      if (citations.some((citation) => citation.snapshot_id === item.snapshot_id && citation.skill === row.skill)) continue;
      citations.push({
        skill: typeof row.skill === "string" ? row.skill : undefined,
        source: item.source,
        as_of: item.as_of ?? "",
        snapshot_id: item.snapshot_id,
      });
    }
  }
  return citations;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLocalSupervisor(
  writer: UIMessageStreamWriter,
  messages: UIMessage[],
  signal?: AbortSignal,
) {
  const text = lastUserText(messages);
  const calls = text ? planSkills(text) : [{ skill: "get_overview" as const, input: {} }];
  writer.write({ type: "start" });
  writer.write({ type: "start-step" });
  const results = [];
  for (const [index, call] of calls.entries()) {
    if (signal?.aborted) break;
    const toolCallId = `local_${index}_${call.skill}`;
    writer.write({
      type: "tool-input-available",
      toolCallId,
      toolName: call.skill,
      input: call.input,
    });
    if (call.skill === "run_risk_assessment") {
      let last: { summary?: string } | null = null;
      try {
        for await (const snapshot of streamRiskAssessment(String(call.input.project_description ?? ""), signal)) {
          last = snapshot;
          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: snapshot,
            preliminary: snapshot.phase === "running",
          });
        }
      } catch (error) {
        last = {
          summary: error instanceof Error ? error.message : "风险评估没有完成。",
        };
        writer.write({ type: "tool-output-available", toolCallId, output: last });
      }
      results.push(last ?? { summary: "风险评估没有返回。" });
      continue;
    }
    const output = await runSkill(call);
    results.push(output);
    writer.write({ type: "tool-output-available", toolCallId, output });
  }
  const draft = compose(results);
  const citations = citationsFrom(results);
  const grounded = groundingCheck(draft, {
    toolsUsed: results.length > 0,
    citations,
    evidenceText: JSON.stringify(results),
  });
  writer.write({
    type: "tool-input-available",
    toolCallId: "local_grounding",
    toolName: "grounding_check",
    input: { cited: citations.length },
  });
  writer.write({ type: "tool-output-available", toolCallId: "local_grounding", output: grounded });
  const reply = grounded.answer;
  const textId = "local-reply";
  writer.write({ type: "text-start", id: textId });
  for (let index = 0; index < reply.length; index += 24) {
    if (signal?.aborted) break;
    writer.write({ type: "text-delta", id: textId, delta: reply.slice(index, index + 24) });
    await delay(8);
  }
  writer.write({ type: "text-end", id: textId });
  writer.write({ type: "finish-step" });
  writer.write({ type: "finish", finishReason: "stop" });
}
