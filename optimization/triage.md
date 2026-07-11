# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-11

## Next up

**OPT-065** — `reading_mcp_server._save_state()` 跳过 `sanitize_state()`，MCP 写路径无状态校验

**预算状态**：近 7 天 `auto/` PR 共 **3 个**（#55 OPT-064，2026-07-05；#59 录入修复包，2026-07-07；#60 检索修通 bundle，2026-07-08），PR #54（OPT-059，2026-07-03）已超出 7 天窗口脱落，预算剩余 **1 槽**，本次可指派。

**指派理由**：OPT-065 是上次 triage 明确预约的「预算开槽首选」，P1/S/data safety；`reading_mcp_server.py:70-75`（`_save_state` 函数）在 `json.loads` 反序列化 + `json.dumps` 写盘周期中跳过了 `sanitize_state(state)` 校验，任何 MCP 工具写入的 state 可携带脏字段（缺少 `books`/`quotes`/`sessions`/`connections` 某 key，或带非法类型）直接落盘，与 `PUT /api/state` 路径（走 `sanitize_state`）形成安全不对称。修复仅需在 `_save_state` 内写盘前加一行 `state = sanitize_state(state)` + `from app_server import sanitize_state`（无循环 import 风险：`app_server.py` 在 `if __name__ == "__main__"` 块内启动，不会反向 import `reading_mcp_server`）。约 1–2 行，零用户界面变动，零 API/DB 变更。

**关键文件**：`reading_mcp_server.py:70-75`（`_save_state` 函数）；`app_server.py`（`sanitize_state`，已存在）。

**北极星对齐**：northstar「中」——data safety 是「零丢失」承诺的前提，MCP 是 Claude Desktop 主入口，任何写路径的 state 污染都威胁该承诺的可靠性基础。

