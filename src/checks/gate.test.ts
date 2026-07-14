import { describe, expect, it } from "vitest";
import { gateStatus } from "./gate.js";
import type { DecisionEntry, RatifyEntry } from "../ledger/schema.js";
import type { DecisionCandidate } from "../extract/candidates.js";

const entry = (id: string, aware: boolean): DecisionEntry => ({ id, what: "x", by: "agent", aware, ref: `tx:s:1` });
const ratify = (target: string): RatifyEntry => ({ type: "ratify", target, verdict: "accept", t: "2026-07-13T00:00:00Z" });
const candidate = (line: number): DecisionCandidate => ({ ref: `tx:s:${line}`, kind: "turn", aware: false, summary: "", slice: "" });

describe("gateStatus", () => {
  it("is green when ledger is fresh and all silent decisions are ruled", () => {
    const status = gateStatus([entry("D1", false)], [ratify("D1")], [candidate(5)], { s: 10 });
    expect(status).toMatchObject({ green: true, fresh: true, pendingSilent: [] });
  });

  it("goes red on undistilled candidates or pending silent decisions", () => {
    expect(gateStatus([entry("D1", false)], [ratify("D1")], [candidate(20)], { s: 10 }).fresh).toBe(false);
    expect(gateStatus([entry("D2", false)], [], [], {}).pendingSilent).toEqual(["D2"]);
    expect(gateStatus([entry("D3", true)], [], [], {}).green).toBe(true);
  });
});
