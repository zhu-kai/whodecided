import { relative } from "node:path";
import { distill } from "../distill/distiller.js";
import { NO_DISTILLER_MSG, resolveDistiller } from "../distill/detect.js";
import { loadWatermark, saveWatermark, watermarkPath, type Watermark } from "../distill/watermark.js";
import type { DecisionCandidate } from "../extract/candidates.js";
import { commitFiles } from "../git.js";
import { appendLedgerLines, ledgerPath, nextDecisionNumber, readLedger } from "../ledger/io.js";
import { appendEvidence, evidencePath } from "../ledger/evidence.js";
import { resolveScope, type Scope } from "./scope.js";

export interface DistillRunResult {
  added: number;
  degraded?: string;
  uncommitted?: boolean; // ledger written to disk but .wdd is gitignored
}

/**
 * Incremental distill: everything past the watermark, deduped by ref,
 * appended and committed. Shared by `wdd review` and headless `wdd distill`
 * (which the Stop hook spawns for near-real-time logging).
 */
export async function runIncrementalDistill(scope: Scope, root: string, progress = false): Promise<DistillRunResult> {
  const wmFile = watermarkPath(root);
  const watermark = loadWatermark(wmFile);
  const fresh = scope.candidates.filter((c) => lineOf(c.ref) > (watermark[sessionOf(c.ref)] ?? 0));
  if (fresh.length === 0) {
    if (progress) process.stderr.write("no new decisions since last review\n");
    return { added: 0 };
  }

  const distiller = resolveDistiller(scope.config.distill.cmd, fresh);
  if (!distiller) return { added: 0, degraded: NO_DISTILLER_MSG };
  const file = ledgerPath(root);
  const existing = readLedger(file).entries; // told to the distiller for cross-session dedup
  const stop = progress
    ? spinner(`distilling ${fresh.length} new candidate(s) with ${distiller.cmd.join(" ")} — can take ~10-60s`)
    : () => {};
  const { entries, degraded } = await distill(fresh, { ...scope.config.distill, cmd: distiller.cmd }, existing.map((e) => e.what));
  stop();
  if (degraded) return { added: 0, degraded };

  let added = 0;
  if (entries.length > 0) {
    const existingRefs = new Set(existing.map((e) => e.ref));
    const novel = entries.filter((e) => !existingRefs.has(e.ref));
    let n = nextDecisionNumber(existing);
    const byRef = new Map(scope.candidates.map((c) => [c.ref, c]));
    const numbered = novel.map((e) => {
      const c = byRef.get(e.ref);
      return {
        ...e,
        id: `D${n++}`,
        ...(scope.branch ? { branch: scope.branch } : {}),
        ...(c?.t ? { t: c.t } : {}),
        ...(c?.cwd ? { cwd: c.cwd } : {}),
        // The model is the decider only for agent decisions; for a user
        // decision the human decided, so recording a model would mislead.
        ...(c?.model && e.by === "agent" ? { model: c.model } : {}),
        ...(c?.latencyMs !== undefined && e.by === "user" ? { latencyMs: c.latencyMs } : {}),
        ...(c?.files && c.files.length ? { files: c.files } : {}),
      };
    });
    appendLedgerLines(file, numbered);
    const evFile = evidencePath(root);
    const wroteEvidence = appendEvidence(
      evFile,
      numbered.map((e) => ({ ref: e.ref, excerpt: byRef.get(e.ref)?.slice ?? "" })).filter((x) => x.excerpt),
    );
    added = numbered.length;
    // Auto-commit only when the user opted in; otherwise leave it in the tree.
    if (scope.config.share === "repo" && scope.config.commit === "on") {
      const paths = [relative(root, file), ...(wroteEvidence ? [relative(root, evFile)] : [])];
      const commit = commitFiles(root, paths, `wdd distill: +${numbered.length} decisions`);
      if (commit.ignored) {
        advanceWatermark(watermark, scope.candidates);
        saveWatermark(wmFile, watermark);
        return { added, uncommitted: true };
      }
    }
  }
  advanceWatermark(watermark, scope.candidates);
  saveWatermark(wmFile, watermark);
  return { added };
}

/** Shown when .wdd is gitignored: data is safe on disk, just not versioned. */
export const IGNORED_MSG =
  "⚠ .wdd is gitignored, so the audit trail is written to disk but NOT committed.\n" +
  "  The audit is meant to travel with your code - remove `.wdd` from .gitignore to version it.\n" +
  "  (Or keep it local-only; your ledger stays readable at .wdd/ledger.jsonl either way.)";

/** `wdd distill`: headless incremental distill, safe to run from hooks. */
export async function distillCmd(args: string[]): Promise<number> {
  const quiet = args.includes("--quiet");
  const scope = resolveScope(args, process.cwd());
  if (!scope.root) {
    if (!quiet) process.stderr.write("wdd distill: not inside a git repo\n");
    return quiet ? 0 : 1;
  }
  const result = await runIncrementalDistill(scope, scope.root);
  if (!quiet) {
    if (result.degraded) process.stderr.write(`distiller degraded: ${result.degraded}\n`);
    if (result.uncommitted) process.stderr.write(IGNORED_MSG + "\n");
    process.stdout.write(`+${result.added} decisions\n`);
  }
  return 0;
}

/** Minimal stderr spinner while a blocking step runs; returns a stop function. */
export function spinner(label: string): () => void {
  if (!process.stderr.isTTY) {
    process.stderr.write(label + "\n");
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => process.stderr.write(`\r${frames[i++ % frames.length]} ${label}`), 90);
  return () => {
    clearInterval(timer);
    process.stderr.write("\r\x1b[K"); // clear the spinner line
  };
}

function sessionOf(ref: string): string {
  return ref.split(":")[1] ?? "";
}

function lineOf(ref: string): number {
  return Number(ref.split(":")[2] ?? 0);
}

function advanceWatermark(watermark: Watermark, candidates: DecisionCandidate[]): void {
  for (const c of candidates) {
    const s = sessionOf(c.ref);
    watermark[s] = Math.max(watermark[s] ?? 0, lineOf(c.ref));
  }
}
