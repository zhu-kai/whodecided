import type { FileDiff } from "../git.js";

export interface TestWeakening {
  file: string;
  removedTests: number;
  addedSkips: number;
  removedAssertions: number;
}

const TEST_FILE = /(\.test\.|\.spec\.|_test\.|test_[^/]*\.py$|(^|\/)tests?\/)/;
const TEST_DECL = /\b(it|test|describe)\s*\(|\bdef\s+test_|\bfunc\s+Test[A-Z]/;
const ASSERTION = /\b(expect|assert|should|require)\b|\.to(Be|Equal|Match|Throw|Contain)\b/;
const ADDED_SKIP = /\b(it|test|describe)\.(skip|todo)\b|\bx(it|describe)\b|@pytest\.mark\.skip|\bt\.Skip\(/;

/** Added/removed content lines of a unified diff, excluding the `+++`/`---` headers. */
function lines(patch: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const l of patch.split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("+")) added.push(l.slice(1));
    else if (l.startsWith("-")) removed.push(l.slice(1));
  }
  return { added, removed };
}

const count = (ls: string[], re: RegExp): number => ls.filter((l) => re.test(l)).length;

/**
 * Flag test files whose diff weakens coverage: removed test declarations,
 * added `.skip`/`xit`, or a net drop in assertions. A classic silent decision
 * that a plain diff scan misses; deterministic, no LLM.
 */
export function weakenedTests(diffs: FileDiff[]): TestWeakening[] {
  const out: TestWeakening[] = [];
  for (const d of diffs) {
    if (!TEST_FILE.test(d.file)) continue;
    const { added, removed } = lines(d.patch);
    const removedTests = count(removed, TEST_DECL) - count(added, TEST_DECL);
    const addedSkips = count(added, ADDED_SKIP);
    const removedAssertions = count(removed, ASSERTION) - count(added, ASSERTION);
    if (removedTests > 0 || addedSkips > 0 || removedAssertions > 2)
      out.push({ file: d.file, removedTests: Math.max(0, removedTests), addedSkips, removedAssertions: Math.max(0, removedAssertions) });
  }
  return out;
}
