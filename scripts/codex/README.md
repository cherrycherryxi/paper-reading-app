# Codex Local Automation

Provider-neutral invocation lives in the shared user runtime at
`/Users/huangnanqi/CursorProjects/agent-runtime`; thin adapters remain under
`scripts/agent/`. It currently supports the existing Codex CLI
and Claude Code backed by DeepSeek's Anthropic-compatible endpoint. Existing
LaunchAgents still call the Codex scripts directly: adding the runner does not
switch schedules or enable duplicate jobs. Unsafe mode fails closed unless the
caller explicitly sets `AGENT_RUNNER_ALLOW_UNSAFE=1`; task scripts remain
responsible for timeout, output markers, path allowlists, tests, Git, and alerts.

The first migration canary was `scripts/agent/paper-wrapup-shadow.sh`. It invokes
Claude Code + DeepSeek in read-only mode and writes only to
`~/.claude/agent-shadow/paper-wrapup/`. It never sends email, writes the
canonical daily report, changes Git state, or installs a LaunchAgent. It remains
manual until repeated real runs satisfy the report marker, exit-code, cost, and
content checks.

After a real shadow report passed its marker/date/length contract and its cited
commits were checked locally, the formal `paper-wrapup.sh` model stage moved to
the provider-neutral runner with `claude-deepseek`. The new LaunchAgent label is
`com.huangnanqi.paper-agent-wrapup`; the old `paper-codex-wrapup` plist remains
on disk, unloaded, as rollback. The model receives a deterministic Git log from
the shell and has only Read/Glob/Grep tools. Email, idempotency markers, report
file writes, timeout, and alerting remain shell-owned.

## DeepSeek model and billing policy

- Flash: wrapup, weekly report, nightly triage, nightly explore, product owner.
- Pro: nightly implement, morning PR handling, owner-choice implement poll.
- No model: weekly production release, tests, Git checks, email, locks, and
  state transitions.
- Thinking Effort: every scheduled/headless automation uses `low`; model tier
  selection remains independent.

Claude Code's `total_cost_usd` prices unknown third-party models with Claude's
rate table and is not used as the DeepSeek bill. The runner requests JSON,
prints only its `result` for legacy marker parsers, and appends corrected usage
to `~/.claude/agent-usage/deepseek-usage.jsonl`. The calculator uses each
model's cache-hit, cache-miss, and output tokens plus DeepSeek's weekday UTC
peak windows. Pricing lives in the shared runtime's dated
`config/deepseek-pricing.json` and must be updated when DeepSeek changes its
official pricing page.

These are Codex copies of the local `paper-morning`, `paper-implement-poll`,
`paper-wrapup`, Sunday weekly-report, Monday product-owner, and autonomous
nightly triage/implement/explore tasks.

The existing Claude scripts and LaunchAgents remain unchanged on disk. They are currently unloaded. The three Codex LaunchAgents have been copied to `~/Library/LaunchAgents` and are currently loaded after explicit operator approval.

Morning and implement-poll retain their explicit unsafe execution contract because
they need tests, GitHub PR operations, branch pushes, dev merges, and backend
restart. Their legacy Codex-shaped invocation now passes through
`scripts/agent/codex-exec-compat.sh` to Claude Code + DeepSeek. Their prompts
prohibit `main` and production deployment, and the repository pre-push hook
remains an additional guard.

Wrapup uses the provider-neutral runner in read-only mode; the model returns
report text and the shell script writes the file and sends email
deterministically. A real CCDS shadow report passed before cutover.

Weekly report also uses a read-only Codex model stage. Shell code owns north-star
metrics, the idempotent `signals.md` commit, report-file writing, and email. It
always works from an isolated worktree when pushing the metrics row, so the
owner's active checkout is not switched or overwritten.

Product owner uses an isolated detached worktree. Codex runs with
`--sandbox workspace-write`, receives recent Git/PR evidence prepared by the
shell, and may only change the four optimization planning files plus `.wolf/`.
The shell rejects any out-of-scope path before it commits and pushes to
`feature/agent`; Codex never commits, pushes `main`, or deploys production.

Active labels after migration:

- `com.huangnanqi.paper-codex-weekly-report` — Sunday 18:00
- `com.huangnanqi.paper-codex-product-owner` — Monday 08:00（DeepSeek 低谷时段）

The legacy `com.huangnanqi.weekly-report` and
`com.huangnanqi.product-owner` files remain on disk for rollback but must stay
unloaded while their Codex equivalents are loaded.

`paper-implement-poll` still checks every 30 minutes, but on weekdays it keeps
the selection in `WAITING` during 09:00–12:00 and 14:00–18:00 Asia/Shanghai.
The next off-peak poll reads the reply and starts the Pro implementation.

## Nightly autonomous pipeline

- `nightly-triage.sh` — 01:00, reconciles backlog/triage and assigns one item.
- `nightly-implement.sh` — 04:00, reads the same day's `triage.md` `Next up`
  assignment, then implements one item, runs both full test suites, and opens a PR targeting `feature/agent`.
  It is independent of the 07:00 morning candidate cards and their owner-reply state.
  It never merges; a failing suite produces a draft PR.
- `nightly-explore.sh` — 05:00 with a 07:00 recovery trigger, runs independently
  of Implement, appends evidence-backed findings and promotes at most two.

Each task runs in an isolated disposable clone, never a linked worktree, and
has a per-day completion marker plus a lock directory under
`~/.claude/codex-nightly`. A failed clone is retained and logged for diagnosis;
it is never reported as an empty Codex change. Explore has no Implement
dependency. The second Explore trigger is idempotent and recovers a failed or
interrupted 05:00 Explore run.

For side-effect-free verification, set `PAPER_NIGHTLY_DRY_RUN=1`,
`PAPER_NIGHTLY_SKIP_FETCH=1`, and optionally `PAPER_NIGHTLY_BASE_REF=HEAD`.
Dry-run never commits, pushes, creates PRs, sends alerts, or writes completion
markers.

Before changing the active schedule, run both new scripts with their
`PAPER_WEEKLY_DRY_RUN=1` / `PAPER_PRODUCT_DRY_RUN=1` flags and verify Codex
authentication, branch safety, output markers, path allowlists, and email
idempotency. Never load the Codex and Claude versions of the same task
simultaneously.

When manually re-running the Monday ritual during the first seven days of a
month after a successful prune dry-run, set `PAPER_PRODUCT_SKIP_PRUNE=1` to
avoid repeating the expensive monthly `explore.md` cleanup. The scheduled job
does not set this flag and therefore keeps the monthly prune behavior.
