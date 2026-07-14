import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { isRecord } from "./validate.js";

export interface SyncChoice {
  // agent memory files, relative to repo root. Multiple because a user may run
  // both CC (CLAUDE.md) and Codex (AGENTS.md) and want precedents in each.
  targets: string[];
  mode: "inline" | "link"; // inline = managed block in each file; link = separate doc + reference
}

export interface Config {
  // repo = .wdd/ is tracked by git (travels with the project);
  // local = kept out of git (this machine only).
  share: "repo" | "local";
  // Whether whodecided creates its own git commits. Default off: it writes to
  // the working tree and leaves committing to you (never touch your history
  // uninvited). "on" restores auto-commit for those who want the audit in git.
  commit: "off" | "on";
  distill: {
    cmd: string[];
    timeoutMs: number;
    budget: number;
    lang: "auto" | "zh" | "en";
    auto: "off" | "turn";
  };
  heuristics: { reflexMs: number };
  review: { days: number; sessions: number };
  // Present only once the user has opted into CLAUDE.md/AGENTS.md sync (their
  // recorded choice); absent means not opted in.
  sync?: SyncChoice;
}

export const DEFAULT_CONFIG: Config = {
  share: "repo",
  commit: "off",
  distill: { cmd: ["claude", "-p"], timeoutMs: 120_000, budget: 10, lang: "auto", auto: "off" },
  heuristics: { reflexMs: 3000 },
  review: { days: 7, sessions: 10 },
};

/** Merge keys into .wdd/config.yaml, preserving everything else. */
export function patchConfig(root: string, patch: Record<string, unknown>): void {
  const file = join(root, ".wdd", "config.yaml");
  let doc: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const parsed = parse(readFileSync(file, "utf8"));
      if (isRecord(parsed)) doc = parsed;
    } catch {
      // start fresh rather than clobber silently on parse error
    }
  }
  Object.assign(doc, patch);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringify(doc));
}

/** .wdd/config.yaml is optional; every field has a default (zero-config goal). */
export function loadConfig(root: string | undefined): Config {
  const file = root ? join(root, ".wdd", "config.yaml") : undefined;
  if (!file || !existsSync(file)) return DEFAULT_CONFIG;
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, "utf8"));
  } catch {
    return DEFAULT_CONFIG;
  }
  if (!isRecord(raw)) return DEFAULT_CONFIG;
  const share = raw.share === "local" ? "local" : "repo";
  const commit = raw.commit === "on" ? "on" : "off";
  const d = isRecord(raw.distill) ? raw.distill : {};
  const h = isRecord(raw.heuristics) ? raw.heuristics : {};
  const r = isRecord(raw.review) ? raw.review : {};
  return {
    share,
    commit,
    distill: {
      cmd: typeof d.cmd === "string" ? d.cmd.split(/\s+/) : DEFAULT_CONFIG.distill.cmd,
      timeoutMs: num(d.timeout, DEFAULT_CONFIG.distill.timeoutMs / 1000) * 1000,
      budget: num(d.budget, DEFAULT_CONFIG.distill.budget),
      lang: d.lang === "zh" || d.lang === "en" ? d.lang : "auto",
      auto: d.auto === "turn" ? "turn" : "off",
    },
    heuristics: {
      reflexMs: num(h.reflexMs, DEFAULT_CONFIG.heuristics.reflexMs),
    },
    review: {
      days: num(r.days, DEFAULT_CONFIG.review.days),
      sessions: num(r.sessions, DEFAULT_CONFIG.review.sessions),
    },
    ...parseSync(raw.sync),
  };
}

function parseSync(raw: unknown): { sync?: SyncChoice } {
  if (!isRecord(raw)) return {}; // absent = never configured (will prompt)
  const t = raw.targets ?? raw.target; // tolerate the old single-target key
  const targets = Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : typeof t === "string" ? [t] : [];
  // Present but empty targets = the user chose "don't remember" (configured, off).
  return { sync: { targets, mode: raw.mode === "link" ? "link" : "inline" } };
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
