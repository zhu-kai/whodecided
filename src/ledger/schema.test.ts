import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRatify, parseLedger } from "./schema.js";

const fixture = readFileSync(new URL("../../fixtures/ledger.jsonl", import.meta.url), "utf8");

describe("parseLedger", () => {
  it("parses the fixture ledger", () => {
    const { values, errors } = parseLedger(fixture);
    expect(errors).toEqual([]);
    expect(values).toHaveLength(6);
    expect(values.filter(isRatify)).toHaveLength(1);
  });

  it("skips bad lines with line numbers, keeps good ones", () => {
    const text = ['{"id":"D1"}', "not json", '{"id":"D2","what":"x","by":"agent","aware":false,"ref":"tx:s:1"}'].join("\n");
    const { values, errors } = parseLedger(text);
    expect(values).toHaveLength(1);
    expect(errors).toEqual([
      { line: 1, message: "what: non-empty single line required" },
      { line: 2, message: "invalid JSON" },
    ]);
  });

  it("rejects malformed refs", () => {
    const { errors } = parseLedger('{"id":"D1","what":"x","by":"agent","aware":false,"ref":"1042"}');
    expect(errors[0]?.message).toBe("ref: tx:<session>:<line> required");
  });
});
