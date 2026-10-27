import Link from "next/link";
import { StatusPill } from "@/components/dashboard/status-pill";
import { SEGMENTS } from "@/lib/telemetry";

export function PipelineStrip() {
  return (
    <div className="panel overflow-x-auto rounded-xl p-3">
      <div className="flex min-w-[720px] items-stretch gap-2">
        {SEGMENTS.map((segment, index) => (
          <div key={segment.id} className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              href={segment.href}
              className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{segment.name}</span>
                <StatusPill status={segment.status} />
              </div>
              <div className="font-mono text-lg tracking-tight text-foreground">{segment.primary}</div>
              <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{segment.summary}</p>
            </Link>
            {index < SEGMENTS.length - 1 ? (
              <svg width="42" height="16" viewBox="0 0 42 16" aria-hidden className="shrink-0">
                <line className="flow-line" x1="0" y1="8" x2="42" y2="8" stroke="#3ee0c5" strokeWidth="1.5" />
              </svg>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
