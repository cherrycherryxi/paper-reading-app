# DeepSeek Harness 深度共读工作台设计方案

> 文档状态：开发基线与实现记录
> 更新时间：2026-08-15
> 适用范围：paper-reading-app 面向用户的「深度共读」能力
> 非目标：替换现有 `/api/chat`、重写前端、直接发布生产环境

## 0. 当前实现状态

截至 2026-08-15，阶段 1 与 Proposal 审批骨架已在 `feature/agent` 工作树落地：

- `deep_reading.py`：Research Run 生命周期、后台执行、dsh SDK 适配和结构化结果解析。
- `paper_reading_gateway.py`：6 个只读 MCP 工具；临时 bearer token 在服务端绑定 run 与 user，工具 Schema 不出现 `user_id`。
- `experiments/dsh-paper-reading/cordis.yml`：在同一根作用域组合最小 Agent core、只读 MCP 客户端和 JSONL session；不加载 Shell、文件系统、PTY 和写入工具。
- `app_server.py`：创建、查询、列表、事件回放、取消、账户导出和删除；Gateway 在首次任务时按需绑定 `127.0.0.1:8789`。
- `index.html`、`chat.js`、`styles.css`：现有「探讨」内双模式、书籍/摘抄详情直达、后台轮询、结构化结果、历史任务和逐条审批。
- dsh proposal 会先经过既有 `ActionValidator`，再进入既有 `ActionStateMachine`；确认后仍由 `MCPToolDispatcher` 调用原写入 MCP。

官方 `deepseek-harness-sdk==0.1.0rc6` 的配套 runtime wheel 只发布 Linux x64/arm64 和 macOS 14 arm64。当前 Intel macOS 13 开发机已在仓库外从官方源码构建 macOS x64 单文件 JSONRPC runtime，并通过 `DSH_RUNTIME_BIN` 完成真实模型联调；生产仍应使用官方支持平台和 wheel。

真实回路验证发现并修复了两个组合问题。第一，`agent-spine-demo` 内部拥有子作用域 Tool Registry，不能与外部兄弟 MCP 插件组成同一个模型工具视图，因此改用官方 base 的根级最小核心组件。第二，JSONRPC readiness 早于异步 MCP discovery，Runner 增加 1.5 秒可配置发现窗口，`toolOrder` 同时充当强校验；工具尚未注册时任务明确失败，不会退化成无证据回答。修正后 V4 Pro 已真实执行 Gateway `tools/list` 和多次 `tools/call`，引用隔离数据中的 q1/q2 完成研究。

审批闭环也已用隔离数据库和独立写入 MCP 端口验证：研究状态 `COMPLETED`，proposal 状态 `PENDING_APPROVAL`，批准接口返回 200，Action 最终为 `EXECUTED`，数据库新增一条关联。dsh 本身仍只有读取权，写入由用户批准后的既有 Host 完成。

前端已在 Chrome 中完成真实登录态验收。桌面端从「探讨 → 深度共读」进入，选定《百年孤独》后发起跨书研究，界面依次显示读取上下文、候选摘抄和完成状态，并渲染研究结论、证据地图、继续追问、历史记录及两项待审批建议。确认「建立关联」后，界面显示“已保存到阅读记录”，当前书籍的关联数由 1 增至 2。随后以 `390 × 844` 的 iPhone 12 视口复验，模式切换、书籍选择、问题输入、启动按钮、结果卡片、审批按钮和底部导航均保持可达。

## 1. 结论

DeepSeek Harness（下称 dsh）以旁路实验环境接入 paper-reading-app，承担需要多步检索、比较、交叉验证和长时间执行的高级推理任务。

现有产品链路保持不变：

- 普通「探讨」继续使用现有 `PromptBuilder → DeepSeek → reply + actions` 链路。
- SQLite、用户状态、MCP 写入工具和人工审批仍由 paper-reading-app 掌管。
- dsh 不直接读取数据库，不直接调用现有六个写入 MCP Tool，不拥有最终写入权。
- 第一阶段只提供只读研究；验证有效后，才允许 dsh 提交待审批 proposal。

前端不新增底部 Tab，不跳转或嵌入 dsh Web UI。用户入口位于现有「探讨」Tab 内，表现为「日常探讨 / 深度共读」两种模式；书籍详情和摘抄详情提供带上下文的直达入口。

## 2. 为什么采用旁路，而不是整体迁移

paper-reading-app 已经自行实现了一套小型 Agent Harness：

