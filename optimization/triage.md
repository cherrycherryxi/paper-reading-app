# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-07-05

## Next up

**OPT-064 — PromptBuilder 发送摘抄完整对象含 ocrText，每次对话浪费数百至数万 token**

实现预算检查：近 7 天 `auto/` PR 共 **1 个**（#54 OPT-059，2026-07-03），距上限 4 还余 **3 个槽位**，可以指派。

选择理由：
1. **roadmap §2 W28 明确「OPT-064 交还夜间轨」**——白天 focus 是录入修复包（OPT-058+061+066+090+084+091）与 Theme 2 检索修通（OPT-092+083+056+088），均为「白天 bundle 项」，OPT-064 被 owner 专程指定给夜间 agent 处理，不占白天时间。
2. **高频路径、直接成本**——`build_chat_prompt()` 每次对话必经；10 条摘抄场景下 `ocrText`（每页 500–2000 字符）+ `imageUrl`/`ocrStatus`/`ocrSource`/`ocrError` 等冗余字段最多浪费 ~20,000 tokens/次；2026-07-05 北极星记录显示本周新增摘抄 28 条、探讨操作 47 次，冗余 token 已是实质性支出。
3. **P1/S，纯后端，零 DB/API 变更**——`app_server.py:2312-2345`（`build_chat_prompt`）加白名单 dict comprehension，过滤 `ocrText/imageUrl/ocrStatus/ocrSource/ocrError/ocrUpdatedAt/ocrRequestedAt`；约 8 行修改，无前端改动，不与白天 app.js bundle 冲突。
4. northstar「中」（token 节省 = API 成本直接降低，同类已落地 OPT-020/047）；昨日已为 Next up 但未被实施，今日继续指派。

