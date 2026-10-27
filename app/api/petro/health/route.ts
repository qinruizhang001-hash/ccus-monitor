import { connection } from "next/server";
import { probePetroHealth } from "@/lib/petro/upstream";

export async function GET() {
  await connection();
  const health = await probePetroHealth();
  return Response.json(health);
}
