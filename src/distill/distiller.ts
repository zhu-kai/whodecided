import { spawn } from "node:child_process";
import type { DecisionEntry } from "../ledger/schema.js";
import { parseLedgerLine, isRatify } from "../ledger/schema.js";
import type { DecisionCandidate } from "../extract/candidates.js";
import { buildPrompt, resolveLang } from "./prompt.js";

export interface DistillOptions {
  cmd: string[];
  timeoutMs: number;
  budget: number;
  lang: "auto" | "zh" | "en";
}

export const DEFAULT_DISTILL: DistillOptions = {
  cmd: ["claude", "-p"],
  timeoutMs: 120_000,
  budget: 10,
  lang: "auto",
};

export interface DistillOutcome {
  entries: DecisionEntry[];
  degraded?: string;
}

/** One LLM call over all candidates; validate, retry once, degrade never-fatally. */
export async function distill(
  candidates: DecisionCandidate[],
  opts: DistillOptions = DEFAULT_DISTILL,
): Promise<DistillOutcome> {
  if (candidates.length === 0) return { entries: [] };
  const { instructions, payload } = buildPrompt(candidates, opts.budget, resolveLang(candidates, opts.lang));
  const refs = new Set(candidates.map((c) => c.ref));
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? instructions
        : `${instructions}\n\nYour previous output was invalid: ${lastError}\nOutput ONLY the corrected JSON array.`;
    let stdout: string;
    try {
      stdout = await run(opts.cmd, prompt, payload, opts.timeoutMs);
    } catch (error) {
      return { entries: [], degraded: error instanceof Error ? error.message : String(error) };
    }
    const parsed = parseEntries(stdout, refs, opts.budget);
    if (typeof parsed === "string") {
      lastError = parsed;
      continue;
    }
    return { entries: parsed };
  }
  return { entries: [], degraded: `distiller output invalid twice: ${lastError}` };
}

function parseEntries(stdout: string, validRefs: Set<string>, budget: number): DecisionEntry[] | string {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end <= start) return "no JSON array found";
  let raw: unknown;
  try {
    raw = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return "JSON parse failed";
  }
  if (!Array.isArray(raw)) return "not an array";
  const entries: DecisionEntry[] = [];
  for (const item of raw) {
    const line = parseLedgerLine(item);
    if (typeof line === "string") return line;
    if (isRatify(line)) return "ratify entries not allowed from distiller";
    if (!validRefs.has(line.ref)) return `unknown ref: ${line.ref}`;
    entries.push(line);
  }
  return entries.slice(0, budget);
}

function run(cmd: string[], prompt: string, stdinPayload: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const [bin = "", ...args] = cmd;
    // Payload goes through stdin: argv has a hard size limit (E2BIG).
    const child = spawn(bin, [...args, prompt], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.write(stdinPayload);
    child.stdin.end();
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`distiller timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`cannot run ${bin}: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited ${code}: ${err.slice(0, 200)}`));
    });
  });
}