关键文件：`app_server.py:2312-2345`（`build_chat_prompt`，quotes 注入段落）；可加回归断言：mock 摘抄对象含 ocrText，断言 system prompt 中不含 ocrText 字段内容。
roadmap 依据：roadmap.md §2 W28「OPT-064 交还夜间轨」。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-064 | PromptBuilder 发送摘抄完整对象含 ocrText，每次对话浪费数百至数万 token | P1 | S | in-progress (PR #55) | roadmap §2 W28「交还夜间轨」；signal 2026-07-05 北极星记录本周摘抄 28 条/探讨 47 次，ocrText 冗余已是实质支出；OPT-020/047 同类 token 裁剪；`app_server.py:2312-2345`（`build_chat_prompt`）白名单 dict comprehension 过滤 ocrText/imageUrl/ocrStatus/ocrSource/ocrError/ocrUpdatedAt/ocrRequestedAt；零 API/DB 变更。 |
| OPT-061 | Session 对话框 showModal() 后无 focus()，移动端须额外点击才能开始输入 | P1 | S | triaged | roadmap W28 录入修复包 item；signal 2026-06-26 佐证；Theme 1「采集顺滑」每日触点。`app.js:2142`（editSession）和 `app.js:2262`（openNewSessionForBook）末尾各追加 `requestAnimationFrame(() => document.querySelector('#sessionDialog [name="startPage"]')?.focus())`。白天 bundle 项。 |
| OPT-058 | 摘抄对话框 showModal() 后未 focus() 文本区，移动端每次多点击一次 | P1 | S | triaged | roadmap W28 录入修复包 item；Theme 1「采集顺滑」核心录入路径。`app.js:2248`（openNewQuoteForBook）和 `app.js:2283`（editQuote）各加 `requestAnimationFrame(() => document.getElementById("quoteContent")?.focus())`。白天 bundle 项。 |
| OPT-066 | 编辑 Session 未同步书籍进度字段（currentPage/lastReadAt/updatedAt） | P1 | S | triaged | roadmap W28 录入修复包 item；signal 2026-06-26 佐证；`app.js:2029-2037` 的 `if(existingId)` 分支只更新 session 本体，未重算书籍进度；对比新建分支（`app.js:2046-2055`）完整同步。约 5 行补全。白天 bundle 项。 |
| OPT-090 | editSession() 日期预填用 toISOString() 而非 isoToDateInput()，编辑路径存在与 OPT-059 对称的时区 bug | P1 | S | triaged | NEW（explore E145，2026-07-03）；roadmap W28 录入修复包 item；OPT-059 的编辑路径对称 bug；`editSession()` 中日期预填直接用 `value.split("T")[0]`，UTC+8 凌晨跨天时显示错误；改用已有的 `isoToDateInput()` helper（`app.js:60-63`）。白天 bundle 项。Touch: `app.js` editSession 日期 input。 |
| OPT-091 | renderTimeline() 用 localeCompare 排序 session，OPT-037 的书单修复未覆盖 Timeline | P1 | S | triaged | NEW（explore E146，2026-07-03）；OPT-037 同类遗漏（书单修复未同步 Timeline）；`renderTimeline()` 中 session 排序仍用字符串 localeCompare，agent/OCR 创建的 session 在东八区比手动创建的 UTC 字面大 ~8h，恒排前；改 `Date.parse()` 数值比较（降序 b-a）。Touch: `app.js:1400-1430`（renderTimeline 排序段）。白天 bundle 项。 |
| OPT-092 | matchBooks() 忽略 book.tags / book.notes，书单按主题/标签搜索零结果 | P1 | S | triaged | NEW（explore E150，2026-07-04）；**signal 2026-07-03** 直接佐证（为读书会找书，书单搜「成长」零结果）；roadmap W28 Theme 2「检索修通」第一 PR 显式命名；`app.js:1160-1163` 追加 `(book.tags||[]).some(t => fuzzyMatch(t,query)) \|\| fuzzyMatch(book.notes||"",query)`；2–3 行，纯前端，零后端变更。白天 bundle 项（与 OPT-083/056/088 合并一 PR）。 |
| OPT-083 | renderQuotes() 搜索 haystack 不含 ocrText：OCR 未编辑摘抄完全不可搜 | P1 | S | triaged | explore E136 2026-07-01；**强北极星** Theme 2「回顾有价值」；OCR 摘抄 content="" ocrText=全文，显示正常但搜索完全命中不了，积累越多回顾越失准。`app.js:1498` haystack 追加 `item.ocrText||""`；`app.js:1143` matchQuotes 改 `quote.content||quote.ocrText||""`；2 行，零副作用。W28 Theme 2 bundle 项。 |
| OPT-080 | 关联对话框目标摘抄标签截断至 32 字 + CSS 双重省略导致同书摘抄无法辨识 | P1 | S | triaged | **signal 2026-06-29** 直接佐证「目标显示不完整、看不清内容、找不到想关联的那一条」；Theme 2「建立关联」核心路径；`app.js:3815` slice(0,32)→slice(0,60) + 去掉 `nowrap`，S 级修复；建议与 OPT-079 合并一 PR。 |
| OPT-079 | 摘抄卡 ⋯ 菜单增加「建立关联」直达入口；来源自动预填当前摘抄 | P1 | S | triaged | **signal 2026-06-29** 佐证「来源没自动填入当前摘抄（还得手动选）」；Theme 2；`app.js:1528-1535` 菜单加 `connect` 选项 + `quoteMenuHandler` 新增分支调用 `openConnectionDialog({sourceType:"quote",sourceId:quote.id})`；建议与 OPT-080 合并一 PR 作关联体验系统修复。 |
| OPT-088 | renderConnections getBookTitle 仅返回书名，按摘抄内容搜索关联完全命中不了 | P1 | S | triaged | explore 2026-07-03；**signal 2026-06-29** 佐证；Theme 2「回顾有价值」；`app.js:847-860` `getBookTitle(type,id)` quote 分支追加 `(q?.content||q?.ocrText||"").slice(0,60)`，约 3 行，零后端影响；与 OPT-060 解决同一根问题（OPT-088 从源函数侧改更彻底），OPT-060 可随后作冗余确认。W28 Theme 2 bundle 项。 |
| OPT-085 | 书封面上传未压缩（单张可达 4.6MB），拖慢移动端书单加载 | P1 | M | triaged | **signal 2026-07-02** owner 手机亲测「封面不显示 + 刷新巨卡」；**强北极星**；前端 canvas 限宽（≤1600px）+ JPEG q≈0.8 重编码，无新依赖；`uploadBookCoverImage()`（`app.js:~2146`）。 |
| OPT-078 | 自定义摘抄标签仅存 localStorage，跨设备/跨网址不同步，导出包中不存在 | P1 | M | triaged | **signal 2026-06-29** owner 换网址后标签丢失直接痛点；northstar「中」；Theme 2「按主题检索」基础。`app.js:480-484`（getCustomQuoteTags/saveCustomQuoteTags）改双写 state；`app_server.py:633-667`（sanitize_state）加 `customQuoteTags` 字段。M 复杂度（前后端双改）。 |
| OPT-065 | reading_mcp_server._save_state() 跳过 sanitize_state()，MCP 写路径无状态校验 | P1 | S | triaged | northstar「中」；data safety；MCP 写路径是 Claude Desktop 主入口；`reading_mcp_server.py:70-75`（`_save_state` 函数）调用前加 `state = sanitize_state(state)`，直接 `from app_server import sanitize_state`（`__main__` 守卫无循环 import 风险）。 |
| OPT-084 | openNewSessionForBook() 从不预填 startPage，每次录入需手动输入已知起始页 | P2 | S | triaged | explore E137 2026-07-01；中北极星 Theme 1；session 录入是 W28 焦点路径，startPage 预填 = book.currentPage+1 减少每次录入 1–2 次交互；`app.js:2436` value="" → `(book.currentPage>0?book.currentPage+1:"")`；建议与同路径 bundle 搭车。 |
| OPT-053 | Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 | P2 | S | triaged | northstar「中」；roadmap §2 可观测代理指标；signal 2026-06-26 佐证可观测性价值。`app.js:1415-1425`：无搜索时全量计算并常驻显示，有搜索时展示过滤子集。3 行改动，无 HTML/CSS/后端变动。注：OPT-082 与本项完全重复，OPT-082 不另行指派。 |
| OPT-082 | renderTimeline() sessionStats 仅在搜索时显示，默认视图无累计阅读数据 | P2 | S | triaged | **与 OPT-053 完全重复**（同一代码问题 `app.js:1419` `if (searchRaw && sessions.length)`，方案完全一致）；OPT-053 实现后自动解决，**不另行指派**。 |
| OPT-093 | deleteSession() 不回写 book.currentPage / book.lastReadAt，删除记录后进度数据残留 | P2 | S | triaged | NEW（explore E147，2026-07-04）；northstar 弱-中；OPT-084（startPage 预填）依赖 currentPage 准确性，deleteSession 残留会导致预填错误；`app.js:2583-2598`（deleteSession）增加剩余 session 扫描后回写 currentPage/lastReadAt；约 10–15 行，纯前端；建议与 OPT-084 搭车同一 PR。 |
| OPT-070 | buildQuoteSearchCard() OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 | P2 | S | triaged | OPT-052 视觉闭环；northstar「中」，Theme 2 搜索一致性。`app.js:1199-1201`（`buildQuoteSearchCard`）封面区域改为与 `renderQuotes`（`app.js:1455`）相同的条件渲染（`quote.imageUrl ? <img> : fallback`）；可与 OPT-071 合并一 PR。 |
| OPT-071 | 摘抄卡片与详情弹窗图片缺少 onerror 回退：URL 失效时显示浏览器破图图标 | P2 | S | triaged | OPT-052 遗漏错误处理；northstar「中」，Theme 1 视觉可靠性。`app.js:1455`（卡面 `<img>`）+ `app.js:2246`（`openQuoteDetail` img.src）各加 onerror 回退至灰色占位，复用 `bindBookCoverImageFallback`（`app.js:229-250`）模式；可与 OPT-070 合并。 |
| OPT-072 | 搜索输入框无防抖，每次按键触发全量 DOM 重建 | P2 | S | triaged | northstar「中」，Theme 1「零等太久放弃」；摘抄积累 100+ 条后按键卡顿是直接违背 Theme 1 验收的体验悬崖。`app.js:4175-4176`（quoteSearch/sessionSearch）和 `app.js:3956`（connectionSearch）各加内联 `debounce(fn, 250)` 包裹；5 行改动。 |
| OPT-073 | 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 | P2 | S | triaged | northstar「中」，Theme 2 核心动作；OPT-069（后端重试）之后若重试耗尽，前端依然无 UI 级恢复。`chat.js:702-719` rate_limited/else 分支追加 `appendRetryButton()`（提取自 `chat.js:724-744`）。 |
| OPT-056 | 摘抄搜索不包含「我的理解」reflection 字段 | P2 | S | triaged | northstar「中」，Theme 2「回顾有价值」直接让 reflection 可检索。`app.js:1411-1416` haystack 数组末尾追加 `item.reflection || ""`；1 行改动，零后端变更。W28 Theme 2 bundle 项。 |
| OPT-057 | 「动态」Tab 时间线硬限 10 条，积累后无法看到更多历史 | P2 | S | triaged | northstar「中」，Theme 2；与 OPT-076 同类，建议合并一 PR 处理（OPT-076 是 M 复杂度的完整方案）。 |
| OPT-038 | 注册/ensure_user_state now_iso() → utc_now_iso() | P2 | S | triaged | `app_server.py:676`（ensure_user_state INSERT）、`app_server.py:4057, 4061`（register handler created_at + terms_accepted_at + user_state INSERT）→ 各换 `utc_now_iso()`。OPT-014 UTC 系列最后一块；northstar「中」。 |
| OPT-067 | contextFromHistoryKey() 缺少 quote: 前缀处理，前后端逻辑不对称 | P2 | S | triaged | northstar「弱→中」；`app.js:274-279`（contextFromHistoryKey）处理 `book:` 但 `quote:` fallthrough 错误解析为 bookId；后端 `app_server.py:617-625` 正确处理。1 行修复。 |
| OPT-050 | deleteQuote() 漏清理 chatHistories/chatContexts（孤儿 state） | P2 | S | triaged | northstar「弱」；`app.js:2316-2332`：syncState() 前加 2 行，复用 deleteBook()（`app.js:2088-2101`）模式。 |
| OPT-060 | 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 | P2 | S | triaged | northstar「中」，Theme 2；`app.js:740-756` haystack 对 quote 类型 side 追加 `state.quotes.find()` 的 `.content`，约 6 行改动，零后端变更。**注：OPT-088 从上游函数 `getBookTitle` 侧修复同一问题，更彻底；若 OPT-088 先落，本项可降 P3 或合并 PR**。 |
| OPT-077 | renderTimeline() 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 | P2 | S | triaged | OPT-074 数据已到位，展示层闭环；northstar「中」，Theme 2「回顾有价值」。从 `state.books` 提取有 `startedAt`/`finishedAt` 的里程碑事件与 sessions 合并排序，专属卡片模板（📖/✅）；Touch: `app.js:1400-1430`（`renderTimeline`）+ `styles.css`（少量新增）；S 复杂度（纯前端，无后端/DB 变更）。 |
| OPT-076 | renderTimeline() 硬上限 10 条且无告知，阅读历史超 10 次后早期记录不可见 | P2 | M | triaged | northstar「中」，Theme 2「回顾有价值」；`app.js:1337`：`allSorted.slice(0, 10)` 硬截断，无分页/load-more；方案：`displayLimit` 模块变量 + 「加载更多（共 N 条）」按钮；可与 OPT-057 合并一 PR。 |
| OPT-089 | clearSampleData 不清理 chatHistories/chatContexts，孤儿聊天历史随 syncState 写回 | P2 | S | triaged | 2026-07-03；northstar「弱-中」；onboarding「示例→清除→空白起步」是新用户留存路径；`app.js:clearSampleData` 遍历示例书/摘抄 id 逐一 delete chatHistories/chatContexts；补 `tests/frontend/sample-onboarding.test.js` 断言。Touch: `app.js:1729-1744`。 |
| OPT-081 | Organize/Candidates 批量采集激活，前端实现沉睡，无 HTML/调用者/后端端点 | P2 | M | triaged | northstar「中/强(如激活)」，Theme 1「采集顺滑」文字粘贴路径；无 signal 佐证；需 `<dialog id="organizeDialog/candidatesDialog">` + `POST /api/organize/parse` + JS 入口三层补全；M 复杂度，预算充裕周再排期。`app.js:2808-2914`（已有实现代码）；`index.html`（补 HTML）；`app_server.py`（新端点）。 |
| OPT-087 | 摘抄/书/思想碰撞「一键生成分享图」(内容卡自传播增长引擎) | P2 | L | triaged | northstar「强」；owner 2026-07-02 为线下读书会主动提出；获客侧价值高，但 L 复杂度（html2canvas/无头浏览器/多模板），需单独立项；定位 B 正式确认后提 P1。 |
| OPT-051 | 添加 Web App Manifest，支持 Android/Chrome PWA 安装 | P3 | S | triaged | P3 parked（定位 A 下唯一用户不用 Android；升级到 B 当周再做即可）。 |
| OPT-048 | #chatMessages 缺少 role="log" live region（WCAG 4.1.3 AA） | P3 | S | triaged | P3 parked（定位 A 唯一用户=owner 本人，屏幕阅读器 a11y 对单人无直接价值；留待定位升级到 B/C 再批量重启 a11y 系列）。 |
| OPT-046 | Tab 导航缺少 ARIA role/aria-selected（WCAG 4.1.2 Level A） | P3 | S | triaged | P3 parked（与 OPT-048 同逻辑；定位 A 唯一用户=owner 本人）。 |
| OPT-036 | summarize_metrics() 全量历史扫描 → 90 天窗口 | P3 | S | triaged | P3 parked（debug 看板是运营工具，不影响阅读主流程，对北极星无直接贡献）。 |
| OPT-032 | _run_gc() 缺少 WAL checkpoint，WAL 文件持续膨胀 | P3 | S | triaged | P3 parked（磁盘卫生，无直接北极星贡献；预算富余周再做）。 |
| OPT-035 | TraceManager 三处 now_iso() → utc_now_iso() | P3 | S | triaged | P3 parked（纯内部观测时间戳，用户不可见，无北极星贡献）。 |
| OPT-044 | payments 表时间戳 UTC 修复 | P3 | S | triaged | P3 parked（billing 已按 roadmap §1 冻结，财务表时间戳无用户价值，直至项目定位升级到 C）。 |
| OPT-059 | Session 日期预填 UTC 日期，UTC+8 凌晨记录日期差一天 | P1 | S | done (PR #54, 2026-07-04) | `todayLocalDateInput()` helper（Intl sv locale 本地 YYYY-MM-DD）+ date input `max=今天` + `addSession()` 未来日期提交拦截；回归测试 `tests/frontend/session-date-prefill.test.js` 3 例。注意：编辑路径的对称 bug 是 OPT-090（已另立项 W28 bundle）。 |
| OPT-075 | saveBookEdit() 设「已读完」不写 finishedAt（OPT-074 上线后视觉空洞） | P1 | S | done (addressed by OPT-074, 2026-06-28) | OPT-074 实现（`app.js:2592-2600`）已包含此修复：`if (book.status === "finished" && !book.finishedAt)` 自动填充 `finishedAt`；不需单独实现。 |
| OPT-086 | 前端静态资源 no-store，每次刷新重下 ~330KB JS/CSS/HTML | P1 | M | done (commit 239e6e9, 2026-07-02 — 直接合入 feature/agent) | `app_server.py` `_STATIC` 改 `max-age=31536000,immutable`；index.html 里 app.js/chat.js/styles.css 引用加自动版本串；owner 直接提交，不计 auto/ 预算。 |
| OPT-074 | 书籍 startedAt/finishedAt 已自动填充但从未 UI 展示 | P1 | S | done (PR #53, 2026-06-27) | northstar「强」；signal 2026-06-26 直接点名；书籍详情/编辑弹窗展示+编辑日期，含「读完不早于开始」校验；`tests/frontend/book-reading-dates.test.js` 12 passed。 |
| OPT-068 | 导入减量守卫未覆盖 chatHistories，旧备份可静默清空聊天记录 | P1 | S | done (PR #51 merged 2026-06-27) | northstar「中」，Theme 1「零丢失」+ Theme 2「回顾有价值」前提数据；stateContentCount 补 Object.keys(chatHistories) 计数；4 行，零后端变更。 |
| OPT-069 | call_deepseek_stream() 无重试：主聊天路径遇瞬断即报错 | P1 | S | done (PR #50 merged 2026-06-25) | northstar「强」；`app_server.py:3222-3265`：urlopen() 放入 for attempt 循环；tests/agent/deepseek_retry_test.py 新增。 |
| OPT-062 | 确认对话框 Escape 关闭后监听器残留，可触发错误删除 | P1 | S | done (PR #49 merged 2026-06-24) | northstar「中」，Theme 1「零丢失」；showConfirmDialog 加 cancel 事件清理；与 OPT-063 同 PR。 |
| OPT-063 | compress_chat_history API 失败时写入截断历史，永久丢失旧聊天记录 | P1 | S | done (PR #49 merged 2026-06-24) | northstar「中」，data safety；save_state 移入 try 块（压缩成功才持久化），约 4 行重排；与 OPT-062 同 PR。 |
| OPT-047 | PromptBuilder all_books_summary 无数量上限 | P1 | S | done (PR #45 merged 2026-06-24) | `app_server.py:2326-2329`：全量书单无 LIMIT → 按 `updatedAt` 倒序取 `[:50]`；roadmap §2 明确首推，northstar「强」。 |
| OPT-055 | 快速 OCR 行级删除 UI | P1 | M | done (PR #46 merged 2026-06-24) | signal 2026-06-16；northstar「强」，Theme 1 直接摩擦。 |
| OPT-054 | 「↓ 最新」按钮改浮动叠加，不占布局行 | P1 | S | done (PR #47 merged 2026-06-24) | signal 2026-06-16；northstar「中」，Theme 1 辅助。 |
| OPT-052 | 摘抄卡面缺少图片缩略图——拍照 OCR 成卡后无视觉区分度 | P1 | S | done (PR #48 merged 2026-06-24) | northstar「强」，Theme 1；signal 2026-06-16。 |
| OPT-049 | 书详情弹窗 UX 三连修（滚动复位/锁横滑/摘抄·笔记区分） | P1 | S | done (PR #44, 2026-06-14) | signal 2026-06-13 (×3)：owner 真机反馈详情页滚动停中段/可左右滑/「相关摘抄」含笔记不区分。 |
| OPT-045 | Session/Connection CRUD 前端测试覆盖 | P2 | M | done (PR #43, 2026-06-13) | 新增 `tests/frontend/session-crud.test.js` + `tests/frontend/connection-crud.test.js`，17 条测试；159/159 全绿。 |
| OPT-043 | 导入前 N→M 对比 + 减少时高危确认 | P1 | S | done (PR #39, 2026-06-12) | signal 2026-06-11：owner 误导入旧备份致 3 张卡丢失。 |
| OPT-037 | compareBooksForList() localeCompare → Date.parse | P1 | S | done (PR #42, 2026-06-13) | OPT-014 遗漏执行点，书单首屏排序修复；142/142 测试绿。 |
| OPT-001 | Excel 批量加书入口挪至书单页 | P1 | S | done (PR #40/#41, 2026-06-12) | signal 2026-06-12：owner 明确「这是我最想做的」。 |
| OPT-042 | 快速 OCR 孤儿 pending 卡 | P1 | S | done (PR #38, 2026-06-11) | Fix A：同步 OCR 路径仅在完成后保存一次；Fix B：loadSession 时 `recoverStalePendingOcr()` 把超龄 pending 卡翻成 failed。 |
| OPT-041 | 导入成功结果弹窗（带数量） | P1 | S | done (PR #37, 2026-06-11) | 新增 `<dialog id="importResultDialog">` 显示书/摘抄/记录/关联各类数量。 |
| OPT-040 | GDPR 导出格式自适应 + 清空护栏 | P1 | M | done (PR #36, 2026-06-11) | `importData()` 检测 `exportFormat/.state` 自动解包；内容为 0 且当前账号非空时二次确认。 |
| OPT-039 | 连接泄漏：pre-auth/debug 端点未入安全网 | P1 | M | done (PR #35, 2026-06-11) | 新增 `_open_conn()` helper 统一登记 `self._active_conn`，7 处裸 `get_conn()` 改走它。 |
| OPT-034 | debug 看板存储型 XSS（f-string 直插用户内容） | P1 | S | done (PR #33, 2026-06-10) | `import html` + `html.escape()` 包裹 /debug/logs、/debug/agent-dashboard 所有用户可控插值点。 |
| OPT-033 | `<dialog>` 元素缺少 aria-labelledby（WCAG 4.1.2 Level A） | P1 | S | done (PR #34, 2026-06-11) | 12 个 dialog 各加 `id` 给 `<h2>` + `aria-labelledby` 给 `<dialog>`。 |
| OPT-031 | reading_mcp_server _now_iso() naive 本地时间排序 bug | P1 | S | done (PR #32, 2026-06-09) | `reading_mcp_server.py:50-51`：UTC+Z 修复。 |
| OPT-030 | 跨设备 state 整体覆盖（乐观锁 Layer B） | P1 | M | done (PR #29, 2026-06-08) | `updated_at` 版本号 + `PUT /api/state` 条件保存 + 409 冲突 toast。 |
| OPT-029 | execute_action() 非原子读改写 | P1 | M | done (PR #27, 2026-06-08) | `BEGIN IMMEDIATE` 包裹读改写周期，防止双标签页静默丢数据。 |
| OPT-028 | /debug/* 端点默认对所有人开放 | P0 | S | done (PR #26, 2026-06-08) | `_authorized_for_admin()` 未设 ADMIN_TOKEN 时改为仅允许 loopback。 |
| OPT-025 | agent_trace_events 缺 trace_id 索引 | P1 | S | done (PR #30, 2026-06-08) | `app_server.py:509` 追加 `CREATE INDEX IF NOT EXISTS idx_trace_events_trace`。 |
| OPT-022 | 登录/注册端点无限速 | P1 | M | done (PR #28, 2026-06-08) | IP 维度限速，login/register/password/reset-request 三端点。 |
| OPT-027 | 卡片操作入口三页不统一 | P2 | M | done (PR #31, 2026-06-08) | 三卡统一 `⋯` 菜单 + 新建 sessionDetailDialog + 统一 `dialog-actions-stack` 层级。 |
| OPT-026 | 书单卡片 ··· 按钮可见性 | P2 | S | done (2026-06-08, OPT-027 同批) | `.card-menu-btn` → 半透明圆底+边框+阴影+`:focus-visible`，glyph 换 `⋯`。 |
| OPT-024 | ActionExecutor datetime 排序 bug | P1 | S | done (PR #25, 2026-06-07) | 7× `datetime.now().isoformat()` → `utc_now_iso()` in `app_server.py:2971-3074`。 |
| OPT-023 | /media/ CORS 通配符 | P0 | S | done (PR #24, 2026-06-06) | `app_server.py:3509` 删 1 行 + `media_cors_test.py` 5 例守卫。 |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done (PR #21, 2026-06-04) | ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`。 |
| OPT-020 | PromptBuilder 注入无关 existing_connections | P1 | S | done (PR #22, 2026-06-05) | `[] if book_id else …[:20]`，~150 tokens/req 节省。 |
| OPT-019 | Toast 缺少 aria-live（WCAG 4.1.3 AA） | P1 | S | done (PR #23, 2026-06-05) | `#toast` 加 `role="status" aria-atomic="true"`。 |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion（WCAG 2.2.2 A） | P1 | S | done (PR #23, 2026-06-05) | `@media (prefers-reduced-motion: reduce)` 全局禁用动画。 |
| OPT-017 | model_logs/agent_traces 缺 user_id 索引 | P1 | S | done (PR #19, 2026-06-04) | 三条 `CREATE INDEX IF NOT EXISTS`。 |
| OPT-016 | 非 AI 摘抄 OCR 快路径（百度云 OCR） | P1 | L | done (2026-06-08, owner 真机验证) | 云 OCR → Tesseract → AI 三层回退，21 测试全绿。 |
| OPT-015 | 摘抄卡面 UI 优化 | P2 | M | done (PR #16, 2026-06-03) | 摘抄文字可读性与层次提升。 |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done (commit e9bdba9) | 后端 OCR 卡 `createdAt` 改用 UTC+Z；前端排序改 epoch 数值比较。 |
| OPT-013 | 按钮缺 :focus-visible（WCAG 2.4.7 AA） | P1 | S | done (PR #23, 2026-06-05) | `button:focus-visible` 全局 outline 规则。 |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done (PR #18, 2026-06-04) | 指数退避重试最多 2 次，可重试码 429/500/502/503。 |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done (PR #20, 2026-06-04) | `_send_security_headers()` 发 X-Frame-Options/X-Content-Type-Options/Referrer-Policy。 |
| OPT-010 | GC 函数从未调用 | P1 | S | done (PR #13, 2026-06-03) | `_run_gc()` 守护线程每 6 小时运行四个 GC 方法。 |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done (PR #12, 2026-06-02) | `MAX_REQUEST_BYTES = 20MB` + 413 提前返回。 |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done (PR #11, 2026-06-01) | 损坏行 `continue` 跳过，防止 /debug/* 全量 500。 |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done (PR #10, 2026-05-31) | magic bytes 替换。 |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done (PR #9, 2026-05-30) | per-request token/latency + 汇总面板。 |
| OPT-004 | 桌面端基础适配 | P2 | L | done (commit b5bebb1) | 480px 居中列 + 抽屉右侧 slide-in。 |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done (commit 8874de3) | clamp/vw 响应式 + 三档断点。 |
| OPT-002 | 「书单」加书支持拍照 OCR | P1 | M | done (PR #17, 2026-06-03) | Kimi vision → 结构化字段预填表单。 |

## Legend

- priority: P0 (do first) / P1 / P2 / P3 (parked — no northstar contribution)
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
