import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gateStatus } from "../checks/gate.js";
import { loadWatermark, watermarkPath } from "../distill/watermark.js";
import { ledgerPath, readLedger, verdictOf } from "../ledger/io.js";
import { renderWorkbench, type RepoView } from "../render/html.js";
import { parseTrace } from "../trace/schema.js";
import { resolveScope } from "./scope.js";

/**
 * Read-only multi-repo overview: one static page aggregating every repo's
 * ledger, traces, and gate status. No distilling, no LLM calls; rulings
 * happen inside each repo via `wdd review`.
 */
export function board(args: string[]): number {
  const explicit = args.filter((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out");
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? (args[outIdx + 1] ?? "wdd-board.html") : "wdd-board.html";

  const roots = (explicit.length > 0 ? explicit.map((p) => resolve(p)) : discover(process.cwd())).filter((p) =>
    existsSync(ledgerPath(p)),
  );
  if (roots.length === 0) {
    process.stderr.write("no repos with a .wdd/ledger.jsonl found (pass paths explicitly or run in their parent dir)\n");
    return 1;
  }

  const repos: RepoView[] = roots.map((root) => {
    const scope = resolveScope([], root);
    const { entries, ratifies } = readLedger(ledgerPath(root));
    const scoped = scope.branch ? entries.filter((e) => !e.branch || e.branch === scope.branch) : entries;
    const tracePath = join(root, ".wdd", "trace.jsonl");
    const slices: Record<string, string> = {};
    for (const c of scope.candidates) slices[c.ref] = c.slice.slice(0, 4000);
    return {
      repo: basename(root),
      root,
      branch: scope.branch,
      entries: scoped.map((e) => ({ ...e, verdict: verdictOf(ratifies, e.id) })),
      traces: existsSync(tracePath) ? parseTrace(readFileSync(tracePath, "utf8")).values : [],
      slices,
      gate: gateStatus(scoped, ratifies, scope.candidates, loadWatermark(watermarkPath(root))),
    };
  });

  const pending = repos.reduce((s, r) => s + r.entries.filter((e) => !e.verdict).length, 0);
  writeFileSync(out, renderWorkbench({ title: `board · ${repos.length} repos`, interactive: false, repos }));
  process.stdout.write(`board written: ${out} (${repos.length} repos, ${pending} pending rulings)\n`);
  return 0;
}

/** Default discovery: immediate subdirectories of cwd that carry a ledger. */
function discover(cwd: string): string[] {
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => join(cwd, d.name));
  } catch {
    return [];
  }
}
