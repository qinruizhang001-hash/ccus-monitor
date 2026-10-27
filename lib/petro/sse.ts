import type { PetroSseEvent } from "@/lib/petro/types";

export async function* iterateSse(response: Response): AsyncGenerator<PetroSseEvent> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("评估服务没有返回可读的事件流。");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      yield JSON.parse(data) as PetroSseEvent;
    }
  }
}

export async function readSse(response: Response, onEvent: (event: PetroSseEvent) => void) {
  for await (const event of iterateSse(response)) onEvent(event);
}
