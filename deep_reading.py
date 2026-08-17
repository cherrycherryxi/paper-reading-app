"""Deep-reading research runs backed by a sidecar DeepSeek Harness runtime.

The app owns authentication, persistence and proposal approval.  dsh receives
only an opaque Gateway credential and can call read-only MCP tools.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import secrets
import shutil
import sqlite3
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED"}
VALID_CONTEXT_TYPES = {"global", "book", "quote"}
MAX_QUESTION_LENGTH = 2000


def _external_runtime_launch_args() -> tuple[str, ...] | None:
    """Return an explicitly configured developer runtime without importing it into the app."""
    runtime_bin = os.getenv("DSH_RUNTIME_BIN", "").strip()
    if runtime_bin:
        binary_path = Path(runtime_bin).expanduser().resolve()
        if not binary_path.is_file():
            raise RuntimeError(f"DSH_RUNTIME_BIN 不存在：{binary_path}")
        if not os.access(binary_path, os.X_OK):
            raise RuntimeError(f"DSH_RUNTIME_BIN 不可执行：{binary_path}")
        return (str(binary_path),)
    entry = os.getenv("DSH_RUNTIME_ENTRY", "").strip()
    if not entry:
        return None
    entry_path = Path(entry).expanduser().resolve()
    if not entry_path.is_file():
        raise RuntimeError(f"DSH_RUNTIME_ENTRY 不存在：{entry_path}")
    node = os.getenv("DSH_NODE_BIN", "").strip() or shutil.which("node")
    if not node:
        raise RuntimeError("已配置 DSH_RUNTIME_ENTRY，但未找到 Node 运行时")
    return str(Path(node).expanduser().resolve()), str(entry_path)


def _mcp_discovery_grace_seconds() -> float:
    try:
        value = float(os.getenv("DSH_MCP_DISCOVERY_GRACE_SECONDS", "1.5"))
    except ValueError as exc:
        raise RuntimeError("DSH_MCP_DISCOVERY_GRACE_SECONDS 必须是数字") from exc
    if value < 0 or value > 10:
        raise RuntimeError("DSH_MCP_DISCOVERY_GRACE_SECONDS 必须在 0 到 10 之间")
    return value


def harness_capability() -> dict[str, Any]:
    if os.getenv("DEEP_READING_ENABLED", "").strip().lower() not in {"1", "true", "yes"}:
        return {"available": False, "reason": "深度共读旁路尚未由管理员启用"}
    if importlib.util.find_spec("deepseek_harness") is None:
        return {"available": False, "reason": "未安装可选的 deepseek-harness-sdk"}
    try:
        external_runtime = _external_runtime_launch_args()
        if external_runtime is None:
            from deepseek_harness_runtime import resolve_bundled_launch_args
            resolve_bundled_launch_args()
    except Exception as exc:
        return {"available": False, "reason": f"dsh runtime 不支持当前平台：{exc}"}
    if not os.getenv("DEEPSEEK_API_KEY", ""):
        return {"available": False, "reason": "未配置 DEEPSEEK_API_KEY"}
    return {"available": True, "reason": ""}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _json_object(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        preview = text[:240].replace("\n", "\\n")
        raise ValueError(f"研究结果不是有效 JSON：{preview or '[empty]'}") from exc
    if not isinstance(value, dict):
        raise ValueError("研究结果必须是 JSON 对象")
    return value


def serialize_run(row: sqlite3.Row, events: list[sqlite3.Row] | None = None) -> dict[str, Any]:
    result = json.loads(row["result_json"] or "{}")
    payload = {
        "id": row["run_id"],
        "context": {
            "type": row["context_type"],
            "bookId": row["book_id"],
            "quoteId": row["quote_id"],
        },
        "question": row["question"],
        "status": row["status"],
        "progress": {"stage": row["progress_stage"], "message": row["progress_message"]},
        "result": result,
        "error": row["error_message"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "completedAt": row["completed_at"],
    }
    if events is not None:
        payload["events"] = [
            {
                "id": event["event_id"],
                "type": event["event_type"],
                "metadata": json.loads(event["metadata"] or "{}"),
                "createdAt": event["created_at"],
            }
            for event in events
        ]
    return payload


class ResearchRunStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)

    def create(self, user_id: str, context: dict[str, Any], question: str) -> tuple[dict[str, Any], str]:
        context_type = str(context.get("type") or "global")
        if context_type not in VALID_CONTEXT_TYPES:
            raise ValueError("invalid context type")
        question = str(question or "").strip()
        if not question:
            raise ValueError("question is required")
        if len(question) > MAX_QUESTION_LENGTH:
            raise ValueError("question is too long")
        book_id = str(context.get("bookId") or "").strip()
        quote_id = str(context.get("quoteId") or "").strip()
        if context_type in {"book", "quote"} and not book_id:
            raise ValueError("bookId is required")
        if context_type == "quote" and not quote_id:
            raise ValueError("quoteId is required")

        run_id = _new_id("research")
        token = secrets.token_urlsafe(32)
        now = _now_iso()
        conn = _connect(self.db_path)
        try:
            state_row = conn.execute("SELECT state_json FROM user_state WHERE user_id = ?", (user_id,)).fetchone()
            state = json.loads(state_row["state_json"]) if state_row else {}
            if book_id and not any(str(item.get("id")) == book_id for item in state.get("books", [])):
                raise ValueError("bookId does not exist")
            if quote_id and not any(
                str(item.get("id")) == quote_id and str(item.get("bookId")) == book_id
                for item in state.get("quotes", [])
            ):
                raise ValueError("quoteId does not exist in book")
            conn.execute(
                "INSERT INTO research_runs "
                "(run_id,user_id,dsh_session_id,context_type,book_id,quote_id,question,status,"
                " progress_stage,progress_message,result_json,error_message,gateway_token_hash,"
                " cancel_requested,created_at,updated_at,completed_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (run_id, user_id, f"dsh-{run_id}", context_type, book_id, quote_id, question,
                 "CREATED", "created", "任务已创建", "{}", "", _token_hash(token), 0, now, now, ""),
            )
            self._event_conn(conn, run_id, "RUN_CREATED", {"contextType": context_type})
            conn.commit()
            row = conn.execute("SELECT * FROM research_runs WHERE run_id = ?", (run_id,)).fetchone()
            return serialize_run(row), token
        finally:
            conn.close()

    def get(self, run_id: str, user_id: str, include_events: bool = True) -> dict[str, Any] | None:
        conn = _connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT * FROM research_runs WHERE run_id = ? AND user_id = ?", (run_id, user_id)
            ).fetchone()
            if not row:
                return None
            events = None
            if include_events:
                events = conn.execute(
                    "SELECT * FROM research_run_events WHERE run_id = ? ORDER BY created_at, event_id", (run_id,)
                ).fetchall()
            return serialize_run(row, events)
        finally:
            conn.close()

    def list(self, user_id: str, context: dict[str, str] | None = None, limit: int = 30) -> list[dict[str, Any]]:
        clauses = ["user_id = ?"]
        params: list[Any] = [user_id]
        context = context or {}
        if context.get("bookId"):
            clauses.append("book_id = ?")
            params.append(context["bookId"])
        if context.get("quoteId"):
            clauses.append("quote_id = ?")
            params.append(context["quoteId"])
        params.append(max(1, min(int(limit), 100)))
        conn = _connect(self.db_path)
        try:
            rows = conn.execute(
                f"SELECT * FROM research_runs WHERE {' AND '.join(clauses)} ORDER BY created_at DESC LIMIT ?",
                params,
            ).fetchall()
            return [serialize_run(row) for row in rows]
        finally:
            conn.close()

    def cancel(self, run_id: str, user_id: str) -> dict[str, Any] | None:
        conn = _connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT * FROM research_runs WHERE run_id = ? AND user_id = ?", (run_id, user_id)
            ).fetchone()
            if not row:
                return None
            if row["status"] not in TERMINAL_STATUSES:
                now = _now_iso()
                conn.execute(
                    "UPDATE research_runs SET cancel_requested=1,status='CANCELLED',progress_stage='cancelled',"
                    " progress_message='任务已取消',updated_at=?,completed_at=? WHERE run_id=?",
                    (now, now, run_id),
                )
                self._event_conn(conn, run_id, "RUN_CANCELLED", {})
                conn.commit()
            return self.get(run_id, user_id)
        finally:
            conn.close()

    def is_cancelled(self, run_id: str) -> bool:
        """Return whether a background runner must stop before side effects."""
        conn = _connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT status, cancel_requested FROM research_runs WHERE run_id = ?", (run_id,)
            ).fetchone()
            return bool(row and (row["status"] == "CANCELLED" or row["cancel_requested"]))
        finally:
            conn.close()

    def authenticate_gateway(self, token: str) -> sqlite3.Row | None:
        if not token:
            return None
        conn = _connect(self.db_path)
        try:
            return conn.execute(
                "SELECT * FROM research_runs WHERE gateway_token_hash = ?", (_token_hash(token),)
            ).fetchone()
        finally:
            conn.close()

    def progress(self, run_id: str, stage: str, message: str, event_type: str, metadata: dict[str, Any] | None = None) -> None:
        conn = _connect(self.db_path)
        try:
            row = conn.execute("SELECT status FROM research_runs WHERE run_id = ?", (run_id,)).fetchone()
            if not row or row["status"] in TERMINAL_STATUSES:
                return
            now = _now_iso()
            conn.execute(
                "UPDATE research_runs SET status='RUNNING',progress_stage=?,progress_message=?,updated_at=? WHERE run_id=?",
                (stage, message, now, run_id),
            )
            self._event_conn(conn, run_id, event_type, metadata or {})
            conn.commit()
        finally:
            conn.close()

    def complete(self, run_id: str, result: dict[str, Any]) -> None:
        conn = _connect(self.db_path)
        try:
            row = conn.execute("SELECT status FROM research_runs WHERE run_id = ?", (run_id,)).fetchone()
            if not row or row["status"] == "CANCELLED":
                return
            now = _now_iso()
            conn.execute(
                "UPDATE research_runs SET status='COMPLETED',progress_stage='completed',"
                " progress_message='深度共读已完成',result_json=?,updated_at=?,completed_at=? WHERE run_id=?",
                (json.dumps(result, ensure_ascii=False), now, now, run_id),
            )
            self._event_conn(conn, run_id, "RESULT_COMPLETED", {})
            conn.commit()
        finally:
            conn.close()

    def fail(self, run_id: str, error: str) -> None:
        conn = _connect(self.db_path)
        try:
            row = conn.execute("SELECT status FROM research_runs WHERE run_id = ?", (run_id,)).fetchone()
            if not row or row["status"] == "CANCELLED":
                return
            now = _now_iso()
            conn.execute(
                "UPDATE research_runs SET status='FAILED',progress_stage='failed',progress_message='研究失败',"
                " error_message=?,updated_at=?,completed_at=? WHERE run_id=?",
                (str(error)[:1000], now, now, run_id),
            )
            self._event_conn(conn, run_id, "RUN_FAILED", {"error": str(error)[:300]})
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def _event_conn(conn: sqlite3.Connection, run_id: str, event_type: str, metadata: dict[str, Any]) -> None:
        conn.execute(
            "INSERT INTO research_run_events(event_id,run_id,event_type,metadata,created_at) VALUES(?,?,?,?,?)",
            (_new_id("research-event"), run_id, event_type, json.dumps(metadata, ensure_ascii=False), _now_iso()),
        )


def build_research_prompt(run: dict[str, Any]) -> str:
    context = run["context"]
    return f"""你是 paper-reading-app 的高级阅读研究员。请只通过 paper-reading Gateway 的只读工具取证。

