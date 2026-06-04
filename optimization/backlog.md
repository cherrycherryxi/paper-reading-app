# Optimization Backlog

Raw optimization ideas. Append new ideas at the bottom as a new `### OPT-NNN` block.
Keep `status:` accurate. Agent1 reads this; the human owner edits it freely.

## ⛔ Explicitly excluded — do NOT suggest or re-add these

These are deliberate product decisions, not missing features or bugs.
Agent1 and Agent3: if you observe code patterns matching these items, skip them.

| topic | why excluded |
|-------|-------------|
| 全局搜索包含摘抄内容 | 故意不做。`matchQuotes()` 存在但不接入 `globalSearch()` 是设计决策，不是遗漏。搜索框只搜书单。 |

Format per item:

```
### OPT-NNN — <short title>
- status: new | triaged | in-progress | done
- area: frontend | backend | agent | wechat | infra | ux
- description: <what>
- why: <motivation / value>
- how: <implementation hint, files to touch>
```

---

### OPT-001 — Excel 批量加书入口位置
- status: triaged
- area: ux
- description: Excel 批量加书入口目前在「我的」抽屉里，考虑是否应放到「书单」页面，让用户一眼看到如何快速加书。
- why: 「我的」是设置类抽屉，新用户不会主动打开找加书功能；首屏「书单」是加书的天然语义位置。
- how: 在「书单」页空状态 / 加书按钮旁露出"批量从 Excel 导入"二级入口；保留「我的」里的入口作为备用。需对比 UX，不一定全搬。

### OPT-002 — 「书单」加书支持拍照 OCR 识别
- status: triaged
- area: backend
- description: 新增书籍时支持拍照（封面 / 版权页），OCR 自动识别书名、作者、标签，减少手工输入。
- why: 项目已有 OCR pipeline（Kimi vision + DeepSeek fallback，目前用于摘抄拍照），扩展到加书入口是高价值低成本的复用。
- how: 复用现有 OCR 调用链（call_kimi_vision() / call_deepseek()）；返回结构化字段 {title, author, tags[]} 后预填新增书籍表单，让用户确认而非自动落库。

### OPT-003 — 自动适配不同手机机型
- status: done
- area: frontend
- description: 当前 CSS 以 iPhone 12 (390×844) 为基准，需要适配 iPhone SE / Pro Max / 安卓各种尺寸 / 平板。
- why: landing.html 文案已移除「iPhone 12」字样，但实际 CSS 仍是单尺寸优化；商业化后用户机型分布会很散。
- how: 检查 styles.css 中 px 数值能否换成响应式单位（vw, clamp(), min()）；加 @media 断点针对 small (<375px) / large (>430px) / tablet (>768px) 三档。

### OPT-004 — 桌面端基础适配
- status: done
- area: frontend
- description: 桌面端打开应用页面混乱（按手机宽度强制铺开 / 元素居中 / 大量留白），需要一版基础桌面布局。
- why: 商业化后会有用户从电脑端使用；landing 已做桌面端布局，但 /app 内部仍是手机端样式。
- how: 先做基础——(a) /app 桌面端固定居中 480px 内容列 + 两侧 illustration/空白卡片；(b) 抽屉改右侧 slide-in 而非全屏 takeover；(c) 键盘快捷键提示。再迭代深度桌面端。

### OPT-005 — debug/dashboard 看板增加每条请求的 token、延迟监测
- status: done
- area: backend
- description: 在 debug 看板（/debug/logs）上为每条 LLM/OCR 请求展示 token 用量（prompt/completion/total）和延迟（耗时 ms），便于排查慢请求和成本分析。
- why: 项目已有 model_logs / agent_metrics / MetricsCollector 的观测基建，但看板缺少逐请求的 token 与延迟可视化；商业化后需要监控成本与性能。
- how: 检查 model_logs 表是否已记录 token usage 与请求耗时，缺则在 call_deepseek() / call_kimi_vision() 调用处补记（API 响应里的 usage 字段 + 起止时间戳）；在 /debug/logs 页面每行展示 total tokens 与 latency，并加汇总（今日总 token / 平均延迟 / P95）。

