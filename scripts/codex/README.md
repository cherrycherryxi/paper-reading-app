# Codex Local Automation

These are Codex copies of the local `paper-morning`, `paper-implement-poll`, and `paper-wrapup` tasks.

The existing Claude scripts and LaunchAgents remain unchanged on disk. They are currently unloaded. The three Codex LaunchAgents have been copied to `~/Library/LaunchAgents` and are currently loaded after explicit operator approval.

Morning and implement-poll use `codex exec --dangerously-bypass-approvals-and-sandbox` because they need tests, GitHub PR operations, branch pushes, dev merges, and backend restart. Their prompts prohibit `main` and production deployment, and the repository pre-push hook remains an additional guard.

Wrapup uses `codex exec --sandbox read-only`; the model returns report text and the shell script writes the file and sends email deterministically. It was manually triggered once after activation and completed successfully.

Before changing the active schedule, run a dry test with a temporary Codex executable and verify authentication, branch safety, failed-test behavior, `.wolf/sync-knowledge.sh`, and report markers. Never load the Codex and Claude versions of the same task simultaneously.
