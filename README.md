# Paper Reading App

一个本地运行的纸质书阅读 Agent。载体是阅读工具——记录书单、摘抄、笔记，与
AI 探讨思考——但项目目标是**把 Agent 工程的几个核心痛点，在一个完整可跑的系统里
覆盖一遍**：长上下文管理、Tool 调用稳定性、可观测性、人在回路、协议化扩展。

代码自洽、没有额外云基础设施依赖；除模型 API 外，单机即可复现。

---

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器（手机/桌面）                                          │
│  index.html · chat.js · styles.css                            │
└──────────────────────────────────────────────────────────────┘
                           │ HTTP / SSE
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  app_server.py  —  Agent Host + MCP Client                    │
│                                                              │
│   PromptBuilder ──► DeepSeek (chat/reasoner) ──► Response    │
│                                                  Parser      │
│                                                    │         │
│   ActionStateMachine ◄── ActionValidator ◄─────────┘         │
│         │                                                    │
│         │ approve                                            │
│         ▼                                                    │
│   MCPToolDispatcher                                          │
│         │                                                    │
│         │ JSON-RPC over Streamable HTTP                      │
└─────────┼────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────────────────────────────────────────┐
│  reading_mcp_server.py  —  本地 MCP Server                    │
│                                                              │
│   add_note · add_book · summary · question · tag · link_thought│
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
              SQLite (app_state.db) · uploads/
```

两个进程，独立启动，通过 MCP 协议通信。`app_server.py` 启动时通过
`tools/list` 从 MCP Server 拉取所有 Tool 的 schema 和 description，作为
Prompt 和 Validator 的唯一事实来源。

---

## 覆盖的 Agent 工程问题

| 问题 | 解法 |
|---|---|
| **长上下文管理** | 按书维度组织 prompt 上下文；对话历史超过阈值时单独调一次模型做摘要压缩，保留最近若干轮原文 |
| **Tool 调用稳定性** | Action 状态机（`GENERATED → PENDING → APPROVED → EXECUTED/FAILED`）；schema 校验、白名单截断、JSON 解析降级（流式场景下用字符级状态机抽取 `reply` 字段） |
| **可观测性** | 每次对话生成一条 trace；TraceManager 记录关键事件，MetricsCollector 写入延迟/Token/失败率；`/debug/agent-dashboard` 是自带的看板 |
| **人在回路** | Agent 生成的副作用动作（add_note、add_book 等）不会自动执行，必须前端 approve；reject 也是状态机的合法转移 |
| **协议化扩展** | 工具执行层抽离为 MCP Server。新增工具只需在 MCP Server 加一个 `@mcp.tool()` 函数，Agent Host 通过 `tools/list` 自动发现，prompt 和校验逻辑无需改动 |
| **离线评测** | `data/golden_set.json` 维护一组固定输入→期望 action 的测试用例；`tests/agent/agent_golden_set_eval.py` 跑评测并打分 |

---

## Design Notes

### 为什么用了 MCP，但没用 tool calling

MCP 在本项目里承担两个职责：**schema 真值源**（`tools/list`）和**执行后端**（`tools/call`）。
但模型 ↔ action 的桥梁没有用 LLM 的 tool calling 协议，而是用 structured JSON
output 自己实现——模型输出 `{reply, actions[]}` 形态的 JSON，Host 解析后再走 MCP。

代价是要手搓 JSON 解析与校验层；收益是产品流程保留了"用户审批 actions 再执行"
这个人在回路环节。tool calling 是为"模型自主完成任务"设计的范式，与"审批后执行"
存在冲突。如果未来扩展到多步自主任务，再升级到 tool calling 范式。

### 为什么 `link_thought` 用推理模型

`reading_mcp_server.py` 内调用模型的只有一处——`link_thought` 用了
`deepseek-reasoner`，其他 Tool 是无模型的纯数据操作。理由是跨书关联发现是高复杂度
推理任务：需要同时理解多本书的核心主题并推断隐性联系。普通对话模型倾向于表面关键词
匹配，推理模型的 CoT 过程能捕捉到"异曲同工"这类语义层关联。延迟换质量，且该操作
非实时对话，几秒等待可接受。

### 为什么 Tool description 不写"模型应该怎么做"

Tool description 是工具的语义合约，描述"工具是什么"，不是模型行为约束。
所有"不要..."、"应当..."这类祈使句，要么进 prompt（产品策略），要么不进系统
（属于通用反 hallucination 范畴）。这个分层是经过多轮迭代后确立的——早期 description
里夹了大量"防御性规则"，最终被剥离干净。

### 为什么前端是裸 HTML/CSS/JS

项目重心是后端工程，前端只承担演示职责。引入框架会增加构建链与解释成本，
而且裸三件套对 iPhone Safari 兼容性最稳。

---

## 项目结构

```
paper-reading-app/
├── app_server.py              # Agent Host + MCP Client。HTTP 后端，prompt 构造、模型调用、action 状态机
├── reading_mcp_server.py      # 本地 MCP Server，提供 6 个 Tool
├── mcp_dispatcher.py          # MCP Client Dispatcher（approve 后调 tools/call）
├── tool_schema_provider.py    # 启动时拉 tools/list，缓存 schema 给 Prompt 和 Validator 用
│
├── index.html / chat.js / styles.css   # 前端
│
├── data/
│   ├── golden_set.json                 # 评测用例
│   └── golden_set_baseline.json        # 基线快照
│
├── scripts/
│   ├── start_backend.sh                # 拉起 app_server
│   └── start_mcp.sh                    # 拉起 reading_mcp_server
│
├── tests/
│   ├── agent/                          # 后端测试（property、reliability、evaluation framework、golden set、OCR）
│   └── frontend/                       # 前端回归测试
│
├── requirements.txt
└── README.md
```

---

## 运行

需要两个终端，分别启动 MCP Server 和 App Server。前端静态文件由 App Server 直接托管，不需要单独启动前端服务。

**1. 依赖**

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

**2. 配置**

通过环境变量提供 API Key，不要把密钥写进代码：

```bash
export DEEPSEEK_API_KEY="..."     # 必填
export MOONSHOT_API_KEY="..."     # 选填，OCR 用
```

默认前端与后端同源运行，`index.html` 里的 `backendBaseUrl` 可以保持为空。如果要把前端单独部署到其他域名，再把它改成 App Server 地址。

**3. 启动**

```bash
# 终端 1
./scripts/start_mcp.sh             # 监听 http://127.0.0.1:8788

# 终端 2
./scripts/start_backend.sh         # 监听 http://127.0.0.1:8787
```

打开 `http://127.0.0.1:8787`。如果用手机访问，把 `127.0.0.1` 换成电脑的局域网 IP，例如 `http://<LAN-IP>:8787`。

开发阶段可以用自动重启模式替代 `start_backend.sh`：

```bash
./scripts/dev_backend.sh           # 监听源码改动，自动重启 App Server
```

它会监控 Python、HTML、CSS、JS、Markdown 源文件；`uploads/`、`data/`、`.venv/` 等运行时目录不会触发重启。

**4. 评测**

```bash
python3 tests/agent/agent_golden_set_eval.py
```

---

## 技术栈

- **后端**：Python 3.11+，`http.server`、`sqlite3`、`urllib`（stdlib），`mcp[cli]` + `uvicorn`
- **前端**：HTML / CSS / 原生 JS，无构建链
- **模型**：DeepSeek（chat 与 reasoner 两个模型分用于对话与跨书关联），Moonshot（多模态 OCR）
- **协议**：MCP（Streamable HTTP，2025-11-25 spec）
- **存储**：SQLite 单文件

---

## License

MIT
