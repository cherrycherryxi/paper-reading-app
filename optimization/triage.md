# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-17

## Next up

**本周实现预算已满（近 7 天已有 4 个 auto/ PR，上限 4），本次不指派。**

预算状态：近 7 天 auto/ PR 共 **4 个**（PR #70 auto/opt-115-116 2026-07-16、PR #69 auto/opt-113-114 2026-07-16、PR #67 auto/opt-100-103-110 2026-07-14、PR #61 auto/opt-065 2026-07-11），已达上限 4，**不指派**。预算窗口最早于 2026-07-18（PR #61 滑出窗口）解冻。

**状态更新（本次 triage）**：
- OPT-115（PR #70）、OPT-116（PR #70）merged 2026-07-16，in-progress → done。
- OPT-118/doubanComment（PR #71）merged 2026-07-17，new → done。
- OPT-119（PR #72）merged 2026-07-17，new → done。
- OPT-118/shelf-OCR（PR #73）already done（2026-07-17，见前次 triage）。
- OPT-120：new → triaged（P2, M）。真机实测（2026-07-17）后端 OCR 成功但 iOS 切屏断连导致结果丢失，owner 真实摩擦点。
- 信号 2026-07-16「记录页面几乎不用，倾向以摘抄流替代」：大方向架构信号，不产生单次可落地小项，暂不出 OPT。

**若预算解冻，下一指派候选：OPT-053 + OPT-112（合并一 PR）**

