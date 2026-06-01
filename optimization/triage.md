# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-01

## Next up

**OPT-009 — _read_json() 无请求体大小上限**

P0/S. `_read_json()` at `app_server.py:2928` calls `self.rfile.read(length)` with `length` taken directly from the `Content-Length` header — no upper bound. All POST endpoints are affected, including `/api/upload-image` and `/api/quotes/ocr` which accept base64 image data. A single request with `Content-Length: 2000000000` causes the process to attempt a 2 GB read, blocking every other thread until it OOMs or times out. The Stripe webhook body read at line 3704 has the same flaw. Fix is three lines: define `MAX_REQUEST_BYTES = 20 * 1024 * 1024` at module level, return 413 in `_read_json()` before the read if exceeded, apply the same cap to the Stripe path.

Key files: `app_server.py:2926-2929` (`_read_json`), `app_server.py:3704` (Stripe raw body read).

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | in-progress (PR #12) | `_read_json()` at line 2928 and Stripe body read at line 3704 call `rfile.read(length)` with no cap. Malicious `Content-Length` header can OOM the process and hang all threads. Fix: `MAX_REQUEST_BYTES = 20 * 1024 * 1024`, return 413 before read. Touch: app_server.py:2926-2929, 3704. |
| OPT-010 | GC functions 从未调用 | P1 | S | triaged | `gc_expired_sessions` (line 1019), `gc_expired_password_reset_tokens` (1485), `gc_old_server_errors` (1495), `gc_old_rate_limit_rows` (1503) all exist with unit tests but `main()` (line 4647) never calls them. `rate_limit_counters` accumulates ~2 rows/user/day indefinitely. Fix: add `_run_gc()` calling all four with a fresh `db_conn()`, schedule via `threading.Thread(daemon=True)` every 6 hours in `main()`. Touch: app_server.py:4647-4654 + new function. |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | triaged | Static HTML responses (lines 3011-3018) send no `X-Frame-Options`, `X-Content-Type-Options`, or `Content-Security-Policy`. JSON API sends `Access-Control-Allow-Origin: *` unconditionally (lines 2899, 2910, 2921, 2981). Clickjacking risk for a commercial app with payment flows. Fix: add `_send_security_headers()` helper called from the static HTML response path. Touch: app_server.py:3011-3018 + new helper. |
| OPT-002 | 「书单」加书支持拍照 OCR 识别 | P1 | M | triaged | Existing OCR pipeline (`call_kimi_vision`/`call_deepseek`) reusable for books; no book OCR endpoint yet. Need new `POST /api/books/ocr` returning `{title, author, tags[]}` + frontend camera input in `bookDialog`. Touch: app_server.py, index.html, app.js. |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | Import entry only in meDrawer (`index.html:277`). Books panel header (`index.html:47-68`) has no import shortcut. Add "批量导入" secondary link near `#openBookDialogBtn`; existing `importExcelInput` handler in app.js reusable. Touch: index.html only. |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done | Merged in PR #11 (commit eca96f9, 2026-06-01). `json.loads(row["dimensions"])` now wrapped in `try/except json.JSONDecodeError`; corrupt rows degrade to `dimensions={}` and are logged via `log_server_error`. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done | Implemented in commit 8874de3. Responsive phone tiers, pointer-gated layout, iOS-12 notice. |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Implemented in PR #9 (merged 2026-05-30). Aggregate header (5 stat cards) + per-row token badge on /debug/logs. |
| OPT-004 | 桌面端基础适配 | P2 | L | done | Implemented in commit b5bebb1. Sidebar nav + chat master-detail desktop layout. |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Implemented in PR #10 (merged 2026-05-31). Replaced `imghdr.what()` with `_detect_image_type()` magic-byte helper. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
