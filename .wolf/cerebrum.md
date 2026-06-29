# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-12

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- **[2026-06-10] 始终用中文回复。** 用户母语中文，已多次因为我切回英文而手动提醒。无论 PR 审核、技术分析还是任何场景，回复正文一律用中文（代码、命令、专有名词保持原文即可）。

## Key Learnings

- **Project:** paper-reading-app
- **Description:** 一个面向手机网页的纸质书阅读工具，当前优先适配 iPhone 12。

- **[2026-05-12] 静态文件由后端统一托管。** `log_server.py` 的 `do_GET` 顶部增加了静态文件路由，serve `index.html`、`app.js`、`chat.js`、`styles.css`。前端不再需要单独的 `python3 -m http.server 4173` 进程，只开 8787 一个端口即可。

- **[2026-06-29] 诊断「探讨/chat 失败或质量差」先查 `app_state.db` 的 `model_logs`（只读）。** 每次 chat 都写一行：`latency_ms`、`output_tokens`、`parse_status`、`error`、完整 `output`。区分失败原因的判据：① 有 `error` 行或 `agent_trace_events` 里有 `MODEL_ERROR` → 服务端异常；② `finish_reason!=stop` 会留 `STREAM_RETRY` 事件（content_filter 内容限制走这条）；③ 都没有、但 `latency` 很大 + `output_tokens` 极小 + `parse=DEGRADED` + output 截断在半句 JSON → 网络/上游流式卡死（客户端 30s idle abort，E24），**不是内容限制**。别凭主题敏感就臆断是审查。

- **[2026-06-29] `chat.js` 的 `renderMiniMarkdown` 有序列表坑：** 收集器只把『连续』的 `N. ` 行收进同一个 `<ol>`。LLM 列表项间几乎总有空行 → 每项被拆进独立 `<ol>`，而 `<ol>` 默认每段从 1 重数 → 显示成「1.1.1.」。修法是 `<li value="N">` 保留模型原始序号。改这个迷你 markdown 渲染器时，任何「按运行收集连续行」的块级元素都要想到空行会打断收集。

- **[2026-06-29] `state.quotes` 是混合集合：摘抄(kind=quote)、笔记(kind=note)、提问(kind=question) 全塞在一个数组里，靠 `kind` 字段区分。** 任何「遍历 state.quotes 取标签/统计」的逻辑都要先按 `kind` 过滤，否则会把笔记/提问的内容混进摘抄场景。另外 quote 的 `tags` 里既有用户手敲的，也有 AI OCR 自动生成的，无法从数据区分来源。教训：摘抄标签 picker 三次返工，根因就是从 state.quotes 反推「书用过的标签」——把 note 标签 + AI 自动标签全拖进来了。**「用户手动加的标签」= localStorage 的 `quote-custom-tags`（只在标签输入框按 Enter 写入），这是唯一可靠的「手敲」来源；不要用 used-tags 近似它。**

- **[2026-06-29] 摘抄标签 picker 最终形态：`[...new Set([...DEFAULT_QUOTE_TAGS, ...getCustomQuoteTags()])]`**，与当前选了哪本书无关。曾试图加 getUsedQuoteTags（先全局、后按书）均被用户否决（太多/太杂）。注意 `renderQuoteTagPicker` 在 `resetQuoteDraft`（form.reset 后 bookId 为空）和 Enter 重渲染（bookId 已定）两个时机被调，若 picker 依赖 bookId 会忽多忽少——所以 picker 内容必须与 bookId 无关。

- **[2026-06-29] 探讨发给模型的书单是后端从 state 组装的，不是前端传的。** `PromptBuilder.build_chat_prompt` 的 `all_books_summary`（≤50本，按 updatedAt 倒序）。book.status 取值：`finished`/`reading`/`wishlist`。要让模型按阅读状态筛选，必须把 status 放进 summary 且在 system instruction 里给规则——否则它在整个书单(含没读的 wishlist)上召回。

- **[2026-05-12] `backendBaseUrl` 改为空字符串。** 前端与后端同源后，所有 API 请求改用相对路径。`index.html` 里 `window.PAPER_READING_APP_CONFIG.backendBaseUrl` 设为 `""`。不需要再硬编码局域网 IP。

- **[2026-05-12] `guess_base_url()` 支持 HTTPS。** 增加读取 `X-Forwarded-Proto` header，确保通过 ngrok/Cloudflare Tunnel 等反向代理时媒体文件 URL 能正确生成 `https://` 前缀。

- **[2026-06-08] 卡片操作有统一范式（OPT-027）。** 书/记录/摘抄三种卡都用同一个 `⋯` 溢出菜单（`.card-menu-btn` + `.card-context-menu` + `.menu-item-danger`），共享 helper `closeAllCardMenus()`/`toggleCardMenu()`（app.js，匹配 `CARD_SELECTOR`）+ 一个文档级 click-outside 关闭。书卡用 createElement 走 per-card 绑定；记录卡同样 per-card 绑定；摘抄卡是 innerHTML 字符串走 `els.quotesList` 委托（`data-quote-menu`/`data-card-menu-toggle`）。**新增卡操作时改这三处 + 共享 helper，别再发明内联按钮。** 详情弹窗是"操作中心"：书/记录/摘抄都有 detail dialog，footer 统一 `dialog-actions dialog-actions-stack`（1 个 `button-primary`=去聊 + 若干 `button-ghost` + `button-danger`=删除 + `button-ghost`=关闭）。记录详情=`sessionDetailDialog`/`openSessionDetail()`。

## Key Learnings

