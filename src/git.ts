import { execFileSync } from "node:child_process";

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function tryGit(cwd: string, ...args: string[]): string | undefined {
  try {
    return git(cwd, ...args);
  } catch {
    return undefined;
  }
}

export function repoRoot(cwd: string): string | undefined {
  return tryGit(cwd, "rev-parse", "--show-toplevel");
}

export function currentBranch(cwd: string): string | undefined {
  const branch = tryGit(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  return branch === "HEAD" ? undefined : branch;
}

export function defaultBranch(cwd: string): string | undefined {
  const remote = tryGit(cwd, "rev-parse", "--abbrev-ref", "origin/HEAD");
  if (remote) return remote.replace("origin/", "");
  for (const name of ["main", "master"]) {
    if (tryGit(cwd, "rev-parse", "--verify", name) !== undefined) return name;
  }
  return undefined;
}

/** ISO time of the merge-base with the default branch, if on a feature branch. */
export function branchSinceTime(cwd: string): string | undefined {
  const branch = currentBranch(cwd);
  const base = defaultBranch(cwd);
  if (!branch || !base || branch === base) return undefined;
  const sha = tryGit(cwd, "merge-base", "HEAD", base);
  return sha ? tryGit(cwd, "show", "-s", "--format=%cI", sha) : undefined;
}

export interface FileDiff {
  file: string;
  added: number;
  deleted: number;
  size: number; // lines in the file before the change (LT); 0 for a new file
  patch: string;
}

const PATCH_CAP = 8000;

/**
 * Per-file diff of the current branch against its merge-base (committed +
 * uncommitted). Falls back to uncommitted changes when not on a feature
 * branch. `.wdd/` is excluded — the audit must not narrate its own files.
 */
export function branchDiff(cwd: string): FileDiff[] {
  const branch = currentBranch(cwd);
  const base = branch && branch !== defaultBranch(cwd) ? tryGit(cwd, "merge-base", "HEAD", base_(cwd)) : undefined;
  const range = base ?? "HEAD";
  const numstat = tryGit(cwd, "diff", range, "--numstat", "--", ".", ":(exclude).wdd/**");
  if (!numstat) return [];
  const out: FileDiff[] = [];
  for (const line of numstat.split("\n").filter(Boolean)) {
    const [addRaw, delRaw, ...rest] = line.split("\t");
    const file = rest.join("\t");
    if (!file) continue;
    const patch = tryGit(cwd, "diff", range, "--", file) ?? "";
    const orig = tryGit(cwd, "show", `${range}:${file}`); // base version; absent for a new file
    out.push({
      file,
      added: addRaw === "-" ? 0 : Number(addRaw) || 0,
      deleted: delRaw === "-" ? 0 : Number(delRaw) || 0,
      size: orig ? orig.split("\n").length : 0,
      patch: patch.length > PATCH_CAP ? patch.slice(0, PATCH_CAP) + "\n… (truncated)" : patch,
    });
  }
  return out;
}

function base_(cwd: string): string {
  return defaultBranch(cwd) ?? "HEAD";
}

/**
 * Keep only files that live inside the audited repo. Drops agent-internal
 * paths a distiller sometimes attributes to a decision - the agent's own
 * `~/.claude` memory/config - which are not product code and never appear in
 * the branch diff.
 */
export function productFiles(files: string[] | undefined, root: string): string[] {
  if (!files) return [];
  const prefix = root.endsWith("/") ? root : root + "/";
  return files.filter((f) => (f.startsWith("/") ? f.startsWith(prefix) : !f.startsWith("..")));
}

export interface Churn {
  abs: number; // added + deleted
  rel: number; // abs / original file size (capped at 1); how much of the file this change rewrote
}

/** Absolute and relative churn for a decision's files that appear in the branch diff. */
export function churnFor(files: string[], root: string, diffs: Record<string, FileDiff>): Churn[] {
  const prefix = root.endsWith("/") ? root : root + "/";
  return files
    .map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : f))
    .map((rel) => diffs[rel])
    .filter((d): d is FileDiff => !!d)
    .map((d) => {
      const abs = d.added + d.deleted;
      // A new file (size 0) is not a "rewrite" - its weight comes from abs churn alone.
      return { abs, rel: d.size > 0 ? Math.min(abs / d.size, 1) : 0 };
    });
}

/** All worktree paths of this repo (including the main checkout). */
export function worktreePaths(cwd: string): string[] {
  const out = tryGit(cwd, "worktree", "list", "--porcelain");
  if (!out) return [];
  return out
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
}

/** True if the path is excluded by some .gitignore (git check-ignore exits 0). */
export function pathIgnored(cwd: string, relPath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", relPath], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface CommitResult {
  sha?: string;
  committed: boolean;
  ignored: boolean; // a target path is gitignored: data is on disk but not versioned
}

/**
 * Stage only the given files and commit. Never throws on the ignored case
 * (the audit's whole premise is being committed, but the file is already on
 * disk either way) - callers surface an actionable message instead.
 */
export function commitFiles(cwd: string, files: string[], message: string): CommitResult {
  if (files.some((f) => pathIgnored(cwd, f))) return { committed: false, ignored: true };
  git(cwd, "add", "--", ...files);
  try {
    git(cwd, "diff", "--cached", "--quiet", "--", ...files);
    return { committed: false, ignored: false };
  } catch {
    git(cwd, "commit", "-m", message, "--", ...files);
    const sha = tryGit(cwd, "rev-parse", "--short", "HEAD");
    return { committed: true, ignored: false, ...(sha ? { sha } : {}) };
  }
}
