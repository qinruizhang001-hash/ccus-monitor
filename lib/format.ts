export function formatNum(value: number, digits = 0) {
  const fixed = value.toFixed(digits);
  const negative = fixed.startsWith("-");
  const raw = negative ? fixed.slice(1) : fixed;
  const [intPart, dec] = raw.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = dec !== undefined ? `${withSep}.${dec}` : withSep;
  return negative ? `-${body}` : body;
}

export function formatPct(value: number, digits = 1) {
  return `${formatNum(value, digits)}%`;
}
