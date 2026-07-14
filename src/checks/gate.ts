import type { DecisionCandidate } from "../extract/candidates.js";
import type { DecisionEntry, RatifyEntry } from "../ledger/schema.js";
import { verdictOf } from "../ledger/io.js";
import type { Watermark } from "../distill/watermark.js";

export interface GateStatus {
  fresh: boolean;
  staleSessions: string[];
  pendingSilent: string[];
  green: boolean;
}

export function gateStatus(
  entries: DecisionEntry[],
  ratifies: RatifyEntry[],
  candidates: DecisionCandidate[],
  watermark: Watermark,
): GateStatus {
  const stale = new Set<string>();
  for (const c of candidates) {
    const [, session, line] = c.ref.split(":");
    if (session && Number(line) > (watermark[session] ?? 0)) stale.add(session);
  }
  const pendingSilent = entries
    .filter((e) => !e.aware && verdictOf(ratifies, e.id) === undefined)
    .map((e) => e.id);
  return {
    fresh: stale.size === 0,
    staleSessions: [...stale],
    pendingSilent,
    green: stale.size === 0 && pendingSilent.length === 0,
  };
}
