# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-19

## Next up

**预算状态（2026-07-19 本次 triage）：** 近 7 天 auto/ PR 共 **5 个**（PR #77 auto/opt-122 2026-07-19、PR #76 auto/opt-121 2026-07-19、PR #70 auto/opt-115-116 2026-07-16、PR #69 auto/opt-113-114 2026-07-16、PR #67 auto/opt-100-103-110 2026-07-14），上限 **8**，剩余 **3 个额度**，可指派。

**状态更新（本次 triage）**：
- OPT-121（PR #76）merged 2026-07-19，triaged → done。
- OPT-122（PR #77）merged 2026-07-19，triaged → done。
- OPT-123：new → triaged（P2, S）。deleteSession() 删除后不重算 currentPage，与 OPT-093 为同一缺陷，以 OPT-123 为准（行号已更新）。
- OPT-124：new → triaged（P3 parked）。model_logs 等表无 GC，长期磁盘问题；与 OPT-032 同类，无直接北极星贡献 → §5 北极星税 P3。
- OPT-109：P2 → **P1**（signal boost：2026-07-03「拍 2 张照片一起 OCR，拼成同一条摘抄」；新增摘抄 8/周，2026-07-19 北极星下滑）。

---

**指派：OPT-109（跨页 OCR Phase 1 纯前端）**

**理由（2-3 行）：** OPT-109 是唯一 signal 直接点名（2026-07-03「希望能拍 2 张照片一起 OCR，拼成同一条摘抄」）的不含未完成依赖的 P1 项，加之 2026-07-19 北极星新增摘抄进一步下滑至 8/周，「采集顺滑」收尾口仍有缺口。Phase 1 完全是纯前端实现：`runOcrFromImage()`（`app.js:4754`）当前只处理单张 `pendingQuoteImage`，改为支持 `multiple` file input、串行两次 OCR、拼接文本填入 `els.quoteContent`，约 30-40 行，零后端/schema/API 变更，Agent2 可独立实现并补 JS 单测验证拼接逻辑。**Signal 佐证**：signals.md 2026-07-03「拍 2 张照片一起 OCR，拼成同一条摘抄」；2026-07-19 北极星 新增摘抄 8（vs 上周 13）。

**关键文件：**
- `app.js:4754`（runOcrFromImage：当前单图逻辑，改为接受 pendingQuoteImages 数组，串行调用 OCR，concat 结果）
- `app.js:5685-5686`（ocrButton/aiOcrButton 事件绑定，可能需调整触发入口）
- `index.html`（摘抄对话框 OCR 图片 file input，加 `multiple` 属性或新增「追加第二张」按钮）
- `tests/frontend/*.test.js`（加一条串行拼接逻辑单测）

**Roadmap 对齐：** Theme 1「采集顺滑」收尾；直接佐证 signal 2026-07-03；Phase 1 不动后端——scope 已被 backlog 明确限定为「纯前端 ~30-40 行」。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-109 | 跨页 OCR：runOcrFromImage() 仅支持单图，拍两页无法拼成同一摘抄 | **P1** | M | triaged | **signal 2026-07-03**「拍 2 张照片一起 OCR」→ 优先级提升；新增摘抄 8/周（2026-07-19 北极星下滑）；Phase 1 纯前端 ~30-40 行；`app.js:4754`（runOcrFromImage）|
| OPT-121 | all_books_summary 缺 book.review——用户手写读后感对跨书 AI 查询不可见 | P2 | S | **done** | ✅ PR #76 已合入 feature/agent [2026-07-19] |
| OPT-122 | addSession() startedAt 追溯守卫错误——补录更早历史 session 时开始日期无法更新 | P2 | S | **done** | ✅ PR #77 已合入 feature/agent [2026-07-19] |
| OPT-073 | 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 | P2 | S | triaged | Theme 2 核心动作（AI 探讨 29/周）；OPT-069 后端重试已上，UI 无恢复入口；`chat.js:702-719` |
| OPT-070 | buildQuoteSearchCard() OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 | P2 | S | triaged | Theme 2 搜索视觉；`app.js:1519`（entry-card-cover 未填图）；可与 OPT-071 合并 PR |
| OPT-071 | 摘抄卡片与详情弹窗图片缺少 onerror 回退：URL 失效时显示浏览器破图图标 | P2 | S | triaged | OPT-052 遗漏错误处理；可与 OPT-070 合并；`app.js` 摘抄卡面+详情 img |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | triaged | northstar 中；Theme 1/2 可用性；摘抄 100+ 条后按键卡顿；`app.js` 搜索事件，5 行 debounce(250ms) |
| OPT-123 | deleteSession() 删除记录后不重算 book.currentPage；新记录起始页自动填充显示过期值 | P2 | S | triaged | Theme 1 收尾；与 OPT-093 为同一缺陷，以本项为准（`app.js:3489`）；约 4-6 行 |
| OPT-093 | deleteSession() 不回写 book.currentPage / book.lastReadAt，删除记录后进度数据残留 | P2 | S | triaged | **与 OPT-123 完全重复**（OPT-123 含更新行号），按 OPT-123 实现即自动覆盖，不另行指派 |
| OPT-094 | addSession() pagesRead 计算差一，统计数据永远少计一页 | P2 | S | triaged | 数据准确性；`app.js:2311`（addSession）+ `2318`（editSession）+ `1456`（统计汇总），3 行 |
| OPT-095 | 新建摘抄对话框页码字段从不预填 book.currentPage | P2 | S | triaged | Theme 1 小摩擦；`app.js:2520`，2-3 行 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | 乐观锁版本字段污染可致跨设备丢数据；`app_server.py:676, 4057, 4061` |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | `app.js:2316-2332`，2 行，复用 deleteBook() 模式 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | `app.js:274-279`，1 行修复；quote: fallthrough 错误解析为 bookId |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts | P2 | S | triaged | onboarding「示例→清除→空白起步」路径；`app.js:1729-1744` |
| OPT-077 | renderTimeline() 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 | P2 | M | triaged | Theme 2「回顾有价值」；OPT-074 数据已到位；`app.js:1321-1399` + `styles.css` |
| OPT-120 | 长耗时 OCR 结果服务端留存 + 断线自动取回——手机切走就白等 20s 并浪费 LLM 调用 | P2 | M | triaged | Theme 1；真机实测后端成功但 iOS 断连丢结果；requestId+落库+visibilitychange 方案；改动 M，不适合 agent（新端点+schema 变更） |
| OPT-102 | 快速识别改二进制上传（去掉 base64 33% 膨胀），进一步缩短 OCR 上传耗时 | P2 | M | triaged | Theme 1；`app_server.py`（OCR 端点 body 解析）+ `app.js`（toBlob 上传路径）；保留旧 dataURL 分支兼容 |
| OPT-124 | _run_gc() 不包含 model_logs 等五张观测表；LLM 全文 blob 无限累积 | P3 | S | triaged | P3 parked（与 OPT-032 同类：磁盘卫生、长期问题、无直接北极星贡献；预算富余周再做）|
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | **done** | **与 OPT-053 完全重复**（OPT-053 PR #74 2026-07-18 已实现），不另行指派 |
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
