# Codex Project Migration: paper-reading-app

Migration date: 2026-07-30

## Scope

This migration moves project-level development behavior to Codex, repairs the OpenWolf anatomy boundary, and enables separate Codex versions of the local macOS automation. Existing Claude scripts and plist files remain on disk for rollback; equivalent loaded schedules are switched one-for-one so they never run concurrently.

## Added

- `AGENTS.md`: Codex project instructions, OpenWolf protocol, branch policy, runtime constraints, and test commands.
- `.codex/hooks.json`: project-local Codex lifecycle hooks.
- `.codex/hooks/apply-patch-adapter.js`: converts Codex `apply_patch` hook input into the existing OpenWolf write-hook input shape.
- `.agents/skills/ux-reviewer/SKILL.md`: Codex project skill migrated from `.claude/agents/ux-reviewer.md`.
- `docs/codex-project-migration.md`: this record.
- `scripts/codex/`: Codex copies of the morning, implementation-poll, wrapup, Sunday weekly-report, and Monday product-owner jobs, plus launchd templates and operating notes.

## Updated

- `.wolf/config.json`: excludes `.claude/`, `uploads/`, and the local upload backup directory from anatomy scanning.
- `.wolf/hooks/shared.js`: resolves the project root from `WOLF_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, Git root, then the current directory.
- `.wolf/hooks/pre-read.js`, `.wolf/hooks/post-read.js`, `.wolf/hooks/post-write.js`: use the shared project-root resolver.
- `.wolf/anatomy.md`: regenerated from the repository root after tightening exclusions.
- `.wolf/memory.md`, `.wolf/cerebrum.md`: records the migration decision and outcome.

## Hook mapping

| Claude Code | Codex | Result |
| --- | --- | --- |
| `SessionStart` | `SessionStart` | Preserved for startup, resume, clear, and compact. |
| `PreToolUse Read` | No dedicated Codex read event | Retained for Claude; Codex follows the read protocol through `AGENTS.md`. |
| `PreToolUse Write/Edit/MultiEdit` | `PreToolUse apply_patch` | Routed through the adapter to OpenWolf `pre-write.js`. |
| `PostToolUse Write/Edit/MultiEdit` | `PostToolUse apply_patch` | Routed through the adapter to OpenWolf `post-write.js`. |
| `Stop` | `Stop` | Preserved for session ledger and memory closeout. |

## Anatomy repair

Before this phase, anatomy contained project-external paths such as `../../.claude/`, `Library/LaunchAgents/`, and temporary Claude worktree directories. The root repository was verified with `git rev-parse --show-toplevel`, the scan exclusions were tightened, and `openwolf scan` regenerated anatomy.

Result:

- Previous index: 364 entries, including external paths.
- New index: 211 repository-local entries after adding the Codex automation files.
- External-root sections: none detected after the scan.

The existing `.wolf/anatomy.md` and `.wolf/memory.md` uncommitted changes were preserved as part of the working tree; the anatomy file was intentionally regenerated because repairing its contents was in scope.

## Deliberately not migrated

- The original `~/.claude/scripts/paper-morning.sh`, `paper-implement-poll.sh`, and `paper-wrapup.sh` remain unchanged.
- The original `~/Library/LaunchAgents/com.huangnanqi.paper-*.plist` remain unchanged and continue to represent the existing Claude schedule.
- Remote triage/implement/explore Claude routines (migrated separately on
  2026-08-04; retained here as historical scope for the initial phase).
- `.wolf/cron-manifest.json` AI tasks that still invoke `claude -p`.
- `.claude/settings.json`, `.claude/settings.local.json`, and `.claude/agents/ux-reviewer.md`.

## Weekly product-loop migration (2026-08-03)

The final two local model-dependent schedules were migrated after the Claude
organization became unavailable:

- Sunday weekly report: `scripts/codex/weekly-report.sh`, read-only Codex model
  stage; metrics commit, report writing, idempotency and email remain
  deterministic shell responsibilities.
- Monday product owner: `scripts/codex/product-owner-monday.sh`, isolated
  worktree plus an explicit changed-file allowlist; shell owns commit/push and
  only targets `feature/agent`.

Both jobs support side-effect-free dry-run flags and have separate Codex labels.
The original Claude jobs are retained as unloaded rollback artifacts.

The Codex launchd files were initially staged as separate `com.huangnanqi.paper-codex-*.plist` copies under `~/Library/LaunchAgents`. Following an explicit operator request, all three Codex jobs are now loaded and the three equivalent Claude LaunchAgents are unloaded; the original files remain on disk. The morning and implementation-poll jobs require `--dangerously-bypass-approvals-and-sandbox` because they perform GitHub, Git, and backend operations; the wrapup job uses Codex read-only sandboxing and keeps shell-owned email/log output deterministic. Do not load Claude and Codex implementations for the same schedule concurrently.

## Nightly autonomous pipeline migration (2026-08-04)

The three Claude cloud routines were replaced by local Codex/launchd jobs while
preserving their established responsibilities and times: Agent1 triage at
01:00, Agent2 implement at 04:00, and Agent3 explore at 05:00. Explore also has
an idempotent 07:00 recovery trigger.

The migration deliberately strengthens orchestration outside the model:

- every run uses an isolated worktree based on `origin/feature/agent`;
- triage and explore have strict changed-path allowlists and shell-owned pushes;
- implement opens a PR against `feature/agent` and never merges or deploys;
- UTC-dated completion markers enforce triage → implement → explore ordering;
- per-agent lock directories and daily markers make retries idempotent;
- full Python and frontend suites are shell-executed, with failures producing a
  draft implementation PR rather than a merge.

The original Claude routine IDs are retained only as rollback/history metadata:
Agent1 `trig_01KpBBHSZTbhiu2Ysvh2L6ZU`, Agent2
`trig_01LY3fd6MZ9XHM8A5GHpZN9U`, and Agent3
`trig_01EZrUPo57BrDbXytCdENqdm`. They must remain disabled/unavailable while
the Codex launchd jobs are enabled.

## Verification

- `openwolf scan` completed with 203 indexed files.
- No external-root anatomy sections remain.
- Modified JavaScript files pass `node --check`.
- `.codex/hooks.json` and `.wolf/config.json` parse as valid JSON.
- All Codex automation scripts pass `bash -n`; all launchd templates pass `plutil -lint`.
- `scripts/codex/` contains no legacy `claude -p` or `--dangerously-skip-permissions` invocation.
- LaunchAgent state verified: Claude morning/implement-poll/wrapup unloaded; Codex morning/implement-poll/wrapup loaded.
- Codex wrapup was manually triggered once; it exited with code 0, generated `~/.claude/daily-logs/2026-07-30.md`, and sent the report email successfully.
- `git diff --check` passes.
- Existing Claude/OpenWolf files remain present.
