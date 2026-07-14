# AGENTS.md

Guidance for AI agents and contributors working on **whodecided** itself.

## What this is

A thin TypeScript CLI that distills the decisions an AI coding agent (and you) made inside Claude Code / Codex sessions into an append-only, ratifiable ledger, then feeds ratified precedent back to agents. "Common law for agentic coding."

The product is: a schema + a discardable CLI + a `.wdd/` directory of plain text inside the user's repo. `git`, `claude -p`/`codex exec`, and the browser are shelled out. The tool holds no state of its own.

## Build / test / run

```bash
npm run build      # tsc → dist/
npm test           # vitest (unit tests live next to sources as *.test.ts)
node dist/cli.js --help
```

- Node ≥ 20, ESM (`"type": "module"` → import paths use `.js`).
- Single runtime dependency: `yaml`. Do not add more; argv parsing and everything else is stdlib.
- `dist/` and `planning/` are gitignored. Design docs (SPEC.md, REVIEW-SPEC.md, CROSS-REVIEW.md) live in `planning/` — read them for the full rationale; they are not published.

## Architecture

Read-only pipeline with exactly two write points (distill → ledger, ratify → ledger):

```
cli.ts → commands/*            command routing + orchestration
  transcript/  locate + parse  ~/.claude/projects/*.jsonl → SessionEvent[]
  extract/     candidates      deterministic decision candidates + aware heuristics (NO LLM)
  distill/     distiller        claude -p subprocess → LedgerEntry[] (schema-validated, retry, degrade)
  ledger/      schema + io      append-only jsonl read/write; verdictOf/isPinned/noteOf
  patch/       apply            THE single write path: validate → append ratify lines → (opt) commit
  checks/      gate             two-green status (pure function)
  render/      term/md/html     terminal docket / PR markdown / single-file workbench
  config.ts git.ts jsonl.ts validate.ts   infra
```

`render/*` and `checks/*` are pure functions (data in, string/struct out) — unit-test them directly.

## Invariants (do not break)

- **Single write path.** Every ledger mutation goes through `patch/apply.ts applyOps`. The live server's `POST /apply` and terminal ratify both call it. Never write `ledger.jsonl` elsewhere except the distill append in `commands/distill.ts`.
- **Precedent is human-ruled only.** `recall` / the CLAUDE.md digest never surface unratified (pending) decisions — that would let an agent follow its own unreviewed guess. Enforced by `recallHits` and `sync.precedentLines`.
- **Never auto-commit by default.** The tool writes files; it commits only when `config.commit === "on"`. Do not touch the user's git history uninvited.
- **Hooks never disturb the session.** `hook trace` / `hook autodistill` swallow all errors and exit 0.
- **Latest ruling wins.** `verdictOf`/`isPinned`/`noteOf` scan ratify lines from the end. The ledger is append-only; changing a mind appends, never rewrites.
- **Data sovereignty.** Truth is plain text in `.wdd/`. `rm -rf` the tool and everything stays readable with cat/jq/grep.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`. Prefer `interface` over `type`.
- Comments only for constraints the code can't show; code should be self-documenting.
- Plain dash `-`, never the em dash.
- `render/html.ts` builds the workbench as one template-literal string. Inside the emitted `<script>`, escape regexes/newlines for the outer literal (`\\n`, `/[/]/`, `\\"`); a single backslash there silently breaks the page.
- Keep tests tiny and behavior-focused; they sit beside the code as `*.test.ts` (excluded from the build).
