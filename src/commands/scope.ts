import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { loadConfig, type Config } from "../config.js";
import { DISTILLER_SENTINEL } from "../distill/prompt.js";
import { branchSinceTime, currentBranch, repoRoot, worktreePaths } from "../git.js";
import { locateSessions } from "../transcript/locate.js";
import { parseTranscript } from "../transcript/parser.js";
import { codexSessionId, isCodexTranscript, locateCodexSessions, parseCodexTranscript } from "../transcript/codex.js";
import { distillerFlag } from "../distill/detect.js";
import { extractCandidates, type DecisionCandidate } from "../extract/candidates.js";

export interface Scope {
  root?: string;
  branch?: string;
  days: number;
  sessionCount: number;
  candidates: DecisionCandidate[];
  config: Config;
}

export function numberFlag(args: string[], name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The shared read-only pipeline head: locate -> parse -> extract.
 * On a feature branch the window starts at the merge-base ("this PR's
 * decisions"); on the default branch it falls back to a day window.
 */
export function resolveScope(args: string[], cwd: string): Scope {
  const root = repoRoot(cwd);
  const config = loadConfig(root);
  const flagCmd = distillerFlag(args);
  if (flagCmd) config.distill = { ...config.distill, cmd: flagCmd };
  const branch = root ? currentBranch(root) : undefined;
  const since = root ? branchSinceTime(root) : undefined;
  const days =
    numberFlag(args, "--days") ??
    (since ? Math.max(1, Math.ceil((Date.now() - Date.parse(since)) / 86_400_000)) : config.review.days);
  const sessions = numberFlag(args, "--sessions") ?? config.review.sessions;

  // Sessions may live under any worktree of this repo, each with its own project slug.
  const roots = root ? [...new Set([root, ...worktreePaths(root)])] : [cwd];
  const projectsDir = process.env.WDD_PROJECTS_DIR ? { projectsDir: process.env.WDD_PROJECTS_DIR } : {};
  const codexDir = process.env.WDD_CODEX_DIR ? { sessionsDir: process.env.WDD_CODEX_DIR } : {};
  // Merge CC and Codex sessions by recency, then cap - naive concat would let
  // one tool's sessions crowd the other's out of the window entirely.
  const files = [
    ...new Set([
      ...roots.flatMap((r) => locateSessions({ cwd: r, days, sessions, ...projectsDir })),
      ...locateCodexSessions({ cwds: roots, days, sessions, ...codexDir }),
    ]),
  ]
    .map((path) => ({ path, mtime: mtimeOf(path) }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, sessions)
    .map((f) => f.path);
  const candidates: DecisionCandidate[] = [];
  let sessionCount = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // Skip whodecided's own distiller sessions (claude -p or codex exec), or it audits its own output.
    if (text.includes(DISTILLER_SENTINEL)) continue;
    sessionCount++;
    const codex = isCodexTranscript(text);
    const session = codex ? codexSessionId(file) : basename(file, ".jsonl").slice(0, 8);
    let events = codex ? parseCodexTranscript(session, text) : parseTranscript(session, text);
    if (since) events = events.filter((e) => !e.t || Date.parse(e.t) >= Date.parse(since));
    if (branch) events = events.filter((e) => !e.branch || e.branch === branch);
    candidates.push(...extractCandidates(events, config.heuristics));
  }
  return { ...(root ? { root } : {}), ...(branch ? { branch } : {}), days, sessionCount, candidates, config };
}

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
