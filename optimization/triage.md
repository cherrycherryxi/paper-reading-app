# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-09-01

## Next up

**夜间执行 · 修复 OPT-175（iOS Safari 无法注销账号）**

**状态：指派（夜间轨唯一 S 级合格项）**

**指派：** OPT-175。**夜间适配：是**——依据：① 复杂度 S（改动仅 `app.js:4959-4992` 的 `deleteAccount()` + 既有 `showConfirmDialog` 加一个可选文本输入槽 + 一条前端回归）；② 验收边界清楚（iOS 真机能完成注销、用户名不匹配时取消并 toast）；③ 无需 owner 产品/设计判断（平台兼容正确性修复，非信息架构/导航/视觉取舍，复用既有对话框基建）。本次核验确认 08-31 指派仍未实施（`app.js:4968` 仍为 `window.prompt`、无 OPT-175 提交），本夜继续指派。其余未完成项均 P3 parked / blocked，或为 M/L（OPT-176/177）不合夜间 S 边界，不填充指派。

**预算状态（2026-09-01）：** 外层一次性统计最近 7 天 `auto/` PR 数为 **5**，上限 **8**，剩余 3 个预算位，本次指派 1 项实现，未达上限。未调用 `gh` 或 GitHub API。

**signal / Theme：** OPT-175 由 explore E308 于 2026-08-30 提拔；northstar 强——完整账号注销是 P0/GDPR/PIPL 数据权利要求，主平台（iPhone/WebKit）上 `window.prompt` 恒返 `null`，`typed !== expected` 恒真，注销永远走「用户名不匹配，已取消」（`app.js:4969-4972`）。对齐当前 Theme 3「积累可信」的数据权利可信度。

**关键文件：** `app.js:4959-4992`（`deleteAccount()`）；`index.html`（账号抽屉）；`tests/frontend/regression-fixed-bugs.test.js`。

**本次对账（2026-09-01）：**
- 仓库证据：HEAD 停在 2026-08-31 20:53（`936eb29`），今日无提交；`app.js:4968` 实测仍为 `window.prompt(...)`、`app.js:4977` 服务端 DELETE 仍需 `confirmUsername`，无 `showConfirmDialog` 文本输入槽改动或兼容分支/测试 → OPT-175 未实施，继续指派。
- 最近 8 天提交与合并 PR 均为 hooks / release / signals / DeepSeek 模型切换（`6922ac0` flash model 上线）与已标 done 的 OPT（#137/#136/#135/#134/#133/#132/#131），无映射任何未完成 OPT 的新合并 → 无需新增 done 对账；OPT-174 已于 08-30 由 PR #137 标 done。
- 新增 OPT-176（P1/M）与 OPT-177（P1/M），由 explore 08-31 提拔写入 backlog，有真实 signal / Theme 3 佐证，但均 M 级且涉体验取舍或数据安全语义 → 不合夜间 S 边界，已写入 Prioritized backlog 标 triaged，留给 07:00 晨间候选卡，不写入 Next up。

**夜间适配否决（OPT-176/177）：** 两者均 P1 但 size=M，超夜间轨「仅 S、验收边界清楚、无需 owner 取舍」边界。OPT-176 需在「每书保底槽位 / 每书命中数标题 / 书间轮流插入」等检索排序体验间做取舍；OPT-177 涉删除失败回滚的数据安全语义与联带清理范围。均留给晨间候选卡，不写入 Next up。

**未完成项逐项重评（维持 parked/blocked）：** P3/S 为 OPT-032、035、036、044、046、048、050、051、089、124、144；P3/M 为 OPT-081；P3/L blocked 为 OPT-117。以上 13 项均缺当前 Theme / 真实 signal 的合理北极星贡献，维持 parked/blocked，不因预算尚有空间而填充指派。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-175 | 注销账号用原生 `window.prompt` 二次确认，iOS Safari 不支持 → iPhone 上永远无法注销 | **P1** | S | **triaged** | 🔜 夜间指派 [2026-09-01]：替换 `window.prompt`（app.js:4968）为 `showConfirmDialog` 文本输入槽，iOS 真机 + 前端回归验收注销闭环 |
| OPT-176 | 关联目标摘抄检索被单本书挤占，跨书匹配无法浮现 | **P1** | M | **triaged** | 🔜 晨间候选 [2026-09-01]：M 级且涉检索排序体验取舍（08-25 owner signal 直接来源）；不合夜间 S 边界，留 07:00 候选卡 |
| OPT-177 | deleteQuote/deleteSession 失败不回滚，与 deleteConnection 语义不一致 | **P1** | M | **triaged** | 🔜 晨间候选 [2026-09-01]：M 级且涉删除失败回滚数据安全语义；不合夜间 S 边界，留 07:00 候选卡 |
| OPT-174 | “阅读动力”只统计手工记录，记录页下线后真实阅读会被误报为 0 | **P1** | M | **done** | ✅ PR #137 / `a69a67b` + `37b92d9` 已合入 [2026-08-29]；无 session 分钟时切活跃天数/新增摘抄口径，卡片与分享图同步 |
| OPT-171 | 畸形关联字段可穿过 state 归一化并拖垮整个关联页 | **P1** | S | **done** | ✅ PR #136 / `93ed07b` 已合入 [2026-08-29]；两端清洗、渲染防御与畸形数据回归已落地 |
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

OPT-174、OPT-173、OPT-172、OPT-170、OPT-169、OPT-168、OPT-165、OPT-166、OPT-164、OPT-162、OPT-163、OPT-161、OPT-160、OPT-159、OPT-158、OPT-157、OPT-147、OPT-142、OPT-156、OPT-155、OPT-152、OPT-154、OPT-153、OPT-151、OPT-150、OPT-148、OPT-149、OPT-067、OPT-125、OPT-141、OPT-138、OPT-143、OPT-136、OPT-120、OPT-102、OPT-135、OPT-137、OPT-139、OPT-140、OPT-133、OPT-038、OPT-134、OPT-072、OPT-131、OPT-132、OPT-129、OPT-130、OPT-126、OPT-077、OPT-127、OPT-094、OPT-123、OPT-128、OPT-070、OPT-071、OPT-109、OPT-095、OPT-073、OPT-121、OPT-122、OPT-093、OPT-082、OPT-060 已完成。

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
