"""
tool_schema_provider.py
启动时通过 MCP tools/list 拉取 Tool schema，作为 PromptBuilder 和
ActionValidator 的唯一事实来源（single source of truth）。

设计原则：
- 启动期同步拉取（asyncio.run 一次），失败则进程退出
- 拉取结果缓存在内存，运行时零开销
- 提供两种视图：
  1. for_prompt()：组装进 system_instruction 的 Tool 列表文本
  2. validate_action()：替代 ActionValidator 里的硬编码 ACTION_SCHEMAS
- camelCase ↔ snake_case 转换在这里统一处理（MCP 用 snake，业务用 camel）
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8788/mcp")


# ── action.type ↔ tool name ───────────────────────────────────────────────────
# 一一对应；保留映射层方便未来命名分歧
ACTION_TYPE_TO_TOOL = {
    "add_note": "add_note",
    "add_book": "add_book",
    "summary": "summary",
    "question": "question",
    "tag": "tag",
    "link_thought": "link_thought",
}
TOOL_TO_ACTION_TYPE = {v: k for k, v in ACTION_TYPE_TO_TOOL.items()}

# 业务侧 camelCase 字段名 ↔ MCP Tool snake_case 参数名
# 仅列出有歧义的字段；其他同名字段（content/title/tags/kind/thought）无需转换
FIELD_NAME_BUSINESS_TO_MCP = {
    "bookId": "book_id",
    "sourceType": "source_type",
    "sourceId": "source_id",
    "targetType": "target_type",
    "targetId": "target_id",
}
FIELD_NAME_MCP_TO_BUSINESS = {v: k for k, v in FIELD_NAME_BUSINESS_TO_MCP.items()}

# user_id 是基础设施参数，不暴露给模型；由 Dispatcher 在调用时注入
INFRA_PARAMS = {"user_id"}


@dataclass
class ToolSchema:
    """单个 Tool 的归一化 schema 描述。"""
    name: str                       # MCP 中的 Tool 名（snake_case）
    action_type: str                # 业务侧 action.type，与 name 通常相同
    description: str                # 完整 description（含调用场景说明）
    required_fields: dict[str, type]   # 业务字段名 → Python 类型
    optional_fields: dict[str, type]
    enum_constraints: dict[str, list[str]]  # 字段名 → 允许取值列表
    raw_input_schema: dict          # MCP 原始 inputSchema，保留以备特殊用途


# ── 类型映射：JSON Schema type → Python type ──────────────────────────────────

_JSON_TYPE_TO_PY: dict[str, type] = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "array": list,
    "object": dict,
}


def _resolve_python_type(prop_schema: dict) -> type:
    """从 JSON Schema 属性定义解析出 Python 类型。"""
    json_type = prop_schema.get("type")
    if isinstance(json_type, list):
        # 形如 ["string", "null"] —— 可选字段；取第一个非 null
        json_type = next((t for t in json_type if t != "null"), "string")
    # anyOf / oneOf 简单处理
    if not json_type and "anyOf" in prop_schema:
        for variant in prop_schema["anyOf"]:
            if isinstance(variant, dict) and variant.get("type") and variant["type"] != "null":
                json_type = variant["type"]
                break
    return _JSON_TYPE_TO_PY.get(json_type or "string", str)


def _extract_enum_values(prop_schema: dict) -> list[str]:
    values: list[str] = []
    for key in ("enum", "const"):
        if key == "enum" and isinstance(prop_schema.get(key), list):
            values.extend(str(item) for item in prop_schema[key])
        elif key == "const" and key in prop_schema:
            values.append(str(prop_schema[key]))
    for branch_key in ("anyOf", "oneOf", "allOf"):
        for variant in prop_schema.get(branch_key, []):
            if isinstance(variant, dict):
                values.extend(_extract_enum_values(variant))
    return list(dict.fromkeys(values))


def _description_for_prompt(description: str) -> str:
    """Hide host-injected infrastructure args from the model-facing prompt."""
    lines = []
    for line in (description or "").splitlines():
        if line.strip().startswith("user_id:"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _parse_one_tool(tool: Any) -> ToolSchema:
    """把 MCP Tool 对象转成 ToolSchema。"""
    name = tool.name
    description = tool.description or ""
    input_schema = tool.inputSchema or {}
    properties: dict = input_schema.get("properties", {})
    required_list: list[str] = input_schema.get("required", [])

    required_fields: dict[str, type] = {}
    optional_fields: dict[str, type] = {}
    enum_constraints: dict[str, list[str]] = {}

    for mcp_field, prop_schema in properties.items():
        if mcp_field in INFRA_PARAMS:
            continue
        business_field = FIELD_NAME_MCP_TO_BUSINESS.get(mcp_field, mcp_field)
        py_type = _resolve_python_type(prop_schema)

        if mcp_field in required_list:
            required_fields[business_field] = py_type
        else:
            optional_fields[business_field] = py_type

        enum_values = _extract_enum_values(prop_schema)
        if enum_values:
            enum_constraints[business_field] = enum_values

    return ToolSchema(
        name=name,
        action_type=TOOL_TO_ACTION_TYPE.get(name, name),
        description=description,
        required_fields=required_fields,
        optional_fields=optional_fields,
        enum_constraints=enum_constraints,
        raw_input_schema=input_schema,
    )


# ── 异步拉取 ──────────────────────────────────────────────────────────────────

async def _fetch_tools_async() -> list[ToolSchema]:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    async with streamablehttp_client(MCP_SERVER_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return [_parse_one_tool(tool) for tool in result.tools]


# ── 单例 Provider ─────────────────────────────────────────────────────────────

class ToolSchemaProvider:
    """全局单例，启动时初始化，后续只读。"""

    _instance: "ToolSchemaProvider | None" = None

    def __init__(self, schemas: list[ToolSchema]):
        self._schemas = schemas
        self._by_action: dict[str, ToolSchema] = {s.action_type: s for s in schemas}

    @classmethod
    def initialize(cls) -> "ToolSchemaProvider":
        """启动时调用一次。失败抛异常，进程应直接退出。"""
        if cls._instance is not None:
            return cls._instance
        schemas = asyncio.run(_fetch_tools_async())
        if not schemas:
            raise RuntimeError(f"no tools returned from MCP server at {MCP_SERVER_URL}")
        cls._instance = cls(schemas)
        return cls._instance

    @classmethod
    def initialize_for_testing(cls, schemas: list[ToolSchema]) -> "ToolSchemaProvider":
        cls._instance = cls(schemas)
        return cls._instance

    @classmethod
    def get(cls) -> "ToolSchemaProvider":
        if cls._instance is None:
            raise RuntimeError("ToolSchemaProvider not initialized; call initialize() at startup")
        return cls._instance

    # ── PromptBuilder 视图 ────────────────────────────────────────────────────

    def for_prompt(self) -> str:
        """
        组装成 system_instruction 中的 Action 工具列表文本。
        每个 Tool 占一段：名称、必填参数、可选参数、enum 约束、完整描述。
        """
        sections: list[str] = []
        for schema in self._schemas:
            lines = [f"## action.type = \"{schema.action_type}\""]
            lines.append(_description_for_prompt(schema.description))
            lines.append("")
            lines.append("data 字段：")
            for field, py_type in schema.required_fields.items():
                constraint = ""
                if field in schema.enum_constraints:
                    constraint = f"，取值之一：{schema.enum_constraints[field]}"
                lines.append(f"  - {field} ({py_type.__name__}, 必填{constraint})")
            for field, py_type in schema.optional_fields.items():
                constraint = ""
                if field in schema.enum_constraints:
                    constraint = f"，取值之一：{schema.enum_constraints[field]}"
                lines.append(f"  - {field} ({py_type.__name__}, 可选{constraint})")
            sections.append("\n".join(lines))
        return "\n\n".join(sections)

    def action_types(self) -> list[str]:
        return [s.action_type for s in self._schemas]

    # ── ActionValidator 视图 ──────────────────────────────────────────────────

    def schema_for(self, action_type: str) -> ToolSchema | None:
        return self._by_action.get(action_type)

    def validate_action_data(self, action_type: str, data: dict) -> list[str]:
        """
        替代原 ActionValidator._validate_schema 的逻辑，但 schema 来源于 MCP。
        返回错误列表；空列表表示通过。
        """
        schema = self._by_action.get(action_type)
        if not schema:
            return [f"unknown action type: {action_type}"]

        errors: list[str] = []
        allowed = set(schema.required_fields) | set(schema.optional_fields)

        # 必填字段
        for field, expected_type in schema.required_fields.items():
            value = data.get(field)
            if value is None or not isinstance(value, expected_type):
                errors.append(f"{action_type}.{field} is required and must be {expected_type.__name__}")

        # 字段类型 + enum 约束
        for key, value in data.items():
            if key not in allowed:
                errors.append(f"{action_type}.{key} is not allowed")
                continue
            expected_type = schema.required_fields.get(key) or schema.optional_fields.get(key)
            if expected_type and not isinstance(value, expected_type):
                errors.append(f"{action_type}.{key} must be {expected_type.__name__}")
                continue
            if key in schema.enum_constraints and value not in schema.enum_constraints[key]:
                errors.append(
                    f"{action_type}.{key} must be one of {schema.enum_constraints[key]}, got: {value}"
                )

        return errors
