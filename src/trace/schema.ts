import { parseJsonl, type JsonlResult } from "../jsonl.js";
import { isIsoTimestamp, isNonEmptyString, isRecord } from "../validate.js";

export interface TestRunEvent {
  t: string;
  type: "test_run";
  kind: string;
  cmd: string;
  exit: number;
  pass?: number;
  fail?: number;
  cwd?: string;
}

export type TraceEvent = TestRunEvent;

export function parseTraceEvent(value: unknown): TraceEvent | string {
  if (!isRecord(value)) return "not an object";
  if (value.type !== "test_run") return `unknown event type: ${String(value.type)}`;
  if (!isIsoTimestamp(value.t)) return "t: ISO timestamp required";
  if (!isNonEmptyString(value.kind)) return "kind: non-empty string required";
  if (!isNonEmptyString(value.cmd)) return "cmd: non-empty string required";
  if (typeof value.exit !== "number") return "exit: number required";
  for (const key of ["pass", "fail"]) {
    if (value[key] !== undefined && typeof value[key] !== "number") return `${key}: number expected`;
  }
  return value as unknown as TestRunEvent;
}

export function parseTrace(text: string): JsonlResult<TraceEvent> {
  return parseJsonl(text, parseTraceEvent);
}
