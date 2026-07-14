import { loadWatermark, watermarkPath } from "../distill/watermark.js";
import { gateStatus } from "../checks/gate.js";
import { ledgerPath, readLedger } from "../ledger/io.js";
import { resolveScope } from "./scope.js";

/** Deterministic, read-only, no LLM: safe and free to run in CI. */
export function gate(args: string[]): number {
  const scope = resolveScope(args, process.cwd());
  if (!scope.root) {
    process.stderr.write("wdd gate: not inside a git repo\n");
    return 1;
  }
  const { entries, ratifies } = readLedger(ledgerPath(scope.root));
  const scoped = scope.branch ? entries.filter((e) => !e.branch || e.branch === scope.branch) : entries;
  const status = gateStatus(scoped, ratifies, scope.candidates, loadWatermark(watermarkPath(scope.root)));
  if (status.green) {
    process.stdout.write("gate: green (ledger fresh, all silent decisions ruled)\n");
    return 0;
  }
  if (!status.fresh) {
    process.stdout.write(`✗ ledger stale: undistilled activity in session(s) ${status.staleSessions.join(", ")} → run wdd review\n`);
  }
  for (const id of status.pendingSilent) {
    process.stdout.write(`✗ silent decision pending ruling: ${id}\n`);
  }
  return 1;
}