- **[2026-06-11] OCR 草稿落库时机：同步快路径"一次性存最终态"，只有异步 AI 路径才预存 `pending`（OPT-042）。** `/api/quotes/ocr`（`app_server.py`）快/慢两路：**快速识别是同步的**——必须在 `run_fast_ocr` 完成后才 `save_state`（带 done/failed），**绝不能在 OCR 前先存 `pending` 草稿**，否则请求被打断（后端重启/断连）就遗留卡死在「识别中」的孤儿卡。**AI 路径是异步的**——必须先 `save_state(pending)` 再 `start_background_ocr`（前端要轮询、后台线程要 `load_state` 找到这张卡）。回收兜底在前端 `recoverStalePendingOcr()`（`loadSession` 时把超过 staleness 窗口的 `pending` 翻 `failed`，因为重启会杀掉所有 OCR 后台线程，挂太久的 pending 必死）。规则：给同步操作加"中途草稿"前先想清楚被打断会不会留垃圾——能一次性存终态就别预存中间态。

- **[2026-06-11] 数据导出有两种格式、导入是纯前端走 `PUT /api/state`（OPT-040）。** ①「导出书单备份」`exportData()`（app.js）客户端直接 dump `state`，字段在**顶层**；②「完整账号导出（GDPR）」`GET /api/account/export`（app_server.py）把 state 嵌在 `.state` 下并带 `exportFormat:1`（还含 modelLogs/traces/uploads 清单）。**没有也不需要 `POST /api/account/import`**——`importData()` 读文件→`normalizeStateShape`→`syncState()`→`PUT /api/state` 即恢复。改导入逻辑时：用 `resolveImportedState()` 统一解包两种格式（有 `.state`/`exportFormat` 就解包），且**导入是整体替换**（覆盖全账号），解析后内容为 0 而当前非空时必须经 `confirmDialog` 二次确认，别静默覆盖。explore.md 的 E10「无 import 端点/不可恢复」是**误判**，核代码后已重定性为 OPT-040（GDPR 文件导入会清空账号）。

- **[2026-06-11] 请求 handler 里开 DB 连接：不走 `_require_user()` 的路径必须用 `self._open_conn()` 而非裸 `get_conn()`（OPT-039 / explore E26；PR #35 的分支与代码注释因撞号仍写 OPT-037，以 E26 为准）。** 连接泄漏安全网在 `handle_one_request` 的 `finally`（关闭 `self._active_conn`），但它只兜底 `_open_conn()` 登记过的连接。`_require_user()` 内部已走 `_open_conn()`；admin `/debug/*` 与鉴权前端点（login/register/password reset）这类不经过 `_require_user` 的 handler 若用裸 `get_conn()`，body 在显式 `close()` 前抛异常就泄漏连接 + SQLite 共享锁，最终在无关请求上爆 `database is locked`。**新加这类 handler 时一律 `self._open_conn()`。** 已有少数自带 `try/finally` 的（`billing/webhook`、`_run_gc`、`_run_quote_ocr_job`、`init_db`）可不动。测试驱动真实请求要过 `handle_one_request`（不是直接 `do_GET`），finally 才会跑——见 `tests/agent/connection_leak_test.py`。

- **[2026-06-07] 一会话连开多个 PR 时，`.wolf/` bookkeeping 一律不进功能 PR 分支，session 末在 `feature/agent` 上单独一次性提交。** 原因：`buglog.json` 被 `.gitattributes` 故意排除在 `merge=union` 外（结构化 JSON，union 会破坏语法，靠 sync-knowledge.sh 的 jq 按 .id 去重），所以两个都改 buglog 的 PR 合并时必冲突（正是 [2026-06-04] Do-Not-Repeat 那条的同类）。做法：每个 PR 分支 `git add` 只点名 code+test 文件；若手滑把 .wolf 提交进去了，用 `git checkout feature/agent -- .wolf/<f>` 还原工作树版本再 `git commit --amend`（注意：`git rm --cached` 会把它变成"删除"提交，反而更糟，别用）。memory/cerebrum/anatomy 是 union 安全的，但为统一也一起留到末尾。

- **[2026-06-07] 整块 state 乐观锁用"原子条件 UPDATE + rowcount"，不要"读-比对-写 + BEGIN IMMEDIATE"。** `save_state_checked`（`app_server.py`）用 `UPDATE user_state SET … WHERE user_id=? AND updated_at=?` 单条语句，`cur.rowcount==0` 即版本不匹配→冲突。好处：单语句天然原子、无需显式事务，因此**永不与 ActionExecutor 的 `BEGIN IMMEDIATE`（OPT-029 Layer A）嵌套**（SQLite 不支持嵌套事务，嵌套会抛错）。版本令牌直接复用 `user_state.updated_at`（只写不被任何逻辑读，安全），并把 `save_state` 的写入从 `now_iso()`（秒、本地）改成 `utc_now_iso()`（毫秒、UTC-Z）让令牌跨快速保存唯一。客户端版本令牌的"中心捕获"放在 `apiFetch`（任何响应带 `stateVersion` 就存），只需后端各 state 响应都 emit，省去逐调用点接线；SSE 流绕过 apiFetch，靠 `paperReadingApp.setStateVersion` 在 done 事件里补。

- **[2026-06-07] `ensure_user_state()` 在插入新行时会 `conn.commit()`，所以要在 `BEGIN IMMEDIATE` 之前调用**（否则它的 commit 会提前结束你刚开的事务）。OPT-029 Layer A 包裹 `execute_action` 时即按此顺序：先 `ensure_user_state` → `BEGIN IMMEDIATE` → `load_state`（此时行已存在，内部 ensure 早退不再 commit）→ 改 → `save_state`（其自带 commit 收尾）。

- **[2026-06-07] 前端测试改造：`vm.runInNewContext(appSource + __testHooks块)`，并在 hooks 块前 `showToast = function(m){…}` 重赋值来捕获 toast。** app.js 的 `showToast`/各内部函数是函数声明（非 const），加载后可重赋值劫持。context 里 `fetch` 用可编程 stub 返回 `{ok,status,headers:{get},json}` 即可驱动 `apiFetch`/`syncState`。坑：`node --test` 的总结行是 `ℹ pass N` / `ℹ fail N`（unicode info 符），不是 `# pass`，聚合脚本别 grep `^# pass`。

