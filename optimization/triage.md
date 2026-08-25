# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-26

## Next up

**无符合夜间条件的任务**

**状态：不指派**

**理由：** 外层一次性统计最近 7 天 `auto/` 实现 PR 为 **8**，已达到每 7 天最多 8 个的上限；预算耗尽，不能指派。**夜间适配：是（仅指任务边界评估）**——当前未完成项中 11 个 P3/S 都是磁盘卫生、内部观测、冻结 billing、无当前 signal 的可访问性或孤儿状态清理，虽为 S，但没有当前 Theme / 真实 signal 支撑的合理北极星贡献，按规则 parked；OPT-081 为 M、OPT-117 为 L blocked，也不满足夜间只做 S 的边界。因此即使忽略预算，也没有可指派的夜间任务。2026-08-24 owner 的关联选择、检索与误删 signal 仍需 10:00 晨间做多入口和删除语义的产品拆解，不能由夜间路径自行诠释。

**关键文件：** `optimization/backlog.md:261-269,285-303,362-380,398-406,416-424,442-451,705-714,794-802,1053-1065,1139-1147,1339-1347`；`app.js:1138-1167,6018-6067`；`tests/frontend/state-optimistic-lock.test.js:102-129`；`tests/frontend/connection-crud.test.js:155-241`。

**signal / Theme：** 当前 Theme 3「积累可信」与 W35 深度共读可信结果焦点已由 OPT-167、OPT-168 收口；最新北极星仍是 2026-08-23 的使用 2 天 / 新增摘抄 5 / 回顾操作 6，不能据此宣称增长。OPT-169 直接保护最新关联使用路径，但已由 PR #134 合入，不再指派。

**预算状态（2026-08-26）：** 外层一次性提供最近 7 天 `auto/` PR 数为 **8**，上限 **8**，剩余 **0**；预算耗尽，本次不指派。未调用 `gh` 或 GitHub API。

