import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseJsonl } from "../jsonl.js";
import { isNonEmptyString, isRecord } from "../validate.js";

/**
 * Persisted provenance: the (redacted) transcript excerpt each decision was
 * distilled from, keyed by ref. Committed alongside the ledger so a decision's
 * evidence never dangles when ~/.claude transcripts rotate or the audit travels
 * to another machine / CI. Append-only; one entry per ref.
 */
export interface Evidence {
  ref: string;
  excerpt: string;
}

export function evidencePath(root: string): string {
  return join(root, ".wdd", "evidence.jsonl");
}

export function readEvidence(file: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(file)) return map;
  const { values } = parseJsonl(file === "" ? "" : readFileSync(file, "utf8"), (v) => {
    if (!isRecord(v) || !isNonEmptyString(v.ref) || typeof v.excerpt !== "string") return "bad evidence line";
    return { ref: v.ref, excerpt: v.excerpt } as Evidence;
  });
  for (const e of values) if (!map.has(e.ref)) map.set(e.ref, e.excerpt);
  return map;
}

/** Append evidence for refs not already stored. Returns true if anything was written. */
export function appendEvidence(file: string, items: Evidence[]): boolean {
  const have = new Set(readEvidence(file).keys());
  const fresh = items.filter((e) => e.ref && e.excerpt && !have.has(e.ref));
  if (fresh.length === 0) return false;
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitignore"), ".cache/\n");
  }
  appendFileSync(file, fresh.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return true;
}
