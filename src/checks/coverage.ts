import type { DecisionEntry } from "../ledger/schema.js";
import type { TraceEvent } from "../trace/schema.js";

export type Coverage = "green" | "red" | "none" | "na";

/** Test/config/doc files - context around a change rather than the change itself. */
export const SECONDARY_FILE = /(\.test\.|\.spec\.|_test\.|(^|\/)tests?\/|\.md$|\.json$)/;

/** True when the decision changed product behavior (touched a non-test, non-doc source file). */
export function changesBehavior(files: string[]): boolean {
  return files.some((f) => !SECONDARY_FILE.test(f));
}

/**
 * Was the test suite exercised after this decision landed? Branch-level and
 * time-based (traces carry no file list), so this answers "did a run happen
 * after this change, and was it green?" - not "is this exact line covered".
 * `na` for decisions that changed no behavior.
 */
export function coverageOf(e: DecisionEntry, files: string[], traces: TraceEvent[]): Coverage {
  if (!changesBehavior(files)) return "na";
  const after = traces.filter((t) => (t.t ?? "") > (e.t ?? "")).sort((a, b) => (a.t ?? "").localeCompare(b.t ?? ""));
  if (!after.length) return "none";
  const last = after[after.length - 1]!;
  return last.exit !== 0 || (last.fail ?? 0) > 0 ? "red" : "green";
}
