# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.
| 19:55 | Edited styles.css | 13→18 lines | ~131 |
| 17:34 | 内网穿透改造：log_server.py 加静态文件 serve + guess_base_url 支持 X-Forwarded-Proto；index.html backendBaseUrl 改为 "" | log_server.py, index.html | done, 需重启进程 | ~800 |
| 20:30 | 内网穿透完成验证：ngrok http 8787，所有静态文件和 API 均 200，方案归档至 cerebrum.md | .wolf/cerebrum.md, .wolf/memory.md | done | ~300 |
| 19:56 | Edited styles.css | 15→16 lines | ~111 |
| 19:56 | Edited chat.js | added 1 condition(s) | ~90 |

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
