import { describe, expect, it } from "vitest";
import { coverageOf, changesBehavior } from "./coverage.js";
import type { DecisionEntry } from "../ledger/schema.js";
import type { TraceEvent } from "../trace/schema.js";

const dec = (t: string, files: string[]): DecisionEntry => ({ id: "D1", what: "x", by: "agent", aware: false, ref: "tx:a:1", t, files });
const run = (t: string, exit: number): TraceEvent => ({ t, type: "test_run", kind: "unit", cmd: "vitest", exit, fail: exit === 0 ? 0 : 1 });

describe("coverage", () => {
  it("is green when a passing run follows a behavior change", () => {
    expect(coverageOf(dec("2026-01-01T10:00:00.000Z", ["src/app.ts"]), ["src/app.ts"], [run("2026-01-01T11:00:00.000Z", 0)])).toBe("green");
  });

  it("is none when no run follows the change", () => {
    expect(coverageOf(dec("2026-01-01T12:00:00.000Z", ["src/app.ts"]), ["src/app.ts"], [run("2026-01-01T11:00:00.000Z", 0)])).toBe("none");
  });

  it("is na for doc/test-only changes", () => {
    expect(coverageOf(dec("2026-01-01T10:00:00.000Z", ["README.md"]), ["README.md"], [])).toBe("na");
    expect(changesBehavior(["src/a.test.ts", "docs.md"])).toBe(false);
  });
});
