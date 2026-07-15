# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-14

## Next up

**OPT-100 + OPT-103 + OPT-110 — Excel/MCP 导入字段完整度补全（合并一 PR）**

预算状态：近 7 天 auto/ PR 共 **3 个**（PR #59 auto/opt-058-061-066-090-084-091-entry-bundle 2026-07-07、PR #60 auto/opt-092-search-field-bundle 2026-07-08、PR #61 auto/opt-065-mcp-sanitize-state 2026-07-11），上限 4，**本次可指派（3 < 4）**。

> 注：上次 triage（2026-07-13）将 PR #55（auto/opt-064，创建于 2026-07-05）误计入 7 天窗口（窗口实为 2026-07-06 起），实际当时也是 3 个；今日从 2026-07-07 起算，结论相同——预算可用。

**状态更新（本次 triage）**：
- OPT-101（PR #66）、OPT-107（PR #63）、OPT-108（PR #64）、OPT-111（PR #65）均 merged 2026-07-14，已在 backlog.md 标 done，从待办表移出。
- OPT-112（renderTimeline 搜索不含 s.date）：new → triaged（P2, S），加入待办表。

**选题理由：**
三项均为 **S 级**，合并一 PR 约 7 行代码，零后端/DB schema 变更，零文件冲突（与 owner 亲自实现的 OPT-105 豆瓣导入无交集）：

- **OPT-100**（`app.js:4092-4113`）：Excel 导入「喜欢程度」列改写入 `book.rating` 独立字段而非混入 notes 文本，直接由 **signal 2026-07-06**「喜欢程度混进内容简介」驱动；约 3 行。
- **OPT-110**（`app.js:4083` + `4130-4153`）：Excel 模板补「读后感」列 + importExcel() 写入 `book.review`，是 OPT-100 的对称续集；与 OPT-105 豆瓣 CSV 导入并行，完成「评分+读后感」在两条 Excel/CSV 入口的对称落地；约 3 行。
- **OPT-103**（`reading_mcp_server.py:323`）：MCP `summary()` 写入字段由 `book.notes` 改 `book.review`，闭合 OPT-098 AI 读后感的 MCP 侧遗漏；signal 2026-07-06「AI 把书的笔记整理成读后感」佐证；1 行。

三项合并一 PR，共同收尾同一 signal cluster（2026-07-06 评分/读后感/导入），让 Theme 2「回顾有价值」的书籍字段从 Excel、豆瓣 CSV、MCP 三个入口同步正确写入，配合正在进行的 OPT-105。