> 新信号（2026-07-11）：① owner 提出「搜索快速清除筛选按钮」（书单/摘抄/关联搜索框内加 ✕ 一键清空，不用逐字删）——尚无对应 OPT，请 Agent3 下次 explore 时评估提拔。② owner 提出「AI 读后感字数限制适配分享图」——与 signal 2026-07-06 AI 读后感呼应，尚无对应 OPT，请 Agent3 评估。③ 登录墙产品决策（未登录示例 demo vs 硬登录墙）——排查结论为非安全漏洞、是产品决策，请 owner 拍板后再立 OPT。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-065 | reading_mcp_server._save_state() 跳过 sanitize_state()，MCP 写路径无状态校验 | P1 | S | in-progress | PR #61 (auto/opt-065-mcp-sanitize-state)；363 Python tests pass，0 JS failures。 |
| OPT-105 | 豆瓣阅读记录一键导入（读完日期 / 评分 / 读后感） | P1 | M | triaged | NEW（explore E173，2026-07-10）；**4 × signal boost**（2026-06-26 读完日期、2026-07-06 评分、2026-07-06 AI 读后感、2026-07-10 显式请求豆瓣导入）；OPT-074/099/098 字段层已完成，本项打通数据入口；Theme B0「对外可用」对齐；`app.js`（新增 `importFromDouban` ~80-100 行）+ `index.html`（导入按钮 + file input）；零后端/DB 变更；M 复杂度，下一预算槽首选。 |
| OPT-100 | Excel 导入「喜欢程度」列仍写入 notes 文本而非 book.rating——OPT-099 遗漏路径 | P2 | S | triaged | **signal 2026-07-06** 直接驱动（OPT-099 信号下的遗漏导入路径）；`app.js:4092-4113`（importFromExcel 书籍对象构建段）约 3 行改动，纯前端，零后端/DB 变更。 |
| OPT-101 | generateBookReview() 未存 AI 来源标记，信号明确要求的「AI 根据笔记整理」标注缺失 | P2 | S | triaged | **signal 2026-07-06**「展示时明确标注『AI 根据笔记整理』」；OPT-098 已上线但缺来源区分；约 15–20 行前端，零后端/DB 变更；Touch: index.html（addBook/editBook）；app.js（generateBookReview, addBook, saveBookEdit, 详情页展示）。 |
| OPT-103 | MCP summary() 写入 book.notes 而非 book.review，OPT-098 上线后两条 AI 路径语义分裂 | P2 | S | triaged | **signal 2026-07-06** 佐证（AI 读后感诉求的 MCP 侧闭环缺口）；`reading_mcp_server.py:323` 改 `book["notes"]` → `book["review"]`，1 行，零 API/schema 变更；与 OPT-101 是同一 signal 的两面，可合并一 PR。 |
| OPT-053 | Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 | P2 | S | triaged | northstar「中」；roadmap §2 可观测代理指标；`app.js:1415-1425`：无搜索时全量计算并常驻显示，有搜索时展示过滤子集。3 行改动，无 HTML/CSS/后端变动。注：OPT-082 与本项完全重复，OPT-082 不另行指派。 |
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | triaged | **与 OPT-053 完全重复**（同一代码问题 `app.js:1419`），OPT-053 实现后自动解决，**不另行指派**。 |
| OPT-093 | deleteSession() 不回写 book.currentPage / book.lastReadAt，删除记录后进度数据残留 | P2 | S | triaged | NEW（explore E147，2026-07-04）；northstar 弱-中；OPT-084（startPage 预填）依赖 currentPage 准确性；`app.js:2583-2598`（deleteSession）增加剩余 session 扫描后回写 currentPage/lastReadAt；约 10–15 行，纯前端。 |
| OPT-094 | addSession() pagesRead 计算差一，统计数据永远少计一页 | P2 | S | triaged | NEW（explore E148，2026-07-05）；northstar 弱（数据准确性）；三处均漏 `+1`：`app.js:2311`（addSession）、`app.js:2318`（editSession）、`app.js:1456`（统计栏汇总）；纯前端 3 行，无 DB/后端变更。 |
| OPT-095 | 新建摘抄对话框页码字段从不预填 book.currentPage | P2 | S | triaged | NEW（explore E155，2026-07-05）；northstar 弱-中，Theme 1 小摩擦消除；`app.js:2520`（openNewQuoteForBook）将 `value=""` 改为读取 `state.books.find(b=>b.id===bookId)?.currentPage`；2–3 行，纯前端。 |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | triaged | northstar「中」，Theme 1「零等太久放弃」；摘抄积累 100+ 条后按键卡顿是直接违背 Theme 1 验收的体验悬崖。`app.js:4175-4176`（quoteSearch/sessionSearch）和 `app.js:3956`（connectionSearch）各加内联 `debounce(fn, 250)` 包裹；5 行改动。 |
| OPT-070 | buildQuoteSearchCard() OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 | P2 | S | triaged | OPT-052 视觉闭环；northstar「中」，Theme 2 搜索一致性。`app.js:1199-1201`（`buildQuoteSearchCard`）封面区域改为与 `renderQuotes`（`app.js:1455`）相同的条件渲染；可与 OPT-071 合并一 PR。 |
| OPT-071 | 摘抄卡片与详情弹窗图片缺少 onerror 回退：URL 失效时显示浏览器破图图标 | P2 | S | triaged | OPT-052 遗漏错误处理；northstar「中」，Theme 1 视觉可靠性。`app.js:1455`（卡面 `<img>`）+ `app.js:2246`（`openQuoteDetail` img.src）各加 onerror 回退；可与 OPT-070 合并。 |
| OPT-073 | 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 | P2 | S | triaged | northstar「中」，Theme 2 核心动作；OPT-069（后端重试）之后若重试耗尽，前端依然无 UI 级恢复。`chat.js:702-719` rate_limited/else 分支追加 `appendRetryButton()`（提取自 `chat.js:724-744`）。 |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | northstar「弱」；`app.js:2316-2332`：syncState() 前加 2 行，复用 deleteBook()（`app.js:2088-2101`）模式。 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | northstar「弱→中」；`app.js:274-279`（contextFromHistoryKey）处理 `book:` 但 `quote:` fallthrough 错误解析为 bookId；后端 `app_server.py:617-625` 正确处理。1 行修复。 |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts，孤儿聊天历史随 syncState 写回 | P2 | S | triaged | northstar「弱-中」；onboarding「示例→清除→空白起步」是新用户留存路径；`app.js:1729-1744`：遍历示例书/摘抄 id 逐一 delete chatHistories/chatContexts；补 `tests/frontend/sample-onboarding.test.js` 断言。 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | `app_server.py:676`（ensure_user_state INSERT）、`app_server.py:4057, 4061`（register handler created_at + terms_accepted_at）→ 各换 `utc_now_iso()`。OPT-014 UTC 系列最后一块；northstar「中」。 |
| OPT-104 | 分享卡片 canvas 硬编码亮色调色板，深色模式下输出白底卡片体验割裂 | P2 | S | triaged | NEW（explore E170，2026-07-09）；northstar「中」；OPT-021 CSS 深色模式已全覆盖 UI，canvas 是唯一遗漏；OPT-087 刚上线分享功能，补暗色路径是完整度收尾；`app.js:2599-2606` 新增 `SHARE_CARD_DARK` 常量 + 三个 `renderXShareCard` 函数顶部各加 1 行 `matchMedia` 判断，约 5 行。 |
| OPT-106 | deleteQuote() 确认弹窗不提及将级联删除关联，getConnectionCount() 已存在可直接复用 | P2 | S | triaged | NEW（explore E169，2026-07-10）；northstar「中」——关联是 Theme 2 核心数据；`app.js:3194` 加 `const connCount = getConnectionCount(quoteId)` + message 拼接，3–4 行；建议与 E168（deleteBook 级联）合并「破坏性操作透明度」PR。 |
| OPT-057 | 「动态」Tab 时间线硬限 10 条，积累后无法看到更多历史 | P2 | S | triaged | northstar「中」，Theme 2；与 OPT-076 同类，建议合并一 PR 处理（OPT-076 是 M 复杂度的完整方案）。 |
| OPT-076 | renderTimeline() 硬上限 10 条且无告知，阅读历史超 10 次后早期记录不可见 | P2 | M | triaged | northstar「中」，Theme 2「回顾有价值」；`app.js:1337`：`allSorted.slice(0, 10)` 硬截断，无分页/load-more；方案：`displayLimit` 模块变量 + 「加载更多（共 N 条）」按钮；可与 OPT-057 合并一 PR。 |
| OPT-077 | renderTimeline() 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 | P2 | M | triaged | OPT-074 数据已到位，展示层闭环；northstar「中」，Theme 2「回顾有价值」。从 `state.books` 提取有 `startedAt`/`finishedAt` 的里程碑事件与 sessions 合并排序，专属卡片模板（📖/✅）；Touch: `app.js:1321-1399` + `styles.css`（少量新增）。 |
| OPT-081 | Organize/Candidates 批量采集激活，前端实现沉睡，无 HTML/调用者/后端端点 | P2 | M | triaged | northstar「中/强(如激活)」，Theme 1「采集顺滑」文字粘贴路径；无 signal 佐证；需 `<dialog id="organizeDialog/candidatesDialog">` + `POST /api/organize/parse` + JS 入口三层补全；M 复杂度，预算充裕周再排期。 |
| OPT-102 | 快速识别改二进制上传（去掉 base64 33% 膨胀），进一步缩短 OCR 上传耗时 | P2 | M | triaged | NEW（2026-07-09）；Theme 1「采集顺滑」；base64→multipart/binary 节省 33% 上行流量；Touch: `app_server.py`（OCR 端点 body 解析）、`app.js`（toBlob 上传路径）；M 复杂度，保留旧 dataURL 分支兼容。 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P3 | S | triaged | P3 parked：**OPT-088（PR #60，2026-07-10 合并）已从上游函数 `getBookTitle` 侧修复同一问题，覆盖更彻底**；本项已被 OPT-088 完全覆盖，降 P3 归档，不另行指派。 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android；升级到 B 当周再做即可）。 |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（定位 A 唯一用户=owner 本人，屏幕阅读器 a11y 对单人无直接价值；留待定位升级到 B/C 再批量重启 a11y 系列）。 |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P3 | S | triaged | P3 parked（与 OPT-048 同逻辑；定位 A 唯一用户=owner 本人）。 |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献）。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做）。 |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献）。 |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，财务表时间戳无用户价值，直至项目定位升级到 C）。 |

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
