import assert from "node:assert/strict";
import test from "node:test";
import { planSkills } from "./local-supervisor";

const skills = (text: string) => planSkills(text).map((call) => call.skill);

test("an empty question still gets the overview, not an empty tool set", () => {
  assert.deepEqual(skills(""), ["get_overview"]);
  assert.deepEqual(skills("你好"), ["get_overview"]);
});

test("告警 opens the alert list, defaulting to the active ones", () => {
  const calls = planSkills("现在有哪些告警");
  const list = calls.find((call) => call.skill === "list_alerts");
  assert.ok(list);
  assert.equal(list.input.status, "active");
});

test("问历史告警会取全部，问严重告警会带级别", () => {
  const all = planSkills("历史告警有哪些").find((call) => call.skill === "list_alerts");
  assert.equal(all?.input.status, "all");
  const critical = planSkills("严重告警").find((call) => call.skill === "list_alerts");
  assert.equal(critical?.input.severity, "critical");
});

test("带编号的「为什么」走 explain_alert，而不是再列一遍告警", () => {
  const calls = planSkills("ALM-2041 为什么报警");
  assert.deepEqual(skills("ALM-2041 为什么报警"), ["explain_alert"]);
  assert.deepEqual(calls[0].input, { alert_id: "ALM-2041" });
});

test("小写编号也能被认出来", () => {
  assert.deepEqual(planSkills("alm-1988 解释一下")[0].input, { alert_id: "ALM-1988" });
});

test("工况问题带段号，只有问指标时才取段数据", () => {
  const metrics = planSkills("注入段压力多少");
  assert.ok(metrics.some((call) => call.skill === "get_segment_metrics"));
  const seg = metrics.find((call) => call.skill === "get_segment_metrics");
  assert.equal(seg?.input.segment, "storage");

  // 只是提到「注入」，但问的是风险，不该顺手把段指标也拉一遍
  const risk = planSkills("注入段封存风险评估");
  assert.equal(risk.some((call) => call.skill === "get_segment_metrics"), false);
  assert.ok(risk.some((call) => call.skill === "run_risk_assessment"));
});

test("风险评估一定带上一段描述，不能把空字符串送进上游", () => {
  const call = planSkills("风险评估").find((item) => item.skill === "run_risk_assessment");
  assert.ok(call);
  const description = String(call.input.project_description ?? "");
  assert.ok(description.length > 20);
});

test("运维专用的几项各有入口", () => {
  assert.ok(skills("质量衡算").includes("get_mass_balance"));
  assert.ok(skills("交接班记录").includes("draft_shift_handover"));
  assert.ok(skills("盖层上方压力").includes("get_containment_status"));
  assert.ok(skills("阀室 ESD").includes("get_transport_integrity"));
  assert.ok(skills("羽流半径").includes("get_plume_demo"));
  assert.ok(skills("后端连上了吗").includes("check_backend_health"));
});

test("问标准走知识卡，不顺手拉一段工况", () => {
  const calls = planSkills("ISO 27914 对封存监测有什么要求");
  assert.ok(calls.some((call) => call.skill === "ccus_research_notes"));
  assert.equal(calls.some((call) => call.skill === "get_segment_metrics"), false);
});

test("重复的意图只调用一次", () => {
  const calls = planSkills("告警告警告警告警");
  assert.equal(calls.filter((call) => call.skill === "list_alerts").length, 1);
});

test("每一次规划都有至少一个技能，绝不返回空数组", () => {
  for (const text of ["", "嗯", "?", "现在什么情况", "ALM-2041", "随便问问"]) {
    assert.ok(planSkills(text).length > 0, `「${text}」不能规划出空技能表`);
  }
});
