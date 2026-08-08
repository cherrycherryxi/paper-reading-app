---
name: nightly-product-agents
description: "Run one phase of the paper-reading-app remote nightly product pipeline in Codex Cloud: product backlog triage, one-item implementation with a pull request, or evidence-based exploration. Use for Scheduled Cloud runs, manual recovery of a missed nightly phase, or auditing whether a nightly phase already completed against feature/agent."
---

# Nightly Product Agents

Run exactly one requested phase: `triage`, `implement`, or `explore`. Treat GitHub and the repository as durable state; never depend on files under a particular user's home directory.

## Shared guardrails

1. Establish the `feature/agent` baseline before any phase work.

   - If `origin/feature/agent` is available, run `git fetch origin feature/agent` and use `origin/feature/agent` as `BASE_REF`.
   - If no `origin` remote exists, treat this as a Codex Cloud checkout. Use the connected GitHub tool to fetch the current tip SHA of `cherrycherryxi/paper-reading-app:feature/agent`; compare it with `git rev-parse HEAD`. Continue only when the SHAs are identical, then use `HEAD` as `BASE_REF`.
   - If neither verification path is available, return `FAILED`; do not assume that a local branch named `work` is based on `feature/agent`.

   Never push or merge `main`, deploy, access production credentials, or modify production data.
2. Read `AGENTS.md`, then `.wolf/anatomy.md` and `.wolf/cerebrum.md`. For `implement` and `explore`, also read `.wolf/buglog.json`.
3. Use Asia/Shanghai's calendar date as `RUN_DATE` (`YYYY-MM-DD`). Include it in commits, branches, PR bodies, and completion summaries.
4. Fetch GitHub evidence once per phase. Prefer the connected GitHub tool; otherwise use authenticated `gh`. Never infer branch or PR state from local history alone. When the checkout has no `origin` remote, use the connected GitHub tool both to verify `feature/agent` and to publish commits, branches, and pull requests; do not run `git push`.
5. Do not use local launchd markers, `/Users/...` paths, Bark scripts, or another machine's worktree.
6. Keep `.wolf/` out of implementation PRs. OpenWolf may update those files during the run; leave them uncommitted rather than discarding or staging them on an implementation branch. Triage and explore may include directly relevant `.wolf/` bookkeeping in their knowledge-only commit.
7. End with `PHASE`, `RUN_DATE`, `STATUS`, `ARTIFACT`, and a concise Chinese summary. `STATUS` must be `COMPLETED`, `SKIPPED`, or `FAILED`.

## Phase: triage

Read `optimization/roadmap.md`, `optimization/signals.md`, `optimization/backlog.md`, and `optimization/triage.md`.

1. If `optimization/triage.md` already says `Last triaged: RUN_DATE`, return `SKIPPED` with the existing commit as evidence.
2. Inspect commits from the previous eight days and the latest 50 PRs targeting `feature/agent`. Count implementation PRs whose head starts with `auto/` or whose body contains `Nightly-Agent: implement` during the previous seven days.
3. Reconcile merged work against real code and PR evidence. Mark completed entries done; do not trust stale prose.
4. Evaluate every unfinished item for priority, S/M/L size, current roadmap theme, real signals, and North Star impact. Park unsupported work at P3.
5. Select at most one unfinished item that fits one PR. If the seven-day implementation budget has reached eight, explicitly select none.
6. Modify only `optimization/triage.md`, `optimization/backlog.md`, and directly relevant `.wolf/` bookkeeping.
7. Commit with `chore(triage): Codex cloud triage RUN_DATE` and push directly to `feature/agent`. If the remote moved, fetch and reconcile knowledge files without destructive Git commands, then retry once.
8. Use the pushed commit URL or SHA as `ARTIFACT`.

## Phase: implement

Read `optimization/triage.md` and identify its single `Next up` item.

1. Require `Last triaged: RUN_DATE`. If it is stale, or no item is assigned, return `SKIPPED`; do not substitute another backlog item.
2. Search open and closed PRs targeting `feature/agent`. If a PR body already contains both `Nightly-Agent: implement` and `Run-Date: RUN_DATE`, return `SKIPPED` with that PR URL.
3. Confirm the assigned item is still incomplete in current code. Implement only that item with the smallest viable scope and focused tests.
4. Do not modify `optimization/roadmap.md`, `optimization/signals.md`, `optimization/explore.md`, deployment files, workflows, credentials, or data. In `optimization/triage.md`, only mark the item `in-progress` with `Codex cloud PR pending`.
5. Run the focused tests, then the project-required full suites:
   - `.venv/bin/python -m pytest tests/ -v`
   - `node --test tests/frontend/*.test.js`
6. Create branch `auto/codex-<item-number>-<YYYYMMDD>`. Commit only product code, tests, and the permitted triage edit; exclude `.wolf/`.
7. - If `origin` is available, publish with Git normally.
- Otherwise, publish through the connected GitHub tool:
  create the required branch or commit from the verified base SHA, upload only the intended files, and open the required PR through GitHub. Never merge it. The PR body must contain:
   - `Nightly-Agent: implement`
   - `Run-Date: RUN_DATE`
   - `Backlog: OPT-NNN`
   - problem, implementation, user impact, and exact test results
8. If either full suite fails, open the PR as draft and explain the failure. Otherwise open it ready for review. Use the PR URL as `ARTIFACT`.

## Phase: explore

Read `optimization/backlog.md`, `optimization/triage.md`, `optimization/roadmap.md`, `optimization/signals.md`, and recent Git history. Also inspect open PRs targeting `feature/agent`.

1. If `optimization/explore.md` already has a top-level section for `RUN_DATE`, return `SKIPPED` with the existing commit as evidence.
2. Run independently of the Implement result. Treat an open nightly implementation PR as evidence when checking for duplication.
3. Explore three to six new directions across UX, correctness, performance, accessibility, error handling, or code health. Every claimed gap must cite current `file:line` evidence.
4. Reject anything already represented by backlog, open PRs, merged code, or an older exploration entry.
5. Append a `RUN_DATE` section to `optimization/explore.md`. Promote at most two strongly evidenced items to `optimization/backlog.md`, allocating IDs only after fetching the latest remote branch.
6. Modify only `optimization/explore.md`, `optimization/backlog.md`, and directly relevant `.wolf/` bookkeeping.
7. Commit with `chore(explore): Codex cloud directions RUN_DATE` and push directly to `feature/agent`. If the remote moved, reconcile and retry once without destructive Git commands.
8. Use the pushed commit URL or SHA as `ARTIFACT`.

## Failure behavior

- Never report success without a durable GitHub artifact.
- If repository access, authentication, tests, or push/PR creation fails, return `FAILED` with the exact failing command or tool result and the safest next action.
- Leave recoverable work in the Cloud run. Do not silently discard changes or claim another phase will recover them.
