"""Regression tests for free/Plus plan tiers (P2 commercialization)."""
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path

import app_server


class PlanTierTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.conn = app_server.get_conn()
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-free", "freebee", "x", now),
        )
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, plan, created_at) VALUES (?,?,?,?,?)",
            ("user-plus", "plussie", "x", "plus", now),
        )
        # Expired plus user
        past = (datetime.now() - timedelta(days=1)).isoformat()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, plan, plan_expires_at, created_at) VALUES (?,?,?,?,?,?)",
            ("user-expired-plus", "lapsed", "x", "plus", past, now),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            ("tok-free", "user-free", now, now),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            ("tok-plus", "user-plus", now, now),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            ("user-free", json.dumps({"books": [], "sessions": [], "quotes": [], "chatHistories": {}}), now),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            ("user-plus", json.dumps({"books": [], "sessions": [], "quotes": [], "chatHistories": {}}), now),
        )
        self.conn.commit()

    def tearDown(self):
        try:
            self.conn.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def test_resolve_user_plan_defaults_to_free(self):
        self.assertEqual(app_server._resolve_user_plan(self.conn, "user-free"), "free")

    def test_resolve_user_plan_returns_plus_for_paid(self):
        self.assertEqual(app_server._resolve_user_plan(self.conn, "user-plus"), "plus")

    def test_resolve_user_plan_reverts_to_free_when_plus_expired(self):
        self.assertEqual(
            app_server._resolve_user_plan(self.conn, "user-expired-plus"),
            "free",
            "expired plus subscription must revert to free",
        )

    def test_resolve_user_plan_unknown_user_is_free(self):
        self.assertEqual(app_server._resolve_user_plan(self.conn, "nope"), "free")

    def test_rate_limit_for_returns_plus_limits_for_plus_plan(self):
        free_chat = app_server._rate_limit_for("chat", "free")
        plus_chat = app_server._rate_limit_for("chat", "plus")
        self.assertGreater(
            plus_chat["hour"], free_chat["hour"],
            "Plus chat hour limit must exceed free",
        )
        self.assertGreater(
            plus_chat["day"], free_chat["day"],
            "Plus chat day limit must exceed free",
        )

    def test_rate_limit_check_uses_callers_plan(self):
        # Free user hits the hour limit faster than Plus user
        free_limit = app_server._rate_limit_for("chat", "free")["hour"]
        for _ in range(free_limit):
            ok, _, _, _ = app_server.check_and_record_rate_limit(
                self.conn, "user-free", "chat"
            )
            self.assertTrue(ok)
        ok, _, reason, _ = app_server.check_and_record_rate_limit(
            self.conn, "user-free", "chat"
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "hour_limit")
        # Plus user with the same number of requests should still be fine
        for _ in range(free_limit):
            ok, _, _, _ = app_server.check_and_record_rate_limit(
                self.conn, "user-plus", "chat"
            )
            self.assertTrue(ok, "Plus user should still pass after free-limit number of requests")

    def test_get_account_plan_returns_full_payload(self):
        # Hit the chat endpoint once to populate counters
        app_server.check_and_record_rate_limit(self.conn, "user-free", "chat")
        self.conn.close()

        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/account/plan"
        handler.command = "GET"
        handler.headers = {
            "Authorization": "Bearer tok-free",
            "Content-Length": "0",
        }
        handler.rfile = BytesIO(b"")
        handler.wfile = BytesIO()
        handler._status = None
        handler.send_response = lambda c: setattr(handler, "_status", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_GET()
        self.assertEqual(handler._status, 200)
        body = json.loads(handler.wfile.getvalue().decode())
        self.assertEqual(body["plan"], "free")
        self.assertEqual(body["planLabel"], "免费版")
        self.assertEqual(body["bookCap"], 10)
        self.assertEqual(body["bookCount"], 0)
        self.assertIn("chat", body["usage"])
        self.assertIn("ocr", body["usage"])
        self.assertEqual(body["usage"]["chat"]["hour_count"], 1)

    def test_agent_add_book_action_enforces_book_cap_on_free_plan(self):
        # Seed 10 books for free user
        state = {"books": [{"id": f"b{i}", "title": f"book{i}"} for i in range(10)],
                 "sessions": [], "quotes": [], "chatHistories": {}}
        self.conn.execute(
            "UPDATE user_state SET state_json = ? WHERE user_id = ?",
            (json.dumps(state), "user-free"),
        )
        self.conn.commit()
        # Try to execute an approved add_book action
        action = {
            "id": "act-1",
            "type": "add_book",
            "data": {"title": "11th book", "author": "X"},
            "status": app_server.ACTION_STATUS_APPROVED,
        }
        executor = app_server.ActionExecutor()
        result = executor.execute_action(self.conn, "user-free", action)
        self.assertFalse(result.success, "free user at book cap must be rejected")
        self.assertIn("免费版书架上限", result.error_message)
        # State must be unchanged
        row = self.conn.execute(
            "SELECT state_json FROM user_state WHERE user_id='user-free'"
        ).fetchone()
        self.assertEqual(len(json.loads(row["state_json"])["books"]), 10)

    def test_agent_add_book_action_succeeds_for_plus_at_high_count(self):
        # Plus has book_cap=0 (unlimited)
        many_books = [{"id": f"b{i}", "title": f"book{i}"} for i in range(50)]
        state = {"books": many_books, "sessions": [], "quotes": [], "chatHistories": {}}
        self.conn.execute(
            "UPDATE user_state SET state_json = ? WHERE user_id = ?",
            (json.dumps(state), "user-plus"),
        )
        self.conn.commit()
        action = {
            "id": "act-1",
            "type": "add_book",
            "data": {"title": "51st", "author": "X"},
            "status": app_server.ACTION_STATUS_APPROVED,
        }
        result = app_server.ActionExecutor().execute_action(self.conn, "user-plus", action)
        self.assertTrue(result.success, "Plus user must not be capped")


if __name__ == "__main__":
    unittest.main()