### OPT-007 — 替换已废弃的 imghdr（Python 3.13 将删除）
- status: done
- area: backend
- description: app_server.py 在 line 8 import imghdr，在 line 1677 用 imghdr.what(None, binary) 检测上传图片格式。Python 3.11 已发 DeprecationWarning，Python 3.13 将直接删除该模块，届时首次图片上传即崩溃。
- why: 这是定时炸弹——升级 Python 版本时会出现 ImportError，影响所有图片上传和 OCR 流程。
- how: 删除 import imghdr；在 save_image() 里用 5 行 magic bytes 替换：PNG(\x89PNG)、JPEG(\xff\xd8)、WebP(RIFF…WEBP)，fallback 用 mime_type 后缀。无需第三方依赖，无 schema 变更。Touch: app_server.py:8, 1675-1690

### OPT-008 — summarize_metrics() 中 json.loads 无 try-except，单行损坏数据导致整个 metrics 接口 500
- status: done
- area: backend
- description: MetricsCollector.summarize_metrics() 在 app_server.py:2427 对每条 agent_metrics 行调用 json.loads(row["dimensions"])，无 try-except。任一行的 dimensions 字段若为截断 JSON（写入中断、schema 迁移等），整个方法抛 json.JSONDecodeError，/debug/logs 和 /debug/metrics 对该用户永久返回 500，直到手动修复 DB。
- why: 这是单点故障——一条坏记录让所有监控接口失效。修复仅需两行：用 try/except json.JSONDecodeError 包裹 json.loads，捕获时跳过该行并记录 warning。成本极低，影响极大。
- how: 在 app_server.py:2427 将 `dimensions = json.loads(row["dimensions"])` 包裹在 try/except json.JSONDecodeError 块中，except 分支 `continue`，可选择额外调用 logging.warning()。无 schema 变更，无接口变更。Touch: app_server.py:2401-2435

### OPT-009 — _read_json() 读取请求体无大小上限，恶意 Content-Length 可撑爆服务器内存
- status: done
- area: backend
- description: _read_json() 在 app_server.py:2899-2902 直接以 Content-Length 头的值调用 self.rfile.read(content_length)，无上限检查。所有 POST 端点（含接收 base64 图片的 /api/upload-image、/api/quotes/ocr）均受影响。攻击者发送 Content-Length: 2000000000 可导致进程尝试分配 2GB 并阻塞读取，使其他用户的请求全部挂起。
- why: ThreadingHTTPServer 在默认部署下无反向代理保护，单个恶意请求即可使整个服务不可用。修复仅需定义 MAX_REQUEST_BYTES 常量（~20MB）并在读取前返回 413，三行代码，零逻辑变更。
- how: 在 app_server.py:2899 前加 `if content_length > MAX_REQUEST_BYTES: self._send_error(413, "payload too large"); return {}`；对 Stripe webhook 原始 body 读取（line 3676-3677）同样加此检查。定义 MAX_REQUEST_BYTES = 20 * 1024 * 1024 常量。Touch: app_server.py:2899-2902, 3676-3677

### OPT-010 — 四个 GC 函数已实现但从未调用，数据库永不清理
- status: done
- area: backend
- description: gc_expired_sessions()、gc_expired_password_reset_tokens()、gc_old_server_errors()、gc_old_rate_limit_rows() 均有完整实现（app_server.py:1019, 1485, 1495, 1503），各有对应单元测试，但在任何运行路径中从未被调用。main() 只调用 init_db() 和 serve_forever()。expired session 行、已用/过期的密码重置 token、超过 30 天的 server_error、过期的限速计数器窗口全部永远积压在 DB 里。
- why: rate_limit_counters 每个活跃用户每小时/天各产生 2 行；长期运行后表会膨胀到数万孤行，拖慢 check_and_record_rate_limit() 的 BEGIN IMMEDIATE 锁竞争。password_reset_tokens 也会无限积累。这是一个简单的实现遗漏，修复只需加一个每 6 小时执行一次的后台守护线程。
- how: 新增 _run_gc() 函数调用全部四个 GC 方法（每次用新 conn）；在 main() 中用 threading.Timer 或 threading.Thread（daemon=True）以 6 小时间隔循环调用。无 schema 变更，无逻辑变更。Touch: app_server.py:1019-1513, 4631-4638

