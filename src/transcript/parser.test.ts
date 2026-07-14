import { describe, expect, it } from "vitest";
import { parseTranscript } from "./parser.js";

function line(obj: object): string {
  return JSON.stringify(obj);
}

const transcript = [
  line({ type: "permission-mode", permissionMode: "default" }),
  line({ type: "user", timestamp: "2026-07-13T10:00:00Z", gitBranch: "feat/x", cwd: "/p", message: { role: "user", content: "add login" } }),
  line({ type: "assistant", timestamp: "2026-07-13T10:00:05Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "t1", name: "AskUserQuestion", input: {} }] } }),
  line({ type: "user", timestamp: "2026-07-13T10:00:07Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "cookie" }] } }),
  line({ type: "assistant", timestamp: "2026-07-13T10:00:10Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "a.ts" } }] } }),
  line({ type: "user", timestamp: "2026-07-13T10:00:11Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: "The user doesn't want to proceed with this tool use." }] } }),
  line({ type: "user", isSidechain: true, message: { role: "user", content: "subagent noise" } }),
  line({ type: "file-history-snapshot" }),
].join("\n");

describe("parseTranscript", () => {
  const events = parseTranscript("s1", transcript);

  it("re-kinds human-gated tool results and computes latency", () => {
    const q = events.find((e) => e.kind === "question_response");
    expect(q?.latencyMs).toBe(2000);
    expect(q?.toolName).toBe("AskUserQuestion");
  });

  it("flags rejections and skips sidechains", () => {
    const veto = events.find((e) => e.rejected);
    expect(veto?.toolName).toBe("Edit");
    expect(events.some((e) => e.text === "subagent noise")).toBe(false);
  });

  it("carries branch, cwd, and mode", () => {
    expect(events[0]).toMatchObject({ kind: "mode_change", mode: "default" });
    expect(events.find((e) => e.kind === "user_text")).toMatchObject({ branch: "feat/x", cwd: "/p" });
  });

  it("records the model on assistant events, skips synthetic", () => {
    const withModel = parseTranscript(
      "s",
      [
        JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4-8", content: [{ type: "text", text: "hi" }] } }),
        JSON.stringify({ type: "assistant", message: { role: "assistant", model: "<synthetic>", content: [{ type: "text", text: "filler" }] } }),
      ].join("\n"),
    );
    expect(withModel[0]?.model).toBe("claude-opus-4-8");
    expect(withModel[1]?.model).toBeUndefined();
  });
});
