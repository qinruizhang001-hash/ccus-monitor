import type { PetroResult } from "@/lib/petro/types";

export type MockThread = {
  input: string;
  rejections: number;
  finished: boolean;
  report: string;
  blocking: boolean;
};

const threads = new Map<string, MockThread>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sseFrame(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function isBlockingCase(input: string) {
  return /400\s*bar|40\s*MPa|超破裂|压裂盖层/.test(input);
}

export function mockReport(userInput: string, blocking: boolean) {
  const excerpt = userInput.replace(/\s+/g, " ").trim().slice(0, 90);
  if (blocking) {
    return [
      "### 评估已阻断（演示流）",
      "",
      "物理闸门否决：描述中的注入压力高于脚本假设的破裂压力。正文已隔离，不能当作可交付结论。",
      "",
      "这是 PETRO_RAG_MOCK 演示流，不是 petro-rag-agent 的模型输出。",
    ].join("\n");
  }
  return [
    "### 风险评估报告（演示流）",
    "",
    "> 这是 PETRO_RAG_MOCK 演示流，不是 petro-rag-agent 的推理结果。数字来自本站 14:40 监测快照，用来把界面和字段走通。",
    "",
    `**对象摘录**：${excerpt || "（未填写）"}`,
    "",
    "**结论**：井底压力低于脚本中的静水压力，物理校验未阻断。浅层 CO₂ 与管段压差需要先核查，再决定是否降输。",
    "",
    "1. 井底 18.6 MPa（186 bar）对比埋深 2100 m 的静水压力约 212 bar、破裂压力约 318 bar。低于破裂限，也低于地层压力，表现为注入偏难，不是超压。",
    "2. 管段 B3 压差 0.42 MPa，泄漏风险指数 0.61，未到 0.80 的关断演示阈。",
    "3. GW-07 土壤气 1240 ppm，高于背景 420–480 ppm。先复测，再谈盖层失效。",
    "",
    "**建议先核查**",
    "- 复测 GW-07，并对比 GW-06 / GW-08",
    "- 核对 VS-04 上下游压力与首末站流量差",
    "- 查看 IW-03 环空压力是否仍在 4.1 MPa 附近",
  ].join("\n");
}

export function mockResult(userInput: string, blocking = isBlockingCase(userInput)): PetroResult {
  const report = mockReport(userInput, blocking);
  return {
    status: blocking ? "failed" : "success",
    gate_status: blocking ? "failed" : "success",
    report,
    score: blocking ? null : 8,
    extracted_params: "演示提取：埋深 2100 m，井底 186 bar，温度未单列，断层/浅层异常见 GW-07。",
    model_routing: {
      extract: "mock:demo",
      report: "mock:demo",
      evaluate: "mock:demo",
    },
    chart: {
      rel_path: "charts/mock_pressure_curve.svg",
      summary: blocking
        ? "演示曲线：输入被脚本判为超破裂，图仅作界面占位。"
        : "演示曲线：2100 m 处井底 186 bar，静水约 212 bar，破裂约 318 bar。",
      verdict: blocking ? "above_fracture" : "under",
    },
    physics_check: blocking
      ? {
          status: "fail",
          blocking: true,
          verdict: "above_fracture",
          rules_version: "mock",
          summary: "演示规则：输入命中超破裂关键词，闸门阻断。",
          checks: [
            { code: "pressure_vs_fracture", ok: false, detail: "演示：注入压力高于破裂压力" },
          ],
          violations: ["演示：压力超过破裂限"],
        }
      : {
          status: "pass",
          blocking: false,
          verdict: "under",
          rules_version: "mock",
          summary: "注入压力 186 bar < 2100 m 处地层压力约 212 bar（注入困难），且低于破裂压力约 318 bar。",
          params: { depth_m: 2100, bottomhole_pressure_bar: 186 },
          limits: { hydrostatic_bar: 212.2, fracture_bar: 318.3 },
          violations: [],
          checks: [
            {
              code: "pressure_vs_fracture",
              ok: true,
              detail: "P_bh 186 bar ≤ P_frac 318 bar",
            },
            {
              code: "pressure_vs_hydrostatic",
              ok: false,
              detail: "P_bh 186 bar < P_h 212 bar（注入困难）",
            },
          ],
        },
    quality_gate: blocking
      ? {
          status: "failed",
          reason: "演示流：物理否决，正文已隔离",
          quarantined: true,
        }
      : {
          status: "passed",
          reason: "演示流：未阻断",
          quarantined: false,
        },
    risk_decision: {
      level: blocking ? "alert" : "alert",
      level_label: "告警",
      triggered: true,
      resolved: false,
      label: blocking ? "盖层破裂" : "浅层逸散",
      p: blocking ? 0.64 : 0.22,
      p_ci: blocking ? [0.54, 0.73] : [0.15, 0.31],
      n: 100,
      rule: "演示阈值：≥20% 告警；≥5% 提示。不是 petro-rag-agent 的 UQ 引擎。",
      notes: ["概率是脚本写死的，只为展示告警徽标，不能当作封存决策。"],
      text: blocking
        ? "告警：演示用例被物理闸门阻断。"
        : "告警：P(浅层逸散)=22.0%（95% 区间 15.0%–31.0%，演示样本）达到告警阈值 20%。",
    },
    uq: {
      note: "演示流没有跑蒙特卡洛。",
    },
    human_review: {
      required: true,
      approved: null,
      auto: false,
      reviewer: "",
      comment: "演示流不会自动批准。要放行必须另开 HITL 线程。",
      rejections: 0,
      max_rejections: 2,
    },
    cost_estimation: {
      currency: "CNY",
      total_cny: 0,
      caption: "演示流不计费，也没有调用 Ollama。",
    },
    elapsed_s: 1.6,
  };
}

const NODE_SCRIPT = [
  { node: "extract", label: "提取 CCUS 关键参数" },
  { node: "geology", label: "地质分支：图谱检索断层 / 盖层" },
  { node: "wellbore", label: "井筒分支：文献检索套管 / 压力异常" },
  { node: "aggregate", label: "汇总两路结论并成稿" },
  { node: "evaluate", label: "质量闸门" },
];

export function mockAnalyzeStream(userInput: string) {
  const blocking = isBlockingCase(userInput);
  const result = mockResult(userInput, blocking);
  const encoder = new TextEncoder();
  const report = result.report ?? "";
  const chunks: string[] = [];
  for (let i = 0; i < report.length; i += 12) {
    chunks.push(report.slice(i, i + 12));
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(sseFrame(payload)));
      };
      let t = 40;
      try {
        for (const node of NODE_SCRIPT) {
          send({ type: "node", node: node.node, label: node.label, status: "start", t });
          await delay(70);
          t += 90;
          send({ type: "node", node: node.node, label: node.label, status: "end", t });
        }
        send({ type: "uq", uq: result.uq });
        send({ type: "chart", chart: result.chart });
        for (const text of chunks) {
          send({ type: "token", text, stage: "report" });
          await delay(16);
        }
        send({
          type: "done",
          ...result,
          report,
          thread_id: `analyze_mock_${Date.now().toString(36)}`,
        });
        controller.close();
      } catch {
        controller.close();
      }
    },
  });
}

