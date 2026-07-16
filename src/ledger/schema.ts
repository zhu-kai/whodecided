import { parseJsonl, type JsonlResult } from "../jsonl.js";
import { isIsoTimestamp, isNonEmptyString, isOptionalString, isRecord } from "../validate.js";

export interface DecisionEntry {
  id: string;
  what: string;
  by: "agent" | "user";
  aware: boolean;
  ref: string;
  t?: string;
  cwd?: string;
  model?: string;
  latencyMs?: number;
  why?: string;
  note?: string;
  alternatives?: string[];
  reversibility?: "low" | "medium" | "high";
  branch?: string;
  precedent?: string;
  files?: string[]; // code files touched in this decision's turn, for grounding
  // Language-neutral semantic markers from the distiller; checks match on these, keyword regexes are fallback.
  tags?: ("assumption" | "reversal")[];
}

export interface RatifyEntry {
  type: "ratify";
  target: string;
  verdict: "accept" | "reject";
  t: string;
  note?: string;
  // Promote this decision into the agent memory file(s) configured in sync.
  // Most rulings are audit-only (not pinned); only core rules get pinned.
  pin?: boolean;
}

export type LedgerLine = DecisionEntry | RatifyEntry;

const REF_PATTERN = /^tx:[^\s:]+:\d+$/;
const REVERSIBILITIES = ["low", "medium", "high"];

export function isRatify(line: LedgerLine): line is RatifyEntry {
  return "type" in line && line.type === "ratify";
}

export function parseLedgerLine(value: unknown): LedgerLine | string {
  if (!isRecord(value)) return "not an object";
  return value.type === "ratify" ? parseRatify(value) : parseDecision(value);
}

export function parseLedger(text: string): JsonlResult<LedgerLine> {
  return parseJsonl(text, parseLedgerLine);
}

function parseDecision(v: Record<string, unknown>): DecisionEntry | string {
  if (!isNonEmptyString(v.id)) return "id: non-empty string required";
  if (!isNonEmptyString(v.what) || v.what.includes("\n")) return "what: non-empty single line required";
  if (v.by !== "agent" && v.by !== "user") return 'by: "agent" or "user" required';
  if (typeof v.aware !== "boolean") return "aware: boolean required";
  if (typeof v.ref !== "string" || !REF_PATTERN.test(v.ref)) return "ref: tx:<session>:<line> required";
  for (const key of ["why", "note", "branch", "precedent", "t", "cwd", "model"]) {
    if (!isOptionalString(v[key])) return `${key}: string expected`;
  }
  for (const key of ["alternatives", "files"]) {
    if (v[key] !== undefined && !(Array.isArray(v[key]) && (v[key] as unknown[]).every((a) => typeof a === "string"))) {
      return `${key}: string array expected`;
    }
  }
  if (v.reversibility !== undefined && !REVERSIBILITIES.includes(v.reversibility as string)) {
    return 'reversibility: "low" | "medium" | "high" expected';
  }
  if (v.latencyMs !== undefined && typeof v.latencyMs !== "number") return "latencyMs: number expected";
  if (v.tags !== undefined) {
    if (!Array.isArray(v.tags)) return "tags: array expected";
    v.tags = (v.tags as unknown[]).filter((x) => x === "assumption" || x === "reversal");
  }
  // Extra fields pass through untouched: hand edits and future fields must survive.
  return v as unknown as DecisionEntry;
}

function parseRatify(v: Record<string, unknown>): RatifyEntry | string {
  if (!isNonEmptyString(v.target)) return "target: non-empty string required";
  if (v.verdict !== "accept" && v.verdict !== "reject") return 'verdict: "accept" or "reject" required';
  if (!isIsoTimestamp(v.t)) return "t: ISO timestamp required";
  if (!isOptionalString(v.note)) return "note: string expected";
  if (v.pin !== undefined && typeof v.pin !== "boolean") return "pin: boolean expected";
  return v as unknown as RatifyEntry;
}
