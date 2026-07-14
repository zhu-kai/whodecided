import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LineError } from "../jsonl.js";
import { isRatify, parseLedger, type DecisionEntry, type LedgerLine, type RatifyEntry } from "./schema.js";

export interface Ledger {
  entries: DecisionEntry[];
  ratifies: RatifyEntry[];
  errors: LineError[];
}

export function ledgerPath(repoRoot: string): string {
  return join(repoRoot, ".wdd", "ledger.jsonl");
}

export function readLedger(file: string): Ledger {
  if (!existsSync(file)) return { entries: [], ratifies: [], errors: [] };
  const { values, errors } = parseLedger(readFileSync(file, "utf8"));
  return {
    entries: values.filter((l): l is DecisionEntry => !isRatify(l)),
    ratifies: values.filter(isRatify),
    errors,
  };
}

/** Single atomic append; also drops a .gitignore for the cache dir on first write. */
export function appendLedgerLines(file: string, lines: LedgerLine[]): void {
  if (lines.length === 0) return;
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitignore"), ".cache/\n");
  }
  appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

/** Latest ratify wins per target. */
export function verdictOf(ratifies: RatifyEntry[], id: string): "accept" | "reject" | undefined {
  for (let i = ratifies.length - 1; i >= 0; i--) {
    if (ratifies[i]?.target === id) return ratifies[i]?.verdict;
  }
  return undefined;
}

/** Whether the latest ratify pinned this decision into agent memory. */
export function isPinned(ratifies: RatifyEntry[], id: string): boolean {
  for (let i = ratifies.length - 1; i >= 0; i--) {
    if (ratifies[i]?.target === id) return ratifies[i]?.pin === true;
  }
  return false;
}

/** The latest ratify's note for this decision (user's supplement to the rule). */
export function noteOf(ratifies: RatifyEntry[], id: string): string | undefined {
  for (let i = ratifies.length - 1; i >= 0; i--) {
    if (ratifies[i]?.target === id) return ratifies[i]?.note;
  }
  return undefined;
}

export interface Followup {
  entry: DecisionEntry;
  correction?: string; // the ratify note: "what to do instead"
}

/**
 * The v2 seam. Overturning records "this was the wrong call" but never touches
 * code (honest v1 boundary). This returns the decisions ruled `reject` together
 * with the correction note, i.e. the work still owed. v1 surfaces it (apply
 * reminder, report section); a v2 task layer consumes it to spawn follow-up
 * tickets. Shape is stable so the task adapter binds to this, not to internals.
 */
export function followups(entries: DecisionEntry[], ratifies: RatifyEntry[]): Followup[] {
  const out: Followup[] = [];
  for (const entry of entries) {
    if (verdictOf(ratifies, entry.id) !== "reject") continue;
    const note = lastRejectNote(ratifies, entry.id);
    out.push({ entry, ...(note ? { correction: note } : {}) });
  }
  return out;
}

function lastRejectNote(ratifies: RatifyEntry[], id: string): string | undefined {
  for (let i = ratifies.length - 1; i >= 0; i--) {
    if (ratifies[i]?.target === id && ratifies[i]?.verdict === "reject") return ratifies[i]?.note;
  }
  return undefined;
}

export function nextDecisionNumber(entries: DecisionEntry[]): number {
  let max = 0;
  for (const e of entries) {
    const m = /^D(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
