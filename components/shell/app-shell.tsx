"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  Bell,
  Factory,
  Layers,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Radar,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AssistantProvider, useAssistant } from "@/components/assistant/assistant-provider";
import { AlertOpsProvider, useAlertOps } from "@/components/dashboard/alert-ops";
import { TelemetryViewProvider } from "@/components/dashboard/view-controls";
import { StatusPill } from "@/components/dashboard/status-pill";
import { activeAlerts, overallStatus, plant } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/capture", label: "捕集", icon: Factory },
  { href: "/transport", label: "运输", icon: Waypoints },
  { href: "/storage", label: "注入封存", icon: Layers },
  { href: "/mva", label: "MVA 监测", icon: Radar },
  { href: "/alerts", label: "告警", icon: Bell },
  { href: "/assistant", label: "碳衡助手", icon: MessagesSquare },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const count = activeAlerts().length;
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
            {item.href === "/alerts" ? (
              <span className="ml-auto rounded-full bg-alarm/15 px-1.5 font-mono text-[11px] text-alarm">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Clock() {
  const [text, setText] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      setText(
        new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Shanghai",
        }).format(new Date()),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="font-mono text-xs text-foreground" aria-label={`${text} Asia/Shanghai`}>
      {text}
      <span className="hidden lg:inline"> Asia/Shanghai</span>
    </span>
  );
}

function Topbar() {
  const { health, dockOpen, setDockOpen } = useAssistant();
  const { role, actor, rejectedRole } = useAlertOps();
  const [menuOpen, setMenuOpen] = useState(false);
  const healthText =
    health?.status === "ok"
      ? "评估服务正常"
      : health?.status === "degraded"
        ? "评估服务降级"
        : health?.status === "mock"
          ? "评估演示流"
          : health
            ? "评估服务未连接"
            : "探测评估服务";
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-[#070b10]/90 px-4 py-3 backdrop-blur">
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className="rounded-md p-2 text-foreground hover:bg-white/5 lg:hidden" aria-label="打开导航">
            <Menu className="h-5 w-5" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-white/10 bg-[#0c1218] p-4">
            <Dialog.Title className="text-sm font-semibold">碳衡</Dialog.Title>
            <Dialog.Description className="mb-4 text-xs text-muted-foreground">全流程监测</Dialog.Description>
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{plant.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {plant.code} · {plant.shift} · 快照 {plant.asOfLabel}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-[11px] text-muted-foreground lg:inline">
          {role === "operator" ? "值班员" : "观察员"} · {actor}
          {rejectedRole ? <span className="ml-1 text-warn">（CCUS_ROLE={rejectedRole} 无法识别）</span> : null}
        </span>
        <StatusPill status={overallStatus()} className="hidden sm:inline-flex" />
        <span className={cn("hidden text-[11px] md:inline", health?.status === "offline" ? "text-alarm" : "text-muted-foreground")}>
          {healthText}
        </span>
        <Clock />
        <button
          type="button"
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground xl:hidden"
          onClick={() => setDockOpen(!dockOpen)}
        >
          助手
        </button>
      </div>
    </header>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { dockOpen, setDockOpen } = useAssistant();
  const assistantPage = pathname === "/assistant";
  return (
    <div className="min-h-dvh">
      <div className="h-1 bg-[linear-gradient(90deg,#ff5d6c_0_16%,#e8b339_16%_38%,#3ee0c5_38%_100%)]" />
      <div className="flex min-h-[calc(100dvh-4px)]">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-white/8 bg-[#0b1117] px-3 py-4 lg:flex">
          <div className="px-2 pb-4">
            <div className="text-lg font-semibold tracking-tight">碳衡</div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">CCUS MONITOR</div>
          </div>
          <NavLinks />
          <div className="mt-auto rounded-lg border border-white/8 px-3 py-3 text-xs leading-5 text-muted-foreground">
            <div className="text-foreground">{plant.operator}</div>
            <div>{plant.site}</div>
            <div>设计 {plant.designCaptureMtA.toFixed(1)} Mt/a</div>
            <div className="mt-1 text-[11px]">演示遥测，非 SCADA</div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
        </div>
        {assistantPage ? null : (
          <>
            {dockOpen ? (
              <button
                type="button"
                aria-label="关闭助手"
                className="fixed inset-0 z-40 bg-black/50 xl:hidden"
                onClick={() => setDockOpen(false)}
              />
            ) : null}
            <aside
              className={cn(
                "z-50 flex h-dvh w-[min(100vw,420px)] shrink-0 flex-col border-l border-white/8 bg-[#0b1117]",
                "fixed inset-y-0 right-0 xl:sticky xl:top-0 xl:z-auto xl:translate-x-0",
                dockOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0",
              )}
            >
              <AssistantPanel layout="dock" />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AssistantProvider>
      <AlertOpsProvider>
        <TelemetryViewProvider>
          <Frame>{children}</Frame>
        </TelemetryViewProvider>
      </AlertOpsProvider>
    </AssistantProvider>
  );
}
