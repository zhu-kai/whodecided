import { describe, expect, it } from "vitest";
import { followups } from "./io.js";
import type { DecisionEntry, RatifyEntry } from "./schema.js";

const e = (id: string): DecisionEntry => ({ id, what: id, by: "agent", aware: false, ref: `tx:s:${id}` });
const ratify = (target: string, verdict: "accept" | "reject", note?: string): RatifyEntry => ({
  type: "ratify",
  target,
  verdict,
  t: "2026-07-13T00:00:00Z",
  ...(note ? { note } : {}),
});

describe("followups (v2 task-layer seam)", () => {
  it("returns only overturned decisions, with the correction note", () => {
    const entries = [e("D1"), e("D2"), e("D3")];
    const ratifies = [ratify("D1", "accept"), ratify("D2", "reject", "use cookie instead")];
    const f = followups(entries, ratifies);
    expect(f.map((x) => x.entry.id)).toEqual(["D2"]);
    expect(f[0]?.correction).toBe("use cookie instead");
  });

  it("follows the latest ruling per decision", () => {
    const entries = [e("D1")];
    const ratifies = [ratify("D1", "reject", "old"), ratify("D1", "accept")];
    expect(followups(entries, ratifies)).toEqual([]);
  });
});
