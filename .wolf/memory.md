# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.
| 2026-05-14 | 思想碰撞功能（Cross-Book Connection）实现完毕：connections 数据模型、关联 Tab、创建/删除流程、上下文集成、Agent link_thought 动作 | log_server.py, app.js, index.html, chat.js, styles.css | done | ~4500 |
| 19:55 | Edited styles.css | 13→18 lines | ~131 |
| 17:34 | 内网穿透改造：log_server.py 加静态文件 serve + guess_base_url 支持 X-Forwarded-Proto；index.html backendBaseUrl 改为 "" | log_server.py, index.html | done, 需重启进程 | ~800 |
| 20:30 | 内网穿透完成验证：ngrok http 8787，所有静态文件和 API 均 200，方案归档至 cerebrum.md | .wolf/cerebrum.md, .wolf/memory.md | done | ~300 |
| 19:56 | Edited styles.css | 15→16 lines | ~111 |
| 19:56 | Edited chat.js | added 1 condition(s) | ~90 |

## 2026-05-14 — Design Polish + Bug Fixes

- **图片修复** `resolveImageUrl()` helper + DB 迁移：旧 ngrok 绝对 URL → 相对路径，`log_server.py` 上传接口改返回相对路径
- **书单按钮** 换用 `card-action-btn` 样式，"去聊"加 `card-action-chat`（金色），去除 flex-wrap，加 border-top 分隔线
- **搜索框统一** 记录/摘抄/关联页面：`<select>` 全部换为 `<input type="search">`，支持书名/作者/内容模糊搜索；摘抄卡片类型过滤改为 chip-strip
- **App 标题** `<title>` 改为「🐛 又买了一本书」
- **探讨空状态** 添加 5 个装饰气泡（CSS absolute + pill border-radius + 分层透明度），`chat.js resetMessages()` 同步更新

## 2026-05-11 — P0 Bug Sprint（3 fixes）

- **P0-001 [styles.css]** Toast 底部偏移未计入导航栏高度 → 在 @media ≤768px 内覆盖 `.toast { bottom: calc(20px + 64px + env(safe-area-inset-bottom)) }`
- **P0-002 [styles.css]** `.book-delete-corner` 触控区 30px → 44px，right/top 10px → 3px 保持视觉位置
- **P0-003 [chat.js]** keydown Enter 守卫：`if (!els.sendBtn?.disabled)` 阻止 AI 回复期间重复发送

## 2026-05-11 — P1 Bug Sprint（5 fixes）

- **P1-001 [chat.js]** `showAgentConfirm` 只取 `actions[0]` → 重构为 `_showNextAgentAction(remaining[])` 依次展示，尾部标注「还有 N 条」
- **P1-002 [app.js + styles.css]** 摘抄/阅读记录卡片加 `.card-delete-btn` + `deleteSession()` / `deleteQuote()`，委托事件触发
- **P1-003 [index.html + app.js + styles.css]** 删除书籍从 `window.confirm` 换为自定义 `#deleteBookDialog`，含红色警告文本和"确认删除"危险按钮
- **P1-004 [app.js]** 新增 `withSavingState(btn, label, fn)` 工具函数，7 个表单 submit handler 包裹，保存期间 disable + 显示「保存中…」
- **P1-005 [app.js]** `apiFetch` 401 分支：清空 auth 状态 + `showToast('登录已过期，请重新登录')` + `dispatchUserChange()`

