import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt.js";
import type { DecisionCandidate } from "../extract/candidates.js";

const cand: DecisionCandidate = { ref: "tx:a:1", kind: "turn", aware: false, summary: "s", slice: "AGENT: chose X", t: "" };

describe("buildPrompt known-decisions block", () => {
  it("tells the distiller what is already recorded", () => {
    const { instructions } = buildPrompt([cand], 10, "en", ["use tradingModes as capability source"]);
    expect(instructions).toContain("Already on the ledger");
    expect(instructions).toContain("use tradingModes as capability source");
  });

  it("omits the block when nothing is recorded yet", () => {
    expect(buildPrompt([cand], 10, "en").instructions).not.toContain("Already on the ledger");
  });
});
