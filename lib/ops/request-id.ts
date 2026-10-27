export function createRequestId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `req_${time}_${rand}`;
}

export function requestIdFrom(request: Request) {
  const header = request.headers.get("x-request-id")?.trim();
  if (header && /^[A-Za-z0-9_-]{6,80}$/.test(header)) return header;
  return createRequestId();
}
