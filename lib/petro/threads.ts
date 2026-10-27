import { notHitlRecovery } from "@/lib/ops/errors";
import { dataFile, readJsonFile, writeJsonFile } from "@/lib/ops/json-file";

export type ThreadKind = "analyze" | "hitl";
export type ThreadPhase =
  | "streaming"
  | "completed"
  | "awaiting_approval"
  | "rejected"
  | "approved"
  | "expired"
  | "failed";

export type ThreadRecord = {
  id: string;
  kind: ThreadKind;
  phase: ThreadPhase;
  requestId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  rejections: number;
  note: string;
  input?: string;
  blocking?: boolean;
};

const FILE = dataFile("hitl-threads.json");

export function hitlTtlMs() {
  const parsed = Number(process.env.PETRO_RAG_HITL_TTL_MS);
  if (Number.isFinite(parsed) && parsed >= 60_000) return parsed;
  return 30 * 60 * 1000;
}

function readAll() {
  const rows = readJsonFile<ThreadRecord[]>(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function writeAll(rows: ThreadRecord[]) {
  writeJsonFile(FILE, rows);
}

function expire(row: ThreadRecord, now = Date.now()): ThreadRecord {
  if (row.kind !== "hitl") return row;
  if (row.phase === "approved" || row.phase === "failed") return row;
  if (row.phase === "expired") return row;
  if (new Date(row.expiresAt).getTime() > now) return row;
  return {
    ...row,
    phase: "expired",
    updatedAt: new Date(now).toISOString(),
    note: "超过人工复核时限，未批准。需要重新发起 HITL。",
  };
}

export function listThreads() {
  const rows = readAll().map((row) => expire(row));
  writeAll(rows);
  return rows;
}

export function threadCounts() {
  const rows = listThreads();
  return {
    tracked: rows.length,
    awaiting: rows.filter((row) => row.kind === "hitl" && (row.phase === "awaiting_approval" || row.phase === "rejected")).length,
    approved: rows.filter((row) => row.phase === "approved").length,
    file: ".data/hitl-threads.json",
  };
}

function save(row: ThreadRecord) {
  const rows = readAll().filter((item) => item.id !== row.id);
  rows.push(row);
  writeAll(rows);
  return row;
}

export function getThread(id: string) {
  const row = readAll().find((item) => item.id === id);
  if (!row) return null;
  const next = expire(row);
  if (next.phase !== row.phase || next.note !== row.note) save(next);
  return next;
}

export function registerAnalyzeThread(id: string, requestId: string) {
  if (!id) return null;
  const existing = getThread(id);
  if (existing?.kind === "hitl") return existing;
  const now = new Date();
  return save({
    id,
    kind: "analyze",
    phase: "completed",
    requestId: existing?.requestId || requestId,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: existing?.expiresAt ?? now.toISOString(),
    rejections: 0,
    note: "流式 /api/analyze 线程，不能批准。",
  });
}

export function registerHitlThread(
  id: string,
  requestId: string,
  extra?: { input?: string; blocking?: boolean },
) {
  const now = new Date();
  const existing = getThread(id);
  if (existing?.kind === "analyze") return existing;
  return save({
    id,
    kind: "hitl",
    phase: "awaiting_approval",
    requestId,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hitlTtlMs()).toISOString(),
    rejections: existing?.rejections ?? 0,
    note: "待值班员确认。系统不会自动批准。",
    input: extra?.input ?? existing?.input,
    blocking: extra?.blocking ?? existing?.blocking,
  });
}

export function markHitlDecision(id: string, approved: boolean, rejections: number) {
  const thread = getThread(id);
  if (!thread || thread.kind !== "hitl") return null;
  return save({
    ...thread,
    phase: approved ? "approved" : "rejected",
    rejections,
    updatedAt: new Date().toISOString(),
    note: approved ? "值班员已批准。不是自动放行。" : "已驳回，需按意见重写后再确认。",
  });
}

export type ApproveGate =
  | { ok: true; thread: ThreadRecord }
  | { ok: false; status: number; error: string; message: string; recovery: string[] };

export function assertApprovable(id: string): ApproveGate {
  const thread = getThread(id);
  if (!thread || thread.kind !== "hitl") {
    return {
      ok: false,
      status: 409,
      error: "not_hitl",
      message: thread
        ? `线程 ${id} 来自流式评估，不能批准。`
        : "本服务没有这条 HITL 线程，拒绝批准。流式评估返回的 thread_id 不能拿来放行。",
      recovery: notHitlRecovery(),
    };
  }
  if (thread.phase === "expired") {
    return {
      ok: false,
      status: 410,
      error: "expired",
      message: "这条人工复核已超时，未批准。",
      recovery: ["重新发起 HITL。超时线程不会自动通过。"],
    };
  }
  if (thread.phase === "approved") {
    return {
      ok: false,
      status: 409,
      error: "closed",
      message: "这条线程已经通过，不能再次批准。",
      recovery: ["需要新的结论时重新发起评估和 HITL。"],
    };
  }
  if (thread.phase !== "awaiting_approval" && thread.phase !== "rejected") {
    return {
      ok: false,
      status: 409,
      error: "bad_state",
      message: `当前状态是 ${thread.phase}，不能批准或驳回。`,
      recovery: ["刷新复核状态。若已失败，重新发起 HITL。"],
    };
  }
  return { ok: true, thread };
}
