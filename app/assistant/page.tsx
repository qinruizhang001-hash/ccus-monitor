import { Suspense } from "react";
import { AlertPrefill } from "@/components/assistant/alert-prefill";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export const metadata = { title: "碳衡助手" };

export default function AssistantPage() {
  return (
    <div className="h-[calc(100dvh-7.5rem)] min-h-[640px] overflow-hidden rounded-xl border border-white/8 bg-[#0b1117]">
      <Suspense fallback={null}>
        <AlertPrefill />
      </Suspense>
      <AssistantPanel layout="page" />
    </div>
  );
}
