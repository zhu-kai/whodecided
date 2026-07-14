export interface LineError {
  line: number;
  message: string;
}

export interface JsonlResult<T> {
  values: T[];
  errors: LineError[];
}

/**
 * Parse jsonl text line by line. Bad lines are collected as errors and
 * skipped, never aborting the whole file (hand-edited ledgers must survive).
 * `parseValue` returns the parsed value, or an error message string.
 */
export function parseJsonl<T>(
  text: string,
  parseValue: (value: unknown) => T | string,
): JsonlResult<T> {
  const values: T[] = [];
  const errors: LineError[] = [];
  text.split("\n").forEach((raw, index) => {
    if (raw.trim() === "") return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      errors.push({ line: index + 1, message: "invalid JSON" });
      return;
    }
    const result = parseValue(json);
    if (typeof result === "string") {
      errors.push({ line: index + 1, message: result });
    } else {
      values.push(result);
    }
  });
  return { values, errors };
}