## Session: 2026-05-11 20:45

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 21:36 | Edited chat.js | added 2 condition(s) | ~676 |
| 21:37 | Edited app.js | 15→16 lines | ~268 |
| 21:37 | Edited app.js | 16→17 lines | ~311 |
| 21:37 | Edited app.js | added error handling | ~200 |
| 21:37 | Edited app.js | added 2 condition(s) | ~186 |
| 21:37 | Edited styles.css | expanded (+25 lines) | ~181 |
| 21:38 | Edited index.html | expanded (+11 lines) | ~173 |
| 21:38 | Edited styles.css | expanded (+28 lines) | ~140 |
| 21:40 | Edited app.js | 1→5 lines | ~91 |
| 21:40 | Edited app.js | modified deleteBook() | ~386 |
| 21:40 | Edited app.js | added 1 condition(s) | ~219 |
| 21:41 | Edited app.js | expanded (+7 lines) | ~484 |
| 21:41 | Edited app.js | added 1 condition(s) | ~116 |
| 21:42 | Session end: 13 writes across 4 files (chat.js, app.js, styles.css, index.html) | 4 reads | ~32664 tok |
| 22:16 | Edited log_server.py | 24→24 lines | ~269 |
| 22:16 | Edited log_server.py | 13→13 lines | ~87 |
| 22:16 | Session end: 15 writes across 5 files (chat.js, app.js, styles.css, index.html, log_server.py) | 5 reads | ~54519 tok |
| 22:29 | Edited log_server.py | inline fix | ~25 |
| 22:29 | Edited log_server.py | expanded (+7 lines) | ~218 |
| 22:29 | Session end: 17 writes across 5 files (chat.js, app.js, styles.css, index.html, log_server.py) | 5 reads | ~54815 tok |
| 22:39 | Edited chat.js | modified if() | ~168 |
| 22:39 | Edited chat.js | 2→2 lines | ~50 |
| 22:39 | Edited chat.js | 4→4 lines | ~31 |
| 22:39 | Session end: 20 writes across 5 files (chat.js, app.js, styles.css, index.html, log_server.py) | 5 reads | ~55259 tok |
| 23:29 | Session end: 20 writes across 5 files (chat.js, app.js, styles.css, index.html, log_server.py) | 5 reads | ~55259 tok |
| 11:19 | designqc: captured 2 screenshots (23KB, ~5000 tok) | / | ready for eval | ~0 |
| 12:45 | buglog-test-writer: wrote 9 regression tests for P0/P1 bugs | tests/regression-fixed-bugs.test.js | all passing | ~22000 |
| 12:51 | Session end: 20 writes across 5 files (chat.js, app.js, styles.css, index.html, log_server.py) | 5 reads | ~55259 tok |

## Session: 2026-05-12 12:53

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

| 今日 | 修复 bug-017（dialog-form 导致 iOS dialog 悬浮）+ bug-018（deleteSession/deleteQuote/clearHistory 仍用原生 confirm）| index.html, app.js, chat.js | fixed | ~4k |
| 今日 | 重写 regression-fixed-bugs.test.js，改为 vm.runInNewContext 执行真实代码 | tests/regression-fixed-bugs.test.js | 10/10 pass | ~6k |
| 今日 | 更新 cerebrum.md：三条 Do-Not-Repeat 经验 | .wolf/cerebrum.md | done | ~1k |
| 13:03 | Edited index.html | 3→3 lines | ~125 |
| 13:03 | Edited index.html | — | ~0 |
| 13:03 | Edited app.js | 4→1 lines | ~15 |
| 13:03 | Edited app.js | 2→1 lines | ~16 |
| 13:03 | Edited app.js | removed 51 lines | ~7 |
| 13:03 | Edited app.js | removed 6 lines | ~17 |
| 13:03 | Edited app.js | 2→1 lines | ~15 |
| 13:04 | Edited styles.css | CSS: font-size | ~60 |
| 13:04 | Edited chat.js | slice() → escapeHtml() | ~84 |
| 13:05 | P2 sprint: fix all 4 P2 bugs | index.html, app.js, styles.css, chat.js | ✅ P2-001 nav reorder, P2-002 dead progressDialog removed, P2-003 font-size 16px, P2-004 full action text | ~600 |
| 13:05 | Session end: 9 writes across 4 files (index.html, app.js, styles.css, chat.js) | 4 reads | ~30117 tok |
| 13:41 | Edited styles.css | expanded (+47 lines) | ~260 |
| 13:41 | Edited index.html | 5→4 lines | ~29 |
| 13:41 | Edited index.html | 17→17 lines | ~204 |
| 13:42 | Edited index.html | 20→23 lines | ~362 |
| 13:42 | Edited app.js | 1→2 lines | ~32 |
| 13:42 | Edited app.js | added optional chaining | ~183 |
| 13:42 | Edited app.js | added optional chaining | ~181 |
| 13:42 | Edited app.js | expanded (+12 lines) | ~182 |
| 13:42 | Edited chat.js | 2→6 lines | ~69 |
| 13:42 | Edited chat.js | modified catch() | ~352 |
| 13:43 | P3 sprint: 5 fixes | index.html, app.js, chat.js, styles.css | ✅ 摘抄关键字搜索, 书卡去聊按钮, action trace bubble, 去开发者注释, 登录注册 tab 重设计 | ~900 |
| 13:44 | Session end: 19 writes across 4 files (index.html, app.js, styles.css, chat.js) | 5 reads | ~53373 tok |
| 14:48 | Session end: 19 writes across 4 files (index.html, app.js, styles.css, chat.js) | 5 reads | ~53373 tok |

