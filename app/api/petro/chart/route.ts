import { connection } from "next/server";
import { petroConfig } from "@/lib/petro/config";
import { mockPressureSvg } from "@/lib/petro/mock";

const SAFE_PATH = /^charts\/[A-Za-z0-9._-]+$/;

export async function GET(request: Request) {
  await connection();
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!SAFE_PATH.test(path)) {
    return new Response("图表路径无效", { status: 400 });
  }
  const { baseUrl, mock } = petroConfig();
  if (mock || path.endsWith("mock_pressure_curve.svg")) {
    return new Response(mockPressureSvg(), {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  try {
    const upstream = await fetch(`${baseUrl}/${path}`, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return new Response("上游没有这张图。经 nginx :8080 时 /charts 可能没有转发到 FastAPI。", {
        status: upstream.status || 502,
      });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("读取图表失败", { status: 502 });
  }
}
