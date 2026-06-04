# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-04

## Next up

**OPT-020 — PromptBuilder 注入无关的 existing_connections**

P1/S. `PromptBuilder.build_chat_prompt()` (app_server.py:2241) 在书/摘抄上下文里仍注入 `connections[:20]`，而系统指令明确禁止该上下文用 link_thought —— 80%+ 请求里这批数据注入后又被禁用。1 行条件判断（`[] if book_id else …`）即可省 ~150 tok/请求，零行为变更。其余可动 P1/S：OPT-018（reduced-motion）、OPT-013（focus-visible）、OPT-019（toast aria-live）。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done | Merged PR #18. 3-attempt retry on 429/500/502/503 + bare/URLError timeout, mirrors `call_kimi_vision`. Touch: app_server.py:3076-3120. |
| OPT-017 | model_logs/agent_traces 缺少 user_id 索引 | P1 | S | done | Merged PR #19. 4× `CREATE INDEX IF NOT EXISTS` in init_db executescript: model_logs(user_id,created_at), agent_metrics(user_id), agent_actions(trace_id), agent_traces(user_id,created_at). +4 tests (incl. EXPLAIN QUERY PLAN). |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done | Merged PR #20. `_send_security_headers()` → X-Frame-Options/X-Content-Type-Options/Referrer-Policy on HTML + static. **Scope-limited**: CORS `*` & CSP left untouched (auth is Bearer not Cookie; CSP breaks inline config). +4 tests. |
| OPT-021 | 暗色模式（系统跟随）E21 提拔 | P1 | M | done | Merged PR #21. ~30 hardcoded colors → semantic vars (light byte-identical) + `@media (prefers-color-scheme: dark)`. WCAG AA audited. Option C (manual toggle) deferred; no true dark screenshot captured. |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion | P1 | S | new | `styles.css` has 8+ `transition` rules and an infinite `@keyframes chat-dot-pulse` (line 1885) with zero `prefers-reduced-motion` guards. WCAG 2.1 SC 2.2.2 Level A violation. Fix: 4-line `@media (prefers-reduced-motion: reduce)` block near top of styles.css. Touch: styles.css:350-360. |
| OPT-013 | 按钮缺少 :focus-visible 样式 | P1 | S | triaged | `styles.css` has `input:focus` at line 532 but zero `:focus-visible` rules for buttons (`.circle-action`, `.icon-btn`, `.tag-chip-pick`, `.filter-chip`, `.me-list-btn`, etc.). WCAG 2.1 SC 2.4.7 Level AA violation. Fix: 3-line CSS rule after line 534. Touch: styles.css:532-540. |
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
