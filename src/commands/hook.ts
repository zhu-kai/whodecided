import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { repoRoot } from "../git.js";
import { isRecord } from "../validate.js";
import type { TestRunEvent } from "../trace/schema.js";

const RUNNER = /\b(vitest|jest|playwright|cypress|pytest)\b/;
const E2E_RUNNER = /\b(playwright|cypress)\b/;

export async function hook(args: string[]): Promise<number> {
  if (args[0] === "install") return install();
  if (args[0] === "trace") return trace();
  if (args[0] === "autodistill") return autodistill();
  process.stderr.write("usage: wdd hook install | wdd hook trace | wdd hook autodistill\n");
  return 1;
}

async function install(): Promise<number> {
  const root = repoRoot(process.cwd());
  if (!root) {
    process.stderr.write("wdd hook install: not inside a git repo\n");
    return 1;
  }
  const dir = join(root, ".claude");
  const file = join(dir, "settings.json");
  mkdirSync(dir, { recursive: true });
  let settings: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      process.stderr.write(`${file} is not valid JSON; fix it first\n`);
      return 1;
    }
  }
  const bin = wddAvailable() ? "wdd" : "npx -y whodecided";
  const hooks = (settings.hooks ??= {}) as Record<string, unknown>;
  const post = (hooks.PostToolUse ??= []) as unknown[];
  const stop = (hooks.Stop ??= []) as unknown[];
  let changed = false;
  if (!JSON.stringify(post).includes("hook trace")) {
    post.push({ matcher: "Bash", hooks: [{ type: "command", command: `${bin} hook trace` }] });
    changed = true;
  }
  if (!JSON.stringify(stop).includes("hook autodistill")) {
    stop.push({ hooks: [{ type: "command", command: `${bin} hook autodistill` }] });
    changed = true;
  }
  if (changed) {
    writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
    process.stdout.write(
      `hooks installed in ${file}\n` +
        "- PostToolUse: test runs traced to .wdd/trace.jsonl\n" +
        "- Stop: per-turn auto-distill (no-op until .wdd/config.yaml sets distill.auto: turn)\n",
    );
  } else {
    process.stdout.write("hooks already installed\n");
  }
  installRecallSkill(root, bin);
  // Associate the memory file now so every future ruling auto-syncs, no extra step.
  const { configureSync } = await import("./sync.js");
  const { loadConfig } = await import("../config.js");
  await configureSync(root, process.stdin.isTTY);
  const targets = loadConfig(root).sync?.targets ?? [];
  process.stdout.write(
    targets.length > 0
      ? `pinned precedents will sync to ${targets.join(", ")} on every ruling · change with wdd sync\n`
      : "precedents: audit only (not written to any memory file) · change with wdd sync\n",
  );
  return 0;
}

/**
 * Stop-hook receiver: the hook is the scheduler. If auto-distill is enabled,
 * spawn a detached `wdd distill --quiet` and return immediately so the CC
 * session is never blocked; the LLM call happens in the background.
 */
async function autodistill(): Promise<number> {
  try {
    const payload = JSON.parse(await readStdin());
    const cwd = isRecord(payload) && typeof payload.cwd === "string" ? payload.cwd : process.cwd();
    const root = repoRoot(cwd);
    if (!root) return 0;
    if (loadConfig(root).distill.auto !== "turn") return 0;
    const child = spawn(process.execPath, [process.argv[1] ?? "", "distill", "--quiet"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // never fail the hook
  }
  return 0;
}

function installRecallSkill(root: string, bin: string): void {
  const dir = join(root, ".claude", "skills", "recall");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---
name: recall
description: Check ratified decision precedents before making a design or technology decision. Use when choosing libraries, storage mechanisms, defaults, error handling strategies, or test scope.
---

Before making a decision where a reasonable alternative exists, check for precedent:

\`\`\`bash
${bin} recall <keyword>
\`\`\`

Always go through \`${bin} recall\`. Do NOT read \`.wdd/ledger.jsonl\` directly for precedent: the raw file also contains unreviewed distilled guesses, and treating those as authority would mean following your own unratified decisions. \`recall\` returns only what the user has sealed.

Only ruled decisions are precedent - a decision the user has sealed. \`recall\` returns those by default:

- ✅ affirmed: follow it, and cite its id (e.g. "following precedent D12") in your explanation.
- ❌ overturned: do NOT repeat that choice; pick the recorded alternative or ask.
- no ratified hit: there is no precedent yet. Use your best judgment and make the call - do NOT treat any pending/unreviewed entry as authority (that would be following your own unreviewed guess). This decision will itself be surfaced for the user to rule on later.
`,
  );
  process.stdout.write("/recall skill installed in .claude/skills/recall/\n");
}

function wddAvailable(): boolean {
  try {
    execFileSync("which", ["wdd"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** PostToolUse receiver. Must never disturb the session: always exits 0, stays silent. */
async function trace(): Promise<number> {
  try {
    const payload = JSON.parse(await readStdin());
    if (!isRecord(payload) || payload.tool_name !== "Bash") return 0;
    const input = isRecord(payload.tool_input) ? payload.tool_input : {};
    const command = typeof input.command === "string" ? input.command : "";
    if (!RUNNER.test(command)) return 0;
    const response = isRecord(payload.tool_response) ? payload.tool_response : {};
    const output = [response.stdout, response.stderr].filter((s) => typeof s === "string").join("\n");
    const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
    const root = repoRoot(cwd);
    if (!root) return 0;
    const event: TestRunEvent = {
      t: new Date().toISOString(),
      type: "test_run",
      kind: E2E_RUNNER.test(command) ? "e2e" : "unit",
      cmd: command.slice(0, 200),
      exit: detectExit(output),
      ...counts(output),
      cwd,
    };
    const dir = join(root, ".wdd");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".gitignore"), ".cache/\n");
    }
    appendFileSync(join(dir, "trace.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // never fail the hook
  }
  return 0;
}

function detectExit(output: string): number {
  const explicit = /Exit code (\d+)/.exec(output);
  if (explicit) return Number(explicit[1]);
  return /\b(\d+) failed/.test(output) && !/\b0 failed/.test(output) ? 1 : 0;
}

function counts(output: string): { pass?: number; fail?: number } {
  const pass = /(\d+) passed/.exec(output);
  const fail = /(\d+) failed/.exec(output);
  return {
    ...(pass ? { pass: Number(pass[1]) } : {}),
    ...(fail ? { fail: Number(fail[1]) } : {}),
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (d: Buffer) => (data += d.toString()));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 3000);
  });
}
