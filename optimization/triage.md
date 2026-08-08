# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-08

## Next up

**Next up：OPT-150 — 无手动阅读记录时，书卡以该书有效摘抄的最大页码作为进度显示回退。**

**预算状态（2026-08-08）：** 检查最近 50 个目标分支为 `feature/agent` 的 PR；按本次运行时点向前滚动 7 天，符合 nightly implementation 预算口径（head 以 `auto/` 开头，或正文含 `Nightly-Agent: implement`）的 PR 为 **2 个**（PR #109、#110，head 均以 `auto/` 开头），上限 **8**，剩余 **6 个**。预算未熔断，且两个 PR 均已合入，没有未完成 nightly WIP。

**本次证据核对：**
- 已检查 `origin/feature/agent` 过去八天提交；当前头为 `798d7af`（2026-08-08 signal）。自上次 triage 后分支新增 12 个提交，涉及 Explore、OPT-148/149 实现、发布记录与新 signal。
- OPT-149 → done：PR #109（merge commit `cb8de664dc1e764cf51c1a8f637fa6568bc4bdc2`）已于 2026-08-07 合入；DELETE 失败时聊天历史不再被本地清空。
- OPT-148 → done：PR #110（merge commit `f58b01bb6f8ddbad986561b9d1f85aee699f1258`）已于 2026-08-08 合入；当前代码已有 confirmed memories 的持久化、管理 UI 与上下文注入。
- 2026-08-08 新 signal 明确指出：没有手动 session、但已有带页码摘抄的书仍显示「已读到 0 页」。当前 `app.js:1594-1608` 确认进度文案只读 `book.currentPage || 0`，缺口真实存在。

**为何选择 OPT-150：** 它同时得到 2026-08-08 的直接 false-zero signal 与 2026-07-16「从摘抄推算阅读足迹」方向支持；只需在现有 render cache 增加每书最大有效摘抄页码，并用于书卡显示，不反写 state、不伪造 session，属于单 PR 可完成的 S 项。它比其余 P3 parked 项有更强的真实任务失败证据，也比继续扩展功能面更符合 North Star 税与 WIP=1。

**实现边界：** 仅修正书卡进度显示回退；忽略非有限数或非正数页码，已有更高 `currentPage` 时不得降低，带 `totalPages` 时百分比需按上限截断。不得修改 `book.currentPage`、status、finishedAt、sessions 或其他 state。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-150 | 无 session 时书卡忽略摘抄页码，已有阅读痕迹仍显示 0 页 | **P1** | S | **triaged** | **Next up**；8/8 直接 signal + 7/16 推算阅读足迹方向；仅做显示回退，不反写 state |
| OPT-148 | 面向用户的显式阅读长期记忆 | P1 | M | **done** | ✅ PR #110 / `f58b01b` 已合入 [2026-08-08]；confirmed memories 可管理并按上下文注入 |
| OPT-149 | 清空探讨失败时本地界面仍被清空 | P2 | S | **done** | ✅ PR #109 / `cb8de66` 已合入 [2026-08-07]；失败保留历史，成功才重置 |
| OPT-145 | 书单约 50 个标签全部塞入无滚动提示的横滑条，筛选入口不可发现 | P1 | M | **done** | ✅ PR #106 / `9977757` 已合入 [2026-08-05]；更多标签可搜索面板与筛选闭环已实现 |
| OPT-146 | 书卡状态/评分/计数/进度/标签信息层级过密 | P3 | M | **done** | ✅ PR #107 / `ce56b70` 已合入 [2026-08-05]；默认精简、详情保留完整信息 |
| OPT-142 | 关联弹窗 filteredQuotes() 不搜摘抄 tags：按标签找目标摘抄失败 | P3 | S | triaged | parked：场景频率低，无直接 signal |
| OPT-144 | 聊天压缩阈值 10 可能过低 | P3 | S | triaged | parked：缺少上下文遗忘日志或用户反馈 |
| OPT-147 | renderBooks 最终渲染全部书卡，未来规模可能变慢 | P3 | M | triaged | parked：146 本无真机卡顿、掉帧或任务放弃证据 |
| OPT-124 | _run_gc() 不包含 model_logs 等观测表 | P3 | S | triaged | parked：磁盘卫生，无用户 signal |
| OPT-081 | Organize/Candidates 批量采集路径沉睡 | P3 | M | triaged | parked：无人要求，缺北极星贡献 |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts | P3 | S | triaged | parked：state hygiene，无 Theme 2 直接贡献 |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts | P3 | S | triaged | parked：Theme B0 休眠，无失败 signal |
| OPT-051 | 添加 Web App Manifest | P3 | S | triaged | parked：当前 owner 场景无直接价值 |
| OPT-048 | chatMessages 缺 role=log live region | P3 | S | triaged | parked：无当前 a11y signal |
| OPT-046 | Tab 导航缺 ARIA role/aria-selected | P3 | S | triaged | parked：无当前 a11y signal |
| OPT-036 | summarize_metrics() 全量历史扫描 | P3 | S | triaged | parked：内部运营工具 |
| OPT-035 | TraceManager 时间戳统一 UTC | P3 | S | triaged | parked：内部观测字段 |
| OPT-032 | _run_gc() 缺 WAL checkpoint | P3 | S | triaged | parked：磁盘卫生 |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | parked：billing 冻结 |
| OPT-117 | 豆瓣 ID 一键生成阅读偏好画像 | P3 | L | blocked | 服务端代抓不可行，等待新证据 |

## Recently reconciled done

OPT-148, OPT-149, OPT-067, OPT-125, OPT-141, OPT-138, OPT-143, OPT-136, OPT-120, OPT-102, OPT-135, OPT-137, OPT-139, OPT-140, OPT-133, OPT-038, OPT-134, OPT-072, OPT-131, OPT-132, OPT-129, OPT-130, OPT-126, OPT-077, OPT-127, OPT-094, OPT-123, OPT-128, OPT-070, OPT-071, OPT-109, OPT-095, OPT-073, OPT-121, OPT-122, OPT-093, OPT-082, OPT-060.

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
