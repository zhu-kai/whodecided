import { relative } from "node:path";
import { loadConfig } from "../config.js";
import { commitFiles } from "../git.js";
import { appendLedgerLines, isPinned, ledgerPath, noteOf, readLedger, verdictOf } from "../ledger/io.js";
import type { RatifyEntry } from "../ledger/schema.js";
import { refreshSync } from "../commands/sync.js";
import type { PatchOp } from "./schema.js";

export interface ApplyResult {
  applied: number;
  skipped: number;
  overturned: number; // newly overturned decisions that now owe a code fix
  synced: string[]; // memory files actually written (empty = nothing pinned/no target)
  commit?: string;
  uncommitted?: boolean;
}

/**
 * The single write path for rulings: validate all ops against the ledger,
 * all-or-nothing, then append ratify lines and commit. Terminal review and
 * the HTML workbench both land here.
 */
export function applyOps(repoRoot: string, ops: PatchOp[]): ApplyResult | string {
  const file = ledgerPath(repoRoot);
  const { entries, ratifies } = readLedger(file);
  const known = new Set(entries.map((e) => e.id));
  const lines: RatifyEntry[] = [];
  let skipped = 0;
  for (const op of ops) {
    if (!known.has(op.target)) return `unknown decision id: ${op.target}`;
    // Latest ratify wins (verdictOf), so changing your mind or refining the
    // note/pin just appends a new line - the ledger keeps the full history.
    // Skip only when nothing actually changed (idempotent re-apply).
    const unchanged =
      verdictOf(ratifies, op.target) === op.verdict &&
      noteOf(ratifies, op.target) === op.note &&
      isPinned(ratifies, op.target) === (op.pin === true);
    if (unchanged) {
      skipped++;
      continue;
    }
    lines.push({
      type: "ratify",
      target: op.target,
      verdict: op.verdict,
      t: new Date().toISOString(),
      ...(op.note !== undefined ? { note: op.note } : {}),
      ...(op.pin !== undefined ? { pin: op.pin } : {}),
    });
  }
  appendLedgerLines(file, lines);
  // Keep the agent-memory precedent digest current if the user opted in.
  const digestPaths = lines.length > 0 ? refreshSync(repoRoot) : [];
  const cfg = loadConfig(repoRoot);
  const paths = [relative(repoRoot, file), ...digestPaths];
  // Commit only when the user asked for it (commit: on). Otherwise the files
  // are written and left for the user to commit — we never touch their history.
  const commit =
    lines.length > 0 && cfg.share === "repo" && cfg.commit === "on"
      ? commitFiles(repoRoot, paths, ratifyMessage(lines))
      : undefined;
  return {
    applied: lines.length,
    skipped,
    overturned: lines.filter((l) => l.verdict === "reject").length,
    synced: digestPaths,
    ...(commit?.sha ? { commit: commit.sha } : {}),
    ...(commit?.ignored ? { uncommitted: true } : {}),
  };
}

function ratifyMessage(lines: RatifyEntry[]): string {
  const accepts = lines.filter((l) => l.verdict === "accept").length;
  const rejects = lines.length - accepts;
  return `wdd ratify: ${accepts} accept, ${rejects} reject`;
}
