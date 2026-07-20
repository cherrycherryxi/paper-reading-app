# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-20

## Next up

**预算状态（2026-07-20 本次 triage）：** 近 7 天 auto/ PR 共 **6 个**（PR #78 auto/opt-109 2026-07-19、PR #77 auto/opt-122 2026-07-19、PR #76 auto/opt-121 2026-07-19、PR #70 auto/opt-115-116 2026-07-16、PR #69 auto/opt-113-114 2026-07-16、PR #67 auto/opt-100-103-110 2026-07-14），上限 **8**，剩余 **2 个额度**，可指派。

**状态更新（本次 triage）**：
- OPT-109（PR #78）merged 2026-07-20，in-progress → done。roadmap W30 事项 1「先合 OPT-109」已达成。
- OPT-073（PR #79）merged 2026-07-20，triaged → done。
- OPT-095（PR #80）merged 2026-07-20，triaged → done。
- OPT-125：new → triaged（P2, S）。deleteBook() 确认弹窗缺级联数量；三个辅助函数已就位，~2-3 行变更。
- OPT-126：new → triaged（P2, S）。runShelfOcr() 缺 try/finally 加载态管理；runOcr() 模式现成可复用，~6-8 行。

---

**指派：OPT-077（renderTimeline() 书籍里程碑——startedAt/finishedAt 事件）**

**理由（2-3 行）：** roadmap.md §2 W30 短期节明确写道「焦点 OPT-077 时间线里程碑(夜间轨)」，是本周对夜间 agent 的唯一显式指派。OPT-109 已在今晨合入（roadmap W30 事项 1 达成），豆瓣导入的 110 本 finishedAt 数据已到位（OPT-074 + OPT-105），唯独时间线（回顾主界面）不显示这些里程碑，导致「回顾」这一环仍是空的。北极星第三数「回顾操作 29/周」是目前唯一正增长方向，OPT-077 直接在时间线中注入可视化里程碑，让每次翻阅历程图都带来回顾价值。**Signal 佐证**：signals.md 2026-06-26「希望每本书有「开始阅读 / 读完」日期字段」；signals.md 2026-07-16「记录页面几乎不用 → 要么自动推算、要么砍掉记录页面」——时间线里程碑是「从书籍数据自动浮现阅读足迹」方向的第一步。

**关键文件：**
- `app.js:1321-1399`（renderTimeline：现有 session 渲染循环，插入 startedAt/finishedAt 里程碑卡）
- `styles.css`（里程碑卡样式，建议使用 `var(--color-*)` token 暗色模式兼容）
- OPT-074 数据来源：`app.js` book 对象 `startedAt`/`finishedAt` 字段（已由 OPT-074 PR #53 写入）

**Roadmap 对齐：** Theme 2「回顾有价值」；W30 夜间轨显式焦点；pure frontend + styles.css，零 schema/API 变更，M 复杂度，roadmap 评估「夜间轨可独立完成」。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-077 | renderTimeline() 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 | **P1** | M | triaged | W30 夜间轨显式焦点（roadmap §2）；signal 2026-06-26 + 2026-07-16；Theme 2「回顾有价值」；`app.js:1321-1399` + `styles.css` |
| OPT-070 | buildQuoteSearchCard() OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 | P2 | S | triaged | Theme 2 搜索视觉；`app.js:1519`（entry-card-cover 未填图）；可与 OPT-071 合并 PR |
| OPT-071 | 摘抄卡片与详情弹窗图片缺少 onerror 回退：URL 失效时显示浏览器破图图标 | P2 | S | triaged | OPT-052 遗漏错误处理；可与 OPT-070 合并；`app.js` 摘抄卡面+详情 img |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | triaged | northstar 中；Theme 1/2 可用性；摘抄 100+ 条后按键卡顿；`app.js` 搜索事件，5 行 debounce(250ms) |
| OPT-123 | deleteSession() 删除记录后不重算 book.currentPage；新记录起始页自动填充显示过期值 | P2 | S | triaged | Theme 1 收尾；与 OPT-093 为同一缺陷，以本项为准（`app.js:3489`）；约 4-6 行 |
| OPT-094 | addSession() pagesRead 计算差一，统计数据永远少计一页 | P2 | S | triaged | 数据准确性；`app.js:2311`（addSession）+ `2318`（editSession）+ `1456`（统计汇总），3 行 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | 乐观锁版本字段污染可致跨设备丢数据；`app_server.py:676, 4057, 4061` |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | `app.js:2316-2332`，2 行，复用 deleteBook() 模式 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | `app.js:274-279`，1 行修复；quote: fallthrough 错误解析为 bookId |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts | P2 | S | triaged | onboarding「示例→清除→空白起步」路径；`app.js:1729-1744` |
| OPT-125 | deleteBook() 确认弹窗仅显示书名，不显示将被删除的记录/摘抄/关联数量 | P2 | S | triaged | 破坏性操作透明度（OPT-043/106 系列延续）；三辅助函数已就位，~2-3 行；`app.js:2723-2730` |
| OPT-126 | runShelfOcr() 缺少 try/finally 加载态管理：20s 等待无 spinner、按钮可重复点击 | P2 | S | triaged | Theme 1 收尾；OPT-118 上线遗漏；runOcr() 模式现成；`app.js:4568-4612` |
| OPT-120 | 长耗时 OCR 结果服务端留存 + 断线自动取回——手机切走就白等 20s 并浪费 LLM 调用 | P2 | M | triaged | Theme 1；真机实测后端成功但 iOS 断连丢结果；requestId+落库+visibilitychange 方案；改动 M，不适合 agent（新端点+schema 变更） |
| OPT-102 | 快速识别改二进制上传（去掉 base64 33% 膨胀），进一步缩短 OCR 上传耗时 | P2 | M | triaged | Theme 1；`app_server.py`（OCR 端点 body 解析）+ `app.js`（toBlob 上传路径）；保留旧 dataURL 分支兼容 |
| OPT-109 | 跨页 OCR：runOcrFromImage() 仅支持单图，拍两页无法拼成同一摘抄 | P2 | M | **done** | ✅ PR #78 已合入 feature/agent [2026-07-20] |
| OPT-095 | 新建摘抄对话框页码字段从不预填 book.currentPage | P2 | S | **done** | ✅ PR #80 已合入 feature/agent [2026-07-20] |
| OPT-073 | 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 | P2 | S | **done** | ✅ PR #79 已合入 feature/agent [2026-07-20] |
| OPT-121 | all_books_summary 缺 book.review——用户手写读后感对跨书 AI 查询不可见 | P2 | S | **done** | ✅ PR #76 已合入 feature/agent [2026-07-19] |
| OPT-122 | addSession() startedAt 追溯守卫错误——补录更早历史 session 时开始日期无法更新 | P2 | S | **done** | ✅ PR #77 已合入 feature/agent [2026-07-19] |
| OPT-093 | deleteSession() 不回写 book.currentPage / book.lastReadAt，删除记录后进度数据残留 | P2 | S | triaged | **与 OPT-123 完全重复**（OPT-123 含更新行号），按 OPT-123 实现即自动覆盖，不另行指派 |
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | **done** | **与 OPT-053 完全重复**（OPT-053 PR #74 2026-07-18 已实现），不另行指派 |
| OPT-124 | _run_gc() 不包含 model_logs 等五张观测表；LLM 全文 blob 无限累积 | P3 | S | triaged | P3 parked（与 OPT-032 同类：磁盘卫生、长期问题、无直接北极星贡献；预算富余周再做）|
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
