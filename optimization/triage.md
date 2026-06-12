# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-11

## Next up

**OPT-043 — 导入前显示 N→M 对比 + 任一类减少时强确认（P1 / S）**

Owner 在 2026-06-11 真机操作中导入了一份旧备份（6/8），把 6/8 之后新增的 3 张摘抄卡整体覆盖丢失，事后靠 SQLite 取证才恢复（bug-274）。OPT-040 的清空护栏只拦"导入内容为 0"的极端情况，不拦"导入旧备份导致数量减少"这一最常见事故场景。修复完全在前端，复用 `stateContentCount`（已有）/ `showConfirmDialog`（已有）/ `resolveImportedState`（已有），约 20–30 行新增代码。

在 `importData()` 的 `applyImport` 调用前，计算当前 vs 待导入各类别数量（books/quotes/sessions/connections）；当任一类 M<N 时，弹 `showConfirmDialog`，措辞强调"将丢失 X 条，确定覆盖？"，取消则中止，继续才执行覆盖。

Key files: `app.js:3028-3065`（`importData` 函数 + diff 计算 helper）；`tests/frontend/account-import-format.test.js`（加断言：M<N 时弹确认、取消不覆盖）。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-043 | 导入前 N→M 对比 + 减少时高危确认 | P1 | S | in-progress (PR #39) | `app.js:3028-3065`（importData）应用前先计 current vs resolved 各类数量；任一类 M<N 时 `showConfirmDialog` 展示"将丢失 X 条，确定覆盖？"。复用 `stateContentCount`/`showConfirmDialog`，纯前端零后端改动。关联 OPT-040/041。 |
| OPT-037 | compareBooksForList() localeCompare → Date.parse | P1 | S | triaged | `app.js:1060`（compareBooksForList 二级排序）+ `app.js:2465`（书内摘抄排序）：`(b.createdAt\|\|"").localeCompare(...)` → `(Date.parse(b.createdAt)\|\|0) - (Date.parse(a.createdAt)\|\|0)`（降序 b-a）。书单首屏，排序错误直接可见；OPT-014 遗漏点。可选同修 `app.js:2452`（最近活跃书查找）。 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | `app_server.py:676`（ensure_user_state INSERT）、`app_server.py:4071, 4075`（register handler 4 处 now_iso）→ `utc_now_iso()`。污染 OPT-030 乐观锁版本字段（stateVersion 首条为 naive），是 OPT-014 UTC 系列最后一块。5 处替换，零逻辑变更。 |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P2 | S | triaged | `app_server.py:2677, 2696, 2703`（create_trace / log_event / update_trace）仍用 naive 本地时间。3 处替换，与 OPT-014/024/031 UTC 策略对齐。零逻辑变更，零测试变更。 |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P2 | S | triaged | `app_server.py:2872` `WHERE user_id = ?` 追加 `AND created_at > datetime('now', '-90 days')`。封顶扫描行数，防止 /debug/logs 随运行时间线性变慢。1 行 SQL，可选更新 debug 标签。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P2 | S | triaged | `app_server.py:5461`（_run_gc finally 块）：`conn.close()` 前加 `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")`。WAL 文件数周后累积数十 MB 且永不回收；1 行代码，幂等无副作用。+1 测试断言 in `gc_thread_test.py`。 |
| OPT-001 | Excel 批量加书入口挪至书单页 | P2 | S | triaged | 入口仅在「我的」抽屉（`index.html:301-306`）。在书单页 `#openBookDialogBtn` 旁（`index.html:78-82`）加「批量导入」二级入口，复用现有 `#importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-042 | 快速 OCR 孤儿 pending 卡 | P1 | S | done (PR #38, 2026-06-11) | Fix A：同步 OCR 路径仅在完成后保存一次；Fix B：loadSession 时 `recoverStalePendingOcr()` 把超龄 pending 卡翻成 failed。dev watcher 同步收窄为仅监控 .py（避免前端改动重启后端）。 |
| OPT-041 | 导入成功结果弹窗（带数量） | P1 | S | done (PR #37, 2026-06-11) | 新增 `<dialog id="importResultDialog">` 显示 书/摘抄/记录/关联 各类数量；成功路径调用 `showImportResult(state)` 替代 toast。延续 OPT-033 aria-labelledby 规范。 |
| OPT-040 | GDPR 导出格式自适应 + 清空护栏 | P1 | M | done (PR #36, 2026-06-11) | `importData()` 检测 `exportFormat/.state` 自动解包；内容为 0 且当前账号非空时二次确认。新增 `resolveImportedState`/`stateContentCount` helper。 |
| OPT-039 | 连接泄漏：pre-auth/debug 端点未入 _open_conn 安全网 | P1 | M | done (PR #35, 2026-06-11) | 新增 `_open_conn()` helper 统一登记 `self._active_conn`，7 处裸 `get_conn()` 改走它，复用已验证的 `finally` 兜底。3 条新增连接泄漏测试（注入中途异常）。 |
| OPT-034 | debug 看板存储型 XSS（f-string 直插用户内容） | P1 | S | done (PR #33, 2026-06-10) | `import html` + `html.escape()` 包裹 /debug/logs、/debug/agent-dashboard 所有用户可控插值点，~10 处替换。 |
| OPT-033 | `<dialog>` 元素缺少 aria-labelledby（WCAG 4.1.2 Level A） | P1 | S | done (PR #34, 2026-06-11) | 12 个 dialog 各加 `id` 给 `<h2>` + `aria-labelledby` 给 `<dialog>`；confirm 类 dialog 用 `aria-label`。24 处 HTML 属性，零 JS 变更。 |
| OPT-031 | reading_mcp_server _now_iso() naive 本地时间排序 bug | P1 | S | done (PR #32, 2026-06-09) | `reading_mcp_server.py:50-51`：`datetime.now().isoformat()` → UTC+Z。MCP 路径写入记录的排序修复（与 OPT-024 同根）。 |
| OPT-030 | 跨设备 state 整体覆盖（乐观锁 Layer B） | P1 | M | done (PR #29, 2026-06-08) | `updated_at` 版本号 + `PUT /api/state` 条件保存 + 409 冲突 toast。`app_server.py` + `app.js` + `chat.js`。 |
| OPT-029 | execute_action() 非原子读改写 | P1 | M | done (PR #27, 2026-06-08) | `BEGIN IMMEDIATE` 包裹读改写周期，序列化并发审批，防止双标签页静默丢数据。 |
| OPT-028 | /debug/* 端点默认对所有人开放 | P0 | S | done (PR #26, 2026-06-08) | `_authorized_for_admin()` 未设 ADMIN_TOKEN 时改为仅允许 loopback（127.0.0.1）。 |
| OPT-025 | agent_trace_events 缺 trace_id 索引 | P1 | S | done (PR #30, 2026-06-08) | `app_server.py:509` 追加 `CREATE INDEX IF NOT EXISTS idx_trace_events_trace`。 |
| OPT-022 | 登录/注册端点无限速 | P1 | M | done (PR #28, 2026-06-08) | IP 维度限速，login/register/password/reset-request 三端点。 |
| OPT-027 | 卡片操作入口三页不统一 | P2 | M | done (PR #31, 2026-06-08) | 三卡统一 `⋯` 菜单 + 新建 sessionDetailDialog + 统一 `dialog-actions-stack` 层级。117 JS 测试绿。 |
| OPT-026 | 书单卡片 ··· 按钮可见性 | P2 | S | done (2026-06-08, OPT-027 同批) | `.card-menu-btn` → 半透明圆底+边框+阴影+`:focus-visible`，glyph 换 `⋯`。 |
| OPT-024 | ActionExecutor datetime 排序 bug | P1 | S | done (PR #25, 2026-06-07) | 7× `datetime.now().isoformat()` → `utc_now_iso()` in `app_server.py:2971-3074`。 |
| OPT-023 | /media/ CORS 通配符 | P0 | S | done (PR #24, 2026-06-06) | `app_server.py:3509` 删 1 行 + `media_cors_test.py` 5 例守卫。 |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done (PR #21, 2026-06-04) | ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`。 |
| OPT-020 | PromptBuilder 注入无关 existing_connections | P1 | S | done (PR #22, 2026-06-05) | `[] if book_id else …[:20]`，~150 tokens/req 节省。 |
| OPT-019 | Toast 缺少 aria-live（WCAG 4.1.3 AA） | P1 | S | done (PR #23, 2026-06-05) | `#toast` 加 `role="status" aria-atomic="true"`。 |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion（WCAG 2.2.2 A） | P1 | S | done (PR #23, 2026-06-05) | `@media (prefers-reduced-motion: reduce)` 全局禁用动画。 |
| OPT-017 | model_logs/agent_traces 缺 user_id 索引 | P1 | S | done (PR #19, 2026-06-04) | 三条 `CREATE INDEX IF NOT EXISTS`。 |
| OPT-016 | 非 AI 摘抄 OCR 快路径（百度云 OCR） | P1 | L | done (2026-06-08, owner 真机验证) | 云 OCR → Tesseract → AI 三层回退，21 测试全绿。 |
| OPT-015 | 摘抄卡面 UI 优化 | P2 | M | done (PR #16, 2026-06-03) | 摘抄文字可读性与层次提升。 |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done (commit e9bdba9) | 后端 OCR 卡 `createdAt` 改用 UTC+Z；前端排序改 epoch 数值比较。 |
| OPT-013 | 按钮缺 :focus-visible（WCAG 2.4.7 AA） | P1 | S | done (PR #23, 2026-06-05) | `button:focus-visible` 全局 outline 规则。 |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done (PR #18, 2026-06-04) | 指数退避重试最多 2 次，可重试码 429/500/502/503。 |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done (PR #20, 2026-06-04) | `_send_security_headers()` 发 X-Frame-Options/X-Content-Type-Options/Referrer-Policy。 |
| OPT-010 | GC 函数从未调用 | P1 | S | done (PR #13, 2026-06-03) | `_run_gc()` 守护线程每 6 小时运行四个 GC 方法。 |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done (PR #12, 2026-06-02) | `MAX_REQUEST_BYTES = 20MB` + 413 提前返回。 |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done (PR #11, 2026-06-01) | 损坏行 `continue` 跳过，防止 /debug/* 全量 500。 |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done (PR #10, 2026-05-31) | magic bytes 替换。 |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done (PR #9, 2026-05-30) | per-request token/latency + 汇总面板。 |
| OPT-004 | 桌面端基础适配 | P2 | L | done (commit b5bebb1) | 480px 居中列 + 抽屉右侧 slide-in。 |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done (commit 8874de3) | clamp/vw 响应式 + 三档断点。 |
| OPT-002 | 「书单」加书支持拍照 OCR | P1 | M | done (PR #17, 2026-06-03) | Kimi vision → 结构化字段预填表单。 |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
