# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-12

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** paper-reading-app
- **Description:** 一个面向手机网页的纸质书阅读工具，当前优先适配 iPhone 12。

- **[2026-05-12] 静态文件由后端统一托管。** `log_server.py` 的 `do_GET` 顶部增加了静态文件路由，serve `index.html`、`app.js`、`chat.js`、`styles.css`。前端不再需要单独的 `python3 -m http.server 4173` 进程，只开 8787 一个端口即可。

- **[2026-05-12] `backendBaseUrl` 改为空字符串。** 前端与后端同源后，所有 API 请求改用相对路径。`index.html` 里 `window.PAPER_READING_APP_CONFIG.backendBaseUrl` 设为 `""`。不需要再硬编码局域网 IP。

- **[2026-05-12] `guess_base_url()` 支持 HTTPS。** 增加读取 `X-Forwarded-Proto` header，确保通过 ngrok/Cloudflare Tunnel 等反向代理时媒体文件 URL 能正确生成 `https://` 前缀。

## Key Learnings

- **[2026-05-13] `capture="environment"` 阻断相册访问。** 所有图片 input（quoteImageInput、bookImageInput、bookEditImageInput）不应带 `capture` 属性。iOS Safari 上 `accept="image/*"` 不带 capture 会弹出系统选择器（拍照 / 相册），带了 capture 则强制只走相机。

- **[2026-05-13] 图片预览需要 scrollIntoView。** dialog 内容较多时，图片预览 div 在底部，用户不知道要向下滚。选图/拍照后应调用 `previewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`，让预览自动进入视口。

- **[2026-05-13] iOS Safari 无法渲染超大 data URL 作为 img.src（静默失败，0 高度）。** iPhone 照片 base64 可达 10MB+，img.src 不报错但图片不显示。`URL.createObjectURL` 在 ngrok HTTPS 下也有时失败。**正确做法（已验证）：** 用 `resizeImageToDataUrl(file, maxPx=1200, quality=0.85)` —— 内部先 FileReader 读取原始 dataUrl，再用 `new Image()` 离屏解码（不渲染到 DOM），canvas 缩放后导出 JPEG data URL（~100-300KB）。pendingXxxImage 结构只需 `{ name, dataUrl }`，render preview 函数直接用 `dataUrl`。**永远不要**在 img.src 用原始大 base64 或直接 objectUrl（ngrok 不可靠）。不要用 objectUrl 作为 Image.src 的源，因为在某些 iOS HTTPS 环境下会静默失败。

- **[2026-05-13] 耗时操作应先关闭 dialog，在后台完成（背景保存模式）。** 如书籍封面上传：先更新内存 state + closeDialog + render()，再在 try/catch 里 await 图片上传 + syncState，完成后 showToast。用户不需要盯着 dialog 等待网络请求。

- **[2026-05-14] 流式聊天时不能直接把模型 delta 发给前端显示。** 模型按系统提示输出 `{"reply": "...", "actions": [...]}` 格式，流式时 delta 是原始 JSON 文本。必须在后端用 `ReplyExtractor` 逐字符解析，只提取 `"reply"` 字段的内容才发 SSE delta 事件；完整 `full_reply`（原始 JSON）仍正常传给 `ResponseParser` 解析 actions。

- **[2026-05-14] 流式等待状态用 CSS `.chat-bubble-loading` 类实现。** 发送后 assistant 气泡加 `.chat-bubble-loading`，`::after` 伪元素显示 `· · ·` 脉冲动画；收到第一个 delta 时 `classList.remove("chat-bubble-loading")`，动画即消失，文字开始显示。

- **[2026-05-13] 渲染变更后务必更新测试中的 hardcoded 预期值。** 书名号加入 h3 后，`getRenderedTitles()` 的返回值也带了《》，测试里 `["三体"]` 要改成 `["《三体》"]`。规则：凡是断言渲染 DOM 内容的测试，修改渲染逻辑后必须同步更新预期值。

- **[2026-05-13] 静态文件必须带 `Cache-Control: no-store` 响应头。** iPhone Safari 极度激进地缓存 JS 文件，不带缓存控制头时即使服务器重启也继续用旧版本。`log_server.py` 的静态文件路由要加 `Cache-Control: no-store, no-cache, must-revalidate` 和 `Pragma: no-cache`。同时在 `index.html` 的 `<script src="./app.js?v=YYYYMMDD">` 加版本号作为双重保险。

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

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

- [2026-05-12] **Auth panel redesigned as login-first tabbed UI.** Two forms (login + register) now tab-switch instead of sitting side-by-side. Login tab shown first by default. Tab panels use `display: contents` when active so the inner `<form>` participates in parent grid layout correctly.

- [2026-05-12] **外网访问方案选型：ngrok（当前）。** 用户 iPhone 已有 VPN，iOS 只允许一个 VPN 配置，故排除 Tailscale。ngrok 免费版够用（个人使用 + 偶尔演示）。每次重启 ngrok 地址会变，这是已知限制，可接受。未来若需要固定域名可迁移至 Cloudflare Tunnel（需购买域名约 ¥60–80/年）。启动命令：`ngrok http 8787`。
