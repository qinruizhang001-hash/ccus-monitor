"use client";

import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UITools } from "ai";
import { HitlPanel } from "@/components/assistant/hitl-panel";
import { Badge } from "@/components/ui/badge";
import { RecoveryList } from "@/components/ops/recovery-list";
import { Button } from "@/components/ui/button";
import { SKILL_LABELS, type SkillName } from "@/lib/assistant/skill-labels";
import { ENGINEER_DISCLAIMER } from "@/lib/ops/disclaimer";
import { cn } from "@/lib/utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-6">
      {text.split("\n").map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-1" />;
        if (line.startsWith("### ") || line.startsWith("## ") || line.startsWith("# ")) {
          const content = line.replace(/^#+\s/, "");
          return (
            <h3 key={index} className="pt-1 text-sm font-semibold">
              {inline(content)}
            </h3>
          );
        }
        if (line.startsWith("> ")) {
          return (
            <p key={index} className="border-l-2 border-warn/50 pl-3 text-warn">
              {inline(line.slice(2))}
            </p>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={index} className="pl-3">
              · {inline(line.slice(2))}
            </p>
          );
        }
        return <p key={index}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function skillLabel(name: string) {
  if (name in SKILL_LABELS) return SKILL_LABELS[name as SkillName];
  return name;
}

export function SkillCard({ part }: { part: ToolUIPart<UITools> | DynamicToolUIPart }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const pending = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";
  const output = part.state === "output-available" ? asRecord(part.output) : null;
  const summary = asText(output?.summary);

  return (
    <article className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={failed ? "alarm" : pending ? "info" : output?.ok === false ? "warn" : "ok"}>
          技能
        </Badge>
        <span className="text-sm font-medium">{skillLabel(name)}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{name}</span>
      </div>
      {pending ? <p className="mt-2 text-xs text-muted-foreground">正在调用这项技能…</p> : null}
      {failed ? <p className="mt-2 text-sm leading-6 text-alarm">{part.errorText}</p> : null}
      {summary ? <p className="mt-2 text-sm leading-6 text-foreground">{summary}</p> : null}
      {output ? <SkillDetails name={name} output={output} input={asRecord("input" in part ? part.input : null)} /> : null}
    </article>
  );
}

function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "值班日报.md";
  link.click();
  URL.revokeObjectURL(url);
}

function SkillDetails({
  name,
  output,
  input,
}: {
  name: string;
  output: Record<string, unknown>;
  input: Record<string, unknown> | null;
}) {
  if (name === "explain_alert") return <ExplainDetails output={output} />;
  if (name === "run_risk_assessment") return <RiskDetails output={output} input={input} />;
  if (name === "draft_ops_report" || name === "draft_shift_handover") {
    const markdown = asText(output.markdown);
    const filename = asText(output.filename) || "值班日报.md";
    return markdown ? (
      <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
        <p className="text-xs leading-5 text-warn">{ENGINEER_DISCLAIMER}</p>
        {name === "draft_shift_handover" ? (
          <p className="text-xs leading-5 text-warn">本交接不是监管报送。</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => downloadMarkdown(filename, markdown)}>
            下载 Markdown
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            打印 / PDF
          </Button>
        </div>
        <div className="print-sheet">
          <RichText text={markdown} />
        </div>
      </div>
    ) : null;
  }
  if (name === "list_alerts") return <AlertLines output={output} />;
  if (name === "check_backend_health") return <HealthDetails output={output} />;
  if (name === "ccus_research_notes") return <ResearchDetails output={output} />;
  return null;
}

function ResearchDetails({ output }: { output: Record<string, unknown> }) {
  const notes = Array.isArray(output.notes) ? output.notes : [];
  if (notes.length === 0) return <p className="mt-2 text-xs text-muted-foreground">知识卡没有对上的条目。</p>;
  return (
    <ul className="mt-2 space-y-2 border-t border-white/8 pt-2">
      {notes.map((item) => {
        const note = asRecord(item);
        if (!note) return null;
        return (
          <li key={asText(note.id)} className="text-xs leading-5 text-muted-foreground">
            <div className="text-sm text-foreground">{asText(note.title)}</div>
            <div className="font-mono text-[11px]">
              {asText(note.standard_id)} · {String(note.year ?? "")} · DOI {note.doi ? asText(note.doi) : "未收录"}
            </div>
            <p>{asText(note.takeaway)}</p>
            {asText(note.url) ? <p className="break-all font-mono text-[11px]">{asText(note.url)}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function AlertLines({ output }: { output: Record<string, unknown> }) {
  const alerts = Array.isArray(output.alerts) ? output.alerts : [];
  if (alerts.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 border-t border-white/8 pt-2 text-xs leading-5 text-muted-foreground">
      {alerts.slice(0, 6).map((item) => {
        const alert = asRecord(item);
        if (!alert) return null;
        return (
          <li key={asText(alert.id)}>
            <span className="font-mono text-primary">{asText(alert.id)}</span> {asText(alert.title)}
            {asText(alert.reading) ? ` · ${asText(alert.reading)}` : ""}
            {asText(alert.threshold) ? ` · 对照 ${asText(alert.threshold)}` : ""}
            {asText(alert.nextCheck) ? ` · 先做 ${asText(alert.nextCheck)}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

function ExplainDetails({ output }: { output: Record<string, unknown> }) {
  const alert = asRecord(output.alert);
  const context = asRecord(output.context);
  if (!alert) return null;
  const causes = Array.isArray(alert.likelyCauses) ? alert.likelyCauses.filter((item) => typeof item === "string") : [];
  const checks = Array.isArray(alert.nextChecks) ? alert.nextChecks.filter((item) => typeof item === "string") : [];
  const related = Array.isArray(context?.related) ? context.related : [];
  return (
    <div className="mt-2 space-y-2 border-t border-white/8 pt-2 text-xs leading-5 text-muted-foreground">
      <p>
        读数 {asText(alert.reading)} · 对照 {asText(alert.threshold)} · {asText(context?.segmentName)}{" "}
        {asText(context?.segmentStatusLabel)}
      </p>
      {asText(context?.trend) ? <p>趋势：{asText(context?.trend)}</p> : null}
      {asText(context?.implication) ? <p className="text-foreground">{asText(context?.implication)}</p> : null}
      {asText(context?.notThis) ? <p className="text-warn">{asText(context?.notThis)}</p> : null}
      {related.length > 0 ? (
        <p>
          同工段：
          {related.map((item) => {
            const row = asRecord(item);
            if (!row) return null;
            return (
              <span key={asText(row.id)} className="ml-2 font-mono text-primary">
                {asText(row.id)}
              </span>
            );
          })}
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 text-foreground">可能原因</div>
          <ul className="list-disc space-y-1 pl-4">
            {causes.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-foreground">建议核查</div>
          <ol className="list-decimal space-y-1 pl-4">
            {checks.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function HealthDetails({ output }: { output: Record<string, unknown> }) {
  const health = asRecord(output.health);
  const checks = asRecord(health?.checks);
  if (!checks) return null;
  return (
    <ul className="mt-2 space-y-1 border-t border-white/8 pt-2 text-xs text-muted-foreground">
      {Object.entries(checks).map(([name, value]) => {
        const check = asRecord(value);
        const ok = check?.ok === true;
        return (
          <li key={name} className="flex gap-2">
            <span className={cn("font-mono", ok ? "text-ok" : "text-alarm")}>{ok ? "正常" : "异常"}</span>
            <span>{name}</span>
            <span>{asText(check?.detail)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function uqLines(uq: Record<string, unknown> | null, decision: Record<string, unknown> | null) {
  const lines: string[] = [];
  if (decision && typeof decision.p === "number") {
    const ci = Array.isArray(decision.p_ci) ? decision.p_ci.filter((item) => typeof item === "number") : [];
    const band = ci.length >= 2 ? `，区间 ${(ci[0] as number).toFixed(2)}–${(ci[1] as number).toFixed(2)}` : "";
    lines.push(`P=${decision.p.toFixed(2)}${band}${decision.n ? `，样本 ${String(decision.n)}` : ""}`);
  }
  if (decision && asText(decision.rule)) lines.push(asText(decision.rule));
  if (uq && asText(uq.note)) lines.push(asText(uq.note));
  return lines;
}

function gateLabel(status: string) {
  if (!status) return "已返回";
  if (status === "passed" || status === "success" || status === "pass") return "通过";
  if (status === "failed" || status === "fail") return "未通过";
  return status;
}

function RiskDetails({ output, input }: { output: Record<string, unknown>; input: Record<string, unknown> | null }) {
  const gate = asRecord(output.quality_gate);
  const physics = asRecord(output.physics_check);
  const decision = asRecord(output.risk_decision);
  const chart = asRecord(output.chart);
  const uq = asRecord(output.uq);
  const running = output.phase === "running";
  const finished = output.phase === "done" || output.phase === "error" || output.phase == null;
  const blocked = physics?.blocking === true || gate?.quarantined === true || output.gate_status === "failed";
  const report = asText(output.report);
  const nodes = Array.isArray(output.nodes) ? output.nodes : [];
  const checks = Array.isArray(physics?.checks) ? physics.checks : [];
  const uncertainty = uqLines(uq, decision);
  const description = asText(input?.project_description);
  return (
    <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
      {nodes.length > 0 ? (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {nodes.map((item) => {
            const node = asRecord(item);
            if (!node) return null;
            const status = asText(node.status);
            return (
              <li key={asText(node.node)} className="flex gap-2">
                <span className={status === "end" ? "text-ok" : "text-warn"}>{status === "end" ? "完成" : "进行中"}</span>
                <span>{asText(node.label) || asText(node.node)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {output.gate_status || gate ? (
        <div className={cn("rounded-md px-2 py-1.5 text-xs", blocked ? "bg-alarm/10 text-alarm" : "bg-ok/10 text-ok")}>
          <p>
            质量闸门 {gateLabel(asText(gate?.status) || asText(output.gate_status))}
            {asText(gate?.reason) ? ` · ${asText(gate?.reason)}` : ""}
          </p>
          <p className="mt-1">
            {blocked
              ? "质量闸门未通过：正文不得当作可交付结论，也不得进入批准。"
              : "质量闸门通过：这只是本次返回的闸门状态，不是持证工程师签字。"}
          </p>
        </div>
      ) : null}
      <p className="text-xs leading-5 text-warn">{asText(output.disclaimer) || ENGINEER_DISCLAIMER}</p>
      {physics && asText(physics.summary) ? (
        <p className="text-xs leading-5 text-muted-foreground">物理校验：{asText(physics.summary)}</p>
      ) : null}
      {decision ? (
        <p className="text-xs leading-5 text-muted-foreground">
          风险决策 {asText(decision.level_label) || asText(decision.level)}
          {asText(decision.label) ? ` · ${asText(decision.label)}` : ""}
          {asText(decision.text) ? `：${asText(decision.text)}` : ""}
        </p>
      ) : null}
      {uncertainty.length > 0 ? (
        <div className="rounded-md bg-white/5 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          <div className="text-foreground">不确定性</div>
          {uncertainty.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {checks.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {checks.map((item) => {
            const check = asRecord(item);
            if (!check) return null;
            return (
              <li key={asText(check.code) || asText(check.detail)}>
                <span className={check.ok === false ? "text-alarm" : "text-ok"}>{check.ok === false ? "未过" : "通过"}</span>{" "}
                {asText(check.detail)}
              </li>
            );
          })}
        </ul>
      ) : null}
      {chart && (asText(chart.summary) || asText(chart.verdict)) ? (
        <p className="text-xs leading-5 text-muted-foreground">
          曲线 {asText(chart.verdict)}
          {asText(chart.summary) ? `：${asText(chart.summary)}` : ""}
        </p>
      ) : null}
      {asText(output.analyze_thread_id) ? (
        <p className="font-mono text-[11px] text-muted-foreground">分析线程 {asText(output.analyze_thread_id)} · 不能批准</p>
      ) : null}
      {asText(output.note) ? <p className="text-xs leading-5 text-warn">{asText(output.note)}</p> : null}
      {asText(output.requestId) ? (
        <p className="font-mono text-[11px] text-muted-foreground">请求 {asText(output.requestId)} · Asia/Shanghai</p>
      ) : null}
      {Array.isArray(output.recovery) ? (
        <RecoveryList steps={output.recovery.filter((item) => typeof item === "string")} />
      ) : null}
      {report ? (
        <div>
          {running ? <p className="mb-1 text-[11px] text-muted-foreground">成稿中</p> : null}
          <RichText text={running ? report.slice(-360) : report} />
        </div>
      ) : null}
      {finished && description ? <HitlPanel projectDescription={description} /> : null}
    </div>
  );
}