- **[2026-06-07] 写并发/批量 add_book 测试会撞 free 计划 `book_cap=10`（`PLAN_LIMITS`），第 10 本起被 ActionExecutor 拒，误判成"丢数据"。** 多轮并发回归测试改用 `add_note`（写入 quotes，无 cap）。`ActionExecutor.add_book` 是 book cap 唯一强制点。

- **[2026-06-06] 本地 bookkeeping 改动未提交时不要急着同步分支；夜间 Agent1/Agent3 会重写 backlog/triage/explore + 占用 OPT 编号。** 合并 PR 后想 ff 本地 `feature/agent`，发现远端已被夜间 Agent 推进 8 个提交（含 Agent1 把我手改的状态都做了 + Agent3 用 **OPT-024/025 编号注册了和我完全不同的条目**）。`pull --rebase` 在 .wolf + optimization 上连环冲突。教训：① **OPT 编号是夜间 Agent 的共享命名空间——人想新增 backlog 项前先 `git fetch` 看远端最大编号，别用本地推断的下一个号**（我本地 OPT-024/025 撞了远端，改成 026/027）；② 远端分叉又有本地未推提交时，与其硬解连环冲突，不如 `git branch backup/… ` 备份 → `git reset --hard origin/…` → 只把净新增 delta（新条目、独有的 cerebrum 学习）重打一遍 commit，比 rebase 省事；③ Agent1 夜间通常已把已合并 PR 标 done，人只需补 Agent 不知道的东西（owner 口头提的 UI 项等）。

- **[2026-06-05] `optimization/explore.md` 是 Agent3 的 append-only 原始流水，状态会过时——动手前必须用真实代码复核 E 项。** 调研蓄水池里两个 M 项时发现 **E24（流式 chat 无 AbortController 超时）和 E26（handler conn 泄漏无 try/finally）其实都已实现**：E24 在 `chat.js:606-697`（AbortController + idle timer + finally + catch AbortError → renderStreamTimeout），E26 在 `app_server.py:3263 handle_one_request` 的 `finally`（兜底关 `_active_conn`）。explore.md 仍写「no signal / never closed」是因为它只追加不回写。教训：① explore.md 的 E 项只是「线索」，提拔/调研前先 grep 真实代码确认现状；② 同理 backlog 的「无开着 M/L」可能是真·已清空，不是遗漏。

- **[2026-05-13] `capture="environment"` 阻断相册访问。** 所有图片 input（quoteImageInput、bookImageInput、bookEditImageInput）不应带 `capture` 属性。iOS Safari 上 `accept="image/*"` 不带 capture 会弹出系统选择器（拍照 / 相册），带了 capture 则强制只走相机。

- **[2026-05-13] 图片预览需要 scrollIntoView。** dialog 内容较多时，图片预览 div 在底部，用户不知道要向下滚。选图/拍照后应调用 `previewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`，让预览自动进入视口。

- **[2026-05-13] iOS Safari 无法渲染超大 data URL 作为 img.src（静默失败，0 高度）。** iPhone 照片 base64 可达 10MB+，img.src 不报错但图片不显示。`URL.createObjectURL` 在 ngrok HTTPS 下也有时失败。**正确做法（已验证）：** 用 `resizeImageToDataUrl(file, maxPx=1200, quality=0.85)` —— 内部先 FileReader 读取原始 dataUrl，再用 `new Image()` 离屏解码（不渲染到 DOM），canvas 缩放后导出 JPEG data URL（~100-300KB）。pendingXxxImage 结构只需 `{ name, dataUrl }`，render preview 函数直接用 `dataUrl`。**永远不要**在 img.src 用原始大 base64 或直接 objectUrl（ngrok 不可靠）。不要用 objectUrl 作为 Image.src 的源，因为在某些 iOS HTTPS 环境下会静默失败。

- **[2026-05-13] 耗时操作应先关闭 dialog，在后台完成（背景保存模式）。** 如书籍封面上传：先更新内存 state + closeDialog + render()，再在 try/catch 里 await 图片上传 + syncState，完成后 showToast。用户不需要盯着 dialog 等待网络请求。

- **[2026-05-14] 流式聊天时不能直接把模型 delta 发给前端显示。** 模型按系统提示输出 `{"reply": "...", "actions": [...]}` 格式，流式时 delta 是原始 JSON 文本。必须在后端用 `ReplyExtractor` 逐字符解析，只提取 `"reply"` 字段的内容才发 SSE delta 事件；完整 `full_reply`（原始 JSON）仍正常传给 `ResponseParser` 解析 actions。

- **[2026-05-14] 流式等待状态用 CSS `.chat-bubble-loading` 类实现。** 发送后 assistant 气泡加 `.chat-bubble-loading`，`::after` 伪元素显示 `· · ·` 脉冲动画；收到第一个 delta 时 `classList.remove("chat-bubble-loading")`，动画即消失，文字开始显示。

- **[2026-05-13] 渲染变更后务必更新测试中的 hardcoded 预期值。** 书名号加入 h3 后，`getRenderedTitles()` 的返回值也带了《》，测试里 `["三体"]` 要改成 `["《三体》"]`。规则：凡是断言渲染 DOM 内容的测试，修改渲染逻辑后必须同步更新预期值。

- **[2026-06-03] 作者字段格式约定：外国作者 `[国籍] 人名`（如 `[德] 黑塞`），中国作者直接写人名。** Kimi 封面识别的 `BOOK_OCR_PROMPT`（app_server.py）已要求按此格式输出国籍。去重的 `normalize_book_author_for_match` 会把 `[德]`/`德 `/`（德）` 等国籍标记剥掉再比较，所以带不带国籍都能正确判重；存库时保留原始显示串（含国籍）。`parse_book_ocr_extraction` 只 trim、不动方括号，国籍能原样进表单。

