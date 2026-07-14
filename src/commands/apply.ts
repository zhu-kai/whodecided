import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../git.js";
import { applyOps } from "../patch/apply.js";
import { parsePatch } from "../patch/schema.js";
import { IGNORED_MSG } from "./distill.js";

export function apply(args: string[]): number {
  const root = repoRoot(process.cwd());
  if (!root) {
    process.stderr.write("wdd apply: not inside a git repo\n");
    return 1;
  }
  // With no path, pick up the patch the workbench just exported (newest in Downloads).
  const file = args.find((a) => !a.startsWith("--")) ?? findExportedPatch();
  if (!file) {
    process.stderr.write(
      "wdd apply: no patch given and none found in Downloads.\n" +
        "In the workbench, rule on decisions and click Export, then run `wdd apply` again.\n",
    );
    return 1;
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`cannot read ${file}\n`);
    return 1;
  }
  if (!args.some((a) => !a.startsWith("--"))) process.stdout.write(`applying ${file}\n`);
  const { values, errors } = parsePatch(text);
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`patch line ${e.line}: ${e.message}\n`);
    process.stderr.write("patch rejected, nothing written\n");
    return 1;
  }
  const result = applyOps(root, values);
  if (typeof result === "string") {
    process.stderr.write(`patch rejected, nothing written: ${result}\n`);
    return 1;
  }
  process.stdout.write(
    `saved ${result.applied} ruling(s)${result.skipped ? `, ${result.skipped} unchanged` : ""}${result.commit ? ` → commit ${result.commit}` : ""}\n`,
  );
  if (result.uncommitted) process.stderr.write(IGNORED_MSG + "\n");
  if (result.overturned > 0)
    process.stdout.write(
      `↳ ${result.overturned} rejected - AI won't repeat these; the code fix is separate work\n`,
    );
  return 0;
}

/** The workbench downloads review.patch.jsonl; grab the newest one from Downloads. */
function findExportedPatch(): string | undefined {
  const dir = join(homedir(), "Downloads");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return undefined;
  }
  const cutoff = Date.now() - 60 * 60 * 1000; // only very recent exports, avoid stale
  return names
    .filter((n) => n.endsWith(".patch.jsonl"))
    .map((n) => ({ path: join(dir, n), mtime: statSync(join(dir, n)).mtimeMs }))
    .filter((f) => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => f.path)[0];
}
