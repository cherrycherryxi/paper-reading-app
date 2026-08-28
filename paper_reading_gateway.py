"""Read-only MCP Gateway for the DeepSeek Harness research sidecar.

The bearer token is bound server-side to one research run and one user.  Tool
schemas deliberately expose neither ``user_id`` nor a write capability.
"""

from __future__ import annotations

import json
import http.client
import ipaddress
import os
import re
import socket
import urllib.parse
import ssl
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import Context, FastMCP

from deep_reading import ResearchRunStore, _now_iso, _new_id, web_research_capability


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

WEB_QUERY_MAX_LENGTH = 120
WEB_RESULT_LIMIT = 8
WEB_REQUEST_LIMIT = 5
WEB_RESPONSE_MAX_BYTES = 512_000
WEB_TIMEOUT_SECONDS = 8
TAVILY_HOST = "api.tavily.com"


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


def _validated_tavily_endpoint() -> str:
    try:
        addresses = {
            item[4][0] for item in socket.getaddrinfo(TAVILY_HOST, 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise RuntimeError("受控搜索服务域名无法解析") from exc
    if not addresses:
        raise RuntimeError("受控搜索服务域名没有可用地址")
    # The hostname is a code-owned constant, not user input. Accept VPN/Clash
    # fake-IP answers while retaining TLS verification against api.tavily.com.
    return sorted(addresses)[0]


def _assert_query_is_safe(query: str, state: dict[str, Any]) -> str:
    query = " ".join(str(query or "").split())
    if not query or len(query) > WEB_QUERY_MAX_LENGTH:
        raise ValueError(f"联网关键词必须为 1-{WEB_QUERY_MAX_LENGTH} 个字符")
    normalized = re.sub(r"\s+", "", query).lower()
    if len(normalized) >= 32:
        for quote in state.get("quotes", []):
            for key in ("content", "ocrText", "reflection"):
                private_text = re.sub(r"\s+", "", str(quote.get(key) or "")).lower()
                if normalized and normalized in private_text:
                    raise PermissionError("联网关键词疑似包含较长的私人摘抄原文，请改用更短的主题词")
    return query


def _is_public_https_url(url: str) -> bool:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return False
    hostname = parsed.hostname.lower().rstrip(".")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
        return False
    try:
        return ipaddress.ip_address(hostname).is_global
    except ValueError:
        # Tavily, not this process, fetches the URL. Hostname-based sources are
        # safe to forward because the local client only connects to TAVILY_HOST.
        return True


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Keep certificate verification on the hostname while connecting to the validated IP."""
    def __init__(self, hostname: str, port: int, pinned_ip: str, timeout: float):
        super().__init__(hostname, port=port, timeout=timeout, context=ssl.create_default_context())
        self.pinned_ip = pinned_ip

    def connect(self) -> None:
        raw_socket = socket.create_connection((self.pinned_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def _audit_web_request(
    run, query: str, status: str, count: int = 0, error: str = "", operation: str = "search",
) -> None:
    conn = store_connection()
    try:
        conn.execute(
            "INSERT INTO research_web_requests"
            "(request_id,run_id,user_id,query,operation,endpoint_host,status,result_count,error_message,created_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                _new_id("web-request"), run["run_id"], run["user_id"], query,
                operation, TAVILY_HOST,
                status, count, str(error)[:300], _now_iso(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _tavily_request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Call one fixed Tavily endpoint without redirects or secret-bearing URLs."""
    pinned_ip = _validated_tavily_endpoint()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "paper-reading-app/controlled-research",
    }
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    else:
        headers["X-Tavily-Access-Mode"] = "keyless"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    connection = _PinnedHTTPSConnection(TAVILY_HOST, 443, pinned_ip, WEB_TIMEOUT_SECONDS)
    try:
        connection.request("POST", path, body=body, headers=headers)
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"Tavily 返回 HTTP {response.status}，不跟随重定向")
        raw = response.read(WEB_RESPONSE_MAX_BYTES + 1)
    finally:
        connection.close()
    if len(raw) > WEB_RESPONSE_MAX_BYTES:
        raise RuntimeError("Tavily 响应超过大小限制")
    decoded = json.loads(raw.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise RuntimeError("Tavily 返回了无效 JSON")
    return decoded


def _save_search_sources(run, results: list[dict[str, Any]]) -> None:
    conn = store_connection()
    try:
        for item in results:
            conn.execute(
                "INSERT OR REPLACE INTO research_web_sources"
                "(source_id,run_id,user_id,url,title,score,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    _new_id("web-source"), run["run_id"], run["user_id"], item["url"],
                    item["title"], float(item.get("score") or 0), _now_iso(),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def search_public_web(query: str, limit: int = 5, ctx: Context = None) -> list[dict[str, Any]]:
    """Use Tavily to discover public HTTPS sources for this authorized run."""
    run = _bound_run(ctx)
    run_web_enabled = bool(run["web_enabled"]) if "web_enabled" in run.keys() else False
    if not web_research_capability()["available"] or not run_web_enabled:
        raise PermissionError("本次深度共读未获联网授权")
    state = _state(run)
    safe_query = _assert_query_is_safe(query, state)
    conn = store_connection()
    try:
        used = conn.execute(
            "SELECT COUNT(*) FROM research_web_requests WHERE run_id = ?", (run["run_id"],)
        ).fetchone()[0]
    finally:
        conn.close()
    if used >= WEB_REQUEST_LIMIT:
        raise PermissionError(f"本次任务最多联网检索 {WEB_REQUEST_LIMIT} 次")

    try:
        _validated_tavily_endpoint()
    except Exception as exc:
        _audit_web_request(run, safe_query, "FAILED", error=str(exc))
        raise RuntimeError(f"联网检索失败：{exc}") from exc
    requested_limit = max(1, min(int(limit or 5), WEB_RESULT_LIMIT))
    try:
        payload = _tavily_request("/search", {
            "query": safe_query,
            "search_depth": "basic",
            "max_results": requested_limit,
            "include_answer": False,
            "include_raw_content": False,
        })
        source_items = payload.get("results", []) if isinstance(payload, dict) else []
        results = []
        for item in source_items:
            if not isinstance(item, dict):
                continue
            item_url = str(item.get("url") or "").strip()
            if not _is_public_https_url(item_url):
                continue
            results.append({
                "title": str(item.get("title") or "")[:300],
                "url": item_url[:2000],
                "snippet": str(item.get("content") or item.get("snippet") or "")[:1000],
                "score": max(0.0, min(float(item.get("score") or 0), 1.0)),
                "retrievedAt": _now_iso(),
            })
            if len(results) >= requested_limit:
                break
        _save_search_sources(run, results)
        _audit_web_request(run, safe_query, "SUCCEEDED", len(results), operation="search")
        store.progress(
            run["run_id"], "web_search", f"已检索 {len(results)} 条公开网络资料", "WEB_SEARCH_COMPLETED",
            {"query": safe_query, "count": len(results)},
        )
        return results
    except Exception as exc:
        _audit_web_request(run, safe_query, "FAILED", error=str(exc))
        raise RuntimeError(f"联网检索失败：{exc}") from exc


def extract_public_pages(urls: list[str], query: str, ctx: Context = None) -> list[dict[str, Any]]:
    """Extract focused chunks only from URLs discovered by this run's Tavily search."""
    run = _bound_run(ctx)
    run_web_enabled = bool(run["web_enabled"]) if "web_enabled" in run.keys() else False
    if not web_research_capability()["available"] or not run_web_enabled:
        raise PermissionError("本次深度共读未获联网授权")
    safe_query = _assert_query_is_safe(query, _state(run))
    requested = list(dict.fromkeys(str(url or "").strip() for url in (urls or [])))
    if not requested or len(requested) > 3:
        raise ValueError("每次定向提取必须包含 1-3 个 URL")
    conn = store_connection()
    try:
        allowed = {
            row["url"] for row in conn.execute(
                "SELECT url FROM research_web_sources WHERE run_id = ?", (run["run_id"],)
            ).fetchall()
        }
    finally:
        conn.close()
    if any(url not in allowed for url in requested):
        raise PermissionError("只能提取本次任务搜索结果中的 URL")
    try:
        payload = _tavily_request("/extract", {
            "urls": requested,
            "query": safe_query,
            "chunks_per_source": 2,
            "extract_depth": "basic",
            "format": "text",
            "include_images": False,
        })
        results = []
        for item in payload.get("results", []):
            if not isinstance(item, dict) or str(item.get("url") or "") not in allowed:
                continue
            results.append({
                "url": str(item["url"])[:2000],
                "content": str(item.get("raw_content") or "")[:4000],
                "retrievedAt": _now_iso(),
            })
        _audit_web_request(run, safe_query, "SUCCEEDED", len(results), operation="extract")
        return results
    except Exception as exc:
        _audit_web_request(run, safe_query, "FAILED", error=str(exc), operation="extract")
        raise RuntimeError(f"网页定向提取失败：{exc}") from exc


if web_research_capability()["available"]:
    mcp.tool()(search_public_web)
    mcp.tool()(extract_public_pages)


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


def _connection_entity(state: dict[str, Any], entity_type: str, entity_id: str) -> dict[str, Any] | None:
    if entity_type == "book":
        book = _book(state, entity_id)
        if not book:
            return None
        return {
            "type": "book",
            **{
                key: book.get(key)
                for key in ("id", "title", "author", "status", "tags", "summary")
            },
        }
    if entity_type == "quote":
        quote = _quote(state, entity_id)
        if not quote:
            return None
        return {"type": "quote", **_compact_quote(quote, state)}
    return None


def _compact_connection(item: dict[str, Any], state: dict[str, Any]) -> dict[str, Any] | None:
    source = _connection_entity(
        state, str(item.get("sourceType") or ""), str(item.get("sourceId") or ""),
    )
    target = _connection_entity(
        state, str(item.get("targetType") or ""), str(item.get("targetId") or ""),
    )
    if not source or not target:
        return None
    return {
        key: item.get(key)
        for key in ("id", "kind", "thought", "tags", "createdAt")
    } | {"source": source, "target": target}


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
    """在当前用户的摘抄中检索证据；可限定当前书或跨书检索，最多 50 条。"""
    run = _bound_run(ctx)
    state = _state(run)
    needle = str(query or "").strip().lower()
    terms = [term for term in re.split(r"[\s,，。；;、|/]+", needle) if term]
    scope = "book" if str(relation_scope or "").strip().lower() == "book" else "all"
    items = []
    for index, quote in enumerate(state.get("quotes", [])):
        book = _book(state, str(quote.get("bookId") or "")) or {}
        text = " ".join([
            *(str(quote.get(key) or "") for key in ("content", "ocrText", "reflection", "tags")),
            str(book.get("title") or ""),
            str(book.get("author") or ""),
        ]).lower()
        same_book = not run["book_id"] or str(quote.get("bookId")) == run["book_id"]
        if scope == "book" and not same_book:
            continue
        matched_terms = sum(term in text for term in terms)
        if terms and not matched_terms:
            continue
        exact_match = bool(needle and needle in text)
        cross_book_priority = scope == "all" and bool(run["book_id"]) and not same_book
        items.append((matched_terms, exact_match, cross_book_priority, index, _compact_quote(quote, state)))
    items.sort(key=lambda item: (-item[0], -item[1], -item[2], item[3]))
    result = [item[-1] for item in items[: max(1, min(int(limit or 20), 50))]]
    store.progress(
        run["run_id"], "search", f"已找到 {len(result)} 条候选摘抄", "QUOTE_SEARCH_COMPLETED",
        {"query": str(query)[:120], "relationScope": scope, "count": len(result)},
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
    connections = []
    for item in state.get("connections", []):
        if target and str(item.get("sourceId")) != target and str(item.get("targetId")) != target:
            continue
        compact = _compact_connection(item, state)
        if compact:
            connections.append(compact)
        if len(connections) == 50:
            break
    return connections


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
