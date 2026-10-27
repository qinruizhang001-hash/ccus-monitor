import { registerAnalyzeThread } from "@/lib/petro/threads";

export function trackAnalyzeStream(stream: ReadableStream<Uint8Array>, requestId: string) {
  const decoder = new TextDecoder();
  let buffer = "";
  const tracked = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as { thread_id?: unknown };
            if (typeof json.thread_id === "string" && json.thread_id) {
              registerAnalyzeThread(json.thread_id, requestId);
            }
          } catch {
            /* partial or non-JSON frame */
          }
        }
        controller.enqueue(chunk);
      },
    }),
  );
  const meta = `data: ${JSON.stringify({ type: "meta", request_id: requestId })}\n\n`;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(meta));
      const reader = tracked.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
