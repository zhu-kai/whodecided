import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePatch } from "./schema.js";

const fixture = readFileSync(new URL("../../fixtures/patch.jsonl", import.meta.url), "utf8");

describe("parsePatch", () => {
  it("parses the fixture patch", () => {
    const { values, errors } = parsePatch(fixture);
    expect(errors).toEqual([]);
    expect(values.map((op) => op.verdict)).toEqual(["accept", "reject"]);
  });

  it("rejects bad verdicts", () => {
    const { errors } = parsePatch('{"op":"ratify","target":"D1","verdict":"maybe"}');
    expect(errors[0]?.message).toBe('verdict: "accept" or "reject" required');
  });
});
