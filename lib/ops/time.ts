export const OPS_TIMEZONE = "Asia/Shanghai";

export function formatShanghai(input: Date | string | number, withSeconds = false) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return `无效时间 ${OPS_TIMEZONE}`;
  const text = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
    timeZone: OPS_TIMEZONE,
  }).format(date);
  return `${text} ${OPS_TIMEZONE}`;
}

export function labelShiftStamp(stamp: string, year = "2026") {
  const match = stamp.match(/^(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/);
  if (!match) return `${stamp} ${OPS_TIMEZONE}`;
  return `${year}-${match[1]}-${match[2]} ${match[3]} ${OPS_TIMEZONE}`;
}

export function ageHours(asOfIso: string, now = Date.now()) {
  const then = new Date(asOfIso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now - then) / 3_600_000));
}
