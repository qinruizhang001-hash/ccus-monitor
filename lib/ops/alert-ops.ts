import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { VIEWER_ACK_MESSAGE, VIEWER_SILENCE_MESSAGE } from "@/lib/ops/errors";
import { dataFile, readJsonFile } from "@/lib/ops/json-file";
import { denialMessage, opsSession, type OpsRole } from "@/lib/ops/session";
import { formatShanghai } from "@/lib/ops/time";
import { ALERTS, type Alert, type Severity } from "@/lib/telemetry";

export type AlertAction = "ack" | "silence" | "unsilence" | "escalate";
export type AlertOpsState = "open" | "acknowledged" | "silenced" | "escalated";

export type AlertAuditEntry = {
  seq: number;
  at: string;
  actor: string;
  role: OpsRole;
  action: AlertAction;
  note?: string;
  hash: string;
};

export type AlertOpsRecord = {
  alertId: string;
  state: AlertOpsState;
  silencedUntil: string | null;
  silenceExpired: boolean;
  audit: AlertAuditEntry[];
};

type AuditLine = {
  seq: number;
  at: string;
  alertId: string;
  action: AlertAction;
  actor: string;
  role: OpsRole;
  note: string;
  silencedUntil: string | null;
  confirm: string;
  secondConfirm: boolean;
  prevHash: string;
  hash: string;
};

/**
 * 审计日志的完整性状态。
 *
 * 这个类型存在的理由：写了 `hash` 和 `prevHash` 两列，不等于有人校验过它们。
 * 第一版只在写入时算摘要，读的时候把文件里的 `hash` 原样信任 —— 于是那条「链」
 * 只是日志里的一列十六进制字符串。改一行 `action`、删一行、换两行顺序，全站照旧。
 *
 * 三条都必须查，缺一条就有一种篡改能通过：
 *   1. 摘要重算 —— 抓「改内容」
 *   2. prevHash 链接 —— 抓「换 hash」与「掐头去尾」
 *   3. seq 连续 —— 抓「删行」「重排」
 */
export type ChainStatus = {
  ok: boolean;
  lines: number;
  malformed: number;
  brokenAt: number | null;
  reason: string;
};

const LOG = dataFile("alert-audit.jsonl");
const LEGACY = dataFile("alert-ops.json");
const SILENCE_MS = 8 * 60 * 60 * 1000;
const GENESIS = "0".repeat(64);

/**
 * 参与摘要的字段与顺序。
 *
 * `appendLine` 用对象展开写盘，`canonical` 用这个列表重算 —— 两处必须是同一个顺序，
 * 否则写进去的摘要自己都验不过。有一个测试专门锁这件事（写一行再验一遍）。
 */
const FIELD_ORDER = [
  "at",
  "alertId",
  "action",
  "actor",
  "role",
  "note",
  "silencedUntil",
  "confirm",
  "secondConfirm",
] as const;

function digest(body: Omit<AuditLine, "hash">) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function canonical(line: AuditLine): Omit<AuditLine, "hash"> {
  const body: Record<string, unknown> = { seq: line.seq };
  for (const key of FIELD_ORDER) body[key] = (line as unknown as Record<string, unknown>)[key];
  body.prevHash = line.prevHash;
  return body as Omit<AuditLine, "hash">;
}

type LogEntry = { lineNo: number; parsed: AuditLine | null };

function readLog(): LogEntry[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8")
    .split("\n")
    .map((line, index) => ({ lineNo: index + 1, text: line.trim() }))
    .filter((row) => Boolean(row.text))
    .map((row) => {
      try {
        const value = JSON.parse(row.text) as AuditLine;
        const shaped =
          value && typeof value === "object" && typeof value.hash === "string" && typeof value.seq === "number";
        return { lineNo: row.lineNo, parsed: shaped ? value : null };
      } catch {
        // 不吞。这一行读不出来，正说明它是最该被看见的那一行 ——
        // 审计链上「谁在什么时候基于什么理由做了什么」，坏行恰好会从这里消失。
        return { lineNo: row.lineNo, parsed: null };
      }
    });
}

function readRaw(): AuditLine[] {
  return readLog().flatMap((entry) => (entry.parsed ? [entry.parsed] : []));
}

export function verifyChain(): ChainStatus {
  const entries = readLog();
  const malformed = entries.filter((entry) => !entry.parsed).map((entry) => entry.lineNo);
  if (malformed.length > 0) {
    return {
      ok: false,
      lines: entries.length,
      malformed: malformed.length,
      brokenAt: malformed[0],
      reason: `第 ${malformed.join("、")} 行不是合法的审计记录，无法核对摘要。`,
    };
  }
  let prevHash = GENESIS;
  let expectedSeq = 1;
  for (const entry of entries) {
    const line = entry.parsed as AuditLine;
    if (line.seq !== expectedSeq) {
      return {
        ok: false,
        lines: entries.length,
        malformed: 0,
        brokenAt: entry.lineNo,
        reason: `第 ${entry.lineNo} 行的 seq 是 ${line.seq}，应为 ${expectedSeq}：有行被删除或被换了顺序。`,
      };
    }
    if (line.prevHash !== prevHash) {
      return {
        ok: false,
        lines: entries.length,
        malformed: 0,
        brokenAt: entry.lineNo,
        reason: `第 ${entry.lineNo} 行的 prevHash 与上一行的 hash 不一致：链在这里断了。`,
      };
    }
    if (digest(canonical(line)) !== line.hash) {
      return {
        ok: false,
        lines: entries.length,
        malformed: 0,
        brokenAt: entry.lineNo,
        reason: `第 ${entry.lineNo} 行的内容与它自己的 sha256 摘要不一致：这一行被改过。`,
      };
    }
    prevHash = line.hash;
    expectedSeq += 1;
  }
  return { ok: true, lines: entries.length, malformed: 0, brokenAt: null, reason: "" };
}

