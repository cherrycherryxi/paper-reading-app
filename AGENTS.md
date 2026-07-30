# paper-reading-app Project Instructions

This project uses OpenWolf for context management. These instructions apply to Codex and coexist with the retained `CLAUDE.md` and `.claude/` configuration.

## Before Work

- Check `.wolf/anatomy.md` before reading project files.
- Before generating code, read `.wolf/cerebrum.md` and follow `Do-Not-Repeat`, `Key Learnings`, and user preferences.
- Before fixing a bug or failed test, read `.wolf/buglog.json`.
- Preserve the project branch policy: development and PRs target `feature/agent`; `main` is the production pointer.
- Do not use production credentials, modify production data, or push `main` during normal development.

## Project Constraints

- The backend is a pure-stdlib Python HTTP server in `app_server.py`; static frontend files are served by the backend on port `8787`.
- Frontend code is plain ES2020 loaded by script tags. Do not introduce TypeScript, bundlers, or a frontend build step.
- State shape is `{books, sessions, quotes, chatHistories, chatContexts, connections}` and persistence goes through the existing state sanitizer/API.
- API keys come from `DEEPSEEK_API_KEY` and optional `MOONSHOT_API_KEY`; never commit them or include them in hook output.
- Use `.venv/bin/python` for Python tests. Do not substitute a global `python3` when testing MCP/backend code.

## Verification

```bash
.venv/bin/python -m pytest tests/ -v
node --test tests/frontend/*.test.js
```

For a focused change, run the smallest relevant Python and Node test files and report any known fixture or environment limitation.

## OpenWolf and Codex

- Codex project hooks are in `.codex/hooks.json`; the legacy `.claude/` setup remains untouched for Claude Code.
- Project skills are in `.agents/skills/`.
- Codex can observe edits through `apply_patch`, but it has no Claude-style dedicated `Read` hook. Read accounting therefore remains instruction-driven.
- OpenWolf knowledge files are shared state. After meaningful changes, update `.wolf/anatomy.md` and append to `.wolf/memory.md`; do not use destructive Git commands to resolve knowledge-file conflicts.
- The original local launchd automation and remote Claude routines remain outside the project-level hooks migration. Codex copies under `scripts/codex/` are staged separately and must not be enabled implicitly or run concurrently with the equivalent Claude schedule.
