import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before } from "node:test";

const root = mkdtempSync(path.join(tmpdir(), "ccus-threads-"));
process.chdir(root);

const FILE = path.join(root, ".data", "hitl-threads.json");
let mod: typeof import("./threads");

before(async () => {
  mod = await import("./threads");
});

function reset() {
  rmSync(FILE, { force: true });
}

function rewrite(id: string, patch: Record<string, unknown>) {
  const rows = JSON.parse(readFileSync(FILE, "utf8")) as Array<Record<string, unknown>>;
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(`没有线程 ${id}`);
  rows[index] = { ...rows[index], ...patch };
  writeFileSync(FILE, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

test("a fresh HITL thread is approvable", () => {
  reset();
  mod.registerHitlThread("th-1", "req-1");
  const gate = mod.assertApprovable("th-1");
  assert.equal(gate.ok, true);
  if (gate.ok) assert.equal(gate.thread.phase, "awaiting_approval");
});

test("a streaming analyse thread can never be approved", () => {
  reset();
  mod.registerAnalyzeThread("th-analyze", "req-1");
  const gate = mod.assertApprovable("th-analyze");
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.status, 409);
    assert.equal(gate.error, "not_hitl");
    assert.match(gate.message, /流式评估/);
  }
});

test("an unknown thread is refused, not created", () => {
  reset();
  const gate = mod.assertApprovable("th-missing");
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.error, "not_hitl");
  assert.equal(mod.getThread("th-missing"), null);
});

test("registering a HITL thread over an analyse id does not promote it", () => {
  reset();
  mod.registerAnalyzeThread("th-1", "req-1");
  const row = mod.registerHitlThread("th-1", "req-2");
  assert.equal(row?.kind, "analyze");
  const gate = mod.assertApprovable("th-1");
  assert.equal(gate.ok, false);
});

test("an approved thread cannot be approved twice", () => {
  reset();
  mod.registerHitlThread("th-1", "req-1");
  mod.markHitlDecision("th-1", true, 0);
  const gate = mod.assertApprovable("th-1");
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.status, 409);
    assert.equal(gate.error, "closed");
  }
});

test("a rejected thread can be approved again, that is the rewrite loop", () => {
  reset();
  mod.registerHitlThread("th-1", "req-1");
  mod.markHitlDecision("th-1", false, 1);
  const gate = mod.assertApprovable("th-1");
  assert.equal(gate.ok, true);
  if (gate.ok) assert.equal(gate.thread.rejections, 1);
});

test("an expired thread is refused with 410 and is not silently approved", () => {
  reset();
  mod.registerHitlThread("th-1", "req-1");
  rewrite("th-1", { expiresAt: new Date(Date.now() - 60_000).toISOString() });
  const gate = mod.assertApprovable("th-1");
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.status, 410);
    assert.equal(gate.error, "expired");
  }
  assert.equal(mod.getThread("th-1")?.phase, "expired");
});

test("a failed thread is refused with a state error, not treated as awaiting", () => {
  reset();
  mod.registerHitlThread("th-1", "req-1");
  rewrite("th-1", { phase: "failed" });
  const gate = mod.assertApprovable("th-1");
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.status, 409);
    assert.equal(gate.error, "bad_state");
    assert.match(gate.message, /failed/);
  }
});

test("marking a decision on an analyse thread changes nothing", () => {
  reset();
  mod.registerAnalyzeThread("th-analyze", "req-1");
  assert.equal(mod.markHitlDecision("th-analyze", true, 0), null);
  assert.equal(mod.getThread("th-analyze")?.phase, "completed");
});