研究问题：{run['question']}
上下文类型：{context['type']}
bookId：{context['bookId']}
quoteId：{context['quoteId']}

要求：
1. 最终回答前必须通过原生 function calling 调用 `mcp__paper-reading__get_reading_context`，参数使用上面的 contextType、bookId、quoteId。不得把 `<tool_calls>`、`<invoke>` 或工具参数写进普通文本。
2. 随后必须至少调用一次 `mcp__paper-reading__search_quotes`；需要扩展取证时再调用 list_books、get_connections、get_confirmed_memories 或 get_reading_timeline。
3. 只要工具返回了摘抄，就必须在 evidenceMap 中引用其真实 id。工具没有返回证据时，不得给出实质性研究结论，只能说明证据不足。
4. 明确区分“用户原始记录”与“你的推断”，不得虚构书中内容。
5. 最终只输出 JSON，不要 Markdown，顶层结构为：
{{"summary":"结论", "evidenceMap":[{{"relation":"support|challenge|extend", "claim":"判断", "evidenceIds":["证据ID"], "reason":"解释"}}], "openQuestions":["待追问"], "proposals":[]}}
6. evidenceMap 中每项至少包含一个真实证据 ID；proposals 最多 3 条，只是待用户审批的建议，不能自行写入。
7. proposal 只能使用以下 data 结构，不得创造字段或英文关系值：
   - summary：{{"type":"summary","data":{{"bookId":"书ID","content":"总结"}},"reason":"原因","evidenceIds":["证据ID"]}}
   - question：{{"type":"question","data":{{"bookId":"书ID","content":"问题"}},"reason":"原因","evidenceIds":["证据ID"]}}
   - tag：{{"type":"tag","data":{{"bookId":"书ID","tags":["标签"]}},"reason":"原因","evidenceIds":["证据ID"]}}
   - add_note：{{"type":"add_note","data":{{"bookId":"书ID","content":"笔记","tags":["标签"]}},"reason":"原因","evidenceIds":["证据ID"]}}
   - link_thought：{{"type":"link_thought","data":{{"sourceType":"book|quote","sourceId":"实体ID","targetType":"book|quote","targetId":"实体ID","kind":"异曲同工|引用|对比|影响|延伸","thought":"关联说明"}},"reason":"原因","evidenceIds":["证据ID"]}}
