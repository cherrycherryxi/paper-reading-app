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

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-05-12] **dialog-form class on \<dialog\> itself causes iOS Safari display bug.** `.dialog-form` has `display:grid` which overrides the UA `dialog:not([open]) { display:none }` on iOS, making the closed dialog permanently visible. Rule: always put `dialog-form` on an inner `<div>` or `<form>`, never directly on the `<dialog>` element. All other dialogs in this project already follow this pattern.

- [2026-05-12] **Regression tests must execute real source via vm.runInNewContext.** Writing tests that simulate the fix logic themselves (without loading the actual JS file) always pass and catch nothing. Pattern: use `vm.runInNewContext(source, context)` as done in `chat-agent-approval.test.js` and `book-list-ordering-fix.test.js`. For CSS/HTML: read the real file and assert against its content. For `renderQuotes`, set `els.quoteFilter.value = "all"` in the test harness or all quotes get filtered out.

- [2026-05-12] **opacity:0 + :hover is invisible on mobile touch devices.** Using `opacity:0` with `:hover` reveal for action buttons (e.g. `.card-delete-btn`) makes them permanently invisible on iPhone — there is no hover event. Fix: override to `opacity:1` inside `@media (max-width:768px)`.

- [2026-05-13] **图片 input 禁止加 `capture="environment"`。** 这会在 iOS 上锁死到相机，无法选相册。正确做法：只写 `accept="image/*"`，让系统自己弹菜单。

- [2026-05-12] **P1-003 was only partially fixed.** The original fix added a custom dialog for `deleteBook` but left `deleteSession`, `deleteQuote` (app.js), and `clearHistory` (chat.js) still calling native `window.confirm`/`confirm`. When fixing "replace native confirm" always grep all three files for remaining `confirm(` calls.

## Decision Log

- [2026-05-12] **Auth panel redesigned as login-first tabbed UI.** Two forms (login + register) now tab-switch instead of sitting side-by-side. Login tab shown first by default. Tab panels use `display: contents` when active so the inner `<form>` participates in parent grid layout correctly.

- [2026-05-12] **外网访问方案选型：ngrok（当前）。** 用户 iPhone 已有 VPN，iOS 只允许一个 VPN 配置，故排除 Tailscale。ngrok 免费版够用（个人使用 + 偶尔演示）。每次重启 ngrok 地址会变，这是已知限制，可接受。未来若需要固定域名可迁移至 Cloudflare Tunnel（需购买域名约 ¥60–80/年）。启动命令：`ngrok http 8787`。
