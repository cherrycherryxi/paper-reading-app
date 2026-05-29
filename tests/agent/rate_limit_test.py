"""Regression tests for AI endpoint rate limiting (P0 commercialization)."""
import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class RateLimitTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        # Override limits to tight values for testing
        self._orig_hour = app_server.RATE_LIMIT_OVERRIDE_HOUR
        self._orig_day = app_server.RATE_LIMIT_OVERRIDE_DAY
        app_server.RATE_LIMIT_OVERRIDE_HOUR = "2"
        app_server.RATE_LIMIT_OVERRIDE_DAY = "3"
        app_server.init_db()

        self.conn = app_server.get_conn()
        self.user_id = "user-test"
        self.username = "tester"
        self.token = "token-test"
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, self.username, "salt$digest", now),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (self.token, self.user_id, now, now),
        )
        seeded_state = {"books": [{"id": "book-1", "title": "Test", "author": "A"}],
                        "sessions": [], "quotes": [], "chatHistories": {}}
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(seeded_state), now),
        )
        self.conn.commit()
        self.conn.close()
        self._orig_call_deepseek = app_server.call_deepseek
        app_server.call_deepseek = lambda *a, **k: json.dumps({"reply": "ok", "actions": []})

    def tearDown(self):
        app_server.call_deepseek = self._orig_call_deepseek
        app_server.RATE_LIMIT_OVERRIDE_HOUR = self._orig_hour
        app_server.RATE_LIMIT_OVERRIDE_DAY = self._orig_day
        self.temp_dir.cleanup()

    def _request(self, method, path, payload=None, token=None):
        body = json.dumps(payload or {}).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = path
        handler.command = method
        handler.headers = headers
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler._sent_headers = {}

        def send_response(code):
            handler._status_code = code

        def send_header(name, value):
            handler._sent_headers[name] = str(value)

        handler.send_response = send_response
        handler.send_header = send_header
        handler.end_headers = lambda: None
        if method == "POST":
            handler.do_POST()
        elif method == "GET":
            handler.do_GET()
        body_text = handler.wfile.getvalue().decode("utf-8")
        try:
            body_json = json.loads(body_text)
        except Exception:
            body_json = {"_raw": body_text}
        return handler._status_code, body_json, handler._sent_headers

    def test_chat_endpoint_blocks_after_hour_limit_exceeded(self):
        for i in range(2):
            status, _, _ = self._request(
                "POST", "/api/chat",
                {"message": f"hi {i}", "bookId": "book-1"}, token=self.token,
            )
            self.assertEqual(status, 200, f"request {i+1} should pass, got {status}")
        status, body, headers = self._request(
            "POST", "/api/chat",
            {"message": "blocked", "bookId": "book-1"}, token=self.token,
        )
        self.assertEqual(status, 429)
        self.assertEqual(body["error"], "rate_limited")
        self.assertEqual(body["reason"], "hour_limit")
        self.assertIn("retry_after_seconds", body)
        self.assertGreater(int(body["retry_after_seconds"]), 0)
        self.assertIn("Retry-After", headers)
        self.assertEqual(body["usage"]["hour_count"], 2)
        self.assertEqual(body["usage"]["hour_limit"], 2)

    def test_chat_endpoint_blocked_request_does_not_increment_counter(self):
        for _ in range(2):
            self._request("POST", "/api/chat",
                          {"message": "hi", "bookId": "book-1"}, token=self.token)
        for _ in range(3):
            status, body, _ = self._request(
                "POST", "/api/chat",
                {"message": "blocked", "bookId": "book-1"}, token=self.token,
            )
            self.assertEqual(status, 429)
            self.assertEqual(body["usage"]["hour_count"], 2,
                             "blocked requests must not increment the counter")

    def test_ocr_and_chat_have_independent_counters(self):
        for _ in range(2):
            self._request("POST", "/api/chat",
                          {"message": "hi", "bookId": "book-1"}, token=self.token)
        # Chat is exhausted, but OCR should still work.
        status, body, _ = self._request(
            "POST", "/api/ocr",
            {"imageDataUrl": ""}, token=self.token,
        )
        # We send empty data_url to trip 400 *after* rate-limit passes — that means
        # the OCR endpoint accepted the request (status != 429).
        self.assertNotEqual(status, 429,
                            f"OCR should not be blocked by chat counter, got {status}")

    def test_different_users_have_independent_counters(self):
        # Create second user + session
        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-2", "bob", "x", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            ("token-2", "user-2", now, now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            ("user-2", json.dumps({"books": [{"id": "b2", "title": "x"}],
                                   "sessions": [], "quotes": [], "chatHistories": {}}), now),
        )
        conn.commit()
        conn.close()

        for _ in range(2):
            self._request("POST", "/api/chat",
                          {"message": "hi", "bookId": "book-1"}, token=self.token)
        # User 1 is blocked
        status1, _, _ = self._request("POST", "/api/chat",
                                      {"message": "x", "bookId": "book-1"}, token=self.token)
        self.assertEqual(status1, 429)
        # User 2 should still be free
        status2, _, _ = self._request("POST", "/api/chat",
                                      {"message": "x", "bookId": "b2"}, token="token-2")
        self.assertEqual(status2, 200)

    def test_rate_limit_table_created(self):
        conn = app_server.get_conn()
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limit_counters'"
        ).fetchall()
        conn.close()
        self.assertEqual(len(rows), 1, "rate_limit_counters table must exist")

    def test_gc_old_rate_limit_rows_removes_only_old_rows(self):
        conn = app_server.get_conn()
        # Insert a fresh row + an old row
        conn.execute(
            "INSERT INTO rate_limit_counters (user_id, endpoint, window_key, count, updated_at) VALUES (?,?,?,?,?)",
            ("u-old", "chat", "20200101", 5, "2020-01-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO rate_limit_counters (user_id, endpoint, window_key, count, updated_at) VALUES (?,?,?,?,?)",
            ("u-new", "chat", "20990101", 1, app_server.now_iso()),
        )
        conn.commit()
        deleted = app_server.gc_old_rate_limit_rows(conn, keep_days=3)
        self.assertEqual(deleted, 1)
        remaining = conn.execute("SELECT user_id FROM rate_limit_counters WHERE user_id IN ('u-old','u-new')").fetchall()
        conn.close()
        self.assertEqual([r["user_id"] for r in remaining], ["u-new"])


if __name__ == "__main__":
    unittest.main()