- **[2026-06-03] 加书去重语义：空作者=通配符，且必须三端一致。** 去重不能用「签名(title::author)完全相等」，否则只填书名的新书无法匹配已有同名(有作者)书。正确语义：标题规整后必须相同；作者「任一方为空则判重(空=未指定=通配)」，两边都有才需相等。匹配函数 `isSameBook`(app.js)/`books_are_same`(app_server.py)/`_books_are_same`(reading_mcp_server.py) 三处实现必须保持一致（前端 addBook、Excel 导入、后端/MCP add_book 都走它）。注意：通配语义无法用 signature 的 `Set` 表达，Excel 导入要用遍历匹配的 seenBooks 列表。命中重复按现状直接 toast 拦截（用户已确认，不弹确认框）。

- **[2026-06-03] 模态 dialog 打开时 toast 会被遮挡（top layer）。** `<dialog>.showModal()` 渲染在浏览器 top layer，凌驾于所有 z-index 之上；body 级的 `#toast`（z-index:1200）被画在弹窗下方，弹窗关闭后才显现（用户体验：点保存「没反应」，关弹窗才看到提示）。`showToast()` 已修复为：检测 `document.querySelectorAll("dialog[open]")`，有打开弹窗就把 toast 节点 append 进最上层弹窗（随之进入 top layer），否则挂回 body。toast 是 `position:fixed` 且 dialog 无 `transform`，相对视口定位不变。用 `dialog[open]` 而非 `:modal` 伪类（旧 iOS Safari 不支持 `:modal`，querySelectorAll 会抛错）。

- **[2026-05-13] 静态文件必须带 `Cache-Control: no-store` 响应头。** iPhone Safari 极度激进地缓存 JS 文件，不带缓存控制头时即使服务器重启也继续用旧版本。`log_server.py` 的静态文件路由要加 `Cache-Control: no-store, no-cache, must-revalidate` 和 `Pragma: no-cache`。同时在 `index.html` 的 `<script src="./app.js?v=YYYYMMDD">` 加版本号作为双重保险。

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-06-28] **弹窗『内容右侧被裁/显示不全』和『莫名比视口宽』先查 grid/flex 子项的 `min-width:auto`，别只加 `overflow-x:hidden`。** 本项目 `.dialog-form` / `.book-detail-quotes` 是 CSS grid，grid（和 flex）子项默认 `min-width:auto`，**不会收缩到内容 min-content 以下**。一条长摘抄/关联行就把弹窗 body 撑得比弹窗宽，再被 `.dialog-form { overflow-x:hidden }` 裁掉——这正是 OPT-049② 的回归：当年只加了 `overflow-x:hidden`，把『能横滑』变成了『被裁』，没解决根因（bug-344）。正确修复：给弹窗内 grid/flex 子项加 `min-width:0`（`.dialog-form>*`、`.book-detail-quotes>*` 等），让其收缩、文字在弹窗宽度内换行；长无空格 token 另配 `overflow-wrap:anywhere`。教训：①「容器被内容撑宽」99% 是 `min-width:auto` 在 grid/flex item 上作祟，第一反应加 `min-width:0` 而不是 `overflow:hidden`（后者只是把溢出藏起来变成裁切）；② `overflow-x:hidden` 是『止血』不是『治根』，加它时要同时确认子项能收缩。

- [2026-06-28] **`<dialog>` 打开后『滚动停在中部』：同步 `scrollTop=0` 在 iOS Safari 不够，autofocus 的 scroll-into-view 是异步的。** `showModal()` 会 autofocus 第一个可聚焦元素（详情弹窗里是中部的摘抄按钮）并 scroll-into-view；iOS Safari 这个滚动发生在 showModal **之后的异步时机**，盖掉紧跟其后的同步 `scrollTop=0`（OPT-049① 桌面有效、iOS 回归，bug-343）。正确修复：showModal 后给滚动容器设 `tabindex=-1` 并 `focus({preventScroll:true})`（把焦点移到顶部容器，从源头避免滚到中部按钮）+ `scrollTop=0` 同步 + `requestAnimationFrame` 再复位一次兜底。教训：iOS 弹窗的焦点/滚动时序与桌面不同，凡是『打开弹窗后位置不对』优先用 preventScroll 焦点管理 + rAF 兜底，别只靠一次同步赋值。

