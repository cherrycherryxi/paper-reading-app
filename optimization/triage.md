# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-05

## Next up

**OPT-023 已合并（PR #24）。** P0/S 安全项已清空。剩余可动：OPT-022（登录/注册端点无限速，P1/M，安全基线）、OPT-024（ActionExecutor datetime 排序 bug，与 OPT-014 同类）、OPT-025（agent_trace_events 缺 trace_id 索引，与 OPT-017 同类）。新增 owner UI 项 OPT-026/027（书单卡 ··· 可见性 + 三页操作入口不统一），需 owner 定方向后做。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-023 | /media/ CORS 通配符移除 | P0 | S | done | Merged PR #24. `app_server.py:3509` 删 1 行 + `media_cors_test.py` 5 例守卫。范围限定：/media 仍无鉴权，深度加固另立项。 |
| OPT-022 | 登录/注册端点无限速 | P1 | M | triaged | 复用 `check_and_record_rate_limit`（`app_server.py:1462`）以 username/IP 为 key；需 IP 提取 + 失败计数维度，3 端点（line 3889/3939/4015）。安全基线。 |
| OPT-016 | 非 AI 摘抄 OCR 快路径 | P1 | L | in-progress | 代码已完成（云 OCR 百度 accurate_basic + Tesseract 回落，21 测试全绿）。阻塞：owner 待配置百度 API key 并真机端到端验证。Agent2 无法推进。 |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | 入口目前仅在「我的」抽屉（`index.html:306`）。在书单页 `#openBookDialogBtn` 旁加二级「批量导入」链接；复用现有 `importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-020 | PromptBuilder 注入无关 existing_connections | P1 | S | done | Merged PR #22. `[] if book_id else user_state.get("connections", [])[:20]`，246 Python + 102 JS 全绿。 |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done | Merged PR #21. ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`，WCAG AA 对比度审计通过。Option C（手动开关）deferred。 |
| OPT-019 | Toast 缺少 aria-live（WCAG 4.1.3 AA） | P1 | S | done | Merged PR #23. `<div id="toast" role="status" aria-atomic="true">`。 |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion（WCAG 2.2.2 Level A） | P1 | S | done | Merged PR #23. `@media (prefers-reduced-motion: reduce)` 全局守护，Touch: `styles.css`. |
| OPT-013 | 按钮缺少 :focus-visible 样式（WCAG 2.4.7 AA） | P1 | S | done | Merged PR #23. `button:focus-visible` CSS 规则，Touch: `styles.css`. |
| OPT-017 | model_logs/agent_traces 缺少 user_id 索引 | P1 | S | done | Merged PR #19. 4× `CREATE INDEX IF NOT EXISTS` in `init_db()`. |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done | Merged PR #18. 3-attempt retry on 429/500/502/503 + URLError，参照 `call_kimi_vision`。 |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done | Merged PR #20. `_send_security_headers()` → X-Frame-Options/X-Content-Type-Options/Referrer-Policy。CORS `*` 与 CSP 暂留。 |
| OPT-002 | 「书单」加书支持拍照 OCR | P1 | M | done | Merged PR #17. `/api/books/ocr` endpoint + camera input in bookDialog。 |
| OPT-015 | 摘抄卡面 UI 优化 | P2 | M | done | Merged PR #16. 摘抄文字加强样式。 |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done | commit e9bdba9. 后端 `utc_now_iso()`，前端排序改 `Date.parse` epoch diff。 |
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
