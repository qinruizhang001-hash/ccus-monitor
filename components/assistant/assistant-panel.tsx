"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { useAssistant } from "@/components/assistant/assistant-provider";
import { RichText, SkillCard } from "@/components/assistant/skill-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function riskWaitSeconds(until: number) {
  const now = Date.now();
  if (now >= until) return 0;
  return Math.ceil((until - now) / 1000);
}

function nextRiskCooldown() {
  return Date.now() + 20_000;
}

const SUGGESTIONS = [
  "现在全流程什么情况？",
  "解释告警 ALM-2041",
  "写一份值班简报",
  "本班质量衡算怎么样？",
  "写一份交接班记录",
  "ISO 27914 对地质封存怎么要求？",
  "评估服务是否在线？",
  "用当前工况做封存风险评估",
];

type CitationItem = { skill?: string; source: string; as_of?: string; snapshot_id: string };

function citationsIn(message: UIMessage) {
  const items: CitationItem[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part) || getToolName(part) !== "grounding_check" || part.state !== "output-available") continue;
    const output = part.output as { citations?: CitationItem[] } | undefined;
    if (!Array.isArray(output?.citations)) continue;
    for (const item of output.citations) {
      if (!item?.snapshot_id || !item.source) continue;
      const key = `${item.skill ?? ""}:${item.snapshot_id}`;
      if (items.some((existing) => `${existing.skill ?? ""}:${existing.snapshot_id}` === key)) continue;
      items.push(item);
    }
  }
  return items;
}

function CitationList({ items }: { items: CitationItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] tracking-wide text-muted-foreground">依据</div>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={`${item.skill ?? "skill"}-${item.snapshot_id}`} className="text-[11px] leading-5 text-muted-foreground">
            <span className="text-foreground">{item.source}</span>
            {item.skill ? ` · ${item.skill}` : ""} · <span className="font-mono">{item.snapshot_id}</span>
            {item.as_of ? ` · ${item.as_of}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AssistantPanel({ layout }: { layout: "dock" | "page" }) {
  const { chat, input, setInput, mode, model, ask } = useAssistant();
  const { messages, sendMessage, status, stop, error, clearError } = chat;
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState("");
  const riskCooldown = useRef(0);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  async function submit(text: string) {
    const next = text.trim();
    if (!next || busy) return;
    const risk = /风险评估|封存风险|完整性|物理闸门|analyze/i.test(next);
    const wait = risk ? riskWaitSeconds(riskCooldown.current) : 0;
    if (wait > 0) {
      setHold(`评估刚提交过。请 ${wait} 秒后再发，避免连点。`);
      return;
    }
    clearError();
    setHold("");
    if (risk) riskCooldown.current = nextRiskCooldown();
    setInput("");
    await sendMessage({ text: next });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={cn("font-semibold", layout === "page" ? "text-xl" : "text-base")}>碳衡助手</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">一个主管，按问题调用技能。监测页仍是演示遥测。</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[11px] text-muted-foreground">
            {mode === "model" ? `模型调度 · ${model ?? ""}` : mode === "local" ? "本地调度" : "正在确认调度方式"}
          </span>
        </div>
        {mode === "local" ? (
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            未配置 OPENAI_API_KEY。助手仍按你的问题调用同一套技能，不经过大模型。
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              可以问全流程工况、某一条告警、值班简报，或让它把描述转给 petro-rag-agent 做风险评估。技能名称会标在每条结果上。
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full border border-white/10 px-3 py-1.5 text-left text-xs text-foreground hover:border-primary/40 hover:text-primary"
                  onClick={() => void submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-full space-y-2",
                message.role === "user"
                  ? "max-w-[92%] rounded-2xl bg-primary/12 px-3 py-2 text-sm leading-6"
                  : "w-full",
              )}
            >
              {message.role === "user" ? (
                message.parts.map((part, index) =>
                  part.type === "text" ? <p key={index}>{part.text}</p> : null,
                )
              ) : (
                message.parts.map((part, index) => {
                  if (part.type === "text" && part.text.trim()) {
                    return <RichText key={`${message.id}-text-${index}`} text={part.text} />;
                  }
                  if (isToolUIPart(part)) {
                    return <SkillCard key={part.toolCallId} part={part} />;
                  }
                  return null;
                })
              )}
              {message.role === "assistant" ? <CitationList items={citationsIn(message)} /> : null}
            </div>
          </div>
        ))}

        {hold ? <p className="text-sm leading-6 text-warn">{hold}</p> : null}
        {error ? (
          <div className="rounded-lg border border-alarm/40 bg-alarm/10 px-3 py-2 text-sm leading-6 text-alarm">
            {error.message || "助手请求失败。"}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-white/8 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(input);
            }
          }}
          rows={layout === "page" ? 4 : 3}
          placeholder="问工况、告警、知识卡，或贴一段项目描述做风险评估"
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:border-primary/50"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => ask("现在全流程什么情况？")}>
            填入总览问题
          </button>
          <div className="flex gap-2">
            {busy ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => stop()}>
                停止
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={busy || !input.trim()}>
              发送
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
