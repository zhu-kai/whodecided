import type { DecisionEntry } from "../ledger/schema.js";
import type { Churn } from "../git.js";

export interface Risk {
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
}

// Fallback for pre-tag entries; the primary signal is the distiller's "assumption" tag.
const ASSUMPTION = /\b(assum|pending|unverif|guess|not sure|tentative|temporar|revisit|TODO|FIXME)/i;

/** Normalized Shannon entropy of changed lines across files (Hassan, ICSE 2009). */
function scatter(churn: number[]): number {
  const total = churn.reduce((s, c) => s + c, 0);
  if (total === 0 || churn.length < 2) return 0;
  const h = -churn.reduce((s, c) => (c > 0 ? s + (c / total) * Math.log2(c / total) : s), 0);
  return h / Math.log2(churn.length);
}

/** Review-priority score from ledger fields + branch churn. No LLM. */
export function riskScore(e: DecisionEntry, churn: Churn[] = []): Risk {
  const reasons: string[] = [];
  let score = 0;
  if (e.by === "agent" && !e.aware) { score += 35; reasons.push("silent (AI decided, never confirmed)"); }
  if (e.reversibility === "low") { score += 25; reasons.push("hard to reverse"); }
  else if (e.reversibility === "medium") { score += 12; }
  const hedged = e.tags?.includes("assumption") || ASSUMPTION.test(`${e.what} ${e.why ?? ""}`);
  if (hedged) { score += 20; reasons.push("stated as an assumption"); }

  const changed = churn.filter((c) => c.abs > 0);
  const total = changed.reduce((s, c) => s + c.abs, 0);
  if (changed.length > 0) {
    score += Math.min(total / 150, 1) * 18;
    if (total >= 120) reasons.push(`${total} lines changed`);
    const maxRel = Math.max(...changed.map((c) => c.rel));
    if (maxRel >= 0.5) { score += maxRel * 16; reasons.push(`rewrote ${Math.round(maxRel * 100)}% of a file`); }
    if (changed.length >= 3) { score += scatter(changed.map((c) => c.abs)) * 12; reasons.push(`spread across ${changed.length} files`); }
  } else {
    const fanout = e.files?.length ?? 0;
    if (fanout >= 3) { score += Math.min(fanout * 4, 18); reasons.push(`touches ${fanout} files`); }
  }
  const level = score >= 60 ? "high" : score >= 32 ? "medium" : "low";
  return { score: Math.round(score), level, reasons };
}
