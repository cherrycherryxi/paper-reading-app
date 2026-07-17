# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a mobile-first (iPhone 12) paper book reading tracker with a Python backend and a vanilla JS frontend.

**Frontend** (no build step, served as static files):
- `index.html` — single-page app shell; contains the `window.PAPER_READING_APP_CONFIG` config block at the top
- `app.js` — all app state, rendering, and event logic; exposes `window.paperReadingApp` as the global interface for inter-module communication
- `chat.js` — AI chat panel loaded as a separate IIFE; reads/writes state through `window.paperReadingApp`
- `styles.css` — all styles

**Backend** (`app_server.py`):
- Pure-stdlib Python HTTP server (`ThreadingHTTPServer`), no framework
- SQLite (`app_state.db`) stores: users, sessions, user_state (books/quotes/notes as JSON blob), model_logs, agent_traces, agent_actions, agent_trace_events, agent_metrics
- Images stored under `uploads/<user-id>/`
- API keys read from environment: `DEEPSEEK_API_KEY` (chat + OCR fallback) and `MOONSHOT_API_KEY` (vision OCR via Kimi)

**Agent pipeline** (all in `app_server.py`):
1. `AgentRequestValidator` — validates/sanitizes user input
2. `PromptBuilder` — builds system prompt with book context
3. `call_deepseek()` — LLM call to DeepSeek API
4. `ResponseParser` — parses structured reply (JSON actions + text reply) from raw output
5. `ActionValidator` — validates parsed actions against `ACTION_SCHEMAS`
6. `ActionStateMachine` — state machine for action lifecycle: GENERATED → PENDING_APPROVAL → APPROVED/REJECTED → EXECUTED/FAILED
7. `ActionExecutor` — executes approved actions by mutating user state in SQLite
8. `TraceManager` + `MetricsCollector` — observability; all traces/metrics stored in SQLite

Allowed agent actions: `add_note`, `add_book`, `summary`, `question`, `tag`.

**WeChat mini-program** (`wechat-miniprogram/`) — separate client; currently co-located but independently developed.

## Running the App

```bash
# Start backend — serves both API and static frontend files
DEEPSEEK_API_KEY=sk-... MOONSHOT_API_KEY=sk-... python3 app_server.py
```

Frontend + Backend: `http://127.0.0.1:8787` (desktop) or `http://<LAN-IP>:8787` (iPhone).  
Static files (`index.html`, `app.js`, `chat.js`, `styles.css`) are served by the backend directly — no separate frontend server needed.

Debug logs UI: `http://127.0.0.1:8787/debug/logs`

## Tests

**Python tests** — always use the project venv interpreter (`.venv/bin/python`), NOT a bare `python3`. The venv has both `pytest` and `mcp`; a global/anaconda `python3` typically lacks `mcp`, so `import mcp` in `reading_mcp_server.py` (and its tests) will fail with `ModuleNotFoundError`. Tests use a temp dir for the DB and never touch `app_state.db`.
```bash
# Run all Python tests
.venv/bin/python -m pytest tests/ -v

# Run a single Python test file
.venv/bin/python -m unittest tests.agent.agent_backend_property_test -v

# If pytest is ever missing from the venv:
.venv/bin/python -m pip install pytest
# stdlib fallback (no pytest needed):
.venv/bin/python -m unittest discover -s tests -p "*_test.py"

# Run golden-set evaluation (requires live API keys)
.venv/bin/python tests/agent/agent_golden_set_eval.py
```

**JS tests** (Node built-in test runner, no install needed):
```bash
# Run a single JS test file
node --test tests/frontend/chat-agent-approval.test.js
node --test tests/frontend/global-search.test.js
node --test tests/frontend/ui-redesign.test.js
```

Python tests use a temp directory for the DB — they never touch `app_state.db`. JS tests load `chat.js` or `app.js` into a vm sandbox with DOM stubs.

## Git Hooks

Hooks live in `.githooks/` but git only runs them if `core.hooksPath` points there — and that is per-clone local config, not carried by the repo. **Run this once per clone/worktree, or the hooks are silently dead:**

```bash
git config core.hooksPath .githooks
```

`pre-push` enforces two gates: it blocks pushes to `main` (which is only the prod deploy pointer — day-to-day work goes to `feature/agent`), and it runs the CI test suite. Releasing to prod means declaring intent: `ALLOW_MAIN_PUSH=1 git push origin feature/agent:main`. Emergency bypass for the whole hook is `git push --no-verify`.

## Key Conventions

- **State shape** is enforced by `sanitize_state()` in `app_server.py`: `{books, sessions, quotes, chatHistories, chatContexts, connections}`. Any save/load goes through this sanitizer. `stateContentCount()` (in `app.js`) sums `books` / `quotes` / `sessions` / `connections` (array lengths) **plus** `chatHistories` (object key count, added in OPT-068); it is used only by the import zero-content footgun guard. The import-*result* dialog (`showImportResult()`) separately renders a hardcoded 4-row summary of `books` / `quotes` / `sessions` / `connections`.
- **Auth** uses the `Authorization: Bearer <token>` header (token stored in `localStorage` under key `paper-reading-auth-token-v1`). The frontend sets it in `apiFetch()` (`app.js`); the backend reads it in `Handler._get_token()` and resolves the user via `resolve_user_from_token()`. No other header is accepted.
- **Cross-module events**: `app.js` fires `paper-reading-data-changed` and `paper-reading-user-changed` custom events on `window`; `chat.js` listens to these to stay in sync without direct coupling.
- **Agent action approval flow**: the chat UI shows a confirm button before executing any agent action. The JS in `chat.js` calls `POST /api/agent/actions/:id/approve` then `POST /api/agent/actions/:id/execute`.
- **No frontend build tooling** — all JS is plain ES2020, loaded via `<script>` tags. Do not introduce bundlers or TypeScript.
