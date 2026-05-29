# Optimization Pipeline

This folder drives a 3-agent automated optimization loop (scheduled remote Claude Code agents).
All work happens on the `feature/agent` branch.

## Files

- **`backlog.md`** — Raw optimization ideas. **The human owner appends here freely** (one block per idea). Source of truth for "what could be done".
- **`triage.md`** — Produced/maintained by **Agent1 (daily 01:00 CST)**. Prioritized + complexity-assessed view of the backlog, plus today's "next up" pick. Carries a `Last triaged:` date so downstream agents can check freshness.
- **`explore.md`** — Produced by **Agent3 (daily 03:00 CST)**. New optimization directions discovered by exploring the codebase + recent progress.

## The loop

1. **Agent1 — Triage (01:00 CST):** read `backlog.md`, assess each not-done item for priority (P0/P1/P2) and implementation complexity (S/M/L), reconcile statuses against merged PRs / git log, rewrite `triage.md` with a dated "next up" recommendation. Commit + push.
2. **Agent2 — Implement (02:00 CST):** read `triage.md`, verify today's triage is fresh, pick the highest-priority not-done item, implement it on a new branch off `feature/agent`, add/adjust tests, run the full regression suite, open a PR targeting `feature/agent`. Update the item's status in `triage.md`. **Opens PR only — never merges.**
3. **Agent3 — Explore (03:00 CST):** read `backlog.md` + `triage.md` + recent git history, propose new optimization directions, append them (dated) to `explore.md`; promote the strongest into `backlog.md`. Commit + push.

## Status values (used in backlog.md and triage.md)

`new` → `triaged` → `in-progress` (PR open) → `done` (PR merged)

## Guardrails for Agent2

- One item per run, smallest viable scope.
- Never run DB migrations, delete user data, or do large refactors.
- If regression tests fail, still open the PR but mark it DRAFT and document the failures in the PR body. Never merge.
