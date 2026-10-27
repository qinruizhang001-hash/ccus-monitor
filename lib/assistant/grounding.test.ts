import assert from "node:assert/strict";
import test from "node:test";
import { resolveExplainAlert } from "./explain-guard";
import { groundingCheck } from "./grounding";

test("a reply with no tool result cannot keep a fake wellhead pressure", () => {
  const result = groundingCheck("井口压力 18.2 MPa，建议关井。", { toolsUsed: false, citations: [] });
  assert.equal(result.answer.includes("18.2"), false);
  assert.match(result.answer, /未知\/需接入数据源/);
  assert.equal(result.confidence, "low");
});

test("a fake wellhead pressure is still removed when tools did not return it", () => {
  const result = groundingCheck("井口压力 18.2 MPa", {
    toolsUsed: true,
    citations: [
      {
        skill: "get_overview",
        source: "演示数据",
        as_of: "2026-10-26T14:40:00+08:00",
        snapshot_id: "demo-bx-ccus-20261026T1440+08",
      },
    ],
  });
  assert.equal(result.answer.includes("18.2"), false);
  assert.match(result.answer, /未知\/需接入数据源/);
});

test("a snapshot wellhead pressure stays when a tool was used", () => {
  const result = groundingCheck("井口压力 12.8 MPa", {
    toolsUsed: true,
    citations: [
      {
        skill: "get_overview",
        source: "演示数据",
        as_of: "2026-10-26T14:40:00+08:00",
        snapshot_id: "demo-bx-ccus-20261026T1440+08",
      },
    ],
  });
  assert.match(result.answer, /12\.8\s*MPa/);
  assert.equal(result.answer.includes("未知/需接入数据源"), false);
});

test("explain_alert only accepts known alert ids", () => {
  const missing = resolveExplainAlert("ALM-9999");
  assert.equal(missing.ok, false);
  assert.equal(missing.alert, null);
  const known = resolveExplainAlert("alm-2041");
  assert.equal(known.ok, true);
  assert.equal(known.id, "ALM-2041");
  assert.equal(known.alert?.id, "ALM-2041");
});
