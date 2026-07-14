import type { DecisionCandidate } from "../extract/candidates.js";

export interface DistillPrompt {
  instructions: string;
  payload: string;
}

/**
 * `claude -p` distiller calls get logged as their own sessions under
 * ~/.claude/projects. This sentinel is embedded in every distiller prompt so
 * locate can skip those sessions - otherwise whodecided audits its own
 * distiller output (a feedback loop that surfaces the prompt as a "decision").
 */
export const DISTILLER_SENTINEL = "WHODECIDED_DISTILLER_SESSION_v1";

/**
 * Native language scans faster: when lang is "auto", follow whichever
 * language dominates the user's own messages in the slices.
 */
export function resolveLang(candidates: DecisionCandidate[], lang: "auto" | "zh" | "en"): "zh" | "en" {
  if (lang !== "auto") return lang;
  const userText = candidates
    .flatMap((c) => c.slice.split("\n"))
    .filter((l) => l.includes("] USER"))
    .join("");
  const cjk = (userText.match(/[一-鿿]/g) ?? []).length;
  return cjk > userText.length * 0.1 ? "zh" : "en";
}

export function buildPrompt(candidates: DecisionCandidate[], budget: number, lang: "zh" | "en" = "en"): DistillPrompt {
  const langRule =
    lang === "zh"
      ? 'Write "what", "why", "note" and "alternatives" values in Simplified Chinese (keep code identifiers, commands and product names as-is).'
      : 'Write "what", "why", "note" and "alternatives" values in English.';
  const instructions = `[${DISTILLER_SENTINEL}] You are a decision distiller auditing an AI coding session.

Definition of a decision (the only test that matters):
a reasonable alternative existed, and choosing it would change behavior,
security, or maintenance cost. Purely mechanical actions (fixing typos,
following existing code style) do NOT count.

Compression rules:
1. Keep only decisions that changed the outcome; if deleting the entry does not change the understanding of "what was chosen", drop it.
2. Merge repetition (e.g. 8 rapid approvals in a row -> one entry).
3. Hard budget: at most ${budget} entries total. Exceeding it means your bar is too low.
4. "what" is a single line, commit-message style.

Input: a JSON array of candidates (provided separately). Each has a "ref" (transcript anchor),
a "kind", an "aware" flag, and a "slice" (transcript excerpt).
- kind "question"/"plan"/"veto": an explicit user decision point. Extract WHAT was decided from the slice. For "plan" with bundled=true, unpack the plan into its distinct decisions, one entry each, all sharing that candidate's ref.
- kind "turn": mine the excerpt for SILENT AGENT decisions (technology picks, defaults chosen, edge cases skipped, tests skipped). by="agent", aware=false unless the slice shows the agent explicitly asked the user first.

Output: ONLY a JSON array, no prose, no markdown fence. Each element:
{"id":"D<n>","what":"<one line>","why":"<short reason if recoverable>","by":"agent"|"user","aware":<boolean>,"alternatives":["..."],"reversibility":"low"|"medium"|"high","ref":"<ref of the source candidate>"}
- "ref" MUST be copied exactly from one of the input candidates.
- "aware" for user decisions: copy the candidate's aware flag.
- Omit "why"/"alternatives"/"reversibility" when unknown; never invent.
- ${langRule}`;
  const payload = JSON.stringify(
    candidates.map(({ ref, kind, aware, bundled, latencyMs, slice }) => ({ ref, kind, aware, bundled, latencyMs, slice })),
  );
  return { instructions, payload };
}