- [2026-06-11] **领 OPT 编号要在「写 backlog 的前一刻」再 `git fetch`，不能只信 session 开头那次 sync。** 复发了 [2026-06-06] 的撞号：开局 `sync-knowledge.sh` 显示「已最新」（当时远端最大 OPT-036），我据此把连接泄漏项编为 OPT-037；但夜间 agent 在我**写代码的几十分钟里**并发推送了它自己的 OPT-037（localeCompare 排序）+ OPT-038（注册时间戳），等我 push bookkeeping 时 rebase 直接在 backlog.md + buglog.json 上冲突。根因：OPT 编号是夜间 agent 的共享命名空间，session 开头的 fetch 会过时。教训：① **注册 backlog 项 / 起功能分支命名前，紧贴着再 fetch 一次看远端真实最大号**，别用开局推断的下一个号；② 撞号后保留**夜间 agent 已 push 的号**（它在 origin 上更「先到」），把自己的改成更大的新号——本次我的 OPT-037 改成 OPT-039；③ **用 explore E 号（E26）作为代码注释/PR 里的稳定锚点**，因为 E 号不在并发命名空间里、不会撞，OPT 号撞了也不影响代码语义；④ buglog.json 同理会撞 bug-id（双方都 append 了 bug-260/261/262），解冲突最稳是 `git checkout origin/feature/agent -- .wolf/buglog.json` 取远端版本、再把自己那条真·人工条目按远端最大 id+1 重新追加（丢掉 hook 自动生成的噪声条目）。
- [2026-06-08] **推荐 explore.md 的 E 项前必须核代码，别只信描述。** 把 E24（流式聊天无超时）当蓄水池候选荐给用户，结果一 grep `chat.js` 发现早已实现并合并（commit c5c4281，含 30s idle timeout + AbortController + 重试按钮 + 测试），实现比 explore 提案还周到。根因：explore.md 是 Agent3 **append-only 日报**，写于 2026-06-02 反映当时状态；E 项被直接改代码闭环时**不会回头标 done**，于是过时条目永久挂在文件里等着被再次误荐。教训：① 从 explore.md 选候选/做调研前，先 `grep` 关键标识符（常量名/函数名）核实代码现状，再看 git log `-S`；② 调研一个项第一步永远是「它是不是已经做了」，别对着过时描述编分析；③ 闭环一个 explore 项后顺手在该条目标 `✅ DONE (commit)`，防再荐。
- [2026-06-04] **批量 worktree 子 agent 会把 `.wolf/memory.md` 一起提交进功能 PR，导致合并冲突；用 `gh pr merge` 会直接报 CONFLICTING。** `/batch` 起的 background agent 各自在 worktree 里跑，OpenWolf 的 stop/post-action 钩子会自动 append 并 `git add` `.wolf/memory.md`，于是哪怕 prompt 明确说"PR 只含本单元代码"，PR 仍混入 memory.md。三个 PR 与主干上我刚提交的 memory.md 记账行**全部 append-冲突**，`gh pr merge 19` 直接 `GraphQL: Pull Request has merge conflicts`。解法：① **本地 `git merge --no-ff origin/<worktree-branch>` 逐个合**——代码文件（app_server.py 不同区域 / styles.css）都能自动合，只有 memory.md 冲突；② memory.md 是纯追加流水账，主干侧通常是子 agent 侧的超集，直接 `git checkout --ours .wolf/memory.md && git add` 即并集解决，无需手工拼；③ 合完 push 到 base 分支，GitHub 自动把 PR 标 MERGED，再删远程分支 + `git worktree remove`。**更好的预防**：批量 worker 的 wrap-up 指令里应让它 commit 前 `git restore --staged .wolf/ && git checkout -- .wolf/` 或在 worktree 内禁用 wolf 钩子，从源头不带 memory.md。

- [2026-06-04] **`curl -I`（HEAD 请求）打本服务器返 501，因为 `ThreadingHTTPServer` handler 没实现 `do_HEAD`。** 写静态文件/头部的 e2e 验证脚本别用 `curl -I`，会误判成"头没设上"。改用 `curl -sD - -o /dev/null <url>`（GET 但只看响应头）。这是个独立的小遗漏（HEAD 应返 200 + 头、空 body），已记 buglog，未修——若要修在 Handler 上加 `do_HEAD` 复用 `do_GET` 的头部逻辑但不写 body。

- [2026-06-03] **给"所有 handler"加统一行为时，走单点拦截，别逐方法整体重缩进。** E26（连接泄漏兜底）第一版把 `do_GET/POST/PUT/DELETE` 四个方法体**整体缩进一层包进 try/finally**，diff ~1400 行。功能没错，但合并时灾难：该 worktree 从旧 feature/agent 切出，其间 OPT-002 在 `do_POST` 加了新分支，于是"整段重缩进"与那次改动**全面冲突**，1400 行手工解风险极高。解法不是硬解冲突，而是**重置到最新分支、改用等价的单点实现**——把兜底关连接挂到已有的 `handle_one_request` 的 `finally` 上（`_require_user` 记 `self._active_conn`，请求收尾统一关闭并置 None），diff 从 1400 行降到 ~25 行，永不与 handler 改动冲突，还顺带覆盖了新端点。教训：① 横切关注点（连接生命周期、鉴权、日志、错误包装）默认放**调度入口**（本项目是 `Handler.handle_one_request`，框架里就是中间件），而非逐个端点包裹；② **大规模机械重缩进是反模式**——它把整段标记为"已改"，与任何并发改动冲突，且人眼无法逐行 review（只能靠 `git diff -w` + 全量测试兜底）；③ 长期挂着的 worktree/PR 合并前先看 merge-base 离主干多远，差太多直接 rebase/重做比解冲突省事。 OPT-016 本地 OCR 默认 `TESSERACT_LANGS="chi_sim+eng"`，用户实拍书页出来基本全是拉丁乱码（`op eg AAMT RABE MIC...`）。根因：带 eng 后 LSTM 引擎把中文笔画往拉丁字母上拟合，整页崩。真实图对照实验：`chi_sim+eng`→乱码；**仅 `chi_sim`→立刻可读**。已把默认改为 `chi_sim`（app_server.py:864），chi_sim 自带数字/基础拉丁覆盖页码够用。另两条经验：① 图像预处理（灰度/放大/锐化）在这页**无助甚至更差**，杠杆在语言配置不在预处理；② 即便修好 Tesseract 中文书页天花板也只 ~70-80%（错字如 财迷心窍→财迷心安、库克→庄克），**商业级中文 OCR 要走 iOS VisionKit/实况文本 或 PaddleOCR**，Tesseract 只配做"快路径"，AI 做精识别兜底（OPT-016 定位）(bug-197)。

- [2026-06-03] **跑 Python 测试用 `.venv/bin/python`，不要用裸 `python3`。** 本机 `python3` 指向 `/opt/anaconda3/bin/python3`（装了 pytest 但**没装 mcp**），而项目的 `.venv`（Python 3.12）**装了 mcp 但没装 pytest**。两边错位：用 anaconda 跑 `python3 -m pytest tests/` 一碰到 `import mcp` 的文件（reading_mcp_server / 其工具测试）就 `ModuleNotFoundError: No module named 'mcp'`，我误判成「环境限制/无法测」并写进给用户的总结——是错的，测试本身没问题。正确跑法：`.venv/bin/python -m unittest discover -s tests -p "*_test.py"`（236 个全通过）。CLAUDE.md 里写的 `python3 -m pytest tests/ -v` 在这台机器上跑不全（venv 无 pytest、anaconda 无 mcp）。教训：① 报「缺依赖/测不了」前先确认用的是不是项目 venv 的解释器；② 别把自己用错解释器的结果当成「环境限制」甩给用户。

