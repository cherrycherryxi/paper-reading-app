# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-03

## Next up

**OPT-012 — call_deepseek() 无重试逻辑**

P1/S. `call_deepseek()` (app_server.py:3076) raises immediately on any `HTTPError`/`URLError` — no retry. Affects three production paths: OCR DeepSeek fallback (line ~1821), conversation-history compression (line ~1826), and stream-finish-reason fallback (line ~4101). DeepSeek API has transient 429/500/502/503 responses; all three paths currently surface these errors directly to the user. `call_kimi_vision()` (line ~3042) already has a 2-attempt loop with `time.sleep(1)` retry — the exact same pattern can be transplanted.

Key files: `app_server.py:3076-3104` (add `retries=2` param + retry loop); callers at ~1821, ~1826, ~4101 need no changes.

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | in-progress (PR #18) | `call_deepseek`(3076) raises immediately on `HTTPError`/`URLError`; OCR fallback(~1821), history compression(~1826), stream fallback(~4101) all fail silently to user. `call_kimi_vision`(~3042) has a 2-attempt retry loop — transplant same pattern. Touch: app_server.py:3076-3104. |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion | P1 | S | new | `styles.css` has 8+ `transition` rules and an infinite `@keyframes chat-dot-pulse` (line 1885) with zero `prefers-reduced-motion` guards. WCAG 2.1 SC 2.2.2 Level A violation. Fix: 4-line `@media (prefers-reduced-motion: reduce)` block near top of styles.css. Touch: styles.css:350-360. |
| OPT-017 | model_logs/agent_traces 缺少 user_id 索引 | P1 | S | new | `model_logs`, `agent_traces`, `agent_actions`, `agent_metrics` tables have no secondary indexes (confirmed: init_db executescript at lines 365-432 has none). `list_logs()` does a full-table scan on `model_logs`. Fix: 3× `CREATE INDEX IF NOT EXISTS` in init_db executescript. Touch: app_server.py:365-490 (append after line 432). |
| OPT-013 | 按钮缺少 :focus-visible 样式 | P1 | S | triaged | `styles.css` has `input:focus` at line 532 but zero `:focus-visible` rules for buttons (`.circle-action`, `.icon-btn`, `.tag-chip-pick`, `.filter-chip`, `.me-list-btn`, etc.). WCAG 2.1 SC 2.4.7 Level AA violation. Fix: 3-line CSS rule after line 534. Touch: styles.css:532-540. |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | triaged | Static HTML path (3416-3425) sends no `X-Frame-Options`, `X-Content-Type-Options`, or `Content-Security-Policy`. API returns `Access-Control-Allow-Origin: *` unconditionally (lines 3285, 3307, 3318, 3386, 3466, 3619, 4586). Clickjacking risk for commercial app with payment flows. Fix: `_send_security_headers()` helper called from static HTML path. Touch: app_server.py:3416-3425 + new helper. |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | Import only in meDrawer (index.html:306). Add secondary "批量导入" link near `#openBookDialogBtn`(line 78); existing `importExcelInput` handler reusable. Touch: index.html only. |
| OPT-016 | 非 AI 摘抄 OCR 快路径 | P1 | L | in-progress | Code complete on feature/agent: cloud OCR (Baidu accurate_basic) + Tesseract fallback, 21 tests pass. Pending owner action: Baidu API key setup + real-device validation. Touch: app_server.py (done). |
| OPT-010 | GC functions 从未调用 | P1 | S | done | Merged PR #13 (commit d945df8). `_run_gc()` + `daemon=True` thread every 6 h wired into `main()`. |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done | Implemented in commit e9bdba9. Backend: `utc_now_iso()` for OCR quote `createdAt`. Frontend: sort changed to `Date.parse` epoch diff (app.js:1227). |
| OPT-015 | 摘抄卡面内容难以分辨 UI 优化 | P2 | M | done | Merged PR #16 (commit 33a6d26). Excerpt text emphasis CSS in quote cards. |
| OPT-002 | 「书单」加书支持拍照 OCR 识别 | P1 | M | done | Merged PR #17 (commit e90d824). `/api/books/ocr` endpoint + camera input in bookDialog using call_kimi_vision/call_deepseek. |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done | Merged PR #12 (commit 209a062). `MAX_REQUEST_BYTES = 20 * 1024 * 1024` (line 136); 413 guard in `_read_json()` and Stripe body read. |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done | Merged PR #11 (commit eca96f9). `json.loads(row["dimensions"])` wrapped in `try/except json.JSONDecodeError`; corrupt rows degrade to `dimensions={}`. |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Merged PR #10. `_detect_image_type()` magic-byte helper replaces `imghdr.what()`. |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Merged PR #9 (2026-05-30). Aggregate stat cards + per-row token badge on /debug/logs. |
| OPT-004 | 桌面端基础适配 | P2 | L | done | Commit b5bebb1. Sidebar nav + chat master-detail desktop layout. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done | Commit 8874de3. Responsive phone tiers, pointer-gated layout, iOS-12 notice. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
