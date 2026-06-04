# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-04

## Next up

**OPT-020 — PromptBuilder 注入无关的 existing_connections**

P1/S. `PromptBuilder.build_chat_prompt()` (`app_server.py:2258`) 在书/摘抄上下文里仍无条件注入 `user_state["connections"][:20]`（已确认：当前代码未加条件判断），而系统指令明确禁止该上下文使用 `link_thought`——80%+ 请求里这批数据注入后又被禁用。1 行条件判断（`[] if book_id else user_state.get("connections", [])[:20]`）即可省 ~150 tok/请求，Plus 用户每日 240 次请求节省 36,000 token，零行为变更，零测试变更。Touch: `app_server.py:2258`。

备选等规模 P1/S 项（若 Agent2 想打包）：OPT-019（toast aria-live，1 个 HTML 属性，WCAG AA）、OPT-018（prefers-reduced-motion，4 行 CSS，WCAG Level A）、OPT-013（focus-visible 按钮，3 行 CSS，WCAG AA）。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-020 | PromptBuilder 注入无关 existing_connections | P1 | S | in-progress | PR #22. 1 行条件判断已实现，246 Python + 102 JS 全绿。Touch: `app_server.py:2258`。 |
| OPT-019 | Toast 缺少 aria-live（WCAG 4.1.3 AA） | P1 | S | triaged | `index.html:620` `<div id="toast">` 无 `role="status"` 或 `aria-live`（已确认）。1 个 HTML 属性，零 JS/CSS 变更，零风险。Touch: `index.html:620`。 |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion（WCAG 2.2.2 Level A） | P1 | S | triaged | `styles.css` 全文 `prefers-reduced-motion` 出现 0 次（已确认）；`chat-dot-pulse` 无限循环动画（line 1992）是 Level A 违规（高于 AA）。4 行 `@media` 块，Touch: `styles.css:350-360`。 |
| OPT-013 | 按钮缺少 :focus-visible 样式（WCAG 2.4.7 AA） | P1 | S | triaged | `styles.css` `:focus-visible` 出现 0 次（已确认）。3 行 CSS 规则修复所有 30+ 按钮选择器。Touch: `styles.css:532-540`。 |
| OPT-016 | 非 AI 摘抄 OCR 快路径 | P1 | L | in-progress | 代码完成（云 OCR 百度 accurate_basic + Tesseract 回落，21 测试全绿）。阻塞：owner 待配置百度 API key 并真机端到端验证。Touch: `app_server.py`（已完成）。 |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | 入口目前仅在「我的」抽屉（`index.html:306`）。在书单页 `#openBookDialogBtn` 旁加二级「批量导入」链接；复用现有 `importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done | Merged PR #21. ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`，WCAG AA 对比度审计通过。Option C（手动开关）deferred。 |
| OPT-017 | model_logs/agent_traces 缺少 user_id 索引 | P1 | S | done | Merged PR #19. 4× `CREATE INDEX IF NOT EXISTS` in `init_db()`. |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done | Merged PR #18. 3-attempt retry on 429/500/502/503 + URLError，参照 `call_kimi_vision`。 |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done | Merged PR #20. `_send_security_headers()` → X-Frame-Options/X-Content-Type-Options/Referrer-Policy。CORS `*` 与 CSP 暂留。 |
| OPT-002 | 「书单」加书支持拍照 OCR | P1 | M | done | Merged PR #17. `/api/books/ocr` endpoint + camera input in bookDialog。 |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done | commit e9bdba9. 后端 `utc_now_iso()`，前端排序改 `Date.parse` epoch diff。 |
| OPT-015 | 摘抄卡面 UI 优化 | P2 | M | done | Merged PR #16. 摘抄文字加强样式。 |
| OPT-010 | GC 函数从未调用 | P1 | S | done | Merged PR #13. `_run_gc()` daemon thread 每 6 h 执行。 |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done | Merged PR #12. `MAX_REQUEST_BYTES = 20 MB`，413 guard。 |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done | Merged PR #11. `json.JSONDecodeError` catch，坏行跳过。 |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Merged PR #10. magic-byte `_detect_image_type()` 替代。 |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Merged PR #9. aggregate stat cards + per-row token badge。 |
| OPT-004 | 桌面端基础适配 | P2 | L | done | commit b5bebb1. Sidebar nav + master-detail desktop layout。 |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done | commit 8874de3. Responsive phone tiers + iOS-12 notice。 |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
