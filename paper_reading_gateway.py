"""Read-only MCP Gateway for the DeepSeek Harness research sidecar.

The bearer token is bound server-side to one research run and one user.  Tool
schemas deliberately expose neither ``user_id`` nor a write capability.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import Context, FastMCP

from deep_reading import ResearchRunStore


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "app_state.db")))
store = ResearchRunStore(DB_PATH)

mcp = FastMCP(
    "paper-reading-readonly",
    instructions=(
        "paper-reading-app 的只读研究工具。所有数据都属于当前已授权研究任务；"
        "不得猜测其他用户或任务，不提供任何写入能力。"
    ),
)


def _bound_run(ctx: Context):
    request = ctx.request_context.request
    header = request.headers.get("authorization", "") if request is not None else ""
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    run = store.authenticate_gateway(token)
    if not run:
        raise PermissionError("invalid research gateway credential")
    if run["status"] not in {"CREATED", "RUNNING"} or int(run["cancel_requested"] or 0):
        raise PermissionError("research run is no longer active")
    return run


def _state(run) -> dict[str, Any]:
    conn = store_connection()
    try:
        row = conn.execute("SELECT state_json FROM user_state WHERE user_id = ?", (run["user_id"],)).fetchone()
        return json.loads(row["state_json"]) if row else {}
    finally:
        conn.close()


def store_connection():
    # Keep the Gateway independent from app_server imports and their startup side effects.
    import sqlite3
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _book(state: dict[str, Any], book_id: str) -> dict[str, Any] | None:
    return next((item for item in state.get("books", []) if str(item.get("id")) == book_id), None)


def _quote(state: dict[str, Any], quote_id: str) -> dict[str, Any] | None:
    return next((item for item in state.get("quotes", []) if str(item.get("id")) == quote_id), None)


def _compact_book(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item:
        return None
    return {
        key: item.get(key)
        for key in (
            "id", "title", "author", "status", "rating", "tags", "summary", "notes", "review",
            "startedAt", "finishedAt", "currentPage", "totalPages",
        )
    }


def _compact_quote(item: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    book = _book(state, str(item.get("bookId") or "")) or {}
    return {
        "id": item.get("id", ""),
        "bookId": item.get("bookId", ""),
        "bookTitle": book.get("title", ""),
        "kind": item.get("kind", "quote"),
        "content": item.get("content") or item.get("ocrText") or "",
        "reflection": item.get("reflection", ""),
        "tags": item.get("tags", []),
        "page": item.get("page", ""),
        "createdAt": item.get("createdAt", ""),
    }


@mcp.tool()
def get_reading_context(ctx: Context) -> dict[str, Any]:
    """读取当前研究任务绑定的书籍、摘抄和用户问题。无需传入用户或任务 ID。"""
    run = _bound_run(ctx)
    state = _state(run)
    book = _book(state, run["book_id"]) if run["book_id"] else None
    quote = _quote(state, run["quote_id"]) if run["quote_id"] else None
    store.progress(run["run_id"], "context", "已读取当前阅读上下文", "CONTEXT_LOADED")
    return {
        "contextType": run["context_type"],
        "question": run["question"],
        "book": _compact_book(book),
        "quote": _compact_quote(quote, state) if quote else None,
    }


@mcp.tool()
def search_quotes(query: str = "", relation_scope: str = "all", limit: int = 20, ctx: Context = None) -> list[dict[str, Any]]:
    """在当前用户的摘抄中检索证据。query 为空时返回与当前书相关的摘抄；最多 50 条。"""
    run = _bound_run(ctx)
    state = _state(run)
    needle = str(query or "").strip().lower()
    items = []
    for quote in state.get("quotes", []):
        book = _book(state, str(quote.get("bookId") or "")) or {}
        text = " ".join([
            *(str(quote.get(key) or "") for key in ("content", "ocrText", "reflection", "tags")),
            str(book.get("title") or ""),
            str(book.get("author") or ""),
        ]).lower()
        same_book = not run["book_id"] or str(quote.get("bookId")) == run["book_id"]
        if (needle and needle in text) or (not needle and same_book):
            items.append(_compact_quote(quote, state))
    result = items[: max(1, min(int(limit or 20), 50))]
    store.progress(
        run["run_id"], "search", f"已找到 {len(result)} 条候选摘抄", "QUOTE_SEARCH_COMPLETED",
        {"query": str(query)[:120], "relationScope": relation_scope, "count": len(result)},
    )
    return result


@mcp.tool()
def list_books(query: str = "", limit: int = 30, ctx: Context = None) -> list[dict[str, Any]]:
    """列出当前用户书架中的书籍，可按书名或作者过滤。"""
    run = _bound_run(ctx)
    state = _state(run)
    needle = str(query or "").strip().lower()
    books = [
        _compact_book(item)
        for item in state.get("books", [])
        if not needle or needle in f"{item.get('title', '')} {item.get('author', '')}".lower()
    ]
    return books[: max(1, min(int(limit or 30), 50))]


@mcp.tool()
def get_connections(entity_id: str = "", ctx: Context = None) -> list[dict[str, Any]]:
    """读取与某本书或摘抄相连的思想关联；entity_id 为空时读取当前上下文相关关联。"""
    run = _bound_run(ctx)
    state = _state(run)
    target = str(entity_id or run["quote_id"] or run["book_id"])
    return [
        item for item in state.get("connections", [])
        if not target or str(item.get("sourceId")) == target or str(item.get("targetId")) == target
    ][:50]


@mcp.tool()
def get_confirmed_memories(ctx: Context) -> list[dict[str, Any]]:
    """读取用户明确确认过的阅读偏好、观点、目标和待办。"""
    run = _bound_run(ctx)
    state = _state(run)
    return [
        {key: item.get(key) for key in ("id", "kind", "content", "sourceContext", "updatedAt")}
        for item in state.get("memories", []) if item.get("status") == "confirmed"
    ][:30]


@mcp.tool()
def get_reading_timeline(book_id: str = "", ctx: Context = None) -> list[dict[str, Any]]:
    """读取当前用户某本书的阅读会话时间线，默认使用当前上下文书籍。"""
    run = _bound_run(ctx)
    state = _state(run)
    target = str(book_id or run["book_id"])
    return [
        {
            key: item.get(key)
            for key in (
                "id", "bookId", "date", "minutes", "startPage", "endPage", "pagesRead", "note", "createdAt",
            )
        }
        for item in state.get("sessions", []) if not target or str(item.get("bookId")) == target
    ][:100]


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PAPER_READING_GATEWAY_PORT", "8789"))
    uvicorn.run(mcp.streamable_http_app(), host="127.0.0.1", port=port)