## Session: 2026-05-12 23:08

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 23:13 | Edited index.html | inline fix | ~20 |
| 23:13 | Edited index.html | inline fix | ~19 |
| 23:13 | Edited index.html | inline fix | ~19 |
| 23:13 | Edited app.js | 3→4 lines | ~56 |
| 23:13 | Edited app.js | 3→4 lines | ~54 |
| 23:13 | Edited app.js | 3→4 lines | ~59 |

## Session: 2026-05-13 11:32

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 11:56 | fix: 图片预览改用 URL.createObjectURL，saveBookEdit 改为后台保存 | app.js | 修复 iOS 大图 data URL 无法预览 + 对话框立即关闭 | ~500 |

## Session: 2026-05-13 12:41

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 12:xx | feat P1: 书籍搜索 combobox（记录+摘抄表单），探讨清空按钮+切 tab 滚到底部 | index.html, app.js, styles.css | done |  ~800 |

## Session: 2026-05-13 13:16

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 12:xx | feat P2: 书名号统一、标签折叠(+N)、摘抄表单字段顺序调整 | app.js, index.html, styles.css, 2 test files | 全部测试通过 | ~600 |
| 13:xx | fix P0: canvas resizeImageToDataUrl，修复图片预览+OCR 503，移除 picker.capture | app.js, log_server.py | 18/18 JS 测试通过 | ~400 |
| 13:xx | fix: resizeImageToDataUrl 改用 FileReader 作为 Image 源（objectUrl 在 iOS HTTPS 下不可靠） | app.js | 18/18 测试通过 | ~200 |
| 23:10 | 流式聊天：call_deepseek_stream + /api/chat/stream SSE 端点 + chat.js 用 fetch+ReadableStream 替换 apiFetch | log_server.py, app.js, chat.js, index.html | done, 版本号已升级到 20260513i | ~1200 |
| 12:53 | 修复流式聊天：ReplyExtractor 提取 reply 字段 + .chat-bubble-loading 等待动画 | log_server.py, chat.js, styles.css, index.html | done, 已验证 | ~400 |
| 13:00 | Edited styles.css | expanded (+18 lines) | ~398 |
| 13:00 | Edited styles.css | expanded (+57 lines) | ~656 |
| 13:00 | Edited styles.css | CSS: flex-shrink | ~99 |
| 13:00 | Edited styles.css | 5→5 lines | ~19 |
| 13:00 | Edited styles.css | CSS: border | ~76 |
| 13:00 | Edited styles.css | expanded (+17 lines) | ~214 |
| 13:01 | Edited index.html | expanded (+15 lines) | ~538 |
| 13:01 | Edited index.html | 6→6 lines | ~162 |
| 13:01 | Edited app.js | inline fix | ~52 |
| 13:01 | Edited styles.css | 18→18 lines | ~131 |
| 13:01 | Edited styles.css | inline fix | ~19 |
| 13:01 | Edited styles.css | 2→2 lines | ~35 |
| 13:01 | Edited styles.css | CSS: font-weight, letter-spacing | ~87 |
| 13:01 | Edited styles.css | 4→4 lines | ~19 |
| 13:02 | Edited index.html | 12→10 lines | ~151 |
| 13:02 | Edited index.html | 14→13 lines | ~180 |
| 13:02 | Edited index.html | 15→18 lines | ~242 |
| 13:02 | Edited styles.css | expanded (+9 lines) | ~53 |
| 13:02 | Edited styles.css | expanded (+9 lines) | ~53 |
| 13:02 | Edited styles.css | CSS: font-family, letter-spacing | ~82 |

| 05:02 | Applied design handoff from reading/project — sage theme, SVG tab icons, status chip dots, inline +/search rows, warm gold accent, light AI chat bubbles | index.html, styles.css, app.js | success | ~2800 |
| 13:03 | Session end: 20 writes across 3 files (styles.css, index.html, app.js) | 7 reads | ~38820 tok |

