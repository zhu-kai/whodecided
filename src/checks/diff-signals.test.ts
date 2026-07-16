import { describe, expect, it } from "vitest";
import { weakenedTests } from "./diff-signals.js";

const diff = (file: string, patch: string) => ({ file, added: 0, deleted: 0, patch });

describe("weakenedTests", () => {
  it("flags a removed test declaration", () => {
    const p = "@@\n-  it('rejects bad input', () => { expect(fn()).toThrow(); });\n";
    const [f] = weakenedTests([diff("src/auth.test.ts", p)]);
    expect(f?.removedTests).toBe(1);
  });

  it("flags an added skip", () => {
    const p = "@@\n-  it('works', () => {})\n+  it.skip('works', () => {})\n";
    const [f] = weakenedTests([diff("api/user.spec.js", p)]);
    expect(f?.addedSkips).toBe(1);
  });

  it("ignores non-test files and net-neutral edits", () => {
    expect(weakenedTests([diff("src/app.ts", "@@\n-const a = 1;\n+const a = 2;\n")])).toEqual([]);
    const rename = "@@\n-  it('a', () => expect(x).toBe(1))\n+  it('renamed', () => expect(x).toBe(1))\n";
    expect(weakenedTests([diff("x.test.ts", rename)])).toEqual([]);
  });
});
