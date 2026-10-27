import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "碳衡 · CCUS 全流程监测",
    template: "%s · 碳衡",
  },
  description:
    "捕集、运输、注入封存与 MVA 监测驾驶舱。碳衡助手是唯一主管，按技能读取遥测并把风险评估转发给 petro-rag-agent。",
};

export const viewport: Viewport = {
  themeColor: "#070b10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
