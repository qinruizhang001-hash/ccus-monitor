import { connection } from "next/server";
import { threadCounts } from "@/lib/petro/threads";
import { probePetroHealth } from "@/lib/petro/upstream";
import { riskIntervalMs } from "@/lib/ops/rate-limit";
import { createRequestId } from "@/lib/ops/request-id";
import { opsSession } from "@/lib/ops/session";
import { TELEMETRY_EXTENSION, telemetrySource } from "@/lib/ops/telemetry-source";
import { ageHours, formatShanghai, OPS_TIMEZONE } from "@/lib/ops/time";
import { plant } from "@/lib/telemetry";

export async function GET() {
  await connection();
  const requestId = createRequestId();
  const session = opsSession();
  const petro = await probePetroHealth();
  const degraded = petro.status === "offline" || petro.status === "degraded";
  const age = ageHours(plant.asOf);
  return Response.json(
    {
      status: degraded ? "degraded" : "ok",
      service: "ccus-monitor",
      request_id: requestId,
      time: formatShanghai(new Date(), true),
      timezone: OPS_TIMEZONE,
      role: session.role,
      actor: session.actor,
      telemetry: {
        source: telemetrySource.kind,
        sourceLabel: telemetrySource.label,
        scada: false,
        connected: telemetrySource.connected,
        asOf: plant.asOf,
        asOfLabel: plant.asOfLabel,
        timezone: OPS_TIMEZONE,
        stale: true,
        ageHours: age,
        extension: TELEMETRY_EXTENSION,
      },
      petro,
      hitl: threadCounts(),
      limits: { riskMinIntervalMs: riskIntervalMs() },
    },
    { headers: { "X-Request-Id": requestId } },
  );
}
