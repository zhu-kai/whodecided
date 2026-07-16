# whodecided

[![npm](https://img.shields.io/npm/v/whodecided)](https://www.npmjs.com/package/whodecided)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-blue)](https://nodejs.org/)
[![Tests](https://github.com/zhu-kai/whodecided/actions/workflows/test.yml/badge.svg)](https://github.com/zhu-kai/whodecided/actions/workflows/test.yml)

English | [中文](README.zh-CN.md)

Audit the decisions your AI coding agent made without asking - then turn your rulings into rules it follows.

**[▶ Live demo](https://zhu-kai.github.io/whodecided/)**

[![workbench](docs/screenshot.png)](https://zhu-kai.github.io/whodecided/)

## The problem

An agent session makes dozens of silent decisions: fall back to free shipping when data is missing, skip the failing test, assume the API includes duties.
The diff shows what changed, never what was chosen - and half of "your" decisions were a `y` pressed in 1.2 seconds.
Unreviewed guesses ship, and the agent makes the same guess again next week.

## How it solves it

1. **Distill** - one LLM pass (your own `claude` / `codex` CLI) turns session transcripts into a one-screen ledger of decisions, with the "why" and the transcript evidence.
2. **Rank** - deterministic signals sort the review: risk score (silent × hard-to-undo × churn), weakened tests, decision threads ("walked back by D8"), the actual branch diff.
3. **Rule** - Approve or Reject each (`j/k` + `a/r`); rulings write straight to an append-only ledger in `.wdd/`.
4. **Ratchet** - approved rules land in `CLAUDE.md` / `AGENTS.md`, `wdd gate` blocks unreviewed silent decisions from main, and the next session starts from your precedent.

The same decision is never guessed twice.

## Usage

```bash
# try it read-only on your existing sessions (no config, writes nothing)
npx whodecided review --distill-only
```

```bash
npm i -g whodecided       # gives you `wdd`
wdd hook install          # trace test runs, pick a memory file for rules
wdd review                # distill + open the workbench; Approve/Reject saves to the ledger
```

Reads Claude Code (`~/.claude/projects`) and Codex (`~/.codex/sessions`) sessions.
The audit unit is the branch: `wdd review` covers the decisions inside the current PR.

## Commands

| Command | What it does |
|---|---|
| `wdd review` | Distill + open the workbench. `--term` terminal flow, `--html` static snapshot, `--claude`/`--codex` force the distiller |
| `wdd recall <term>` | Search ruled precedent (only what you've ratified) |
| `wdd gate` | Merge gate as an exit code; for pre-push / CI |
| `wdd report --md` | Audit report for a PR description |
| `wdd board [dirs...]` | Read-only multi-repo overview page |
| `wdd hook install` | Install hooks + `/recall` skill, choose where rules are written |
| `wdd share <repo\|local>` | Track `.wdd/` in git, or keep it local |
| `wdd sync` | Change / refresh the memory-file target for rules |

## How it works

A decision counts when a reasonable alternative existed and choosing it changes behavior, security, or maintenance cost.
One ledger entry (append-only jsonl; rulings are appended, entries never rewritten):

```json
{"id":"D3","what":"treat a missing shipping block as free shipping","why":"legacy listings keep rendering",
 "by":"agent","aware":false,"tags":["assumption"],"files":["src/shipping.ts"],"ref":"tx:a1b2:1042"}
```

- Prose follows your language; machine matching uses the language-neutral `tags`.
- `ref` anchors the transcript, and the excerpt is persisted (secret-redacted) in `.wdd/evidence.jsonl`, so evidence survives session rotation.
- Only ruled decisions become precedent - unreviewed guesses never leak into agent memory.

## Design constraints

- **No server, no database, no API keys.** Plain text in your repo; the one LLM call shells out to your authenticated `claude`/`codex` CLI (auto-detected, pinnable via `distill.cmd`).
- **It never commits for you** by default.
- **One screen.** Every default output fits a screen; ≤10 decisions per branch.
- Single runtime dependency (`yaml`); the workbench is one self-contained HTML file.

## License

MIT
