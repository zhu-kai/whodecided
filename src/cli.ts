#!/usr/bin/env node

const USAGE = `whodecided (wdd) - common law for agentic coding

Usage: wdd <command> [args]

Everyday:
  review           Distill, open the workbench, rule (Approve/Reject save straight to the ledger).
                   --term terminal flow · --distill-only zero-config read-only demo · --html static snapshot
                   --claude / --codex force the distiller for this run (default: auto-detect)
  recall <term>    Search ruled precedent (only decisions you've ratified)
  gate             Two-green merge gate (exit 0 = all green); for pre-push / CI

Setup (once):
  hook install     Install CC hooks + /recall skill, and pick the memory file for precedents
  share <repo|local>  Audit travels with the repo (committed) or stays local
  sync             Change/refresh the memory-file target (auto-syncs on each ruling otherwise)

Output & collaboration:
  report [--md]    Audit report for a PR description
  board [dirs...]  Read-only multi-repo overview page
  apply [patch]    Land a static-snapshot patch (the live workbench saves directly)

Internal (run by hooks):
  distill          Headless incremental distill
  hook trace | autodistill   PostToolUse / Stop receivers
`;

const commands = ["review", "apply", "recall", "gate", "report", "board", "share", "sync", "distill", "hook"];

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h") {
  process.stdout.write(USAGE);
  process.exit(command ? 0 : 1);
}

if (!commands.includes(command)) {
  process.stderr.write(`wdd: unknown command "${command}"\n\n${USAGE}`);
  process.exit(1);
}

if (command === "review") {
  const { review } = await import("./commands/review.js");
  process.exit(await review(rest));
}
if (command === "apply") {
  const { apply } = await import("./commands/apply.js");
  process.exit(apply(rest));
}
if (command === "recall") {
  const { recall } = await import("./commands/recall.js");
  process.exit(recall(rest));
}
if (command === "gate") {
  const { gate } = await import("./commands/gate.js");
  process.exit(gate(rest));
}
if (command === "report") {
  const { report } = await import("./commands/report.js");
  process.exit(report(rest));
}
if (command === "board") {
  const { board } = await import("./commands/board.js");
  process.exit(board(rest));
}
if (command === "share") {
  const { share } = await import("./commands/share.js");
  process.exit(share(rest));
}
if (command === "sync") {
  const { sync } = await import("./commands/sync.js");
  process.exit(await sync(rest));
}
if (command === "distill") {
  const { distillCmd } = await import("./commands/distill.js");
  process.exit(await distillCmd(rest));
}
if (command === "hook") {
  const { hook } = await import("./commands/hook.js");
  process.exit(await hook(rest));
}

process.stderr.write(`wdd ${command}: not implemented yet (see SPEC.md section 8)\n`);
process.exit(1);
