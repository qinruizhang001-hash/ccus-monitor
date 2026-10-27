import { ALERTS, type Alert } from "../telemetry";

export function resolveExplainAlert(alertId: string):
  | { ok: true; id: string; alert: Alert }
  | { ok: false; id: string | null; alert: null } {
  const id = alertId.trim().toUpperCase();
  if (!/^ALM-\d+$/.test(id)) return { ok: false, id: null, alert: null };
  const alert = ALERTS.find((item) => item.id.toUpperCase() === id) ?? null;
  if (!alert) return { ok: false, id, alert: null };
  return { ok: true, id: alert.id, alert };
}
