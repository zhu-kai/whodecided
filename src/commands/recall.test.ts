import { describe, expect, it } from "vitest";
import { recallHits } from "./recall.js";
import type { DecisionEntry, RatifyEntry } from "../ledger/schema.js";

const e = (id: string, what: string, branch?: string): DecisionEntry => ({
  id,
  what,
  by: "agent",
  aware: false,
  ref: `tx:s:${id}`,
  ...(branch ? { branch } : {}),
});
const ratify = (target: string, verdict: "accept" | "reject"): RatifyEntry => ({
  type: "ratify",
  target,
  verdict,
  t: "2026-07-13T00:00:00Z",
});

const entries = [e("D1", "use SQLite FTS5"), e("D2", "sort by relevance"), e("D3", "SQLite in-memory cache")];
const ratifies = [ratify("D2", "accept"), ratify("D3", "reject")];

describe("recallHits precedent invariant", () => {
  it("returns only human-ruled decisions by default (pending excluded)", () => {
    // D1 matches "sqlite" but is pending -> must not appear as precedent.
    const hits = recallHits(entries, ratifies, { term: "sqlite" });
    expect(hits.map((h) => h.entry.id)).toEqual(["D3"]);
    expect(hits[0]?.verdict).toBe("reject");
  });

  it("surfaces pending only under the explicit human escape hatch", () => {
    const hits = recallHits(entries, ratifies, { term: "sqlite", includePending: true });
    expect(hits.map((h) => h.entry.id)).toEqual(["D1", "D3"]);
  });

  it("keeps both affirmed and overturned rulings (overturned is anti-precedent)", () => {
    expect(recallHits(entries, ratifies, { term: "relevance" })[0]?.verdict).toBe("accept");
    expect(recallHits(entries, ratifies, { term: "in-memory" })[0]?.verdict).toBe("reject");
  });
});