### OPT-012 — call_deepseek() 无重试逻辑，临时 429/502 静默失败三条关键路径
- status: triaged
- area: backend
- description: call_deepseek()（app_server.py:2703）遇到任何 HTTPError / URLError 即直接抛出，没有重试。该函数被三处生产路径调用：(a) 流式 stream_finish_reason != "stop" 后的非流式 fallback（line 4101）；(b) Kimi vision 失败后的 OCR DeepSeek 备线（line 1821）；(c) 对话历史压缩（line 1826）。DeepSeek API 在高负载下偶发 429、502，三条路径均会静默失败并向用户报错。
- why: call_kimi_vision() 已有 KIMI_VISION_MAX_ATTEMPTS=2 的重试逻辑（line 2794, 2835-2850），同一项目内已有可复用的模式。对话历史压缩失败会静默截断上下文，影响最活跃用户的 AI 质量。添加指数退避重试（最多 2 次，重试码 429/500/502/503）几乎不增加正常路径延迟。
- how: 在 call_deepseek() 增加 retries 参数（默认 2），捕获到可重试的 HTTPError 时 sleep(1) 后重试；或提取为 _retryable_deepseek_call() wrapper 复用。参照 call_kimi_vision() 的 attempt 循环实现。Touch: app_server.py:2703-2731；调用方 line 1821, 1826, 4101 无需改动。

### OPT-013 — 按钮缺少 :focus-visible 样式，键盘用户无法看到焦点位置（WCAG 违规）
- status: triaged
- area: frontend
- description: styles.css 对 input/select/textarea 有 :focus 样式（line 533），但全部 30+ 个按钮选择器（.circle-action、.icon-btn、.tag-chip-pick、.filter-chip、.me-list-btn 等）均无 :focus 或 :focus-visible 规则。styles.css 3451 行中 :focus-visible 出现 0 次。使用键盘（Tab 键）导航的用户看不到任何焦点指示器。
- why: WCAG 2.1 SC 2.4.7（Focus Visible，Level AA）要求所有可键盘操作元素有可见焦点指示器。这是商业化产品的基线无障碍合规要求。修复仅需 3 行 CSS，风险极低，影响所有按钮。
- how: 在 styles.css input:focus 规则块（line 533）后添加：button:focus-visible, [role="button"]:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }。无 HTML 变更、无 JS 变更。Touch: styles.css:533-540。

