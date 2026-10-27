import { connection } from "next/server";
import { alertsCsv } from "@/lib/ops/alert-ops";

export async function GET() {
  await connection();
  return new Response(alertsCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ccus-alerts.csv"',
    },
  });
}
