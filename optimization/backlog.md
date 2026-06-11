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
- status: done
- area: backend
- description: call_deepseek()（app_server.py:2703）遇到任何 HTTPError / URLError 即直接抛出，没有重试。该函数被三处生产路径调用：(a) 流式 stream_finish_reason != "stop" 后的非流式 fallback（line 4101）；(b) Kimi vision 失败后的 OCR DeepSeek 备线（line 1821）；(c) 对话历史压缩（line 1826）。DeepSeek API 在高负载下偶发 429、502，三条路径均会静默失败并向用户报错。
- why: call_kimi_vision() 已有 KIMI_VISION_MAX_ATTEMPTS=2 的重试逻辑（line 2794, 2835-2850），同一项目内已有可复用的模式。对话历史压缩失败会静默截断上下文，影响最活跃用户的 AI 质量。添加指数退避重试（最多 2 次，重试码 429/500/502/503）几乎不增加正常路径延迟。
- how: 在 call_deepseek() 增加 retries 参数（默认 2），捕获到可重试的 HTTPError 时 sleep(1) 后重试；或提取为 _retryable_deepseek_call() wrapper 复用。参照 call_kimi_vision() 的 attempt 循环实现。Touch: app_server.py:2703-2731；调用方 line 1821, 1826, 4101 无需改动。

### OPT-013 — 按钮缺少 :focus-visible 样式，键盘用户无法看到焦点位置（WCAG 违规）
- status: done
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
- status: done
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
- status: done
- area: frontend
- description: `styles.css` 在 8+ 个选择器上使用 `transition`（lines 356, 552, 1058, 1848, 1974, 2180, 2553, 2729, 3440），并定义了无限循环的 `@keyframes chat-dot-pulse`（line 1878，AI 响应期间全程播放）。整个 3451 行样式表中 `prefers-reduced-motion` 出现 0 次。
- why: WCAG 2.1 SC 2.2.2（暂停/停止/隐藏，Level A）要求无限循环动画可由用户暂停——`chat-dot-pulse` 在 AI 响应时持续 5–30 秒无法暂停，是 Level A 违规。修复仅需 4 行 CSS。
- how: 在 `styles.css` `:root` 变量块之后（约 line 356 前）插入：`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`。无 HTML / JS 变更。Touch: `styles.css:350-360`

### OPT-019 — Toast 通知缺少 aria-live，屏幕阅读器用户无法感知所有瞬时反馈（WCAG 4.1.3 违规）
- status: done
- area: frontend
- description: `index.html:620` 的 `<div id="toast">` 没有 `role="status"` 或 `aria-live` 属性。`showToast()` 通过 JS 更新 `textContent` 并切换 CSS class，但屏幕阅读器只会朗读有 `aria-live` 的动态区域。登录过期、注册成功、表单验证失败等所有瞬时消息对辅助技术用户完全不可见。
- why: Toast 是 app 最主要的反馈通道（auth、表单提交、错误）。WCAG 2.1 SC 4.1.3（Status Messages，Level AA）要求状态消息可被辅助技术感知。修复仅需给 `#toast` 元素加一个 HTML 属性，零 JS 变更，零风险。
- how: 在 `index.html:620` 的 `<div id="toast" class="toast">` 上加 `role="status" aria-atomic="true"`。`role="status"` 隐含 `aria-live="polite"`，无需额外属性。Touch: `index.html:620`。

### OPT-020 — `PromptBuilder` 在书/摘抄上下文中注入无关的 `existing_connections`，每次对话浪费 ~200–2000 tokens
- status: done
- area: agent
- description: `PromptBuilder.build_chat_prompt()`（`app_server.py:2241`）无论 chat 上下文如何，始终把 `user_state["connections"][:20]` 注入 system prompt。针对书/摘抄上下文的系统指令（lines 2270-2275）明确写道：只有用户主动要求"建立关联"时才允许返回 `link_thought` action，即这批连接数据在 80%+ 的请求里被注入后又被指令禁止使用。有 50 条关联的用户每次请求额外注入 ~150 tokens；Plus 用户每日 240 次请求累计 36,000 多余 tokens。
- why: 直接降低 DeepSeek API 用量/成本，且不影响任何功能：全局上下文（无 book_id）仍注入 connections，书/摘抄上下文不再注入。修复是 1 行条件判断，零测试变更，零行为变更。
- how: 在 `app_server.py:2241` 将 `"existing_connections": user_state.get("connections", [])[:20]` 改为 `"existing_connections": [] if book_id else user_state.get("connections", [])[:20]`。Touch: `app_server.py:2241`。

