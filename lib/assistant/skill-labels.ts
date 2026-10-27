export const SKILL_LABELS = {
  get_overview: "总览快照",
  get_segment_metrics: "工段指标",
  list_alerts: "告警列表",
  explain_alert: "告警说明",
  run_risk_assessment: "风险评估",
  check_backend_health: "评估服务健康",
  draft_ops_report: "值班简报",
  ccus_research_notes: "知识卡",
  grounding_check: "依据核对",
  get_mass_balance: "质量衡算",
  get_containment_status: "遏制监测",
  get_transport_integrity: "运输完整性",
  get_plume_demo: "教学羽流",
  draft_shift_handover: "交接班",
} as const;

export type SkillName = keyof typeof SKILL_LABELS;
