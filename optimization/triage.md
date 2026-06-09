# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-09

## Next up

**OPT-034 — debug 看板存储型 XSS（P1 / S）**

`/debug/logs` 的 HTML 构建块（`app_server.py:3848-3885`）通过 f-string 直接注入 `row['prompt']`、`row['input']`、`row['output']`、`row['username']`、`row['error']`、`action['errorMessage']`、`json.dumps(action['data'])` 等字段，无任何 HTML 转义。`/debug/agent-dashboard`（line 3968）同样注入 `user_row['username']` 未经转义。注册用户发送含 `</pre><script>…</script>` 的消息后，admin 打开 `/debug/logs` 即触发 XSS，可读取所有用户 state 或劫持 admin 会话。

关键事实：`/debug/errors`（line 3924）已有 `from html import escape as _esc` 的正确模式——Agent2 直接复用即可。顶部加 `import html`，将 `/debug/logs` 和 `/debug/agent-dashboard` 的全部用户可控插值点替换为 `html.escape(str(…))`，约 10 处替换，无逻辑变更。可选加一条回归断言：插入含 `<script>` 的消息后 debug HTML 中不出现 `<script>`。

Key files: `app_server.py:3848-3885`（logs 构建块，主战场）、`app_server.py:3965-3982`（agent-dashboard 构建块，username 一处）、`app_server.py:1-15`（顶部 imports，加 `import html`）；可选 `tests/agent/` 下新增回归测试。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-034 | debug 看板存储型 XSS（f-string 直插用户内容） | P1 | S | triaged | `app_server.py:3848-3885`（logs）+ `3965-3982`（dashboard）无 HTML 转义。`/debug/errors` 已有 `from html import escape as _esc` 可复用。~10 处 `html.escape()` 替换，顶部加 `import html`。零逻辑变更。 |
| OPT-033 | `<dialog>` 元素缺少 aria-labelledby（WCAG 4.1.2 Level A） | P1 | S | triaged | `index.html` 12 个 `<dialog>`（lines 327/355/381/416/441/486/509/526/539/550/562/575）均无 `aria-labelledby`。每个已有 `<h2>` 标题，加 `id` + `aria-labelledby` 即可；confirm 类 dialog 用 `aria-label`。24 处 HTML 属性添加，零 JS 变更。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，磁盘持续膨胀 | P2 | S | triaged | `app_server.py:5434`（finally 块末）追加 `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")`。WAL 文件日增数 MB，数周后累积至数十 MB 且永不回收。一行代码，幂等无副作用。+1 测试断言。 |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | 入口仅在「我的」抽屉（`index.html:303-306`）。在书单页 `#openBookDialogBtn` 旁（`index.html:78-82`）加「批量导入」二级入口，复用现有 `#importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-031 | reading_mcp_server _now_iso() naive 本地时间排序 bug | P1 | S | done | Merged PR #32 (2026-06-09). `reading_mcp_server.py:50-51`：`datetime.now().isoformat()` → `datetime.now(timezone.utc).strftime(…Z)`。与 OPT-024 完全同根，影响所有 MCP 路径写入记录的排序。 |
| OPT-030 | 跨设备 state 整体覆盖（乐观锁 Layer B / E35） | P1 | M | done | Merged PR #29 (2026-06-08). `updated_at` 版本号 + `PUT /api/state` 条件保存 + 409 冲突 toast。`app_server.py` + `app.js` + `chat.js`. |
| OPT-029 | execute_action() 非原子读改写 | P1 | M | done | Merged PR #27 (2026-06-08). `BEGIN IMMEDIATE` 包裹读改写周期，序列化并发审批，防止双标签页静默丢弃变更。 |
| OPT-028 | /debug/* 端点默认对所有人开放 | P0 | S | done | Merged PR #26 (2026-06-08). `_authorized_for_admin()` 改为未设 ADMIN_TOKEN 时仅允许 loopback（127.0.0.1）。 |
| OPT-025 | agent_trace_events 缺 trace_id 索引 | P1 | S | done | Merged PR #30 (2026-06-08). `app_server.py:509` 追加 `CREATE INDEX IF NOT EXISTS idx_trace_events_trace`. |
| OPT-022 | 登录/注册端点无限速 | P1 | M | done | Merged PR #28 (2026-06-08). IP 维度限速，`login`/`register`/`password/reset-request` 三端点。 |
| OPT-027 | 卡片操作入口三页不统一 | P2 | M | done | Merged PR #31 (2026-06-08). 三卡统一 `⋯` 菜单、新建 sessionDetailDialog、统一 `dialog-actions-stack` 层级。117 JS 测试绿。 |
| OPT-026 | 书单卡片 ··· 按钮可见性 | P2 | S | done | 2026-06-08 随 OPT-027 / PR #31 解决。`.card-menu-btn` → 半透明圆底+边框+阴影+`:focus-visible`，glyph `···`→`⋯`。 |
| OPT-024 | ActionExecutor datetime 排序 bug | P1 | S | done | Merged PR #25 (2026-06-07). 7× `datetime.now().isoformat()` → `utc_now_iso()` in `app_server.py:2971-3074`. |
| OPT-023 | /media/ CORS 通配符移除 | P0 | S | done | Merged PR #24. `app_server.py:3509` 删 1 行 + `media_cors_test.py` 5 例守卫。 |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done | Merged PR #21. ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`. |
| OPT-020 | PromptBuilder 注入无关 existing_connections | P1 | S | done | Merged PR #22. `[] if book_id else …[:20]`. |
| OPT-019 | Toast 缺少 aria-live（WCAG 4.1.3 AA） | P1 | S | done | Merged PR #23. |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion（WCAG 2.2.2 A） | P1 | S | done | Merged PR #23. |
| OPT-017 | model_logs/agent_traces 缺 user_id 索引 | P1 | S | done | Merged PR #19. |
| OPT-016 | 非 AI 摘抄 OCR 快路径（百度云 OCR） | P1 | L | done | 2026-06-08 owner 配置百度 key + 真机端到端验证通过，三层回退就位。21 测试全绿。 |
| OPT-015 | 摘抄卡面 UI 优化 | P2 | M | done | Merged PR #16. |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done | commit e9bdba9. |
| OPT-013 | 按钮缺 :focus-visible（WCAG 2.4.7 AA） | P1 | S | done | Merged PR #23. |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done | Merged PR #18. |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done | Merged PR #20. |
| OPT-010 | GC 函数从未调用 | P1 | S | done | Merged PR #13. |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done | Merged PR #12. |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done | Merged PR #11. |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Merged PR #10. |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Merged PR #9. |
| OPT-004 | 桌面端基础适配 | P2 | L | done | commit b5bebb1. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done | commit 8874de3. |
| OPT-002 | 「书单」加书支持拍照 OCR | P1 | M | done | Merged PR #17. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