- [2026-06-01] **iOS 上「整页空白 + 点不动」先看 Safari 控制台，别瞎改 CSS。** iPad(iOS 12)上 /app 空白+菜单点不动，我连改三轮 CSS(dialog flex、fixed sidebar、pointer 分流)全是误诊。真因是 iOS 12 WebKit 不支持 ES2020 可选链 `?.`(13.4 才支持)→ app.js/chat.js(327 处 `?.`)首处即 `SyntaxError: Unexpected token '.'` → JS 整个不执行 → 内容空白(JS 渲染)、tab 点不动(JS 绑定)(bug-172)。教训:① iOS-only「空白/点不动」**第一步就让用户连 Mac 开 Safari Web Inspector 看控制台报错**,JS 报错一眼定位,省下我三轮盲改;② **iOS 上所有浏览器(Chrome/Firefox/Edge)强制用系统 WebKit**,旧 iOS 换浏览器无效;③ 本项目前端是 ES2020(`?.`/`??` 满地)、且 CLAUDE.md 禁构建工具,故**最低要求 iOS 13.4+**;旧设备靠 index.html `<head>` 里 ES5 探测脚本(`try{eval("a?.b")}catch`)显示 `.browser-unsupported` 友好提示页,而非白屏。

- [2026-06-01] **桌面专属布局必须用 `(pointer: fine)` 门控，别让触屏平板跑桌面布局。** OPT-004 的桌面侧边栏（`@media (min-width:769px)`）在 iPad Safari 上反复出问题：① body `display:flex` 时关闭态 `<dialog>`（body 直接子元素）被当 flex item 全部铺开、挡住点击（bug-170）；② 改 `position:fixed` sidebar + `.app-shell margin-left` 后 iPad 仍是空白+sidebar 不可点（bug-171，iOS 桌面布局其它脆点）。**最终解：把桌面块改成 `@media (min-width:769px) and (pointer:fine)`，移动块改成 `@media (max-width:768px), (pointer:coarse)`** —— iPad 等触屏设备回落到经充分测试的手机底部 tab 布局，桌面侧边栏只给鼠标设备。教训：iOS Safari + 桌面布局（flex body / fixed / dialog）很脆，与其逐个修不如按输入设备分流；headless Chrome 报 `pointer:fine`（能测桌面档），但 iOS 专属 bug 必须真机验。

- [2026-05-12] **dialog-form class on \<dialog\> itself causes iOS Safari display bug.** `.dialog-form` has `display:grid` which overrides the UA `dialog:not([open]) { display:none }` on iOS, making the closed dialog permanently visible. Rule: always put `dialog-form` on an inner `<div>` or `<form>`, never directly on the `<dialog>` element. All other dialogs in this project already follow this pattern.

- [2026-05-12] **Regression tests must execute real source via vm.runInNewContext.** Writing tests that simulate the fix logic themselves (without loading the actual JS file) always pass and catch nothing. Pattern: use `vm.runInNewContext(source, context)` as done in `chat-agent-approval.test.js` and `book-list-ordering-fix.test.js`. For CSS/HTML: read the real file and assert against its content. For `renderQuotes`, set `els.quoteFilter.value = "all"` in the test harness or all quotes get filtered out.

- [2026-05-12] **opacity:0 + :hover is invisible on mobile touch devices.** Using `opacity:0` with `:hover` reveal for action buttons (e.g. `.card-delete-btn`) makes them permanently invisible on iPhone — there is no hover event. Fix: override to `opacity:1` inside `@media (max-width:768px)`.

- [2026-05-13] **图片 input 禁止加 `capture="environment"`。** 这会在 iOS 上锁死到相机，无法选相册。正确做法：只写 `accept="image/*"`，让系统自己弹菜单。

- [2026-05-13] **CSS Edit 时必须完整匹配多选择器规则块的全部选择器。** 例如原 CSS 是 `.book-list, .timeline, .quote-list, .logs-list { display: grid }` 四个选择器合并一组，用 `old_string` 只匹配了 `.timeline, .quote-list, .logs-list { ... }` 部分，导致 `.book-list,` 被甩出去挂到下一条规则上，`.book-list` 失去 `display: grid` 变成单列。规则：Edit 前必须先 Read 目标区域，**确认 old_string 包含完整的选择器列表**；凡是涉及 CSS 规则块的插入/替换，验证前后的选择器分组没有被拆散。

- [2026-05-12] **P1-003 was only partially fixed.** The original fix added a custom dialog for `deleteBook` but left `deleteSession`, `deleteQuote` (app.js), and `clearHistory` (chat.js) still calling native `window.confirm`/`confirm`. When fixing "replace native confirm" always grep all three files for remaining `confirm(` calls.

- **[2026-05-14] Design handoff applied from reading-handoff.zip.** Sage color theme: `--color-ink: #3d4a3f`, `--color-soft-accent: #e6ecd9`. Status chips use 3 distinct pastel palettes (wishlist=sage, reading=amber, finished=slate) with dot indicators. AI chat bubbles flipped to light (`#eef1e4` bg). Tab bar replaced emoji with inline SVG icons; active state fills SVG with `var(--color-soft-accent)`. Circle-action + button now soft sage with border. Books/session/quote filter bars restructured to put + button inline with search/select.

- **[2026-05-14] `book-status-chip` needs `data-status` attribute for CSS-only status colors.** The chip is rendered in `app.js` at line 490. Added `data-status="${book.status}"` and a `.chip-dot.chip-dot--${book.status}` span. CSS then targets `.book-status-chip[data-status="reading"]` etc.

