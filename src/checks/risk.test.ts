import { describe, expect, it } from "vitest";
import { riskScore } from "./risk.js";
import type { DecisionEntry } from "../ledger/schema.js";

const base: DecisionEntry = { id: "D1", what: "x", by: "agent", aware: false, ref: "tx:a:1" };

describe("riskScore", () => {
  it("rates a silent, hard-to-reverse, hedged, high-churn decision high", () => {
    const churn = [{ abs: 40, rel: 0.8 }, { abs: 30, rel: 0.3 }, { abs: 20, rel: 0.2 }];
    const r = riskScore({ ...base, reversibility: "low", what: "Proceed on the assumption X holds" }, churn);
    expect(r.level).toBe("high");
    expect(r.reasons).toContain("stated as an assumption");
    expect(r.reasons.some((x) => /spread across/.test(x))).toBe(true);
    expect(r.reasons.some((x) => /rewrote/.test(x))).toBe(true);
  });

  it("rates a deliberate, easy-to-reverse, single-file decision low", () => {
    const r = riskScore({ ...base, by: "user", aware: true, reversibility: "high", what: "rename a var" }, [{ abs: 2, rel: 0.02 }]);
    expect(r.level).toBe("low");
  });

  it("falls back to raw fan-out when no diff churn is available", () => {
    expect(riskScore({ ...base, files: ["a", "b", "c", "d"] }, []).reasons.some((x) => /touches 4 files/.test(x))).toBe(true);
  });

  it("reads the distiller's assumption tag when the prose has no keyword", () => {
    expect(riskScore({ ...base, what: "derive roles from the token", tags: ["assumption"] }).reasons).toContain("stated as an assumption");
  });
});
