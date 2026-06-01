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
- status: triaged
- area: backend
- description: _read_json() 在 app_server.py:2899-2902 直接以 Content-Length 头的值调用 self.rfile.read(content_length)，无上限检查。所有 POST 端点（含接收 base64 图片的 /api/upload-image、/api/quotes/ocr）均受影响。攻击者发送 Content-Length: 2000000000 可导致进程尝试分配 2GB 并阻塞读取，使其他用户的请求全部挂起。
- why: ThreadingHTTPServer 在默认部署下无反向代理保护，单个恶意请求即可使整个服务不可用。修复仅需定义 MAX_REQUEST_BYTES 常量（~20MB）并在读取前返回 413，三行代码，零逻辑变更。
- how: 在 app_server.py:2899 前加 `if content_length > MAX_REQUEST_BYTES: self._send_error(413, "payload too large"); return {}`；对 Stripe webhook 原始 body 读取（line 3676-3677）同样加此检查。定义 MAX_REQUEST_BYTES = 20 * 1024 * 1024 常量。Touch: app_server.py:2899-2902, 3676-3677

### OPT-010 — 四个 GC 函数已实现但从未调用，数据库永不清理
- status: triaged
- area: backend
- description: gc_expired_sessions()、gc_expired_password_reset_tokens()、gc_old_server_errors()、gc_old_rate_limit_rows() 均有完整实现（app_server.py:1019, 1485, 1495, 1503），各有对应单元测试，但在任何运行路径中从未被调用。main() 只调用 init_db() 和 serve_forever()。expired session 行、已用/过期的密码重置 token、超过 30 天的 server_error、过期的限速计数器窗口全部永远积压在 DB 里。
- why: rate_limit_counters 每个活跃用户每小时/天各产生 2 行；长期运行后表会膨胀到数万孤行，拖慢 check_and_record_rate_limit() 的 BEGIN IMMEDIATE 锁竞争。password_reset_tokens 也会无限积累。这是一个简单的实现遗漏，修复只需加一个每 6 小时执行一次的后台守护线程。
- how: 新增 _run_gc() 函数调用全部四个 GC 方法（每次用新 conn）；在 main() 中用 threading.Timer 或 threading.Thread（daemon=True）以 6 小时间隔循环调用。无 schema 变更，无逻辑变更。Touch: app_server.py:1019-1513, 4631-4638

### OPT-011 — HTML 响应缺少安全头（X-Frame-Options、X-Content-Type-Options 等）
- status: triaged
- area: backend
- description: do_GET() 的 _STATIC 处理块（app_server.py:2995-3005）为 landing.html、index.html、privacy.html、terms.html 只发送 Content-Type 和 Cache-Control，没有 X-Frame-Options、X-Content-Type-Options、Content-Security-Policy 或 Referrer-Policy 头。JSON API 对所有端点（含鉴权端点）返回 Access-Control-Allow-Origin: *（lines 2883, 2894, 2905, 2965）。
- why: 缺少 X-Frame-Options: SAMEORIGIN 导致 HTML 页面可被 iframe 嵌入用于点击劫持攻击；缺少 X-Content-Type-Options: nosniff 允许旧浏览器 MIME-sniffing。商业化产品含支付流程，这些是任何安全扫描器都会标记的基线缺陷。修复仅需在静态文件响应里增加 4-5 行 header。
- how: 新增 _send_security_headers() 辅助方法，在 do_GET() 静态 HTML 响应路径调用；可选择将 CORS 限制为 ALLOWED_ORIGINS 环境变量而非无条件 *。Touch: app_server.py:2890-2909, 2995-3005
