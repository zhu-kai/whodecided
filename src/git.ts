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
