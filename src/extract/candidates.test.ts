import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates.js";
import type { SessionEvent } from "../transcript/parser.js";

const base = { session: "s1", t: "2026-07-13T10:00:00Z" };

describe("extractCandidates", () => {
  it("never grants aware from waiting: plans stay unaware at any latency", () => {
    const events: SessionEvent[] = [
      { ...base, line: 1, kind: "user_text", text: "go" },
      { ...base, line: 2, kind: "plan_approval", latencyMs: 300_000, text: "plan" },
      { ...base, line: 3, kind: "question_response", latencyMs: 20000, text: "cookie" },
    ];
    const cands = extractCandidates(events);
    expect(cands.find((c) => c.kind === "plan")).toMatchObject({ aware: false, bundled: true, ref: "tx:s1:2" });
    expect(cands.find((c) => c.kind === "question")).toMatchObject({ aware: true });
  });

  it("emits one turn slice per user prompt", () => {
    const events: SessionEvent[] = [
      { ...base, line: 1, kind: "user_text", text: "task A" },
      { ...base, line: 2, kind: "assistant_text", text: "doing A" },
      { ...base, line: 3, kind: "user_text", text: "task B" },
      { ...base, line: 4, kind: "tool_use", toolName: "Edit", text: "b.ts" },
    ];
    const turns = extractCandidates(events).filter((c) => c.kind === "turn");
    expect(turns).toHaveLength(2);
    expect(turns[0]?.slice).toContain("[2] AGENT: doing A");
    expect(turns[1]?.slice).toContain("TOOL Edit");
  });
});
