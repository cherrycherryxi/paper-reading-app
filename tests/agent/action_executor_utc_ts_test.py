"""Regression tests for OPT-024: ActionExecutor must write UTC timestamps (ending with 'Z')."""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server

UTC_Z_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$")


def _is_utc(ts: str) -> bool:
    return bool(UTC_Z_RE.match(ts))


class ActionExecutorUtcTimestampTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.conn = app_server.get_conn()
        now = app_server.now_iso()
        self.user_id = "user-utc"
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, "utctester", "x", now),
        )
        self.base_state = {
            "books": [
                {
                    "id": "book-1",
                    "title": "Test Book",
                    "author": "Test Author",
                    "tags": [],
                    "notes": "",
                }
            ],
            "sessions": [],
            "quotes": [
                {
                    "id": "quote-existing",
                    "bookId": "book-1",
                    "content": "existing quote",
                    "tags": ["问题"],
                    "kind": "question",
                }
            ],
            "chatHistories": {},
            "connections": [],
        }
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps(self.base_state), now),
        )
        self.conn.commit()
        self.executor = app_server.ActionExecutor()

    def tearDown(self):
        try:
            self.conn.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def _approved_action(self, action_type: str, data: dict) -> dict:
        return {
            "id": "act-test",
            "type": action_type,
            "data": data,
            "status": app_server.ACTION_STATUS_APPROVED,
        }

    def _load_state(self):
        row = self.conn.execute(
            "SELECT state_json FROM user_state WHERE user_id=?", (self.user_id,)
        ).fetchone()
        return json.loads(row["state_json"])

    def test_add_note_createdAt_is_utc(self):
        action = self._approved_action("add_note", {
            "bookId": "book-1",
            "content": "a note",
            "tags": ["test"],
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        note = next(q for q in state["quotes"] if q.get("kind") == "note")
        self.assertTrue(_is_utc(note["createdAt"]), f"add_note createdAt not UTC-Z: {note['createdAt']}")

    def test_add_book_timestamps_are_utc(self):
        action = self._approved_action("add_book", {
            "title": "New Book",
            "author": "Author",
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        book = next(b for b in state["books"] if b["title"] == "New Book")
        self.assertTrue(_is_utc(book["createdAt"]), f"add_book createdAt not UTC-Z: {book['createdAt']}")
        self.assertTrue(_is_utc(book["updatedAt"]), f"add_book updatedAt not UTC-Z: {book['updatedAt']}")

    def test_summary_updatedAt_is_utc(self):
        action = self._approved_action("summary", {
            "bookId": "book-1",
            "content": "a summary",
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        book = next(b for b in state["books"] if b["id"] == "book-1")
        self.assertTrue(_is_utc(book["updatedAt"]), f"summary updatedAt not UTC-Z: {book['updatedAt']}")

    def test_tag_updatedAt_is_utc(self):
        action = self._approved_action("tag", {
            "bookId": "book-1",
            "tags": ["science"],
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        book = next(b for b in state["books"] if b["id"] == "book-1")
        self.assertTrue(_is_utc(book["updatedAt"]), f"tag updatedAt not UTC-Z: {book['updatedAt']}")

    def test_question_new_createdAt_is_utc(self):
        # No existing question for book-2 → creates a new one
        action = self._approved_action("question", {
            "bookId": "book-99-no-match",
            "content": "what is this?",
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        q = next((x for x in state["quotes"] if x.get("kind") == "question" and x.get("bookId") == "book-99-no-match"), None)
        self.assertIsNotNone(q)
        self.assertTrue(_is_utc(q["createdAt"]), f"question(new) createdAt not UTC-Z: {q['createdAt']}")

    def test_question_update_updatedAt_is_utc(self):
        # Existing question for book-1 → updates it
        action = self._approved_action("question", {
            "bookId": "book-1",
            "content": "updated question?",
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        q = next((x for x in state["quotes"] if x.get("kind") == "question" and x.get("bookId") == "book-1"), None)
        self.assertIsNotNone(q)
        self.assertTrue(_is_utc(q["updatedAt"]), f"question(update) updatedAt not UTC-Z: {q['updatedAt']}")

    def test_link_thought_createdAt_is_utc(self):
        action = self._approved_action("link_thought", {
            "sourceType": "book",
            "sourceId": "book-1",
            "targetType": "book",
            "targetId": "book-1",
            "kind": "延伸",
            "thought": "interesting link",
            "tags": [],
        })
        result = self.executor.execute_action(self.conn, self.user_id, action)
        self.assertTrue(result.success)
        state = self._load_state()
        conn_item = state["connections"][0]
        self.assertTrue(_is_utc(conn_item["createdAt"]), f"link_thought createdAt not UTC-Z: {conn_item['createdAt']}")


if __name__ == "__main__":
    unittest.main()
