import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { VIEWER_ACK_MESSAGE, VIEWER_SILENCE_MESSAGE } from "@/lib/ops/errors";
import { dataFile, readJsonFile } from "@/lib/ops/json-file";
import { opsSession, type OpsRole } from "@/lib/ops/session";
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

const LOG = dataFile("alert-audit.jsonl");
const LEGACY = dataFile("alert-ops.json");
const SILENCE_MS = 8 * 60 * 60 * 1000;
const GENESIS = "0".repeat(64);

function digest(body: Omit<AuditLine, "hash">) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function readRaw(): AuditLine[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as AuditLine];
      } catch {
        return [];
      }
    });
}

function appendLine(body: Omit<AuditLine, "seq" | "prevHash" | "hash">) {
  ensureImported();
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
      message: VIEWER_ACK_MESSAGE,
      recovery: ["观察员可以升级这条严重告警。", "确认动作留给 CCUS_ROLE=operator 的值班员。"],
    };
  }
  if ((input.action === "silence" || input.action === "unsilence") && session.role !== "operator") {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: VIEWER_SILENCE_MESSAGE,
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
