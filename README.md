# Paper Reading App

一个面向手机网页的纸质书阅读工具，当前优先适配 iPhone 12。

这版已经从“纯前端本地存储”切到“前端展示 + 后端代理”模式：
- 账号系统走后端
- 书单、阅读记录、摘抄、聊天历史走后端
- 图片上传走后端，文件保存在服务器 `uploads/`
- 聊天与 OCR 走后端代理，不再由浏览器直连模型
- 模型调用日志保存在服务器 `SQLite`

**目录**
- 前端页面：[index.html](</Users/huangnanqi/CursorProjects/paper-reading-app/index.html>)
- 前端逻辑：[app.js](</Users/huangnanqi/CursorProjects/paper-reading-app/app.js>)、[chat.js](</Users/huangnanqi/CursorProjects/paper-reading-app/chat.js>)
- 样式：[styles.css](</Users/huangnanqi/CursorProjects/paper-reading-app/styles.css>)
- 后端服务：[log_server.py](</Users/huangnanqi/CursorProjects/paper-reading-app/log_server.py>)

**后端配置**
编辑 [log_server.py](</Users/huangnanqi/CursorProjects/paper-reading-app/log_server.py>) 顶部：

```python
DEEPSEEK_API_KEY = ""
MOONSHOT_API_KEY = ""
AUTH_TOKEN = ""
HOST = "0.0.0.0"
PORT = 8787
```

说明：
- `DEEPSEEK_API_KEY` 必填，否则聊天和 OCR 不可用
- `MOONSHOT_API_KEY` 必填，否则 OCR 不可用
- `AUTH_TOKEN` 可选；如果你要给日志接口加一层额外保护，可以填写

**前端配置**
编辑 [index.html](</Users/huangnanqi/CursorProjects/paper-reading-app/index.html>) 顶部：

```html
window.PAPER_READING_APP_CONFIG = {
  backendBaseUrl: "http://192.168.1.19:8787"
};
```

如果你在 iPhone 上访问前端，`backendBaseUrl` 不能写 `127.0.0.1`，必须写电脑的局域网 IP。

**启动方式**
1. 启动后端

```bash
cd /Users/huangnanqi/CursorProjects/paper-reading-app
python3 log_server.py
```

2. 启动前端静态页

```bash
cd /Users/huangnanqi/CursorProjects/paper-reading-app
python3 -m http.server 4173
```

3. 打开前端

```text
电脑上打开：http://127.0.0.1:4173
iPhone 上打开：http://192.168.1.19:4173
```

**后端接口**
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `PUT /api/state`
- `POST /api/upload-image`
- `POST /api/ocr`
- `POST /api/chat`
- `GET /api/model-logs`
- `DELETE /api/model-logs`
- `DELETE /api/chat-history`

默认后端地址：

```text
电脑本机：http://127.0.0.1:8787
iPhone 访问：http://192.168.1.19:8787
```

**快速查看日志**
- 接口 JSON：`http://192.168.1.19:8787/api/model-logs` 需要先登录，浏览器直接开通常会返回 `Unauthorized`
- 快速查看页：`http://192.168.1.19:8787/debug/logs`
- 这个页面会直接从后端数据库读取最近 100 条日志，适合你临时排查

**服务端存储**
- 数据库：`paper_reading_backend.db`
- 图片目录：`uploads/`

**当前仍保留在浏览器里的内容**
- 登录 token 保存在 `localStorage`

其余核心数据都已经改为后端主存。
