# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-04

## Next up

**预算状态（2026-08-04 本次 triage）：** 外层一次性统计显示，近 7 天 `headRefName` 以 `auto/` 开头的实现 PR 共 **2 个**，上限 **8**，剩余 **6 个**；未触发预算熔断。本次仍保持 WIP=1，只指派本周 Theme 2 唯一焦点 OPT-145。

**状态更新（本次 triage — 2026-08-04）**：
- OPT-136 → done：PR #101（`4005420`）已于 2026-08-03 合入；当前书详情含最近 5 条 session、次数/分钟汇总与“查看全部”入口。
- OPT-125 → done：PR #102（`c0ce2d5`）已于 2026-08-03 合入；删书确认已列出记录、摘抄/笔记、关联数量。
- OPT-143 → done：PR #103（`a30964d`）已于 2026-08-04 合入；HTTP ActionExecutor 对重复同向实体对返回 `skipped`，测试锁定只写一条 connection。
- OPT-067 → done：PR #104（`1e5edf7`）已于 2026-08-04 合入；`contextFromHistoryKey()` 与后端 sanitizer 均正确恢复 `quote:` scope。
- OPT-060 → done：PR #60（`27f2bd5`）早已于 2026-07-10 通过 OPT-088 覆盖；当前 `renderConnections()` 的 `getSearchLabel()` 已把两侧摘抄正文放入 haystack。
- OPT-050 / OPT-089 / OPT-124 → P3 parked：当前代码缺口仍在，但分别只是孤儿 key 清理、休眠 onboarding 路径清理、内部观测表 GC；无直接 Theme 2/signal 贡献，按北极星税降级。

**未完成项复核（本次 triage）**：除 OPT-145（P1/M，强）外，其余均为 P3 parked 或 blocked：OPT-032/035/036/044/046/048/050/051/089/124/142/144（S），OPT-081/146/147（M），OPT-117（L，blocked）。这些项要么无直接北极星贡献，要么缺真实 signal；已在 backlog 补齐 priority、size 与 northstar 结论，不指派。

---

**本周指派：OPT-145。**

理由：Theme 2 在 8/7 前收口；北极星第三数从 1 回升到 35，但尚未连续两周增长。OPT-145 是唯一未完成的 P1，且由 8/2 真机 P1 signal 直接观察到检索摩擦；当前代码仍把全部标签塞进隐藏 scrollbar 的横滑容器。它可在单个 M 级前端 PR 内完成，且能让已有标签资产真正成为回顾入口。

