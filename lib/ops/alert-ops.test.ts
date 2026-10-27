import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import type { AlertActionResult } from "./alert-ops";

// .data 的路径在模块加载时就算好了（`dataFile()` 读 process.cwd()），
// 所以必须先换工作目录，再动态 import —— 静态 import 会被提升到 chdir 之前。
const root = mkdtempSync(path.join(tmpdir(), "ccus-audit-"));
process.chdir(root);

const LOG = path.join(root, ".data", "alert-audit.jsonl");

let mod: typeof import("./alert-ops");

before(async () => {
  mod = await import("./alert-ops");
});

type Row = Record<string, unknown>;

function reset() {
  rmSync(LOG, { force: true });
}

function readRows(): Row[] {
  return readFileSync(LOG, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row);
}

function writeRows(rows: Row[]) {
  writeFileSync(LOG, rows.map((row) => `${JSON.stringify(row)}\n`).join(""), "utf8");
}

function appendRaw(text: string) {
  writeFileSync(LOG, `${readFileSync(LOG, "utf8")}${text}`, "utf8");
}

/** 测试侧独立算一遍摘要 —— 与生产侧的字段顺序互为对照，两边都错才会同时通过。 */
const ORDER = ["at", "alertId", "action", "actor", "role", "note", "silencedUntil", "confirm", "secondConfirm"];

function seal(row: Row): Row {
  const body: Row = { seq: row.seq };
  for (const key of ORDER) body[key] = row[key];
  body.prevHash = row.prevHash;
  return { ...body, hash: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}

function ok(
  result: AlertActionResult,
  message: string,
): asserts result is Extract<AlertActionResult, { ok: true }> {
  if (!result.ok) throw new Error(`${message}：${result.message}`);
}

test("an empty audit log verifies, and says it has no lines", () => {
  reset();
  const status = mod.verifyChain();
  assert.equal(status.ok, true);
  assert.equal(status.lines, 0);
  assert.equal(status.malformed, 0);
  assert.equal(status.brokenAt, null);
});

test("a freshly written line verifies against its own digest and link", () => {
  reset();
  const result = mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" });
  ok(result, "确认应当成功");
  const status = mod.verifyChain();
  assert.equal(status.ok, true, status.reason);
  assert.equal(status.lines, 1);
  const [row] = readRows();
  assert.equal(row.prevHash, "0".repeat(64));
  assert.equal(row.seq, 1);
  assert.equal(row.hash, seal(row).hash, "写盘时的摘要必须与字段顺序约定一致");
});

test("changing one field is caught by recomputing the digest", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  const rows = readRows();
  rows[0].action = "escalate"; // 把「已确认」改成「已升级」，hash 列原样留着
  writeRows(rows);
  const status = mod.verifyChain();
  assert.equal(status.ok, false);
  assert.equal(status.brokenAt, 1);
  assert.match(status.reason, /被改过/);
});

test("deleting a line is caught by the seq sequence", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  ok(mod.applyAlertAction({ alertId: "ALM-1955", action: "escalate" }), "升级应当成功");
  const rows = readRows();
  rows.splice(0, 1); // 掐掉第一行：剩下那行自己完全合法
  writeRows(rows);
  const status = mod.verifyChain();
  assert.equal(status.ok, false);
  assert.equal(status.brokenAt, 1);
  assert.match(status.reason, /seq/);
});

test("swapping two lines is caught before the digest is even needed", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  ok(mod.applyAlertAction({ alertId: "ALM-1955", action: "escalate" }), "升级应当成功");
  const rows = readRows();
  writeRows([rows[1], rows[0]]);
  const status = mod.verifyChain();
  assert.equal(status.ok, false);
  assert.equal(status.brokenAt, 1);
  assert.match(status.reason, /seq/);
});

test("a forged line with a self-consistent digest is still caught by prevHash", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  ok(mod.applyAlertAction({ alertId: "ALM-1955", action: "escalate" }), "升级应当成功");
  const rows = readRows();
  // 第二行的内容与自己的摘要都合法，但链接被指到了创世值。
  rows[1] = seal({ ...rows[1], prevHash: "0".repeat(64) });
  writeRows(rows);
  const status = mod.verifyChain();
  assert.equal(status.ok, false);
  assert.equal(status.brokenAt, 2);
  assert.match(status.reason, /prevHash/);
});

test("a line that cannot be parsed is counted, not silently dropped", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  appendRaw('{"seq":2,"at":"2026-10-27T10:00:00+08:00","alertId":"ALM-19\n'); // 写到一半断电
  const status = mod.verifyChain();
  assert.equal(status.ok, false);
  assert.equal(status.malformed, 1);
  assert.equal(status.brokenAt, 2);
  assert.match(status.reason, /不是合法的审计记录/);
});

test("a broken chain refuses new writes instead of covering the break", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  const rows = readRows();
  rows[0].action = "escalate";
  writeRows(rows);
  const before = readRows().length;

  const result = mod.applyAlertAction({ alertId: "ALM-1955", action: "escalate" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "audit_chain_broken");
  assert.equal(result.status, 500);
  assert.match(result.message, /哈希链不完整/);
  assert.equal(readRows().length, before, "被拒绝的处置不能留下半行记录");
});

test("a rejected action leaves no line behind", () => {
  reset();
  const saved = process.env.CCUS_ROLE;
  process.env.CCUS_ROLE = "viewer";
  try {
    const denied = mod.applyAlertAction({ alertId: "ALM-2041", action: "ack" });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.status, 403);
  } finally {
    if (saved === undefined) delete process.env.CCUS_ROLE;
    else process.env.CCUS_ROLE = saved;
  }
  // 严重告警静默缺第二次确认 —— 这条要在 operator 下才走得到，viewer 会先被 403 挡住
  const unconfirmed = mod.applyAlertAction({ alertId: "ALM-2041", action: "silence", note: "先看两小时" });
  assert.equal(unconfirmed.ok, false);
  if (!unconfirmed.ok) assert.equal(unconfirmed.error, "dual_confirm_required");
  assert.equal(readFileExists() ? readRows().length : 0, 0, "被拒绝的动作不能写进审计");
});

test("the CSV export carries the chain verdict", () => {
  reset();
  ok(mod.applyAlertAction({ alertId: "ALM-1988", action: "ack" }), "确认应当成功");
  const healthy = mod.alertsCsv();
  assert.match(healthy, /audit_chain/);
  assert.match(healthy, /ok\(1\)/);

  const rows = readRows();
  rows[0].action = "escalate";
  writeRows(rows);
  const broken = mod.alertsCsv();
  assert.match(broken, /broken@1/);
  assert.equal(broken.includes("ok(1)"), false, "链条断了就不能在导出里写 ok");
});

function readFileExists() {
  try {
    readFileSync(LOG, "utf8");
    return true;
  } catch {
    return false;
  }
}
