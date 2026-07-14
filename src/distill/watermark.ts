import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";

/** Highest transcript line already distilled, per session. Disposable cache. */
export type Watermark = Record<string, number>;

export function watermarkPath(repoRoot: string): string {
  return join(repoRoot, ".wdd", ".cache", "watermark.yaml");
}

export function loadWatermark(file: string): Watermark {
  if (!existsSync(file)) return {};
  try {
    const data = parse(readFileSync(file, "utf8"));
    return typeof data === "object" && data !== null ? (data as Watermark) : {};
  } catch {
    return {};
  }
}

export function saveWatermark(file: string, wm: Watermark): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringify(wm));
}