- `PromptBuilder` 负责书籍、摘抄、关联、记忆和聊天历史的上下文组织。
- `ResponseParser` 与 `ActionValidator` 负责结构化输出及工具 Schema 校验。
- `ActionStateMachine` 负责 `GENERATED → PENDING → APPROVED / REJECTED → EXECUTED / FAILED` 生命周期。
- `MCPToolDispatcher` 与 `reading_mcp_server.py` 负责批准后的业务写入。
- `TraceManager`、模型日志和指标负责可观测性。
- `chat.js` 负责面向用户的流式反馈和人工审批。

dsh 的潜在增量不在单轮问答，而在多步 Agent Loop、任务恢复、工具编排、会话事件和可替换运行组件。现在直接迁移现有聊天链路会引入双重会话状态、双重 Trace、Node 运行时、预览版接口变化及审批适配成本，无法证明收益大于风险。

因此先验证一个具体问题：

> 面对需要三次以上检索和交叉验证的阅读任务，dsh 是否能明显优于当前一次性 PromptBuilder？

答案为否，停止实验；答案为是，再扩大接入范围。

## 3. 运行架构

```text
┌────────────────────────────────────────────────────────────┐
│ paper-reading-app                                          │
│                                                            │
│ 浏览器 UI ───── app_server.py ───── SQLite                 │
│                       │                                    │
│              ActionStateMachine                            │
│                       │ approve                            │
│                       ▼                                    │
│              reading_mcp_server.py                         │
│               现有六个写入工具                              │
└────────────────────────────────────────────────────────────┘
                         ▲
                         │ 只读查询 / 提交待审批 proposal
                         │
┌────────────────────────────────────────────────────────────┐
│ paper_reading_gateway.py                                   │
│                                                            │
│ 身份绑定 · 归属校验 · 数据裁剪 · 只读工具 · Proposal 校验   │
└────────────────────────────────────────────────────────────┘
                         ▲
                         │ MCP；若预览版不稳定，再用外置薄适配器
                         │
┌────────────────────────────────────────────────────────────┐
│ DeepSeek Harness                                           │
│                                                            │
│ paper-reading-researcher                                   │
│ 检索 → 分解 → 比较 → 交叉验证 → 综合 → 提议动作            │
│                                                            │
│ 默认禁用文件写入、Shell、数据库访问和自动业务写入           │
└────────────────────────────────────────────────────────────┘
```

建议的本地端口：

| 进程 | 端口 | 职责 |
| --- | --- | --- |
| `app_server.py` | `8787` | 现有产品、鉴权、状态和用户界面 |
| `reading_mcp_server.py` | `8788` | 现有写入 MCP Tool，仅供批准后的可信 Host 调用 |
| `paper_reading_gateway.py` | `8789`，仅绑定 `127.0.0.1` | dsh 的受控数据入口；首个研究任务按需启动 |
| dsh runtime | Python SDK 子进程，无 Web 端口 | 多步研究执行 |

## 4. Node/TypeScript 边界

paper-reading-app 没有引入 Node/TypeScript 代码、前端构建步骤或 `package.json`。正式部署使用 Python SDK 同版本的预编译 runtime wheel，目标机器无需另装 Node；Node 只存在于 dsh 自身的上游构建实现中，不是本项目的生产依赖。Intel 开发机的源码联调例外通过环境变量指向仓库外 runtime，不把 dsh 工程混入本仓库。

主仓库第一阶段结构：

```text
paper-reading-app/
├── deep_reading.py
├── paper_reading_gateway.py
├── app_server.py
├── index.html
├── app.js
├── chat.js
├── styles.css
├── requirements-dsh.txt
├── experiments/dsh-paper-reading/
│   ├── README.md
│   └── cordis.yml
└── tests/
    ├── agent/
    │   ├── deep_reading_api_test.py
    │   ├── deep_reading_cordis_contract_test.py
    │   ├── deep_reading_gateway_contract_test.py
    │   ├── deep_reading_runtime_test.py
    │   └── deep_reading_store_test.py
    └── frontend/
        └── deep-reading-workbench.test.js
```

dsh 的可复现组合放在 `experiments/dsh-paper-reading/cordis.yml`。它只是 YAML 配置，直接由 Python SDK 子进程读取；不需要独立适配项目，也不改变现有裸 ES2020 前端和无构建步骤约束。

## 5. 安全边界

### 5.1 不直接暴露现有 MCP Server

`reading_mcp_server.py` 的六个工具会直接修改 `user_state`，且 `user_id` 是工具参数。当前链路之所以安全，是因为 App Server 在用户批准后注入可信 `user_id`。

