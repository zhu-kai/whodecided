import { isRecord } from "../validate.js";

export type EventKind =
  | "user_text"
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "question_response"
  | "plan_approval"
  | "mode_change"
  | "unknown";

export interface SessionEvent {
  session: string;
  line: number;
  t?: string;
  kind: EventKind;
  text?: string;
  toolName?: string;
  toolUseId?: string;
  rejected?: boolean;
  latencyMs?: number;
  branch?: string;
  cwd?: string;
  mode?: string;
  model?: string;
}

const REJECTION_MARKER = "doesn't want to proceed";

/** Parse one CC transcript (jsonl text) into a flat event stream. */
export function parseTranscript(session: string, text: string): SessionEvent[] {
  const events: SessionEvent[] = [];
  text.split("\n").forEach((raw, index) => {
    if (raw.trim() === "") return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(json) || json.isSidechain === true) return;
    events.push(...parseLine(session, index + 1, json));
  });
  linkEvents(events);
  return events;
}

function parseLine(session: string, line: number, v: Record<string, unknown>): SessionEvent[] {
  const base = {
    session,
    line,
    t: typeof v.timestamp === "string" ? v.timestamp : undefined,
    branch: typeof v.gitBranch === "string" ? v.gitBranch : undefined,
    cwd: typeof v.cwd === "string" ? v.cwd : undefined,
  };
  if (v.type === "permission-mode" && typeof v.permissionMode === "string") {
    return [{ ...base, kind: "mode_change", mode: v.permissionMode }];
  }
  if (v.type !== "user" && v.type !== "assistant") {
    return [{ ...base, kind: "unknown" }];
  }
  const message = isRecord(v.message) ? v.message : {};
  // The model that produced this assistant turn; "<synthetic>" is CC's internal
  // filler, not a real decider, so drop it.
  const model =
    v.type === "assistant" && typeof message.model === "string" && message.model !== "<synthetic>"
      ? message.model
      : undefined;
  if (model) (base as { model?: string }).model = model;
  const content = message.content;
  if (v.type === "user" && typeof content === "string") {
    return [{ ...base, kind: "user_text", text: content }];
  }
  if (!Array.isArray(content)) return [{ ...base, kind: "unknown" }];

  const events: SessionEvent[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    if (item.type === "text" && typeof item.text === "string") {
      events.push({ ...base, kind: v.type === "user" ? "user_text" : "assistant_text", text: item.text });
    } else if (item.type === "tool_use" && typeof item.name === "string") {
      events.push({
        ...base,
        kind: "tool_use",
        toolName: item.name,
        toolUseId: typeof item.id === "string" ? item.id : undefined,
        text: summarizeInput(item.input),
      });
    } else if (item.type === "tool_result") {
      const resultText = flattenResult(item.content);
      events.push({
        ...base,
        kind: "tool_result",
        toolUseId: typeof item.tool_use_id === "string" ? item.tool_use_id : undefined,
        rejected: item.is_error === true && resultText.includes(REJECTION_MARKER),
        text: resultText,
      });
    }
  }
  return events.length > 0 ? events : [{ ...base, kind: "unknown" }];
}

function summarizeInput(input: unknown): string {
  if (!isRecord(input)) return "";
  for (const key of ["file_path", "command", "pattern", "url", "prompt"]) {
    if (typeof input[key] === "string") return (input[key] as string).slice(0, 200);
  }
  return "";
}

function flattenResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (isRecord(c) && typeof c.text === "string" ? c.text : ""))
    .join("\n");
}

/**
 * Second pass: re-kind human-gated tool results (AskUserQuestion, ExitPlanMode)
 * and compute response latencies. Those two tools block on the human, so their
 * result latency is a clean think-time signal; ordinary tool results mix
 * approval and execution time and get no latency.
 */
function linkEvents(events: SessionEvent[]): void {
  const useById = new Map<string, SessionEvent>();
  for (const e of events) {
    if (e.kind === "tool_use" && e.toolUseId) useById.set(e.toolUseId, e);
  }
  let lastAssistantT: string | undefined;
  for (const e of events) {
    if (e.kind === "assistant_text" || e.kind === "tool_use") lastAssistantT = e.t;
    if (e.kind === "user_text" && e.t && lastAssistantT) {
      e.latencyMs = Date.parse(e.t) - Date.parse(lastAssistantT);
    }
    if (e.kind !== "tool_result" || !e.toolUseId) continue;
    const use = useById.get(e.toolUseId);
    if (!use) continue;
    e.toolName = use.toolName;
    if (use.toolName === "AskUserQuestion" || use.toolName === "ExitPlanMode") {
      e.kind = use.toolName === "AskUserQuestion" ? "question_response" : "plan_approval";
      if (e.t && use.t) e.latencyMs = Date.parse(e.t) - Date.parse(use.t);
    }
  }
}