**本次证据核对：**
- 最近 8 日提交中，`7504173` 明确为 PR #134 的 OPT-169 合入提交；当前 `app.js` 已让 `syncState()` 返回保存结果，关联新增/编辑/删除遇冲突后停止关闭弹窗或播报成功；`tests/frontend/state-optimistic-lock.test.js` 锁定结构化返回，`tests/frontend/connection-crud.test.js` 覆盖三条 409 回归，故 backlog 与 triage 均标 done。本次给出的“最近 50 个 feature/agent PR”清单为空，未凭描述新增其他 done 判断。
- OPT-159、160、161 的完成证据仍分别是 `c0e9b2a`、`a086b9e`、`ad85cd5`；当前树中保留对应启动失败收口、取消竞态和重启恢复代码及测试。
- OPT-163 已由 PR #127 squash 合入 `feature/agent`（`e13f25d`）；Gateway 已返回并检索真实 `reflection`，契约测试覆盖聚焦摘抄、关键词命中与用户隔离。本次实跑 Python 全量 `492 passed, 26 subtests passed`，Node 全量 `508 passed, 0 failed`。
- OPT-164 已由 PR #129 squash 合并至 `feature/agent`（`b33d3af`）；Gateway 已支持按所属书名和作者检索摘抄，契约测试仍在树中。
- OPT-165 已由 PR #132 合入（`31dee7b`）；两端实体摘要、字段白名单与孤儿关联跳过均有当前代码和测试证据。
- OPT-166 已由 PR #130 squash 合入 `feature/agent`（`cf1f9b6`）；全部无效证据时降级结论、部分有效与原本无证据边界回归已落地。
- OPT-167 已由 PR #131 squash 合入 `feature/agent`（`fa76724`）；非对象建议会在持久化前被过滤并留下 warning，合法建议继续进入既有审批状态机。审查闸门实跑 Python 全量 `500 passed, 26 subtests passed`，Node 全量 `508 passed, 0 failed`。
- OPT-168 已由 PR #133 squash 合入 `feature/agent`（`46ce38b`）；上下文 revision 隔离旧查询、启动、取消及异常响应，切换时复位任务、状态、结果、历史与运行控件。审查闸门实跑 Python 全量 `505 passed, 26 subtests passed`，Node 全量 `510 passed, 0 failed`。
- OPT-169 已由 PR #134 squash 合入 `feature/agent`（`7504173`）；结构化冲突结果与关联增删改失败提示已落地，当前树保留三条 409 UI 回归。
- 其余未完成项逐项重评：P3/S 为 OPT-032、035、036、044、046、048、050、051、089、124、144；P3/M 为 OPT-081；P3/L blocked 为 OPT-117。它们仍缺当前 Theme / 真实 signal 的合理北极星贡献，维持 parked/blocked，不能因工程上容易而指派。2026-08-24 新关联摩擦是高置信 owner signal，但尚未形成验收边界清楚的 backlog 项，不在夜间路径自行诠释。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-169 | 关联写入遇到状态冲突仍播报保存/删除成功 | **P1** | S | **done** | ✅ PR #134 / `7504173` 已合入 [2026-08-25]；结构化冲突结果与关联增删改 409 回归已落地 |
| OPT-167 | 深度共读结果内部结构未校验，畸形建议会令整次任务失败 | **P1** | S | **done** | ✅ PR #131 / `fa76724` 已合入 [2026-08-24]；畸形建议过滤、warning 与合法建议审批状态回归已落地 |
| OPT-168 | 深度共读跨书切换只更新标题，旧书结果与历史残留在新上下文 | **P1** | S | **done** | ✅ PR #133 / `46ce38b` 已合入 [2026-08-25]；跨上下文清理、revision 隔离与控件复位回归已落地 |
| OPT-166 | 深度共读无效证据被剔除后仍保留失去支撑的研究结论 | **P1** | S | **done** | ✅ PR #130 / `cf1f9b6` 已合入 [2026-08-23]；全部无效时降级，部分有效与原本无证据边界测试已落地 |
| OPT-164 | 深度共读摘抄检索支持所属书名与作者 | **P1** | S | **done** | ✅ PR #129 / `b33d3af` 已合入 [2026-08-22]；书名、作者检索与用户隔离契约测试已落地 |
| OPT-165 | 深度共读关联工具返回两端实体摘要 | **P1** | S | **done** | ✅ PR #132 / `31dee7b` 已合入 [2026-08-24]；两端实体摘要、字段白名单、孤儿关联过滤测试已落地 |
| OPT-162 | 深度共读时间线丢失起止页与已读页数 | **P1** | S | **done** | ✅ PR #128 / `644b5dc` 已合入 [2026-08-21]；真实页码字段与用户隔离契约测试已落地 |
| OPT-163 | 深度共读摘抄丢失“我的理解”且无法按其检索 | **P1** | S | **done** | ✅ PR #127 / `e13f25d` 已合入 [2026-08-21]；Gateway 返回并检索 `reflection`，用户隔离契约测试已落地 |
| OPT-159 | 深度共读启动异常遗留永久 CREATED 任务 | P2 | S | **done** | ✅ PR #124 / `c0e9b2a` 已合入 [2026-08-17]；启动失败写 FAILED + API 回归 |
| OPT-160 | 取消深度共读后 runner 仍执行并可创建隐藏 action | **P1** | M | **done** | ✅ PR #125 / `a086b9e` 已合入 [2026-08-17]；取消中断、事务串行化与竞态测试已落地 |
| OPT-161 | 服务重启后深度共读永久停在 CREATED/RUNNING | **P1** | S | **done** | ✅ PR #126 / `ad85cd5` 已合入 [2026-08-18]；启动恢复、失败事件、幂等与终态保护测试已落地 |
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

OPT-169、OPT-168、OPT-165、OPT-166、OPT-164、OPT-162、OPT-163、OPT-161、OPT-160、OPT-159、OPT-158、OPT-157、OPT-147、OPT-142、OPT-156、OPT-155、OPT-152、OPT-154、OPT-153、OPT-151、OPT-150、OPT-148、OPT-149、OPT-067、OPT-125、OPT-141、OPT-138、OPT-143、OPT-136、OPT-120、OPT-102、OPT-135、OPT-137、OPT-139、OPT-140、OPT-133、OPT-038、OPT-134、OPT-072、OPT-131、OPT-132、OPT-129、OPT-130、OPT-126、OPT-077、OPT-127、OPT-094、OPT-123、OPT-128、OPT-070、OPT-071、OPT-109、OPT-095、OPT-073、OPT-121、OPT-122、OPT-093、OPT-082、OPT-060 已完成。

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
