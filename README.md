# whodecided

> *because you rubber-stamped 5 decisions yesterday and don't know it.*

**[▶ Live demo](https://zhu-kai.github.io/whodecided/)** - a sample audit you can click through: risk triage, decision threads, the branch diff, and a quietly skipped test.

Your AI coding agent makes dozens of silent decisions per session - it stored the token in localStorage, skipped an edge case, defaulted page size to 20.
You never saw the choice, and the diff shows what changed, never what was chosen.
And half the time *you* "decided" by hitting `y` in 1.2 seconds.

**whodecided** distills those decisions out of your Claude Code / Codex sessions into a one-screen ledger you rule on like a judge. Approve or reject each; the ones you approve become precedent your agents follow next time instead of guessing.

It's a thin CLI + a `.wdd/` folder of plain text in your repo. No server, no database, no API keys - the distiller shells out to your already-authenticated `claude` / `codex` CLI.

## Three decisions you never made

**The fail-open default.**

```
⚠ D3 · AI decided, never asked                                      RISK
  Treat a missing shipping block as free shipping
  why: legacy listings keep rendering during the rollout
```

Sounds considerate.
It is also fail-open on money: missing data now sells free shipping.
The summary said "done, 314 tests pass" and the diff was green - nobody chose this, the agent did, and told no one.
`wdd review` ranks it at the top (silent × touches every price on the page × spread across 3 files).
You hit Reject with a note; "DON'T default missing shipping data to free" lands in your agents' memory, and none of them guesses that again.

**The quietly skipped test.**

```
⚠ Tests weakened on this branch
  src/pricing.test.ts - 1 test removed, 1 added .skip
```

The agent changed a default, the old cap test failed, so it skipped the test and reported green.
No LLM judgement involved in catching it: wdd reads the branch diff, and deleted tests, added `.skip`s, and dropped assertions go red at the top of the review - whatever the summary claimed.

**The assumption that aged badly.**

```
⚠ D4 · AI decided · stated as an assumption          #1 in "Review these first"
  Proceed on the assumption that international listings include duties in the fee
    ↩ walked back by D8 - "real listings carry duties separately; reverted"
```

Two days and 120 lines later, the agent quietly reversed its own guess.
The thread links the assumption to the walk-back, so you review them as one story - not two unrelated rows 18 hours apart.

## Quick start

```bash
cd your-project
npx whodecided review --distill-only   # read-only, zero config: run over your EXISTING sessions
```

That's the demo: it reads your Claude Code sessions (`~/.claude/projects`) and Codex sessions (`~/.codex/sessions`) and lists the decisions you didn't know you made. If a line makes your spine tingle, install it for real:

```bash
npm i -g whodecided       # gives you `wdd`
wdd hook install          # trace test runs, pick a memory file for rules
wdd review                # distill + open the workbench; Approve/Reject saves to the ledger
```

## The quality ratchet

Every session, the agent guesses wherever your intent runs out.
Every ruling converts one guess into a rule.
The guess space shrinks; the defaults get better; quality only moves one way.

```
 session N        the agent guesses where your intent ran out
     │
     ▼
 distill          silent decisions + your 1.2s approvals → a one-screen ledger
     │
     ▼
 review           ranked by risk, next to the branch diff
     │              Approve → a DO rule       Reject → a DON'T rule + you fix the code
     ▼
 agent memory     rules land in CLAUDE.md / AGENTS.md (+ /recall)
     │
     ├──▶ wdd gate: unreviewed silent decisions can't reach main (pre-push / CI)
     ▼
 session N+1      starts from your precedent - fewer guesses, and the same
     │            decision is never guessed twice
     └──────────────▶ repeat: each pass tightens the next one
```

The audit unit is the **branch** - `wdd review` covers the decisions inside the current PR.

## What review shows you

- **Review these first** - pending decisions ranked by a deterministic risk score: silent, hard to reverse, stated as an assumption, high churn, spread across files.
- **The actual code** - a change map of the branch (per-file diff, expandable), and each decision's own hunks in its drawer.
- **Weakened tests** - deleted tests, added `.skip`s, dropped assertions, flagged in red.
- **Decision threads** - a Threads tab groups decisions that changed the same code, and a later decision that walks an earlier one back is linked to it ("walked back by D14").
- **Tests after the change** - whether a test run followed each behavior-changing decision.
- **The evidence** - the (secret-redacted) transcript excerpt each decision was distilled from.

All of it is computed locally from git and the ledger - the only LLM call is the distill step.

## Commands

| Command | What it does |
|---|---|
| `wdd review` | Distill, open the workbench, rule (Approve/Reject saves straight to the ledger). `--term` terminal flow, `--distill-only` read-only demo, `--html` static snapshot, `--claude`/`--codex` force the distiller |
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
 "alternatives":["httpOnly cookie"],"files":["src/auth.ts"],"tags":["assumption"],"ref":"tx:a1b2:1042"}
```

The prose is written in your language; the machine-readable semantics travel in `tags`, so the risk and thread signals work no matter what language you work in.
`ref` points back into the transcript, and the excerpt it was distilled from is persisted (secret-redacted) in `.wdd/evidence.jsonl` - the "why" survives even after your agent rotates the session away.
Only decisions you *ruled on* become precedent; unreviewed guesses never leak into agent memory.

**Review before merge, not after.** Overturning a decision pre-merge is a cheap fix in the worktree; post-merge it's a new PR or a migration.

## Design constraints

- **No server, no database, no daemon.** The truth is plain text in your repo; `rm -rf` the tool and it all stays readable with cat/jq/grep.
- **It never commits for you** by default - it writes files and leaves your git history alone (opt in with `commit: on`).
- **Zero API keys.** The one LLM consumer shells out to your `claude` / `codex` CLI - auto-detected from what's installed and what your sessions used, pinnable via `distill.cmd`, and it tells you plainly when neither is available.
- **One screen.** Every default output fits a screen; ≤10 decisions per branch.
- Single runtime dependency (`yaml`); the HTML workbench is a self-contained file (embedded JSON, vanilla JS, no CDN, no build).

## License

MIT
