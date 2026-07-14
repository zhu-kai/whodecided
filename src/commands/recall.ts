import { repoRoot } from "../git.js";
import { ledgerPath, readLedger, verdictOf } from "../ledger/io.js";
import type { DecisionEntry, RatifyEntry } from "../ledger/schema.js";

const MAX_HITS = 20;

export interface RecallHit {
  entry: DecisionEntry;
  verdict: "accept" | "reject" | undefined;
}

export interface RecallQuery {
  term: string;
  branch?: string | undefined;
  includePending?: boolean;
}

/**
 * The precedent invariant: a hit is precedent only if a human ruled on it.
 * Distillation is a filing, not law; the ratify line is the seal. So this
 * excludes pending (unruled) entries by default, which stops an agent from
 * treating its own unreviewed guess as authority. `includePending` is a
 * human-only inspection escape hatch and is never used by the /recall skill.
 */
export function recallHits(entries: DecisionEntry[], ratifies: RatifyEntry[], q: RecallQuery): RecallHit[] {
  const term = q.term.toLowerCase();
  return entries
    .map((entry) => ({ entry, verdict: verdictOf(ratifies, entry.id) }))
    .filter(({ entry, verdict }) => {
      if (q.branch && entry.branch !== q.branch) return false;
      if (!q.includePending && verdict === undefined) return false;
      return haystack(entry).includes(term);
    });
}

export function recall(args: string[]): number {
  const term = args.find((a) => !a.startsWith("--"));
  if (!term) {
    process.stderr.write("usage: wdd recall <term> [--branch <name>] [--all]\n");
    return 1;
  }
  const branch = args.includes("--branch") ? args[args.indexOf("--branch") + 1] : undefined;
  const includePending = args.includes("--all") || args.includes("--pending");

  const root = repoRoot(process.cwd());
  if (!root) {
    process.stderr.write("wdd recall: not inside a git repo\n");
    return 1;
  }
  const { entries, ratifies } = readLedger(ledgerPath(root));
  const hits = recallHits(entries, ratifies, { term, branch, includePending });

  if (hits.length === 0) {
    const pending = includePending
      ? 0
      : recallHits(entries, ratifies, { term, branch, includePending: true }).length;
    process.stdout.write(`no ratified precedent for "${term}"`);
    process.stdout.write(pending > 0 ? ` (${pending} pending, see --all)\n` : "\n");
    return 0;
  }
  for (const { entry, verdict } of hits.slice(0, MAX_HITS)) {
    const mark = verdict === "accept" ? "✅" : verdict === "reject" ? "❌" : "⏳";
    const parts = [entry.what, entry.why, entry.model, entry.branch, entry.ref].filter(Boolean);
    process.stdout.write(`${mark} ${entry.id.padEnd(4)} ${parts.join(" · ")}\n`);
  }
  if (hits.length > MAX_HITS) process.stdout.write(`(+${hits.length - MAX_HITS} more)\n`);
  return 0;
}

function haystack(e: DecisionEntry): string {
  return [e.id, e.what, e.why, e.note, ...(e.alternatives ?? [])].join(" ").toLowerCase();
}
