---
name: add-signal
description: Use when adding a triage signal to whodecided (risk factor, decision-link heuristic, coverage-style check). Encodes where signals live, the no-LLM and language rules, and how they reach the three surfaces.
---

A signal is a deterministic judgement over data already on hand (ledger entries, branch diff, traces). Adding one:

1. **Pure function in `src/checks/`** - data in, struct out, unit-tested directly. Never call git, fs, or an LLM from checks; the impure gathering lives in `src/git.ts` and `src/commands/signals.ts`.

2. **Language rule.** Ledger prose is in the user's language, so a signal must not depend on matching prose keywords. Semantics come from structured fields - if the meaning is only in the prose, add a distiller tag (`tags` in `src/ledger/schema.ts` + the tags contract in `src/distill/prompt.ts`) and match on the tag. English keyword regexes are acceptable only as a fallback for pre-tag entries.

3. **Wire once in `src/commands/signals.ts`** (`analyzeBranch` for per-branch data, `decisionSignals` for per-decision) - review, board, and report all consume from there. Do not compute signals inside a command.

4. **Surface it**: `src/render/html.ts` (WorkbenchEntry field + drawer/attention/triage as fits) and `src/render/md.ts` if it belongs in the PR report. Negative/actionable signals go in the drawer's needs-attention block; healthy states stay out of the way.

Scoring conventions in `checks/risk.ts`: silent 35 / hard-to-reverse 25 / assumption 20; diff churn, relative churn ("rewrote N% of a file", new files excluded), and scatter (entropy) top it up. High >= 60, medium >= 32. Keep new factors proportionate.
