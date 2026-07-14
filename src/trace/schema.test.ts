import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTrace } from "./schema.js";

const fixture = readFileSync(new URL("../../fixtures/trace.jsonl", import.meta.url), "utf8");

describe("parseTrace", () => {
  it("parses the fixture trace", () => {
    const { values, errors } = parseTrace(fixture);
    expect(errors).toEqual([]);
    expect(values).toHaveLength(2);
    expect(values[0]?.type).toBe("test_run");
  });

  it("flags unknown event types", () => {
    const { values, errors } = parseTrace('{"t":"2026-07-11T10:45:00","type":"contract_change"}');
    expect(values).toEqual([]);
    expect(errors[0]?.message).toBe("unknown event type: contract_change");
  });
});
