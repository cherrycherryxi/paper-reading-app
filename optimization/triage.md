# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-23

## Next up

**预算状态（2026-07-23 本次 triage）：** 近 7 天 auto/ PR 共 **7 个**（PR #84 auto/opt-127 2026-07-21、PR #81 auto/opt-077 2026-07-20、PR #78 auto/opt-109 2026-07-19、PR #77 auto/opt-122 2026-07-19、PR #76 auto/opt-121 2026-07-19、PR #70 auto/opt-115-116 2026-07-16、PR #69 auto/opt-113-114 2026-07-16），上限 **8**，剩余 **1 个额度**，可指派。

**状态更新（本次 triage — 2026-07-23 第二次核查）**：
- OPT-127（PR #84）closed 2026-07-21，in-progress → done。resolveConnectionSide() ocrText 回落已修。
- OPT-094（PR #87）merged 2026-07-23，triaged → done。addSession() pagesRead 差一错误已修。
- OPT-123（PR #85）merged 2026-07-22，triaged → done。deleteSession() currentPage 重算已修。
- OPT-128（PR #86）merged 2026-07-22，triaged → done。addSession() 编辑路径 currentPage 单调递增已修。
- OPT-129/131/132：in-progress → triaged（本次核查：无 auto/ PR 已开启，回退为 triaged；仍为 Next up 指派目标）。
- OPT-082：backlog.md status triaged → done（与 OPT-053 PR #74 完全重复，已实现，补标修正）。
- OPT-093：backlog.md status triaged → done（与 OPT-123 PR #85 完全重复，已实现，补标修正）。

---

**指派：OPT-131 + OPT-132 + OPT-129（ocrText 回落三件收尾 + 里程碑点击）**

**理由（2-3 行）：** 三个修复均为 1 行，合计不超过 5 行代码变更，零 API/schema 变更，零回归风险：① OPT-131（`app.js:3825`）是全仓库 `ocrText` 回落对齐工程的最后一处漏网点，修后所有摘抄展示路径全部对齐 `content || ocrText` 口径；② OPT-132（`app.js:1789`）补全 OPT-077 里程碑卡片点击跳转，与相邻 session 卡片行为完全一致；③ OPT-129（`chat.js:92`）填补 `quotePreview()` 中的同类空串问题，修后 chat 面板 OCR 摘抄引用不再显示空串。三件均处于 Theme 1（采集·OCR）与 Theme 2（回顾）的交叉点，打包一 PR 最高效——预算仅剩 1 个额度，用于零风险、高确定性的收尾包最合适。

**关键文件：**
- `app.js:3825`（OPT-131，`openBookDetailDialog()` 最近摘抄预览——`escapeHtml(quote.content || "")` 改为 `escapeHtml(quote.content || quote.ocrText || "")`）
- `app.js:1789`（OPT-132，OPT-077 里程碑卡片——在 `finishedAt` / `startedAt` milestone 卡片后补 `card.addEventListener("click", () => openBookDetailDialog(book.id))`）
- `chat.js:92`（OPT-129，`quotePreview()`——`String(quote?.content || "")` 改为 `String(quote?.content || quote?.ocrText || "")`）

**Roadmap 对齐：** Theme 1「采集顺滑」× Theme 2「回顾有价值」双覆盖；3 × S 复杂度，合计 1-5 行，零风险；与全仓库 `quoteText()` helper 口径完全对齐；完成 OPT-077 遗留生态闭环。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-131 | openBookDetailDialog() "最近摘抄" 预览缺 ocrText 回落：OCR 摘抄在书详情显示空串 | **P2** | S | triaged | 全仓库 ocrText 收尾最后一处；`app.js:3825`，1 行；Theme 1+2；Next up |
| OPT-132 | OPT-077 里程碑卡片无点击跳转：相邻 session 卡片已有跳转，里程碑卡片孤立 | **P2** | S | triaged | OPT-077 遗留；`app.js:1789`，1 行；Theme 2；Next up |
| OPT-129 | chat.js quotePreview() 缺 ocrText 回落：chat 面板 OCR 摘抄引用显示空串 | **P2** | S | triaged | `chat.js:92`，1 行；Theme 1+2；Next up |
| OPT-130 | OPT-077 里程碑无分页：110 本豆瓣书全量 DOM 节点，时间线首屏卡顿数秒 | **P2** | S-M | triaged | OPT-077 后续；`app.js:1754-1771`；~10 行；扩展 load-more 逻辑；Theme 2 |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | triaged | Theme 2 搜索可用性；摘抄 100+ 条后卡顿；`app.js:3956, 4175-4176`，5 行 debounce(250ms) |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | 乐观锁版本字段污染可致跨设备丢数据；`app_server.py:676, 4057, 4061` |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | `app.js:2316-2332`，2 行，复用 deleteBook() 模式 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | `app.js:274-279`，1 行修复；quote: fallthrough 错误解析为 bookId |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts | P2 | S | triaged | onboarding「示例→清除→空白起步」路径；`app.js:1729-1744` |
| OPT-125 | deleteBook() 确认弹窗仅显示书名，不显示将被删除的记录/摘抄/关联数量 | P2 | S | triaged | 破坏性操作透明度（OPT-043/106 系列延续）；三辅助函数已就位，~2-3 行；`app.js:2723-2730` |
| OPT-126 | runShelfOcr() 缺少 try/finally 加载态管理：20s 等待无 spinner、按钮可重复点击 | P2 | S | triaged | Theme 1 收尾；OPT-118 上线遗漏；runOcr() 模式现成；`app.js:4568-4612` |
| OPT-120 | 长耗时 OCR 结果服务端留存 + 断线自动取回——手机切走就白等 20s 并浪费 LLM 调用 | P2 | M | triaged | Theme 1；真机实测后端成功但 iOS 断连丢结果；requestId+落库+visibilitychange 方案；改动 M，不适合 agent（新端点+schema 变更） |
| OPT-102 | 快速识别改二进制上传（去掉 base64 33% 膨胀），进一步缩短 OCR 上传耗时 | P2 | M | triaged | Theme 1；`app_server.py`（OCR 端点 body 解析）+ `app.js`（toBlob 上传路径）；保留旧 dataURL 分支兼容 |
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
| OPT-124 | _run_gc() 不包含 model_logs 等五张观测表；LLM 全文 blob 无限累积 | P3 | S | triaged | P3 parked（与 OPT-032 同类：磁盘卫生、长期问题、无直接北极星贡献；预算富余周再做）|
| OPT-081 | Organize/Candidates 批量采集激活，前端实现沉睡，无 HTML/调用者/后端端点 | P3 | M | triaged | P3 parked（2026-07-13 PO 仪式）：零 signal 佐证；M 复杂度激活无人要求的路径，对北极星无贡献 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P3 | S | triaged | P3 parked：OPT-088（PR #60，2026-07-10）已从上游函数侧完全覆盖，不另行指派 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android；升级到 B 当周再做） |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（定位 A 唯一用户=owner 本人，屏幕阅读器 a11y 无直接价值） |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P3 | S | triaged | P3 parked（与 OPT-048 同逻辑；定位 A） |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献） |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做） |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献） |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，直至定位升级到 C） |

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
