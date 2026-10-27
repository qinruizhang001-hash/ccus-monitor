export function offlineRecovery() {
  return [
    "看本站 GET /api/health 里的 petro.status，确认是离线、降级还是演示流。",
    "核对 PETRO_RAG_BASE_URL（默认 http://localhost:8080）以及上游是否已启动。",
    "若上游开启了 API_TOKEN，把同一串写进服务端的 PETRO_RAG_API_TOKEN，然后重启 Next。",
    "暂时不连后端时，把 PETRO_RAG_MOCK 设为 1，只看标明演示流的评估。监测页本来就是演示数据。",
    "不要把中断的评估线程拿去批准。",
  ];
}

export function tokenRecovery() {
  return [
    "上游返回 401。把 PETRO_RAG_API_TOKEN 设成与 petro-rag-agent 的 API_TOKEN 相同的值。",
    "令牌只放在 Next 服务端，不要写进浏览器或提交到 git。",
    "改完环境变量后重启进程，再看 /api/health。",
    "在令牌一致之前，不要重试批准。",
  ];
}

export function sseDropRecovery() {
  return [
    "这次评估没有收到 done，不能当成结论，也不能批准任何线程。",
    "先看 /api/health。离线或 401 时按页面上的恢复步骤处理。",
    "至少间隔 20 秒再重新发起评估，避免连点打满上游。",
    "需要人工放行时，等一次完整评估结束后，再在卡片里发起 HITL。",
  ];
}

export function timeoutRecovery() {
  return [
    "评估在时限内没有完成。这不是闸门通过。",
    "确认上游 Ollama 和 petro-rag-agent 仍在跑，再间隔 20 秒重试。",
    "不要对未完成的 thread_id 点通过。",
  ];
}

export function rateLimitRecovery(seconds: number) {
  return [
    `请等待 ${seconds} 秒后再发起下一次风险评估。`,
    "同一工况连点不会得到新的现场数据，监测页仍是演示快照。",
  ];
}

export function notHitlRecovery() {
  return [
    "只批准「发起人工复核」返回的 HITL 线程。",
    "流式 /api/analyze 的 thread_id 一律拒绝。",
    "若进程重启过，先确认 .data/hitl-threads.json 还在，再刷新状态。",
    "记录丢失时重新发起 HITL，不要沿用分析流线程。系统不会自动批准。",
  ];
}

export const VIEWER_APPROVE_MESSAGE = "当前是观察员，不能批准 HITL。请由值班员（CCUS_ROLE=operator）放行。";
export const VIEWER_ACK_MESSAGE = "观察员不能确认严重告警。可以升级，或请值班员确认。";
export const VIEWER_SILENCE_MESSAGE = "观察员不能静默告警。";
