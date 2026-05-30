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
- status: triaged
- area: frontend
- description: 当前 CSS 以 iPhone 12 (390×844) 为基准，需要适配 iPhone SE / Pro Max / 安卓各种尺寸 / 平板。
- why: landing.html 文案已移除「iPhone 12」字样，但实际 CSS 仍是单尺寸优化；商业化后用户机型分布会很散。
- how: 检查 styles.css 中 px 数值能否换成响应式单位（vw, clamp(), min()）；加 @media 断点针对 small (<375px) / large (>430px) / tablet (>768px) 三档。

### OPT-004 — 桌面端基础适配
- status: triaged
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
- status: triaged
- area: backend
- description: app_server.py 在 line 8 import imghdr，在 line 1677 用 imghdr.what(None, binary) 检测上传图片格式。Python 3.11 已发 DeprecationWarning，Python 3.13 将直接删除该模块，届时首次图片上传即崩溃。
- why: 这是定时炸弹——升级 Python 版本时会出现 ImportError，影响所有图片上传和 OCR 流程。
- how: 删除 import imghdr；在 save_image() 里用 5 行 magic bytes 替换：PNG(\x89PNG)、JPEG(\xff\xd8)、WebP(RIFF…WEBP)，fallback 用 mime_type 后缀。无需第三方依赖，无 schema 变更。Touch: app_server.py:8, 1675-1690
