import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTrace } from "../trace/schema.js";
import { createInterface } from "node:readline/promises";
import { distill, type DistillOptions } from "../distill/distiller.js";
import { spinner } from "./distill.js";
import type { DecisionCandidate } from "../extract/candidates.js";
import { isPinned, ledgerPath, noteOf, readLedger, verdictOf } from "../ledger/io.js";
import type { DecisionEntry } from "../ledger/schema.js";
import { applyOps } from "../patch/apply.js";
import type { RatifyOp } from "../patch/schema.js";
import { renderWorkbench } from "../render/html.js";
import { renderDocket } from "../render/term.js";
import { IGNORED_MSG, runIncrementalDistill } from "./distill.js";
import { resolveScope } from "./scope.js";

export async function review(args: string[]): Promise<number> {
  const distillOnly = args.includes("--distill-only");
  process.stderr.write("scanning your Claude Code sessions…\n");
  const scope = resolveScope(args, process.cwd());

  if (scope.sessionCount === 0) {
    process.stderr.write(`no CC sessions found for ${process.cwd()} in the last ${scope.days} days\n`);
    return 1;
  }
  process.stderr.write(`${scope.sessionCount} session(s) · ${scope.candidates.length} decision candidate(s)\n`);

  if (distillOnly || !scope.root) {
    if (!distillOnly) {
      process.stderr.write("not inside a git repo; running read-only (--distill-only)\n");
    }
    return distillOnlyPath(scope.candidates, header(scope.sessionCount, scope.days, scope.branch), scope.config.distill);
  }

  const root = scope.root;
  const result = await runIncrementalDistill(scope, root, true);
  if (result.degraded) process.stderr.write(`distiller degraded (${result.degraded}); ledger not updated\n`);
  else if (result.added > 0) process.stderr.write(`distilled +${result.added} new decision(s)\n`);
  if (result.uncommitted) process.stderr.write(IGNORED_MSG + "\n");

  const { entries, ratifies, errors } = readLedger(ledgerPath(root));
  for (const e of errors) process.stderr.write(`ledger line ${e.line} skipped: ${e.message}\n`);
  const scoped = scope.branch ? entries.filter((e) => !e.branch || e.branch === scope.branch) : entries;
  if (scoped.length === 0) {
    process.stdout.write("no decisions on the ledger for this scope\n");
    return 0;
  }

  const head = header(scope.sessionCount, scope.days, scope.branch, scoped.length);

  // Terminal three-column + interactive ratify, only when explicitly asked.
  if (args.includes("--term")) {
    process.stdout.write(renderDocket(scoped, head) + "\n");
    const pending = scoped.filter((e) => !e.aware && verdictOf(ratifies, e.id) === undefined);
    if (pending.length === 0 || !process.stdin.isTTY || !process.stdout.isTTY) return 0;
    return ratifyLoop(root, pending);
  }

  // Build the workbench data once; serve it live (default) or write it static.
  const slices: Record<string, string> = {};
  for (const c of scope.candidates) slices[c.ref] = c.slice.slice(0, 4000);
  const tracePath = join(root, ".wdd", "trace.jsonl");
  const traces = existsSync(tracePath) ? parseTrace(readFileSync(tracePath, "utf8")).values : [];
  const repoName = root.split("/").pop() ?? root;
  const repoView = {
    repo: repoName,
    root,
    branch: scope.branch,
    entries: scoped.map((e) => ({
      ...e,
      verdict: verdictOf(ratifies, e.id),
      ...(noteOf(ratifies, e.id) ? { ruleNote: noteOf(ratifies, e.id) } : {}),
      ...(isPinned(ratifies, e.id) ? { pinned: true } : {}),
    })),
    traces,
    slices,
  };
  const title = scope.branch ? `${repoName} · ${scope.branch}` : repoName;
  const memory = scope.config.sync?.targets ?? [];

  // Static snapshot: --html, or non-interactive (CI). Rulings export → wdd apply.
  const staticMode = args.includes("--html") || !process.stdout.isTTY;
  if (staticMode) {
    const dir = join(root, ".wdd", "reports");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${(scope.branch ?? "repo").replace(/[^a-zA-Z0-9]/g, "-")}-${dateStamp()}.html`);
    writeFileSync(file, renderWorkbench({ title, interactive: false, live: false, memory, repos: [repoView] }));
    process.stdout.write(`snapshot: ${file}\nread-only · open it to view or Download as Markdown · run wdd review to make rulings\n`);
    return 0;
  }

  // Default: ephemeral local server — rulings POST straight to the ledger. No
  // daemon: it dies when you Ctrl-C. This is the only surface that accepts writes.
  const html = renderWorkbench({ title, interactive: true, live: true, memory, repos: [repoView] });
  return serveWorkbench(html, root, !args.includes("--no-open"));
}

/**
 * Serve the workbench on 127.0.0.1:<random port> until Ctrl-C. GET / returns
 * the page; POST /apply lands rulings through the one write path (applyOps).
 * Stdlib http only, no dependency, localhost-only, no persistence.
 */
function serveWorkbench(html: string, root: string, open: boolean): Promise<number> {
  const server = createServer((req, res) => {
    if (req.method === "GET") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    if (req.method === "POST" && req.url === "/apply") {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        try {
          const result = applyOps(root, JSON.parse(body));
          res.end(JSON.stringify(typeof result === "string" ? { error: result } : result));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
      process.stdout.write(`workbench: ${url}\nrule there — Approve/Reject save straight to the ledger · Ctrl-C when done\n`);
      if (open) openInBrowser(url);
    });
    const stop = () => {
      server.close();
      resolve(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

/** Open a URL/file in the default browser, detached; best-effort. */
function openInBrowser(target: string): boolean {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [target], { detached: true, stdio: "ignore", shell: process.platform === "win32" }).unref();
    return true;
  } catch {
    return false;
  }
}

async function ratifyLoop(root: string, pending: DecisionEntry[]): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ops: RatifyOp[] = [];
  try {
    for (const e of pending) {
      const answer = (await rl.question(`${e.id} ${e.what}  [a]ccept [r]eject [n]ote [s]kip [q]uit > `)).trim();
      if (answer === "q") break;
      if (answer === "a") ops.push({ op: "ratify", target: e.id, verdict: "accept" });
      else if (answer === "r") ops.push({ op: "ratify", target: e.id, verdict: "reject" });
      else if (answer === "n") {
        const note = await rl.question("note > ");
        const verdict = (await rl.question("verdict [a/r] > ")).trim() === "r" ? "reject" : "accept";
        ops.push({ op: "ratify", target: e.id, verdict, note });
      }
    }
  } finally {
    rl.close();
  }
  if (ops.length === 0) return 0;
  const result = applyOps(root, ops);
  if (typeof result === "string") {
    process.stderr.write(`apply failed: ${result}\n`);
    return 1;
  }
  process.stdout.write(`saved ${result.applied} ruling(s)${result.commit ? ` → commit ${result.commit}` : ""}\n`);
  if (result.uncommitted) process.stderr.write(IGNORED_MSG + "\n");
  if (result.overturned > 0)
    process.stdout.write(`↳ ${result.overturned} rejected - AI won't repeat these; the code fix is separate work\n`);
  return 0;
}

async function distillOnlyPath(
  candidates: DecisionCandidate[],
  head: string,
  opts: DistillOptions,
): Promise<number> {
  if (candidates.length === 0) {
    process.stdout.write("no decision candidates found\n");
    return 0;
  }
  const stop = spinner(`distilling ${candidates.length} candidate(s) with ${opts.cmd.join(" ")} — can take ~10-60s`);
  const { entries, degraded } = await distill(candidates, opts);
  stop();
  if (degraded) {
    process.stderr.write(`distiller degraded (${degraded}); showing raw candidates\n\n`);
    for (const c of candidates.filter((c) => c.kind !== "turn")) {
      process.stdout.write(`  ${c.aware ? "✓" : "⚠"} [${c.kind}] ${c.summary}  (${c.ref})\n`);
    }
    return 0;
  }
  process.stdout.write(renderDocket(entries, head) + "\n");
  return 0;
}

function header(sessions: number, days: number, branch?: string, count?: number): string {
  const parts = [count !== undefined ? `${count} decisions` : "", `${sessions} session(s)`, branch ? `branch ${branch}` : `last ${days}d`].filter(Boolean);
  return `${process.cwd().split("/").pop()}  [${parts.join(" | ")}]`;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