关键文件：`app.js:1384-1425`（全部标签渲染）、`index.html:97`（单一标签容器）、`styles.css:465-476`（横向滚动且隐藏 scrollbar）。
Signal 佐证：2026-08-02「约 50 个标签横向滚动且隐藏滚动条，截断后缺少可继续横滑提示」。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | **P2** | S | **done** | ✅ PR #104 / `1e5edf7` 已合入 [2026-08-04]；前后端 + 双端测试均已覆盖 quote scope |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P3 | S | triaged | P3 parked：缺口仍在，但只是 state hygiene，无 Theme 2/signal 直接贡献 |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts | P3 | S | triaged | P3 parked：Theme B0 已休眠，且无清除示例失败 signal |
| OPT-125 | deleteBook() 确认弹窗仅显示书名，不显示将被删除的记录/摘抄/关联数量 | **P2** | S | **done** | ✅ PR #102 / `c0ce2d5` 已合入 [2026-08-03]；数量提示与测试已落地 |
| OPT-141 | all_books_summary 缺 tags 字段：AI 无法按标签跨书查询主题书单 | **P2** | S | **done** | ✅ PR #98 已合入 feature/agent [2026-07-30]；`app_server.py` 已加 tags 字段与系统指令说明；全量测试绿 |
| OPT-138 | MCP link_thought() 缺少重复关联守卫：并发或重复调用可写入重复 connection 记录 | **P2** | S | **done** | ✅ PR #97 已合入 feature/agent [2026-07-29]；Theme 2「建立关联」三连（OPT-135/137/138）完成 |
| OPT-145 | 书单约 50 个标签全部塞入无滚动提示的横滑条，筛选入口不可发现 | **P1** | M | **triaged** | **2026-W32 唯一焦点**；8/2 P1 signal；首屏有限标签 +「更多标签（N）」可搜索面板 |
| OPT-143 | HTTP ActionExecutor.link_thought 无重复关联守卫，与 MCP 路径不对称 | **P2** | S | **done** | ✅ PR #103 / `a30964d` 已合入 [2026-08-04]；重复同向实体对跳过且有回归测试 |
| OPT-136 | 书籍详情对话框无阅读记录概览：Theme 2 回顾缺少书级阅读足迹摘要 | P3 | M | **done** | ✅ PR #101 / `4005420` 已合入 [2026-08-03]；真实实现覆盖摘要、最近 5 条与查看全部 |
| OPT-120 | 长耗时 OCR 结果服务端留存 + 断线自动取回——手机切走就白等 20s 并浪费 LLM 调用 | **P2** | M | **done** | ✅ PR #99 已合入 feature/agent [2026-07-31]；`ocrRequestId` 落 quote state + 鉴权 status 查询 + localStorage 恢复/继续轮询 |
| OPT-102 | 快速识别改二进制上传（去掉 base64 33% 膨胀），进一步缩短 OCR 上传耗时 | **P2** | M | **done** | ✅ PR #100 已合入 feature/agent [2026-07-31]；raw image body + URL 编码元数据头，旧 JSON data URL 保持兼容 |
| OPT-135 | existing_connections 在书/摘抄上下文中恒为空列表：AI 无法回答「这本书我关联过什么」 | P2 | S | **done** | ✅ PR #94 已合入 feature/agent [2026-07-27] |
| OPT-137 | build_system_instruction() 缺少 existing_connections 字段说明：AI 不知如何用该字段避免重复关联 | P2 | S | **done** | ✅ PR #94 已合入 feature/agent [2026-07-27] |
| OPT-139 | build_chat_prompt per-book quote 切片取最旧 20 条：书注量超 20 时最近摘抄对 AI 不可见 | P2 | S | **done** | ✅ PR #95 已合入 feature/agent [2026-07-27] |
| OPT-140 | 建立关联弹窗来源为摘抄时目标类型默认「书籍」：quote-to-quote 关联每次须额外切换下拉 | P2 | S | **done** | ✅ PR #96 已合入 feature/agent [2026-07-27] |
| OPT-133 | MCP `_save_state()` 绕过乐观锁：并发写入（MCP + HTTP）可致状态覆盖丢失 | P2 | S | **done** | ✅ PR #93 已合入 feature/agent [2026-07-26] |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | **done** | ✅ PR #92 已合入 feature/agent [2026-07-25] |
| OPT-134 | all_books_summary 50 本上限：约 60 本豆瓣书对 AI 跨书查询永久不可见 | P2 | S | **done** | ✅ PR #91 已合入 feature/agent [2026-07-25] |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | **done** | ✅ PR #91 已合入 feature/agent [2026-07-25] |
| OPT-131 | openBookDetailDialog() "最近摘抄" 预览缺 ocrText 回落：OCR 摘抄在书详情显示空串 | P2 | S | **done** | ✅ PR #88 已合入 feature/agent [2026-07-24] |
| OPT-132 | OPT-077 里程碑卡片无点击跳转：相邻 session 卡片已有跳转，里程碑卡片孤立 | P2 | S | **done** | ✅ PR #88 已合入 feature/agent [2026-07-24] |
| OPT-129 | chat.js quotePreview() 缺 ocrText 回落：chat 面板 OCR 摘抄引用显示空串 | P2 | S | **done** | ✅ PR #88 已合入 feature/agent [2026-07-24] |
| OPT-130 | OPT-077 里程碑无分页：110 本豆瓣书全量 DOM 节点，时间线首屏卡顿数秒 | P2 | S-M | **done** | ✅ PR #89 已合入 feature/agent [2026-07-24] |
| OPT-126 | runShelfOcr() 缺少 try/finally 加载态管理：20s 等待无 spinner、按钮可重复点击 | P2 | S | **done** | ✅ PR #90 已合入 feature/agent [2026-07-24] |
| OPT-077 | renderTimeline() 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 | P1 | M | **done** | ✅ PR #81 已合入 feature/agent [2026-07-20]；W30 夜间轨焦点达成 |
| OPT-127 | resolveConnectionSide() 缺 ocrText 回落：OCR 摘抄关联节点标签显示为空引号 | P2 | S | **done** | ✅ PR #84 已合入 feature/agent [2026-07-21] |
| OPT-094 | addSession() pagesRead 计算差一，统计数据永远少计一页 | P2 | S | **done** | ✅ PR #87 已合入 feature/agent [2026-07-23] |
| OPT-123 | deleteSession() 删除记录后不重算 book.currentPage；新记录起始页自动填充显示过期值 | P2 | S | **done** | ✅ PR #85 已合入 feature/agent [2026-07-22] |
| OPT-128 | addSession() 编辑路径 currentPage 单调递增：endPage 缩小后驻留旧值，下次起始页自动填充过期数 | P2 | S | **done** | ✅ PR #86 已合入 feature/agent [2026-07-22] |
| OPT-070 | buildQuoteSearchCard() OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 | P2 | S | **done** | ✅ PR #82 已合入 feature/agent [2026-07-21] |
| OPT-071 | 摘抄卡片与详情弹窗图片缺少 onerror 回退：URL 失效时显示浏览器破图图标 | P2 | S | **done** | ✅ PR #83 已合入 feature/agent [2026-07-21] |
| OPT-109 | 跨页 OCR：runOcrFromImage() 仅支持单图，拍两页无法拼成同一摘抄 | P2 | M | **done** | ✅ PR #78 已合入 feature/agent [2026-07-20] |
| OPT-095 | 新建摘抄对话框页码字段从不预填 book.currentPage | P2 | S | **done** | ✅ PR #80 已合入 feature/agent [2026-07-20] |
| OPT-073 | 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 | P2 | S | **done** | ✅ PR #79 已合入 feature/agent [2026-07-20] |
| OPT-121 | all_books_summary 缺 book.review——用户手写读后感对跨书 AI 查询不可见 | P2 | S | **done** | ✅ PR #76 已合入 feature/agent [2026-07-19] |
| OPT-122 | addSession() startedAt 追溯守卫错误——补录更早历史 session 时开始日期无法更新 | P2 | S | **done** | ✅ PR #77 已合入 feature/agent [2026-07-19] |
| OPT-093 | deleteSession() 不回写 book.currentPage / book.lastReadAt，删除记录后进度数据残留 | P2 | S | **done** | **与 OPT-123 完全重复**（OPT-123 PR #85 已合入），自动覆盖，不另行指派 |
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | **done** | **与 OPT-053 完全重复**（OPT-053 PR #74 2026-07-18 已实现），不另行指派 |
| OPT-142 | 关联弹窗 filteredQuotes() 不搜摘抄 tags：按标签找目标摘抄失败 | P3 | S | triaged | P3 parked（场景频率低，无 signal 直接佐证；`app.js:5308-5309` 补 tags 搜索，预算富余周再做） |
| OPT-144 | 聊天压缩阈值 10 可能过低 | P3 | S | triaged | P3 parked：只有批量录摘抄 signal，无“随后密集探讨/发生遗忘”证据；等待 model_logs 或用户反馈 |
| OPT-146 | 书卡状态/评分/计数/进度/标签信息层级过密 | P3 | M | triaged | P3 parked：先验证 OPT-145，避免把明确检索问题扩成开放式视觉重构 |
| OPT-147 | renderBooks 最终渲染全部书卡，未来规模可能变慢 | P3 | M | triaged | P3 parked：146 本尚可，无真机性能指标或任务放弃 signal |
| OPT-124 | _run_gc() 不包含 model_logs 等五张观测表；LLM 全文 blob 无限累积 | P3 | S | triaged | P3 parked：源码确认 GC 仍只覆盖四类旧表，但无容量 signal，属磁盘卫生/内部观测问题 |
| OPT-081 | Organize/Candidates 批量采集激活，前端实现沉睡，无 HTML/调用者/后端端点 | P3 | M | triaged | P3 parked（2026-07-13 PO 仪式）：零 signal 佐证；M 复杂度激活无人要求的路径，对北极星无贡献 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P2 | S | **done** | ✅ PR #60 / `27f2bd5` [2026-07-10] 已由 OPT-088 覆盖；当前 haystack 含两侧摘抄正文 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android；升级到 B 当周再做） |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（定位 A 唯一用户=owner 本人，屏幕阅读器 a11y 无直接价值） |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P3 | S | triaged | P3 parked（与 OPT-048 同逻辑；定位 A） |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献） |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献） |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做） |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，直至定位升级到 C） |
| OPT-117 | 豆瓣 ID 一键生成阅读偏好画像 | P3 | L | blocked | blocked（2026-07-17 技术调研结论：服务端代抓不可行，等待新证据再解冻） |

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
