import { describe, expect, it } from "vitest";
import { supersedeLinks } from "./supersede.js";
import type { DecisionEntry } from "../ledger/schema.js";

const filesOf = (e: DecisionEntry) => e.files ?? [];

describe("supersedeLinks", () => {
  it("links a later reversal to the earlier decision it shares the most files with", () => {
    const entries: DecisionEntry[] = [
      { id: "D1", what: "assume available has both", by: "agent", aware: false, ref: "tx:a:1", t: "2026-01-01T10:00:00.000Z", files: ["x.ts", "y.ts"] },
      { id: "D2", what: "unrelated tweak", by: "agent", aware: false, ref: "tx:a:2", t: "2026-01-01T11:00:00.000Z", files: ["z.ts"] },
      { id: "D3", what: "after testing, reverted to includes()", by: "agent", aware: false, ref: "tx:a:3", t: "2026-01-02T10:00:00.000Z", files: ["x.ts", "y.ts"] },
    ];
    const links = supersedeLinks(entries, filesOf);
    expect(links.get("D3")?.revises).toBe("D1");
    expect(links.get("D1")?.revisedBy).toBe("D3");
    expect(links.get("D3")?.shared).toEqual(["x.ts", "y.ts"]);
    expect(links.has("D2")).toBe(false);
  });

  it("links via the distiller's reversal tag when the prose has no keyword (any-language path)", () => {
    const entries: DecisionEntry[] = [
      { id: "D1", what: "derive capability via plan A", by: "agent", aware: false, ref: "tx:a:1", t: "2026-01-01T10:00:00.000Z", files: ["x.ts"] },
      { id: "D2", what: "derive capability via plan B", by: "agent", aware: false, ref: "tx:a:2", t: "2026-01-02T10:00:00.000Z", files: ["x.ts"], tags: ["reversal"] },
    ];
    expect(supersedeLinks(entries, filesOf).get("D2")?.revises).toBe("D1");
  });

  it("ties go to the most recent earlier decision", () => {
    const entries: DecisionEntry[] = [
      { id: "D1", what: "pick source A", by: "user", aware: true, ref: "tx:a:1", t: "2026-01-01T10:00:00.000Z", files: ["x.ts", "y.ts"] },
      { id: "D2", what: "assume both sides", by: "agent", aware: false, ref: "tx:a:2", t: "2026-01-02T10:00:00.000Z", files: ["x.ts", "y.ts"] },
      { id: "D3", what: "revert after verifying", by: "agent", aware: false, ref: "tx:a:3", t: "2026-01-03T10:00:00.000Z", files: ["x.ts", "y.ts"] },
    ];
    expect(supersedeLinks(entries, filesOf).get("D3")?.revises).toBe("D2");
  });

  it("ignores a shared test file alone (needs source-level overlap, score >= 2)", () => {
    const entries: DecisionEntry[] = [
      { id: "D1", what: "add feature", by: "agent", aware: false, ref: "tx:a:1", t: "2026-01-01T10:00:00.000Z", files: ["a.test.ts"] },
      { id: "D2", what: "reverted approach", by: "agent", aware: false, ref: "tx:a:2", t: "2026-01-02T10:00:00.000Z", files: ["a.test.ts"] },
    ];
    expect(supersedeLinks(entries, filesOf).size).toBe(0);
  });

  it("does not link without reversal language or without shared files", () => {
    const entries: DecisionEntry[] = [
      { id: "D1", what: "choose A", by: "agent", aware: false, ref: "tx:a:1", t: "2026-01-01T10:00:00.000Z", files: ["x.ts"] },
      { id: "D2", what: "reverted the plan", by: "agent", aware: false, ref: "tx:a:2", t: "2026-01-02T10:00:00.000Z", files: ["other.ts"] },
    ];
    expect(supersedeLinks(entries, filesOf).size).toBe(0);
  });
});
