export type OpsRole = "operator" | "viewer";

export type OpsSession = {
  role: OpsRole;
  actor: string;
  /**
   * CCUS_ROLE 设了但不认识时，原样保留在这里。
   *
   * 存在的理由：权限兜底只能往更严格的方向走。`raw === "viewer" ? "viewer" : "operator"`
   * 会把 `operater`、`admin`、`值班员` 这些拼错全部**静默升级**成最高权限 ——
   * 一个想设成观察员的部署，因为少写一个字母，反而拿到了批准 HITL 与确认严重告警的权力。
   * 这类错误不会报错、不会写日志，界面上一切正常，只是权限错了。
   * 所以：认不出来的值一律按 viewer 处理，并把原始值带出来让界面说出来。
   */
  rejectedRole?: string;
};

const KNOWN: OpsRole[] = ["operator", "viewer"];

function actorFor(role: OpsRole) {
  const fallback = role === "viewer" ? "观察员" : "值班员";
  return (process.env.CCUS_OPERATOR_NAME || fallback).trim() || fallback;
}

export function opsSession(): OpsSession {
  // 没设 = 走文档写明的默认（README 与 .env.example 都写着默认 operator）。
  // 设了但不认识 = 拼写错误，必须降级。这两件事不一样，不能合并成一个分支。
  const raw = (process.env.CCUS_ROLE ?? "").trim();
  if (!raw) return { role: "operator", actor: actorFor("operator") };

  const normalized = raw.toLowerCase();
  if ((KNOWN as string[]).includes(normalized)) {
    const role = normalized as OpsRole;
    return { role, actor: actorFor(role) };
  }
  return { role: "viewer", actor: actorFor("viewer"), rejectedRole: raw };
}

export function isOperator(session: OpsSession = opsSession()) {
  return session.role === "operator";
}

/**
 * 给一条 403/拒绝文案补上「你的角色写错了」这一句。
 *
 * 不加这一句，用户看到的是「当前是观察员」——而他自己以为配的是 operator。
 * 他接下来会去查令牌、查上游、重启进程，唯独不会想到是环境变量拼错了。
 */
export function denialMessage(base: string, session: OpsSession = opsSession()) {
  if (!session.rejectedRole) return base;
  return `${base} 另外：CCUS_ROLE=${session.rejectedRole} 无法识别，已按观察员处理。可用的值是 operator 或 viewer。`;
}
