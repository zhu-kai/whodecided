import type { SessionEvent } from "../transcript/parser.js";
import { redact } from "./redact.js";

export interface DecisionCandidate {
  ref: string;
  kind: "question" | "plan" | "veto" | "turn";
  aware: boolean;
  t?: string;
  cwd?: string;
  model?: string;
  latencyMs?: number;
  bundled?: boolean;
  files?: string[]; // code files the agent touched in this decision's turn
  summary: string;
  slice: string;
}

export interface Heuristics {
  reflexMs: number;
}

export const DEFAULT_HEURISTICS: Heuristics = { reflexMs: 3000 };

// File-editing tools whose input is a path (grounds "what" in actual code); apply_patch is Codex's.
const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "Update", "apply_patch"]);

function filesTouched(events: SessionEvent[]): string[] {
  const files: string[] = [];
  for (const e of events) {
    if (e.kind === "tool_use" && e.toolName && FILE_TOOLS.has(e.toolName) && e.text && !files.includes(e.text)) {
      files.push(e.text);
    }
  }
  return files.slice(0, 8);
}

const MAX_SLICE_LINES = 200;
const MAX_LINE_CHARS = 240;

/**
 * Deterministic candidate extraction, no LLM. Two kinds of output:
 * explicit user decision points (question/plan/veto, with clean latency where
 * the tool blocks on the human), and per-turn slices for the distiller to
 * mine silent agent decisions from.
 */
export function extractCandidates(
  events: SessionEvent[],
  heuristics: Heuristics = DEFAULT_HEURISTICS,
): DecisionCandidate[] {
  const candidates: DecisionCandidate[] = [];
  // Decision anchors are often user events (which carry no model); track the
  // model of the most recent assistant turn so each candidate records which
  // model was acting when the decision was made.
  let activeModel: string | undefined;
  for (const e of events) {
    if (e.model) activeModel = e.model;
    if (e.kind === "question_response") {
      candidates.push({
        ref: ref(e),
        kind: "question",
        aware: e.latencyMs === undefined || e.latencyMs >= heuristics.reflexMs,
        ...anchor(e, activeModel),
        latencyMs: e.latencyMs,
        summary: firstLine(e.text),
        slice: sliceAround(events, e),
      });
    } else if (e.kind === "plan_approval") {
      // Latency evidence is one-sided: fast proves blind, slow proves nothing
      // (the user may have been away). Approval alone never earns aware:true.
      candidates.push({
        ref: ref(e),
        kind: "plan",
        aware: false,
        ...anchor(e, activeModel),
        latencyMs: e.latencyMs,
        bundled: true,
        summary: firstLine(e.text),
        slice: sliceAround(events, e),
      });
    } else if (e.kind === "tool_result" && e.rejected) {
      candidates.push({
        ref: ref(e),
        kind: "veto",
        aware: true,
        ...anchor(e, activeModel),
        summary: `rejected ${e.toolName ?? "tool"}`,
        slice: sliceAround(events, e),
      });
    }
  }
  candidates.push(...turnSlices(events));
  return candidates;
}

function ref(e: SessionEvent): string {
  return `tx:${e.session}:${e.line}`;
}

function anchor(e: SessionEvent, model?: string): { t?: string; cwd?: string; model?: string } {
  return { ...(e.t ? { t: e.t } : {}), ...(e.cwd ? { cwd: e.cwd } : {}), ...(model ? { model } : {}) };
}

function firstLine(text: string | undefined): string {
  return (text ?? "").split("\n")[0]?.slice(0, 120) ?? "";
}

/** Compact excerpt of the events surrounding one decision point. */
function sliceAround(events: SessionEvent[], center: SessionEvent): string {
  const i = events.indexOf(center);
  return renderSlice(events.slice(Math.max(0, i - 15), i + 3));
}

/** One candidate per user turn: the distiller mines agent decisions from it. */
function turnSlices(events: SessionEvent[]): DecisionCandidate[] {
  const turns: DecisionCandidate[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const turn = events.slice(start, end);
    const first = turn[0];
    if (!first || turn.length < 2) return;
    // The turn's agent decisions come from its assistant events; record the
    // last model that acted within the turn.
    const turnModel = turn.filter((e) => e.model).at(-1)?.model;
    const files = filesTouched(turn);
    turns.push({
      ref: ref(first),
      kind: "turn",
      aware: false,
      ...anchor(first, turnModel),
      ...(files.length ? { files } : {}),
      summary: firstLine(first.text),
      slice: renderSlice(turn),
    });
  };
  events.forEach((e, i) => {
    if (e.kind === "user_text") {
      flush(i);
      start = i;
    }
  });
  flush(events.length);
  return turns;
}

function renderSlice(events: SessionEvent[]): string {
  const lines: string[] = [];
  for (const e of events) {
    if (lines.length >= MAX_SLICE_LINES) break;
    const tag =
      e.kind === "user_text" ? "USER" :
      e.kind === "assistant_text" ? "AGENT" :
      e.kind === "tool_use" ? `TOOL ${e.toolName}` :
      e.kind === "tool_result" && e.rejected ? "USER-REJECTED" :
      e.kind === "question_response" ? "USER-ANSWERED" :
      e.kind === "plan_approval" ? "USER-APPROVED-PLAN" :
      null;
    if (tag === null) continue;
    const text = (e.text ?? "").replace(/\s+/g, " ").slice(0, MAX_LINE_CHARS);
    lines.push(`[${e.line}] ${tag}: ${text}`);
  }
  // Redact secrets before this excerpt reaches the distiller or persisted evidence.
  return redact(lines.join("\n"));
}
