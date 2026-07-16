import type { DecisionEntry } from "../ledger/schema.js";
import { SECONDARY_FILE } from "./coverage.js";

export interface Link {
  revises?: string; // an earlier decision this one walks back
  revisedBy?: string; // a later decision that walked this one back
  shared: string[]; // the files both decisions touched - the evidence for the link
}

// Fallback for pre-tag entries; the primary signal is the distiller's "reversal" tag.
// No "back to": "fall back to X" is a fallback strategy, not a walked-back decision.
const REVERSAL = /\b(revert|revers|instead of|no longer|supersed|replac|rolled back|walk(ed)? back|switch)/i;

const isReversal = (e: DecisionEntry): boolean =>
  e.tags?.includes("reversal") || REVERSAL.test(`${e.what} ${e.why ?? ""}`);

// Weighted overlap: shared source files count double a shared test/config file.
function weightedOverlap(a: string[], b: string[]): { score: number; files: string[] } {
  const files = a.filter((x) => b.includes(x));
  const score = files.reduce((s, f) => s + (SECONDARY_FILE.test(f) ? 1 : 2), 0);
  return { score, files };
}

/** Link a reversal decision to the one earlier decision it walks back (best weighted file overlap, score >= 2). */
export function supersedeLinks(entries: DecisionEntry[], filesOf: (e: DecisionEntry) => string[]): Map<string, Link> {
  const links = new Map<string, Link>();
  const byTime = [...entries].sort((a, b) => (a.t ?? "").localeCompare(b.t ?? ""));
  for (let i = 0; i < byTime.length; i++) {
    const later = byTime[i]!;
    if (!isReversal(later)) continue;
    const lFiles = filesOf(later);
    if (!lFiles.length) continue;
    let best: DecisionEntry | undefined;
    let bestScore = 0;
    let bestFiles: string[] = [];
    for (let j = 0; j < i; j++) {
      const earlier = byTime[j]!;
      if (earlier.ref === later.ref) continue;
      const { score, files } = weightedOverlap(lFiles, filesOf(earlier));
      // >= so ties go to the most recent earlier decision - the likelier one to be walked back
      if (score >= bestScore && score > 0) { bestScore = score; best = earlier; bestFiles = files; }
    }
    if (best && bestScore >= 2) {
      links.set(later.id, { ...links.get(later.id), revises: best.id, shared: bestFiles });
      links.set(best.id, { ...links.get(best.id), revisedBy: later.id, shared: bestFiles });
    }
  }
  return links;
}
