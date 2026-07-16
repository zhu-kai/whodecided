import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { DecisionCandidate } from "../extract/candidates.js";

export interface Distiller {
  cmd: string[];
  source: "config" | "detected";
}

export const NO_DISTILLER_MSG =
  "no LLM CLI found to distill with - install Claude Code (`claude`) or Codex (`codex`), " +
  "or point .wdd/config.yaml at one, e.g.  distill: { cmd: claude -p }";

// A trailing "-" means the prompt goes to stdin (codex exec's convention).
const KNOWN = [
  { bin: "claude", cmd: ["claude", "-p"], modelPrefixes: ["claude"] },
  { bin: "codex", cmd: ["codex", "exec", "-"], modelPrefixes: ["gpt", "codex", "o"] },
];

/** One-run distiller override: `--codex` / `--claude` beat config and detection. */
export function distillerFlag(args: string[]): string[] | undefined {
  if (args.includes("--codex")) return ["codex", "exec", "-"];
  if (args.includes("--claude")) return ["claude", "-p"];
  return undefined;
}

export function onPath(bin: string): boolean {
  const names = process.platform === "win32" ? [`${bin}.exe`, `${bin}.cmd`, bin] : [bin];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      try {
        accessSync(join(dir, name), constants.X_OK);
        return true;
      } catch {
        // keep looking
      }
    }
  }
  return false;
}

/**
 * Which CLI distills: an explicit `distill.cmd` always wins; otherwise detect
 * what is installed, and when both are, follow whichever tool produced the
 * sessions being audited. Returns undefined when nothing is available.
 */
export function resolveDistiller(
  configured: string[] | undefined,
  candidates: DecisionCandidate[],
  installed: (bin: string) => boolean = onPath,
): Distiller | undefined {
  if (configured && configured.length > 0) return { cmd: configured, source: "config" };
  const available = KNOWN.filter((k) => installed(k.bin));
  if (available.length === 0) return undefined;
  const votes = (k: (typeof KNOWN)[number]) =>
    candidates.filter((c) => c.model && k.modelPrefixes.some((p) => c.model!.startsWith(p))).length;
  const best = [...available].sort((a, b) => votes(b) - votes(a))[0]!;
  return { cmd: best.cmd, source: "detected" };
}