function reviewPayload(thread: MockThread, threadId: string, pending: boolean): PetroResult {
  const result = mockResult(thread.input, thread.blocking);
  return {
    ...result,
    thread_id: threadId,
    status: pending ? "awaiting_approval" : thread.blocking ? "failed" : "success",
    report: thread.report,
    human_review: {
      required: true,
      approved: pending ? null : true,
      auto: false,
      reviewer: pending ? "" : "值班长",
      comment: "",
      rejections: thread.rejections,
      max_rejections: 2,
    },
    history_entry: pending ? "" : "演示流：已人工确认，未写入 petro-rag-agent 的 project_history。",
  };
}

export function mockStartHitl(userInput: string) {
  const blocking = isBlockingCase(userInput);
  const threadId = `hitl_mock_${Date.now().toString(36)}`;
  const thread: MockThread = {
    input: userInput,
    rejections: 0,
    finished: false,
    report: mockReport(userInput, blocking),
    blocking,
  };
  threads.set(threadId, thread);
  return reviewPayload(thread, threadId, true);
}

export function mockRestore(opts: {
  id: string;
  input: string;
  rejections: number;
  finished: boolean;
  blocking: boolean;
}) {
  threads.set(opts.id, {
    input: opts.input,
    rejections: opts.rejections,
    finished: opts.finished,
    report: mockReport(opts.input, opts.blocking),
    blocking: opts.blocking,
  });
}

export function mockGetReview(threadId: string) {
  const thread = threads.get(threadId);
  if (!thread) return null;
  return reviewPayload(thread, threadId, !thread.finished);
}

export function mockApprove(input: {
  thread_id: string;
  approved: boolean;
  reviewer?: string;
  comment?: string;
}): { status: number; body: PetroResult | { detail: string } } {
  const thread = threads.get(input.thread_id);
  if (!thread) {
    return { status: 404, body: { detail: `未找到 thread_id=${input.thread_id}` } };
  }
  if (thread.finished) {
    return { status: 409, body: { detail: "该 thread 已经结束，不能再次审核" } };
  }
  if (!input.approved && thread.rejections >= 2) {
    return {
      status: 429,
      body: { detail: "已达到人工驳回上限（2 次）。请直接通过，或重新发起评估。" },
    };
  }
  if (!input.approved) {
    thread.rejections += 1;
    thread.report = [
      `> 已按审核意见重写（演示，第 ${thread.rejections} 次）：${input.comment || "未填写意见"}`,
      "",
      thread.report,
    ].join("\n");
    const body = reviewPayload(thread, input.thread_id, true);
    body.note = "报告已按审核意见重写，请再次确认";
    body.human_review = {
      ...body.human_review,
      comment: input.comment || "",
      reviewer: input.reviewer || "",
    };
    return { status: 200, body };
  }
  thread.finished = true;
  const body = reviewPayload(thread, input.thread_id, false);
  body.human_review = {
    ...body.human_review,
    approved: true,
    auto: false,
    reviewer: input.reviewer || "值班长",
    comment: input.comment || "",
  };
  return { status: 200, body };
}

export function mockPressureSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <rect width="640" height="360" fill="#0e1620"/>
  <text x="24" y="32" fill="#93a4b8" font-size="13" font-family="sans-serif">演示压力曲线 · 非现场图</text>
  <text x="24" y="52" fill="#e7eef6" font-size="16" font-family="sans-serif">埋深增加方向向下 · 2100 m 工作点</text>
  <line x1="70" y1="70" x2="70" y2="320" stroke="#243244"/>
  <line x1="70" y1="320" x2="600" y2="320" stroke="#243244"/>
  <polyline fill="none" stroke="#79b8ff" stroke-width="2" points="90,300 220,240 360,180 520,110"/>
  <polyline fill="none" stroke="#ff5d6c" stroke-width="2" points="120,300 250,230 390,160 560,90"/>
  <circle cx="360" cy="210" r="6" fill="#3ee0c5"/>
  <text x="372" y="206" fill="#3ee0c5" font-size="12" font-family="sans-serif">井底 186 bar</text>
  <text x="80" y="344" fill="#93a4b8" font-size="12" font-family="sans-serif">蓝：静水压力　红：破裂压力　青：工作点</text>
</svg>`;
}
