import { parseJsonl, type JsonlResult } from "../jsonl.js";
import { isNonEmptyString, isOptionalString, isRecord } from "../validate.js";

export interface RatifyOp {
  op: "ratify";
  target: string;
  verdict: "accept" | "reject";
  note?: string;
  pin?: boolean;
}

export type PatchOp = RatifyOp;

export function parsePatchOp(value: unknown): PatchOp | string {
  if (!isRecord(value)) return "not an object";
  if (value.op !== "ratify") return `unknown op: ${String(value.op)}`;
  if (!isNonEmptyString(value.target)) return "target: non-empty string required";
  if (value.verdict !== "accept" && value.verdict !== "reject") return 'verdict: "accept" or "reject" required';
  if (!isOptionalString(value.note)) return "note: string expected";
  if (value.pin !== undefined && typeof value.pin !== "boolean") return "pin: boolean expected";
  return value as unknown as RatifyOp;
}

export function parsePatch(text: string): JsonlResult<PatchOp> {
  return parseJsonl(text, parsePatchOp);
}
