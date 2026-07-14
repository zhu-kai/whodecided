import type { DecisionEntry } from "../ledger/schema.js";

const PER_COLUMN = 5;

export function renderDocket(entries: DecisionEntry[], header: string): string {
  const silent = entries.filter((e) => e.by === "agent" && !e.aware);
  const reflexive = entries.filter((e) => e.by === "user" && !e.aware);
  const deliberate = entries.filter((e) => e.aware);
  const lines: string[] = [header, ""];
  column(lines, `⚠ AI decided, never asked (${silent.length})`, silent);
  column(lines, `⚠ you didn't read (${reflexive.length})`, reflexive);
  column(lines, `✓ you decided (${deliberate.length})`, deliberate);
  return lines.join("\n");
}

function column(lines: string[], title: string, entries: DecisionEntry[]): void {
  if (entries.length === 0) return;
  lines.push(title);
  const sorted = [...entries].sort(byUrgency);
  for (const e of sorted.slice(0, PER_COLUMN)) {
    lines.push(`  ${e.id.padEnd(4)}${e.what}${annotate(e)}`);
  }
  if (sorted.length > PER_COLUMN) lines.push(`  (+${sorted.length - PER_COLUMN} more)`);
  lines.push("");
}

function byUrgency(a: DecisionEntry, b: DecisionEntry): number {
  const rank = (e: DecisionEntry) =>
    (e.precedent ? 10 : 0) + ({ low: 0, medium: 1, high: 2 }[e.reversibility ?? "high"] ?? 2);
  return rank(a) - rank(b);
}

function annotate(e: DecisionEntry): string {
  const notes: string[] = [];
  if (e.reversibility === "low") notes.push("hard to reverse");
  if (e.alternatives?.length) notes.push(`vs ${e.alternatives[0]}`);
  if (e.precedent) notes.push(`precedent ${e.precedent}, deprioritized`);
  if (e.why) notes.push(e.why);
  return notes.length > 0 ? `    ${notes.join(" · ")}` : "";
}
