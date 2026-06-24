# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-24

## Next up

**OPT-062 — 确认对话框 Escape 关闭后监听器残留，可触发错误删除（P1/S）**

理由：（1）**预算复位** — 今日 7 天窗口（2026-06-17→2026-06-24）内仅 3 个 `auto/` PR（#46 opt-055/2026-06-17、#47 opt-054/2026-06-18、#48 opt-052/2026-06-19），#45 创建于 2026-06-16 已滑出窗口；预算余 1 槽。（2）**roadmap §2 短期节明确点名** — "预算复位后夜间轨首推 OPT-062"，PRs #45–#48 均已合并即为复位触发条件。（3）**数据安全类** — Escape 关闭确认弹窗后，下次「确认」同时触发旧闭包（含前次 `onConfirm` 操作），可错误删除 Book/Session/Quote/Account/连接，不可恢复；与 OPT-040/041/043 同属「数据安全边界」。

关键文件：`app.js:2286-2297`（`showConfirmDialog` — 追加 `els.confirmDialog.addEventListener("cancel", cleanup, { once: true })`）；`app.js:2070-2127`（`deleteBook` — 追加 `els.deleteBookDialog.addEventListener("cancel", cleanup, { once: true })`）。共 ~4 行改动。可顺带修 OPT-063（roadmap §2 建议同 PR 合并，4 行代码移位）。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-062 | 确认对话框 Escape 关闭后监听器残留，可触发错误删除 | P1 | S | triaged | northstar「中」，Theme 1「零丢失」验收直接威胁；data safety 类。`showConfirmDialog`（`app.js:2286-2297`）缺 `cancel` 事件清理，6+ 删除路径受影响；`deleteBook` 弹窗（`app.js:2120`）另有独立缺口；各追加 1 行 `addEventListener("cancel", cleanup, { once: true })`。**roadmap §2 预算复位首选**。 |
| OPT-069 | call_deepseek_stream() 无重试：主聊天路径遇瞬断即报错 | P1 | S | triaged | northstar「强」——主聊天（Theme 2 核心入口）遇 429/502 报错是对用户信任的直接伤害；`call_deepseek()` 已有 3 次重试，streaming 路径零重试，两路径不一致。`app_server.py:3247-3270`：将 `urlopen()` 调用放入 `for attempt in range(DEEPSEEK_MAX_ATTEMPTS):` 循环，镜像 `call_deepseek()` 模式（lines 3192-3220）；`tests/agent/deepseek_retry_test.py` 新增 `DeepseekStreamRetryTest` 类。S 复杂度，零逻辑变更。 |
| OPT-068 | 导入减量守卫未覆盖 chatHistories，旧备份可静默清空聊天记录 | P1 | S | triaged | northstar「中」，Theme 2 核心数据；与 OPT-063 同类（历史记录静默丢失）；填补 import 护栏最后一口。`app.js:3098-3105`（`stateContentCount`）补 `Object.keys(s.chatHistories||{}).length`；`app.js:3166`（`_categoryLabels`）加 `chatHistories:"聊天记录"` + `cur/inc` 用 `Object.keys` 而非 `Array.isArray`；共 4 行，零后端变更。 |
| OPT-063 | compress_chat_history API 失败时写入截断历史，永久丢失旧聊天记录 | P1 | S | triaged | northstar「中」，Theme 2「回顾有价值」前提数据；data safety 类（与 OPT-040/041 同类）。`app_server.py:2279-2292`：`save_state` 移入 `try` 块（压缩成功才持久化），`except` 改直接 `return history`；约 4 行重排，零副作用。可与 OPT-062 同 PR 实现（roadmap §2 建议）。 |
| OPT-064 | PromptBuilder 发送摘抄完整对象含 ocrText，每次对话浪费数百至数万 token | P1 | S | triaged | northstar「中」，OPT-020/047 同类（token 裁剪），`ocrText` 是最大漏网炸弹（每页 500-2000 字符）；`app_server.py:2312-2345`（`build_chat_prompt`）加白名单 dict comprehension 过滤 `ocrText/imageUrl/ocrStatus/ocrSource/ocrError/ocrUpdatedAt/ocrRequestedAt`；零 API/DB 变更，S 复杂度。 |
| OPT-065 | reading_mcp_server._save_state() 跳过 sanitize_state()，MCP 写路径无状态校验 | P1 | S | triaged | northstar「中」，data safety；`app_server.py` 有 `__main__` 守卫，直接 `from app_server import sanitize_state` 无循环 import 风险；`reading_mcp_server.py:70-75`（`_save_state` 函数）调用前加 `state = sanitize_state(state)`。6 个 MCP 工具全部走此路径，S 复杂度。 |
| OPT-058 | 摘抄对话框 showModal() 后未 focus() 文本区，移动端每次多点击一次 | P1 | S | triaged | northstar「中」，Theme 1「采集顺滑」核心路径固定摩擦。`app.js:2248`（openNewQuoteForBook）和 `app.js:2283`（editQuote）各加 `requestAnimationFrame(() => document.getElementById("quoteContent")?.focus())`，共 2 处。无 signal 佐证，但 Theme 1 两周验收期直接触点。预算复位次选（可与 OPT-061 合并一 PR）。 |
| OPT-061 | Session 对话框 showModal() 后无 focus()，移动端须额外点击才能开始输入 | P1 | S | triaged | northstar「中」，Theme 1「采集顺滑」每日触点；OPT-058 的对称补丁。`app.js:2142`（editSession）和 `app.js:2262`（openNewSessionForBook）末尾各追加 `requestAnimationFrame(() => document.querySelector('#sessionDialog [name="startPage"]')?.focus())`。 |
| OPT-059 | Session 日期预填 UTC 日期，UTC+8 凌晨记录日期差一天 | P1 | S | triaged | northstar「中」，Theme 1 数据准确性；影响 roadmap §2「本周使用天数」指标统计。`app.js:2261`：`toISOString().split("T")[0]` → `new Intl.DateTimeFormat("sv").format(new Date())`（sv locale 返回本地时区 YYYY-MM-DD，无 polyfill）。无 signal 佐证，但 UTC+8 凌晨高频场景。 |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P1 | S | triaged | `index.html:679` 加 `role="tablist"`；6 个 `<button>` 加 `role="tab"` + `aria-selected` + `aria-controls`；6 个 `<section>` 加 `id` + `role="tabpanel"` + `aria-labelledby`；`app.js:1629` 补 1 行 `setAttribute("aria-selected", ...)`。Level A 最严合规，Tab 是 App 主骨架。northstar「中」。 |
| OPT-053 | Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 | P2 | S | triaged | `app.js:1335-1342`：无搜索时全量计算并常驻显示，有搜索时展示过滤子集（现有逻辑）。northstar「中」，roadmap §2 可观测代理指标。3 行改动，无 HTML/CSS/后端变动。 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | `app_server.py:676`（ensure_user_state INSERT）、`app_server.py:4057, 4061`（register handler created_at + terms_accepted_at + user_state INSERT）→ 各换 `utc_now_iso()`。4 处替换，污染 OPT-030 乐观锁版本字段（stateVersion 首条为 naive），OPT-014 UTC 系列最后一块。northstar「中」。 |
| OPT-066 | 编辑 Session 未同步书籍进度字段（currentPage/lastReadAt/updatedAt） | P2 | S | triaged | northstar「中」，Theme 1 数据准确性；编辑 session 的 if(existingId) 分支（`app.js:2029-2037`）只更新 session 本体，未重算 `book.currentPage/lastReadAt/updatedAt`，也不触发 finished 状态判断；对比新建分支（`app.js:2046-2055`）完整同步。约 5 行补全，S 复杂度。无 signal 佐证。 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | northstar「弱→中」，摘抄级聊天历史可靠性；`app.js:274-279`（contextFromHistoryKey）处理 `book:` 但 `quote:` fallthrough 错误解析为 bookId；后端 `app_server.py:617-625` 正确处理。1 行修复，S 复杂度，无 signal 佐证。 |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | `app.js:2316-2332`：syncState() 前加 2 行 `delete state.chatHistories["quote:"+quoteId]; delete state.chatContexts["quote:"+quoteId];`，复用 deleteBook()（`app.js:2088-2101`）模式。northstar「弱」，无 signal 佐证。 |
| OPT-056 | 摘抄搜索不包含「我的理解」reflection 字段 | P2 | S | triaged | `app.js:1411-1416` haystack 数组末尾追加 `item.reflection \|\| ""`；1 行改动，零后端变更，可选追加测试断言。northstar「中」，Theme 2「回顾有价值」直接让 reflection 可检索；当前 Theme 1 期无 signal 佐证，P2 置于 P1 后。 |
| OPT-057 | 「动态」Tab 时间线硬限 10 条，积累后无法看到更多历史 | P2 | S | triaged | `app.js:1332` 底部加「查看更多」按钮，`slice(0, count+10)`，局部变量跟踪当前展示数。northstar「中」，Theme 2；当前 Theme 1 期无 signal 佐证，P2。 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P2 | S | triaged | `app.js:740-756` haystack 对 quote 类型 side 追加 `state.quotes.find()` 的 `.content`，约 6 行改动，零后端变更。northstar「中」，Theme 2；当前 Theme 1 期 P2 末位。 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android，PWA 安装属「为假想未来用户做」；升级到 B 当周再做）。新建 `manifest.json`（根目录）+ `index.html <head>` + `app_server.py` 静态路由条目。 |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（2026-06-16 仪式：定位 A「个人工具」唯一用户为 owner 本人，屏幕阅读器 a11y 对单人无直接价值；留待定位升级到 B/C 再批量重启 a11y 系列）。`index.html:177` 加 `role="log"`。 |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（2026-06-16 仪式：debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献）。`app_server.py:2875` `WHERE user_id = ?` 追加 `AND created_at > datetime('now', '-90 days')`。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做）。`app_server.py:5244` 前追加 `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")`；`gc_thread_test.py` 加 1 条断言。 |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献）。`app_server.py:2676, 2695, 2702`（create_trace / log_event / update_trace）3 处替换，零逻辑变更。 |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，财务表时间戳无用户价值，直至定位升级到 C）。`app_server.py:1876, 1852, 1890, 1915, 1935`。 |
| OPT-047 | PromptBuilder all_books_summary 无数量上限 | P1 | S | done (PR #45 merged 2026-06-24) | `app_server.py:2326-2329`：全量书单无 LIMIT → 按 `updatedAt` 倒序取 `[:50]`；roadmap §2 明确首推，northstar「强」，Theme 1 成本控制。PR #45 已合并。 |
| OPT-055 | 快速 OCR 行级删除 UI | P1 | M | done (PR #46 merged 2026-06-24) | Signal 2026-06-16：owner 真机「整页全文，只想留划线句，得逐行删」。northstar「强」，Theme 1 直接摩擦。`app.js:1548-1566` + `index.html:444-486` + `styles.css`（新 `.ocr-line-selector`）。PR #46 已合并。 |
| OPT-054 | 「↓ 最新」按钮改浮动叠加，不占布局行 | P1 | S | done (PR #47 merged 2026-06-24) | Signal 2026-06-16：owner 真机「最新独占一行，挤压聊天空间」。northstar「中」，Theme 1 辅助。`styles.css:2069-2073`（`.chat-scroll-btn-row` → `position:absolute; bottom:8px; right:8px; z-index:2`）+ `#chatMessages` `position:relative` + 桌面端删 `grid-row:3`。PR #47 已合并。 |
| OPT-052 | 摘抄卡面缺少图片缩略图——拍照 OCR 成卡后无视觉区分度 | P1 | S | done (PR #48 merged 2026-06-24) | northstar「强」，Theme 1；signal 2026-06-16（OCR 全文录入，图片视觉反馈关键）。`app.js:1449-1452`：有 `quote.imageUrl` 时条件渲染 `<img>`，否则保留 fallback；`styles.css` 无需改动（`.entry-card-cover img` 已有）。PR #48 已合并。 |
| OPT-049 | 书详情弹窗 UX 三连修（滚动复位/锁横滑/摘抄·笔记区分） | P1 | S | done (PR #44, 2026-06-14) | signal 2026-06-13 (×3)：owner 真机反馈详情页滚动停中段/可左右滑/「相关摘抄」含笔记不区分。`app.js`（openBookDetailDialog 滚动复位 + 文案）、`styles.css`（overflow-x）、`index.html`（标题）。4 条新测试；163/163 绿。 |
| OPT-045 | Session/Connection CRUD 前端测试覆盖 | P2 | M | done (PR #43, 2026-06-13) | 新增 `tests/frontend/session-crud.test.js` + `tests/frontend/connection-crud.test.js`，17 条测试；159/159 全绿，未改 app.js。 |
| OPT-043 | 导入前 N→M 对比 + 减少时高危确认 | P1 | S | done (PR #39, 2026-06-12) | signal 2026-06-11：owner 误导入旧备份致 3 张卡丢失。`importData()` 应用前先计 current vs resolved 各类数量；任一类 M<N 时弹强确认。11/11 测试绿。 |
| OPT-037 | compareBooksForList() localeCompare → Date.parse | P1 | S | done (PR #42, 2026-06-13) | `app.js:1026`（compareBooksForList 二级排序）+ `app.js:2431`（最近活跃书查找）：`localeCompare` → `Date.parse` 数值比较。142/142 测试绿。OPT-014 遗漏执行点，书单首屏排序修复。 |
| OPT-001 | Excel 批量加书入口挪至书单页 | P1 | S | done (PR #40/#41, 2026-06-12) | signal 2026-06-12：owner 明确「这是我最想做的」。书单页 `#openBookDialogBtn` 旁新增圆形按钮入口（PR #40）+ 引导对话框 + 可下载模板（PR #41）。 |
| OPT-042 | 快速 OCR 孤儿 pending 卡 | P1 | S | done (PR #38, 2026-06-11) | Fix A：同步 OCR 路径仅在完成后保存一次；Fix B：loadSession 时 `recoverStalePendingOcr()` 把超龄 pending 卡翻成 failed。 |
| OPT-041 | 导入成功结果弹窗（带数量） | P1 | S | done (PR #37, 2026-06-11) | 新增 `<dialog id="importResultDialog">` 显示书/摘抄/记录/关联各类数量；成功路径调用 `showImportResult(state)` 替代 toast。 |
| OPT-040 | GDPR 导出格式自适应 + 清空护栏 | P1 | M | done (PR #36, 2026-06-11) | `importData()` 检测 `exportFormat/.state` 自动解包；内容为 0 且当前账号非空时二次确认。新增 `resolveImportedState`/`stateContentCount` helper。 |
| OPT-039 | 连接泄漏：pre-auth/debug 端点未入安全网 | P1 | M | done (PR #35, 2026-06-11) | 新增 `_open_conn()` helper 统一登记 `self._active_conn`，7 处裸 `get_conn()` 改走它，复用已验证的 `finally` 兜底。3 条新增连接泄漏测试。 |
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

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
