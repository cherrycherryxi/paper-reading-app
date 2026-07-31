# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-29

## Next up

**预算状态（2026-07-29 本次 triage）：** 近 7 天 auto/ PR 共 **7 个**（PR #97 auto/opt-138 2026-07-29、PR #94 auto/opt-135-137 2026-07-28、PR #93 auto/opt-133 2026-07-26、PR #92 auto/opt-038 2026-07-25、PR #91 auto/opt-134-072 2026-07-25、PR #88 auto/opt-131-132-129 2026-07-24、PR #84 auto/opt-127 2026-07-22），上限 **8**，剩余 **1 个**，**本次可指派**。

**状态更新（本次 triage — 2026-07-29）**：
- OPT-138（in-progress → done）：PR #97 已合入 feature/agent（2026-07-29），link_thought() 补重复关联守卫，同 source+target 二次调用返回 skipped=true，connections 不再积累重复项。

**新 backlog 项扫描（本次 triage）**：
- OPT-141（new → triaged，P2，S）：`all_books_summary` 缺 `tags` 字段，AI 无法按标签跨书查询主题书单。signal 直接佐证（2026-07-03「成长/哲学标签书搜不到」），Theme 2「回顾有价值」直接受益。
- OPT-142（new → triaged，P3，S）：关联弹窗 `filteredQuotes()` 不搜 `tags`，按标签找目标摘抄失败。P3 parked：场景频率低，无 signal 直接佐证，预算富余周再做。

---

**指派：OPT-141。**

理由：OPT-138 刚于今日完成，Theme 2「建立关联」三连（OPT-135/137/138）收尾。OPT-141 是当前 P2 队列中最小且最强 signal 的项——1-2 行 backend 改动，直接佐证 2026-07-03「按主题找书零结果」（library 内有成长/哲学标签书，AI 搜不到），与 Theme 2「回顾有价值」对齐。当前预算余 1 个 auto/ slot，刚好容纳一个 S 项。

关键文件：`app_server.py:2632`（`all_books_summary` dict 增加 `"tags": b.get("tags", [])`）；`app_server.py:2661`（系统指令说明 tags 字段语义——每本书的手动分类标签，AI 应据此回答「成长/历史/推理类」等主题查询）。
Signal 佐证：2026-07-03「书单搜「成长」零结果——库里有多本成长题材（标签 `小说(成长/哲学)`）」。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | **P2** | S | triaged | `app.js:274-279`，1 行修复；quote: fallthrough 错误解析为 bookId |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | **P2** | S | triaged | `app.js:2316-2332`，2 行，复用 deleteBook() 模式 |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts | **P2** | S | triaged | onboarding「示例→清除→空白起步」路径；`app.js:1729-1744` |
| OPT-125 | deleteBook() 确认弹窗仅显示书名，不显示将被删除的记录/摘抄/关联数量 | **P2** | S | triaged | 破坏性操作透明度（OPT-043/106 系列延续）；三辅助函数已就位，~2-3 行；`app.js:2723-2730` |
| OPT-141 | all_books_summary 缺 tags 字段：AI 无法按标签跨书查询主题书单 | **P2** | S | **in-progress** | PR #98 open [2026-07-29]；`app_server.py:2632` 已加 `"tags": b.get("tags", [])` + 系统指令补 tags 说明；全量测试绿（416 Python + 51 JS）|
| OPT-138 | MCP link_thought() 缺少重复关联守卫：并发或重复调用可写入重复 connection 记录 | **P2** | S | **done** | ✅ PR #97 已合入 feature/agent [2026-07-29]；Theme 2「建立关联」三连（OPT-135/137/138）完成 |
| OPT-136 | 书籍详情对话框无阅读记录概览：Theme 2 回顾缺少书级阅读足迹摘要 | **P2** | M | triaged | Theme 2「回顾有价值」；2026-06-26 signal 佐证（「读完日期/不依赖手动加记录」方向）；`getBookSessions()` 已封装；`index.html:410-433`、`app.js:3776-3875`、`styles.css` |
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
| OPT-124 | _run_gc() 不包含 model_logs 等五张观测表；LLM 全文 blob 无限累积 | P3 | S | triaged | P3 parked（与 OPT-032 同类：磁盘卫生、长期问题、无直接北极星贡献；预算富余周再做）|
| OPT-081 | Organize/Candidates 批量采集激活，前端实现沉睡，无 HTML/调用者/后端端点 | P3 | M | triaged | P3 parked（2026-07-13 PO 仪式）：零 signal 佐证；M 复杂度激活无人要求的路径，对北极星无贡献 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P3 | S | triaged | P3 parked：OPT-088（PR #60，2026-07-10）已从上游函数侧完全覆盖，不另行指派 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android；升级到 B 当周再做） |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（定位 A 唯一用户=owner 本人，屏幕阅读器 a11y 无直接价值） |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P3 | S | triaged | P3 parked（与 OPT-048 同逻辑；定位 A） |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献） |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献） |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做） |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，直至定位升级到 C） |
| OPT-117 | 豆瓣 ID 一键生成阅读偏好画像 | P3 | M | blocked | blocked（2026-07-17 技术调研结论：服务端代抓不可行，等待新证据再解冻） |

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
