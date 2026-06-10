# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-10

## Next up

**OPT-033 — `<dialog>` 元素缺少 `aria-labelledby`（WCAG 2.1 SC 4.1.2 Level A / P1 / S）**

`index.html` 中全部 12 个 `<dialog>` 元素（`bookEditDialog`、`bookDetailDialog`、`bookDialog`、`sessionDialog`、`quoteDialog`、`quoteDetailDialog`、`sessionDetailDialog`、`deleteBookDialog`、`confirmDialog`、`forgotPasswordDialog`、`resetPasswordDialog`、`connectionDialog`）均无 `aria-labelledby`。每个 dialog 已有可见 `<h2>` 标题，只需给 `<h2>` 加 `id`、给 `<dialog>` 加 `aria-labelledby` 即可；无 `<h2>` 的 confirm 类 dialog 改用 `aria-label`。约 24 处 HTML 属性添加，零 JS / CSS 变更，零逻辑风险。这是 OPT-013/018/019 无障碍系列的直接延续，修复 WCAG 最高等级（Level A）合规缺口。

Key files: `index.html:327-620`（12 个 dialog 定义块，主战场）。可选加一条 JS 测试断言：打开每个 dialog 时 `aria-labelledby` 指向的元素存在且非空。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-033 | `<dialog>` 元素缺少 aria-labelledby（WCAG 4.1.2 Level A） | P1 | S | in-progress (PR #34) | `index.html` 12 个 `<dialog>`（lines 327-620）均无 `aria-labelledby`。每个已有 `<h2>` 标题，加 `id` + `aria-labelledby` 即可；confirm 类 dialog 用 `aria-label`。24 处 HTML 属性添加，零 JS 变更。 |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P2 | S | new | `app_server.py:2677, 2696, 2703`（create_trace / log_event / update_trace）仍用 naive 本地时间。3 处替换为 `utc_now_iso()`，与 OPT-014/024/031 完成的项目 UTC 策略对齐。零逻辑变更，零测试变更。 |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天滚动窗口 | P2 | S | new | `app_server.py:2872-2879` 的 `WHERE user_id = ?` 无时间过滤。追加 `AND created_at > datetime('now', '-90 days')`，封顶扫描行数，防止 debug 看板随数据增长线性变慢。1 行 SQL 变更，可选标签更新。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，磁盘持续膨胀 | P2 | S | triaged | `app_server.py:5421-5439`（_run_gc try 块）：在 `conn.close()` 前追加 `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")`。WAL 文件日增数 MB，数周后累积至数十 MB 且永不回收。一行代码，幂等无副作用。+1 测试断言。 |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | 入口仅在「我的」抽屉（`index.html:301-306`）。在书单页 `#openBookDialogBtn` 旁（`index.html:78-82`）加「批量导入」二级入口，复用现有 `#importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-034 | debug 看板存储型 XSS（f-string 直插用户内容） | P1 | S | done (PR #33, 2026-06-10) | `html.escape()` 包裹所有用户可控插值点，顶部加 `import html`，~10 处替换。`/debug/logs`、`/debug/agent-dashboard` 已修复；`/debug/errors` 早已有 `from html import escape as _esc`。 |
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