## Session: 2026-05-14 14:16

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 14:23 | Edited app.js | 11→7 lines | ~106 |
| 14:23 | Edited chat.js | inline fix | ~30 |
| 14:23 | Edited styles.css | CSS: font-size, font-weight, border | ~142 |
| 14:24 | Session end: 3 writes across 3 files (app.js, chat.js, styles.css) | 4 reads | ~37213 tok |
| 14:30 | Created ../../.claude/plans/agent-federated-pony.md | — | ~1334 |
| 15:11 | Edited log_server.py | 6→7 lines | ~35 |
| 15:11 | Edited log_server.py | inline fix | ~26 |
| 15:11 | Edited log_server.py | 7→11 lines | ~164 |
| 15:11 | Edited log_server.py | modified str() | ~154 |
| 15:12 | Edited log_server.py | expanded (+28 lines) | ~600 |
| 15:12 | Edited index.html | expanded (+24 lines) | ~392 |
| 15:12 | Edited index.html | 5→9 lines | ~221 |
| 15:12 | Edited index.html | 5→9 lines | ~133 |
| 15:13 | Edited index.html | 5→9 lines | ~158 |
| 15:13 | Edited index.html | expanded (+69 lines) | ~840 |
| 15:13 | Edited app.js | 6→7 lines | ~31 |
| 15:13 | Edited app.js | expanded (+7 lines) | ~216 |
| 15:13 | Edited app.js | added 1 condition(s) | ~84 |
| 15:13 | Edited app.js | added optional chaining | ~1386 |
| 15:14 | Edited app.js | 7→8 lines | ~58 |
| 15:14 | Edited app.js | added 1 condition(s) | ~65 |
| 15:14 | Edited styles.css | expanded (+171 lines) | ~1243 |
| 15:16 | Edited app.js | added error handling | ~2324 |
| 15:16 | Edited app.js | added 2 condition(s) | ~568 |
| 15:16 | Edited app.js | added 2 condition(s) | ~382 |
| 15:16 | Edited app.js | added optional chaining | ~373 |
| 15:16 | Edited app.js | 7→8 lines | ~189 |
| 15:16 | Edited app.js | 6→7 lines | ~146 |
| 15:16 | Edited app.js | modified if() | ~185 |
| 15:17 | Edited app.js | 6→7 lines | ~89 |
| 15:17 | Edited app.js | 11→12 lines | ~162 |
| 15:17 | Edited app.js | added optional chaining | ~88 |
| 15:17 | Edited log_server.py | modified build_chat_prompt() | ~199 |
| 15:18 | Edited log_server.py | modified build_system_instruction() | ~553 |
| 15:18 | Edited chat.js | 2→3 lines | ~85 |
| 15:18 | Edited app.js | 2→2 lines | ~50 |
| 15:18 | Session end: 35 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~82182 tok |
| 15:27 | Edited app.js | modified formatBookTitle() | ~37 |
| 15:27 | Edited app.js | inline fix | ~22 |
| 15:28 | Edited app.js | inline fix | ~14 |
| 15:28 | Edited app.js | "《${book.title}》${book.aut" → "${book.title}${book.autho" | ~28 |
| 15:28 | Edited app.js | "《${book.title}》" → "书籍详情" | ~17 |
| 15:28 | Edited chat.js | "《${book.title}》" → "当前书籍" | ~13 |
| 15:28 | Edited chat.js | inline fix | ~32 |
| 15:28 | Session end: 42 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~82355 tok |
| 15:31 | Session end: 42 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~82355 tok |
| 16:01 | Edited app.js | inline fix | ~16 |
| 16:01 | Edited app.js | inline fix | ~16 |
| 16:01 | Edited app.js | inline fix | ~15 |
| 16:01 | Edited app.js | 2→1 lines | ~22 |
| 16:01 | Session end: 46 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~82424 tok |
| 16:20 | Session end: 46 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~82636 tok |
| 16:43 | Edited log_server.py | "- {" → "{" | ~60 |
| 16:43 | Edited log_server.py | 1200 → 2400 | ~30 |
| 16:43 | Session end: 48 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~82726 tok |
| 16:47 | Edited log_server.py | 4→4 lines | ~56 |
| 16:47 | Edited log_server.py | modified compress_chat_history_if_needed() | ~347 |
| 16:48 | Edited log_server.py | 5→6 lines | ~142 |
| 16:48 | Edited log_server.py | 7→8 lines | ~138 |
| 16:48 | Session end: 52 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~83720 tok |
| 17:09 | Edited styles.css | expanded (+16 lines) | ~124 |
| 17:09 | Edited index.html | inline fix | ~36 |
| 17:09 | Session end: 54 writes across 6 files (app.js, chat.js, styles.css, agent-federated-pony.md, log_server.py) | 5 reads | ~85111 tok |

