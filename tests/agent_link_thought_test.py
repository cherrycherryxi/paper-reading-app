"""
Regression tests for the link_thought agent action.

Coverage:
  - Schema validation at /api/chat stage (missing/wrong-type fields)
  - Execution at /api/agent-actions/:id/approve stage (kind enum, ID existence, state mutation)
  - Happy-path state mutation verified via load_state()
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import log_server


class LinkThoughtTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        log_server.DB_PATH = base_dir / "test.db"
        log_server.UPLOAD_DIR = base_dir / "uploads"
        log_server.init_db()

        self.conn = log_server.get_conn()
        self.user_id = "user-test"
        self.token = "token-test"
        now = log_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, "tester", "salt$digest", now),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (self.token, self.user_id, now, now),
        )
        seeded_state = {
            "books": [
                {"id": "book-1", "title": "第一本书", "author": "作者甲", "tags": [], "notes": "", "currentPage": 10, "totalPages": 200},
                {"id": "book-2", "title": "第二本书", "author": "作者乙", "tags": [], "notes": "", "currentPage": 0, "totalPages": 300},
            ],
            "sessions": [],
            "quotes": [
                {"id": "quote-1", "bookId": "book-1", "content": "这是一段摘抄内容。", "page": 42, "kind": "insight", "tags": [], "createdAt": now},
            ],
            "connections": [],
            "chatHistories": {},
        }
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(seeded_state, ensure_ascii=False), now),
        )
        self.conn.commit()
        self.conn.close()
        self.original_call_deepseek = log_server.call_deepseek

    def tearDown(self):
        log_server.call_deepseek = self.original_call_deepseek
        self.temp_dir.cleanup()

    # ── helpers ──────────────────────────────────────────────────────────────

    def request_json(self, method, path, payload=None):
        body = json.dumps(payload or {}, ensure_ascii=False).encode()
        headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "Authorization": f"Bearer {self.token}",
        }
        handler = log_server.Handler.__new__(log_server.Handler)
        handler.path = path
        handler.command = method
        handler.headers = headers
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda code: setattr(handler, "_status_code", code)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        getattr(handler, f"do_{method}")()
        return handler._status_code, json.loads(handler.wfile.getvalue().decode())

    def chat(self, message, book_id="book-1", model_output=None):
        if model_output is not None:
            raw = model_output if isinstance(model_output, str) else json.dumps(model_output, ensure_ascii=False)
            log_server.call_deepseek = lambda *a, **k: raw
        return self.request_json("POST", "/api/chat", {"message": message, "bookId": book_id})

    def approve(self, action_id):
        return self.request_json("POST", f"/api/agent-actions/{action_id}/approve")

    def load_state(self):
        conn = log_server.get_conn()
        state = log_server.load_state(conn, self.user_id)
        conn.close()
        return state

    # ── validation-layer tests (caught at /api/chat) ──────────────────────

    def test_chat_valid_link_thought_returns_pending_action(self):
        status, payload = self.chat("帮我记一下两本书的关联", model_output={
            "reply": "关联已建立。",
            "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "异曲同工", "thought": "两书都探讨系统思维。",
            }}],
        })
        self.assertEqual(status, 200)
        self.assertEqual(payload["agentStatus"], "OK")
        self.assertEqual(payload["validationStatus"], "SUCCESS")
        self.assertEqual(len(payload["actions"]), 1)
        self.assertEqual(payload["actions"][0]["type"], "link_thought")

    def test_chat_missing_thought_field_rejected(self):
        status, payload = self.chat("关联但没有 thought", model_output={
            "reply": "我试了但 thought 丢了。",
            "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "引用",
                # thought intentionally omitted
            }}],
        })
        self.assertEqual(status, 200)
        self.assertEqual(payload["agentStatus"], "DEGRADED")
        self.assertEqual(payload["validationStatus"], "FAILED")
        self.assertEqual(len(payload["actions"]), 0)

    def test_chat_missing_source_id_rejected(self):
        status, payload = self.chat("sourceId 缺失", model_output={
            "reply": "sourceId 忘了。",
            "actions": [{"type": "link_thought", "data": {
                "sourceType": "book",
                # sourceId intentionally omitted
                "targetType": "book", "targetId": "book-2",
                "kind": "延伸", "thought": "就是延伸。",
            }}],
        })
        self.assertEqual(status, 200)
        self.assertEqual(payload["validationStatus"], "FAILED")
        self.assertEqual(len(payload["actions"]), 0)

    def test_chat_wrong_type_source_type_rejected(self):
        status, payload = self.chat("sourceType 是数字", model_output={
            "reply": "类型错误。",
            "actions": [{"type": "link_thought", "data": {
                "sourceType": 42,  # must be str
                "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "影响", "thought": "这里 sourceType 是数字。",
            }}],
        })
        self.assertEqual(status, 200)
        self.assertEqual(payload["validationStatus"], "FAILED")
        self.assertEqual(len(payload["actions"]), 0)

    def test_chat_extra_field_rejected(self):
        status, payload = self.chat("多了一个字段", model_output={
            "reply": "多了字段。",
            "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "对比", "thought": "观点相反。",
                "unknownField": "应该被拒绝",
            }}],
        })
        self.assertEqual(status, 200)
        self.assertEqual(payload["validationStatus"], "FAILED")
        self.assertEqual(len(payload["actions"]), 0)

    # ── execution-layer tests (caught at /api/agent-actions/:id/approve) ──

    def test_approve_valid_book_to_book_creates_connection(self):
        _, chat_payload = self.chat("建立书籍关联", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "异曲同工", "thought": "两书都讲系统思维。",
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        status, payload = self.approve(action_id)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        connections = self.load_state().get("connections", [])
        self.assertEqual(len(connections), 1)
        conn = connections[0]
        self.assertEqual(conn["sourceId"], "book-1")
        self.assertEqual(conn["targetId"], "book-2")
        self.assertEqual(conn["kind"], "异曲同工")
        self.assertEqual(conn["thought"], "两书都讲系统思维。")

    def test_approve_with_optional_tags_saves_correctly(self):
        _, chat_payload = self.chat("带标签的关联", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "延伸", "thought": "在这个议题上延伸。",
                "tags": ["哲学", "系统"],
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        self.approve(action_id)
        conn = self.load_state()["connections"][0]
        self.assertEqual(conn["tags"], ["哲学", "系统"])

    def test_approve_quote_to_book_creates_connection(self):
        _, chat_payload = self.chat("摘抄联到书", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "quote", "sourceId": "quote-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "引用", "thought": "这段摘抄引用了另一本书的核心论点。",
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        status, payload = self.approve(action_id)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        conn = self.load_state()["connections"][0]
        self.assertEqual(conn["sourceType"], "quote")
        self.assertEqual(conn["sourceId"], "quote-1")

    def test_approve_invalid_kind_returns_error(self):
        # kind passes schema validation (it's a str) but fails at execution
        _, chat_payload = self.chat("非法 kind", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-2",
                "kind": "相似",  # not in VALID_KINDS
                "thought": "这个 kind 不合法。",
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        status, payload = self.approve(action_id)
        self.assertEqual(status, 500)
        self.assertIn("invalid connection kind", payload.get("error", ""))
        self.assertEqual(self.load_state().get("connections", []), [])

    def test_approve_nonexistent_source_book_returns_error(self):
        _, chat_payload = self.chat("来源书不存在", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-999",
                "targetType": "book", "targetId": "book-2",
                "kind": "延伸", "thought": "来源书根本不存在。",
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        status, payload = self.approve(action_id)
        self.assertEqual(status, 500)
        self.assertIn("source book not found", payload.get("error", ""))
        self.assertEqual(self.load_state().get("connections", []), [])

    def test_approve_nonexistent_target_book_returns_error(self):
        _, chat_payload = self.chat("目标书不存在", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "book", "sourceId": "book-1",
                "targetType": "book", "targetId": "book-999",
                "kind": "对比", "thought": "目标书根本不存在。",
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        status, payload = self.approve(action_id)
        self.assertEqual(status, 500)
        self.assertIn("target book not found", payload.get("error", ""))
        self.assertEqual(self.load_state().get("connections", []), [])

    def test_approve_nonexistent_source_quote_returns_error(self):
        _, chat_payload = self.chat("来源摘抄不存在", model_output={
            "reply": "好的。", "actions": [{"type": "link_thought", "data": {
                "sourceType": "quote", "sourceId": "quote-999",
                "targetType": "book", "targetId": "book-1",
                "kind": "延伸", "thought": "来源摘抄不存在。",
            }}],
        })
        action_id = chat_payload["actions"][0]["id"]
        status, payload = self.approve(action_id)
        self.assertEqual(status, 500)
        self.assertIn("source quote not found", payload.get("error", ""))


if __name__ == "__main__":
    unittest.main()
