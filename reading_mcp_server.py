"""
reading_mcp_server.py
阅读记录 Agent 的本地 MCP Server。

Tool description 写作原则（语义合约）：
1. 第一段：这个 Tool 做什么，会修改哪个数据结构、修改成什么样
2. 第二段：什么场景下应该被调用（触发关键词、用户意图）
3. Args 段：每个参数的语义、可选/必填、取值约束
4. Notes：与其他 Tool 的边界、特殊处理、副作用范围

这样写之后，模型只看 tools/list 返回的 description 就能正确决定何时调用、如何调用。
"""

from __future__ import annotations

import json
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app_state.db"

VALID_CONNECTION_KINDS = {"异曲同工", "引用", "对比", "影响", "延伸"}
EntityType = Literal["book", "quote"]
ConnectionKind = Literal["异曲同工", "引用", "对比", "影响", "延伸"]

mcp = FastMCP(
    "reading-agent-actions",
    instructions=(
        "阅读记录 Agent 的本地工具集，提供 6 个写入型 Tool，对应 AI 与用户对话后"
        "需要落库的 6 类副作用。所有 Tool 都直接修改 user_state，调用前应已通过"
        "用户授权（approve）。Tool 之间是互斥关系，单次对话通常只调用其中一个。"
    ),
)


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _now_iso() -> str:
    return datetime.now().isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def _load_state(conn: sqlite3.Connection, user_id: str) -> dict:
    row = conn.execute(
        "SELECT state_json FROM user_state WHERE user_id = ?", (user_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"user_state not found for user_id={user_id}")
    return json.loads(row["state_json"])


def _save_state(conn: sqlite3.Connection, user_id: str, state: dict) -> None:
    conn.execute(
        "UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?",
        (json.dumps(state, ensure_ascii=False), _now_iso(), user_id),
    )
    conn.commit()


def _ok(state: dict, extra: dict | None = None) -> dict:
    result = {"ok": True, "state": state}
    if extra:
        result.update(extra)
    return result


AUTHOR_NATIONALITY_LABELS = [
    "中国", "中", "美国", "美", "英国", "英", "法国", "法", "德国", "德", "日本", "日",
    "俄国", "俄罗斯", "俄", "意大利", "意", "西班牙", "西", "葡萄牙", "葡", "加拿大", "加",
    "澳大利亚", "澳", "奥地利", "奥", "瑞士", "瑞典", "瑞", "挪威", "挪", "丹麦", "丹",
    "芬兰", "芬", "荷兰", "荷", "比利时", "比", "爱尔兰", "爱", "希腊", "希", "印度", "印",
    "韩国", "韩", "German", "Germany", "American", "USA", "US", "U.S.", "British", "Britain",
    "English", "French", "France", "Japanese", "Russian", "Italian", "Spanish", "Canadian",
    "Australian", "Austrian", "Swiss", "Swedish", "Norwegian", "Danish", "Finnish", "Dutch",
    "Belgian", "Irish", "Greek", "Indian", "Korean",
]
AUTHOR_NATIONALITY_PATTERN = "|".join(
    re.escape(item) for item in sorted(AUTHOR_NATIONALITY_LABELS, key=len, reverse=True)
)
AUTHOR_COUNTRY_NAME_PATTERN = "|".join(
    re.escape(item)
    for item in [
        "中国", "美国", "英国", "法国", "德国", "日本", "俄国", "俄罗斯", "意大利", "西班牙",
        "加拿大", "澳大利亚", "奥地利", "瑞士", "瑞典", "挪威", "丹麦", "芬兰", "荷兰",
        "比利时", "爱尔兰", "希腊", "印度", "韩国",
    ]
)


def _normalize_book_title_for_match(raw: str) -> str:
    return re.sub(r"\s+", "", str(raw or "").strip().strip("《》")).lower()


def _strip_author_nationality(raw: str) -> str:
    value = re.sub(r"^作者\s*[:：]\s*", "", str(raw or "").strip(), flags=re.IGNORECASE)
    previous = None
    while value and value != previous:
        previous = value
        value = re.sub(
            rf"^[\s\[【(（]+\s*(?:{AUTHOR_NATIONALITY_PATTERN})\s*[\]】)）]+\s*",
            "",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            rf"^(?:{AUTHOR_NATIONALITY_PATTERN})(?:籍|国)?[\s,，.．:：\-—]+",
            "",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(rf"^(?:{AUTHOR_COUNTRY_NAME_PATTERN})", "", value, flags=re.IGNORECASE).strip()
    return value


def _normalize_book_author_for_match(raw: str) -> str:
    value = _strip_author_nationality(raw)
    value = re.sub(r"\s*(?:著|撰|编著|编|译)\s*$", "", value)
    return re.sub(r"[\s·・.．,，、:：;；\-—_'\"“”‘’`]", "", value).lower()


def _book_duplicate_signature(title: str, author: str) -> str:
    return f"{_normalize_book_title_for_match(title)}::{_normalize_book_author_for_match(author)}"


def _books_are_same(title_a: str, author_a: str, title_b: str, author_b: str) -> bool:
    """Titles must match; an empty author acts as a wildcard (unspecified)."""
    ta = _normalize_book_title_for_match(title_a)
    tb = _normalize_book_title_for_match(title_b)
    if not ta or ta != tb:
        return False
    aa = _normalize_book_author_for_match(author_a)
    ab = _normalize_book_author_for_match(author_b)
    if not aa or not ab:
        return True
    return aa == ab


def _upsert_book_question(state: dict, *, book_id: str, content: str) -> dict:
    quotes = state.setdefault("quotes", [])
    existing = next(
        (item for item in quotes if item.get("kind") == "question" and item.get("bookId") == book_id),
        None,
    )
    if existing:
        existing["content"] = content
        existing["tags"] = ["问题"]
        existing["updatedAt"] = _now_iso()
        return existing
    quote = {
        "id": _new_id("quote"),
        "bookId": book_id,
        "content": content,
        "tags": ["问题"],
        "kind": "question",
        "createdAt": _now_iso(),
    }
    quotes.insert(0, quote)
    return quote


@mcp.tool()
def add_note(
    user_id: str,
    content: str,
    book_id: str = "",
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """新增一条摘抄或读书笔记。

    会在用户的 quotes 列表头部插入一条新记录，kind 固定为 "note"。
    这是用户最高频的写入操作，承载用户的思考、感悟、原文摘抄。

    调用场景：
    - 用户说"记一下"、"帮我把这段记下来"、"做个笔记"、"保存这段话"
    - 用户提出了一个观点，AI 回复中复述/提炼了它，值得沉淀
    - 用户分享了阅读时的感想，明显是想留存的思考

    语义边界：add_note 处理离散的思考/摘抄/感想（点状）。
    整段的系统性归纳由 summary 负责；开放式疑问由 question 负责。

    Args:
        user_id: 用户 ID
        content: 笔记正文，必填，不能为空
        book_id: 关联的书籍 ID。强烈建议提供——无 book_id 的 note 在前端会进入"未归类"列表，
                 体验差。当前对话上下文如果是某本书，应当使用该书的 id
        tags: 标签数组，可选。AI 可自主提炼 1-3 个关键词作为标签
    """
    if not content:
        return {"ok": False, "error": "content is required"}
    conn = _get_conn()
    try:
        state = _load_state(conn, user_id)
        quote = {
            "id": _new_id("quote"),
            "bookId": book_id,
            "content": content,
            "tags": tags or [],
            "kind": "note",
            "createdAt": _now_iso(),
        }
        state.setdefault("quotes", []).insert(0, quote)
        _save_state(conn, user_id, state)
        return _ok(state, {"created": quote})
    except Exception as error:
        return {"ok": False, "error": str(error)}
    finally:
        conn.close()


@mcp.tool()
def add_book(
    user_id: str,
    title: str,
    author: str = "",
    reason: str = "",
) -> dict[str, Any]:
    """把一本书加入用户的书单（wishlist 状态）。

    会在 books 列表头部插入一本新书，status 固定为 "wishlist"（待读）。
    重复检测：如果书单中已存在相同 title + author 的书，会跳过不插入。

    调用场景：
    - 用户说"加入书单"、"想读"、"记下这本书"
    - AI 在回复中推荐了一本具体的书（有明确书名），且用户表现出兴趣
    - 用户提到某本书想以后看，但不一定立刻读

    批量调用：如果一次推荐多本书，可在同一次回复中返回多条 add_book，
    上限由 Agent Host 的产品策略决定（当前为 4 本）。

    Args:
        user_id: 用户 ID
        title: 书名，必填
        author: 作者，可选但强烈建议提供（用于去重和未来检索）
        reason: 推荐理由或选书原因，可选。会写入 book.notes 字段，前端可见
    """
    if not title:
        return {"ok": False, "error": "title is required"}
    conn = _get_conn()
    try:
        state = _load_state(conn, user_id)
        books = state.setdefault("books", [])
        exists = any(
            _books_are_same(title, author, b.get("title"), b.get("author", ""))
            for b in books
        )
        if exists:
            return _ok(state, {"skipped": True, "reason": "book already exists"})

        now = _now_iso()
        book = {
            "id": _new_id("book"),
            "title": title,
            "author": author,
            "status": "wishlist",
            "notes": reason,
            "tags": [],
            "createdAt": now,
            "updatedAt": now,
        }
        books.insert(0, book)
        _save_state(conn, user_id, state)
        return _ok(state, {"created": book})
    except Exception as error:
        return {"ok": False, "error": str(error)}
    finally:
        conn.close()


@mcp.tool()
def summary(
    user_id: str,
    content: str,
    book_id: str,
) -> dict[str, Any]:
    """为某本书追加一段阶段性总结。

    会把总结内容追加到对应书的 book.notes 字段末尾（用空行分隔），
    并更新 book.updatedAt。这是面向书的"成长记录"，不是面向条目的笔记。

    调用场景：
    - 用户说"帮我总结一下这本书读到这里的收获"、"提炼一下这章的核心"
    - 用户读完一个章节/段落，AI 在回复中给出了系统性的归纳
    - 用户明确表达"想沉淀对这本书目前的理解"

    语义边界：summary 是面向"一本书"的整段归纳，写入 book.notes。
    单条思考/摘抄/感想由 add_note 负责，写入 quotes 列表。

    Args:
        user_id: 用户 ID
        content: 总结正文，必填
        book_id: 目标书籍 ID，必填。总结天然属于某本书，没有"无主总结"的概念
    """
    if not content:
        return {"ok": False, "error": "content is required"}
    conn = _get_conn()
    try:
        state = _load_state(conn, user_id)
        book = next((b for b in state.get("books", []) if b.get("id") == book_id), None)
        if not book:
            return {"ok": False, "error": f"book not found: {book_id}"}

        book["notes"] = ((book.get("notes") or "") + "\n\n" + content).strip()
        book["updatedAt"] = _now_iso()
        _save_state(conn, user_id, state)
        return _ok(state, {"updated": {"bookId": book_id}})
    except Exception as error:
        return {"ok": False, "error": str(error)}
    finally:
        conn.close()


@mcp.tool()
def question(
    user_id: str,
    content: str,
    book_id: str = "",
) -> dict[str, Any]:
    """记录一个最值得深入探究的开放问题。

    会在用户的 quotes 列表中保存一条 kind 固定为 "question" 的记录。
    每本书最多保留 1 条核心问题；同一本书再次提炼问题时会更新旧问题。
    这类记录用于沉淀开放问题，优先在书籍详情页展示。

    调用场景：
    - 用户说"这里有个问题我没想明白"、"帮我提炼一下值得思考的问题"
    - 用户要求基于当前书籍、摘抄或阅读记录提炼一个核心问题
    - AI 在当前书籍内部识别出一个"作者没回答"或"值得反驳"的核心问题
    - 如果能提炼多个问题，只选择最核心、最值得继续追问的 1 个，不要列多个候选问题

    语义边界：question 记录悬而未决的疑问（疑问句、开放命题）。
    已有的思考或观点（陈述句）由 add_note 负责。
    question 只挖掘当前书籍内部的问题；不要为了 question 主动关联其他书。

    Args:
        user_id: 用户 ID
        content: 问题正文，必填。必须是一个清晰具体的问题，不是问题列表
        book_id: 关联的书籍 ID，可选
    """
    if not content:
        return {"ok": False, "error": "content is required"}
    conn = _get_conn()
    try:
        state = _load_state(conn, user_id)
        quote = _upsert_book_question(state, book_id=book_id, content=content)
        _save_state(conn, user_id, state)
        return _ok(state, {"created": quote})
    except Exception as error:
        return {"ok": False, "error": str(error)}
    finally:
        conn.close()


@mcp.tool()
def tag(
    user_id: str,
    tags: list[str],
    book_id: str,
) -> dict[str, Any]:
    """给一本书追加标签（自动去重）。

    会把新标签合并进 book.tags（集合语义，重复的标签自动忽略），
    并更新 book.updatedAt。标签是后续检索和聚类的关键元数据。

    调用场景：
    - 用户说"给这本书打个标签"、"标记一下"
    - AI 在阅读上下文中识别出书的核心主题（如"复杂系统"、"认知科学"），
      并且用户表现出"想分类"的意图
    - 用户读完一本书想做归档分类

    Args:
        user_id: 用户 ID
        tags: 要追加的标签数组，必填，至少 1 个
        book_id: 目标书籍 ID，必填
    """
    if not tags:
        return {"ok": False, "error": "tags is required"}
    conn = _get_conn()
    try:
        state = _load_state(conn, user_id)
        book = next((b for b in state.get("books", []) if b.get("id") == book_id), None)
        if not book:
            return {"ok": False, "error": f"book not found: {book_id}"}

        existing = set(book.get("tags", []))
        existing.update(tags)
        book["tags"] = list(existing)
        book["updatedAt"] = _now_iso()
        _save_state(conn, user_id, state)
        return _ok(state, {"updated": {"bookId": book_id, "tags": book["tags"]}})
    except Exception as error:
        return {"ok": False, "error": str(error)}
    finally:
        conn.close()


@mcp.tool()
def link_thought(
    user_id: str,
    source_type: EntityType,
    source_id: str,
    target_type: EntityType,
    target_id: str,
    kind: ConnectionKind,
    thought: str,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """在两个已存在的 book/quote 之间建立一条跨实体关联。

    会在 connections 列表插入一条新关联，记录两个实体之间的语义关系。
    这是把孤立的笔记和书籍织成网状认知图谱的工具。

    调用场景：
    - 用户明确要求"建立关联"、"关联其他书"、"对比其他书"或"联系我读过的书"
    - 用户明确说"这跟我之前读的 X 很像"、"这和 Y 是对立的观点"
    - AI 在用户要求关联的上下文中，识别出当前书籍/笔记与 user_data 里另一个
      已存在的书籍/笔记之间有明确的语义关联

    不调用场景：
    - 用户只是要求提炼问题、总结当前书、解释某段摘抄时，不要主动调用本 Tool

    硬性前置条件：
    - source_id 必须是 user_data.books 或 user_data.quotes 中已存在的 id
    - target_id 同上
    - 如不满足，调用会被 Tool 内部校验拒绝

    Args:
        user_id: 用户 ID
        source_type: 来源实体类型，必须是 "book" 或 "quote"
        source_id: 来源实体 ID，必须在 user_data 中存在
        target_type: 目标实体类型，必须是 "book" 或 "quote"
        target_id: 目标实体 ID，必须在 user_data 中存在
        kind: 关联类型，必须是以下之一：
              - "异曲同工"：不同来源得出相似结论或表达相似观点
              - "引用"：A 明确引用、提及、致敬 B
              - "对比"：A 与 B 在观点、立场、风格上形成对比或对立
              - "影响"：B 在思想或方法上影响了 A
              - "延伸"：A 在 B 的基础上做了扩展或推进
        thought: 关联说明，必填。应当具体说出"为什么关联"，不要空泛
        tags: 关联本身的标签，可选
    """
    if kind not in VALID_CONNECTION_KINDS:
        return {
            "ok": False,
            "error": f"invalid kind: {kind}; must be one of {sorted(VALID_CONNECTION_KINDS)}",
        }
    if source_type not in {"book", "quote"} or target_type not in {"book", "quote"}:
        return {"ok": False, "error": "source_type and target_type must be 'book' or 'quote'"}

    conn = _get_conn()
    try:
        state = _load_state(conn, user_id)
        books = state.get("books", [])
        quotes = state.get("quotes", [])

        def _exists(kind_: str, id_: str) -> bool:
            pool = books if kind_ == "book" else quotes
            return any(item.get("id") == id_ for item in pool)

        if not _exists(source_type, source_id):
            return {"ok": False, "error": f"source {source_type} not found: {source_id}"}
        if not _exists(target_type, target_id):
            return {"ok": False, "error": f"target {target_type} not found: {target_id}"}

        connection = {
            "id": _new_id("conn"),
            "sourceType": source_type,
            "sourceId": source_id,
            "targetType": target_type,
            "targetId": target_id,
            "kind": kind,
            "thought": thought.strip(),
            "tags": tags or [],
            "createdAt": _now_iso(),
        }
        state.setdefault("connections", []).insert(0, connection)
        _save_state(conn, user_id, state)
        return _ok(state, {"created": connection})
    except Exception as error:
        return {"ok": False, "error": str(error)}
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(mcp.streamable_http_app(), host="127.0.0.1", port=8788)
