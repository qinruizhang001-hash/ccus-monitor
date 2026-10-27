import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { connection } from "next/server";
import { runLocalSupervisor } from "@/lib/assistant/local-supervisor";
import { assistantMode, supervisorModel, supervisorModelId } from "@/lib/assistant/model";
import { SUPERVISOR_INSTRUCTIONS } from "@/lib/assistant/prompt";
import { supervisorTools } from "@/lib/assistant/tools";

export const maxDuration = 300;

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : "碳衡助手这次没有完成。";
}

export async function GET() {
  await connection();
  return Response.json({
    mode: assistantMode(),
    model: supervisorModelId(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { messages?: UIMessage[] } | null;
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "请先输入问题。" }, { status: 400 });
  }
  for (const message of messages) {
    if (!message || typeof message !== "object" || !Array.isArray(message.parts)) {
      return Response.json({ error: "消息缺少 parts，助手无法读取问题。" }, { status: 400 });
    }
  }

  if (assistantMode() === "local") {
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        await runLocalSupervisor(writer, messages, request.signal);
      },
      onError: errorText,
    });
    return createUIMessageStreamResponse({ stream });
  }

  const result = streamText({
    model: supervisorModel(),
    system: SUPERVISOR_INSTRUCTIONS,
    messages: await convertToModelMessages(messages, { tools: supervisorTools }),
    tools: supervisorTools,
    stopWhen: isStepCount(6),
    abortSignal: request.signal,
    timeout: {
      totalMs: 280_000,
      toolMs: 240_000,
    },
    onError: ({ error }) => {
      console.error("assistant model error", errorText(error));
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: errorText,
  });
}