- **[2026-05-14] 图片 URL 必须存相对路径，渲染时拼接 backendBaseUrl。** `log_server.py` 上传接口曾返回绝对 ngrok URL，存入 DB。ngrok 重启后旧 URL 全部失效。Fix：① 上传接口改为只返回 `save_image()` 的相对路径（如 `/media/<user-id>/<file>`）；② `app.js` 加 `resolveImageUrl(url)` helper，对 `/media/` 或 `/uploads/` 开头的路径前缀 `backendBaseUrl`，对含有 `/media/` 的绝对 URL（旧数据）用 regex 提取路径再拼接；③ 一次性 Python 脚本把 DB 里所有绝对 URL 迁移为相对路径。**凡是存图片 URL 到 DB 只存相对路径**，渲染层统一走 `resolveImageUrl()`。

- **[2026-05-14] `chat.js` 的 `resetMessages()` 会覆盖 `index.html` 里的静态 HTML。** 每次切换书籍或初始化时 `resetMessages()` 用 `innerHTML` 重置消息区，`index.html` 里在 `.chat-welcome` 内写的装饰元素全部丢失。规则：凡是 `chat.js` 动态生成的 welcome 内容，**必须同步更新 `resetMessages()` 里的模板字符串**，不能只改 HTML。

- **[2026-05-14] filter select → text search 重构模式。** 记录/摘抄/关联三个页面原来用 `<select>` 做 book 过滤，改为 `<input type="search">` + `input` 事件监听。渲染函数从读 `select.value`（精确 bookId）改为读 `input.value` 做 haystack 模糊匹配（书名 + 作者 + 笔记内容）。空搜索时 fallback 到默认行为（记录/关联：全量，摘抄：全部）。`els` 里对应条目同步更名（`sessionBookFilter` → `sessionSearch` 等）。

- **[2026-05-29] 自定义 `display` 的元素必须补一条 `[hidden]` CSS 覆盖规则。** 浏览器 UA 样式表的 `[hidden] { display: none }` 优先级极低，凡是对元素写了 `display: flex/grid/block` 的 CSS 类，`hidden` 属性就会失效，元素仍显示。Fix：在同一 CSS 文件里补写 `.your-class[hidden] { display: none }`，确保 JS 用 `el.hidden = true/false` 能正常工作。

- **[2026-05-29] 商业化路线图（goal: 把工具做到可商业化水平）。** 12 项任务分 4 优先级：P0=AI 限流/token 过期/数据导出删除；P1=邮箱+密码重置/隐私政策/错误监控；P2=落地页/分层/支付；P3=Postgres/部署/对象存储。详见 TaskList。

- **[2026-05-29] 限流规范。** AI 端点（chat、chat/stream、ocr、quotes/ocr）必须在 `_require_user()` 之后立即调用 `_enforce_rate_limit(conn, user_id, endpoint)`，命中返回 False 时调用方必须 `conn.close()` 再 return（否则 conn 泄漏）。窗口键用 UTC 小时（`YYYYMMDDTHH`）+ UTC 日（`YYYYMMDD`）；计数器在 `rate_limit_counters` 表；任何端点的失败（包括 400）也会消耗配额，这是有意的反探测设计。环境变量 RATE_LIMIT_HOUR/RATE_LIMIT_DAY 在所有端点共用覆盖（测试用）。429 响应必须含 `message`（中文友好提示）、`retry_after_seconds`、`usage`（hour/day count + limit）。前端 apiFetch 识别 429 时抛 `Error` with `err.code='rate_limited'`。

- **[2026-05-29] E2E 测试端口冲突。** 杀 server 时务必先 `lsof -i :8787 -t | xargs kill -9; sleep 1`，否则旧 server 还在监听，curl 拿到的是旧响应。系统 `python3` 没装 mcp，必须用 `.venv/bin/python` 跑 `app_server.py`。

- **[2026-05-29] 商业化基础设施约定。** 本会话已构建以下基础设施，后续功能必须遵守：
  - **限流**：所有 AI 端点必须经过 `_enforce_rate_limit(conn, user_id, endpoint)`；新端点要在 `RATE_LIMITS` dict 里登记。
  - **错误监控**：未捕获异常自动入 `server_errors` 表（Handler.handle_one_request 包装）。可在 /debug/errors 查看。手动调用 `log_server_error(conn, ...)` 记录已 catch 的异常上下文。
  - **会话过期**：90 天滚动，token 过期自动删除并返回 None。所有 `resolve_user_from_token` 调用都已覆盖。
  - **GDPR/PIPL**：用户必须可以通过 `/api/account/export`（GET）和 `/api/account`（DELETE，confirmUsername 校验）行使数据权利。新增任何用户数据表时必须把它加入 DELETE /api/account 的级联删除列表。
  - **注册同意**：`/api/register` 强制 `termsAccepted=true`；users.terms_accepted_at 记录时间戳；新增任何用户协议变更时务必更新 /terms.html 和 /privacy.html。
  - **CORS 端点**：所有 fetch 响应都要带 `Access-Control-Allow-Origin: *` 头（Handler 已统一）。

- **[2026-05-29] 等待用户决策的商业化项。** P1-4（密码重置）需 SMTP 提供商决策（Gmail/Tencent SES/SendGrid）；P2-8（分层）需 free/plus 配额与定价决策；P2-9（支付）需微信支付 vs Stripe 决策；P3 三项（Postgres、部署、对象存储）均需云服务商决策。这些不应在没有用户输入的情况下擅自推进。

