# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-29

## Next up

**OPT-171 — 畸形关联字段可穿过 state 归一化并拖垮整个关联页**

**状态：in-progress（P1 / S）— Codex nightly PR pending**

**理由：** OPT-171 是当前唯一同时具备当前 Theme、明确北极星贡献、S 复杂度与封闭验收边界的未完成项。当前后端只保证 `connections` 外层为数组，前端仍直接对 `conn.tags` 调用 `.map()`；一条字符串 tags 即可中断整个关联页。**夜间适配：是**——范围仅为 connection 专用清洗、前端防御与对应回归；验收限定为“畸形成员被隔离、其余关联仍可渲染、合法兼容字段不丢”，无需 owner 在信息架构、导航或视觉方案间取舍。外层统计最近 7 天 `auto/` 实现 PR 为 **7**，未达到 8 个上限，允许指派一个任务。

**关键文件：** `app_server.py:839-907`；`app.js:426-439,1049-1054,1088-1128`；`tests/agent/custom_quote_tags_sanitize_test.py`（可沿用 sanitizer 测试模式）；`tests/frontend/connection-crud.test.js`。

**signal / Theme：** 当前 Theme 3「积累可信」要求已有摘抄与关联可恢复、可回顾；2026-08-24、08-25 两条 owner signal 证明关联是正在真实使用的回顾路径。OPT-170/172 已修复保存失败回滚与跨书检索，OPT-171 继续封住单条脏关联拖垮整页的可信性缺口。最新北极星仍是 2026-08-23 的使用 2 天 / 新增摘抄 5 / 回顾操作 6，只能支持优先保护回顾资产，不能宣称增长。

**预算状态（2026-08-29）：** 外层一次性提供最近 7 天 `auto/` PR 数为 **7**，上限 **8**，剩余 **1**；本次至多指派一个并已用于 OPT-171。未调用 `gh` 或 GitHub API；外层“最近 50 个 feature/agent PR”列表为空，不用缺失的 PR 元数据补推结论。