若把它原样交给 dsh：

- 模型可能绕过人工审批直接写入。
- 模型可提供或伪造 `user_id`。
- 研究运行与业务写入失去清晰责任边界。

因此 dsh 只能访问 Gateway。Gateway 第一阶段不提供写入能力；第二阶段也只创建待审批 proposal。

### 5.2 身份绑定

App Session Token 不进入 prompt，也不作为模型工具参数。Gateway 在服务端验证身份并建立实验会话映射：

```text
dsh_experiment_sessions
- dsh_session_id
- user_id
- context_type
- book_id
- quote_id
- created_at
- expires_at
- revoked_at
```

工具调用只携带 `dsh_session_id` 和业务查询参数。Gateway 自行解析真实用户，验证所有书籍、摘抄和关联都属于该用户。

### 5.3 运行限制

第一阶段要求：

- 仅绑定 loopback。
- 仅使用开发数据库或数据库副本。
- 不连接 Prod。
- dsh 不直接访问项目目录或 `app_state.db`。
- 默认禁用 Shell、文件写入和外部网络。
- 外部检索必须由用户显式开启，并提示数据可能离开本机。
- 日志中的摘抄正文按需要截断或脱敏。
- dsh 停止运行不能影响普通聊天、OCR、书单或阅读记录。
- `DEEP_READING_ENABLED` 默认关闭；只有隔离实验环境显式设置为 `1/true/yes` 才允许创建任务，避免可选依赖在 Prod 偶然出现时自动开放旁路。

## 6. Gateway 只读工具

第一阶段提供六个只读工具，不引入向量数据库。

### 6.1 `get_reading_context`

输入：

```json
{
  "contextType": "book",
  "bookId": "book-xxx",
  "quoteId": ""
}
```

返回当前书籍、当前摘抄、最近摘抄、相关连接、确认记忆和裁剪说明。它把现有 `PromptBuilder` 的一次性上下文注入，拆成 Agent 可按需调用的读取能力。

### 6.2 `search_quotes`

输入：

```json
{
  "query": "自由与责任",
  "bookId": "",
  "tags": [],
  "limit": 20
}
```

第一版使用 SQLite 关键词检索，覆盖正文、OCR 文本、标签、书名和作者。先验证多步检索是否有价值，再决定是否增加 embedding。

### 6.3 `list_books`

支持按 `status`、标签、最低评分、开始日期、完成日期和数量上限筛选。必须保留 `finished`、`reading`、`wishlist` 的语义差异。

### 6.4 `get_connections`

输入书籍或摘抄 ID，返回已有连接、连接类型、`thought` 及两端实体摘要，用于回答已有关系和阻止重复建议。

### 6.5 `get_confirmed_memories`

只返回 global、book 或 quote 作用域内已经由用户确认的记忆。未确认推测不得作为用户事实进入研究。

### 6.6 `get_reading_timeline`

返回限定日期内的阅读记录、摘抄、笔记、完成书籍和里程碑，用于周度回顾、阅读路径和阶段性研究。

### 6.7 通用返回约束

所有工具必须具备：

- 用户归属校验。
- 字段白名单。
- `limit` 上限。
- `hasMore` 或分页信息。
- 稳定实体 ID。
- 可追踪的工具调用 ID。
- 不返回密码、Session Token、API Key、内部管理数据或无关用户信息。

## 7. dsh Agent 定义

第一版只建立一个 `paper-reading-researcher`，不引入多 Agent。

核心规则：

```text
你是用户个人书库的深度共读研究员。

1. 结论必须来自工具返回的数据。
2. 引用用户观点时标注书名和摘抄 ID。
3. 区分用户原文、模型归纳和外部资料。
4. 搜索不到时明确说未找到。
5. 不得直接修改任何阅读数据。
6. 最终最多提出 3 个待确认动作。
7. 已有关联不得重复建议。
8. wishlist 书籍不得描述为用户已经读过。
```

默认权限：

| 能力 | 策略 |
| --- | --- |
| 阅读数据查询 | 自动允许 |
| 外部网络搜索 | 默认关闭，用户显式要求后批准 |
| 文件系统 | 禁止 |
| Shell | 禁止 |
| 数据库访问 | 禁止 |
| 直接写入阅读数据 | 不暴露 |
| 生成待审批 proposal | 第二阶段允许 |

## 8. 前端入口与信息架构

### 8.1 总体选择

