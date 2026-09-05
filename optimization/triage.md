# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-09-06

## Next up

**状态：指派 1 项（OPT-183，夜间 S 适配）。OPT-181 连续多夜空转，按 09-05 注记升级 07:00 晨间查因，本夜不再第 3 次夜间续指。OPT-182（P1/S）涉「上翻 vs 自动跟随」UX 取舍，留 07:00 晨间候选卡。其余 P1 M/L 项与 P3 parked 不变。**

本夜核验所有未完成 backlog 项后，夜间接力项（OPT-181）已连续三夜（09-04/09-05/09-06）无实现 commit——它不再是「可指望今晚落盘的 S 项」而是「需晨间查因的卡壳项」，故按 09-05 注记升级而非续指。未完成项中唯一**新见、S 级、纯正确性、无 owner 产品/设计判断**的合格夜间候选是 **OPT-183**（E340 09-05 提拔，`status: new` 首见），本夜指派它；不为填满预算追加指派其余 M/L 项。

**指派：OPT-183 — addQuote 图片上传失败提示被成功 toast 覆盖，用户对照片未保存毫不知情（P2 / S）**
- **夜间适配：是** —— S 级、验收边界清楚（图片上传失败→最终可见 toast 反映「图没存上、已先存文字」而非单纯「已保存」）、属明确的正确性/真话性缺口、无 owner 产品/设计判断（「先存文字」设计意图已在代码内层 catch 存在，只修 toast 不被覆盖），夜间轨可独立完成。
- 理由（本夜定向复核 `app.js:4951-4970`）：内层 `try/catch` 图片上传失败 `4962 showToast("图片上传失败，先保存文字")`，随后同一流转 `4964 await syncState()` + `4970 showToast(existingId ? "摘抄已更新" : "摘抄卡片已保存")` **无条件覆盖**失败提示；`showToast` 单例替换、`syncState` 通常 <2.2s 生命周期，用户最终只见「摘抄卡片已保存」而新卡 `imageUrl` 恒 `""`（`4928`；编辑分支 `4955-4959` 未执行），照片被静默丢弃、无残留提示。设计意图（catch 内想告知「图没存上、先存文字」）被随后的成功 toast 吞掉，属实现遗漏而非设计取舍；与 OPT-179（409 冲突误报）机制不同（上传失败非冲突），不重复。
- 关键文件：`app.js:4961-4970`；`tests/frontend/`（图片上传失败 toast 回归）。signal/Theme：Theme 3「积累可信」采集主路径（拍照摘抄）上的静默信息失真——照片是本 app 的采集本体，误报成功直接削弱可信度；northstar 中强。
- 验收：前端回归断言图片上传失败时最终可见 toast 含「图片上传失败」语义（或改为「摘抄已保存（图片上传失败，可编辑补图）」），用户可感知照片未存；图片上传成功路径 toast 不受影响。

**OPT-181 升级注记（不再夜间续指）：** 09-04 triage 指派、09-05 triage 续指并立规则「若再空转一夜应升级给 07:00 晨间查因」。截至本夜 git 全量 refs 复核，09-05 夜 implement **仍未产生任何实现 commit**（`git log --all` 自 09-04 无 OPT-181/会话过期/401 改动）。已连空转三夜 → 本夜升级给 07:00 晨间查因（查为何 09-04/09-05 指派未落盘：是 implement 未接单、scope 卡壳还是阻塞待判），**不改** `status` 为 done、**不**本夜第 3 次指派。

**本夜候选取舍（OPT-182，**不**指派）：** P1/S 但涉「上翻 vs 自动跟随」的 UX 取舍边界（09-05 已如此判定），且 OPT-181 空转说明「指派 ≠ 必落盘」；OPT-182 本身正确性判断清晰，但为避免再次出现「指派后空转」与 UX 边界不清，留 07:00 晨间候选卡，紧接 OPT-181 晨间处置后由 owner/晨间轨定夺。

**夜间适配否决（其余未完成项，2026-09-06 复评）：**
- OPT-177（P1/M）：deleteQuote/deleteSession 失败不回滚。M 级，涉删除失败回滚的数据安全语义与联带清理范围 → 留晨间候选卡。
- OPT-178（P1/L）：服务端 OCR 写路径绕过乐观锁整表写 state。L 级，后端并发写架构取舍 → 留功能轨。
- OPT-179（P1/M）：state_conflict 时摘抄/书/记录仍播报成功。M 级，需统一多路调用方（含 E326 scope note 补充的 `saveBookEdit`/`deleteBook`）→ 留晨间候选卡。
- OPT-180（P1/M）：`/api/chat/stream` 长 LLM 流式期间持整份 state 快照、结束后整表盲写回。与 OPT-178 同族，M 级后端并发写架构取舍 → 留功能轨，与 OPT-178 一并收口。
- P3 parked/blocked 13 项（OPT-032/035/036/044/046/048/050/051/081/089/117/124/144）维持不变，见未完成项重评。

**预算状态（2026-09-06）：** 外层一次性统计最近 7 天 `auto/` PR 数为 **1**，上限 **8**，剩余 7 个预算位，未达上限（证据可用，非 UNKNOWN）。本夜指派 OPT-183（1 个 auto PR 预算位，1→2），不调用 `gh` 或 GitHub API。