**本次证据核对：**
- OPT-173 已由 PR #135 / `fe6173c` 合入：`renderQuotes()` 新增“原文摘抄”/“我的笔记”直白标签，`styles.css` 为笔记加入横线纸版式与独立布局，真实源码测试锁定两类标签且不再依赖小型 overlay chip；故 backlog 与 triage 均标 done。
- `783a4bf` 已落地 OPT-170 与 OPT-172：当前 `app.js` 的关联增删改普通失败会恢复操作前快照，目标摘抄选择器支持中文多词、跨书优先与书籍范围；对应普通失败回滚、检索范围和清除误选测试仍在树中，故 backlog 与 triage 均标 done。
- `bb7dae9` 继续修复 iPhone 关联选择器：候选列表在触屏端进入文档流、滑动不在 `touchstart` 误选、键盘完成键不提交表单，相关回归测试仍在树中。这是 OPT-172 落地后的真实体验收口，不新增重复 backlog 项。
- `81ca03b` 已恢复深度共读跨书摘抄检索：Gateway 的 `search_quotes()` 支持多词匹配与 book/relation scope，契约测试覆盖书名、作者、多词、范围与用户隔离；它不对应现存未完成 backlog 项，故不凭提交标题新增 done。
- 本次实跑 `quote-card-image-thumb` 与 `connection-crud` 两个源码专项，Node **20 项全部通过**；前者验证 OPT-173 当前实现，后者确认 OPT-171 尚无畸形 tags 回归。规划维护未执行全量套件，也不宣称全量通过。
- OPT-171 仍未完成：`sanitize_state()` 与 `normalizeStateShape()` 只校验 `connections` 外层为数组，`buildConnectionCard()` 仍直接对 `(conn.tags || []).map(...)`，字符串 tags 会抛错并中断 `renderConnections()` 整体渲染。重评为 P1/S、Theme 3 强贡献、夜间适配；预算 7/8，已指派为 Next up。
- 最近 8 日提交中，`7504173` 明确为 PR #134 的 OPT-169 合入提交；当前 `app.js` 已让 `syncState()` 返回保存结果，关联新增/编辑/删除遇冲突后停止关闭弹窗或播报成功；`tests/frontend/state-optimistic-lock.test.js` 锁定结构化返回，`tests/frontend/connection-crud.test.js` 覆盖三条 409 回归，故 backlog 与 triage 均标 done。本次给出的“最近 50 个 feature/agent PR”清单为空，未凭描述新增其他 done 判断。
- OPT-159、160、161 的完成证据仍分别是 `c0e9b2a`、`a086b9e`、`ad85cd5`；当前树中保留对应启动失败收口、取消竞态和重启恢复代码及测试。
- OPT-163 已由 PR #127 squash 合入 `feature/agent`（`e13f25d`）；Gateway 已返回并检索真实 `reflection`，契约测试覆盖聚焦摘抄、关键词命中与用户隔离；2026-08-26 triage 留存的全量结果为 Python `492 passed, 26 subtests passed`、Node `508 passed, 0 failed`。
- OPT-164 已由 PR #129 squash 合并至 `feature/agent`（`b33d3af`）；Gateway 已支持按所属书名和作者检索摘抄，契约测试仍在树中。
- OPT-165 已由 PR #132 合入（`31dee7b`）；两端实体摘要、字段白名单与孤儿关联跳过均有当前代码和测试证据。
- OPT-166 已由 PR #130 squash 合入 `feature/agent`（`cf1f9b6`）；全部无效证据时降级结论、部分有效与原本无证据边界回归已落地。
- OPT-167 已由 PR #131 squash 合入 `feature/agent`（`fa76724`）；非对象建议会在持久化前被过滤并留下 warning，合法建议继续进入既有审批状态机；合入审查留存结果为 Python `500 passed, 26 subtests passed`、Node `508 passed, 0 failed`。
- OPT-168 已由 PR #133 squash 合入 `feature/agent`（`46ce38b`）；上下文 revision 隔离旧查询、启动、取消及异常响应，切换时复位任务、状态、结果、历史与运行控件；合入审查留存结果为 Python `505 passed, 26 subtests passed`、Node `510 passed, 0 failed`。
- OPT-169 已由 PR #134 squash 合入 `feature/agent`（`7504173`）；结构化冲突结果与关联增删改失败提示已落地，当前树保留三条 409 UI 回归。
- 其余未完成项逐项重评：OPT-171=P1/S/Theme 3 强贡献并符合夜间边界；P3/S 为 OPT-032、035、036、044、046、048、050、051、089、124、144；P3/M 为 OPT-081；P3/L blocked 为 OPT-117。后 13 项均缺当前 Theme / 真实 signal 的合理北极星贡献，维持 parked/blocked，不因预算尚有空间而填充指派。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-171 | 畸形关联字段可穿过 state 归一化并拖垮整个关联页 | **P1** | S | **in-progress** | **Codex nightly PR pending**；夜间适配：是，Theme 3 强贡献、验收封闭，预算 7/8 |
| OPT-173 | 摘抄页的摘抄与笔记封面差异不够直观 | **P1** | M | **done** | ✅ PR #135 / `fe6173c` 已合入 [2026-08-28]；直白标签、独立版式与源码回归已落地 |
| OPT-172 | 关联摘抄支持跨书多词检索与目标书范围 | **P1** | M | **done** | ✅ `783a4bf` 已落地 [2026-08-26]；多词召回、跨书排序、范围与清除误选测试在树中 |
| OPT-170 | 关联普通保存失败后未回滚本地变更 | **P1** | S | **done** | ✅ `783a4bf` 已落地 [2026-08-26]；增删改普通失败快照回滚测试在树中 |
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

OPT-173、OPT-172、OPT-170、OPT-169、OPT-168、OPT-165、OPT-166、OPT-164、OPT-162、OPT-163、OPT-161、OPT-160、OPT-159、OPT-158、OPT-157、OPT-147、OPT-142、OPT-156、OPT-155、OPT-152、OPT-154、OPT-153、OPT-151、OPT-150、OPT-148、OPT-149、OPT-067、OPT-125、OPT-141、OPT-138、OPT-143、OPT-136、OPT-120、OPT-102、OPT-135、OPT-137、OPT-139、OPT-140、OPT-133、OPT-038、OPT-134、OPT-072、OPT-131、OPT-132、OPT-129、OPT-130、OPT-126、OPT-077、OPT-127、OPT-094、OPT-123、OPT-128、OPT-070、OPT-071、OPT-109、OPT-095、OPT-073、OPT-121、OPT-122、OPT-093、OPT-082、OPT-060 已完成。

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
