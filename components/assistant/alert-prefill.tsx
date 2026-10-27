"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAssistant } from "@/components/assistant/assistant-provider";
import { explainPrompt } from "@/lib/telemetry";

export function AlertPrefill() {
  const searchParams = useSearchParams();
  const { setInput } = useAssistant();
  const prefillKey = useRef("");

  useEffect(() => {
    const alertId = searchParams.get("alert");
    const query = searchParams.get("q");
    const key = `${alertId ?? ""}|${query ?? ""}`;
    if (!alertId && !query) return;
    if (prefillKey.current === key) return;
    prefillKey.current = key;
    setInput(query || (alertId ? explainPrompt(alertId) : ""));
  }, [searchParams, setInput]);

  return null;
}
