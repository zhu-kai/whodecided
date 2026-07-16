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
  const cjk = (userText.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return cjk > userText.length * 0.1 ? "zh" : "en";
}

export function buildPrompt(
  candidates: DecisionCandidate[],
  budget: number,
  lang: "zh" | "en" = "en",
  known: string[] = [],
): DistillPrompt {
  // Prose follows the user's language; machine-readable semantics travel in language-neutral "tags".
  const langRule =
    lang === "zh"
      ? 'Write "what", "why", "note" and "alternatives" values in Simplified Chinese (keep code identifiers, commands and product names as-is).'
      : 'Write "what", "why", "note" and "alternatives" values in English.';
  const instructions = `[${DISTILLER_SENTINEL}] You are a decision distiller auditing an AI coding session.

THE TEST for a decision (apply it to every entry you emit):
a reasonable alternative existed, AND choosing it changes behavior, security,
or maintenance cost. Mechanical actions (typo fixes, following existing style,
running commands) are not decisions. Documenting or summarizing a decision
that was already made earlier is not a new decision.

What to extract per candidate kind:
- "question"/"plan"/"veto": an explicit user decision point - extract WHAT was
  chosen, not what was discussed. For "plan" with bundled=true, unpack into
  distinct decisions (one entry each, all sharing that candidate's ref).
- "turn": mine the excerpt for SILENT AGENT decisions. High-value finds:
  defaults picked without asking, edge cases or errors deliberately skipped,
  tests skipped/weakened, security/privacy tradeoffs, stated assumptions,
  dependency or API choices, and reversals of an earlier approach.
  by="agent"; aware=true only if the slice shows the user explicitly confirmed.

Field discipline:
- "what": one line, commit-message style - the choice, not the activity.
- "why": the constraint or tradeoff that drove the choice; never restate "what".
- "alternatives": the options that were realistically on the table.
- "reversibility": how costly to undo AFTER merge (low = hard to undo, e.g.
  schema/API/data; high = trivial, e.g. an internal rename).

Compression:
1. If deleting an entry would not change a reviewer's understanding of what was chosen, delete it.
2. Merge repetition (e.g. 8 rapid approvals in a row -> one entry).
3. Hard budget: at most ${budget} entries. Exceeding it means your bar is too low.
${knownBlock(known)}
Output: ONLY a JSON array, no prose, no markdown fence. Each element:
{"id":"D<n>","what":"<one line>","why":"<short>","by":"agent"|"user","aware":<boolean>,"alternatives":["..."],"reversibility":"low"|"medium"|"high","tags":["assumption"|"reversal"],"ref":"<ref>"}
- "ref" MUST be copied exactly from one of the input candidates.
- "aware" for user decisions: copy the candidate's aware flag.
- "tags" (language-independent, judge by MEANING regardless of the session's language):
  "assumption" = the choice rests on an unverified premise (pending verification, tentative, "for now").
  "reversal" = it walks back, replaces, or switches away from an earlier approach.
  Omit "tags" when neither applies.
- Omit "why"/"alternatives"/"reversibility" when unknown; never invent.
- ${langRule}`;
  const payload = JSON.stringify(
    candidates.map(({ ref, kind, aware, bundled, latencyMs, slice }) => ({ ref, kind, aware, bundled, latencyMs, slice })),
  );
  return { instructions, payload };
}

/** Cross-session dedup: refs differ across sessions, so only meaning can dedup. */
function knownBlock(known: string[]): string {
  if (known.length === 0) return "";
  const list = known.slice(-40).map((w) => `  - ${w.replace(/\n/g, " ").slice(0, 160)}`).join("\n");
  return `\nAlready on the ledger from earlier sessions:\n${list}\nDo NOT re-extract an entry that merely restates, documents, or summarizes one of these. Extract it only if it CHANGES, extends, or reverses the recorded choice.\n`;
}
