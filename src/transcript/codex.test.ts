import { describe, expect, it } from "vitest";
import { codexSessionId, isCodexTranscript, parseCodexTranscript } from "./codex.js";

const rollout = [
  '{"timestamp":"2026-07-15T00:00:00.000Z","type":"session_meta","payload":{"session_id":"abc","cwd":"/repo","cli_version":"0.142.0"}}',
  '{"timestamp":"2026-07-15T00:00:01.000Z","type":"turn_context","payload":{"cwd":"/repo","model":"gpt-5.4"}}',
  '{"timestamp":"2026-07-15T00:00:02.000Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"sandbox rules"}]}}',
  '{"timestamp":"2026-07-15T00:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"make pagination faster"}]}}',
  '{"timestamp":"2026-07-15T00:00:04.000Z","type":"response_item","payload":{"type":"custom_tool_call","name":"apply_patch","input":"*** Begin Patch\\n*** Update File: src/app.ts\\n*** Add File: src/cache.ts\\n*** End Patch"}}',
  '{"timestamp":"2026-07-15T00:00:05.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"I defaulted the page size to 20."}]}}',
  '{"timestamp":"2026-07-15T00:00:06.000Z","type":"event_msg","payload":{"type":"agent_message","message":"duplicate of the above"}}',
].join("\n");

describe("codex transcript adapter", () => {
  it("maps a real-shape rollout to session events", () => {
    expect(isCodexTranscript(rollout)).toBe(true);
    const events = parseCodexTranscript("s1", rollout);
    expect(events.map((e) => e.kind)).toEqual(["user_text", "tool_use", "tool_use", "assistant_text"]);
    expect(events[0]).toMatchObject({ text: "make pagination faster", cwd: "/repo" });
    expect(events[1]).toMatchObject({ toolName: "apply_patch", text: "/repo/src/app.ts" });
    expect(events[3]).toMatchObject({ model: "gpt-5.4" });
  });

  it("derives a stable session id from the rollout filename", () => {
    expect(codexSessionId("/x/rollout-2026-07-15T09-49-28-019f6309-182b-7bf0-90f2-35a32e643e29.jsonl")).toBe("35a32e643e29");
  });

  it("ignores claude-code transcripts", () => {
    expect(isCodexTranscript('{"type":"user","message":{"content":"hi"}}')).toBe(false);
  });
});