OPT-053（Session 统计条默认显示，`app.js:1415-1425`，3 行）+ OPT-112（renderTimeline haystack 加 `s.date`，`app.js:1515`，1 行）：两项同区域同文件，合并 S 级 PR；均直接贡献北极星「回顾·检索操作次数」，与 Theme 2 强对齐；零后端/schema/API 变更；可在 PR #61（2026-07-11）滑出窗口后由 Agent2 优先执行。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-118 | 拍书架照片批量识别书名一键建库——新用户 onboarding「即时兑现」钩子（替代 OPT-117） | P1 | M | **done** | ✅ PR #73 已合入 feature/agent [2026-07-17]。 ✅ **可行性已验证 2026-07-17**：owner 真实书架 3 张照片实测 kimi-k2.5，识别 57 本、书名准确率 ~90%+（门槛 60%），20-28s/张，图片需 2000px（现默认 1200 不足）。复用 `runBookOcr` + `call_kimi_vision` 扩成多本+勾选确认。**实测三个待处理问题**：副标题被拆成独立一本（提示词需禁止拆分）、平放/遮挡书会幻觉且 confidence 不可靠（勾选确认为必需项）、少量遗漏。**不适合夜间 agent**（新 UI+提示词调优），留白天功能轨。 |
| OPT-117 | 豆瓣 ID 一键生成阅读偏好画像——新用户 onboarding「即时兑现」钩子 | ~~P1~~ **P3** | L | **blocked** | ❌ 2026-07-17 调研否决，降级搁置。①服务端代抓：实测 2.5s 间隔连抓 4 次即全部 403、封禁 >3.5 分钟（豆瓣按 IP 风控），多用户并发会长期封服务器 IP 并连带 prod——频控无法解决，架构不成立。②豆瓣官方「个人信息下载」：确实存在但**仅 App 内入口 + 承诺 15 个工作日 + 未列明数据项与格式**，无法做 onboarding。③bookmarklet：技术可行但手机端无法操作（小红书流量 95% 手机），目标不匹配。真问题改由 OPT-118 承接。解冻条件：豆瓣开放官方 API/同步导出。 |
| OPT-105 | 豆瓣阅读记录一键导入（读完日期 / 评分 / 读后感） | P1 | M | **done** | ✅ 2026-07-15（commit b978f9f）; W29 焦点。4× signal boost（2026-06-26 读完日期、2026-07-06 评分、2026-07-06 AI 读后感、2026-07-10 显式请求）。 |
| OPT-113 | PromptBuilder.all_books_summary 缺 rating/finishedAt，AI 无法回答跨书评分/读完时间查询 | P2 | S | **done** | ✅ PR #69（与 OPT-114 合并一 PR）已合入 feature/agent [2026-07-16]。 |
| OPT-114 | compareBooksForList() 二级排序键为 createdAt——豆瓣导入后「已读完」组时序语义错乱 | P2 | S | **done** | ✅ PR #69（与 OPT-113 合并一 PR）已合入 feature/agent [2026-07-16]。 |
| OPT-104 | 分享卡片 canvas 硬编码亮色调色板，深色模式下输出白底卡片体验割裂 | P2 | S | **done** | ✅ PR #68（2026-07-16 merged）；SHARE_CARD_DARK 调色板 + matchMedia 选色。 |
| OPT-106 | deleteQuote() 确认弹窗不提及将级联删除关联，getConnectionCount() 已存在可直接复用 | P2 | S | **done** | ✅ PR #68（2026-07-16 merged）；**signal 2026-07-10** 佐证（E169 提拔）。 |
| OPT-100 | Excel 导入「喜欢程度」列仍写入 notes 文本而非 book.rating——OPT-099 遗漏路径 | P2 | S | **done** | PR #67（2026-07-14 merged）。与 OPT-103+OPT-110 合并一 PR。 |
| OPT-110 | Excel 导入模板无「读后感」列，importExcel() 不写 book.review——OPT-100 对称遗漏 | P2 | S | **done** | PR #67（2026-07-14 merged）。 |
| OPT-103 | MCP summary() 写入 book.notes 而非 book.review，OPT-098 上线后两条 AI 路径语义分裂 | P2 | S | **done** | PR #67（2026-07-14 merged）。 |
| OPT-115 | buildBookSearchCard() 不展示 book.rating——评分字段在最高频入口完全不可见 | P2 | S | **done** | ✅ PR #70（与 OPT-116 合并一 PR）已合入 feature/agent [2026-07-16]。 |
| OPT-116 | matchBooks() 不含 book.doubanComment——OPT-105 豆瓣短评对搜索不可见 | P2 | S | **done** | ✅ PR #70（与 OPT-115 合并一 PR）已合入 feature/agent [2026-07-16]。 |
| OPT-118(a) | all_books_summary 缺 doubanComment——AI 跨书查询不可见豆瓣短评 | P2 | S | **done** | ✅ PR #71 已合入 feature/agent [2026-07-17]。 |
| OPT-119 | buildBookSearchCard() 已读完书籍展示进度文字而非 finishedAt——读完日期不可见 | P2 | S | **done** | ✅ PR #72 已合入 feature/agent [2026-07-17]。 |
| OPT-120 | 长耗时 OCR 结果服务端留存 + 断线自动取回——手机切走就白等 20s 并浪费 LLM 调用 | P2 | M | triaged | Theme 1「采集顺滑」；真机实测后端 OCR 成功但 iOS 断连丢结果；requestId+落库+visibilitychange 取回方案，改动量 M；不适合 agent（涉及新端点+schema）。 |
| OPT-053 | Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 | P2 | S | triaged | northstar「中」；roadmap §2 可观测代理指标；`app.js:1415-1425`，3 行改动，无 HTML/CSS/后端变动。注：OPT-082 与本项完全重复，OPT-082 不另行指派。 |
| OPT-112 | renderTimeline() 搜索 haystack 不含 s.date，用户无法按时间段（"6月"/"2026-07"）搜索阅读动态 | P2 | S | triaged | Theme 2「检索」延伸；`app.js:1515`（renderTimeline haystack 加 s.date），约 1-2 行；与 OPT-053 同区域，可合并一 PR；signal 2026-07-03「按主题找书」搜索诉求的动态页对称缺口。 |
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
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | triaged | **与 OPT-053 完全重复**（`app.js:1419`），OPT-053 实现后自动解决，不另行指派。 |
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