不新增“工作台”底部 Tab。现有移动端已经有「书单、记录、摘抄、探讨、关联、我的」六个入口，再增加一级入口会造成导航拥挤和概念重复。

“深度共读”放在现有「探讨」Tab 内，与普通聊天组成双模式：

```text
┌──────────────────────────────────┐
│ 当前：《百年孤独》               │
│                                  │
│  [日常探讨]  [深度共读]          │
├──────────────────────────────────┤
│                                  │
│          对话或研究内容           │
│                                  │
├──────────────────────────────────┤
│ 输入你的问题或想法……             │
└──────────────────────────────────┘
```

| 模式 | 用途 | 后端链路 |
| --- | --- | --- |
| 日常探讨 | 一问一答、解释、总结、提炼问题、整理笔记 | 现有 `/api/chat` |
| 深度共读 | 多轮检索、跨书比较、观点地图、长任务 | Research Run → Gateway → dsh |

dsh Web UI 只用于开发调试。正式用户始终停留在 paper-reading-app 内，不使用 iframe，不跳转到 `127.0.0.1:3080`。

### 8.2 主入口：探讨页模式切换

在当前书籍/摘抄上下文与消息区之间加入可访问的模式切换：

```html
<div class="chat-mode-switch" role="tablist" aria-label="探讨模式">
  <button role="tab" aria-selected="true">日常探讨</button>
  <button role="tab" aria-selected="false">深度共读</button>
</div>
```

进入深度共读后显示：

```text
深度共读

我会检索你的书单、摘抄、笔记和已有思想关联，
经过多步分析后给出一份带出处的研究结果。

[寻找相似观点]
[发现矛盾和分歧]
[整理一条思想脉络]
[自定义问题……]
```

### 8.3 书籍详情直达入口

书籍详情操作区保留现有“去聊”，增加次级动作“深度共读”。点击后：

1. 关闭详情弹窗。
2. 切换到「探讨」Tab。
3. 选中该书。
4. 切换到「深度共读」。
5. 展示任务模板，不立即执行。

不能点击入口后自动开始研究，因为用户尚未表达研究目标。

### 8.4 摘抄详情直达入口

摘抄详情增加“围绕这条摘抄深度共读”。进入后显示明确起点：

```text
研究起点

《人的境况》
“行动之所以不可预测，是因为……”

[更换起点]
```

推荐模板：

- 找出相似观点。
- 寻找反对意见。
- 联系我读过的其他书。

## 9. 深度共读前端状态

### 9.1 尚未开始

```text
深度共读

研究范围
《人的境况》 · 当前摘抄

你想沿着什么方向继续？

[找出相似观点]
[寻找反对意见]
[梳理思想来源]

┌──────────────────────────┐
│ 或输入你自己的研究问题…… │
└──────────────────────────┘

                  [开始共读]
```

按钮使用“开始共读”，不用普通聊天的“发送”，让用户预期这是耗时和资源更高的任务。

### 9.2 研究进行中

不展示模型原始思维链，只展示可验证的阶段状态：

```text
正在深度共读 · 约 1 分钟

✓ 已读取当前摘抄和书籍背景
✓ 已检索 46 条相关摘抄
● 正在比较其中 7 条观点
○ 尚未检查已有思想关联
○ 尚未生成结论

[收起到后台]             [停止]
```

用户切换到其他 Tab 后任务继续。探讨 Tab 显示进行中标记，返回后恢复原进度与滚动位置。

必须支持：

- 正在运行。
- 后台运行。
- 已完成。
- 失败并从可恢复位置重试。
- 用户主动停止。

### 9.3 研究结果

结果不用普通聊天气泡承载，而使用结构化报告：

```text
研究结论

这条摘抄讨论的不是一般意义上的“不确定”，
而是行动一旦进入人与人的关系网络，就无法控制其后果。

观点地图

支持
┌──────────────────────────┐
│ 《黑天鹅》                │
│ “……”                     │
│ 为什么相关……             │
│ [查看原摘抄]              │
└──────────────────────────┘

对照
┌──────────────────────────┐
│ 《高效能人士的七个习惯》   │
│ “……”                     │
│ 分歧在哪里……             │
│ [查看原摘抄]              │
└──────────────────────────┘

尚不能确定
你的书库中没有找到关于……的直接材料。
```

每条证据必须包含稳定 ID，并可打开现有书籍或摘抄详情。结论、用户原文和模型归纳必须视觉区分。

### 9.4 待保存建议

研究报告末尾最多提供三条建议：

