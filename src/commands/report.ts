import { loadWatermark, watermarkPath } from "../distill/watermark.js";
import { gateStatus } from "../checks/gate.js";
import { ledgerPath, readLedger } from "../ledger/io.js";
import { renderMd } from "../render/md.js";
import { analyzeBranch } from "./signals.js";
import { resolveScope } from "./scope.js";

export function report(args: string[]): number {
  const scope = resolveScope(args, process.cwd());
  if (!scope.root) {
    process.stderr.write("wdd report: not inside a git repo\n");
    return 1;
  }
  const { entries, ratifies } = readLedger(ledgerPath(scope.root));
  const scoped = scope.branch ? entries.filter((e) => !e.branch || e.branch === scope.branch) : entries;
  const status = gateStatus(scoped, ratifies, scope.candidates, loadWatermark(watermarkPath(scope.root)));
  const { weakened } = analyzeBranch(scope.root);
  process.stdout.write(renderMd(scoped, ratifies, status, scope.branch ?? "repo", weakened) + "\n");
  return 0;
}
