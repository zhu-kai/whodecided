# whodecided

> *because you rubber-stamped 5 decisions yesterday and don't know it.*

Your AI coding agent makes dozens of silent decisions per session - it stored the token in localStorage, skipped an edge case, defaulted page size to 20. You never saw the choice, and the diff won't show it. And half the time *you* "decided" by hitting `y` in 1.2 seconds.

**whodecided** distills those decisions out of your Claude Code / Codex sessions into a one-screen ledger you rule on like a judge. Approve or reject each; the ones you approve become precedent your agents follow next time instead of guessing.

It's a thin CLI + a `.wdd/` folder of plain text in your repo. No server, no database, no API keys - the distiller shells out to your already-authenticated `claude` / `codex` CLI.

## Quick start

```bash
cd your-project
npx whodecided review --distill-only   # read-only, zero config: run over your EXISTING sessions
```

That's the demo: it reads `~/.claude/projects/*.jsonl` and lists the decisions you didn't know you made. If a line makes your spine tingle, install it for real:

```bash
npm i -g whodecided       # gives you `wdd`
wdd hook install          # trace test runs, pick a memory file for rules
wdd review                # distill + open the workbench; Approve/Reject saves to the ledger
```

## The loop

```
 A decision happens (agent session / your keypress)
      │  hooks auto-trace · transcript kept
      ▼
 distill   claude -p / codex exec → ledger  (≤10 per branch, the "why" recovered from the transcript)
      ▼
 review    one screen, three columns:
             ⚠ AI decided, never asked
             ⚠ you didn't read (the 1.2s y)
             ✓ you decided
           Approve / Reject each · pin the core ones as rules
      ▼
 recall    ratified rules → injected into the next task (CLAUDE.md / AGENTS.md + /recall)
      └──→ the same decision never gets guessed twice
```

The audit unit is the **branch** - `wdd review` covers the decisions inside the current PR.

## Commands

| Command | What it does |
|---|---|
| `wdd review` | Distill, open the workbench, rule (Approve/Reject saves straight to the ledger). `--term` terminal flow, `--distill-only` read-only demo, `--html` static snapshot |
| `wdd recall <term>` | Search ruled precedent (only what you've ratified) |
| `wdd gate` | Merge gate as an exit code (ledger fresh + all silent decisions ruled); for pre-push / CI |
| `wdd report --md` | Audit report for a PR description |
| `wdd board [dirs...]` | Read-only multi-repo overview page |
| `wdd hook install` | Install hooks + `/recall` skill, and choose where rules are written |
| `wdd share <repo\|local>` | Whether `.wdd/` is tracked by git or kept local |
| `wdd sync` | Change / refresh the memory-file target for rules |

## How it works

**What counts as a decision:** a reasonable alternative existed, and choosing it would change behavior, security, or maintenance cost. Mechanical actions don't count.

**One ledger entry** (append-only jsonl; your ruling is a separate appended line, entries are never rewritten):

```json
{"id":"D1","what":"token → localStorage","why":"simplest, no SSR","by":"agent","aware":false,
 "alternatives":["httpOnly cookie"],"files":["src/auth.ts"],"ref":"tx:a1b2:1042"}
```

`ref` points back into the transcript, so the ledger never re-narrates the session. Only decisions you *ruled on* become precedent - unreviewed guesses never leak into agent memory.

**Review before merge, not after.** Overturning a decision pre-merge is a cheap fix in the worktree; post-merge it's a new PR or a migration.

## Design constraints

- **No server, no database, no daemon.** The truth is plain text in your repo; `rm -rf` the tool and it all stays readable with cat/jq/grep.
- **It never commits for you** by default - it writes files and leaves your git history alone (opt in with `commit: on`).
- **Zero API keys.** The one LLM consumer shells out to your `claude` / `codex` CLI; model follows your CLI's default.
- **One screen.** Every default output fits a screen; ≤10 decisions per branch.
- Single runtime dependency (`yaml`); the HTML workbench is a self-contained file (embedded JSON, vanilla JS, no CDN, no build).

## License

MIT
