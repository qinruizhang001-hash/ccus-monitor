"use client";

import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import type { PetroHealth } from "@/lib/petro/types";

type AssistantContextValue = {
  chat: ReturnType<typeof useChat>;
  input: string;
  setInput: (value: string) => void;
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  ask: (text: string) => void;
  health: PetroHealth | null;
  mode: "model" | "local" | null;
  model: string | null;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const value = use(AssistantContext);
  if (!value) throw new Error("碳衡助手还没有挂上。");
  return value;
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [chatStore] = useState(
    () =>
      new Chat({
        transport: new DefaultChatTransport({ api: "/api/assistant" }),
      }),
  );
  const chat = useChat({ chat: chatStore });
  const [input, setInput] = useState("");
  const [dockOpen, setDockOpen] = useState(false);
  const [health, setHealth] = useState<PetroHealth | null>(null);
  const [mode, setMode] = useState<"model" | "local" | null>(null);
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async () => {
      try {
        const response = await fetch("/api/petro/health", { cache: "no-store" });
        const body = (await response.json()) as PetroHealth;
        if (!cancelled) setHealth(body);
      } catch {
        if (!cancelled) {
          setHealth({
            reachable: false,
            mock: false,
            status: "offline",
            baseUrl: "",
            authConfigured: false,
            message: "健康检查请求没有发出去。",
            checks: null,
          });
        }
      }
    };
    const loadMode = async () => {
      try {
        const response = await fetch("/api/assistant", { cache: "no-store" });
        const body = (await response.json()) as { mode?: "model" | "local"; model?: string };
        if (!cancelled) {
          setMode(body.mode === "model" ? "model" : "local");
          setModel(body.model ?? null);
        }
      } catch {
        if (!cancelled) setMode("local");
      }
    };
    void loadHealth();
    void loadMode();
    const timer = window.setInterval(() => void loadHealth(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const ask = useCallback(
    (text: string) => {
      setInput(text);
      if (pathname !== "/assistant") setDockOpen(true);
    },
    [pathname],
  );

  return (
    <AssistantContext value={{ chat, input, setInput, dockOpen, setDockOpen, ask, health, mode, model }}>
      {children}
    </AssistantContext>
  );
}
