# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-10

## Next up

**本次不新增指派。OPT-151 已由 PR #112 实现中，继续作为唯一 WIP。**

**预算状态（2026-08-10）：** 检查最近 50 个目标分支为 `feature/agent` 的 PR；按本次运行时点向前滚动 7 天，符合 nightly implementation 预算口径（head 以 `auto/` 开头，或正文含 `Nightly-Agent: implement`）的 PR 为 **4 个**（PR #109、#110、#111、#112，head 均以 `auto/` 开头），上限 **8**，剩余 **4 个**。预算未熔断，但 PR #112 尚未合入，WIP=1。

**本次证据核对：**
- 已检查 `origin/feature/agent` 过去八天提交；当前头为 `c40e648`。上次 triage 后新增 7 个提交，包含 Explore、OPT-150 合并、晨间对账修复与两条快速识别 signal。
- OPT-150 → done：PR #111 已于 2026-08-09 合入（merge commit `8af9b8bb696888a5b474f0a17f70dfaa02263f72`）；当前 `app.js:948-968,1602-1608` 已按书缓存最大有效摘抄页码并用 `displayPage` 生成书卡进度，回归测试随提交合入。
- OPT-151 → in-progress：PR #112（head `auto/codex-151-20260809`，`Nightly-Agent: implement`）仍为 open、未合并；PR 已覆盖轻量/完整备份的 memories 与 customQuoteTags 恢复、覆盖保护和结果摘要，两套全量测试均通过。
- 2026-08-09 owner 真实反馈新增两项快速识别摩擦：`app.js:2731-2737` 删除行时直接 `row.remove()`，没有撤销或恢复状态；OCR 核对面板及 quote dialog 也没有 `touch-action` 约束，双击会触发移动浏览器页面缩放。分别登记为 OPT-153（P1/S）与 OPT-154（P2/S）。
- OPT-152 的 8 条截断缺口仍有代码证据，但尚无“最新记忆未召回”的直接使用失败，保持 P2/S；其余未完成项继续按原 P3 parked / blocked 结论处理。

**为何不新增指派：** OPT-151 已有测试全绿的 open implementation PR，按 WIP=1 应先完成现有工作。OPT-153 虽有最高等级 owner signal，仍先进入已核实队列，不与现有数据完整性修复并行。

**当前 WIP 边界：** PR #112 仅修复导入恢复链路对 `memories` / `customQuoteTags` 的保留、缩减确认与结果摘要；不得扩展为新的导入格式或 schema 变更。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-151 | 数据备份恢复丢弃长期记忆与自定义摘抄标签 | **P1** | S | **in-progress** | PR #112 open、全量测试通过；当前唯一 WIP |
| OPT-153 | 快速识别误删一行后无法撤销，只能重新识别 | **P1** | S | **triaged** | 8/9 owner 直接 signal；现有 `row.remove()` 无恢复状态，待当前 WIP 完成后优先评估 |
| OPT-152 | 长期记忆超过 8 条后最新记忆不会进入 Agent 上下文 | P2 | S | **triaged** | 代码缺口明确，但尚无直接召回失败 signal；低于当前 owner 实测摩擦 |
| OPT-154 | 快速识别卡片核对时双击触发页面放大 | P2 | S | **triaged** | 8/9 owner 直接 signal；局部手势修复，保留 pinch zoom 与可访问性 |
| OPT-150 | 无 session 时书卡忽略摘抄页码，已有阅读痕迹仍显示 0 页 | P1 | S | **done** | ✅ PR #111 / `8af9b8b` 已合入 [2026-08-09]；显示层回退与边界测试已落地 |
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

OPT-150, OPT-148, OPT-149, OPT-067, OPT-125, OPT-141, OPT-138, OPT-143, OPT-136, OPT-120, OPT-102, OPT-135, OPT-137, OPT-139, OPT-140, OPT-133, OPT-038, OPT-134, OPT-072, OPT-131, OPT-132, OPT-129, OPT-130, OPT-126, OPT-077, OPT-127, OPT-094, OPT-123, OPT-128, OPT-070, OPT-071, OPT-109, OPT-095, OPT-073, OPT-121, OPT-122, OPT-093, OPT-082, OPT-060.

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
