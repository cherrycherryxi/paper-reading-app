# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-12

## Next up

**指派：OPT-156 — 忽略 Agent 建议失败时仍移除确认卡并显示“已忽略”（P2 / S）。**

理由：当前 Theme 3「积累可信」要求用户对 Agent 写操作的确认/拒绝与真实服务端状态一致。`chat.js:1008-1022` 在 reject 请求失败后仍移除确认卡并写入“已忽略”，使待处理 action 与用户认知分叉；这是可复现的数据控制 false-success。虽无新 owner signal，仍有合理的可信积累贡献，且仅需把失败路径改为保留卡片、恢复按钮并允许重试，单 PR 可完成。关键文件：`chat.js:1008-1022`、`tests/frontend/chat-agent-approval.test.js`。

**预算状态（2026-08-12）：** 外层一次性提供最近 7 天 `auto/` PR 数为 **6**，上限 **8**，剩余 **2**；未达上限，故仅指派上述 1 项。未调用 `gh` 或 GitHub API。

**本次证据核对：**
- 当前 HEAD 为 `0f31016`；给定近 8 日记录包含 PR #116 merge `a1d08b0` 与 PR #117 merge `d2e3832`。本地 `app_server.py:2655-2710` 已按 quote > book > global 与 `updatedAt` 倒序选前 8 条，`tests/agent/prompt_builder_memories_test.py:20-53` 覆盖 9+ 条、最近性和上下文优先级，故 OPT-152 改 done。
- 当前 `chat.js:1034-1043` 的 tag 分支逐项使用 `escapeHtml`，`tests/frontend/chat-agent-approval.test.js:296-317` 断言恶意 HTML 只显示为文本；与 PR #117 `d2e3832` 一致，故 OPT-155 改 done。
- OPT-156 未完成：`chat.js:1008-1022` 的 reject catch 仅记录错误，之后仍 `container.remove()`、追加“已忽略”并展示下一项；现有拒绝测试仅覆盖成功路径（`tests/frontend/chat-agent-approval.test.js:448-465`）。
- 其余未完成项逐项维持 backlog 的 P3/S-M（OPT-032、035、036、044、046、048、050、051、081、089、124、142、144、147）或 P3/L blocked（OPT-117）：均无当前 Theme 3 的直接真实 signal 或可验证北极星贡献，继续 parked，不指派。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-151 | 数据备份恢复丢弃长期记忆与自定义摘抄标签 | **P1** | S | **done** | ✅ PR #112 / `2a67328` 已合入 [2026-08-10] |
| OPT-153 | 快速识别误删一行后无法撤销 | **P1** | S | **done** | ✅ PR #113 / `e7e108c`；撤销与全删恢复测试已在树中 |
| OPT-154 | 快速识别核对时双击页面放大 | P2 | S | **done** | ✅ PR #114 / `6ec326b`；局部 manipulation 约束与测试已在树中 |
| OPT-152 | 长期记忆新内容被 8 条上限截断 | **P1** | S | **done** | ✅ PR #116 / `a1d08b0` 已合入 [2026-08-11]；按上下文优先级与更新时间选取，9+ 条回归测试已落地 |
| OPT-155 | Agent 标签确认卡 DOM 注入 | P2 | S | **done** | ✅ PR #117 / `d2e3832` 已合入 [2026-08-11]；tag HTML 转义与恶意标签回归测试已落地 |
| OPT-156 | 忽略 Agent 建议失败仍显示成功 | P2 | S | new | 数据控制 false-success；代码证实，暂无直接 signal |
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

OPT-155, OPT-152, OPT-154, OPT-153, OPT-151, OPT-150, OPT-148, OPT-149, OPT-067, OPT-125, OPT-141, OPT-138, OPT-143, OPT-136, OPT-120, OPT-102, OPT-135, OPT-137, OPT-139, OPT-140, OPT-133, OPT-038, OPT-134, OPT-072, OPT-131, OPT-132, OPT-129, OPT-130, OPT-126, OPT-077, OPT-127, OPT-094, OPT-123, OPT-128, OPT-070, OPT-071, OPT-109, OPT-095, OPT-073, OPT-121, OPT-122, OPT-093, OPT-082, OPT-060.

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
