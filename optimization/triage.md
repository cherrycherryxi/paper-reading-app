# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-16

## Next up

**无符合夜间条件的任务。**

理由：给定近 8 日提交与当前代码证实，昨日唯一有直接 owner signal 的未完成项 OPT-158 已由 PR #123 / `be2d512` 合入：`renderQuotes()` 当前以 `quoteCoverMarkMap` 和 `.quote-cover-art--<kind>` 生成轻量封面，不再展示拍摄原图；详情页仍保留 `imageUrl`，相关前端测试覆盖有图/无图、类型差异和详情图片。剩余未完成项全部缺少当前 Theme 与真实 signal 支撑，按北极星税均为 P3 parked 或 blocked。**夜间适配：否**：没有同时满足复杂度 S、验收边界清楚、无需 owner 产品/设计判断且具有合理北极星贡献的局部任务，因此不为消耗预算强行指派。

**预算状态（2026-08-16）：** 外层一次性提供最近 7 天 `auto/` PR 数为 **5**，上限 **8**，剩余 **3**；预算未耗尽，但任务边界优先于预算。未调用 `gh` 或 GitHub API。

**本次证据核对：**
- PR #123 合入提交 `be2d512` 明确对应 OPT-158；当前 `app.js:43-49,2125-2131` 和 `styles.css:1289-1325` 已实现类型化轻量封面，`tests/frontend/quote-card-image-thumb.test.js` 与 `quote-image-onerror.test.js` 覆盖列表封面及详情原图边界。backlog 与 triage 均标 done，不能再作为候选。
- 未完成项逐项重评：P3/S 为 OPT-032、035、036、044、046、048、050、051、089、124、144，分别仅涉及磁盘/内部观测、冻结 billing、当前无 a11y signal、孤儿 state、休眠示例路径或缺少遗忘证据；P3/M 为 OPT-081，无真实采集 signal；P3/L blocked 为 OPT-117，服务端代抓方案已被仓库调研证据否决。它们虽分别为 S/M/L，但均无合理当前北极星贡献，不指派。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-151 | 数据备份恢复丢弃长期记忆与自定义摘抄标签 | **P1** | S | **done** | ✅ PR #112 / `2a67328` 已合入 [2026-08-10] |
| OPT-153 | 快速识别误删一行后无法撤销 | **P1** | S | **done** | ✅ PR #113 / `e7e108c`；撤销与全删恢复测试已在树中 |
| OPT-154 | 快速识别核对时双击页面放大 | P2 | S | **done** | ✅ PR #114 / `6ec326b`；局部 manipulation 约束与测试已在树中 |
| OPT-152 | 长期记忆新内容被 8 条上限截断 | **P1** | S | **done** | ✅ PR #116 / `a1d08b0` 已合入 [2026-08-11]；按上下文优先级与更新时间选取，9+ 条回归测试已落地 |
| OPT-155 | Agent 标签确认卡 DOM 注入 | P2 | S | **done** | ✅ PR #117 / `d2e3832` 已合入 [2026-08-11]；tag HTML 转义与恶意标签回归测试已落地 |
| OPT-156 | 忽略 Agent 建议失败仍显示成功 | P2 | S | **done** | ✅ PR #119 / `e14f0ac` 已合入 [2026-08-12]；失败保留确认卡并可重试，前端回归测试通过 |
| OPT-150 | 无 session 时书卡忽略摘抄页码，已有阅读痕迹仍显示 0 页 | P1 | S | **done** | ✅ PR #111 / `8af9b8b` 已合入 [2026-08-09]；显示层回退与边界测试已落地 |
| OPT-148 | 面向用户的显式阅读长期记忆 | P1 | M | **done** | ✅ PR #110 / `f58b01b` 已合入 [2026-08-08]；confirmed memories 可管理并按上下文注入 |
| OPT-149 | 清空探讨失败时本地界面仍被清空 | P2 | S | **done** | ✅ PR #109 / `cb8de66` 已合入 [2026-08-07]；失败保留历史，成功才重置 |
| OPT-145 | 书单约 50 个标签全部塞入无滚动提示的横滑条，筛选入口不可发现 | P1 | M | **done** | ✅ PR #106 / `9977757` 已合入 [2026-08-05]；更多标签可搜索面板与筛选闭环已实现 |
| OPT-146 | 书卡状态/评分/计数/进度/标签信息层级过密 | P3 | M | **done** | ✅ PR #107 / `ce56b70` 已合入 [2026-08-05]；默认精简、详情保留完整信息 |
| OPT-157 | “我的”主页前置长期记忆与快速导入入口 | **P1** | M | **done** | ✅ PR #122 / `3bdf431` 已合入 [2026-08-14]；后续 `35f9e99` 完成主页形态与测试 |
| OPT-158 | 摘抄卡片拍摄原图封面与 owner 偏好冲突 | **P1** | M | **done** | ✅ PR #123 / `be2d512` 已合入 [2026-08-15]；列表轻量封面、详情保留原图，回归测试已在树中 |
| OPT-142 | 关联弹窗 filteredQuotes() 不搜摘抄 tags：按标签找目标摘抄失败 | P3 | S | **done** | ✅ PR #120 / `14a2a1d` 已合入 [2026-08-13]；标签/我的理解检索回归已在树中 |
| OPT-144 | 聊天压缩阈值 10 可能过低 | P3 | S | triaged | parked：缺少上下文遗忘日志或用户反馈 |
| OPT-147 | renderBooks 最终渲染全部书卡，未来规模可能变慢 | P3 | M | **done** | ✅ PR #121 / `778d9fa` 已合入 [2026-08-13]；首屏 24 张 + 加载更多测试已在树中 |
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

OPT-158、OPT-157、OPT-147、OPT-142、OPT-156、OPT-155、OPT-152、OPT-154、OPT-153、OPT-151、OPT-150、OPT-148、OPT-149、OPT-067、OPT-125、OPT-141、OPT-138、OPT-143、OPT-136、OPT-120、OPT-102、OPT-135、OPT-137、OPT-139、OPT-140、OPT-133、OPT-038、OPT-134、OPT-072、OPT-131、OPT-132、OPT-129、OPT-130、OPT-126、OPT-077、OPT-127、OPT-094、OPT-123、OPT-128、OPT-070、OPT-071、OPT-109、OPT-095、OPT-073、OPT-121、OPT-122、OPT-093、OPT-082、OPT-060 已完成。

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
