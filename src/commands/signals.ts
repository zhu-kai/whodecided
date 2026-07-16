import { branchDiff, churnFor, productFiles, type FileDiff } from "../git.js";
import { weakenedTests, type TestWeakening } from "../checks/diff-signals.js";
import { riskScore, type Risk } from "../checks/risk.js";
import { supersedeLinks, type Link } from "../checks/supersede.js";
import { coverageOf, type Coverage } from "../checks/coverage.js";
import type { DecisionEntry } from "../ledger/schema.js";
import type { TraceEvent } from "../trace/schema.js";

export interface BranchAnalysis {
  diffs: Record<string, FileDiff>;
  weakened: TestWeakening[];
}

export interface DecisionSignals {
  files: string[];
  risk: Risk;
  link?: Link;
  coverage: Coverage;
}

/** One branch-diff read, shared by everything that renders it. */
export function analyzeBranch(root: string): BranchAnalysis {
  const diffList = branchDiff(root);
  return {
    diffs: Object.fromEntries(diffList.map((d) => [d.file, d])),
    weakened: weakenedTests(diffList),
  };
}

/**
 * Per-decision triage signals (risk, supersede link, coverage), derived once
 * for a set of entries. Returns a lookup so callers can spread the signals
 * into their view of each entry.
 */
export function decisionSignals(
  entries: DecisionEntry[],
  root: string,
  diffs: Record<string, FileDiff>,
  traces: TraceEvent[],
): (e: DecisionEntry) => DecisionSignals {
  const filesOf = (e: DecisionEntry) => productFiles(e.files, root);
  const links = supersedeLinks(entries, filesOf);
  return (e) => {
    const files = filesOf(e);
    return {
      files,
      risk: riskScore({ ...e, files }, churnFor(files, root, diffs)),
      ...(links.get(e.id) ? { link: links.get(e.id) } : {}),
      coverage: coverageOf(e, files, traces),
    };
  };
}
