log_server.py 第一阶段 MCP 改造说明
==================================

阶段目标
--------

本阶段保留现有产品协议：

    模型输出 {"reply": string, "actions": Action[]}
    后端创建 PENDING_APPROVAL action
    用户 approve 后再执行副作用

MCP 在本阶段承担两件事：

1. MCP tools/list 是 action schema 与 tool description 的来源。
2. MCP tools/call 是 approve 后的执行入口。

注意：本阶段还不是严格意义上的模型原生 tool_calls。模型仍按现有 JSON action 协议输出，后端仍负责解析、校验、审批和执行。


新增依赖文件
------------

- reading_mcp_server.py
  本地 MCP Server，暴露 add_note / add_book / summary / question / tag / link_thought 六个 tool。

- tool_schema_provider.py
  MCP Client 侧 schema provider。启动时拉 tools/list，缓存后供 PromptBuilder 和 ActionValidator 使用。

- mcp_dispatcher.py
  MCP Client 侧 dispatcher。approve 后调用 tools/call，并把结果适配成旧 ExecutionResult 兼容形态。


启动顺序
--------

终端 1：

    python reading_mcp_server.py

终端 2：

    python log_server.py

log_server.py 启动时会执行：

    ToolSchemaProvider.initialize()

如果 MCP Server 未启动、mcp SDK 未安装、或 tools/list 拉取失败，log_server.py 会启动失败。这是运行时硬依赖，避免服务启动后才发现 action 执行链路不可用。


关键实现点
----------

1. PromptBuilder 不再硬编码 action schema

PromptBuilder.build_system_instruction 现在从 ToolSchemaProvider.get().for_prompt() 拼接工具说明。

保留在 prompt 里的只有产品策略：

- reply 必须存在
- actions 通常 0 或 1 个
- add_book 最多 4 个
- 当前书籍上下文下，明确可执行建议应返回 action


2. ActionValidator 不再使用 ACTION_WHITELIST / ACTION_SCHEMAS

ActionValidator 改为：

    provider = self.provider or ToolSchemaProvider.get()
    allowed_types = set(provider.action_types())
    provider.validate_action_data(action_type, data)

并支持 provider 注入，方便单元测试使用 fake provider，而不需要真实启动 MCP Server。


3. 校验前先补当前 bookId

summary 和 tag 在 MCP schema 中要求 book_id 必填。为了兼容模型省略当前书籍 ID 的常见输出，后端会在 ActionValidator 前执行：

    inject_context_into_actions(parse_result.actions, book_id)

也就是先把当前对话 bookId 注入 add_note / summary / tag，再做 schema 校验。


4. approve handler 切到 MCP dispatcher

approve 后不再调用 ActionExecutor.execute_action，而是调用：

    dispatcher = MCPToolDispatcher()
    execution = dispatcher.dispatch(user["id"], action)

MCPCallResult 提供 success / error_message 兼容属性，避免 approve handler 大范围重写。

trace 中 ACTION_EXECUTED 事件会记录：

    {"via": "mcp", "tool": "<tool_name>"}


5. reading_mcp_server.py schema 修正

- summary(user_id, content, book_id) 中 book_id 改为必填。
- tag(user_id, tags, book_id) 中 book_id 改为必填。
- link_thought 的 source_type / target_type / kind 使用 Literal，让 MCP schema 能暴露 enum 约束。
- SQLite 连接加 timeout / busy_timeout，降低 log_server.py 和 reading_mcp_server.py 双进程写库时的锁冲突概率。


6. tool_schema_provider.py schema 解析增强

- mcp SDK 改成懒导入，方便无 mcp 依赖时做静态检查和单元测试。
- enum 解析支持 enum / const / anyOf / oneOf / allOf。
- for_prompt() 会过滤 user_id 这类 host 注入参数，避免模型误把 user_id 放进 action.data。
- 增加 initialize_for_testing()，供测试注入固定 schema。


验证清单
--------

1. 语法检查：

    PYTHONPYCACHEPREFIX=/private/tmp/codex_pycache python3 -m py_compile log_server.py reading_mcp_server.py mcp_dispatcher.py tool_schema_provider.py

2. 启动 MCP Server：

    python reading_mcp_server.py

3. 启动后端：

    python log_server.py

应看到：

    [startup] fetching tool schemas from MCP server ...
    [startup] tool schemas loaded: [...]

4. 前端触发一次 add_book / tag / link_thought，approve 后确认：

- action 状态变为 EXECUTED
- user_state 被 MCP tool 修改
- trace 的 ACTION_EXECUTED details 包含 via=mcp 和 tool 名称


后续第二阶段
------------

第二阶段才考虑把模型输出从 JSON actions 改成原生 tool_calls：

    model tool_calls -> pending agent_actions -> user approve -> MCP tools/call

这会涉及模型调用层、streaming tool_call delta 聚合和测试 mock 结构，暂不在第一阶段处理。
