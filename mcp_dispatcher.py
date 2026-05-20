"""
mcp_dispatcher.py
Agent Host 侧的 MCP Client 入口。

把 ActionExecutor 的 if/elif 分支替换为一次 MCP tools/call。
方案 Y：每次调用临时 asyncio.run 一遍 connect → initialize → call_tool → close。
本地单机延迟可接受（实测 ~50-150ms），换来代码极简、无线程管理。

依赖：
    pip install "mcp[cli]" httpx
或：
    uv add "mcp[cli]" httpx
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any

# MCP Server 的 HTTP endpoint
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8788/mcp")

# action.type → MCP tool name 的映射（这里一一对应，但保留映射层方便未来重命名）
ACTION_TYPE_TO_TOOL = {
    "add_note": "add_note",
    "add_book": "add_book",
    "summary": "summary",
    "question": "question",
    "tag": "tag",
    "link_thought": "link_thought",
}


@dataclass
class MCPCallResult:
    """MCP Tool 调用结果，与 ExecutionResult 形态对齐，便于上层无感替换。"""
    ok: bool
    tool_name: str
    raw_result: dict | None = None
    error: str = ""

    @property
    def updated_state(self) -> dict | None:
        """从 raw_result 中提取更新后的 state。Tool 约定返回 {ok, state, ...}。"""
        if self.raw_result and isinstance(self.raw_result, dict):
            return self.raw_result.get("state")
        return None

    @property
    def success(self) -> bool:
        """兼容旧 ExecutionResult.success 字段，减少 approve handler 改动面。"""
        return self.ok

    @property
    def error_message(self) -> str:
        """兼容旧 ExecutionResult.error_message 字段。"""
        return self.error


# ── action.data → tool arguments 的转换 ─────────────────────────────────────
# 原 ActionExecutor 用 camelCase（bookId、sourceType）从 data 取值；
# MCP Tool 用 snake_case（book_id、source_type）作参数名。这里集中做转换。

def _build_tool_arguments(action_type: str, user_id: str, data: dict) -> dict[str, Any]:
    """把 action.data 翻译成对应 Tool 的 arguments。"""
    common = {"user_id": user_id}

    if action_type == "add_note":
        tags = data.get("tags", [])
        return {
            **common,
            "content": data.get("content", ""),
            "book_id": data.get("bookId", ""),
            "tags": tags if isinstance(tags, list) else [],
        }

    if action_type == "add_book":
        return {
            **common,
            "title": data.get("title", "未命名"),
            "author": data.get("author", ""),
            "reason": data.get("reason", ""),
        }

    if action_type == "summary":
        return {
            **common,
            "content": data.get("content", ""),
            "book_id": data.get("bookId", ""),
        }

    if action_type == "question":
        return {
            **common,
            "content": data.get("content", ""),
            "book_id": data.get("bookId", ""),
        }

    if action_type == "tag":
        tags = data.get("tags", [])
        return {
            **common,
            "tags": tags if isinstance(tags, list) else [],
            "book_id": data.get("bookId", ""),
        }

    if action_type == "link_thought":
        tags = data.get("tags", [])
        return {
            **common,
            "source_type": data.get("sourceType", ""),
            "source_id": data.get("sourceId", ""),
            "target_type": data.get("targetType", ""),
            "target_id": data.get("targetId", ""),
            "kind": data.get("kind", ""),
            "thought": str(data.get("thought", "")).strip(),
            "tags": tags if isinstance(tags, list) else [],
        }

    raise ValueError(f"unknown action type for MCP dispatch: {action_type}")


# ── 异步 MCP 调用核心 ─────────────────────────────────────────────────────────

async def _call_tool_async(tool_name: str, arguments: dict) -> dict:
    """建立一次 MCP 连接，调用一个 tool，关闭连接。返回 Tool 的结构化输出。"""
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    async with streamablehttp_client(MCP_SERVER_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments=arguments)

            # MCP 返回的 content 是一个 list[ContentBlock]。我们的 Tool 返回 dict，
            # SDK 会把它包装成 TextContent(text=json.dumps(...))。
            # 同时新版 SDK 支持 structuredContent，优先取它。
            if getattr(result, "structuredContent", None):
                payload = result.structuredContent
                # FastMCP 的 dict 返回值会被包装成 {"result": <dict>}
                if isinstance(payload, dict) and set(payload.keys()) == {"result"}:
                    return payload["result"]
                return payload

            # 降级：从第一个 TextContent 块里解析 JSON
            for block in result.content:
                text = getattr(block, "text", None)
                if text:
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        return {"ok": False, "error": f"non-json tool output: {text[:200]}"}

            return {"ok": False, "error": "empty tool result"}


# ── 同步入口：供 log_server.py 的 BaseHTTPRequestHandler 直接调用 ─────────────

class MCPToolDispatcher:
    """
    替代原 ActionExecutor 的 execute_action 入口。
    输入沿用原 action 字典格式，无需改动 ActionStateMachine 和上层路由。
    """

    def dispatch(self, user_id: str, action: dict) -> MCPCallResult:
        action_type = action.get("type", "")
        tool_name = ACTION_TYPE_TO_TOOL.get(action_type)
        if not tool_name:
            return MCPCallResult(
                ok=False,
                tool_name=action_type,
                error=f"no MCP tool mapped for action type: {action_type}",
            )

        try:
            arguments = _build_tool_arguments(action_type, user_id, action.get("data", {}))
        except Exception as error:
            return MCPCallResult(ok=False, tool_name=tool_name, error=f"argument build failed: {error}")

        try:
            raw = asyncio.run(_call_tool_async(tool_name, arguments))
        except Exception as error:
            return MCPCallResult(ok=False, tool_name=tool_name, error=f"MCP call failed: {error}")

        if not isinstance(raw, dict):
            return MCPCallResult(ok=False, tool_name=tool_name, error=f"unexpected tool output type: {type(raw).__name__}")

        if not raw.get("ok", False):
            return MCPCallResult(ok=False, tool_name=tool_name, raw_result=raw, error=raw.get("error", "tool returned ok=False"))

        return MCPCallResult(ok=True, tool_name=tool_name, raw_result=raw)
