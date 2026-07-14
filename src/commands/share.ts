import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { loadConfig } from "../config.js";
import { pathIgnored, repoRoot, tryGit } from "../git.js";
import { isRecord } from "../validate.js";

/**
 * Explicit choice: does the audit travel with the project or stay local?
 * This is the user's call, so it is a deliberate command, not inferred from
 * whether `.wdd` happens to be gitignored.
 */
export function share(args: string[]): number {
  const root = repoRoot(process.cwd());
  if (!root) {
    process.stderr.write("wdd share: not inside a git repo\n");
    return 1;
  }
  const mode = args.find((a) => a === "repo" || a === "local");
  if (!mode) {
    const current = loadConfig(root).share;
    process.stdout.write(
      `audit sharing: ${current}\n` +
        (current === "repo"
          ? "  the ledger is committed and travels with your code (merges with PRs)\n"
          : "  the ledger stays on this machine, written to disk but never committed\n") +
        "change with: wdd share repo | wdd share local\n",
    );
    return 0;
  }

  writeShare(root, mode);
  if (mode === "local") {
    excludeLocally(root);
    process.stdout.write(
      "audit sharing → local\n" +
        "  .wdd/ writes to disk but is never committed; added to .git/info/exclude (local, not shared)\n" +
        "  your ledger stays readable at .wdd/ledger.jsonl\n",
    );
  } else {
    process.stdout.write("audit sharing → repo\n  the ledger will be committed and travel with your code\n");
    if (pathIgnored(root, ".wdd/ledger.jsonl")) {
      process.stderr.write(
        "⚠ but .wdd is currently gitignored, so commits will be blocked.\n" +
          "  remove the `.wdd` line from your .gitignore (or .git/info/exclude) to let it be versioned.\n",
      );
    }
  }
  return 0;
}

function writeShare(root: string, mode: "repo" | "local"): void {
  const dir = join(root, ".wdd");
  const file = join(dir, "config.yaml");
  mkdirSync(dir, { recursive: true });
  let doc: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const parsed = parse(readFileSync(file, "utf8"));
      if (isRecord(parsed)) doc = parsed;
    } catch {
      // keep going with a fresh doc rather than clobber silently on parse error
    }
  }
  doc.share = mode;
  writeFileSync(file, stringify(doc));
}

/** git-native local ignore: keeps .wdd out of git without touching the shared .gitignore. */
function excludeLocally(root: string): void {
  const gitDir = tryGit(root, "rev-parse", "--git-dir");
  if (!gitDir) return;
  const exclude = join(gitDir.startsWith("/") ? gitDir : join(root, gitDir), "info", "exclude");
  const existing = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (/^\.wdd\/?$/m.test(existing)) return;
  appendFileSync(exclude, (existing.endsWith("\n") || existing === "" ? "" : "\n") + ".wdd/\n");
}
