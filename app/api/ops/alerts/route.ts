import { connection } from "next/server";
import { alertOpsMap, applyAlertAction, verifyChain, type AlertAction } from "@/lib/ops/alert-ops";
import { requestIdFrom } from "@/lib/ops/request-id";
import { opsSession } from "@/lib/ops/session";
import { withRequest } from "@/lib/petro/respond";

const ACTIONS: AlertAction[] = ["ack", "silence", "unsilence", "escalate"];

export async function GET(request: Request) {
  await connection();
  const requestId = requestIdFrom(request);
  const session = opsSession();
  return withRequest(
    {
      role: session.role,
      actor: session.actor,
      // 角色写错时把原值带出去。不发这个字段，前端就只能显示「当前是观察员」，
      // 而用户以为配的是 operator —— 他会去查令牌、查上游，唯独不会想到是拼错了。
      ...(session.rejectedRole ? { rejectedRole: session.rejectedRole } : {}),
      timezone: "Asia/Shanghai",
      provenance: "演示数据",
      records: alertOpsMap(),
      // 有哈希，和哈希对得上，是两件事。这里把核对结果一起发出去。
      chain: verifyChain(),
    },
    requestId,
  );
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const body = (await request.json().catch(() => null)) as {
    alertId?: string;
    action?: string;
    note?: string;
    confirm?: string;
    secondConfirm?: boolean;
  } | null;
  const action = body?.action;
  if (!body?.alertId || !action || !ACTIONS.includes(action as AlertAction)) {
    return withRequest(
      {
        error: "bad_request",
        message: "需要 alertId，以及 ack、silence、unsilence 或 escalate。",
        recovery: ["静默必须带原因。严重告警静默还要两次确认。严重告警的确认只对值班员开放。"],
      },
      requestId,
      400,
    );
  }
  const result = applyAlertAction({
    alertId: body.alertId,
    action: action as AlertAction,
    note: body.note,
    confirm: body.confirm,
    secondConfirm: body.secondConfirm,
  });
  if (!result.ok) {
    return withRequest(
      { error: result.error, message: result.message, recovery: result.recovery },
      requestId,
      result.status,
    );
  }
  return withRequest({ record: result.record, role: opsSession().role, actor: opsSession().actor }, requestId);
}