- **[2026-05-29] 商业化路线图完成（12/12）。** Stop hook 触发后改为自主决策推进剩余 6 项：
  - **P1-4 密码重置**：方案选 SMTP 经 env 配置（provider-agnostic），未配置时 fallback 控制台 + server_errors 写入；端点 `POST /api/password/{reset-request,reset}`；安全要求：成功后必须删除该用户所有 sessions 强制全设备重登；token 单次使用 + 30 分钟过期；users.email partial unique index（空值不冲突，已有用户兼容）。
  - **P2-8 分层**：free/plus 两档；free=10 books/30 chat·h/120 chat·d/12 ocr·h/40 ocr·d；plus=无限书/翻倍 AI 配额；`_resolve_user_plan(conn, user_id)` 必读 plan_expires_at（过期回落 free）；`_rate_limit_for(endpoint, plan)` 现 plan-aware；ActionExecutor.add_book 是 book cap 唯一强制点（PUT /api/user-state 不检查以避免破坏 UX）。
  - **P2-9 Stripe**：刻意不引入 stripe SDK，HMAC-SHA256 签名验证手写（5 分钟时间戳容忍 + 多 v1 签名 + hmac.compare_digest）；payments.provider_event_id partial unique index = webhook 幂等；处理 4 类事件：checkout.session.completed/customer.subscription.{updated,created,deleted}/invoice.payment_failed；invoice.payment_failed **不立即降级**（Stripe dunning 自带 grace period）；cancel 端点用 cancel_at_period_end=true。
  - **P3-11 Docker**：app + caddy 双服务，app 不暴露 8787 到 host（只内网），Caddy 自动 Let's Encrypt；DB_PATH/UPLOAD_DIR/ADMIN_TOKEN 必须 env 化（容器挂载卷必需）；Caddyfile 必须含 `flush_interval -1`（否则 SSE 流式破坏）。
  - **P3-12 S3**：boto3 仅 lazy import；S3 启用时存 `<user_id>/<uuid>.<ext>`、用 S3_PUBLIC_BASE 拼接 URL；DELETE /api/account 必须 best-effort 清理 S3 prefix（用 paginate + delete_objects 批量）。
  - **P3-10 SQLite WAL**：journal_mode=WAL 是 per-database 一次性；synchronous/cache_size/temp_store 是 per-connection 每次必设（忘记会用 SQLite 默认 FULL/2MB）。完整 Postgres 迁移推迟（200+ 行重构，1000 并发用户前不需要）。
  
  **测试方法学**：所有外部服务（SMTP/Stripe/boto3）测试都用 monkey-patch 模块级符号或 `sys.modules` 注入 fake module，不引入 mock 库。Webhook 测试必须覆盖：bad signature、stale timestamp、unknown event type、idempotency（重复 event_id）。

## Decision Log

- [2026-06-02] **划线句子提取归 AI 精识别，快路径(百度)不做划线检测。** OPT-016 后用户问"百度能只识别划线句子吗"。结论：传统 OCR(百度/腾讯)不理解"划线"语义、无此接口，整页全识别。App 的划线提取一直由 AI 精识别(Kimi)路径承担——`OCR_PROMPT`(app_server.py:787)指示"只提取用户划线、标记或框选的正文"，无划线时取主段落，`未发现划线文字`为其空结果哨兵。曾评估"给百度快路径加下划线检测(找横线笔画+按行 location 过滤)"以实现"快+只要划线"，但真实照片下下划线检测鲁棒性差(底纹/表格线/页边/倾斜误判)、且稳妥实现要引入 OpenCV 重依赖——故**维持现状**：快路径(百度)=整页快速录入，AI 精识别=划线精准提取。两档分工即产品设计，勿再给快路径加划线检测。

- [2026-05-12] **Auth panel redesigned as login-first tabbed UI.** Two forms (login + register) now tab-switch instead of sitting side-by-side. Login tab shown first by default. Tab panels use `display: contents` when active so the inner `<form>` participates in parent grid layout correctly.

- [2026-05-12] **外网访问方案选型：ngrok（当前）。** 用户 iPhone 已有 VPN，iOS 只允许一个 VPN 配置，故排除 Tailscale。ngrok 免费版够用（个人使用 + 偶尔演示）。每次重启 ngrok 地址会变，这是已知限制，可接受。未来若需要固定域名可迁移至 Cloudflare Tunnel（需购买域名约 ¥60–80/年）。启动命令：`ngrok http 8787`。

- (2026-06-12) Owner 痛点:独自开发缺「宏观决策层」。已建 optimization/roadmap.md(方向层,backlog 是执行层)。关键机制:signals.md 使用信号日志、每周一产品负责人仪式、夜间 implement 每周 ≤4 PR 预算、新 OPT 须写 northstar 行否则 P3。Owner 每天稳定投入 1–2h;项目定位暂按「个人工具打磨到极致」执行,升级触发器写在 roadmap §1。
- (2026-06-12) Do-Not-Repeat:给 backlog 项判 northstar/优先级时,**不得用自己的臆断覆盖 owner 来源的意愿**——OPT-001 是 owner 亲自提的,我以「唯一用户已熟知入口」为由判'弱',owner 当即纠正「这是我最想做的」。规则:owner 提出/点名的项,northstar 默认为强,除非 owner 自己降级;拿不准就问。另:判优先级前先核状态——OPT-002 早在 2026-06-03 (e90d824) 已实现但 backlog 漏标 done,我没核代码就当它待办。
- (2026-06-13) 夜间 Agent3(explore)提示词已加「EVIDENCE RULE」硬约束:断言任何现有代码缺陷/缺失前必须 Read 核实并引用 file:line,禁止臆造 UI 文案/行为;提拔进 backlog 的项必须经此核实,否则不提拔。同时 Agent3 现也读 roadmap/signals、每条带 northstar 行。起因:E71 谎称删书确认框「无级联提示、静默丢数据」,实际 index.html:533 早有警告,需人工核正(浪费 review 时间)。三个夜间 agent 现已全部接入方向层(roadmap+signals+northstar)。
- (2026-06-26) Do-Not-Repeat:**Agent3(explore)在 push 到 `feature/agent` 后不得开 PR。** `feature/agent` 是长期运行分支(领先 main 235+ 提交),从它向 main 开 PR 会把全部 agent 实验和 .wolf bookkeeping 一次性灌入 main。夜间 explore 的成果(explore.md/backlog.md 更新)直接提交进 `feature/agent` 即完成任务;如需发布到 main 须由 owner 单独评审独立 PR。远程执行环境默认"push 后必开 PR"的指令在此场景不适用——Agent3 应只 push、不开 PR。