export class AuditChainError extends Error {
  readonly status: ChainStatus;
  constructor(status: ChainStatus) {
    super(status.reason);
    this.name = "AuditChainError";
    this.status = status;
  }
}

function appendLine(body: Omit<AuditLine, "seq" | "prevHash" | "hash">) {
  ensureImported();
  // 链条坏了就不能继续追加。
  //
  // 追加一行等于给前面所有行背书：新行的 prevHash 指向最后一条「看起来有效」的行，
  // 于是断裂处被盖在中间，之后再也验不出来。宁可拒绝写，让人先看一眼文件。
  const chain = verifyChain();
  if (!chain.ok) throw new AuditChainError(chain);
  const lines = readRaw();
  const prev = lines.at(-1);
  const unsigned = {
    seq: (prev?.seq ?? 0) + 1,
    ...body,
    prevHash: prev?.hash ?? GENESIS,
  };
  const line: AuditLine = { ...unsigned, hash: digest(unsigned) };
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${JSON.stringify(line)}\n`, "utf8");
  return line;
}

let imported = false;

function ensureImported() {
  if (imported) return;
  imported = true;
  if (readRaw().length > 0) return;
  const legacy = readJsonFile<
    Array<{
      alertId: string;
      silencedUntil: string | null;
      audit?: Array<{ at: string; actor: string; role: OpsRole; action: AlertAction; note?: string }>;
    }>
  >(LEGACY, []);
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  const flat = legacy.flatMap((row) => (row.audit ?? []).map((entry) => ({ row, entry })));
  flat.sort((a, b) => a.entry.at.localeCompare(b.entry.at));
  for (const { row, entry } of flat) {
    appendLine({
      at: entry.at,
      alertId: row.alertId,
      action: entry.action,
      actor: entry.actor,
      role: entry.role,
      note: entry.note ?? "",
      silencedUntil: entry.action === "silence" ? row.silencedUntil : null,
      confirm: "",
      secondConfirm: false,
    });
  }
}

function derive(now = Date.now()): AlertOpsRecord[] {
  ensureImported();
  const byId = new Map<string, AlertOpsRecord>();
  for (const line of readRaw()) {
    const prev = byId.get(line.alertId) ?? {
      alertId: line.alertId,
      state: "open" as const,
      silencedUntil: null,
      silenceExpired: false,
      audit: [],
    };
    let state: AlertOpsState = prev.state;
    let silencedUntil = prev.silencedUntil;
    if (line.action === "ack") {
      state = "acknowledged";
      silencedUntil = null;
    } else if (line.action === "silence") {
      state = "silenced";
      silencedUntil = line.silencedUntil;
    } else if (line.action === "unsilence") {
      state = "open";
      silencedUntil = null;
    } else if (line.action === "escalate") {
      state = "escalated";
      silencedUntil = null;
    }
    byId.set(line.alertId, {
      alertId: line.alertId,
      state,
      silencedUntil,
      silenceExpired: false,
      audit: [
        ...prev.audit,
        {
          seq: line.seq,
          at: line.at,
          actor: line.actor,
          role: line.role,
          action: line.action,
          ...(line.note ? { note: line.note } : {}),
          hash: line.hash,
        },
      ],
    });
  }
  return [...byId.values()].map((row) => ({
    ...row,
    silenceExpired:
      row.state === "silenced" && Boolean(row.silencedUntil) && new Date(row.silencedUntil as string).getTime() <= now,
  }));
}

export function listAlertOps() {
  return derive();
}

export function alertOpsMap() {
  return Object.fromEntries(listAlertOps().map((row) => [row.alertId, row]));
}

function findAlert(alertId: string) {
  return ALERTS.find((item) => item.id.toUpperCase() === alertId.toUpperCase()) ?? null;
}

export type AlertActionResult =
  | { ok: true; status: 200; record: AlertOpsRecord }
  | { ok: false; status: number; error: string; message: string; recovery: string[] };

export function applyAlertAction(input: {
  alertId: string;
  action: AlertAction;
  note?: string;
  confirm?: string;
  secondConfirm?: boolean;
}): AlertActionResult {
  const alert = findAlert(input.alertId.trim());
  if (!alert) {
    return {
      ok: false,
      status: 404,
      error: "unknown_alert",
      message: `没有告警 ${input.alertId}。`,
      recovery: ["用告警页上的编号，例如 ALM-2041。"],
    };
  }
  if (alert.status === "cleared") {
    return {
      ok: false,
      status: 409,
      error: "cleared",
      message: "已恢复的告警不能再确认、静默或升级。",
      recovery: ["把它留在历史里。若测点再次越限，等新告警编号。"],
    };
  }
  const session = opsSession();
  if (input.action === "ack" && alert.severity === "critical" && session.role !== "operator") {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: denialMessage(VIEWER_ACK_MESSAGE, session),
      recovery: ["观察员可以升级这条严重告警。", "确认动作留给 CCUS_ROLE=operator 的值班员。"],
    };
  }
  if ((input.action === "silence" || input.action === "unsilence") && session.role !== "operator") {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: denialMessage(VIEWER_SILENCE_MESSAGE, session),
      recovery: ["静默只对值班员开放。", "需要暂时收起时，请值班员填写原因。"],
    };
  }
  const note = input.note?.trim() ?? "";
  if (input.action === "silence" && note.length < 2) {
    return {
      ok: false,
      status: 400,
      error: "note_required",
      message: "静默必须写原因。",
      recovery: ["写明为什么本班先不盯这条，以及何时再看。"],
    };
  }
  if (input.action === "silence" && alert.severity === "critical") {
    const confirm = input.confirm?.trim() ?? "";
    if (confirm !== alert.id || input.secondConfirm !== true) {
      return {
        ok: false,
        status: 400,
        error: "dual_confirm_required",
        message: `严重告警 ${alert.id} 静默需要两次确认：勾选第二次核对，并让 confirm 等于 ${alert.id}。`,
        recovery: ["先写原因。", "勾选第二次核对。", `在确认框输入 ${alert.id}。`, "已写入的审计行不会改。"],
      };
    }
  }

  const at = formatShanghai(new Date(), true);
  const silencedUntil = input.action === "silence" ? new Date(Date.now() + SILENCE_MS).toISOString() : null;
  try {
    appendLine({
      at,
      alertId: alert.id,
      action: input.action,
      actor: session.actor,
      role: session.role,
      note,
      silencedUntil,
      confirm: input.action === "silence" ? (input.confirm?.trim() ?? "") : "",
      secondConfirm: input.action === "silence" && input.secondConfirm === true,
    });
  } catch (error) {
    if (!(error instanceof AuditChainError)) throw error;
    const chain = error.status;
    return {
      ok: false,
      status: 500,
      error: "audit_chain_broken",
      message: `审计日志的哈希链不完整，本次处置没有记下：${chain.reason}`,
      recovery: [
        "先备份 .data/alert-audit.jsonl，再逐行核对被改过的位置。",
        "链条修复之前，本服务不再追加任何处置记录 —— 追加会把断裂处盖在中间，之后就再也验不出来。",
        "不要直接删掉坏行；删掉也验不过，seq 会断。",
      ],
    };
  }
  const record = listAlertOps().find((row) => row.alertId === alert.id);
  if (!record) {
    return {
      ok: false,
      status: 500,
      error: "audit_missing",
      message: "审计行已追加，但没有读回。请不要重写日志，只再读一次。",
      recovery: ["查看 .data/alert-audit.jsonl 的最后一行。"],
    };
  }
  return { ok: true, status: 200, record };
}

export function alertsCsv() {
  const ops = alertOpsMap();
  const chain = verifyChain();
  const chainCell = chain.ok ? `ok(${chain.lines})` : `broken@${chain.brokenAt ?? "?"}`;
  const header = [
    "id",
    "severity",
    "segment",
    "source_status",
    "ops_state",
    "title",
    "reading",
    "threshold",
    "opened_at",
    "silenced_until",
    "last_audit",
    "audit_chain",
    "provenance",
  ];
  const lines = [header.join(",")];
  for (const alert of ALERTS) {
    const row = ops[alert.id];
    const last = row?.audit.at(-1);
    const state = row?.silenceExpired ? "静默已到期（日志未改写）" : (row?.state ?? "open");
    lines.push(
      [
        alert.id,
        alert.severity,
        alert.segment,
        alert.status,
        state,
        csvCell(alert.title),
        csvCell(alert.reading),
        csvCell(alert.threshold),
        csvCell(alert.openedAt),
        csvCell(row?.silencedUntil ?? ""),
        csvCell(last ? `${last.at} ${last.actor} ${last.action} ${last.hash.slice(0, 12)}` : ""),
        chainCell,
        "演示数据",
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function opsStateLabel(state: AlertOpsState, silenceExpired = false) {
  if (silenceExpired) return "静默已到期（日志未改写）";
  if (state === "acknowledged") return "已确认";
  if (state === "silenced") return "已静默";
  if (state === "escalated") return "已升级";
  return "未处置";
}

export function canAck(alert: Pick<Alert, "severity" | "status">, role: OpsRole) {
  if (alert.status === "cleared") return false;
  if (alert.severity === "critical" && role !== "operator") return false;
  return true;
}

export function canSilence(alert: Pick<Alert, "status">, role: OpsRole) {
  return alert.status !== "cleared" && role === "operator";
}

export type { Severity };
