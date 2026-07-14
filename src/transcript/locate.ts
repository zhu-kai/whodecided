import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LocateOptions {
  cwd: string;
  days: number;
  sessions: number;
  projectsDir?: string;
}

/** CC stores transcripts under a directory named after the slugified cwd. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/** Session files for this project, newest first, bounded by age and count. */
export function locateSessions(opts: LocateOptions): string[] {
  const dir = join(opts.projectsDir ?? join(homedir(), ".claude", "projects"), projectSlug(opts.cwd));
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const cutoff = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  return names
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => {
      const path = join(dir, n);
      return { path, mtime: statSync(path).mtimeMs };
    })
    .filter((f) => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, opts.sessions)
    .map((f) => f.path);
}
