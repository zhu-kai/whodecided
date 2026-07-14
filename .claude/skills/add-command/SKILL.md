---
name: add-command
description: Use when adding a new `wdd` subcommand to whodecided. Walks the three wiring points and the write-path rules so the command is reachable and safe.
---

A `wdd` subcommand is wired in three places. To add `foo`:

1. **`src/commands/foo.ts`** — export `foo(args: string[]): number | Promise<number>`.
   - Read-only work (locate → parse → extract) goes through `resolveScope(args, process.cwd())`.
   - Any ledger mutation goes through `applyOps` in `src/patch/apply.ts` — the single write path. Never write `.wdd/ledger.jsonl` anywhere else (the one exception is the distill append in `commands/distill.ts`).
   - If it writes, respect config: commit only when `config.commit === "on"`, and honor `config.share`.

2. **`src/cli.ts`** — add `"foo"` to the `commands` array, then a routing branch that dynamic-imports and calls it (mirror the existing branches).

3. **Docs** — add a `foo` row to the `--help` text in `src/cli.ts` and to the command table in `README.md`.

Then run `/verify` (build + test). Keep the invariants in AGENTS.md intact - especially: precedent is human-ruled only, and hooks must never throw.