```text
可以留下的东西

① 建立一条思想关联
《人的境况》 ↔ 《黑天鹅》
关系：对比

“前者讨论行动进入关系网络后的不可预测，
后者讨论复杂系统中极端事件的不可预测。”

[查看依据]  [忽略]  [确认建立]
```

研究完成不自动写入。点击“确认建立”或“确认保存”后，必须进入现有审批与执行链路。

## 10. Research Run 状态与接口

深度共读是有起止的任务，不与 `chatHistories` 混存。建议新增独立 `research_runs` 及事件记录。

建议状态：

```text
CREATED
→ RUNNING
→ COMPLETED
→ FAILED
→ CANCELLED
```

如支持后台恢复，可增加具体阶段字段，不要自创含义模糊的状态名。研究事件记录可包含：

- `CONTEXT_LOADED`
- `SEARCH_STARTED`
- `SEARCH_COMPLETED`
- `EVIDENCE_SELECTED`
- `SYNTHESIS_STARTED`
- `RESULT_COMPLETED`
- `PROPOSAL_CREATED`
- `RUN_FAILED`

建议 API：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/research-runs` | 创建任务，返回 `runId` |
| `GET` | `/api/research-runs/:id` | 获取当前状态和结果 |
| `GET` | `/api/research-runs/:id/stream` | SSE 推送阶段进度 |
| `POST` | `/api/research-runs/:id/cancel` | 停止任务 |
| `GET` | `/api/research-runs?context=...` | 获取当前上下文的历史任务 |

普通聊天继续使用 `/api/chat` 和 `/api/chat/stream`，两条链路不互相代理。

## 11. Proposal 与审批回写

该能力属于第二阶段。Gateway 新增 `propose_reading_actions`，但不写 `user_state`。

示例：

```json
{
  "source": "dsh",
  "dshSessionId": "session-xxx",
  "context": {
    "type": "quote",
    "bookId": "book-xxx",
    "quoteId": "quote-xxx"
  },
  "actions": [
    {
      "type": "link_thought",
      "data": {
        "sourceType": "quote",
        "sourceId": "quote-xxx",
        "targetType": "book",
        "targetId": "book-yyy",
        "kind": "对比",
        "thought": "……"
      },
      "evidence": [
        {
          "entityId": "quote-zzz",
          "excerpt": "……"
        }
      ]
    }
  ]
}
```

服务端处理顺序：

1. 根据 dsh session 解析真实用户。
2. 验证所有实体属于该用户。
3. 使用现有 `ActionValidator` 校验 Schema。
4. 检查已有连接，阻止重复 proposal。
5. 使用现有 `ActionStateMachine` 创建 `PENDING` action。
6. 记录 `source=dsh`、`dshSessionId`、`researchRunId` 和证据 ID。
7. 返回 action ID，不调用写入 MCP Tool。
8. 用户批准后，现有 `MCPToolDispatcher` 执行写入。

必须保留 `user_state.updated_at` 乐观锁，研究运行期间发生的数据更新不能被旧 proposal 静默覆盖。

## 12. 前端可用性与无障碍要求

- 不新增底部 Tab。
- 模式按钮和主要操作触控区域至少 `44 × 44px`。
- 模式切换使用 `role=tablist/tab` 和正确的 `aria-selected`。
- 进度区域使用 `aria-live="polite"`，但不得频繁抢焦点。
- 用户离开页面后任务继续，回来能恢复。
- 失败信息保留在任务卡内，不能只依赖 Toast。
- “停止研究”需要确认，但不使用删除型危险红色样式。
- 证据卡可点击，同时提供明确的“查看原摘抄/查看书籍”按钮。
- 打开详情并返回时恢复研究页面滚动位置。
- iOS Safari 下追加进度不得强制滚到底部。
- 长 URL、书名和无空格文本必须可换行；grid/flex 子项设置 `min-width: 0`。
- 尊重 `prefers-reduced-motion`，进度动画不作为唯一状态表达。

## 13. 首个验证任务

首个端到端任务固定为：

> 围绕当前摘抄，找出书库中与它相互支持、矛盾或延伸的观点，形成一份有出处的观点地图，并提出最多三条值得保存的笔记或关联。

预期轨迹：

```text
1. get_reading_context
2. 提取当前摘抄的核心命题
3. search_quotes 使用多个关键词检索
4. list_books 补充书籍背景
5. get_connections 检查已有关系
6. 必要时换关键词再次检索
7. 将证据分成支持、矛盾、延伸
8. 输出观点地图
9. 第二阶段才生成 proposal
```

结果必须区分：

- 用户原始材料。
- Agent 的解释。
- 每条结论对应的证据。
- 未找到证据或尚不能确定的部分。
- 待用户确认的动作。

## 14. 分阶段实施

### 阶段 0：隔离可行性验证

范围：

- 在临时或外部目录运行 dsh。
- 使用脱敏的静态阅读数据。
- 禁止写入、Shell、文件系统和外部网络。
- 完成一次至少五步的观点研究。

验收：

- 任务能够完成、停止和恢复。
- 不发生 App 数据写入。
- 结果中每个主要结论都有可定位证据。

### 阶段 1：只读 Gateway 与前端入口

范围：

- 六个只读工具。
- 「探讨」内双模式。
- 书籍详情和摘抄详情直达入口。
- Research Run 创建、事件回放、前端轮询进度、结果和失败恢复。
- 仅连接开发数据库。

验收：

- 所有返回实体属于当前用户。
- dsh 无法接触写入 MCP Tool。
- 运行前后 `user_state` 完全一致。
- 普通聊天与现有功能不受影响。
- iPhone 12 视口完成真实交互检查。

这是第一个有产品价值的里程碑。

### 阶段 2：评测

建立独立 `deep_research_set`，覆盖：

- 跨书观点检索。
- 已有关联去重。
- wishlist 与已读书区分。
- OCR 摘抄召回。
- 无证据时拒绝编造。
- 工具失败后的恢复。
- 研究过程中数据变化后的状态处理。

关注指标：

- 引用实体 ID 有效率。
- 结论是否由检索证据支持。
- 重复关联率。
- 未授权写入次数。
- 单任务步数、耗时和 token。
- 用户认为结果有用的比例。

### 阶段 3：待审批 Proposal

范围：

- `propose_reading_actions`。
- App 内待确认建议。
- 证据预览、逐条批准和逐条拒绝。
- dsh session、research run、trace 和 action 的关联。

当前已完成 proposal 校验、Action 创建、逐条批准/拒绝与结果状态同步，并用源码构建的真实 dsh runtime、DeepSeek V4 Pro、隔离数据库及既有写入 MCP 完成端到端验收。

硬验收：

- dsh 直接写入次数为 0。
- 未批准 action 引发的数据变化为 0。
- 所有 action 都能追溯到研究任务和证据。
- 并发写入继续服从乐观锁。
- dsh 停机不影响现有产品。

## 15. 第一版明确不做

- 不替换 `/api/chat`。
- 不让 dsh 读取 `app_state.db`。
- 不向 dsh 暴露现有写入 MCP Server。
- 不嵌入或跳转 dsh Web UI。
- 不新增底部 Tab。
- 不同步 dsh session 与 `chatHistories`。
- 不做多 Agent。
- 不上向量数据库。
- 不自动保存笔记、标签或关联。
- 不接 Prod。
- 不承诺 dsh 成为长期基础依赖。

## 16. 开发启动清单

开发前必须再次核验当时的 dsh 版本和官方接口，因为 Developer Preview 会发生破坏兼容变更。

- [x] 确认 dsh 当前安装方式、版本和锁定策略（`requirements-dsh.txt` 锁 `0.1.0rc6`）。
- [x] 真实确认 dsh MCP 客户端支持 Python FastMCP Streamable HTTP；Intel macOS 使用仓库外构建的单文件 runtime 完成联调。
- [x] 无需建立外置 TypeScript Adapter；应用仓库继续保持纯 Python 后端和裸 ES2020 前端。
- [x] 定义 Gateway 身份绑定和单任务 bearer token。
- [ ] 明确开发数据库副本及禁止 Prod 的机器护栏。
- [x] 确定六个只读工具的 Schema、字段白名单和返回上限。
- [x] 使用《测试书》与 q1/q2 脱敏摘抄完成真实深度共读 golden case。
- [x] 完成前端四状态、上下文直达、历史和 proposal 审批实现；源码、自动化交互约束以及 Chrome 桌面端、iPhone 12 登录态真实交互均已通过。
- [x] 只读里程碑与 proposal 人工审批闭环均已实现；不开放自动写入。

## 17. 参考

- DeepSeek Harness 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- DeepSeek Harness 架构：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
- DeepSeek Harness Web UI 指南：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md
- 当前产品 Agent 分析：[product-agent-context-and-control-analysis.md](./product-agent-context-and-control-analysis.md)
- 当前应用架构：[README.md](../README.md)
