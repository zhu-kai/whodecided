import { describe, expect, it } from "vitest";
import { distillerFlag, resolveDistiller } from "./detect.js";
import type { DecisionCandidate } from "../extract/candidates.js";

const cand = (model?: string): DecisionCandidate =>
  ({ ref: "tx:a:1", kind: "turn", aware: false, summary: "s", slice: "x", ...(model ? { model } : {}) }) as DecisionCandidate;

describe("resolveDistiller", () => {
  it("an explicit config always wins", () => {
    expect(resolveDistiller(["my-llm", "--json"], [], () => false)).toEqual({ cmd: ["my-llm", "--json"], source: "config" });
  });

  it("picks the only installed CLI", () => {
    expect(resolveDistiller(undefined, [], (b) => b === "codex")?.cmd).toEqual(["codex", "exec", "-"]);
  });

  it("with both installed, follows what produced the sessions", () => {
    const codexHeavy = [cand("gpt-5.5"), cand("gpt-5.5"), cand("claude-opus-4-8")];
    expect(resolveDistiller(undefined, codexHeavy, () => true)?.cmd[0]).toBe("codex");
    expect(resolveDistiller(undefined, [cand("claude-opus-4-8")], () => true)?.cmd[0]).toBe("claude");
  });

  it("returns undefined when nothing is installed", () => {
    expect(resolveDistiller(undefined, [], () => false)).toBeUndefined();
  });

  it("maps --codex/--claude flags to their commands", () => {
    expect(distillerFlag(["review", "--codex"])).toEqual(["codex", "exec", "-"]);
    expect(distillerFlag(["--claude"])).toEqual(["claude", "-p"]);
    expect(distillerFlag(["review"])).toBeUndefined();
  });
});