"""


class DeepReadingRunner:
    # app_server creates a lightweight runner facade for each request. Keep the
    # active harness registry on the class so a later cancel request can reach
    # the thread that originally started the run.
    _active_harnesses: dict[str, Any] = {}
    _active_harnesses_lock = threading.Lock()

    def __init__(
        self,
        db_path: Path,
        cordis_path: Path,
        gateway_url: str,
        on_complete: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]] | None = None,
    ):
        self.store = ResearchRunStore(db_path)
        self.cordis_path = Path(cordis_path)
        self.gateway_url = gateway_url
        self.on_complete = on_complete

    def start(self, run: dict[str, Any], token: str) -> None:
        threading.Thread(target=self._run, args=(run, token), daemon=True, name=f"dsh-{run['id']}").start()

    def cancel(self, run_id: str) -> None:
        """Best-effort interrupt for an active harness; persistence is owned by the store."""
        with self._active_harnesses_lock:
            harness = self._active_harnesses.get(run_id)
        if harness is None:
            return
        try:
            harness.close()
        except Exception:
            # Closing is only an acceleration. The status checks in _run still
            # guarantee that a cancelled job can never persist proposals.
            pass

    @classmethod
    def _register_active_harness(cls, run_id: str, harness: Any) -> None:
        with cls._active_harnesses_lock:
            cls._active_harnesses[run_id] = harness

    @classmethod
    def _unregister_active_harness(cls, run_id: str, harness: Any) -> None:
        with cls._active_harnesses_lock:
            if cls._active_harnesses.get(run_id) is harness:
                cls._active_harnesses.pop(run_id, None)

    def _run(self, run: dict[str, Any], token: str) -> None:
        run_id = run["id"]
        try:
            if self.store.is_cancelled(run_id):
                return
            self.store.progress(run_id, "starting", "正在启动高级推理环境", "HARNESS_STARTING")
            try:
                from deepseek_harness import DeepSeekHarness
            except ImportError as exc:
                raise RuntimeError("未安装 deepseek-harness-sdk，深度共读环境尚未就绪") from exc
            if not os.getenv("DEEPSEEK_API_KEY", ""):
                raise RuntimeError("未配置 DEEPSEEK_API_KEY")

            self.store.progress(run_id, "context", "正在读取你的阅读上下文", "CONTEXT_LOADING")
            with tempfile.TemporaryDirectory(prefix="paper-reading-dsh-") as session_root:
                with DeepSeekHarness(
                        provider="deepseek-official",
                        model=os.getenv("DEEPSEEK_RESEARCH_MODEL", os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro")),
                        max_tokens=int(os.getenv("DEEPSEEK_RESEARCH_MAX_TOKENS", "8192")),
                        cwd=session_root,
                        session_root=session_root,
                        cordis=str(self.cordis_path),
                        launch_args_override=_external_runtime_launch_args(),
                        env={
                            "PAPER_READING_GATEWAY_TOKEN": token,
                            "PAPER_READING_GATEWAY_URL": self.gateway_url,
                        },
                    ) as harness:
                    self._register_active_harness(run_id, harness)
                    try:
                        # dsh v0.1 exposes JSONRPC readiness before async MCP discovery
                        # settles. A bounded grace window plus cordis.yml toolOrder's
                        # unknown-tool guard prevents the first turn from silently
                        # running with an empty registry.
                        discovery_grace = _mcp_discovery_grace_seconds()
                        if discovery_grace:
                            time.sleep(discovery_grace)
                        if self.store.is_cancelled(run_id):
                            return
                        self.store.progress(run_id, "research", "正在比对支持、反驳与延伸证据", "RESEARCH_STARTED")
                        run_result = harness.run(build_research_prompt(run), session_id=f"dsh-{run_id}")
                    finally:
                        self._unregister_active_harness(run_id, harness)

            if self.store.is_cancelled(run_id):
                return

            if not str(run_result.final_response or "").strip():
                event_types = [str(event.get("type") or "") for event in run_result.events[-8:]]
                terminal_data = next(
                    (
                        event.get("data")
                        for event in reversed(run_result.events)
                        if event.get("type") in {"turn/end", "step/end"}
                        and isinstance(event.get("data"), dict)
                    ),
                    {},
                )
                diagnostic = json.dumps(terminal_data, ensure_ascii=False)[:400]
                raise RuntimeError(
                    "dsh 未返回最终文本"
                    f"（finish_reason={run_result.finish_reason or 'unknown'}；"
                    f"最近事件={','.join(event_types) or 'none'}；诊断={diagnostic or 'none'}）"
                )
            result = _json_object(run_result.final_response)
            result.setdefault("summary", "")
            result.setdefault("evidenceMap", [])
            result.setdefault("openQuestions", [])
            proposals = result.get("proposals") if isinstance(result.get("proposals"), list) else []
            result["proposals"] = proposals[:3]
            if self.store.is_cancelled(run_id):
                return
            if self.on_complete:
                result = self.on_complete(run, result)
            if self.store.is_cancelled(run_id):
                return
            self.store.complete(run_id, result)
        except Exception as exc:
            self.store.fail(run_id, str(exc))