### OPT-016 — 摘抄拍照后用非 AI 工具自动提取全文（备选录入方式）
- status: done
- area: backend
- done (2026-06-08): owner 已在百度智能云建应用、配置 `BAIDU_OCR_API_KEY`/`BAIDU_OCR_SECRET_KEY`，完成实名认证 + 领取免费资源（1000 次/月），真机端到端验证通过。云 OCR 快路径（accurate + `_assemble_baidu_lines` 滤噪拼接）上线，三层回退（云 OCR → Tesseract → AI 精识别）就位。
- progress (2026-06-02):
  - 止血：快路径 Tesseract 语言由 `chi_sim+eng`→`chi_sim`，消灭整页拉丁乱码（bug-197）。
  - 中期落地：快路径接入**云 OCR（百度高精度版 accurate_basic）**，与 Kimi 同套 urllib、零新依赖、零 Dockerfile 改动。新增 `call_cloud_ocr`/`_baidu_access_token`(token 30天缓存)/`_resolve_fast_engine`/`run_fast_ocr`。三层回退：云 OCR → Tesseract(无 key/离线) → 提示改用 AI 精识别。env：`BAIDU_OCR_API_KEY`/`BAIDU_OCR_SECRET_KEY`/`FAST_OCR_ENGINE=auto|cloud|tesseract`。
  - 排版修复（bug-199）：endpoint 用 `accurate`（含位置）+ 新增 `_assemble_baidu_lines` 按位置滤掉对页串入噪声、把折行连续拼接、垂直大间距才分段。真机端到端输出干净连续。env `BAIDU_OCR_ENDPOINT` 可切。
  - 账户侧（bug-198）：百度 error 18(QPS) 需实名认证+控制台领取免费资源后才可用，已通。
  - 测试：tests/agent/quote_ocr_engine_test.py 21 passed（含云解析/token缓存/配额错误/回落/路由/滤噪拼接/分段/无位置回退）。
  - ~~**待办**：owner 去百度智能云建应用拿 key，配置后做真机端到端验证~~ → 已完成（见上方 done 行，2026-06-08）。
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
- status: done (2026-06-08, PR #28)
- area: backend
- description: `_enforce_rate_limit()` 仅对 `chat` 和 `ocr` 生效（line 4580/4823/4246/4291/4342）；`/api/login`（line 3939）、`/api/register`（line 3889）、`/api/password/reset-request`（line 4015）均无任何限速。攻击者可无限次尝试登录任意用户名，或批量注册账号（每次触发 DB 写入 + user_state 初始化）。
- why: 商业化产品含用户数据和付费入口；基线安全合规要求对认证端点有请求频率保护。现有 `check_and_record_rate_limit` 基于 user_id，需新增 IP/用户名维度的前置拦截。
- how: 在 `rate_limit_counters` 表中复用现有结构，以 `username` 或请求 IP 为 user_id 代理；在 `/api/login` 和 `/api/password/reset-request` 处理块顶部插入检查（失败尝试 > 10次/15分钟返回 429）；`/api/register` 加 IP 维度防刷。Touch: `app_server.py:3889, 3939, 4015`；复用 `app_server.py:1462-1530`。

### OPT-023 — `/media/` 图片路由无需鉴权且 CORS 设为通配符，私人图片可被任意网站跨域热链 — 由 explore E32 提拔
- status: done (2026-06-06, PR #24)
- done note: 已删除 `/media/` 响应的 `Access-Control-Allow-Origin: *`（消除跨站热链），+ `tests/agent/media_cors_test.py` 5 例回归守卫。**范围限定**：仅做了最小 CORS 修复；`/media/` 仍无鉴权（任意持 URL 者可访问），深度修复（加 token/签名校验）如需可另立新项。
- area: backend
- description: `/media/` 处理块（`app_server.py:3497-3519`）无任何认证检查，且返回 `Access-Control-Allow-Origin: *`（line 3509）+ `Cache-Control: public, max-age=31536000, immutable`。用户上传的书封/摘抄照片（含私人批注）一旦 URL 泄露（DevTools、导出文件等），任何第三方网站均可永久跨域内嵌。
- why: 最小修复仅需删除一行（去掉 `/media/` 响应中的 `Access-Control-Allow-Origin: *`）：前端图片全部走同源 `<img src>` 加载，通配 CORS 从无必要。S 复杂度，零功能回归，立即消除跨站热链风险。深度修复（对 `/media/` 加认证）可后续另立项。
- how: 删除 `app_server.py:3509` 的 `self.send_header("Access-Control-Allow-Origin", "*")` 一行。Touch: `app_server.py:3509`。

### OPT-024 — `ActionExecutor` 使用 `datetime.now().isoformat()`，agent 创建的记录带本地时区 + 微秒精度，产生与 OPT-014 完全一致的排序错位 bug — 由 explore E36 提拔
- status: done (2026-06-07, PR #25)
- area: agent
- description: `ActionExecutor.execute_action()` 在 7 处调用 `datetime.now().isoformat()`（`app_server.py:2971, 2994, 3014, 3024, 3035, 3045, 3074`），为 `add_note`/`add_book`/`summary`/`tag`/`question`/`link_thought` 生成的记录写入 naive 本地时间 + 微秒（如 `2026-06-05T20:34:56.123456`）。OPT-014 已修复 OCR 路径用 `utc_now_iso()`，但 ActionExecutor 路径漏修。前端 `new Date(b.createdAt) - new Date(a.createdAt)` 将该字符串解析为本地时间，东八区服务器上 agent 创建的记录时间比同时刻用户创建的记录（UTC+Z）字面快 ~8 小时，导致 agent 生成的书/摘抄/问题始终排在最前面。
- why: 任何使用 agent action 功能的用户都受影响；根因与 OPT-014 完全相同，修复方式一致。7 处调用全部替换为 `utc_now_iso()`，无 schema 变更，无测试变更，零风险。
- how: 在 `ActionExecutor.execute_action()`（`app_server.py:2955-3077`）将所有 `datetime.now().isoformat()` 替换为 `utc_now_iso()`（函数已存在于 line 285）。Touch: `app_server.py:2971, 2994, 3014, 3024, 3035, 3045, 3074`。

### OPT-025 — `agent_trace_events` 表无 `trace_id` 索引，trace 详情查询全表扫描 — 与 OPT-017 同类遗漏 — 由 explore E37 提拔
- status: done (2026-06-08, PR #30)
- area: backend
- description: `init_db()` 为 `model_logs`、`agent_traces`、`agent_actions`、`agent_metrics` 都创建了二级索引（`app_server.py:500-508`），但 `agent_trace_events` 表（line 421）无任何索引。`get_trace()` 在 line 2645 执行 `SELECT … FROM agent_trace_events WHERE trace_id = ? ORDER BY created_at ASC`，对无索引表做全扫。`agent_trace_events` 增速与 `agent_traces` 相同；Plus 用户一年后该表超 25 万行，每次 trace 详情加载全扫。
- why: OPT-017 修复了同类问题但遗漏了此表。新增一条 `CREATE INDEX IF NOT EXISTS` 是零风险修复，下次启动自动建好，无 schema 变更，无接口变更。
- how: 在 `init_db()` 的 `executescript` 块（`app_server.py:500-509`）追加：`CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON agent_trace_events(trace_id, created_at);`。Touch: `app_server.py:500-509`。

### OPT-026 — 「书单」卡片右上角三个点（···）操作入口太不明显
- status: done
- done (2026-06-08, 随 OPT-027 一并解决): `.card-menu-btn` 从无背景/低对比的隐形字符改成「半透明圆底 + 边框 + 阴影 + `:focus-visible`」的真按钮，glyph 由 `···` 换成横排 `⋯`；现在书/记录/摘抄三种卡统一用同一个可见菜单钮。`styles.css` `.card-menu-btn`。
- area: frontend
- description: （owner 提出）书单页卡片的操作菜单触发器是右上角的 `···`（`.card-menu-btn`，渲染于 `app.js:1027`，文案就是三个点字符），视觉上几乎看不出是可点的按钮——颜色淡、无边框/背景、与封面叠在一起，用户发现不了编辑/删除藏在这里。
- why: 操作入口的可发现性差，新用户找不到怎么改书/删书。可见性（contrast/affordance）是基础可用性问题。
- how: 在 `styles.css` 的 `.card-menu-btn`（约 line 1254 区域）增强可见性——加半透明圆形背景/描边、提高 `color` 对比、hover/active 反馈；必要时换更通用的图标（竖排三点 ⋯ 或齿轮）。注意暗色模式用 `var(--color-*)` token。Touch: `styles.css`（`.card-menu-btn` 规则）。
- 关联: 与 OPT-027 是同一处 UI，建议合并一轮处理。

### OPT-027 — 卡片操作入口三个页面不统一（书单藏在 ··· 菜单，记录/摘抄是卡面内联按钮）
- status: done
- done (2026-06-08, 方向① 详情即操作中心 + 卡面统一 ⋯ 菜单): owner 拍板后核了全链路代码，发现错位不止卡面、还含详情弹窗（书详情只读、记录无详情、摘抄 action 集卡面/详情互不覆盖）。统一操作模型落地：
  - **卡面**：书/记录/摘抄三种卡统一用可见的 `⋯` 溢出菜单（抽 `closeAllCardMenus`/`toggleCardMenu` 共享 helper + 文档级 click-outside）；删除/编辑从内联钮移入菜单。
  - **详情=操作中心**：新建 `sessionDetailDialog`（记录原本无详情）；书详情补全 footer（去聊/编辑/关联/新增摘抄/新增记录/删除）；摘抄详情补「删除」。三个详情 footer 统一 `dialog-actions-stack`：1 primary（去聊）+ ghost + danger，消灭摘抄详情「3 个等权金块」。
  - 删除死 CSS（`.entry-card-actions`/`.card-action-*`）。117 JS 测试全绿（含新增 OPT-027 守卫 + 改写 P1-002 删除守卫到新选择器）。
  - **遗留**：真机/designqc 截图未抓，建议肉眼复核菜单在封面图卡 vs 纯色卡的对比、以及 7 按钮书详情 footer 在小屏的滚动观感。
- area: frontend
- description: （owner 提出）操作入口模式不一致：「书单」卡把编辑/删除收进右上角 `···` 弹出菜单（`.card-context-menu` / `menu-item-danger`，`app.js:1029-1035`），而「记录」「摘抄」卡把删除直接做成卡面内联按钮（`.card-action-btn.card-action-danger`，`app.js:1269` / `1338`）。同一 app 两套交互范式，用户在不同页面要重新学怎么操作。
- why: 一致性是 UI 基本要求；不统一既增加认知负担，也让人以为某些卡「不能编辑/删除」。
- how: **需先定方向（owner 决策）**——(A) 全部统一到 `···` 溢出菜单（卡面更干净，适合操作多/封面为主的书单）；(B) 全部统一到卡面内联按钮（更直接，少一次点击）。选定后改 `app.js` 三个 render 路径（books / session / quote 卡）+ `styles.css` 对应样式，使三页结构与类名一致。Touch: `app.js`（renderBooks/renderTimeline/renderQuotes 卡片模板）、`styles.css`。
- 关联: 与 OPT-026 同处 UI；若选方案 A，OPT-026 的「让 ··· 更明显」正好一并解决。

### OPT-028 — `/debug/*` 端点在 `ADMIN_TOKEN` 未设置时对所有人开放，所有用户 AI 对话内容可被任意访问 — 由 explore E41 提拔
- status: done (2026-06-08, PR #26)
- area: backend
- description: `_authorized_for_admin()` 在 `app_server.py:3380` 当 `AUTH_TOKEN`（= `$ADMIN_TOKEN` 环境变量）为空时无条件返回 `True`。三个 debug 页面（`/debug/logs`、`/debug/errors`、`/debug/agent-dashboard`）因此在默认部署（未设置 `ADMIN_TOKEN`）下对任何知道 URL 的人完全公开。`/debug/logs` 渲染所有用户最近 100 条模型调用，包含完整 system prompt（含每个用户的书单、摘抄、笔记内容）、每条用户消息和 AI 响应。
- why: 默认配置即是生产风险。任何人发现该 URL 即可读取所有付费用户的私人阅读对话，无需认证。这是一个 P0 隐私/安全漏洞。修复只需两行：将 `if not AUTH_TOKEN: return True` 改为要求经过认证的管理员会话，复用现有 `is_admin_username()` 检查。
- how: 在 `_authorized_for_admin()`（`app_server.py:3379-3382`）中，将 `if not AUTH_TOKEN: return True` 改为：用 `resolve_user_from_token(conn, self._get_token())` 解析 bearer token，若 user 存在且 `is_admin_username(user["username"])` 则返回 True，否则返回 False。当 `AUTH_TOKEN` 有值时保留原有 header 校验逻辑。Touch: `app_server.py:3379-3382`。

### OPT-029 — `execute_action()` 读改写非原子操作——两个标签页并发审批动作会静默丢弃彼此的状态变更 — 由 explore E42 提拔
- status: done (2026-06-08, PR #27 Layer A + PR #29 Layer B)
- area: agent
- description: `ActionExecutor.execute_action()`（`app_server.py:2956-3080`）的模式是：`state = load_state()` → Python 内存中修改 → `save_state()`，全程无 `BEGIN IMMEDIATE` 事务保护。两个浏览器标签页各自批准不同 agent 动作时，可同时读取相同初始状态、分别写入，第二次写入静默覆盖第一次的修改。例如：Tab A 读到 books=[B1] 后添加 B2，Tab B 同时读到 books=[B1] 后添加 B3，Tab A 写入 [B1, B2]，Tab B 写入 [B1, B3]——B2 永久丢失，用户无任何错误提示。
- why: agent action（`add_book`、`add_note`、`summary`、`tag`、`link_thought`）是不可逆的状态变更，静默数据丢失极难排查。修复方案：在 `execute_action()` 的读改写周期中加 `BEGIN IMMEDIATE`，利用 SQLite 写串行化保证原子性。
- how: 在 `execute_action()` 中 `load_state()` 调用前加 `conn.execute("BEGIN IMMEDIATE")`；`save_state()` 内部已调用 `conn.commit()` 作为提交。在 execute 端点（`app_server.py:5025`）捕获 `sqlite3.OperationalError: database is locked` 并返回 503。Touch: `app_server.py:2956-3080`；`app_server.py:5025-5095`（execute handler）。

### OPT-030 — 跨设备 state 整体覆盖——两个设备同时编辑静默丢失彼此的变更 — 由 explore E35 提拔
- status: done (2026-06-08, PR #29)
- area: frontend + backend
- description: `PUT /api/state`（`syncState()`）做无条件全量覆盖（blind last-write-wins）。两台设备同分钟内各自编辑——手机加了摘抄、桌面改了备注——第二次 PUT 静默覆盖第一次写入，数据永久丢失且无任何提示。OPT-029 Layer A 仅序列化并发 execute_action 调用，不覆盖此场景。
- why: 多设备使用是用户常态；整体 blob 的 last-write-wins 是最高风险的静默数据丢失来源。
- how: 以 `user_state.updated_at` 作乐观锁版本号（零 schema 变更）；后端 `save_state_checked()` 做条件 UPDATE，版本不匹配返回 409 + 当前 server state；前端 `apiFetch` 统一捕获 `stateVersion`，`syncState()` 发 `X-State-Version` header，409 时接受 server state 并 toast 提示而非覆盖。Touch: `app_server.py`（save_state / PUT /api/state handler）；`app.js`（apiFetch / syncState）；`chat.js`（SSE done event stateVersion capture）。

### OPT-031 — `reading_mcp_server.py` 的 `_now_iso()` 使用 naive 本地时间，与 OPT-024 完全相同的排序 bug — 由 explore E47 提拔
- status: done (2026-06-09, PR #32)
- area: agent
- description: `reading_mcp_server.py:50-51` 的 `_now_iso()` 定义为 `return datetime.now().isoformat()`，与 OPT-024 修复前 ActionExecutor 的写法完全相同。该函数用于 MCP 工具写入的所有 `createdAt`/`updatedAt`：`add_note`（line 170）、`add_book`（lines 272-273）、`summary`（line 318）、`tag`（line 402）、`link_thought`（line 488）。OPT-024 修复了旧执行路径，但 MCP 路径独立开发，从未更新。
- why: 前端以 `new Date(b.createdAt) - new Date(a.createdAt)` 排序书籍和摘抄。UTC+8 服务器上 MCP 创建的记录本地时间字面比同时刻用户创建记录（UTC+Z）大 ~8 小时，导致 agent 通过 MCP 工具新增的书/摘抄恒排在最前面——与 OPT-024 的根因完全一致，影响所有使用 agent action 功能的用户。修复方式也与 OPT-024 完全一致，极低风险。
- how: 将 `reading_mcp_server.py:50-51` 的 `_now_iso()` 改为返回 UTC+Z 格式（`datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`，或从 `app_server.py` import `utc_now_iso`）。在 `tests/agent/reading_mcp_server_tools_test.py` 中加一条断言：工具返回的 `createdAt` 以 `Z` 结尾。Touch: `reading_mcp_server.py:50-51`；`tests/agent/reading_mcp_server_tools_test.py`。

### OPT-032 — `_run_gc()` 缺少 `PRAGMA wal_checkpoint(TRUNCATE)`，WAL 文件持续膨胀从不回收 — 由 explore E51 提拔
- status: triaged
- area: backend
- description: `get_conn()` 在 `app_server.py:334` 启动时设置 `PRAGMA journal_mode = WAL`，但从未显式触发完整检查点（TRUNCATE 模式）。SQLite 默认的自动检查点（PASSIVE，1000 页阈值）在并发读负载下遇到活跃 reader 时会跳过，不回收 WAL 文件磁盘空间。`_run_gc()` 每 6 小时运行一次，使用独立 connection，是执行显式检查点的天然位置。
- why: 每天 240 次写入、持续运行数周后，WAL 文件可累积至数十 MB 且永不收缩。`PRAGMA wal_checkpoint(TRUNCATE)` 等待所有 reader 退出后将 WAL 清零，一行代码即可消除这一静默磁盘泄漏。该调用是幂等且无副作用的——若无 WAL 页需要刷盘，调用直接返回。
- how: 在 `_run_gc()` 的 try 块末尾（`app_server.py:5244` 之前）追加 `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")`。在 `gc_thread_test.py` 中加一条断言验证该调用存在。Touch: `app_server.py:5236-5244`；`tests/agent/gc_thread_test.py`。

### OPT-033 — `<dialog>` 元素缺少 `aria-labelledby`，屏幕阅读器宣告模态框时无名称（WCAG 4.1.2 Level A） — 由 explore E50 提拔
- status: done (PR #34, 2026-06-11)
- area: frontend
- description: `index.html` 中共有 12 个 `<dialog>` 元素（`bookEditDialog`、`bookDetailDialog`、`bookDialog`、`sessionDialog`、`quoteDialog`、`quoteDetailDialog`、`sessionDetailDialog`、`deleteBookDialog`、`confirmDialog`、`forgotPasswordDialog`、`resetPasswordDialog`、`connectionDialog`，lines 327/355/381/416/441/486/509/526/539/550/562/575）均无 `aria-labelledby` 属性。每个 dialog 都含有可见的 `<h2>` 标题（如「新增书籍」「编辑书籍」），信息已存在但未与 dialog 通过 ARIA 关联。屏幕阅读器焦点进入 dialog 时只会宣告「dialog」，用户无法得知当前打开了哪个模态框。
- why: WCAG 2.1 SC 4.1.2（Name, Role, Value — Level A）要求交互 UI 组件有无障碍名称；`<dialog>` 元素没有 `aria-label` 或 `aria-labelledby` 时其 accessible name 为空。这是最严重等级（Level A）的合规缺口。修复完全是加法操作——给已有的 `<h2>` 加 `id`、给 `<dialog>` 加 `aria-labelledby`，无任何逻辑变更，零风险。这也延续了 OPT-013/018/019 的无障碍系列修复。
- how: 对每个 dialog：给其内部 `<h2>` 加 `id`（如 `id="bookDialogTitle"`），给 `<dialog>` 加 `aria-labelledby="bookDialogTitle"`；对无 `<h2>` 的 confirm 类 dialog 改用 `aria-label`。约 12 个 dialog × 2 属性 = 24 处 HTML 属性添加，无 JS 变更。Touch: `index.html:327-620`。

### OPT-034 — debug 看板将用户内容直接插入 HTML f-string，存在存储型 XSS — 由 explore E52 提拔
- status: done (2026-06-10, PR #33)
- area: backend
- description: `/debug/logs` 的 HTML 生成块（`app_server.py:3848-3885`）通过 f-string 直接注入 `row['prompt']`、`row['input']`、`row['output']`、`row['username']`、`row['error']`、`json.dumps(action['data'])` 等字段，未做任何 HTML 转义。`app_server.py` 未 `import html`。注册用户只要发送一条包含 `</pre><script>…</script>` 的聊天消息，该内容即被存入 `model_logs.input`；admin 打开 `/debug/logs` 时 payload 在其浏览器中执行，可读取所有用户 state、伪造 API 调用或劫持管理员会话。`/debug/errors` 和 `/debug/agent-dashboard` 的 HTML 生成块存在相同模式。
- why: OPT-028 已将 `/debug/*` 访问限制为 loopback 或 admin 用户，但任何已注册用户均可植入恶意内容。存储型 XSS 是商业应用的 P1 安全缺陷。修复只需 `import html`（stdlib）并对全部用户可控插值点调用 `html.escape()`，代价极低。
- how: 在 `app_server.py` 顶部 imports 中加 `import html`；在 `/debug/logs`（lines 3848-3885）、`/debug/errors`（~line 3917）、`/debug/agent-dashboard`（~line 3950）的 HTML builder 中，将 `{row['prompt']}`、`{row['input']}`、`{row['output']}`、`{row['username']}`、`{row['error']}`、`{action['errorMessage']}`、`{json.dumps(action['data'],...)}`（这些由 `json.dumps` 已是字符串，仍需转义 `<>&`）全部替换为 `{html.escape(str(…))}`。约 10 处替换，无逻辑变更，无测试变更（可加一条回归断言：插入 `<script>` 消息后 debug HTML 中不含 `<script>`）。Touch: `app_server.py:3848-3885`；扫描 ~3917、~3950 同类块。

### OPT-035 — `TraceManager` 三个方法使用 `now_iso()` (naive 本地时间)，与项目 UTC 时间戳策略不一致 — 由 explore E56 提拔
- status: new
- area: backend
- description: `TraceManager.create_trace()`（`app_server.py:2676`）、`log_event()`（line 2695）、`update_trace()`（line 2702）均调用 `now_iso()` 写入 `agent_traces` 和 `agent_trace_events` 表的 `created_at`/`updated_at`。项目已通过 OPT-014/024/031 将所有用户可见时间戳迁移到 `utc_now_iso()`，但 `TraceManager` 属于独立类，在上述修复中被遗漏。`/debug/agent-dashboard` 展示这些时间戳，`/api/account/export` 也包含 `agentTraces`。
- why: 同一服务器上的时间戳自洽，但服务器时区变更（Docker rebuild、云迁移）后新旧记录产生 +8h 断层；与 `user_state.updated_at`（已是 UTC）进行关联分析时会出现虚假偏移。修复仅需将 3 处 `now_iso()` 替换为 `utc_now_iso()`，零逻辑变更，零测试变更。
- how: 将 `app_server.py:2676, 2695, 2702` 的 `now_iso()` 替换为 `utc_now_iso()`。Touch: `app_server.py:2676, 2695, 2702`（TraceManager 类）。

### OPT-036 — `summarize_metrics()` 对全量历史数据做 O(n) 扫描——每次打开 `/debug/logs` 线性变慢 — 由 explore E40 提拔
- status: new
- area: backend
- description: `MetricsCollector.summarize_metrics()`（`app_server.py:2870-2940`）执行 `SELECT … FROM agent_metrics WHERE user_id = ?`，无任何时间过滤，无 `LIMIT`。Plus 用户每天 240 次请求，一年后 `agent_metrics` 表超 87,000 行；每次 `/debug/logs` 或 `/debug/metrics` 加载都触发完整拉取 + 逐行 `json.loads()`，延迟随使用时长线性增长。`idx_agent_metrics_user` 索引（OPT-017）避免了跨用户扫描，但仍返回该用户所有历史行。
- why: debug 看板是运营者监控 AI 质量的主要工具，打开速度越来越慢会直接影响日常运营。90 天滚动窗口覆盖所有实用的调试历史（配置变更、模型升级、回归分析），同时将最大扫描行数封顶在约 21,600 行。修复仅需在 SQL WHERE 子句追加一个时间条件，一行代码。
- how: 在 `app_server.py:2875` 的 `WHERE user_id = ?` 后追加 `AND created_at > datetime('now', '-90 days')`；在 debug 看板 section 标题字符串中更新为"近 90 天汇总"（约 1 处 JS/HTML 字符串）。Touch: `app_server.py:2870-2878`；可选 `app.js` 或 debug HTML 模板中更新标签。

### OPT-037 — `compareBooksForList()` 对 `createdAt` 仍用 `localeCompare` 字符串排序——OPT-014 防御性修复遗漏了书单排序 — 由 explore E61 提拔
- status: new
- area: frontend
- description: `compareBooksForList()`（`app.js:1026`）对同状态书籍做二级排序时使用 `(b.createdAt || "").localeCompare(a.createdAt || "")`。OPT-014 已将 `renderQuotes()` 改为 `Date.parse(b.createdAt) - Date.parse(a.createdAt)` 防御性修复，但 `compareBooksForList()` 未同步。另 `app.js:2431` 用同一模式查找最近活跃书籍。OPT-024/031 完成后所有时间戳已统一 UTC+Z，但 `localeCompare` 在同一秒内对有毫秒（`...000Z`）与无毫秒（`...Z`）的字符串排序结果相反（"Z" ASCII 90 > "." ASCII 46），导致 agent 创建的书籍与用户创建的书籍在同秒添加时顺序错误。
- why: OPT-014 的修复原则是"全部时间戳改为 epoch 数值比较"；`compareBooksForList()` 是遗漏的执行点。书单是 App 首屏主视图，排序错误直接可见。修复是 2 处各一行代码，零风险。
- how: 将 `app.js:1026` 的 `(b.createdAt || "").localeCompare(a.createdAt || "")` 改为 `(Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)`（降序 = b - a）；同样修复 `app.js:2431`。Touch: `app.js:1026, 2431`。

### OPT-038 — 用户注册与 `ensure_user_state()` 使用 `now_iso()` 写入 `user_state.updated_at`——与 `save_state()` 的 `utc_now_iso()` 不一致，污染乐观锁版本字段 — 由 explore E65 提拔
- status: new
- area: backend
- description: 用户注册处理器（`app_server.py:4057-4061`）用 `now_iso()` 写入 `users.created_at`、`users.terms_accepted_at` 和首条 `user_state.updated_at`；`ensure_user_state()`（`app_server.py:676`）同样用 `now_iso()` 写入 `user_state.updated_at`（INSERT OR IGNORE 路径）。而 `save_state()`（`app_server.py:704`）已改用 `utc_now_iso()`。OPT-030（乐观锁）以 `user_state.updated_at` 作为版本号返回给客户端（`stateVersion`）；新用户的首个 `stateVersion` 是 naive 本地时间，后续所有写入是 UTC+Z，造成版本字段在同一列内格式不一致（初始行 naive，更新行 UTC）。
- why: 完成 OPT-014 系列（OPT-024/031/035）的最后一块拼图。`users.created_at` 出现在账号导出和 `/api/session` 响应中；naive 时间戳与其他 UTC 字段不一致。最关键的是 `ensure_user_state()` 的 naive `updated_at`：若新注册用户在首次 `PUT /api/state` 前被并发 GC 或 schema 迁移触发 `ensure_user_state()` 重写，版本字段会被重置为 naive，后续乐观锁比较将持续失败直到用户发起 PUT（覆盖为 UTC）。5 处替换，零逻辑变更。
- how: 将 `app_server.py:676`（`ensure_user_state`）和 `app_server.py:4057, 4061`（注册处理器）中的 `now_iso()` 替换为 `utc_now_iso()`。共 4 次调用替换（`4057` 行含 2 次：`created_at` 和 `terms_accepted_at`）。Touch: `app_server.py:676, 4057-4061`。

### OPT-039 — 数据库连接泄漏：E26 安全网未覆盖 `_require_user` 之外的内联 `get_conn()` — 由 explore E26 提拔
- status: done (PR #35, 2026-06-11)
- area: backend
- note: 原登记为 OPT-037，与夜间 agent 并发认领的 OPT-037（localeCompare 排序）/OPT-038 撞号，改为 OPT-039。PR #35 标题/分支/代码注释仍含 "OPT-037" 字样，以唯一的 explore ID **E26** 为准。
- description: E26 安全网（`handle_one_request` 的 `finally` 关闭 `self._active_conn`）**只登记 `_require_user()` 开的连接**。7 个不走 `_require_user` 的 handler 自行 `conn = get_conn()`：`/debug/logs`、`/debug/errors`、`/debug/agent-dashboard`，以及鉴权前端点 `/api/register`、`/api/login`、`/api/password/reset-request`、`/api/password/reset`。这些连接未登记，handler body 在显式 `conn.close()` 前抛异常即泄漏连接（及其 SQLite 共享锁），最终在**无关请求**上爆 `database is locked`。最讽刺：泄漏风险最高的公网鉴权端点（无需登录、最易被攻击者高频打），恰恰因为跑在 `_require_user` 之前而落在安全网外。
- why: 连接泄漏是隐蔽的生产稳定性问题，运行越久越危险，且报错点（database is locked）与泄漏点（某个抛异常的 handler）完全错位，极难定位。
- how: 方案 A（已采用，最小侵入）——新增 `self._open_conn()` helper（= `get_conn()` + 登记 `self._active_conn`），把 7 处裸 `get_conn()` 加 `_require_user` 自身全部改走它，复用已验证的 finally 一处兜底。正常路径零行为变更（sqlite3 双关闭是 no-op）。方案 C（全量 `with` 单一范式重构）已评估并刻意推迟为独立大改。Touch: `app_server.py`（`_open_conn` + 8 处）；`tests/agent/connection_leak_test.py`（新增 3 测试，驱动真实请求过 `handle_one_request` + 注入中途异常）。

### OPT-040 — 导入「完整账号导出（GDPR）」文件会静默清空账号 + 该导出实际不可恢复 — 由 explore E10 重新定性提拔
- status: done (PR #36, merged 2026-06-11)
- area: frontend
- note: **E10 的前提（"没有 import 端点、备份不可恢复"）经核对不成立**——前端早有 `importData()`（`app.js:2933`）+ "导入数据" 入口（`index.html:296`），常规「导出书单备份」经 `PUT /api/state` 可正常恢复，无需新建后端端点。真正的缺陷是下面这个更危险的格式不一致 bug，故按修正后的描述登记，不照搬 E10 原文。
- description: 存在两种导出格式：①「导出书单备份」`exportData()`（`app.js:2794`）客户端直接 dump `state`，字段在**顶层**（`books/sessions/quotes/...`）；②「完整账号导出（GDPR）」`GET /api/account/export`（`app_server.py:3745`）把 state **嵌在 `.state`** 下并带 `exportFormat:1`。而 `importData()` 只读**顶层** `parsed.books/...`。用户若把 GDPR 导出文件喂给「导入数据」：顶层字段全 `undefined` → 落成全空 state → `syncState()` 用空 state **覆盖整个账号**（`index.html:297` 自承"会替换当前账号的全部内容"），且无任何二次确认 → 数据全删。即被标榜"合规/可迁移"的那份导出既不可恢复、导入还会清空账号。
- why: 静默数据丢失（最高危类别），且诱导性强——用户以为在"恢复备份"，实际在清空。修复完全在前端，零后端改动、零新端点。
- how: 方案 A（已采用，最小）——`importData()` 加格式自适应：检测 `exportFormat`/`.state` 则解包 `parsed.state`，否则按旧顶层格式；并加清空护栏：解析后内容计数为 0 而当前账号非空时，弹 `confirmDialog` 二次确认而非静默覆盖；JSON 解析失败给明确 toast。方案 B（后端 `POST /api/account/import`）评估后判为伪需求（与 `PUT /api/state` 重复、且单独做修不掉前端清空 bug），不采用。Touch: `app.js`（`importData` + 新增 `resolveImportedState`/内容计数 helper）；`tests/frontend/account-import-format.test.js`（新增）。

### OPT-041 — 导入成功反馈太不起眼（右下角 toast，重操作易被忽略）— owner 真机测试提出
- status: done (PR #37, merged 2026-06-11)
- area: frontend
- description: （owner 提出）OPT-040 修好导入安全后，导入成功仍只弹右下角的「数据已导入」toast（~2.2s 自动消失），owner 第一次导入没注意到。导入是"整体替换账号"的重操作，反馈应更强。
- why: 重操作（覆盖全账号）需要明确、不易错过的回执；toast 太轻。
- how: owner 选定"结果弹窗（带数量）"。新增 `<dialog id="importResultDialog">`（居中、单按钮「好的」、列出 书籍/摘抄/记录/关联 各类数量），成功路径用 `showImportResult(state)` 替代成功 toast（dialog 缺失时回落 toast）。遵循项目 dialog 规范：`dialog-form` 放内层 div、带 `aria-labelledby`（延续 OPT-033 无障碍）；样式用主题感知的 `--color-success-*`/`--color-soft-accent`（暗色模式可用）。Touch: `index.html`（新 dialog）、`styles.css`（`.import-result*`）、`app.js`（`showImportResult` + `importData` 成功路径 + OK 按钮）、`tests/frontend/account-import-format.test.js`（断言成功开弹窗）。

### OPT-042 — 快速 OCR 在后端中断时遗留卡死在「识别中」的孤儿摘抄卡 — owner 真机测试发现
- status: done (PR #38, merged 2026-06-11)
- followup: dev watcher (`scripts/dev_backend.py`) 收窄为只监控后端 `.py`（`WATCH_SUFFIXES={".py"}` + 忽略 `tests/`），前端/.md/测试改动不再重启后端——根除"改前端误重启后端、打断在飞请求"这一触发源（OPT-042 的修复也已让 OCR 对重启免疫，二者互补）。
- area: backend + frontend
- description: （owner 提出）快速识别时后端重启，前端报"连接不上后端"；重试成功，但同一张照片产生**两张卡**：一张「识别完成」，一张永远卡在「识别中」。根因：`/api/quotes/ocr`（`app_server.py`）在**同步快速 OCR 之前**就先 `save_state` 落了一张 `ocrStatus:"pending"` 草稿，之后再存最终状态。两次保存之间若被打断（重启/断连），草稿永久孤立在 `pending`；且第一次失败请求的响应没回到前端，前端没记下草稿 id，重试遂新建第二张卡。无任何回收（stale pending 只改了文案）。
- why: 静默遗留 + 重复卡，用户无法分辨哪张有效；OCR 是核心录入链路。
- how: **Fix A（后端）** 快速路径只在 OCR 完成后 `save_state` 一次 → 中断则一张卡都不留；只有异步 AI 路径仍预存 pending 草稿（前端轮询 + 后台任务需要）。**Fix B（前端）** `recoverStalePendingOcr()` 在 `loadSession` 时把超过 staleness 窗口仍 `pending` 的卡（其 OCR 任务必死——重启杀后台线程）翻成 `failed`，复用已有 重试/删除 UI，兼清现有孤儿 + 覆盖 AI 路径。Touch: `app_server.py`（OCR handler 保存时机）、`app.js`（`recoverStalePendingOcr` + `loadSession`）、`tests/agent/ocr_pending_orphan_test.py`（新）、`tests/frontend/ocr-stale-recovery.test.js`（新）。

### OPT-043 — 导入数据应在覆盖前显示「N → M 项」对比 + 二次确认（防误导入旧备份丢数据）
- status: new
- area: frontend
- priority: P1
- complexity: S
- description: （owner 真机事故触发）导入是整体替换；owner 测 OPT-040/041 时导入了一个**旧备份（6/8）**，把 6/8 之后新增的 3 张摘抄卡（含一张成功的 OCR 卡 + 一条手写笔记）整体覆盖丢失。事后已从 SQLite 已释放页里取证恢复（见 bug-274），但根因是**导入只在"事后"用 OPT-041 弹窗报数量，没有"事前"对比 + 拦截**。OPT-040 的清空护栏只在"解析后内容为 0"时拦，内容非空但**比当前少**（导入旧档的典型特征）时不拦。
- why: 整体替换是最高危的静默数据丢失来源；事前对比 + 显著拦截能在覆盖发生前给用户一次"咦数量怎么少了"的机会。这是 OPT-040（清空护栏）/OPT-041（结果弹窗）的自然补全。
- how: 在 `importData()`（`app.js`）应用前,先算当前 vs 待导入的各类数量（books/quotes/sessions/connections），用 `confirmDialog` 展示**对比**（如「书 52→52、摘抄 124→122、记录…」）；当任一类**减少**（M<N）时默认高亮/措辞更强（"将丢失 X 条,确定覆盖?"），需显式确认才继续。内容为 0 的极端情况仍走 OPT-040 现有护栏。纯前端,复用 `showConfirmDialog`。Touch: `app.js`（`importData` + 一个 diff 计算 helper）；`tests/frontend/account-import-format.test.js`（加断言：M<N 时弹对比确认、取消则不覆盖）。
- 关联: OPT-040（导入格式自适应 + 空内容护栏）、OPT-041（导入结果弹窗）。三者同属"导入数据安全"链路。

### OPT-044 — `payments` 表 `created_at`/`updated_at` 使用 `now_iso()`（naive 本地时间），`plan_expires_at` 用 `datetime.fromtimestamp()` 转换 Stripe 时间戳为本地时间 — 由 explore E67 提拔
- status: new
- area: backend
- description: Stripe webhook handler（`app_server.py:1850-1940`）在所有 4 处 `payments` INSERT 中用 `now_iso()` 写入 `created_at`/`updated_at`（约 lines 1852, 1890, 1915, 1935）。`period_end_iso`（line 1876）将 Stripe 的 UTC Unix 时间戳 `period_end` 用 `datetime.fromtimestamp(int(period_end)).isoformat()` 转为 naive 本地时间后存入 `users.plan_expires_at`。UTC 清理系列（OPT-014/024/031/035/038, E56/E58/E60/E63/E64/E65）已覆盖所有其他表；`payments` 是唯一尚未迁移的财务审计表。
- why: 财务记录应使用无歧义时区的时间戳。服务器迁移时区后，历史账单行与新行不可比较；`plan_expires_at` 若后续迁移为 UTC+Z，`_parse_iso_to_epoch()` 当前的 naive 解析将使订阅到期检查偏差 ±TZ_OFFSET 小时（详见 E66）。4 处 `now_iso()` 替换 + 1 处 `datetime.fromtimestamp` 修正，零逻辑变更，零测试变更。
- how: 将 `app_server.py:~1852, ~1890, ~1915, ~1935` 的 `now_iso()` 替换为 `utc_now_iso()`；将 `app_server.py:1876` 的 `datetime.fromtimestamp(int(period_end)).isoformat(timespec="seconds")` 改为 `datetime.fromtimestamp(int(period_end), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`（`timezone` 已 import）。Touch: `app_server.py:1876, 1852, 1890, 1915, 1935`。

### OPT-045 — Session 和 Connection CRUD 无前端 JS 测试覆盖——四个主 Tab 中两个对回归免疫 — 由 explore E68 提拔
- status: new
- area: frontend
- description: `tests/frontend/` 共 13 个测试文件，书单 Tab（`book-duplicate.test.js` 等）和摘抄 Tab（`quote-content-display.test.js` 等）均有覆盖，但**记录（Session）Tab** 和**关联（Connection）Tab** 无任何专项前端 JS 测试。`renderTimeline()`（`app.js:1335-1480`，~145 行，含日期分组、状态筛选、卡片事件绑定）及 `addSession()`/`deleteSession()`（`app.js:2290-2340`）均无测试。`renderConnections()`（`app.js:720-760`）和关联增删改亦无测试。OPT-027 刚对所有 4 个 Tab 卡面做了统一 ⋯ 菜单重构，无测试保护的代码已被重要改动过一次。
- why: Session 是最高频的日常写入操作（每次阅读结束记一条）；Connection 是 app 的差异化功能。两者均无 regression 守卫，任何未来重构都是盲目的。Node vm-sandbox 测试模式已有 13 个文件的既成模板，新增测试文件不需要运行服务器、不依赖新框架。
- how: 新建 `tests/frontend/session-crud.test.js`（用 fixture 渲染，断言卡片计数、状态筛选、deleteSession 调用 syncState、菜单触发删除确认）；新建 `tests/frontend/connection-crud.test.js`（用 fixture 渲染，断言双向标签解析、搜索筛选、deleteConnection 路径）。约 60-80 行/文件。Touch: `tests/frontend/`（新建两文件）；`app.js:1335-1480, 2290-2340, 720-760`（不改代码，仅测试现有行为）。
