import { OPS_FIXTURE } from "../ops/inventory";
import { ALERTS, SEGMENTS, SNAP, plant } from "../telemetry";
import { RESEARCH_FIXTURE } from "../research/notes";

export const UNKNOWN_CLAIM = "未知/需接入数据源";

export type GroundingCitation = {
  skill?: string;
  source: string;
  as_of: string;
  snapshot_id: string;
};

export type GroundingResult = {
  skill: "grounding_check";
  ok: boolean;
  summary: string;
  source: "依据核对";
  as_of: string;
  confidence: "high" | "low";
  snapshot_id: string;
  citations: GroundingCitation[];
  flags: string[];
  answer: string;
};

const UNIT = String.raw`(?:MPa|bar|ppm|GJ\/t|t\/h|%|Mt|℃|°C|MW|km|Nm³\/h)`;
const NUMBER_UNIT = new RegExp(String.raw`\d+(?:\.\d+)?\s*${UNIT}`, "g");
const WELLHEAD = /井口压力\s*(\d+(?:\.\d+)?)\s*MPa/g;
const TAG = /\b(?:IW|GW|VS|ALM)-[A-Za-z0-9]+\b/g;
const DOI = /\b10\.\d{4,9}\/[^\s，。；、]+/g;
const ISO = /\bISO\s*\d{4,5}(?::\d{4})?/gi;
const CSA = /\bCSA\s*Z\d+(?::\d+)?(?:\s*\(R\d{4}\))?/gi;

function addNumbers(value: unknown, into: Set<number>) {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(value);
    return;
  }
  if (typeof value === "string") {
    for (const match of value.matchAll(/\d+(?:\.\d+)?/g)) into.add(Number(match[0]));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addNumbers(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) addNumbers(item, into);
  }
}

function fixtureNumbers(evidenceText?: string) {
  const into = new Set<number>();
  addNumbers(SNAP, into);
  addNumbers(plant, into);
  addNumbers(ALERTS, into);
  addNumbers(SEGMENTS, into);
  addNumbers(RESEARCH_FIXTURE, into);
  addNumbers(OPS_FIXTURE, into);
  if (evidenceText) addNumbers(evidenceText, into);
  return into;
}

function numberAllowed(raw: string, allowed: Set<number>) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return false;
  for (const item of allowed) {
    if (Object.is(item, value) || Math.abs(item - value) <= 1e-9) return true;
  }
  return false;
}

function knownTags() {
  const tags = new Set<string>();
  for (const alert of ALERTS) {
    tags.add(alert.id.toUpperCase());
    for (const part of alert.equipment.split(/[/·,\s]+/)) {
      if (/^(?:IW|GW|VS|ALM)-/i.test(part)) tags.add(part.toUpperCase());
    }
  }
  for (const segment of SEGMENTS) {
    for (const item of segment.equipment) {
      if (/^(?:IW|GW|VS|ALM)-/i.test(item.tag)) tags.add(item.tag.toUpperCase());
    }
  }
  return tags;
}

function knownStandards() {
  return RESEARCH_FIXTURE.notes.map((note) => note.standard_id.replace(/\s+/g, "").toUpperCase());
}

function standardAllowed(token: string, evidenceText?: string) {
  const compact = token.replace(/\s+/g, "").toUpperCase();
  const listed = knownStandards().some(
    (known) => known === compact || known.startsWith(`${compact}:`) || compact.startsWith(known),
  );
  if (listed) return true;
  if (!evidenceText) return false;
  return evidenceText.replace(/\s+/g, "").toUpperCase().includes(compact);
}

function replaceTagged(input: string, pattern: RegExp, flags: string[], replace: (match: string) => string) {
  return input.replace(pattern, (match) => {
    const next = replace(match);
    if (next.includes(UNKNOWN_CLAIM) && next !== match) flags.push(match);
    return next;
  });
}

function citationFooter(citations: GroundingCitation[], toolsUsed: boolean) {
  if (citations.length === 0) {
    return toolsUsed ? "" : `\n\n依据：${UNKNOWN_CLAIM}`;
  }
  const lines = citations.map((item) => {
    const skill = item.skill ? `${item.skill} · ` : "";
    return `${skill}${item.source} · ${item.snapshot_id}${item.as_of ? ` · ${item.as_of}` : ""}`;
  });
  return `\n\n依据：${lines.join("；")}`;
}

export function groundingCheck(
  draft: string,
  options: { toolsUsed: boolean; citations?: GroundingCitation[]; evidenceText?: string },
): GroundingResult {
  const flags: string[] = [];
  const toolsUsed = options.toolsUsed;
  const allowed = fixtureNumbers(toolsUsed ? options.evidenceText : undefined);
  const tags = knownTags();
  let answer = draft;

  answer = replaceTagged(answer, WELLHEAD, flags, (match) => {
    const value = match.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "";
    if (!toolsUsed || !numberAllowed(value, allowed)) return `井口压力 ${UNKNOWN_CLAIM}`;
    return match;
  });
  answer = replaceTagged(answer, NUMBER_UNIT, flags, (match) => {
    const value = match.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "";
    if (!toolsUsed || !numberAllowed(value, allowed)) return UNKNOWN_CLAIM;
    return match;
  });
  answer = replaceTagged(answer, TAG, flags, (match) => {
    if (!toolsUsed) return UNKNOWN_CLAIM;
    return tags.has(match.toUpperCase()) ? match.toUpperCase() : UNKNOWN_CLAIM;
  });
  const evidenceText = toolsUsed ? options.evidenceText : undefined;
  answer = replaceTagged(answer, DOI, flags, (match) => {
    if (evidenceText && evidenceText.includes(match)) return match;
    return UNKNOWN_CLAIM;
  });
  answer = replaceTagged(answer, ISO, flags, (match) => {
    if (!toolsUsed || !standardAllowed(match, evidenceText)) return UNKNOWN_CLAIM;
    return match;
  });
  answer = replaceTagged(answer, CSA, flags, (match) => {
    if (!toolsUsed || !standardAllowed(match, evidenceText)) return UNKNOWN_CLAIM;
    return match;
  });

  const citations = options.citations ?? [];
  answer = `${answer.trim()}${citationFooter(citations, toolsUsed)}`;
  const ok = flags.length === 0;
  return {
    skill: "grounding_check",
    ok,
    summary: ok
      ? "依据核对通过。数字和标准号能对上本轮技能或知识卡。"
      : `依据核对未通过：${flags.length} 处说法对不上技能返回或知识卡，已改为${UNKNOWN_CLAIM}。`,
    source: "依据核对",
    as_of: toolsUsed ? (citations[0]?.as_of || plant.asOf) : plant.asOf,
    confidence: toolsUsed && ok ? "high" : "low",
    snapshot_id: citations[0]?.snapshot_id || plant.snapshotId,
    citations,
    flags,
    answer,
  };
}
