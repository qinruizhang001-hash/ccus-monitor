export type OpsRole = "operator" | "viewer";

export type OpsSession = {
  role: OpsRole;
  actor: string;
};

export function opsSession(): OpsSession {
  const raw = (process.env.CCUS_ROLE || "operator").trim().toLowerCase();
  const role: OpsRole = raw === "viewer" ? "viewer" : "operator";
  const fallback = role === "viewer" ? "观察员" : "值班员";
  const actor = (process.env.CCUS_OPERATOR_NAME || fallback).trim() || fallback;
  return { role, actor };
}

export function isOperator(session: OpsSession = opsSession()) {
  return session.role === "operator";
}