### OPT-011 — HTML 响应缺少安全头（X-Frame-Options、X-Content-Type-Options 等）
- status: done
- area: backend
- description: do_GET() 的 _STATIC 处理块（app_server.py:2995-3005）为 landing.html、index.html、privacy.html、terms.html 只发送 Content-Type 和 Cache-Control，没有 X-Frame-Options、X-Content-Type-Options、Content-Security-Policy 或 Referrer-Policy 头。JSON API 对所有端点（含鉴权端点）返回 Access-Control-Allow-Origin: *（lines 2883, 2894, 2905, 2965）。
- why: 缺少 X-Frame-Options: SAMEORIGIN 导致 HTML 页面可被 iframe 嵌入用于点击劫持攻击；缺少 X-Content-Type-Options: nosniff 允许旧浏览器 MIME-sniffing。商业化产品含支付流程，这些是任何安全扫描器都会标记的基线缺陷。修复仅需在静态文件响应里增加 4-5 行 header。
- how: 新增 _send_security_headers() 辅助方法，在 do_GET() 静态 HTML 响应路径调用；可选择将 CORS 限制为 ALLOWED_ORIGINS 环境变量而非无条件 *。Touch: app_server.py:2890-2909, 2995-3005
- done (2026-06-04, PR #20): `_send_security_headers()` 发 X-Frame-Options/X-Content-Type-Options/Referrer-Policy，在 `_send_html` 与静态块调用。**范围限定**：CORS 通配 `*` 与 CSP 故意未动——鉴权是 Authorization: Bearer（非 Cookie），通配 CORS 危害低；CSP 会打碎 index.html 内联 config。如未来要收紧 CORS / 加 CSP（外联内联脚本）可另立项。

### OPT-014 — 自动识别的摘抄卡片总是排在前面（已定位为排序 bug）
- status: done
- area: frontend + backend
- description: （owner 提出）OCR 自动识别生成的摘抄卡片在列表里总是排在最前面，挤掉手动添加的摘抄。
- root cause: createdAt 格式不一致 + 朴素字符串排序。OCR 自动卡由后端 now_iso()（app_server.py:264 = datetime.now().isoformat()）写入 **naive 本地时间、无 Z**（如 `2026-06-02T12:38:54`）；手动卡由前端 new Date().toISOString()（app.js:2565）写入 **UTC 带 Z**（如 `2026-06-02T04:38:55.059Z`）。renderQuotes() 排序（app.js:1213）用 (b.createdAt).localeCompare(a.createdAt) 做字符串比较。服务器东八区，OCR 卡本地时间字符串字面比同一时刻手动卡的 UTC 字符串大 ~8 小时，恒排在前——即便手动卡更晚创建，只要在 ~8h 内也被压下。
- why: 自动识别卡只是录入方式不同，不应在排序上享有特权；这是字面时区偏移造成的系统性错位，非用户预期。
- how: 两处都改——(1) 后端建 OCR 卡处（app_server.py:3984）的 createdAt 改用 UTC 带 Z，与前端对齐（不动全局 now_iso() 以免影响 session/限速/日报 today_prefix 等）；(2) 前端排序（app.js:1213）改为解析后比较 epoch：new Date(b.createdAt) - new Date(a.createdAt)，作为防御性加固。已存旧 OCR 卡的 naive 时间戳无法回溯真实时区，自然老化。

### OPT-015 — 摘抄卡面内容难以分辨，UI 优化
- status: triaged
- area: frontend
- description: （owner 提出）摘抄卡片正面的内容（摘抄文字 / 图片 / 元信息）辨识度不够，需要在 UI 上做优化，提升可读性与层次。
- why: 摘抄是核心内容，卡面读不清直接影响主体验；对比度、字号、留白、图文层次等都可能是问题点。
- how: 对摘抄卡做一轮 designqc（openwolf designqc），评估排版/对比度/层次，针对性优化 styles.css 中摘抄卡相关样式。

### OPT-017 — `model_logs` / `agent_traces` 缺少 user_id 索引，debug 看板随数据增长线性变慢
- status: done
- area: backend
- description: `init_db()` 创建了 `model_logs`、`agent_traces`、`agent_actions`、`agent_metrics` 四张表，但均无任何二级索引。`list_logs()`（`app_server.py:1810`）执行 `WHERE model_logs.user_id = ? ORDER BY model_logs.created_at DESC LIMIT 30`，是对全表的顺序扫描。Plus 用户每天 240 次调用，一年后该表有 8 万行以上，每次打开 `/debug/logs` 都要全扫。
- why: OPT-005（debug 看板）已上线、OPT-016（云 OCR）加速了 model_logs 写入速度；表增速比预期快。索引是零风险、零 schema 变更的修复，下次启动自动建好。
- how: 在 `init_db()` 的 `executescript` 块（`app_server.py:341`）追加三条 `CREATE INDEX IF NOT EXISTS`：`idx_model_logs_user_created ON model_logs(user_id, created_at)`、`idx_agent_traces_user_created ON agent_traces(user_id, created_at)`、`idx_agent_actions_trace ON agent_actions(trace_id)`。Touch: `app_server.py:337-490`

### OPT-018 — CSS 动画缺少 prefers-reduced-motion 保护，违反 WCAG 2.1 Level A
- status: triaged
- area: frontend
- description: `styles.css` 在 8+ 个选择器上使用 `transition`（lines 356, 552, 1058, 1848, 1974, 2180, 2553, 2729, 3440），并定义了无限循环的 `@keyframes chat-dot-pulse`（line 1878，AI 响应期间全程播放）。整个 3451 行样式表中 `prefers-reduced-motion` 出现 0 次。
- why: WCAG 2.1 SC 2.2.2（暂停/停止/隐藏，Level A）要求无限循环动画可由用户暂停——`chat-dot-pulse` 在 AI 响应时持续 5–30 秒无法暂停，是 Level A 违规。修复仅需 4 行 CSS。
- how: 在 `styles.css` `:root` 变量块之后（约 line 356 前）插入：`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`。无 HTML / JS 变更。Touch: `styles.css:350-360`

### OPT-019 — Toast 通知缺少 aria-live，屏幕阅读器用户无法感知所有瞬时反馈（WCAG 4.1.3 违规）
- status: triaged
- area: frontend
- description: `index.html:620` 的 `<div id="toast">` 没有 `role="status"` 或 `aria-live` 属性。`showToast()` 通过 JS 更新 `textContent` 并切换 CSS class，但屏幕阅读器只会朗读有 `aria-live` 的动态区域。登录过期、注册成功、表单验证失败等所有瞬时消息对辅助技术用户完全不可见。
- why: Toast 是 app 最主要的反馈通道（auth、表单提交、错误）。WCAG 2.1 SC 4.1.3（Status Messages，Level AA）要求状态消息可被辅助技术感知。修复仅需给 `#toast` 元素加一个 HTML 属性，零 JS 变更，零风险。
- how: 在 `index.html:620` 的 `<div id="toast" class="toast">` 上加 `role="status" aria-atomic="true"`。`role="status"` 隐含 `aria-live="polite"`，无需额外属性。Touch: `index.html:620`。

### OPT-020 — `PromptBuilder` 在书/摘抄上下文中注入无关的 `existing_connections`，每次对话浪费 ~200–2000 tokens
- status: triaged
- area: agent
- description: `PromptBuilder.build_chat_prompt()`（`app_server.py:2241`）无论 chat 上下文如何，始终把 `user_state["connections"][:20]` 注入 system prompt。针对书/摘抄上下文的系统指令（lines 2270-2275）明确写道：只有用户主动要求"建立关联"时才允许返回 `link_thought` action，即这批连接数据在 80%+ 的请求里被注入后又被指令禁止使用。有 50 条关联的用户每次请求额外注入 ~150 tokens；Plus 用户每日 240 次请求累计 36,000 多余 tokens。
- why: 直接降低 DeepSeek API 用量/成本，且不影响任何功能：全局上下文（无 book_id）仍注入 connections，书/摘抄上下文不再注入。修复是 1 行条件判断，零测试变更，零行为变更。
- how: 在 `app_server.py:2241` 将 `"existing_connections": user_state.get("connections", [])[:20]` 改为 `"existing_connections": [] if book_id else user_state.get("connections", [])[:20]`。Touch: `app_server.py:2241`。

### OPT-016 — 摘抄拍照后用非 AI 工具自动提取全文（备选录入方式）
- status: in-progress
- area: backend
- progress (2026-06-02):
  - 止血：快路径 Tesseract 语言由 `chi_sim+eng`→`chi_sim`，消灭整页拉丁乱码（bug-197）。
  - 中期落地：快路径接入**云 OCR（百度高精度版 accurate_basic）**，与 Kimi 同套 urllib、零新依赖、零 Dockerfile 改动。新增 `call_cloud_ocr`/`_baidu_access_token`(token 30天缓存)/`_resolve_fast_engine`/`run_fast_ocr`。三层回退：云 OCR → Tesseract(无 key/离线) → 提示改用 AI 精识别。env：`BAIDU_OCR_API_KEY`/`BAIDU_OCR_SECRET_KEY`/`FAST_OCR_ENGINE=auto|cloud|tesseract`。
  - 排版修复（bug-199）：endpoint 用 `accurate`（含位置）+ 新增 `_assemble_baidu_lines` 按位置滤掉对页串入噪声、把折行连续拼接、垂直大间距才分段。真机端到端输出干净连续。env `BAIDU_OCR_ENDPOINT` 可切。
  - 账户侧（bug-198）：百度 error 18(QPS) 需实名认证+控制台领取免费资源后才可用，已通。
  - 测试：tests/agent/quote_ocr_engine_test.py 21 passed（含云解析/token缓存/配额错误/回落/路由/滤噪拼接/分段/无位置回退）。
  - **待办**：owner 去百度智能云建应用拿 key（免费 1000次/月），配置后做真机端到端验证（mock 已全绿，无 key 时自动回落 Tesseract 实测可读）。
  - 已排除 Apple VisionKit/实况文本：纯原生 API、无 Web 接口，对本 Web App 不可行。
- description: （owner 提出）新增摘抄拍照后，提供一种「非 AI」的本地/快速 OCR 全文提取方式作为备选——现有 AI（Kimi vision / DeepSeek）太慢。
- why: AI OCR 延迟高，影响录入流畅度；一个快速的传统 OCR（如 Tesseract、Apple Vision/iOS 端 VisionKit、或浏览器端 OCR 库）能在多数清晰书页上秒级出文，作为默认快路径，AI 作为识别质量兜底。
- how: 评估候选——服务端 Tesseract（pytesseract，需装系统依赖）、iOS 端 VisionKit/Live Text（前端先做端上识别再上传文本）、或浏览器端 tesseract.js。优先考虑端上识别（零后端成本、最快）；提供「快速识别 / AI 精识别」两档供用户选。Touch: 摘抄 OCR 录入链路 app.js + app_server.py /api/quotes/ocr。

### OPT-021 — 暗色模式（系统跟随）— 由 explore E21 提拔
- status: done
- area: frontend
- description: App 无暗色模式；阅读类产品夜间使用是强场景。styles.css 全用 CSS 变量驱动，但 ~30 处硬编码色绕过变量会在深色背景漏色。
- why: 夜间体验 + 跟随系统设置（iOS13+/Android10+）。CSS 变量架构已就绪。
- done (2026-06-04, PR #21): 方案 B（仅系统跟随，无手动开关）。把 ~30 处硬编码色收编为语义变量（亮色字节不变=纯重构）+ 新增 `@media (prefers-color-scheme: dark) { :root { … } }` 覆盖 ~25 个 --color-* / 16 个 --status-* / 新语义变量；WCAG AA 对比度审计全过（正文 14.4:1 等）。**遗留**：手动开关（C 方案，data-theme + localStorage + 「我的」抽屉入口）未做；真·暗色截图未抓（designqc 无 dark 模拟），靠 grep + 程序化对比度审计验证，建议真机系统暗色肉眼复核一遍。

### OPT-022 — 登录/注册端点无限速，可遭暴力破解和垃圾注册 — 由 explore E31 提拔
- status: new
- area: backend
- description: `_enforce_rate_limit()` 仅对 `chat` 和 `ocr` 生效（line 4580/4823/4246/4291/4342）；`/api/login`（line 3939）、`/api/register`（line 3889）、`/api/password/reset-request`（line 4015）均无任何限速。攻击者可无限次尝试登录任意用户名，或批量注册账号（每次触发 DB 写入 + user_state 初始化）。
- why: 商业化产品含用户数据和付费入口；基线安全合规要求对认证端点有请求频率保护。现有 `check_and_record_rate_limit` 基于 user_id，需新增 IP/用户名维度的前置拦截。
- how: 在 `rate_limit_counters` 表中复用现有结构，以 `username` 或请求 IP 为 user_id 代理；在 `/api/login` 和 `/api/password/reset-request` 处理块顶部插入检查（失败尝试 > 10次/15分钟返回 429）；`/api/register` 加 IP 维度防刷。Touch: `app_server.py:3889, 3939, 4015`；复用 `app_server.py:1462-1530`。

### OPT-023 — `/media/` 图片路由无需鉴权且 CORS 设为通配符，私人图片可被任意网站跨域热链 — 由 explore E32 提拔
- status: new
- area: backend
- description: `/media/` 处理块（`app_server.py:3497-3519`）无任何认证检查，且返回 `Access-Control-Allow-Origin: *`（line 3509）+ `Cache-Control: public, max-age=31536000, immutable`。用户上传的书封/摘抄照片（含私人批注）一旦 URL 泄露（DevTools、导出文件等），任何第三方网站均可永久跨域内嵌。
- why: 最小修复仅需删除一行（去掉 `/media/` 响应中的 `Access-Control-Allow-Origin: *`）：前端图片全部走同源 `<img src>` 加载，通配 CORS 从无必要。S 复杂度，零功能回归，立即消除跨站热链风险。深度修复（对 `/media/` 加认证）可后续另立项。
- how: 删除 `app_server.py:3509` 的 `self.send_header("Access-Control-Allow-Origin", "*")` 一行。Touch: `app_server.py:3509`。
