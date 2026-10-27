export function petroConfig() {
  const baseUrl = (process.env.PETRO_RAG_BASE_URL || "http://localhost:8080").replace(
    /\/$/,
    "",
  );
  const token = (process.env.PETRO_RAG_API_TOKEN || "").trim();
  return {
    baseUrl,
    token,
    mock: process.env.PETRO_RAG_MOCK === "1",
  };
}

export function authHeaders(token: string, extra?: HeadersInit) {
  const headers = new Headers(extra);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

export function offlineMessage() {
  return "连不上 petro-rag-agent。监测大屏仍使用演示遥测。请启动该服务（docker compose 后默认 http://localhost:8080），核对 PETRO_RAG_BASE_URL 与 PETRO_RAG_API_TOKEN；若不连后端，把 PETRO_RAG_MOCK 设为 1，可看风险评估演示流。";
}

export function upstreamMessage(text: string, status: number) {
  if (status === 401) {
    return "评估服务返回 401。请让 PETRO_RAG_API_TOKEN 与 petro-rag-agent 的 API_TOKEN 一致。令牌只留在 Next.js 服务端，不会发给浏览器。";
  }
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    if (typeof parsed.detail === "string" && parsed.detail) return parsed.detail;
    if (parsed.detail) return JSON.stringify(parsed.detail);
  } catch {
    /* body was not JSON */
  }
  const trimmed = text.trim();
  return trimmed.slice(0, 800) || `上游返回 ${status}`;
}
