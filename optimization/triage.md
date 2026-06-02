# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-02

## Next up

**OPT-010 — GC functions 从未调用**

P1/S. Four GC helpers — `gc_expired_sessions` (line 1267), `gc_expired_password_reset_tokens` (1733), `gc_old_server_errors` (1743), `gc_old_rate_limit_rows` (1751) — are fully implemented with unit tests but never invoked: `main()` (line 4982) only calls `init_db()` and `serve_forever()`. `rate_limit_counters` alone accumulates ~2 rows/user/day indefinitely, which degrades `check_and_record_rate_limit()` over time due to `BEGIN IMMEDIATE` lock contention on every request. Fix: add a `_run_gc()` function that calls all four helpers with a fresh `db_conn()`, then launch it from `main()` as a `daemon=True` thread with a 6-hour loop. Zero schema changes, zero logic changes — the GC functions and their tests already exist.

Key files: `app_server.py:4982-4989` (main, add thread launch), `app_server.py:1267,1733,1743,1751` (the four GC functions to call).

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-010 | GC functions 从未调用 | P1 | S | in-progress (PR #13) | `gc_expired_sessions`(1267), `gc_expired_password_reset_tokens`(1733), `gc_old_server_errors`(1743), `gc_old_rate_limit_rows`(1751) all have tests but `main()`(4982) never calls them. DB grows without bound. Fix: `_run_gc()` + `daemon=True` thread every 6 h in `main()`. Touch: app_server.py:4982-4989 + new helper. |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | triaged | Static HTML path (3264-3269) sends no `X-Frame-Options`, `X-Content-Type-Options`, or `Content-Security-Policy`. API returns `Access-Control-Allow-Origin: *` unconditionally (lines 3149, 3160, 3171 etc.). Clickjacking risk for a commercial app with payment flows. Fix: `_send_security_headers()` helper in static HTML path. Touch: app_server.py:3264-3269 + new helper. |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | triaged | `call_deepseek`(2951) raises immediately on any `HTTPError`/`URLError`; affects OCR DeepSeek fallback(1821), history compression(1826), stream fallback(4101). `call_kimi_vision`(3042) already has a 2-attempt loop — same pattern reusable. Fix: add `retries=2` param, sleep(1) and retry on 429/500/502/503. Touch: app_server.py:2951-2979. |
| OPT-013 | 按钮缺少 :focus-visible 样式 | P1 | S | triaged | `styles.css` has `input:focus` at line 533 but zero `:focus-visible` rules for buttons (`.circle-action`, `.icon-btn`, `.tag-chip-pick`, `.filter-chip`, `.me-list-btn`, etc.). WCAG 2.1 SC 2.4.7 violation. Fix: 3-line CSS rule after line 533. Touch: styles.css:533-540. |
| OPT-002 | 「书单」加书支持拍照 OCR 识别 | P1 | M | triaged | No `/api/books/ocr` endpoint yet; `call_kimi_vision`/`call_deepseek` reusable. Need new endpoint returning `{title, author, tags[]}` + camera input in `bookDialog`. Touch: app_server.py, index.html, app.js. |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | Import only in meDrawer (index.html:303-306). Add secondary "批量导入" link near `#openBookDialogBtn`; existing `importExcelInput` handler reusable. Touch: index.html only. |
| OPT-015 | 摘抄卡面内容难以分辨 UI 优化 | P2 | M | triaged | Requires `openwolf designqc` screenshot + targeted CSS fixes. Touch: styles.css (quote card selectors). |
| OPT-016 | 非 AI 摘抄 OCR 快路径 | P1 | L | in-progress | Code complete on feature/agent: cloud OCR (Baidu accurate_basic) + Tesseract fallback, 21 tests pass. Pending owner action: Baidu API key setup. Touch: app_server.py (done). |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done | Implemented in commit e9bdba9. Backend: `utc_now_iso()` used for OCR quote `createdAt` (lines 4222, 4224). Frontend: sort changed to `Date.parse` epoch diff (app.js:1227). |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done | Merged in PR #12 (commit 209a062). `MAX_REQUEST_BYTES = 20 * 1024 * 1024` (line 136); 413 guard in `_read_json()` (3178-3179) and Stripe body read (3957-3958). |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done | Merged in PR #11 (commit eca96f9). `json.loads(row["dimensions"])` wrapped in `try/except json.JSONDecodeError`; corrupt rows degrade to `dimensions={}`. |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Merged in PR #9 (2026-05-30). Aggregate stat cards + per-row token badge on /debug/logs. |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Merged in PR #10 (2026-05-31). `_detect_image_type()` magic-byte helper replaces `imghdr.what()`. |
| OPT-004 | 桌面端基础适配 | P2 | L | done | Commit b5bebb1. Sidebar nav + chat master-detail desktop layout. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done | Commit 8874de3. Responsive phone tiers, pointer-gated layout, iOS-12 notice. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
