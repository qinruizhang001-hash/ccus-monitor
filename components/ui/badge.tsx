import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
  {
    variants: {
      tone: {
        neutral: "border-white/10 bg-white/5 text-muted-foreground",
        ok: "border-ok/30 bg-ok/10 text-ok",
        warn: "border-warn/30 bg-warn/10 text-warn",
        alarm: "border-alarm/30 bg-alarm/10 text-alarm",
        info: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
