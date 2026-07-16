import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendEvidence, evidencePath, readEvidence } from "./evidence.js";

describe("evidence store", () => {
  it("persists excerpts by ref and dedupes on re-append", () => {
    const root = mkdtempSync(join(tmpdir(), "wdd-ev-"));
    const file = evidencePath(root);
    expect(appendEvidence(file, [{ ref: "tx:s:1", excerpt: "USER: do X" }])).toBe(true);
    // Same ref again → not rewritten.
    expect(appendEvidence(file, [{ ref: "tx:s:1", excerpt: "different" }])).toBe(false);
    expect(appendEvidence(file, [{ ref: "tx:s:2", excerpt: "AGENT: chose Y" }])).toBe(true);
    const map = readEvidence(file);
    expect(map.get("tx:s:1")).toBe("USER: do X"); // first write wins (append-only)
    expect(map.get("tx:s:2")).toBe("AGENT: chose Y");
  });

  it("returns an empty map when no evidence file exists", () => {
    expect(readEvidence(evidencePath(mkdtempSync(join(tmpdir(), "wdd-ev-")))).size).toBe(0);
  });
});