## Session: 2026-05-14 18:19

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 18:20 | Edited log_server.py | inline fix | ~12 |
| 18:20 | Edited app.js | added 2 condition(s) | ~72 |
| 18:20 | Edited app.js | inline fix | ~42 |
| 18:20 | Edited app.js | modified formatBookTitle() | ~126 |
| 18:20 | Edited app.js | modified formatBookTitle() | ~143 |
| 18:21 | Edited app.js | inline fix | ~14 |
| 18:21 | Edited app.js | 5→5 lines | ~92 |
| 18:21 | Edited styles.css | CSS: background | ~54 |
| 18:21 | Edited styles.css | CSS: padding-top, border-top | ~40 |
| 18:21 | Session end: 9 writes across 3 files (log_server.py, app.js, styles.css) | 3 reads | ~63019 tok |
| 18:39 | Edited app.js | added 1 condition(s) | ~124 |
| 18:39 | Session end: 10 writes across 3 files (log_server.py, app.js, styles.css) | 3 reads | ~63143 tok |
| 20:56 | Edited index.html | 8→8 lines | ~131 |
| 20:56 | Edited index.html | 13→11 lines | ~212 |
| 20:56 | Edited app.js | 2→2 lines | ~33 |
| 20:56 | Edited app.js | added optional chaining | ~30 |
| 20:56 | Edited app.js | expanded (+6 lines) | ~119 |
| 20:56 | Edited styles.css | 9→9 lines | ~64 |
| 20:57 | Edited styles.css | removed 14 lines | ~1 |
| 20:57 | Session end: 17 writes across 4 files (log_server.py, app.js, styles.css, index.html) | 4 reads | ~70842 tok |

## Session: 2026-05-14 21:28

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 22:21 | Edited ../../.claude/settings.json | expanded (+12 lines) | ~143 |
| 22:21 | Session end: 1 writes across 1 files (settings.json) | 1 reads | ~584 tok |

## Session: 2026-05-14 22:22

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 22:23 | Edited index.html | 3→1 lines | ~26 |
| 22:23 | Edited app.js | "#sessionBookFilter" → "#sessionSearch" | ~17 |
| 22:23 | Edited app.js | reduced (-9 lines) | ~140 |
| 22:24 | Edited app.js | modified if() | ~196 |
| 22:24 | Edited app.js | "change" → "input" | ~18 |
| 22:24 | Session end: 5 writes across 2 files (index.html, app.js) | 2 reads | ~32956 tok |
| 22:45 | Edited index.html | 3→1 lines | ~27 |
| 22:45 | Edited app.js | "#connectionBookFilter" → "#connectionSearch" | ~19 |
| 22:45 | Edited app.js | 2→1 lines | ~12 |
| 22:45 | Edited app.js | modified if() | ~364 |
| 22:45 | Edited app.js | 4→1 lines | ~20 |
| 22:45 | Session end: 10 writes across 2 files (index.html, app.js) | 2 reads | ~33125 tok |
| 22:52 | Session end: 10 writes across 2 files (index.html, app.js) | 2 reads | ~33125 tok |
| 22:54 | Session end: 10 writes across 2 files (index.html, app.js) | 2 reads | ~33125 tok |
| 22:57 | Session end: 10 writes across 2 files (index.html, app.js) | 2 reads | ~33125 tok |
| 22:58 | Edited index.html | inline fix | ~8 |
| 22:58 | Session end: 11 writes across 2 files (index.html, app.js) | 2 reads | ~33123 tok |
| 23:08 | Session end: 11 writes across 2 files (index.html, app.js) | 2 reads | ~33123 tok |
| 23:13 | Edited index.html | expanded (+7 lines) | ~112 |
| 23:13 | Edited styles.css | expanded (+63 lines) | ~385 |
| 23:14 | Session end: 13 writes across 3 files (index.html, app.js, styles.css) | 3 reads | ~43393 tok |
| 23:27 | Edited chat.js | expanded (+7 lines) | ~109 |
| 23:27 | Session end: 14 writes across 4 files (index.html, app.js, styles.css, chat.js) | 4 reads | ~46652 tok |
| 23:29 | Edited styles.css | 51→49 lines | ~299 |
| 23:29 | Session end: 15 writes across 4 files (index.html, app.js, styles.css, chat.js) | 4 reads | ~47311 tok |
