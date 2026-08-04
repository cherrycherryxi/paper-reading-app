"""Regression tests for OPT-143: HTTP agent link_thought deduplication."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server


class ActionExecutorLinkThoughtTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.conn = app_server.get_conn()
        self.user_id = "user-link-thought"
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, "linker", "x", now),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (
                self.user_id,
                json.dumps({
                    "books": [
                        {"id": "book-1", "title": "A"},
                        {"id": "book-2", "title": "B"},
                    ],
                    "sessions": [],
                    "quotes": [],
                    "chatHistories": {},
                    "connections": [],
                }),
                now,
            ),
        )
        self.conn.commit()
        self.executor = app_server.ActionExecutor()

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def _action(self, source_id="book-1", target_id="book-2", kind="引用"):
        return {
            "id": "act-link",
            "type": "link_thought",
            "data": {
                "sourceType": "book",
                "sourceId": source_id,
                "targetType": "book",
                "targetId": target_id,
                "kind": kind,
                "thought": "关联说明",
                "tags": [],
            },
            "status": app_server.ACTION_STATUS_APPROVED,
        }

    def _connections(self):
        return app_server.load_state(self.conn, self.user_id)["connections"]

    def test_repeated_pair_is_skipped_even_when_kind_changes(self):
        first = self.executor.execute_action(self.conn, self.user_id, self._action())
        second = self.executor.execute_action(
            self.conn,
            self.user_id,
            self._action(kind="异曲同工"),
        )

        self.assertTrue(first.success)
        self.assertFalse(first.skipped)
        self.assertTrue(second.success)
        self.assertTrue(second.skipped)
        self.assertEqual(second.reason, "connection already exists")
        self.assertEqual(len(self._connections()), 1)

    def test_reverse_direction_remains_a_distinct_relationship(self):
        first = self.executor.execute_action(self.conn, self.user_id, self._action())
        reverse = self.executor.execute_action(
            self.conn,
            self.user_id,
            self._action(source_id="book-2", target_id="book-1", kind="影响"),
        )

        self.assertTrue(first.success)
        self.assertTrue(reverse.success)
        self.assertFalse(reverse.skipped)
        self.assertEqual(len(self._connections()), 2)


if __name__ == "__main__":
    unittest.main()
