const lastAt = new Map<string, number>();

export function riskIntervalMs() {
  const parsed = Number(process.env.CCUS_RISK_MIN_INTERVAL_MS);
  if (Number.isFinite(parsed) && parsed >= 1_000) return parsed;
  return 20_000;
}

export function takeRateLimit(key: string, minIntervalMs: number) {
  const now = Date.now();
  const prev = lastAt.get(key) ?? 0;
  const wait = minIntervalMs - (now - prev);
  if (wait > 0) return { ok: false as const, retryAfterMs: wait };
  lastAt.set(key, now);
  return { ok: true as const, retryAfterMs: 0 };
}
