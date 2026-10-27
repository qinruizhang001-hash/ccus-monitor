import { createOpenAI } from "@ai-sdk/openai";

export function assistantMode(): "model" | "local" {
  return process.env.OPENAI_API_KEY?.trim() ? "model" : "local";
}

export function supervisorModelId() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function supervisorModel() {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  });
  return openai(supervisorModelId());
}