**本次对账（2026-09-06）：**
- **新增 done 0 项**：上次 triage（09-05）以来 git 全量提交中唯一功能 commit 为 `a8dfc05`「fix(app): 摘抄标签推荐按书过滤 + 新增自定义标签管理删除入口」——rg 定向核对 backlog 无对应 OPT（owner 直接改进，非 OPT，同 `da4bbff` kimi 修复先例），无需对账。窗口内无已合并 feature/agent PR 可对账。
- **新增 backlog 项 1 条（09-05 explore E340 提拔，上次 triage 后到达）**：OPT-183（addQuote 图片上传失败 toast 覆盖）——已纳入本夜判定并**指派**。
- **续查**：OPT-181 09-04/09-05 已指派但无实现 commit（git 全量 refs 复核，09-05 夜仍无）→ 升级 07:00 晨间查因，本夜不续指。
- **当前 Theme 复评（2026-09-06，Theme 3「积累可信」8/10–9/06 期末）**：新见 OPT-183 落在采集主路径静默信息失真（误报「已保存」+ 照片丢失），northstar 中强、与 Theme 3 直接对齐；北极星最近实测 8/30 = 8 / 24 / 30，不改变既有 P1 M/L 取舍。

**未完成项逐项重评（维持 parked/blocked）：** P3/S 为 OPT-032、035、036、044、046、048、050、051、089、124、144；P3/M 为 OPT-081；P3/L blocked 为 OPT-117。以上 13 项均缺当前 Theme / 真实 signal 的合理北极星贡献，维持 parked/blocked，不因预算尚有空间而填充指派。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-175 | 注销账号用原生 `window.prompt` 二次确认，iOS Safari 不支持 → iPhone 上永远无法注销 | **P1** | S | **done** | ✅ PR #138 / `6874095` 已合入 [2026-09-01]；`showConfirmDialog` 加可选 `inputConfig` 文本输入槽，`deleteAccount` 弃用 `window.prompt`，前端回归断言不再用 prompt 且输入值透传 `onConfirm` |
| OPT-176 | 关联目标摘抄检索被单本书挤占，跨书匹配无法浮现 | **P1** | M | **done** | ✅ PR #139 / `633a3a0` 已合入 [2026-09-03]；`filteredQuotes()` 按 `bookId` 分组书间轮流各取一条，命中多书时每本匹配书都会浮现 |
| OPT-177 | deleteQuote/deleteSession 失败不回滚，与 deleteConnection 语义不一致 | **P1** | M | **triaged** | 🔜 晨间候选 [2026-09-01]：M 级且涉删除失败回滚数据安全语义；不合夜间 S 边界，留 07:00 候选卡 |
| OPT-179 | 摘抄/书/记录保存与删除在 state_conflict 时仍播报成功，本地编辑被覆盖且无提示 | **P1** | M | **triaged** | 🔜 晨间候选 [2026-09-02]：M 级，属 Theme 3 误报成功缺口，有 OPT-169 关联先例；不合夜间 S 边界，留 07:00 候选卡 |
| OPT-178 | 服务端 OCR 写路径绕过乐观锁整表写 state，与用户并发编辑静默互踩 | **P1** | L | **triaged** | 🔜 晨间/功能轨 [2026-09-02]：L 级需拆分（局部字段只写 / 冲突让出 / 版本比对），后端并发写架构取舍；不合夜间 S 边界，留功能轨 |
| OPT-180 | 探讨 /api/chat/stream 长 LLM 流式期间持整份 state 快照，结束后无条件整表写回，静默覆盖并发编辑 | **P1** | M | **triaged** | 🆕 [2026-09-04]：E329 提拔 new→triaged。与 OPT-178 同族的另一条整表盲写路径（`app_server.py:6076,6123,6217,986-995`）；M 级后端并发写架构取舍 → 不合夜间 S 边界，留功能轨，与 OPT-178 一并收口 |
| OPT-181 | 会话过期 401 只清 token 不清 UI，真实私有数据停在「已同步」假象上静默脱同步 | **P1** | S | **triaged** | 🔜 曾指派夜间 [09-04→09-05 续指]，09-05 夜仍无实现 commit → **2026-09-06 升级 07:00 晨间查因**，不再夜间第 3 次指派 |
| OPT-182 | chat 流式逐 token 无条件 `scrollToBottom()`，击溃上翻阅读与「回到底部」逃生口 | **P1** | S | **triaged** | 🆕 [2026-09-05]：E336 提拔 new→triaged，S 级候补夜间；涉「上翻 vs 自动跟随」UX 取舍 → 留 07:00 晨间候选卡，不指派 |
| OPT-183 | addQuote 图片上传失败提示被成功 toast 覆盖，用户对照片未保存毫不知情 | P2 | S | **assigned** | 🆕 [2026-09-06]：E340 09-05 提拔，本夜指派夜间：S 级纯正确性缺口，采集主路径 toast 真话性（`app.js:4961-4970`）；夜间适配：是 |
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

OPT-176（PR #139 / 633a3a0，[2026-09-03]）、OPT-174、OPT-173、OPT-172、OPT-170、OPT-169、OPT-168、OPT-165、OPT-166、OPT-164、OPT-162、OPT-163、OPT-161、OPT-160、OPT-159、OPT-158、OPT-157、OPT-147、OPT-142、OPT-156、OPT-155、OPT-152、OPT-154、OPT-153、OPT-151、OPT-150、OPT-148、OPT-149、OPT-067、OPT-125、OPT-141、OPT-138、OPT-143、OPT-136、OPT-120、OPT-102、OPT-135、OPT-137、OPT-139、OPT-140、OPT-133、OPT-038、OPT-134、OPT-072、OPT-131、OPT-132、OPT-129、OPT-130、OPT-126、OPT-077、OPT-127、OPT-094、OPT-123、OPT-128、OPT-070、OPT-071、OPT-109、OPT-095、OPT-073、OPT-121、OPT-122、OPT-093、OPT-082、OPT-060 已完成。

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
