# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-08-05

## Next up

**本次不指派实现项。**

**预算状态（2026-08-05）：** 检查最近 50 个目标分支为 `feature/agent` 的 PR；近 7 天符合 nightly implementation 预算口径（head 以 `auto/` 开头，或正文含 `Nightly-Agent: implement`）的 PR 仍为 **2 个**，上限 **8**，剩余 **6 个**。预算未熔断，但 WIP=1 不等于必须制造工作。

**状态更新：**
- OPT-145 → done：PR #106（merge commit `997775706a360041230b26b1372955652177cda3`）已于 2026-08-05 合入；标签条现为「全部 + 高频标签 + 更多标签（N）」并提供可搜索面板、选中态与可访问性支持。
- OPT-146 → done：PR #107（merge commit `ce56b70e9cde29f0d1ca2563d7544ea9cce7cba2`）已于 2026-08-05 合入；书卡已下沉评分、记录、关联和标签到详情，卡面保留进度/读完日期与摘抄数摘要。

**为何不继续指派：** roadmap 的 2026-W32 唯一焦点 OPT-145 已完成，下一步明确是用约 50 个真实标签在 iPhone 12 真机走「发现更多入口 → 搜索标签 → 选中 → 清除」闭环并回收 signal。当前其余未完成项均为 P3 parked 或 blocked；在没有新 signal 前继续挑选会违反“North Star 税”和本周 WIP=1 纪律。OPT-146 虽原为 P3，但已由人工 PR 合入，按真实代码与 PR 证据记为完成，不据此顺延 OPT-147。

**下一次可指派条件：** 新增真机 signal，或周一仪式更新 roadmap 后，再从有明确用户任务失败证据、能在单 PR 内完成的条目中选择至多一个。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
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

OPT-067, OPT-125, OPT-141, OPT-138, OPT-143, OPT-136, OPT-120, OPT-102, OPT-135, OPT-137, OPT-139, OPT-140, OPT-133, OPT-038, OPT-134, OPT-072, OPT-131, OPT-132, OPT-129, OPT-130, OPT-126, OPT-077, OPT-127, OPT-094, OPT-123, OPT-128, OPT-070, OPT-071, OPT-109, OPT-095, OPT-073, OPT-121, OPT-122, OPT-093, OPT-082, OPT-060.

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no current northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done / blocked