**关键文件：** `app.js`（importFromExcel 的 rating/review 字段赋值与模板 headers），`reading_mcp_server.py:323`（summary action 字段名）

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-105 | 豆瓣阅读记录一键导入（读完日期 / 评分 / 读后感） | P1 | M | **done** | ✅ 2026-07-15 完成(commit b978f9f); 曾为 W29 焦点。4× signal boost（2026-06-26 读完日期、2026-07-06 评分、2026-07-06 AI 读后感、2026-07-10 显式请求）；OPT-074/099/098 字段层已完成，本项打通数据入口，为 Theme 2「回顾有价值」补存量。 |
| OPT-100 | Excel 导入「喜欢程度」列仍写入 notes 文本而非 book.rating——OPT-099 遗漏路径 | P2 | S | **in-progress** | PR #67（auto/opt-100-103-110-excel-mcp-field-fix，2026-07-14）。与 OPT-103+OPT-110 合并一 PR。 |
| OPT-110 | Excel 导入模板无「读后感」列，importExcel() 不写 book.review——OPT-100 对称遗漏 | P2 | S | **in-progress** | PR #67（同上）。 |
| OPT-103 | MCP summary() 写入 book.notes 而非 book.review，OPT-098 上线后两条 AI 路径语义分裂 | P2 | S | **in-progress** | PR #67（同上）。 |
| OPT-104 | 分享卡片 canvas 硬编码亮色调色板，深色模式下输出白底卡片体验割裂 | P2 | S | triaged | OPT-021（CSS 深色模式）+ OPT-087（分享卡）闭环唯一缺口；`app.js:2599-2606`，约 5 行；深色用户分享体验直接受损。 |
| OPT-106 | deleteQuote() 确认弹窗不提及将级联删除关联，getConnectionCount() 已存在可直接复用 | P2 | S | triaged | **signal 2026-07-10** 佐证（E169 提拔）；关联是 Theme 2 核心数据；`app.js:3194`，3-4 行；建议与 deleteBook 级联透明度合并一 PR。 |
| OPT-053 | Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 | P2 | S | triaged | northstar「中」；roadmap §2 可观测代理指标；`app.js:1415-1425`，3 行改动，无 HTML/CSS/后端变动。注：OPT-082 与本项完全重复，OPT-082 不另行指派。 |
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | triaged | **与 OPT-053 完全重复**（`app.js:1419`），OPT-053 实现后自动解决，不另行指派。 |
| OPT-112 | renderTimeline() 搜索 haystack 不含 s.date，用户无法按时间段（"6月"/"2026-07"）搜索阅读动态 | P2 | S | triaged | new→triaged（2026-07-14）；Theme 2「检索」延伸；`app.js`（renderTimeline 搜索 haystack 加 s.date），约 1-2 行；与 OPT-053 同区域，可合并一 PR；signal 2026-07-03「按主题找书」搜索诉求的动态页对称缺口。 |
| OPT-093 | deleteSession() 不回写 book.currentPage / book.lastReadAt，删除记录后进度数据残留 | P2 | S | triaged | northstar 弱-中；OPT-084（startPage 预填）依赖 currentPage 准确性；`app.js:2583-2598`，约 10-15 行，纯前端。 |
| OPT-094 | addSession() pagesRead 计算差一，统计数据永远少计一页 | P2 | S | triaged | northstar 弱（数据准确性）；`app.js:2311`（addSession）+ `app.js:2318`（editSession）+ `app.js:1456`（统计栏汇总）各漏 +1；纯前端 3 行。 |
| OPT-095 | 新建摘抄对话框页码字段从不预填 book.currentPage | P2 | S | triaged | northstar 弱-中，Theme 1 小摩擦消除；`app.js:2520`，2-3 行，纯前端。 |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | triaged | northstar「中」，Theme 1「零等太久放弃」；摘抄 100+ 条后按键卡顿；`app.js:4175-4176/3956` 各加内联 debounce(fn, 250)，5 行改动。 |
| OPT-070 | buildQuoteSearchCard() OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 | P2 | S | triaged | OPT-052 视觉闭环；northstar「中」，Theme 2 搜索一致性；`app.js:1199-1201`；可与 OPT-071 合并一 PR。 |
| OPT-071 | 摘抄卡片与详情弹窗图片缺少 onerror 回退：URL 失效时显示浏览器破图图标 | P2 | S | triaged | OPT-052 遗漏错误处理；northstar「中」；`app.js:1455`（卡面）+ `app.js:2246`（详情 img.src）各加 onerror 回退；可与 OPT-070 合并。 |
| OPT-073 | 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 | P2 | S | triaged | northstar「中」，Theme 2 核心动作；OPT-069（后端重试）之后前端依然无 UI 级恢复；`chat.js:702-719`。 |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | northstar「弱」；`app.js:2316-2332`，syncState() 前加 2 行，复用 deleteBook() 模式。 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | northstar「弱→中」；`app.js:274-279`，处理 book: 但 quote: fallthrough 错误解析为 bookId；1 行修复。 |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts，孤儿聊天历史随 syncState 写回 | P2 | S | triaged | northstar「弱-中」；onboarding「示例→清除→空白起步」是新用户留存路径；`app.js:1729-1744`。 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | northstar「中」；乐观锁版本字段污染可致跨设备丢数据；`app_server.py:676, 4057, 4061`。 |
| OPT-077 | renderTimeline() 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 | P2 | M | triaged | OPT-074 数据已到位，展示层闭环；northstar「中」，Theme 2「回顾有价值」；Touch: `app.js:1321-1399` + `styles.css`。 |
| OPT-102 | 快速识别改二进制上传（去掉 base64 33% 膨胀），进一步缩短 OCR 上传耗时 | P2 | M | triaged | Theme 1「采集顺滑」；Touch: `app_server.py`（OCR 端点 body 解析）+ `app.js`（toBlob 上传路径）；保留旧 dataURL 分支兼容。 |
| OPT-109 | 跨页 OCR：runOcrFromImage() 仅支持单图，拍两页无法拼成同一摘抄 | P2 | M | triaged | **signal 2026-07-03**「希望能拍 2 张照片一起 OCR，拼成同一条摘抄」；Theme 1「采集顺滑」；Phase 1 纯前端：file input 加 multiple、串行两次 OCR 拼接，约 30-40 行；Touch: `app.js:4229-4280`（runOcrFromImage）；northstar「中-高」。 |
| OPT-081 | Organize/Candidates 批量采集激活，前端实现沉睡，无 HTML/调用者/后端端点 | P3 | M | triaged | P3 parked（2026-07-13 PO 仪式）：零 signal 佐证；Theme 1「采集顺滑」已收尾；M 复杂度激活一条无人要求过的文字粘贴录入路径，对北极星无贡献。代码保留，出现真实 signal 再解冻。 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P3 | S | triaged | P3 parked：OPT-088（PR #60，2026-07-10 合并）已从上游函数侧完全覆盖，不另行指派。 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android；升级到 B 当周再做）。 |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（定位 A 唯一用户=owner 本人，屏幕阅读器 a11y 对单人无直接价值）。 |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P3 | S | triaged | P3 parked（与 OPT-048 同逻辑；定位 A 唯一用户=owner 本人）。 |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献）。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做）。 |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献）。 |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，直至项目定位升级到 C）。 |

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
