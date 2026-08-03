# Codex Local Automation

These are Codex copies of the local `paper-morning`, `paper-implement-poll`,
`paper-wrapup`, Sunday weekly-report, and Monday product-owner tasks.

The existing Claude scripts and LaunchAgents remain unchanged on disk. They are currently unloaded. The three Codex LaunchAgents have been copied to `~/Library/LaunchAgents` and are currently loaded after explicit operator approval.

Morning and implement-poll use `codex exec --dangerously-bypass-approvals-and-sandbox` because they need tests, GitHub PR operations, branch pushes, dev merges, and backend restart. Their prompts prohibit `main` and production deployment, and the repository pre-push hook remains an additional guard.

Wrapup uses `codex exec --sandbox read-only`; the model returns report text and the shell script writes the file and sends email deterministically. It was manually triggered once after activation and completed successfully.

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
- `com.huangnanqi.paper-codex-product-owner` — Monday 09:00

The legacy `com.huangnanqi.weekly-report` and
`com.huangnanqi.product-owner` files remain on disk for rollback but must stay
unloaded while their Codex equivalents are loaded.

Before changing the active schedule, run both new scripts with their
`PAPER_WEEKLY_DRY_RUN=1` / `PAPER_PRODUCT_DRY_RUN=1` flags and verify Codex
authentication, branch safety, output markers, path allowlists, and email
idempotency. Never load the Codex and Claude versions of the same task
simultaneously.

When manually re-running the Monday ritual during the first seven days of a
month after a successful prune dry-run, set `PAPER_PRODUCT_SKIP_PRUNE=1` to
avoid repeating the expensive monthly `explore.md` cleanup. The scheduled job
does not set this flag and therefore keeps the monthly prune behavior.
