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
- northstar: <对北极星(roadmap §2)的贡献,一句话;写不出来 → 自动 P3 parked(roadmap §5 北极星税)>
- description: <what>
- why: <motivation / value>
- how: <implementation hint, files to touch>
```

---

### OPT-001 — Excel 批量加书入口位置
- status: done (PR #40, 2026-06-12 — 书单页 books-search-row 新增圆形按钮,click 转发共享 #importExcelInput 处理链;抽屉入口保留)
- northstar: 强——owner 2026-06-12 明确表示「这是我最想做的」(最高级别 signal:owner 直接意愿)。Theme 1「采集顺滑」。建议 P1,Next up 候选。
- area: ux
- description: Excel 批量加书入口目前在「我的」抽屉里，考虑是否应放到「书单」页面，让用户一眼看到如何快速加书。
- why: 「我的」是设置类抽屉，新用户不会主动打开找加书功能；首屏「书单」是加书的天然语义位置。
- how: 在「书单」页空状态 / 加书按钮旁露出"批量从 Excel 导入"二级入口；保留「我的」里的入口作为备用。需对比 UX，不一定全搬。

### OPT-002 — 「书单」加书支持拍照 OCR 识别
- status: done (2026-06-03, commit e90d824 — 「识别封面信息」按钮 + /api/books/ocr;backlog 漏标,2026-06-12 补记)
- northstar: 强——Theme 1「采集顺滑」,owner 亲自提出。
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
- northstar: 无直接贡献(磁盘卫生,仅间接长期可靠性)。按 roadmap §5 北极星税 → P3 parked,预算富余周再做。
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
- status: triaged
- northstar: 无直接贡献(纯内部观测时间戳一致性,用户不可见)。→ P3 parked。
- area: backend
- description: `TraceManager.create_trace()`（`app_server.py:2676`）、`log_event()`（line 2695）、`update_trace()`（line 2702）均调用 `now_iso()` 写入 `agent_traces` 和 `agent_trace_events` 表的 `created_at`/`updated_at`。项目已通过 OPT-014/024/031 将所有用户可见时间戳迁移到 `utc_now_iso()`，但 `TraceManager` 属于独立类，在上述修复中被遗漏。`/debug/agent-dashboard` 展示这些时间戳，`/api/account/export` 也包含 `agentTraces`。
- why: 同一服务器上的时间戳自洽，但服务器时区变更（Docker rebuild、云迁移）后新旧记录产生 +8h 断层；与 `user_state.updated_at`（已是 UTC）进行关联分析时会出现虚假偏移。修复仅需将 3 处 `now_iso()` 替换为 `utc_now_iso()`，零逻辑变更，零测试变更。
- how: 将 `app_server.py:2676, 2695, 2702` 的 `now_iso()` 替换为 `utc_now_iso()`。Touch: `app_server.py:2676, 2695, 2702`（TraceManager 类）。

### OPT-036 — `summarize_metrics()` 对全量历史数据做 O(n) 扫描——每次打开 `/debug/logs` 线性变慢 — 由 explore E40 提拔
- status: triaged
- northstar: 弱——debug 看板是运营工具,不影响阅读主流程。→ P3 parked(2026-06-16 产品负责人仪式:对北极星无直接贡献,纯运营工具优化,预算富余周再做)。
- area: backend
- description: `MetricsCollector.summarize_metrics()`（`app_server.py:2870-2940`）执行 `SELECT … FROM agent_metrics WHERE user_id = ?`，无任何时间过滤，无 `LIMIT`。Plus 用户每天 240 次请求，一年后 `agent_metrics` 表超 87,000 行；每次 `/debug/logs` 或 `/debug/metrics` 加载都触发完整拉取 + 逐行 `json.loads()`，延迟随使用时长线性增长。`idx_agent_metrics_user` 索引（OPT-017）避免了跨用户扫描，但仍返回该用户所有历史行。
- why: debug 看板是运营者监控 AI 质量的主要工具，打开速度越来越慢会直接影响日常运营。90 天滚动窗口覆盖所有实用的调试历史（配置变更、模型升级、回归分析），同时将最大扫描行数封顶在约 21,600 行。修复仅需在 SQL WHERE 子句追加一个时间条件，一行代码。
- how: 在 `app_server.py:2875` 的 `WHERE user_id = ?` 后追加 `AND created_at > datetime('now', '-90 days')`；在 debug 看板 section 标题字符串中更新为"近 90 天汇总"（约 1 处 JS/HTML 字符串）。Touch: `app_server.py:2870-2878`；可选 `app.js` 或 debug HTML 模板中更新标签。

### OPT-037 — `compareBooksForList()` 对 `createdAt` 仍用 `localeCompare` 字符串排序——OPT-014 防御性修复遗漏了书单排序 — 由 explore E61 提拔
- status: done (PR #42, 2026-06-13 — 三处 createdAt/updatedAt 改 Date.parse 数值比较;142/142 测试绿)
- northstar: 中——书单是首屏主视图,排序错误直接可见;「不假思索的默认工具」要求基础可靠。两行修复,夜间预算内优选。P1。
- area: frontend
- description: `compareBooksForList()`（`app.js:1026`）对同状态书籍做二级排序时使用 `(b.createdAt || "").localeCompare(a.createdAt || "")`。OPT-014 已将 `renderQuotes()` 改为 `Date.parse(b.createdAt) - Date.parse(a.createdAt)` 防御性修复，但 `compareBooksForList()` 未同步。另 `app.js:2431` 用同一模式查找最近活跃书籍。OPT-024/031 完成后所有时间戳已统一 UTC+Z，但 `localeCompare` 在同一秒内对有毫秒（`...000Z`）与无毫秒（`...Z`）的字符串排序结果相反（"Z" ASCII 90 > "." ASCII 46），导致 agent 创建的书籍与用户创建的书籍在同秒添加时顺序错误。
- why: OPT-014 的修复原则是"全部时间戳改为 epoch 数值比较"；`compareBooksForList()` 是遗漏的执行点。书单是 App 首屏主视图，排序错误直接可见。修复是 2 处各一行代码，零风险。
- how: 将 `app.js:1026` 的 `(b.createdAt || "").localeCompare(a.createdAt || "")` 改为 `(Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)`（降序 = b - a）；同样修复 `app.js:2431`。Touch: `app.js:1026, 2431`。

### OPT-038 — 用户注册与 `ensure_user_state()` 使用 `now_iso()` 写入 `user_state.updated_at`——与 `save_state()` 的 `utc_now_iso()` 不一致，污染乐观锁版本字段 — 由 explore E65 提拔
- status: triaged
- northstar: 中——乐观锁是防跨设备丢数据机制(bug-274 同类痛点,数据安全链路),版本字段污染可致锁失效。P2。
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
- status: done (PR #39, merged 2026-06-12 — 夜间 agent 实现；任一类别 M<N 即弹强确认列出丢失项；11/11 测试绿)
- area: frontend
- priority: P1
- complexity: S
- description: （owner 真机事故触发）导入是整体替换；owner 测 OPT-040/041 时导入了一个**旧备份（6/8）**，把 6/8 之后新增的 3 张摘抄卡（含一张成功的 OCR 卡 + 一条手写笔记）整体覆盖丢失。事后已从 SQLite 已释放页里取证恢复（见 bug-274），但根因是**导入只在"事后"用 OPT-041 弹窗报数量，没有"事前"对比 + 拦截**。OPT-040 的清空护栏只在"解析后内容为 0"时拦，内容非空但**比当前少**（导入旧档的典型特征）时不拦。
- why: 整体替换是最高危的静默数据丢失来源；事前对比 + 显著拦截能在覆盖发生前给用户一次"咦数量怎么少了"的机会。这是 OPT-040（清空护栏）/OPT-041（结果弹窗）的自然补全。
- how: 在 `importData()`（`app.js`）应用前,先算当前 vs 待导入的各类数量（books/quotes/sessions/connections），用 `confirmDialog` 展示**对比**（如「书 52→52、摘抄 124→122、记录…」）；当任一类**减少**（M<N）时默认高亮/措辞更强（"将丢失 X 条,确定覆盖?"），需显式确认才继续。内容为 0 的极端情况仍走 OPT-040 现有护栏。纯前端,复用 `showConfirmDialog`。Touch: `app.js`（`importData` + 一个 diff 计算 helper）；`tests/frontend/account-import-format.test.js`（加断言：M<N 时弹对比确认、取消则不覆盖）。
- 关联: OPT-040（导入格式自适应 + 空内容护栏）、OPT-041（导入结果弹窗）。三者同属"导入数据安全"链路。

### OPT-044 — `payments` 表 `created_at`/`updated_at` 使用 `now_iso()`（naive 本地时间），`plan_expires_at` 用 `datetime.fromtimestamp()` 转换 Stripe 时间戳为本地时间 — 由 explore E67 提拔
- status: triaged
- northstar: 无——billing 已按 roadmap §1 冻结,冻结期间财务表时间戳无用户价值。→ P3 parked,直至项目定位升级到 C(认真做产品)。
- area: backend
- description: Stripe webhook handler（`app_server.py:1850-1940`）在所有 4 处 `payments` INSERT 中用 `now_iso()` 写入 `created_at`/`updated_at`（约 lines 1852, 1890, 1915, 1935）。`period_end_iso`（line 1876）将 Stripe 的 UTC Unix 时间戳 `period_end` 用 `datetime.fromtimestamp(int(period_end)).isoformat()` 转为 naive 本地时间后存入 `users.plan_expires_at`。UTC 清理系列（OPT-014/024/031/035/038, E56/E58/E60/E63/E64/E65）已覆盖所有其他表；`payments` 是唯一尚未迁移的财务审计表。
- why: 财务记录应使用无歧义时区的时间戳。服务器迁移时区后，历史账单行与新行不可比较；`plan_expires_at` 若后续迁移为 UTC+Z，`_parse_iso_to_epoch()` 当前的 naive 解析将使订阅到期检查偏差 ±TZ_OFFSET 小时（详见 E66）。4 处 `now_iso()` 替换 + 1 处 `datetime.fromtimestamp` 修正，零逻辑变更，零测试变更。
- how: 将 `app_server.py:~1852, ~1890, ~1915, ~1935` 的 `now_iso()` 替换为 `utc_now_iso()`；将 `app_server.py:1876` 的 `datetime.fromtimestamp(int(period_end)).isoformat(timespec="seconds")` 改为 `datetime.fromtimestamp(int(period_end), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`（`timezone` 已 import）。Touch: `app_server.py:1876, 1852, 1890, 1915, 1935`。

### OPT-046 — Tab 导航缺少 ARIA role/aria-selected 属性，屏幕阅读器无法感知 Tab 切换（WCAG 4.1.2 Level A） — 由 explore E70 提拔
- status: triaged
- area: frontend
- northstar: 无直接贡献——商业化（定位 C）已冻结，当前 8 周按定位 A「个人工具」执行，唯一用户=owner 本人，屏幕阅读器 a11y 对单人无价值。→ **P3 parked（2026-W27 仪式）**：与已 parked 的 OPT-048（chat `role="log"`）同一逻辑，a11y 系列统一留待定位升级到 B/C 再批量重启。原写「商业化基线」属把未选定的定位 C 当现实，与 roadmap §1「未来 8 周按 A 执行」不符。
- description: `<nav class="mobile-tabs">` 的 6 个 `<button>` 无 `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`，`activateTab()` 只切换 CSS class，不更新任何 ARIA 状态。屏幕阅读器用户听到的是 6 个匿名按钮，无选中/未选中提示，无法用箭头键按 ARIA tab 模式导航。
- why: WCAG 2.1 SC 4.1.2（Name, Role, Value — Level A）要求 Tab 组件声明正确的 role 并在切换时同步 `aria-selected`。Level A 是商业化最严格的合规等级；这 6 个 Tab 是 App 的主导航骨架，修复后所有后续 ARIA 修复才有完整语义上下文。修复是纯加法（HTML 属性 + 1 行 JS），零逻辑变更，零风险。
- how: `index.html:679` 加 `role="tablist"`；6 个 `<button>` 各加 `role="tab"` + `aria-selected` + `aria-controls="<panel-id>"`；6 个 `<section data-tab-section>` 各加 `id` + `role="tabpanel"` + `aria-labelledby`；`app.js:1629` 补一行 `button.setAttribute("aria-selected", String(button.dataset.tab === tabName))`。Touch: `index.html:72-160, 679-704`；`app.js:1628-1630`。

### OPT-047 — `PromptBuilder.all_books_summary` 无数量上限，500 本书用户每次对话多注入 ~7000 tokens — 由 explore E74 提拔
- status: done (PR #45, merged 2026-06-24 — all_books_summary 按 updatedAt 倒序取 [:50]；py 测试绿)
- area: agent
- northstar: 强——直接降低 DeepSeek API 用量/成本，与 OPT-020（`existing_connections` 条件注入）同类，OPT-020 已证明 P1 可落地。Theme 1「采集顺滑」 + 成本控制。
- description: `PromptBuilder.build_chat_prompt()` 的 `all_books_summary`（`app_server.py:2326-2329`）是用户全量书单，无 LIMIT。500 本书 × ~56 字符 ≈ 28,000 字符 ≈ 7,000 tokens，每次请求都注入，无条件。`all_books_summary` 仅在 `link_thought` 时用于 targetId 验证，而 OPT-020 已说明 link_thought 只在用户明确要求时才返回——即 80%+ 的请求里这 7,000 tokens 是无效注入。Plus 用户每日 240 请求 × 7,000 tokens = 168 万 tokens/天多余消耗。
- why: OPT-020 以同样的逻辑节省了 ~150 tokens/请求并立即落地。`all_books_summary` 的问题规模是 OPT-020 的 50×，修复方式也完全一致：加 `[:50]` 上限（覆盖 95%+ 用户全量，对重度用户截断）+ 按最近活跃书排序。S 复杂度，零逻辑变更，零测试变更。
- how: `app_server.py:2326-2329`：将 `for b in user_state.get("books", [])` 改为先按 `b.get("updatedAt","")` 倒序排列再取 `[:50]`。或更激进：当 `book_id` 存在时（book/quote 上下文），仅保留当前书 + 近 20 本（`link_thought` 极少跨 50 本）；全局上下文保留 `[:50]`。Touch: `app_server.py:2326-2329`。

### OPT-045 — Session 和 Connection CRUD 无前端 JS 测试覆盖——四个主 Tab 中两个对回归免疫 — 由 explore E68 提拔
- status: done (PR #43, 2026-06-13 — 新增 session-crud + connection-crud 两测试文件 17 条;159/159 测试绿;未改 app.js)
- northstar: 中——Session 是最高频日常写入、Connection 是差异化功能;回归守卫是 Theme 2「回顾有价值」动工前的安全网。P2,宜在 Theme 2 开始前完成。
- area: frontend
- description: `tests/frontend/` 共 13 个测试文件，书单 Tab（`book-duplicate.test.js` 等）和摘抄 Tab（`quote-content-display.test.js` 等）均有覆盖，但**记录（Session）Tab** 和**关联（Connection）Tab** 无任何专项前端 JS 测试。`renderTimeline()`（`app.js:1335-1480`，~145 行，含日期分组、状态筛选、卡片事件绑定）及 `addSession()`/`deleteSession()`（`app.js:2290-2340`）均无测试。`renderConnections()`（`app.js:720-760`）和关联增删改亦无测试。OPT-027 刚对所有 4 个 Tab 卡面做了统一 ⋯ 菜单重构，无测试保护的代码已被重要改动过一次。
- why: Session 是最高频的日常写入操作（每次阅读结束记一条）；Connection 是 app 的差异化功能。两者均无 regression 守卫，任何未来重构都是盲目的。Node vm-sandbox 测试模式已有 13 个文件的既成模板，新增测试文件不需要运行服务器、不依赖新框架。
- how: 新建 `tests/frontend/session-crud.test.js`（用 fixture 渲染，断言卡片计数、状态筛选、deleteSession 调用 syncState、菜单触发删除确认）；新建 `tests/frontend/connection-crud.test.js`（用 fixture 渲染，断言双向标签解析、搜索筛选、deleteConnection 路径）。约 60-80 行/文件。Touch: `tests/frontend/`（新建两文件）；`app.js:1335-1480, 2290-2340, 720-760`（不改代码，仅测试现有行为）。

### OPT-048 — `#chatMessages` 缺少 `role="log"` live region，屏幕阅读器无法感知新消息（WCAG 4.1.3 AA） — 由 explore E75 提拔
- status: triaged
- area: frontend
- northstar: 弱——延续已有 a11y 系列（OPT-013/018/019/033/046），Chat 是 AI 对话核心入口，`role="log"` 使 AA 级合规在对话模块闭环。S 复杂度，1 行 HTML + 1 条测试。→ P3 parked（2026-06-16 仪式：当前定位 A「个人工具」唯一用户为 owner 本人，屏幕阅读器 a11y 对单人无直接价值；留待定位升级到 B/C 再批量重启 a11y 系列）。
- description: `<div id="chatMessages" class="chat-messages chat-messages-inline">` at `index.html:177` has no `role="log"`, `aria-live`, or `aria-relevant` attribute. `chat.js` never sets any live-region attribute on this element. Without `role="log"` (which implies `aria-live="polite"` + `aria-relevant="additions text"`), screen readers do not announce incoming AI replies as they stream in. The `a11y-baseline.test.js` already guards OPT-013/018/019 but has no assertion for this gap.
- why: Chat是 AI 交互的主界面。缺少 live region，屏幕阅读器用户每次交换后必须手动导航到消息列表——无法听到实时回复。与 OPT-019（toast `role="status"`）性质完全相同，修复量更小（1 个 HTML 属性 + 1 条测试断言），零 JS/backend 改动。
- how: `index.html:177`：在 `<div id="chatMessages">` 上加 `role="log"`。`tests/frontend/a11y-baseline.test.js`：新增一个 test 块，断言 `#chatMessages` 元素存在且 `role="log"`。Touch: `index.html:177`；`tests/frontend/a11y-baseline.test.js`。

### OPT-049 — 书详情弹窗 UX 三连修(滚动复位 / 锁横滑 / 摘抄·笔记区分)— owner 真机 signal 触发
- status: done (PR #44, 2026-06-14 — ① showModal 后滚动容器 scrollTop=0;② .book-detail-dialog-body 去 min-width + .dialog-form overflow-x:hidden;③ 相关摘抄标题/文案改「摘抄 / 笔记」;新增 book-detail-ux.test.js 4 条,163/163 绿)
- area: frontend
- northstar: 强——owner 真机使用直接反馈(signals 2026-06-13 三条),Theme 1「不假思索的默认工具」要求阅读主路径的详情页基础体验可靠。
- description: ① 点书卡进详情页打开时滚动停在中段(showModal 自动聚焦中段摘抄按钮);② 详情页可左右滑(body min-width 720 > dialog 560 横向溢出);③「相关摘抄」实含笔记(isRegularQuote 只排除 question)却不标注。
- why: 阅读主路径(翻书单→看书详情)的基础体验,直接影响「每天爱用」。
- how: 见 PR #44。app.js(openBookDetailDialog 滚动复位 + 文案)、styles.css(.dialog-form overflow-x + .book-detail-dialog-body width)、index.html(标题)、tests/frontend/book-detail-ux.test.js。

### OPT-050 — `deleteQuote()` 删除摘抄时遗漏 chatHistories / chatContexts 清理，产生孤儿状态
- status: triaged
- area: frontend
- northstar: 弱——防止 state blob 随摘抄删除操作静默膨胀，属数据健康度修缮。state 整洁是一切功能可靠性的基础；与 Theme 1「采集顺滑」间接相关（删除操作是采集流程的清理环节）。
- description: `app.js:2316-2332` 的 `deleteQuote()` 删除 quote 本体及其 connections，但未清理 `state.chatHistories["quote:${quoteId}"]` 和 `state.chatContexts["quote:${quoteId}"]`。key 格式由 `app_server.py:608-614` 的 `chat_context_history_key()` 确认（`return f"quote:{normalized['quoteId']}"`）。每次删摘抄后，两个死键随 `syncState()` 永久写入服务器 SQLite blob，状态随使用次数线性膨胀。
- why: `deleteBook()` 在 `app.js:2088-2100` 已有完整清理模式（`delete state.chatHistories[...]` + `delete state.chatContexts[...]` + 遍历 context.bookId）。`deleteQuote()` 缺少对应逻辑，是功能对等性缺口。
- how: 在 `app.js` `deleteQuote()` 的 `onConfirm` 回调中，`await syncState()` 之前插入：`delete (state.chatHistories || {})["quote:" + quoteId]; delete (state.chatContexts || {})["quote:" + quoteId];`。复杂度 S，2 行改动，无测试变动（state hygiene 可在现有 integration test 中验证）。

### OPT-052 — 摘抄卡面缺少图片缩略图——拍照 OCR 成卡后无视觉区分度 — 由 explore E86 提拔
- status: done (PR #48, merged 2026-06-24 — 摘抄卡有 imageUrl 时渲染缩略图 img；js 4/4)
- area: frontend
- northstar: 强——直接服务 Theme 1「采集顺滑」：拍照录入是最高频场景，卡面应有视觉确认「照片已关联」；与北极星「不假思索的默认工具」一致（操作后立即得到正向反馈）。S 复杂度，P1 候选。
- description: `app.js:1449-1452` 的摘抄卡模板中 `entry-card-cover` 始终只渲染 `entry-cover-fallback`（灰色占位块），无论 `quote.imageUrl` 是否存在均不显示图片。`openQuoteDetail()`（`app.js:2159-2160`）在详情弹窗中 **已**加载图片（`img.src = resolveImageUrl(quote.imageUrl)`），证明图片有效，只是卡面未渲染。对比书卡（`app.js:1133-1134`）会展示封面图片或 fallback 摘抄图片。
- why: 拍照→OCR→成卡后，卡面与纯文字卡完全一样，用户无视觉确认「照片已关联」；随着 OCR 摘抄积累，整个卡片墙视觉单调，无法识别图片卡。Theme 1 验收标准要求全链路有清晰反馈。
- how: 在 `app.js:1449` 的 `entry-card-cover` 内条件渲染 `<img>`：有 `quote.imageUrl` 时显示缩略图，无则保留 `entry-cover-fallback`。CSS 样式可沿用书卡已有 `book-card-cover img` 规则（`.entry-card-cover img { width:100%; height:100%; object-fit:cover; }` 约 2 行）。无后端改动。Touch: `app.js:1449-1452`；`styles.css`（2 行 CSS 规则可选）。

### OPT-053 — Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 — 由 explore E85 提拔
- status: triaged
- area: frontend
- northstar: 中——直接佐证 Roadmap §2「可观测代理指标」（本周使用天数/新增摘抄数/回顾操作次数）；让阅读积累可见是「每天爱用」的正向循环基础；Theme 2「回顾有价值」预热。S 复杂度，3 行代码改动。
- description: `app.js:1335-1342`：`if (searchRaw && sessions.length)` 使统计条（`#sessionStats`，`index.html:110`）仅在有搜索词时显示匹配集合的汇总数字。无搜索时始终 `is-hidden`，用户日常打开「记录」Tab 看不到「共 38 次阅读 · 2140 分钟 · 约 480 页」。对比书单 Tab 的 `renderHero()`（`app.js:934-940`）始终展示总书数/总分钟/总摘抄数。
- why: 无搜索时统计条隐藏，意味着累计阅读数据对用户不可见。3 行改动即可让用户每次打开记录 Tab 看到自己的阅读积累，强化使用动力。Roadmap §2 明确列出「可观测代理指标」为北极星量化工具。
- how: 改 `app.js:1335-1342`：将 `if (searchRaw && sessions.length)` 分为两路——无搜索时从 `state.sessions` 全量计算（totalMin / totalPages / count）并始终显示；有搜索时展示过滤子集汇总（现有逻辑）。无 HTML/CSS/后端改动。Touch: `app.js:1335-1342`。

### OPT-051 — 添加 Web App Manifest，使 Android/Chrome 用户可以「添加到主屏幕」安装 PWA
- status: triaged
- area: frontend
- northstar: 无直接贡献（当前定位 A：唯一用户=owner 本人，每天用 iPhone，已有 Apple PWA meta；Android/Chrome 安装收益此刻为零，无 signal 佐证）。按 roadmap §5 北极星税 → **P3 parked（2026-W26 仪式）**；仅当定位升级到 §1 option B（10–100 人分享、Android 入场）时重启，届时 manifest 是必要前置。
- park-reason (2026-06-22): 定位 A 下唯一用户不用 Android，PWA 安装属「为假想未来用户做」，违反 §0「为做而做」批判；15 行成本不急，升级到 B 当周再做即可。
- description: `index.html:8-10` 仅有 Apple 专属 PWA meta 标签（`apple-mobile-web-app-capable` / `apple-mobile-web-app-title`），没有 `<link rel="manifest">`。仓库根目录无 `manifest.json` 文件。Android Chrome 的「添加到主屏幕」和 PWA 安装提示均依赖 manifest；缺失时用户只能手动将网址固定到浏览器书签，不会触发系统级安装提示。
- why: owner 每天用 iPhone，manifest 收益目前为零；但 roadmap §1 把升级到 B（10-100 人分享）设为可能路径，Android 用户比例不低。manifest.json 是 15 行 JSON + 1 行 HTML，一次性低成本补全，此后无维护负担。
- how: ① 新建 `manifest.json`（根目录，15 行）：name/short_name/start_url/display:standalone/background_color/theme_color/icons（复用现有 favicon 或添加 192×192 PNG）。② `index.html` `<head>` 加 `<link rel="manifest" href="/manifest.json">`。③ `app_server.py` 静态文件分发列表（`_STATIC` dict 或等价 if-chain）加入 `manifest.json` 条目。复杂度 S。

### OPT-054 — 「↓ 最新」按钮独占布局行压缩聊天区——改为叠加在消息列表上的浮动按钮 — 由 explore E87 提拔
- status: done (PR #47, merged 2026-06-24 — 「↓最新」按钮改 absolute 浮层，不占布局行；regression 58/58)
- area: frontend
- northstar: 中——chat 是「探讨」核心入口，输入区舒适度影响写作流畅度；owner 真机 signal 2026-06-16 驱动，S 复杂度；Theme 1「不假思索的默认工具」辅助。
- description: `index.html:190-192` 的 `<div class="chat-scroll-btn-row" id="chatScrollBtnRow">` 是聊天面板 flex 列的独立子元素（在 `#chatMessages` 与 `.chat-composer` 之间）。`styles.css:2069-2073` 定义为 `display: flex; padding: 4px 4px 0`，可见时占用 ~30px 垂直高度。桌面端（`styles.css:3597-3600`）亦占独立 `grid-row: 3`。聊天面板高度固定，该行出现时从消息区直接扣除 ~30px。Owner signal 2026-06-16："聊天输入框里「最新」独占一行，挤压了左侧交互内容的空间 → 希望它不占整行"。
- why: 「↓ 最新」按钮不需要占用布局空间——叠加在消息列表右下角是标准聊天应用模式（WhatsApp/Telegram），不影响 composer 可用高度。S 复杂度，零逻辑变更。
- how: `styles.css`：给 `#chatMessages` 加 `position: relative`；将 `.chat-scroll-btn-row` 改为 `position: absolute; bottom: 8px; right: 8px; z-index: 2; display: block` （移除 `display: flex; padding`）；同步移除桌面端 `grid-row: 3` override（按钮叠加后不占 grid 行）。`chat.js:273, 441, 894` 的 `hidden` 逻辑无需改动。Touch: `styles.css:2069-2073`（`.chat-scroll-btn-row`）、`styles.css:3597-3600`（桌面 override）。

### OPT-055 — 快速 OCR 填入整页全文后无行级删除 UI，用户须手动选删大段内容 — 由 explore E88 提拔
- status: done (PR #46, merged 2026-06-24 — 快速 OCR ≥3 行出行级删除面板，点 ✕ 删行并同步 textarea；js 10/10)
- area: frontend
- northstar: 强——Theme 1「采集顺滑」直接障碍：快速 OCR 已「快」，但产生整页冗余文本使「顺」失效；owner 真机 signal 2026-06-16 明确指出。每次录入都需额外 20-60 秒手工删行，与北极星「不假思索的默认工具」直接冲突。M 复杂度，无后端改动。
- description: `index.html:476` helper text 明确写"「快速识别」秒出整页全文"；`app.js:511-523` `normalizeOcrText()` 保留 `\n` 分隔多行；`app.js:1554` 将完整识别文本填入 `#quoteContent` textarea（`contentEl.value = recognizedText`）。OCR 完成后 quote 对话框无任何行级操作 UI，用户须在 textarea 里手动选删不需要的行才能保留划线句。Owner 2026-06-16 signals："快速 OCR 很快但会识别整页全文，只想留划线句，得手动删一大堆很麻烦 → 希望能「一行一行快速删除」OCR 结果"。
- why: 是 Theme 1 两周验收观察期（roadmap §2 W25 焦点）中最直接的采集摩擦点：降低 OCR 录入的后处理成本，才能做到"拍照→成卡"零停顿。
- how: 在 `syncOpenQuoteFormFromState()`（`app.js:1548-1566`）的 `ocrStatus === "done"` 分支：若识别文本行数 ≥ 3，隐藏 `#quoteContent` textarea，显示新增的「行选择列表」（每行一个 `<div>` + 删除 `✕` 按钮）；用户点删后，剩余行合并写回 textarea，并恢复正常编辑视图。约 40 行 JS + 20 行 CSS。行数 < 3 时跳过，直接填入 textarea（现有行为）。Touch: `app.js:1548-1566`；`index.html:444-486`（quote dialog，可加行列表 UI 占位）；`styles.css`（新增 `.ocr-line-selector` 组件样式）。

### OPT-056 — 摘抄搜索不包含「我的理解」(reflection) 字段，用户按自己的思考笔记无法检索 — 由 explore E90 提拔
- status: triaged
- area: frontend
- northstar: 中——使用户的个人洞察（reflection）变得可检索，直接支撑 Theme 2「回顾有价值」；累积 50+ 张摘抄后 reflection 检索是最自然的二次入口之一；与北极星「第三个数 > 0」（回顾/检索/关联操作次数）正相关。
- description: `app.js:1411-1416`（`renderQuotes()` 搜索过滤器）构建 haystack 时未包含 `item.reflection`：`[book?.title, book?.author, item.content, (item.tags||[]).join(" ")].join(" ").toLowerCase()`。`index.html:479` 的「我的理解」textarea（`name="reflection"`）内容通过 `state.quotes[n].reflection` 持久化。若用户在「我的理解」里写了"这和笛卡尔二元论有关"，搜索"笛卡尔"什么都找不到。
- why: `reflection` 是用户最个人化的思考记录，按自己写下的洞察检索是 Theme 2「回顾有价值」最低成本的实现方式；一行改动，零后端变更，可选追加测试断言。
- how: `app.js:1411-1416`，在 haystack 数组末尾追加 `item.reflection || ""`。可同时在 `tests/frontend/` 追加一条断言覆盖 reflection 命中场景。Touch: `app.js:1411-1416`。

### OPT-057 — 「动态」Tab 时间线硬限 10 条，积累大量摘抄后无法看到更多历史条目 — 由 explore E84 提拔
- status: triaged
- area: frontend
- northstar: 中——「动态」Tab 是 Theme 2「回顾有价值」的主要入口之一；硬限 10 条使有价值的历史动态不可见，与「让积累的摘抄回流到阅读生活」直接冲突；积累 20+ 条目后用户无法看到自己的阅读轨迹全貌。
- description: `app.js:1332`（`renderTimeline()` 内）：`const visible = allSorted.slice(0, 10);`——无论实际条目数量，始终只渲染最新 10 条，无「加载更多」入口。`allSorted` 由 books（added）、sessions、quotes 时间戳合并排序组成（`app.js:1295-1329`）。用户持续使用后条目快速超过 10 条，更早的阅读里程碑（某本书的第一张摘抄、某次长时阅读）永远不可见。
- why: 10 条硬限在产品初期是合理保护，但阻碍 Theme 2；「加载更多」或提升至 20 条是最低代价的解法；S 复杂度，无后端改动。
- how: 方案 A（最简）：将硬限从 10 改为 20，`app.js:1332` 单行改动；方案 B（推荐）：在时间线底部追加「查看更多」按钮，点击后 `slice(0, count + 10)`，通过 `state` 或局部变量跟踪当前展示数量。Touch: `app.js:1295-1345`（`renderTimeline`）；`index.html:119`（timeline 容器，可加「更多」按钮占位）。

### OPT-058 — 摘抄对话框 `showModal()` 后未 `focus()` 文本区，移动端每次打开须额外点击才能输入 — 由 explore E93 提拔
- status: triaged
- area: frontend
- northstar: 中——Theme 1「采集顺滑」触点：摘抄对话框是拍照→OCR→成卡的最终操作界面，每次打开须额外点击才能输入，直接给核心链路增加固定摩擦；CLAUDE.md 明确「mobile-first (iPhone 12)」；S 复杂度，2 行改动，零副作用。
- description: `openNewQuoteForBook()`（`app.js:2248`）和 `editQuote()`（`app.js:2283`）均以 `els.quoteDialog.showModal()` 结束，之后无 `focus()` 调用。iPhone Safari 对 `<dialog>` 内 textarea 不自动聚焦——`#quoteContent`（`index.html:471`）在弹窗打开后不是焦点元素，用户需额外点击才能开始输入。桌面浏览器通常自动聚焦首个可交互元素，但 iPhone Safari 不支持此行为（dialog 规范差异）。
- why: 「新建摘抄」是拍照→OCR 后的核心操作入口，每次打开弹窗必须额外点击一次，在高频使用场景下摩擦感累积显著。这是 Theme 1「采集顺滑」两周验收观察期中的具体触点。
- how: 在两处 `showModal()` 后各追加 `requestAnimationFrame(() => document.getElementById("quoteContent")?.focus())`（共 2 处，各 3 行）。`requestAnimationFrame` 确保 dialog 渲染完成后再 focus，兼容 Safari `<dialog>` 异步显示时序，与 OPT-049 等先例中已用模式一致。Touch: `app.js:2248`（`openNewQuoteForBook` 末尾）；`app.js:2283`（`editQuote` 末尾）。

### OPT-059 — Session 新建表单日期预填 UTC 日期，UTC+8 凌晨（00:00–08:00）读书记录日期差一天 — 由 explore E94 提拔
- status: done (PR #54, 2026-07-04 — `todayLocalDateInput()` helper（Intl sv locale 本地 YYYY-MM-DD）+ date input `max=今天` + `addSession()` 未来日期提交拦截；回归测试 `tests/frontend/session-date-prefill.test.js` 3 例。注意：编辑路径的对称 bug 是 OPT-090，未随本项修复)
- area: frontend
- northstar: 中——Theme 1「采集顺滑」数据准确性：凌晨阅读记录日期自动填入昨天，owner 晚睡读书场景高频；记录日期错误直接损害「零丢失/零错数据」验收标准，且用户通常不会注意日期字段并手动修正。S 复杂度，1 行改动。
- description: `app.js:2261`：`els.sessionForm.querySelector('[name="date"]').value = new Date().toISOString().split("T")[0];`——`toISOString()` 返回 UTC 日期，UTC+8 凌晨 00:00–07:59 对应 UTC 前一天，导致「今晚」的阅读被记录为「昨天」。`index.html:430` 的日期 `<input>` 亦无 `max` 属性，用户可无限制选择未来日期。
- why: owner 为 UTC+8 且有晚睡读书习惯——roadmap §2 三个可观测指标第一条是「本周使用天数」，日期填错会导致指标统计失真；用户在提交 session 表单时极少会核对日期字段。
- how: `app.js:2261` 将 `new Date().toISOString().split("T")[0]` 改为 `new Intl.DateTimeFormat("sv").format(new Date())`（`"sv"` locale 返回 `YYYY-MM-DD` 本地时区格式，所有现代浏览器兼容，无 polyfill 需求）；可同步在 JS 初始化时动态给 `index.html:430` 的 `<input name="date">` 设置 `max` 属性（防未来日期）。Touch: `app.js:2261`（主改动点）；可选 `index.html:430` + JS 初始化段设置 `max`。

### OPT-060 — 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 — 由 explore E95 提拔
- status: triaged
- area: frontend
- northstar: 中——Theme 2「回顾有价值」的关键检索入口：关联是 app 的差异化功能，「按摘抄内容找关联」是回顾时最自然的方式；现在按摘抄原文搜索无法命中关联，等于让连接网络对用户半透明；积累 20+ 个关联后影响显著，是 Theme 2 北极星第三个数「回顾/检索/关联操作次数 > 0」的前提。
- description: `app.js:740-756`（`renderConnections()` 搜索过滤块）的 haystack 仅含 `getBookTitle()`（`app.js:742-748`，对 quote 类型只返回书名）和 `c.thought`，不含摘抄原文（`quote.content`）。若用户建立了「笛卡尔」摘抄→「AI」摘抄的关联，搜索"笛卡尔"时若两书名均不含该词则返回零结果，即使 thought 字段也没有该词。注意：`resolveConnectionSide()`（`app.js:679-688`）在卡面**展示**时确实包含摘抄原文预览（`quote.content.slice(0,36)`），但搜索 haystack 的构建路径（`getBookTitle()`）与展示路径（`resolveConnectionSide()`）分离，搜索和展示不对齐。
- why: 用户建立关联时脑中记住的往往是「那句话说了什么」，而不是「它属于哪本书」；按摘抄原文检索关联才能「想到就找到」；是 Theme 2 最低成本的检索改进之一（6 行改动，无后端变更）。
- how: 在 `app.js:740-756` 的 haystack 构建中，对 `c.sourceType === "quote"` 和 `c.targetType === "quote"` 的 side，分别通过 `state.quotes.find()` 查找对应 quote 的 `.content`，加入 haystack 数组。额外查找仅在 `searchRaw` 非空时触发（`app.js:739` 已有 `if (!searchRaw) return true` 短路保护，连接数通常 <100，O(Q) 查找可忽略）。Touch: `app.js:740-756`（haystack 构建块，约 6 行改动）。

### OPT-061 — Session 对话框 `showModal()` 后无 `focus()`，移动端须额外点击才能开始输入 — 由 explore E97 提拔
- status: triaged
- area: frontend
- northstar: 中——Theme 1「采集顺滑」每日触点：Session 记录是阅读习惯追踪的核心动作，每次打开弹窗须额外点击 `startPage` 输入框才能填写；mobile-first 原则下此为固定摩擦；OPT-058 已为摘抄对话框做同等修复，本项为平行补丁，S 复杂度，实现风险接近零。
- description: `editSession()`（`app.js:2142`）和 `openNewSessionForBook()`（`app.js:2262`）均以 `els.sessionDialog.showModal()` 结束，无后续 `focus()` 调用。Session 表单第一个必填手动输入字段是 `startPage`（`[name="startPage"]`，`index.html:431`，`type="number" required`）；`bookId` 和 `date` 均有预填值，`startPage` 才是用户首个须手动填写的字段。iPhone Safari 不对 `<dialog>` 内 input 自动聚焦，导致打开弹窗后须额外点击一次。
- why: 「新增阅读记录」是 Theme 1 每日行为，固定摩擦在高频使用后体感明显；与 OPT-058 完全对称，是已知模式的平行应用，修改仅 2 处 × 3 行，零副作用。
- how: 在 `editSession()` 末尾（`app.js:2142`）和 `openNewSessionForBook()` 末尾（`app.js:2262`）各追加 `requestAnimationFrame(() => document.querySelector('#sessionDialog [name="startPage"]')?.focus())`。`requestAnimationFrame` 确保 dialog 渲染完成后再 focus，兼容 Safari `<dialog>` 异步显示时序（与 OPT-058/049 已用模式一致）。Touch: `app.js:2142`；`app.js:2262`。

### OPT-062 — 确认对话框 Escape 关闭后 `{ once: true }` 监听器残留，可触发错误删除 — 由 explore E100 提拔
- status: done (PR #49 merged 2026-06-24)
- area: frontend
- priority: P1
- size: S
- northstar: 中——Theme 1「采集顺滑」零数据丢失验收：Escape 后残留 onConfirm 闭包在下次确认点击时触发错误删除；showConfirmDialog 覆盖全部 6 处删除入口（deleteSession/deleteQuote/deleteAccount/Excel 守卫），deleteBook 内联 handler 亦同理；S 修复成本远低于单次误删负影响。
- description: 两处对话框实现均未处理 Escape 关闭事件，导致 `{ once: true }` 按钮监听器永久残留：（1）`showConfirmDialog()`（`app.js:2286-2297`）：在 `confirmDialogConfirmBtn`/`confirmDialogCancelBtn` 上注册 `{ once: true }` 处理器，但未在 `els.confirmDialog` 上注册 `cancel` 事件监听（Escape 触发 `<dialog>` `cancel` 事件，按钮处理器从不消费）；每次 Escape 关闭后，下次 `showConfirmDialog()` 再次堆叠新处理器，点击确认时旧闭包（含前次操作的 `onConfirm`）与新闭包同时触发。（2）`deleteBook()`（`app.js:2070-2127`）：`cleanup()` 仅在 `onConfirm`/`onCancel` 中调用，未在 `deleteBookDialog` 上注册 `cancel` 监听；多次 Escape 后可积累多个捕获不同 `bookId` 的闭包，下次点击确认可连续删除多本书。
- why: Escape 是改变主意时最自然的关闭手势；确认对话框的幂等性破坏可导致难以察觉的数据丢失（与 OPT-040/041/043 同类，均为数据安全边界）。
- how: （1）`showConfirmDialog`（`app.js:2286-2297`）末尾追加 `els.confirmDialog.addEventListener("cancel", () => { /* { once: true } handlers已消耗完 */ }, { once: true })`；更彻底的方案：将两个 `{ once: true }` 改为具名函数并在 `cancel` 事件中同步调用 `els.confirmDialogConfirmBtn.removeEventListener(...)` 和 `els.confirmDialogCancelBtn.removeEventListener(...)`。（2）`deleteBook()`（`app.js:2120` 附近，`els.deleteBookDialog.showModal()` 之后）追加 `els.deleteBookDialog.addEventListener("cancel", cleanup, { once: true })`。Touch: `app.js:2286-2297`（showConfirmDialog），`app.js:2070-2127`（deleteBook）。

### OPT-063 — `compress_chat_history_if_needed()` API 失败时写入截断历史，永久丢失旧聊天记录 — 由 explore E102 提拔
- status: done (PR #49 merged 2026-06-24)
- area: backend
- priority: P1
- size: S
- northstar: 中——聊天历史是「探讨历史」唯一载体，是 Theme 2「回顾有价值」的前提数据；DeepSeek 瞬断（429/超时）造成的静默丢失与 OPT-040/041 进口丢失同类（数据安全边界），修复 2 行，零副作用。
- description: `compress_chat_history_if_needed()`（`app_server.py:2267-2292`）在 `call_deepseek()` 抛出异常时，`except` 分支将 `compressed` 设为 `recent`（最近 6 条，`_COMPRESS_KEEP_RECENT=6`），然后**无条件**执行 `save_state(conn, user_id, state)`（`app_server.py:2291`）将截断历史写入 SQLite。触发条件：历史超过 10 条（`_COMPRESS_THRESHOLD=10`，`app_server.py:2263`）时若压缩 API 失败，前 N-6 条历史永久不可恢复——下次请求从 DB 读回的已是截断版本。一次 DeepSeek 429 限速即可触发：用户连聊 6 轮后（~3 分钟），API 拥堵瞬间即销毁早期探讨内容。
- why: 深度探讨（10 轮以上）是 app 差异化功能的核心使用场景；此类静默丢失对用户信任的破坏性高于任何 UI 摩擦；修复成本极低（2 行改动）。
- how: 将 `save_state` 调用移入 `try` 块内（压缩成功才持久化），`except` 改为直接 `return history`（原样返回，下次请求在条件改善时重试压缩）。修改后：`app_server.py:2279-2292` 的 `try` 块末尾追加 `state.setdefault("chatHistories", {})[history_key] = compressed; save_state(conn, user_id, state); return compressed`；`except Exception: return history`。Touch: `app_server.py:2267-2292`（`compress_chat_history_if_needed` 函数体，约 4 行重排）。

### OPT-064 — `PromptBuilder.build_chat_prompt()` 向 LLM 发送摘抄完整对象含 `ocrText`，每次对话浪费数百至数万 token — 由 explore E101 提拔
- status: done (PR #55, merged 2026-07-06 — build_chat_prompt 摘抄白名单过滤 ocrText/imageUrl/ocrStatus/ocrSource/ocrError/ocrUpdatedAt/ocrRequestedAt；零 API/DB 变更)
- area: backend
- northstar: 中——与 OPT-020/OPT-047 同类，直接降低每次探讨的 API 成本；`ocrText` 字段是隐形成本炸弹（用户 OCR 越多、每次对话越贵），Theme 1 成本控制遗漏项。
- description: `app_server.py:2319` 将摘抄列表以完整对象形式写入 LLM payload（`"quotes": quotes`）。每个对象包含 LLM 推理无用字段：`imageUrl`（~8 tokens）、`ocrStatus/ocrSource`（各 ~3 tokens）、`ocrError`（~5 tokens）、`ocrUpdatedAt/ocrRequestedAt`（各 ~8 tokens），以及最严重的 `ocrText`——快速 OCR 后若用户已手动编辑 content，原始全页文本以 `ocrText` 保留（`app_server.py:1347-1352`），每页 500-2000 字符（125-500 tokens）；20 张摘抄含 5 张 ocrText 即超 2500 tokens。同理 `focused_quote`（`app_server.py:2320`）也含 `imageUrl` 等字段。估算：正常场景 ~600 tokens 浪费，ocrText 全量存在时超 10,000 tokens。OPT-020（connections 字段裁剪）和 OPT-047（all_books_summary 截断）已修复同类问题，本项是漏网的同等优先级补丁。
- why: DeepSeek 按 token 计费；prompt 字段每次对话都在消耗。`ocrText` 是 UI 层的临时中间状态，与 LLM 推理完全无关；`imageUrl`、`ocrStatus` 等字段同理。修复使每次探讨 prompt 精简，成本与 OPT-047 修复量级相当。
- how: 在 `build_chat_prompt()`（`app_server.py:2312-2345`）中对 `quotes` 列表做 dict comprehension 白名单过滤，保留 `id, bookId, content, kind, tags, page, createdAt, reflection`；对 `focused_quote` 同理；对 `book` 对象去掉 `coverImageUrl`。无 API/DB schema 变更，无前端变更。Touch: `app_server.py:2312-2345`（`build_chat_prompt` 方法）。

### OPT-065 — `reading_mcp_server.py:_save_state()` 跳过 `sanitize_state()` 验证，MCP 写路径无状态校验 — 由 explore E103 提拔
- status: triaged
- area: backend
- northstar: 中——MCP 写路径是 Claude Desktop 的主要数据入口；绕过 `sanitize_state()` 可静默写入 chatHistories legacy 格式或 books 非 list，导致下次 HTTP 请求时自动清空对应数据；数据安全边界，S 修复。
- description: `reading_mcp_server.py:_save_state()`（第 70–75 行）直接 `UPDATE user_state SET state_json = ?` 并 `commit()`，没有调用 `sanitize_state()`。对比 `app_server.py:save_state()`（第 699–706 行）：先 `sanitized = sanitize_state(state)` 再写入。`sanitize_state()`（`app_server.py:633–667`）职责：① chatHistories 旧格式迁移；② chatContexts 结构规整；③ books/sessions/quotes/connections 必须为 list；④ 只保留已知顶级键。6 个 MCP 工具（add_note、add_book、summary、question、tag、link_thought）均通过 `_save_state()` 写入，全部绕过验证。注意与 OPT-029 的区别：OPT-029 解决并发读改写竞争（BEGIN IMMEDIATE），本项解决写入前缺少 schema 验证。
- why: MCP 服务器是独立写路径，不经过 app_server.py 请求处理链。最危险场景：chatHistories 以 legacy 格式写入未迁移，下次 HTTP GET 经 sanitize_state() 时自动清空对应聊天记录。修复成本极低，防止 MCP 客户端 bug 或异常调用将无效状态静默写入 SQLite。
- how: 在 `reading_mcp_server.py:_save_state()` 中调用 `sanitize_state` 后再序列化写入。最简：从 `app_server` 导入 `sanitize_state`（需验证无循环 import 风险，两模块目前互不引用）；若有风险则将 `sanitize_state` 提取到共享 `state_utils.py`。Touch: `reading_mcp_server.py:70-75`（`_save_state` 函数）；可能需新增 `state_utils.py` 或修改 import。

### OPT-066 — 编辑阅读会话未同步书籍进度字段（`currentPage` / `lastReadAt` / `updatedAt`） — 由 explore E107 提拔
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——书籍进度显示依赖 `book.currentPage` 和 `book.lastReadAt`；编辑会话后进度不更新是对 Theme 1「采集顺滑」数据准确性的无声破坏；S 修复，消除新建/编辑两路径的逻辑分叉。
- description: `app.js:2029-2037`（session 编辑分支）仅更新 session 记录本体，未重算 `book.currentPage`、`book.lastReadAt`、`book.updatedAt`，也不触发 `finished` 状态判断。对比新建 session 分支（`app.js:2046-2055`）明确更新了这三个字段。结果：将某会话 endPage 从 150 改成 200，书单「读到第 150 页」不变；把最后一会话 endPage 改为等于 totalPages，书籍不会自动标记为 finished。
- why: 编辑会话是常规笔误纠正操作；书单页和书籍详情依赖 `book.currentPage`/`lastReadAt` 驱动进度展示；编辑后不同步会造成显示与实际数据不一致，影响用户对进度的信任。
- how: 在 `if (existingId)` 编辑分支末（`app.js:2037` 之后）补全 book 字段重算：`book.currentPage = Math.max(...state.sessions.filter(s=>s.bookId===bookId).map(s=>s.endPage||0)); book.lastReadAt = date; book.updatedAt = new Date().toISOString();`；并补 finished 判断（与新建分支对称）。Touch: `app.js:2029-2037`（session 编辑分支）。

### OPT-067 — `contextFromHistoryKey()` 缺少 `quote:` 前缀处理，前后端逻辑不对称 — 由 explore E106 提拔
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 弱→中——`chatContexts` 脱同步时（import 边缘场景、状态迁移），摘抄级聊天历史因 context 解析错误不可寻回；1 行修复，消除前后端不对称，与 OPT-063/OPT-065 同属「历史数据可靠性」类。
- description: `app.js:274-279`（`contextFromHistoryKey`）处理 `book:` 前缀但对 `quote:` 直接 fallthrough，将其解析为 `{type:"book", bookId:"<quoteId>"}` 而非 `{type:"quote", quoteId:"<quoteId>"}`. 后端 `app_server.py:617-625` 正确处理 `quote:` 前缀。触发路径：`parseChatState()`（`app.js:292-294`）在 `rawContexts[key]` 缺失时回退至此函数——`chatContexts` 与 `chatHistories` 脱同步（import 覆盖 chatContexts 但保留 chatHistories、或状态迁移）时即触发，已有的摘抄聊天历史在前端被映射到不存在的 bookId，对用户不可见。
- why: 摘抄级聊天（「去聊」功能）的历史 key 形如 `quote:<quoteId>`，是 Theme 2「回顾有价值」的核心数据路径之一；S 修复（1 行）消除与后端对称性缺口。
- how: 在 `app.js:277-278` 之间插入：`if (key.startsWith("quote:")) return normalizeChatContext({ type: "quote", quoteId: key.slice(6) });`。Touch: `app.js:274-279`（`contextFromHistoryKey` 函数）。

### OPT-068 — 导入减量守卫未覆盖 `chatHistories`：旧备份可静默清空聊天记录 — 由 explore E108 提拔
- status: done (PR #51, 2026-06-27 merged — stateContentCount 补 Object.keys chatHistories 计数；_categoryLabels 加 chatHistories 条目；decrease guard 统一走 Object.keys；4 行，零后端变更)
- area: frontend
- priority: P1
- size: S
- northstar: 中——Theme 2「回顾有价值」以聊天历史为核心数据；import 路径的静默覆盖与 OPT-063（compress 路径丢失）构成同类「历史数据丢失」风险；本项填补数据安全护栏的最后一个口。
- description: `app.js:3077-3084` 的 decrease guard 仅检查 `books`、`quotes`、`sessions`、`connections` 四类，未涵盖 `chatHistories`。`resolveImportedState()`（`app.js:2994-3006`）确实将备份中的 `chatHistories` 写入 resolved 状态。场景：用户导入较旧备份，该备份中 books/quotes/sessions 数量相同但 chatHistories 为空（彼时未用聊天功能）——四类守卫不触发，直接调用 `applyImport()`，现有的全部聊天历史被静默覆盖为空。`stateContentCount()`（`app.js:3009-3016`）同样不计 chatHistories。
- why: OPT-063 已将聊天历史定性为 P1 数据安全；chatHistories 是唯一既被 import 写入、又不在减量守卫内的「有价值」数据类型。修复仅 4 行，无后端变更。
- how: 在 `_categoryLabels`（`app.js:3077`）中增加 chatHistories 条目（label="聊天记录"）；在 reduce/count 逻辑中对 chatHistories 使用 `Object.keys(state.chatHistories||{}).length` 而非 `Array.isArray` 路径；在 `stateContentCount()`（`app.js:3009-3016`）补同款计数。Touch: `app.js:3009-3016`（stateContentCount）；`app.js:3077-3084`（decrease guard）。

### OPT-069 — `call_deepseek_stream()` 无重试：主聊天路径遇瞬断即报错 — 由 explore E109 提拔
- status: done (PR #50 merged 2026-06-25)
- area: backend
- priority: P1
- size: S
- northstar: 强——主聊天（Theme 2「回顾有价值」核心入口）遇瞬断即崩是对用户信任的直接伤害；修复使 streaming 路径与非 streaming 路径同等可靠（同为 3 次重试 + 指数退避），S 改动消除两路径的一致性缺口。
- description: `call_deepseek()`（`app_server.py:3182-3219`）有完整重试循环（`DEEPSEEK_MAX_ATTEMPTS=3`，`DEEPSEEK_RETRYABLE_CODES={429,500,502,503}`，指数退避）；`call_deepseek_stream()`（`app_server.py:3222-3265`）遇到 HTTPError/URLError 直接 `raise RuntimeError(...)` 无任何重试。主聊天路径走 streaming（`app_server.py:4834`），任何瞬断用户即见错误弹框。现有测试 `tests/agent/deepseek_retry_test.py` 只覆盖 `call_deepseek()`，streaming 路径零测试。
- why: DeepSeek 429（rate limit）和 502/503 在高峰期属正常瞬断；非 streaming 路径早就静默恢复，streaming 路径却直接报错——两路径行为不一致是用户体验缺口。重试只需在 `urlopen()` 建立连接这一步循环，不需要对已建立的 streaming chunks 做重试。
- how: 在 `call_deepseek_stream()`（`app_server.py:3222-3265`）中：将 `urlopen()` 调用放入 `for attempt in range(DEEPSEEK_MAX_ATTEMPTS):` 循环，retryable codes 判断和 `time.sleep` 退避逻辑镜像 `call_deepseek()` 模式（`app_server.py:3195-3211`）。同时在 `tests/agent/deepseek_retry_test.py` 新增 `DeepseekStreamRetryTest` 类覆盖 streaming 路径的 429/503 重试及最大次数耗尽。Touch: `app_server.py:3222-3265`；`tests/agent/deepseek_retry_test.py`。

### OPT-070 — `buildQuoteSearchCard()` OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 — 由 explore E113 提拔
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——全局搜索是「回顾」链路的关键入口；OCR 摘抄（有 `imageUrl`）在摘抄标签页显示缩略图、在搜索结果里显示灰色方块，视觉不一致削弱对工具的信任感；OPT-052 引入的缩略图概念需在全部渲染路径中对齐。
- description: OPT-052 在 `renderQuotes()`（`app.js:1447-1467`）摘抄卡片模板中加入了条件缩略图渲染（`app.js:1455`：当 `quote.imageUrl` 存在时显示 `<img>`），但全局搜索摘抄卡片函数 `buildQuoteSearchCard()`（`app.js:1193-1215`）未同步更新——封面区域在 `app.js:1199-1201` 硬编码为 `<div class="entry-cover-fallback"></div>`，永远显示灰色占位图，即使摘抄有 `imageUrl`。
- why: 同一条摘抄数据在两个渲染路径中视觉表现不一致；随着用户积累更多 OCR 摘抄，全局搜索结果里「该有图却没图」的卡片将越来越多，造成「全局搜索功能比摘抄标签差」的印象。
- how: 将 `buildQuoteSearchCard`（`app.js:1199-1201`）的封面区域改为条件渲染，逻辑与 `renderQuotes` 中的 `app.js:1454-1457` 相同；同时在图片加载后绑定 `onerror` 回退（可与 OPT-071 合并为单 PR）。Touch: `app.js:1193-1215`。

### OPT-071 — 摘抄卡片与详情弹窗图片缺少 `onerror` 回退：URL 失效时显示浏览器破图图标 — 由 explore E112/E114 提拔
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——Theme 1「采集顺滑」视觉可靠性分支；OPT-052 添加了缩略图功能但遗漏了错误处理；书籍卡片（`app.js:1162` 调用 `bindBookCoverImageFallback`）有完整 `onerror` 回退，摘抄卡片和详情弹窗无此保护，图片 URL 失效时破图图标破坏「不假思索信任工具」的体感。
- description: 两处遗漏：① `renderQuotes()` 中的摘抄卡片模板（`app.js:1455`）渲染 `<img>` 时无 `onerror`；书籍卡片在 `app.js:1162` 调用 `bindBookCoverImageFallback(card)`（`app.js:229-250`），监听 `error` 事件并回退到灰色占位图，摘抄卡片无此调用。② `openQuoteDetail()`（`app.js:2244-2251`）设置详情弹窗图片 src 后无 `onerror`；URL 失效时 `imgWrap` 已 `remove("is-hidden")` 但图片加载失败，弹窗顶部整块区域显示破图图标。
- why: 图片 URL 失效是真实场景（磁盘清理、服务器迁移、上传中断后的半成品记录）；处理缺失会在用户最常用的两个界面（摘抄列表 + 详情弹窗）留下视觉噪声；与 OPT-070 可合并为「OPT-052 视觉可靠性闭环」PR。
- how: ① 在 `renderQuotes()` 渲染完成后，对新渲染的摘抄卡片图片调用类似 `bindBookCoverImageFallback` 的函数，或直接在模板 `<img>` 后附加委托式 `error` 监听（避免 inline onerror CSP 风险）。② 在 `openQuoteDetail()`（`app.js:2247`）的 `img.src = ...` 后加 `img.onerror = () => imgWrap.classList.add("is-hidden")`。Touch: `app.js:1454-1457`（摘抄卡片模板区域）；`app.js:2244-2251`（`openQuoteDetail`）；参考模式 `app.js:229-250`。

### OPT-072 — 搜索输入框无防抖，每次按键触发全量 DOM 重建 — 由 explore E115 提拔
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——搜索是「回顾」链路入口；摘抄积累 100+ 条后按键卡顿 200ms+ 是「等太久放弃」的典型场景，直接违背 Theme 1 验收条件；S 改动消除随积累量增长的体验悬崖。
- description: `app.js:4175-4176` 和 `app.js:3956` 三个搜索输入框以原始渲染函数直接作为 `input` 事件处理器，无防抖。`renderQuotes()`（`app.js:1401-1469`）在 `app.js:1433` 执行同步 `innerHTML` 全量重建，对比 `renderBooks()`（`app.js:1269-1317`）有 `requestAnimationFrame` 批量渲染保护。每次按键 → 立即触发全量 DOM 重建，移动端大量摘抄卡片时造成主线程阻塞卡顿。此问题在 explore E5（2026-05-30）和 E30（2026-06-02）均有记录，从未被提拔。
- why: Theme 1 验收需要「零等太久放弃」；随 OCR 积累量增长，搜索体验会出现悬崖式劣化，提前修复成本极低（5 行）；防抖是移动端输入框的基本卫生。
- how: 在 `app.js:4175-4176`（`quoteSearch`/`sessionSearch`）和 `app.js:3956`（`connectionSearch`）的 `addEventListener("input", fn)` 外加 `debounce(fn, 250)` 包裹（内联 `setTimeout/clearTimeout` 模式，无需引入依赖）；`renderQuotes`/`renderTimeline`/`renderConnections` 可各接收可选 filter 字符串参数以支持内部过滤。Touch: `app.js:3956, 4175-4176`（事件绑定）；`app.js:1401-1469`（`renderQuotes`，如需接受 filter 参数）。

### OPT-074 — 书籍 `startedAt`/`finishedAt` 数据已自动填充但从未在 UI 展示 — 由 explore E119 提拔 [signal-backed 2026-06-26]
- status: done (2026-06-27) — 书籍详情弹窗展示「开始/读完」日期行；编辑弹窗加两个 `type="date"` 输入可手动补/改日期（含「读完不早于开始」校验）；helper `isoToDateInput`/`dateInputToIso`；测试 `tests/frontend/book-reading-dates.test.js`（12 passed）。
- area: frontend
- priority: P1
- size: S
- northstar: 强——2026-06-26 owner 最新使用信号直接点名（「希望每本书有「开始阅读 / 读完」日期字段」）；`startedAt`/`finishedAt` 已通过 `saveSession()` 自动填充（`app.js:2135-2138`），仅缺少 UI 展示；完成后书单从「进度追踪器」升格为「阅读历程视图」，是 Theme 1（数据完整性可见）与 Theme 2（回顾有价值）的交汇点。
- description: `addBook()`（`app.js:2070-2072`）将 `startedAt`/`finishedAt`/`lastReadAt` 初始化为 `null`；`saveSession()` 新建路径（`app.js:2135-2138`）自动写入这三个字段（含 `book.status="finished"` 联动）。然而 `openBookDetailDialog()`（`app.js:2551-2557`）的 `bookDetailMeta`（`app.js:2556`）仅显示 `"${book.author} · ${statusMap[book.status]}"`，无任何日期展示；`buildBookSearchCard()` 进度文案（`app.js:1123-1126`）同样不含日期；`index.html:386-419` 书籍 dialog 无日期输入字段。`formatDate()` 辅助函数（`app.js:444-451`）已就位可直接调用。Owner 误以为「只能手动加记录才能标记日期」，实际数据早已自动写入，只是从未被展示。
- why: S 级展示修复可立即消除 2026-06-26 最新信号摩擦，无需新增数据采集路径；「读完日期」是书单页最直观的成就感触点，修复后 owner 可立刻看到《激情耗尽》的读书区间，直接验证北极星「不假思索的默认工具」体感。
- how: 最小修复（S）：在 `app.js:2556` 的 `bookDetailMeta` 末尾追加 `startedAt`/`finishedAt` 显示（调用 `formatDate()`，形如「开始：2026-05-01 · 读完：2026-06-26」）；可选在 `buildBookSearchCard()` 进度文案（`app.js:1123-1126`）追加 `lastReadAt`。可选升级（M）：在书籍 dialog（`index.html:386-419`）增加两个 `type="date"` 输入字段，支持手动设置/修正日期（处理「读完但没记 session」场景）。Touch: `app.js:2551-2560`（`openBookDetailDialog`）；可选 `app.js:1123-1126`（`buildBookSearchCard`）；可选 `index.html:386-419`（书籍 dialog）。

### OPT-073 — 非超时类聊天流式错误无内联重试按钮，用户无一键恢复路径 — 由 explore E117 提拔
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——聊天是 Theme 2「回顾有价值」的核心动作；OPT-069（后端重试）之后若重试耗尽，前端依然无 UI 级恢复；S 改动把错误状态从「死胡同」变为「可自愈节点」，消除移动网络中断场景下的摩擦。
- description: `chat.js:702-719` 错误处理仅 `AbortError`（30s 空闲超时）路径调用 `renderStreamTimeout()` 显示重试按钮（`chat.js:724-744`）；`rate_limited`（429）路径仅附加限流样式消息，无重试按钮；通用 `else`（502/503/网络中断）路径同样仅 `appendMessage("出错了：${message}")`，无重试按钮。`retryFn` 在 `catch` 作用域内已可访问，`renderStreamTimeout` 的按钮逻辑已实现，复用成本极低。
- why: 移动网络中断属常见场景；出错后用户需手动重输问题，直接阻断探讨流；OPT-069 处理了后端瞬断，本项处理前端持久失败后的 UI 恢复，两者互补。
- how: 将 `renderStreamTimeout()`（`chat.js:724-744`）中的重试按钮创建逻辑提取为 `appendRetryButton(container, retryFn, label)` 函数；在 `rate_limited` 和通用 `else` 分支的 `appendMessage` 之后各调用一次 `appendRetryButton(msgDiv, retryFn, "重试")`。`retryFn` 可直接复用 `AbortError` 分支传入的 `retryFn`（同作用域）。Touch: `chat.js:702-719`（错误处理分支）；`chat.js:724-744`（`renderStreamTimeout`，提取重试按钮逻辑）。

### OPT-075 — `saveBookEdit()` 手动设置「已读完」状态时不写入 `finishedAt`，OPT-074 上线后日期展示出现空洞 — 由 explore E123 提拔 [2026-06-27]
- status: done (2026-06-28, addressed by OPT-074 implementation — app.js:2592-2600 中 `if (book.status === "finished" && !book.finishedAt)` 已自动填充 finishedAt，无需单独实现)
- area: frontend
- northstar: 强——是 OPT-074（书籍日期展示）的数据完整性前提；「读完日期」是北极星「不假思索的默认工具」最直观成就感触点；S 级单行修复可避免 OPT-074 上线后立即出现「已读完但读完日期=未记录」的矛盾展示。
- priority: P1
- size: S
- description: `saveBookEdit()`（`app.js:2486-2501`）在用户通过 dropdown 选择「已读完」时，`finishedAt` 的写入被 `if (book.totalPages && currentPage >= book.totalPages)` 条件块守卫（`app.js:2496`）。当用户未填写 `totalPages` 而直接将状态改为「已读完」时，`startedAt` 和 `lastReadAt` 均被正确写入（`app.js:2490-2494`），但 `finishedAt` 永远为 `null`。OPT-074（PR #53 in-progress）上线后，`openBookDetailDialog()` 将展示 `finishedAt`，手动标记「已读完」的书将显示「读完：未记录」，数据状态与展示状态不一致。
- why: 修复仅 1 行代码，在 OPT-074 合并前或同 PR 修复最合适；延迟修复将导致 owner 打开 OPT-074 新功能时立刻看到数据空洞，破坏新功能的第一印象。
- how: 在 `app.js:2494`（`startedAt` 写入块结束处）追加：`if (book.status === "finished" && !book.finishedAt) { book.finishedAt = book.lastReadAt; }`。可选在 `tests/frontend/book-detail-ux.test.js` 或新增测试文件加回归用例：模拟无 `totalPages` 的书被 `saveBookEdit()` 标为 "finished"，断言 `book.finishedAt` 不为 null。Touch: `app.js:2490-2501`。

### OPT-076 — `renderTimeline()` 硬上限 10 条且无任何告知，阅读历史超 10 次后早期记录不可见 — 由 explore E124 提拔 [2026-06-27]
- status: triaged
- area: frontend
- northstar: 中——Theme 2「回顾有价值」北极星代理指标「本周回顾操作次数」依赖能翻到早期阅读记录；当前 10 条上限在真实使用 2-3 个月后触发，是 Theme 2 验收期前需修复的前置缺陷。
- priority: P2
- size: M
- description: `renderTimeline()`（`app.js:1337`）无搜索词时静默截断：`allSorted.slice(0, 10)`。无数量提示、无分页按钮、无「查看更多」入口。用户有 20+ 条阅读记录时，只能通过搜索书名才能看到早期记录，无法按时间顺序浏览完整阅读历史。对比摘抄（`renderQuotes()`）和书单（`renderBooks()`）均无数量上限，「记录」是唯一有硬截断的标签页。
- why: 「什么时候读完这本书」「上个月读了哪些书」是 Theme 2「回顾有价值」的核心场景；如果只能看到最近 10 条，时间线实质上无法作为阅读历程工具使用。
- how: 方案 B（推荐，M 复杂度）：在截断处改为 `allSorted.slice(0, displayLimit)`（初始值 10），渲染后若 `allSorted.length > displayLimit` 则追加「加载更多（共 N 条）」按钮；点击递增 `displayLimit` 并重渲。添加 `let sessionDisplayLimit = 10` 为模块级变量，`renderTimeline()` 使用并在「加载更多」click 后重调。Touch: `app.js:1337`（截断逻辑）；`app.js:1351-1399`（DOM 渲染，加载更多按钮插入点）。

### OPT-077 — `renderTimeline()` 不含书籍里程碑事件（startedAt/finishedAt），阅读历程图不完整 — 由 explore E122 提拔 [2026-06-28]
- status: triaged
- area: frontend
- northstar: 中——OPT-074 已使 startedAt/finishedAt 可靠落盘且在详情页可见；将这两个里程碑纳入时间线，让「记录」Tab 从「session 日志」升级为「阅读历程图」，是 Theme 2「回顾有价值」的核心基础设施；北极星代理指标「本周回顾操作次数」依赖时间线能反映完整阅读历程。
- priority: P2
- size: M
- description: `renderTimeline()`（`app.js:1321-1399`）的 `allSorted` 数组仅由 `state.sessions` 构成（`app.js:1321-1333`）：`const allSorted = (state.sessions || []).slice().sort(...)` — 书籍的 `startedAt`/`finishedAt` 里程碑从未出现在时间线中。OPT-074 上线（PR #53, 2026-06-27）后，书籍「开始阅读」和「读完」日期已可靠自动填充并在详情弹窗展示，但时间线依然看不到这些里程碑。用户读完一本书，时间线只有若干 session 卡片，没有「📖 开始阅读《XXX》」和「✅ 读完《XXX》」里程碑节点，无法一眼把握某本书的完整读书区间。
- why: Theme 2 的核心场景是「什么时候读完这本书」「某段时间我读了什么」——当前时间线只回答了「某段时间我读了多少分钟」，不回答「书籍维度的阅读历程」。里程碑事件是时间线产品价值的质变点：它将阅读体验从「打卡日志」升级为「阅读历程回顾」，直接支撑北极星「不假思索的默认工具」。OPT-074 的数据已到位，现在是展示层的闭环。
- how: 在 `renderTimeline()` 开头从 `state.books` 提取所有有 `startedAt`/`finishedAt` 的书，构建里程碑事件列表（`{type:"milestone", kind:"started"|"finished", bookId, date: startedAt/finishedAt, book}`），与 `sessions` 数组合并后统一按 `date` 排序；为里程碑设计专属卡片 HTML 模板（视觉上与 session 卡片区分，如「📖 开始阅读《书名》」「✅ 读完《书名》」）；`searchRaw` 过滤时对里程碑按书名过滤，与现有 session 过滤逻辑并列。无后端/DB schema 改动。Touch: `app.js:1321-1399`（`renderTimeline`）；`styles.css`（里程碑卡片样式，少量新增）。

### OPT-078 — 自定义摘抄标签仅存 localStorage，跨设备不同步，导出包中不存在 — 由 explore E120 提拔 [2026-06-28]
- status: in-progress (2026-07-07, branch auto/opt-078-custom-tags-sync)
- area: frontend
- northstar: 中——自定义标签是 Theme 2「回顾有价值」里「按主题检索」路径的基础；标签体系越积累越难补救——换设备或清缓存后选项消失，历史摘抄的主题过滤入口失效；Theme 2 验收前修复成本最低。
- priority: P2
- size: M
- description: `getCustomQuoteTags()`（`app.js:480-481`）和 `saveCustomQuoteTags()`（`app.js:483-484`）将用户自定义摘抄标签完全存储在浏览器 localStorage 中（`localStorage.getItem("quote-custom-tags")`）。`sanitize_state()`（`app_server.py:633-667`）维护的 server-side state schema（`books/sessions/quotes/connections/chatHistories/chatContexts`）完全不包含 `customQuoteTags` 字段，确认无任何服务端持久化路径。用户在 iPhone 上建立的标签体系不存在于 `/api/account/export` 导出包中；换设备、清浏览器缓存、或通过另一台设备访问后，标签选项全部消失——摘抄本身的 `tags` 字符串保留，但新增摘抄时不再提示已有标签，旧标签选项无法从已有摘抄自动重建（除非手动逐条查看）。
- why: 标签是 Theme 2「按主题检索」的核心工具；摘抄标签数据库越积累，补救成本越高；标签在 export 中不存在意味着备份不完整，与 OPT-068（chatHistories 减量守卫）、OPT-063（compress 失败丢失）同属「数据孤岛」类问题；M 级修复在 Theme 2 启动前最合适。
- how: ① 在 `sanitize_state()`（`app_server.py:633-667`）的返回 dict 中增加 `customQuoteTags` 字段（默认值 `[]`）；② `saveCustomQuoteTags()`（`app.js:483-484`）改为双写：先 `localStorage.setItem(...)` 保持 UI 即时响应，再将 `state.customQuoteTags` 更新并调用 `syncState()` 持久化到服务端；③ `getCustomQuoteTags()`（`app.js:480-481`）改为优先读 `state.customQuoteTags`（若存在且非空），回退 localStorage（迁移过渡期）；④ 更新 `tests/agent/state_sanitization_test.py` 中的 schema 快照测试（如有）。Touch: `app.js:480-484`；`app_server.py:633-667`（`sanitize_state`）。

### OPT-079 — 摘抄卡 ⋯ 菜单增加「建立关联」直达入口 — 由 explore E129 提拔 [2026-06-29]
- status: in-progress (PR #56, 2026-07-07, 与 OPT-080 合并一 PR，待审合)
- area: frontend
- northstar: 中——Theme 2「回顾有价值」；从摘抄卡直接触发关联消除 2 步固定摩擦，降低建立关联的放弃率；signal 2026-06-29 佐证
- priority: P2
- size: S
- description: `app.js:1528-1531` — 摘抄卡 ⋯ 右键菜单仅含「去聊」「编辑」「删除」三项，无「建立关联」。当前唯一触发路径：点卡 → 打开详情弹窗 → 点「建立关联」按钮（3 步）。⋯ 菜单加「建立关联」选项可减为 1 步；`quoteMenuHandler` 已有分发机制，加 `case "connect"` 无结构改动。
- why: 「建立关联」是 app 差异化功能；owner 2026-06-29 signal 明确指出从摘抄触发关联有摩擦（来源未自动填入）；减少触发步骤 + OPT-080 修复目标可辨识度，合并 PR 可系统性解决该摩擦点。
- how: ① `app.js:1528-1531` 菜单模板加 `<li><button type="button" data-quote-menu="connect">建立关联</button></li>`；② `quoteMenuHandler`（`app.js:~1535`）加 `case "connect"` 分支，调用 `openConnectionDialog({ sourceType: "quote", sourceId: quote.id })`。同 PR 可顺带修复 E131（`app.js:3914` 目标类型默认值）和 E132（`app.js:3820` slice 30 → 50），形成「建立关联」体验修复包。Touch: `app.js:1528-1535`。

### OPT-080 — 关联对话框目标摘抄标签截断至 32 字 + CSS 双重省略导致同书摘抄无法辨识 — 由 explore E130 提拔 [2026-06-29]
- status: in-progress (PR #56, 2026-07-07, 与 OPT-079 合并一 PR，待审合)
- area: frontend
- northstar: 中——Theme 2「建立关联」核心路径；目标摘抄可辨识度直接决定关联建立质量；signal 2026-06-29 明确佐证「目标显示不完整、看不清内容、找不到想关联的那一条」
- priority: P2
- size: S
- description: `quoteLabel()`（`app.js:3812-3817`）将摘抄内容截断至 32 字，且 `<li>` 样式（`app.js:3849`）设 `white-space:nowrap;text-overflow:ellipsis`，双重截断。同一本书有多段摘抄时，候选列表每条标签仅剩「书名 · 前32字…」，内容高度重叠，无法准确定位目标摘抄。
- why: 关联目标无法辨识直接导致关联功能可用性降为零；这是 Theme 2 最高密度痛点；最小改动代价（一行 slice 值）即可显著改善；与 OPT-079 合并为单一 PR 成本最低。
- how: ① `app.js:3815` 将 `slice(0, 32)` 改为 `slice(0, 60)`（下拉候选列表 60 字仍可单行或允许折行）；② 可选：`app.js:3849` 的 `<li>` 样式改为双行布局（书名一行、内容一行，去掉 `nowrap`），彻底解决截断问题；③ 建议同一 PR 合并 OPT-079 + OPT-080 + E131（目标类型默认值 `app.js:3914`）+ E132（slice 30 → 50），将「建立关联」体验作为整体修复包。Touch: `app.js:3815`；可选 `app.js:3849`。

### OPT-081 — Organize/Candidates 批量采集功能全链路失活：前端完整实现但 HTML Dialog 不存在、无调用者、后端无 `/api/organize/parse` 端点 — 由 explore E133 提拔 [2026-06-30]
- status: triaged
- area: frontend, backend
- priority: P2
- size: M
- northstar: 中/强（如激活）——批量从粘贴文字中提取摘抄候选、AI 拆分 + 审批入库，直接支撑 Theme 1「采集顺滑」；现有 OCR 路径仅支持逐图识别，文字粘贴批量路径覆盖「书中已有电子文字」「读书笔记 App 导出」等场景，是一条沉睡的高价值采集通道。
- description: `app.js:114-127` 共 11 个 `els.*` 引用（`els.organizeDialog`/`els.candidatesDialog` 等）全部指向**不存在于 `index.html` 的 DOM 元素**，运行时返回 `null`。`index.html` 全文无 `id="organizeDialog"` 或 `id="candidatesDialog"` 定义。`openOrganizeDialog()`（`app.js:2808`）在整个代码库无任何调用者。前端 `submitOrganizePaste()` 调用 `/api/organize/parse`（`app.js:2862`），但 `app_server.py` 无此端点。功能实现代码约 150 行（`app.js:2808-2914`：`openOrganizeDialog`、`switchOrganizeTab`、`handleOrganizeImageSelect`、`submitOrganizePaste`、`openCandidatesDialog`、`approveCandidateItem`、`ignoreCandidateItem`），三层均失活。
- why: 这是一笔已完成的前端投资：用户可粘贴书中文字或读书笔记，AI 识别并拆分为多条摘抄候选，用户逐条审批保存——整个 UX 流程已在 JS 中实现，只差激活。与逐图 OCR 互补，覆盖电子文字场景。激活代价（补 HTML + 后端端点 + 一个触发按钮）远低于重写，且产出价值对 Theme 1 是正向的。
- how: ① `index.html`：补写 `<dialog id="organizeDialog">` 粘贴/拍照双 Tab 界面（`organizeRawText` textarea + `organizeSubmitBtn`）和 `<dialog id="candidatesDialog">` 候选审批列表；② `app.js`：在 `openBookDetailDialog()` 的 `dialog-actions` 区域或 OCR 入口旁增加「整理文字摘抄」按钮，点击调用 `openOrganizeDialog(bookId)`；③ `app_server.py`：新增 `POST /api/organize/parse`，接收 `{bookId, rawText}`，调用 `PromptBuilder` + `call_deepseek()` + `ActionExecutor` 链路，返回 `{candidates: [{id, type, confidence, data:{content,tags}}]}`。

### OPT-082 — `renderTimeline()` 阅读统计摘要（sessionStats）仅在搜索时显示，默认视图无累计阅读数据 — 由 explore E134 提拔 [2026-06-30]
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——roadmap §2 将「本周使用天数」列为北极星代理指标；「记录」Tab 默认视图展示全量聚合摘要（总次数 / 总分钟 / 估算总页数）让积累可感知，符合北极星「不假思索的默认工具」体感（app 主动告知阅读量，不靠用户手算）。
- description: `renderTimeline()`（`app.js:1418-1428`）的 `sessionStats` 控制块：`if (searchRaw && sessions.length)` 守卫使聚合数据仅在用户主动搜索时显示；无搜索的默认视图（最近 10 条）永远 `is-hidden`。用户有 30 条 session 时，「记录」Tab 默认不显示「共 30 次 · 累计 1 800 分钟 · 约 2 500 页」——owner 无法一眼感知阅读量积累。
- why: 聚合摘要（总次数 / 总分钟）是「阅读量可感知」的最低成本实现；roadmap §2 指定了三个需每周记录的代理指标，其中「本周使用天数」依赖 session 记录——默认视图展示聚合数据可帮助 owner 在不搜索的情况下自然验证指标；S 复杂度，单处条件改动。
- how: `app.js:1419` 将 `if (searchRaw && sessions.length)` 改为 `if (allSorted.length)`（含搜索词时展示匹配计，无搜索时展示全量统计）；对应 `textContent` 区分两种文案：有搜索时保持「N 次记录 · 共 T 分钟 · 约 P 页」；无搜索时改为「共 N 次 · 累计 T 分钟 · 约 P 页」（含 10 条截断时在 OPT-076 修复后可进一步完善）。Touch: `app.js:1418-1428`。

### OPT-083 — `renderQuotes()` 搜索 haystack 不含 `ocrText`：AI-OCR 直存摘抄完全不可搜 — 由 explore E136 提拔 [2026-07-01]
- status: triaged
- area: frontend
- priority: P1
- size: S
- northstar: 强——Theme 2「回顾有价值」的前提是摘抄可被搜到；快速 OCR 未编辑直接保存的摘抄（content=""，ocrText=识别全文）在「摘抄」Tab 搜索中完全不可见，OCR 路径积累越多回顾越失准；S 复杂度单行热修，性价比极高。
- description: `renderQuotes()`（`app.js:1495-1503`）haystack 数组包含 `item.content || ""`（`app.js:1498`），但**不含 `item.ocrText`**。同函数第 1519 行显示逻辑使用 `quote.content || quote.ocrText`——两者不一致。快速 OCR 识别成功后若用户未手动编辑即保存，数据结构为 `{content: "", ocrText: "<识别全文>"}` ；这类摘抄可显示但搜索完全命中不了。`matchQuotes()`（`app.js:1143`）同样只校验 `quote.content || ""`，影响 Chat 摘抄上下文召回。
- why: 快速 OCR 是最高频的「采集顺滑」输出路径，用户积累的 OCR 摘抄越多，「摘抄」Tab 搜索越失准；存进去找不回来是对北极星「不假思索的默认工具」的直接否定。
- how: ① `app.js:1498`：将 `item.content || ""` 改为 `item.content || item.ocrText || ""`（或在 haystack 数组追加 `item.ocrText || ""`）；② `app.js:1143`：将 `fuzzyMatch(quote.content || "", query)` 改为 `fuzzyMatch(quote.content || quote.ocrText || "", query)`。两处改动，无副作用，建议同 PR。Touch: `app.js:1498`、`app.js:1143`。

### OPT-084 — `openNewSessionForBook()` 从不预填 `startPage`，每次录入需手动输入已知起始页 — 由 explore E137 提拔 [2026-07-01]
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 中——Theme 1「采集顺滑」每日触点；session 录入是 roadmap W27 焦点路径（OPT-059/058/061/066 同路径），startPage 预填减少每次录入 1–2 次交互，积少成多；S 复杂度，建议与同路径修复包搭车。
- description: `openNewSessionForBook()`（`app.js:2436`）每次打开对话框时将 `startPage` 强制清空（`value = ""`）。`addSession()`（`app.js:2221-2225`）每次提交都更新 `book.currentPage = Math.max(book.currentPage || 0, endPage)`——该值等于该书所有 session 中最大的 endPage。对顺序阅读用户，下次 session 的 startPage = book.currentPage + 1，值已知但每次须手动输入。
- why: 「记阅读 session」是 owner 最活跃的录入路径（6/26 signal 佐证，W27 焦点）；startPage 手动输入是已知可消除的重复摩擦；预填值以「建议值」呈现（用户仍可改），不存在强制覆盖风险。同时修复 E138（deleteSession 不回写 book.currentPage）可确保预填基准正确。
- how: `app.js:2436`：将 `value = ""` 改为 `value = (book && book.currentPage > 0 ? book.currentPage + 1 : "")`；需在该行前确保 `book = state.books.find(b => b.id === bookId)`（openNewSessionForBook 入参已有 bookId）。建议同 PR 修复 E138（deleteSession 回写逻辑），消除数据不对称。Touch: `app.js:2430-2441`；参照 `app.js:2221-2232`（addSession currentPage 维护逻辑）。

### OPT-085 — 书封面上传未压缩（单张可达 4.6MB），拖慢移动端书单加载 — owner 2026-07-02 手机亲测
- status: done (2026-07-06 — 方案 A：前端压缩早已实现，本次只做历史存量清理)
- done note (2026-07-06，实测核对后重定范围): **原描述「封面上传未压缩」已过时。** 三条封面上传路径（新建 `bookImageInput` app.js:4559 / 编辑 `bookEditImageInput` app.js:4545 / 更换 `changeBookCover` app.js:3068）自 `2026-05-14`（`resizeImageToDataUrl`）起**已全部压缩到 1200px/q0.85**，backlog「推荐方案①前端 canvas 限宽」即已上线代码。磁盘实测证实：>1MB 大图 12 张（合计 36MB）**mtime 全在 4月–5月13日**（压缩上线前），压缩后仅 2 张 >1MB 且是摘抄 OCR 图（`QUOTE_IMAGE_MAX_PX=1800/q0.92` 为识别质量保高分辨率，非封面）。「书单巨卡」本已被缩略图(opt2 `.thumb.jpg` ~30KB)+懒加载遮蔽。**真正剩余工作=一次性历史清理**：`scripts/generate_thumbnails.py --recompress-originals`（就地重压 >1.2MB 老图到 1600px/q0.80，保持文件名/格式→URL 不变，压前备份到 `uploads-recompress-backup-<date>/`，仅更小才替换）。2026-07-06 dev 已执行：12 张 36MB→4.6MB（省 31.4MB），缩略图已重生成，备份完好。回归测试 `tests/agent/recompress_originals_test.py`（6 例：目标选择/阈值/dry-run 无副作用/flag 解析）。**prod 侧同样的历史大图需在 prod checkout 各跑一次**（`paper-reading-app-prod/uploads`）。
- area: frontend (+ backend 可选)
- priority: P2
- size: M
- northstar: 强——owner 2026-07-02 在手机上打开 read.readjot.com 亲测「封面不显示 + 刷新巨卡」（owner 直接体验 signal，最高级别）。首屏加载慢直接否定北极星「不假思索的默认工具」——工具卡到不想打开就不会成为默认。
- description: 上传封面时原图直接存 uploads/，无限宽/重编码。33 张封面原图共 28.1MB（单张最大 4.6MB）。移动端首次加载要从家用 Mac 上行带宽吐几十 MB → 封面像没显示又巨卡。opt2 缩略图（书单显示）已缓解，但原图仍超大：详情页、以及新上传的封面仍是全分辨率。
- why: 加书/换封面是高频「采集」触点；不做源头压缩，用户每传一张巨图就给自己和（未来）访客留一份几 MB 负担，缩略图只是遮羞，治标不治本。
- how: ①（推荐）前端上传前用 canvas 限宽（如最长边 ≤1600px）+ 重编码 JPEG q≈0.8，再走现有上传链路；或 ② 后端落盘时用 sips/Pillow 压缩（注意 app_server.py 目前纯 stdlib，加 Pillow 是依赖决策）。这是移动端性能三步走的第 3 步：opt1 懒加载 + opt2 缩略图（app.js + scripts/generate_thumbnails.py）已实现，本项防新封面再出 4.6MB 巨图。Touch: 上传入口 `uploadBookCoverImage()` / `uploadBookImageIfNeeded()`（app.js ~2146/2630）。

### OPT-086 — 前端静态资源 no-store，每次刷新重下 ~330KB JS/CSS/HTML — owner 2026-07-02 手机亲测
- status: done (commit 239e6e9, 2026-07-02 — `_STATIC` 响应头改 `max-age=31536000,immutable`；index.html 中 app.js/chat.js/styles.css 引用加自动版本串；owner 直接合入 feature/agent，不计 auto/ 预算)
- area: backend (+ frontend 版本串)
- priority: P2
- size: M
- northstar: 强——同 OPT-085 出处（owner 手机亲测「刷新非常卡」）。移动端每次刷新白等几秒重下前端，直接损伤「随手打开就能用」的默认工具体验。
- description: app_server.py 的 do_GET `_STATIC` 给 index.html/app.js/chat.js/styles.css 统一设 `Cache-Control: no-store, no-cache, must-revalidate`（约 app_server.py:3421），为「永远拿最新前端」。代价：移动端每次刷新都重下 app.js(172KB)+styles.css(77KB)+index.html(42KB)+chat.js(39KB) ≈ 330KB，走隧道额外几秒。
- why: 无构建流程的项目为省心用 no-store，但移动端 + 隧道放大了代价；封面图已用 immutable 缓存受益，静态 JS/CSS 反而每刷必重下，是当前刷新耗时的固定大头之一。
- how: 静态资源版本化长缓存——JS/CSS 引用加内容哈希或版本串（项目已有 `?v=20260531a` 雏形），响应头由 no-store 改为 `Cache-Control: public, max-age=31536000, immutable`，发版时改版本串即让缓存失效。需建立「发版必改版本串」的纪律，否则会推不出新前端。Touch: app_server.py `_STATIC` 响应头（~3416-3425）+ index.html 里对 app.js/chat.js/styles.css 的引用加版本串。

### OPT-087 — 摘抄/书/思想碰撞「一键生成分享图」(内容卡自传播增长引擎)
- status: in-progress (2026-07-06 — 三版式全部落地：摘抄卡/思想碰撞卡/书卡；剩真机 QC+埋点)
- progress (2026-07-06): 采用**方案 A（前端纯 Canvas 原生绘制，零依赖，契合项目「无构建/不引重库」约定）**。三版式照 `~/Downloads/又买了一本书-分享物料/` 复刻，共用 header/footer/divider/pill/tags 绘制助手（`drawShareHeader`/`drawShareFooter`/`drawShareDivider`/`drawSharePill`/`layoutShareTags`/`newShareCanvas`/`loadShareAssets`），全部动态高度：
  - **摘抄卡** `renderQuoteShareCard`：装饰引号+衬线正文+《出处》+批注；slogan「买书容易，读完才算。/扫码，记录你自己的阅读」。入口:摘抄 ⋯ 菜单 + 摘抄详情弹窗。
  - **思想碰撞卡** `renderConnectionShareCard`：kind 胶囊(◎ 思想碰撞·{kind})+顶部装饰圆+双书纵向堆叠(↓)+thought+标签；slogan「发现你书架上的暗线/扫码，让 AI 帮你连起来」。入口:关联卡 action 分享按钮。
  - **书卡** `renderBookShareCard`：真实封面裁圆(左)+书名/作者/状态胶囊(✓读完·N页·M天读完)/标签(右)+左绿边「我的读后」卡；slogan「买书容易，读完才算。/扫码，管理你自己的书架」。入口:书卡 ⋯ 菜单 + 书详情弹窗。
  统一收尾 `openShareCardDialog()`→`shareCardDialog` 预览(长按存图/下载)。三版式均经 **headless Chrome 真渲染验收**。
  **owner 反馈迭代(2026-07-06)**:① 长文本会撑成巨图 → 加 `truncateForShare()`(摘抄≤240/thought≤220/书简介≤150 字，超出加省略号)，分享图恒为海报尺寸；② 书卡原用参照图的「我的读后」标签，但本应用 `book.notes` 官方语义是「内容简介/备注」(index.html:360)——先纠正为「内容简介」；③ owner 要「有读后感优先展示读后感」→ **新增 book.review 字段**(纯前端，`sanitize_state` 对 books 透传、零后端改动)：书编辑表单加「读后感」textarea、`openBookEditDialog`/`saveBookEdit` 存取、书卡与书详情**优先展示 review(标签「我的读后」)、无则回落 notes(标签「内容简介」)**。
  测试 `tests/frontend/share-card.test.js` **9 例**(三渲染器内容入画+折行+dialog/下载+空内容拒绝+三入口接线+read-priority+截断)。Touch: `app.js`、`index.html`(shareCardDialog+详情弹窗按钮+book.review 输入)、`styles.css`(.share-card-preview+.book-detail-review)。**剩余**:真机视觉 QC；分享埋点(北极星获客可观测)；(可选)新增书表单/OCR 加书也支持 review。
- area: frontend
- priority: P2（owner 主动为读书会推广提出，获客侧价值高，可争 P1）
- size: L（三版式均已实现；剩 QC/埋点收尾）
- northstar: 强——owner 2026-07-02 为线下读书会推广主动提出。内容卡自带二维码，用户每次分享摘抄/书籍关联都在替产品拉新，直击北极星「成为默认阅读工具」的获客侧。flomo / 微信读书同款自传播逻辑。
- description: 在每张摘抄卡 / 书卡 / 思想碰撞(关联)卡上加「生成分享图」按钮，一键渲染成带品牌 + 二维码的竖版海报，可保存 / 发朋友圈。三种版式：摘抄卡=留白衬线；关联卡=深色「发现感」；书卡=封面+评分+读后感金句。
- why: 分享「一句摘抄 / 一个书籍关联」比分享落地页更抓人——转发者替产品传播，扫码者被内容勾入，转化质量远高于硬广。每个用户都是获客节点，是可持续自传播。2026-07-02 已手工做出成品（assets/brand + Chrome 渲染）验证视觉与吸引力，本项是把它产品化进 App。
- how: 前端出图两条路：① html2canvas / dom-to-image 把现有卡片 DOM 截图（注意跨域封面图、中文字体嵌入）；② 后端复用「HTML 模板 + 无头浏览器渲染」出图（app_server 目前纯 stdlib，引入无头浏览器是重依赖决策）。二维码内嵌静态 SVG 指向 read.readjot.com。可参考手工模板：quote-card / connection-card / wechat-poster HTML；品牌资源在 assets/brand/。Touch: 摘抄/书/关联卡 UI(app.js) + 新出图模块。

### OPT-088 — renderConnections 搜索 haystack 缺少摘抄内容
- status: triaged
- area: frontend
- priority: P1
- size: S
- northstar: 中——关联搜索是 Theme 2「回顾有价值」的核心交互；当前按摘抄内容搜索关联结果为零，功能形同虚设。S 级修复直接打通「找到相关联想法」的使用闭环。
- description: `app.js:847-860` 的 `getBookTitle(type, id)` 在 type==="quote" 时只返回书名，不含 quote.content / ocrText。haystack = `[书名, 书名, thought]`，摘抄文字无法命中搜索。用户积累了「摘抄 ↔ 摘抄」关联后，按摘抄关键词找不到连线，Theme 2 回顾场景直接受损。
- why: 关联的主体（尤其摘抄-摘抄型）其搜索词自然是摘抄内容本身；书名仅覆盖「按书找关联」场景，排除了「按想法找关联」的高频需求。6/29 signal 已记录「建立关联」摩擦，修复 haystack 是将已建立的关联用起来的前提。
- how: 将 `getBookTitle` 重命名为 `getSearchLabel`，quote 分支追加 `(q?.content || q?.ocrText || "").slice(0, 60)` 拼入返回串；haystack 构造不变。约 3 行修改，纯前端，无后端影响。Touch: `app.js:847-860`。

### OPT-089 — clearSampleData 不清理 chatHistories / chatContexts
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 弱-中——onboarding「示例→清除→空白起步」是新用户留存关键路径；清除后残留孤儿聊天历史会污染导出数据，且与「像没来过一样」的语义相悖。
- description: `app.js:1729-1744`：`clearSampleData()` 只过滤 `SAMPLE_COLLECTIONS = ["books","quotes","connections","sessions"]`，不清理 `state.chatHistories` / `state.chatContexts`。若用户对示例书发起过对话，「一键清除」后孤儿聊天历史随 syncState 写回后端。对比 `deleteBook()`（`app.js:2353-2366`）已正确清理 chatHistories/chatContexts。现有测试 `tests/frontend/sample-onboarding.test.js:95-108` 不覆盖此场景。
- why: 「清除示例」的用户期望是「恢复零状态」；残留的聊天历史不仅是静默数据污染，还会在用户导出 state 时带走无书籍锚点的孤儿记录，影响导入恢复体验。
- how: `clearSampleData()` 补全 chatHistories/chatContexts 清理：遍历所有示例书/摘抄 id（`isSample:true`），逐一执行与 `deleteBook()` 相同的 key 删除逻辑（`delete state.chatHistories[id]`、`delete state.chatHistories["book:"+id]`、`delete state.chatContexts[*]`）。`tests/frontend/sample-onboarding.test.js` 补充断言。Touch: `app.js:clearSampleData`，`tests/frontend/sample-onboarding.test.js`。

### OPT-090 — `editSession()` 日期预填用 `toISOString()` 而非已有的 `isoToDateInput()` 辅助，编辑路径存在与 OPT-059 对称的时区 bug — 由 explore E145 提拔 [2026-07-03]
- status: triaged
- area: frontend
- priority: P1
- size: S
- northstar: 中——直接在 W27 唯一焦点「记阅读 session」路径上消除日期预填时区错误，与 OPT-059（新建路径）构成完整对，Theme 1「数据准确」验收要求两个入口均正确。
- description: `app.js:2412`：`editSession()` 使用 `new Date(session.date).toISOString().split("T")[0]` 预填日期字段，在 UTC+8 深夜（00:00–07:59 本地）创建、date 字段未手动选择的 session 场景下，`toISOString()` 返回 UTC 前一天日期，编辑时日期字段显示错一天。`isoToDateInput()`（`app.js:477-484`）已是本地时区感知辅助函数，且已被书籍编辑表单（`app.js:2647-2648`）正确调用，但 `editSession()` 未使用它。
- why: OPT-059 修复新建路径（已指派 PR #54），但编辑路径存在相同 bug。两个入口共同构成「记阅读 session」的完整录入链路；若只修新建不修编辑，owner 在 00:00–08:00 记录的 session 虽新建时日期正确，但打开编辑时仍见到昨天的日期，Theme 1 验收缺口未完全填上。
- how: `app.js:2412` 将 `new Date(session.date).toISOString().split("T")[0]` 改为 `isoToDateInput(session.date)`；1 行修改，复用已有辅助。Touch: `app.js:2412`（editSession）。

### OPT-091 — `renderTimeline()` 用 `localeCompare` 排序 session，OPT-037 的书单修复未覆盖 Timeline — 由 explore E146 提拔 [2026-07-03]
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 弱-中——Timeline 是「看见自己读书积累」的主界面；date 排序正确是「本周使用天数」可观测指标准确的基础；S 级改动，与 OPT-037（书单 sort）/ OPT-014（摘抄 sort）同一修复系列，建议与 OPT-090 合并一 PR。
- description: `app.js:1439`：`const allSorted = [...state.sessions].sort((a, b) => (b.date || "").localeCompare(a.date || ""))`. OPT-037（PR #42）已将书单 `compareBooksForList()` 改为 `Date.parse`，OPT-014 已修摘抄排序，但 `renderTimeline()` 未同步。`session.date` 在主路径存为 `${dateValue}T12:00:00`（UTC）串，在 fallback 路径存为当前 UTC 时间串；两种格式混排时，`localeCompare` 依字面值可能将带毫秒的 UTC 串与不带毫秒的串排错顺序。
- why: 与已合并的 OPT-037/014 完全相同的 bug 类别，根因一致（UTC 串 vs 本地时间串的字面比较），修复模式完全相同（`Date.parse` 数值差）。Timeline 是 roadmap §2「本周使用天数」的唯一观测窗口，date 排序错误会导致当天的 session 列在前一天或后一天 session 之后，影响 owner 的阅读节律感知。
- how: `app.js:1439` 将 `(b.date || "").localeCompare(a.date || "")` 改为 `(Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0)`（降序）；参照 `app.js:1026`（OPT-037 修复后）。Touch: `app.js:1439`。

### OPT-092 — `matchBooks()` 忽略 `book.tags` / `book.notes`，书单按主题/标签搜索零结果 — 由 explore E150 提拔 [2026-07-04]
- status: triaged
- area: frontend
- priority: P1
- size: S
- northstar: 中——roadmap W28「Theme 2 第一刀『检索修通』」显式优先项；书单搜标签/简介是「按主题找书」的基础能力，signal 直接验证（2026-07-03），S 级修复，建议本周 PR 首批实施。
- description: `app.js:1160-1163`：`matchBooks()` 仅检索 `book.title` 和 `book.author`；书籍对象的 `book.tags`（数组，`app.js:2251`）和 `book.notes`（字符串，`app.js:2252`）从未被搜索。`globalSearch()` 和书单 Tab 搜索均通过 `matchBooks()` 路由，搜索「成长」对标签为 `小说(成长/哲学)` 或 notes 含「成长」的书返回零结果。
- why: 2026-07-03 signal：「为读书会按主题找书，书单搜『成长』零结果——但库里有多本成长题材（标签 `小说(成长/哲学)`、简介含「成长」）」。roadmap W28 明确将 `matchBooks()` app.js:1156 列为 Theme 2「检索修通」第一 PR 的修复目标。tags/notes 是用户主动维护的语义标签，不纳入搜索使其形同摆设。
- how: `app.js:1160-1163` 在现有 `fuzzyMatch(book.author || "", query)` 后追加 `|| (book.tags || []).some(t => fuzzyMatch(t, query)) || fuzzyMatch(book.notes || "", query)`；2–3 行修改，纯前端，无 DB 变更，无 API 改动。Touch: `app.js:1160-1163`（matchBooks）。

### OPT-093 — `deleteSession()` 不回写 `book.currentPage` / `book.lastReadAt`，删除记录后进度数据残留 — 由 explore E147 提拔 [2026-07-04]
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 弱-中——「记阅读 session」是 Theme 1 焦点路径，deleteSession 与 addSession 的进度逻辑不对称是正确性缺陷；删除错误 session 后 book.currentPage 残留直接影响 OPT-084（startPage 预填）的准确性，进一步削弱「零摩擦录入」验收效果。建议与 OPT-084 搭车同一 PR。
- description: `app.js:2583-2598`（deleteSession）：`state.sessions = state.sessions.filter(...)` 后对书籍字段无任何更新。对比 `addSession()`（`app.js:2314-2325`）每次新建都执行 `book.currentPage = Math.max(book.currentPage || 0, endPage); book.lastReadAt = date;`。若用户误填 endPage=400 并删除该 session，`book.currentPage` 保持 400，OPT-084 的 startPage 预填将错误建议 401 页。
- why: 新建/删除路径逻辑不对称是持久性数据准确性缺陷。W28 正在打磨「记阅读 session」录入顺滑度（OPT-059/061/066），deleteSession 的进度残留会在用户纠错（删掉错误 session）后立即暴露，产生新摩擦并降低 OPT-084 预填的可信度。
- how: `deleteSession()` 完成 `state.sessions.filter()` 后，扫描该书剩余所有 session 找最大 endPage，回写 `book.currentPage`（无 session 则重置为 0），同步更新 `book.lastReadAt` 取剩余 session 最新 date，并重新评估 `finished` 状态（参照 addSession 逻辑）。约 10–15 行，纯前端，无后端改动。Touch: `app.js:2583-2598`（deleteSession）；参照 `app.js:2314-2325`（addSession 回写逻辑）。

### OPT-094 — `addSession()` pagesRead 计算差一，统计数据永远少计一页 — 由 explore E148 提拔 [2026-07-05]
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 弱——数据准确性缺陷；`pagesRead` 在 session 存储和统计栏中均偏低 1 页，长期累积后总页数与真实阅读量不符，削弱用户对统计数字的信任。
- description: `app.js:2311`（addSession 存储路径）：`pagesRead: endPage - startPage`；`app.js:2318`（editSession 路径）：同一公式；`app.js:1456`（统计栏汇总）：`Number(s.endPage || 0) - Number(s.startPage || 0)`。三处均漏 `+1`。对照：`app_server.py:251`（build_sample_state）手动写 `"pagesRead": 30`（对应 startPage=1, endPage=30），正确值应为 endPage - startPage + 1 = 30，公式返回 29。
- why: 阅读第 1–30 页实际读了 30 页，但公式返回 29；按月/按书统计总页数时，每条 session 均低估 1 页。用户若以统计数字衡量阅读量，持续偏低 1 页/次会慢慢积累为可感知误差。
- how: 将 `app.js:2311`、`app.js:2318`、`app.js:1456` 三处的 `endPage - startPage` 改为 `endPage - startPage + 1`。纯前端，3 处均为单行修改，无 DB schema 变更，无后端改动。Touch: `app.js:2311, 2318`（addSession/editSession）；`app.js:1456`（统计栏）。

### OPT-095 — 新建摘抄对话框页码字段从不预填 `book.currentPage` — 由 explore E155 提拔 [2026-07-05]
- status: triaged
- area: frontend
- priority: P2
- size: S
- northstar: 弱-中——「拍照摘抄」是北极星路径最高频操作；页码字段是摘抄对话框中唯一无默认值的常用字段，每次手动填写是持续小摩擦，预填消除之。与 OPT-084（session startPage 预填当前页）完全对称，建议搭车同一 PR。
- description: `app.js:2520`（openNewQuoteForBook）：`els.quoteForm.querySelector('[name="page"]').value = ""`，无条件将页码置空。`book.currentPage` 已由 `addSession()` 维护（`app.js:2314`），OPT-084 将其用于 session startPage 预填（已 triaged）；摘抄对话框却从未读取该值，与 session 表单形成对称缺陷。
- why: 用户拍照摘抄时通常处于当前页（即 book.currentPage），每次都需手动输入页码；OPT-084 已验证「预填当前页」有价值，摘抄页码与之对称且独立，S 级修复，可直接搭车 OPT-084。
- how: 在 `openNewQuoteForBook(bookId)` 内，将 `value = ""` 改为：`const _curPage = state.books.find(b => b.id === bookId)?.currentPage; els.quoteForm.querySelector('[name="page"]').value = _curPage || "";`。约 2–3 行，纯前端。Touch: `app.js:2520`（openNewQuoteForBook）；参照 `app.js:2314`（addSession 回写 currentPage）及 OPT-084 预填逻辑。

### OPT-096 — `renderConnections()` 搜索 haystack 缺少 `c.tags`，关联标签无法被搜索命中 — 由 explore E135/E161 提拔 [2026-07-06]
- status: new
- area: frontend
- priority: P2
- size: S
- northstar: 弱-中——「回顾有价值」：用户依赖标签做概念检索，关联搜索漏 tags 使标签化工作付之东流；S 级单行修复，建议与 OPT-092（matchBooks 补 tags/notes）、OPT-097（matchBooks 补 review）搭车同一 PR。
- description: `app.js:862-866`（`renderConnections()` 搜索过滤）haystack 数组仅含 `getBookTitle(source)`、`getBookTitle(target)`、`c.thought`，完全排除 `c.tags`。Connection 对象有 tags 字段（addConnection 表单有 tags 输入），但搜索跳过 tags，用户按标签关键词搜关联返回零结果。E135（2026-06-30 首次登记）、E161（2026-07-06 再次核实证据有效）均确认该缺陷未修。
- why: 标签是关联对象唯一的显式分类维度；搜索跳过 tags 使标签系统对搜索路径完全失效。与 E150/OPT-092（matchBooks 缺 tags）同质——searchable-fields 系列延伸；S 级，无 API 改动，无 schema 变更。
- how: 将 `app.js:862-866` haystack 数组第三项由 `c.thought || ""` 扩展为 `...[c.thought || "", ...(c.tags || [])]`（实际 1–2 行修改）。建议与 OPT-092、OPT-097 合并为「搜索字段补全 bundle」PR。Touch: `app.js:862-866`（renderConnections haystack）。

### OPT-097 — `matchBooks()` 不搜索 `book.review`，OPT-087 新增字段对搜索路径完全不可见 — 由 explore E158 提拔 [2026-07-06]
- status: new
- area: frontend
- priority: P2
- size: S
- northstar: 弱-中——「事后回顾」路径：用户通过搜索重新找到有感情关联的书；review 字段（OPT-087 同日上线）若不进 matchBooks，则该字段对搜索毫无价值，新功能变死功能。与 OPT-092 同类，建议搭车。
- description: `app.js:1163-1166`（`matchBooks()`）filter 条件仅含 `fuzzyMatch(book.title, query) || fuzzyMatch(book.author || "", query)`。OPT-087（2026-07-06）在书籍对象新增 `review` 字段并已接入表单存储（`app.js:2259`）、编辑（`app.js:3173`）、详情展示（`app.js:3266-3274`）和分享卡（`app.js:2834`），但 matchBooks 未同步更新，用户输入读后感关键词，书单 tab 返回零结果。
- why: 搜索遗漏 review 使刚上线的 OPT-087 功能在搜索路径上无价值，且对用户而言是令人沮丧的「功能存在但搜不到」问题。S 级单行修复，与 OPT-092（matchBooks 补 tags/notes）完全同质，建议合并为同一 PR。
- how: 在 `app.js:1165` matchBooks filter 末尾追加 `|| fuzzyMatch(book.review || "", query)`（1 行）。建议与 OPT-092（matchBooks tags/notes）、OPT-096（connections tags）合并为「搜索字段补全 bundle」PR。Touch: `app.js:1165`（matchBooks filter）。
