"""Regression tests for account data export + deletion (P0 GDPR/PIPL compliance)."""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class AccountExportDeleteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        self.user_id = "user-test"
        self.username = "tester"
        self.token = "token-test"
        now = app_server.now_iso()
        conn = app_server.get_conn()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, self.username, "salt$digest", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            (self.token, self.user_id, now, now),
        )
        seeded_state = {
            "books": [{"id": "book-1", "title": "T", "author": "A"}],
            "sessions": [{"id": "s-1", "bookId": "book-1", "minutes": 30}],
            "quotes": [{"id": "q-1", "bookId": "book-1", "content": "foo"}],
            "chatHistories": {"book-1": [{"role": "user", "content": "hi"}]},
        }
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps(seeded_state), now),
        )
        # Seed some agent + model_log rows
        conn.execute(
            "INSERT INTO model_logs (id, user_id, username, type, model, prompt, input, output, error, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            ("log-1", self.user_id, self.username, "chat", "deepseek", "p", "i", "o", "", now),
        )
        conn.execute(
            "INSERT INTO agent_traces (trace_id, user_id, request_type, status, parse_status, validation_status, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            ("trace-1", self.user_id, "chat", "OK", "SUCCESS", "SUCCESS", now, now),
        )
        conn.execute(
            "INSERT INTO agent_actions (action_id, trace_id, user_id, action_type, action_data, status, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            ("act-1", "trace-1", self.user_id, "add_note", "{}", "EXECUTED", now, now),
        )
        conn.execute(
            "INSERT INTO agent_trace_events (event_id, trace_id, event_type, metadata, created_at) "
            "VALUES (?,?,?,?,?)",
            ("evt-1", "trace-1", "REQUEST_RECEIVED", "{}", now),
        )
        # Seed an upload file
        upload_dir = app_server.UPLOAD_DIR / self.user_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        (upload_dir / "test.jpg").write_bytes(b"\xff\xd8\xff\xd9")
        # Seed rate_limit counter
        conn.execute(
            "INSERT INTO rate_limit_counters (user_id, endpoint, window_key, count, updated_at) "
            "VALUES (?,?,?,?,?)",
            (self.user_id, "chat", "20260529T07", 5, now),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
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
        handler.send_response = lambda c: setattr(handler, "_status_code", c)
        handler.send_header = lambda n, v: handler._sent_headers.__setitem__(n, str(v))
        handler.end_headers = lambda: None
        if method == "GET":
            handler.do_GET()
        elif method == "DELETE":
            handler.do_DELETE()
        elif method == "POST":
            handler.do_POST()
        body_text = handler.wfile.getvalue().decode("utf-8")
        try:
            body_json = json.loads(body_text)
        except Exception:
            body_json = {"_raw": body_text}
        return handler._status_code, body_json, handler._sent_headers

    def test_export_returns_full_account_payload(self):
        status, payload, headers = self._request("GET", "/api/account/export", token=self.token)
        self.assertEqual(status, 200)
        self.assertIn("exportFormat", payload)
        self.assertEqual(payload["user"]["username"], self.username)
        self.assertEqual(len(payload["state"]["books"]), 1)
        self.assertEqual(payload["state"]["books"][0]["title"], "T")
        self.assertEqual(len(payload["modelLogs"]), 1)
        self.assertEqual(len(payload["agentTraces"]), 1)
        self.assertEqual(len(payload["agentActions"]), 1)
        # File manifest
        self.assertTrue(any(f["name"] == "test.jpg" for f in payload["uploadedFiles"]))
        # Headers
        cd = headers.get("Content-Disposition", "")
        self.assertIn("attachment", cd)
        self.assertIn(self.username, cd)

    def test_export_requires_auth(self):
        status, _, _ = self._request("GET", "/api/account/export", token=None)
        self.assertEqual(status, 401)

    def test_delete_without_confirm_username_returns_400(self):
        status, payload, _ = self._request("DELETE", "/api/account", token=self.token)
        self.assertEqual(status, 400)
        self.assertIn("confirmUsername", payload["error"])

    def test_delete_with_wrong_confirm_username_returns_400(self):
        status, payload, _ = self._request(
            "DELETE", "/api/account", {"confirmUsername": "wrong"}, token=self.token,
        )
        self.assertEqual(status, 400)

    def test_delete_purges_every_table_and_files(self):
        status, payload, _ = self._request(
            "DELETE", "/api/account",
            {"confirmUsername": self.username}, token=self.token,
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["deleted"])

        conn = app_server.get_conn()
        tables = [
            "users", "sessions", "user_state", "model_logs",
            "agent_traces", "agent_actions", "agent_trace_events",
            "agent_metrics", "rate_limit_counters",
        ]
        for tbl in tables:
            col = "id" if tbl == "users" else "user_id"
            if tbl == "agent_trace_events":
                rows = conn.execute(
                    "SELECT 1 FROM agent_trace_events WHERE event_id = 'evt-1'"
                ).fetchall()
            else:
                rows = conn.execute(
                    f"SELECT 1 FROM {tbl} WHERE {col} = ?", (self.user_id,)
                ).fetchall()
            self.assertEqual(
                len(rows), 0,
                f"table {tbl} still has rows for the deleted user",
            )
        conn.close()
        # Uploads dir should be gone
        self.assertFalse((app_server.UPLOAD_DIR / self.user_id).exists(),
                         "user's uploads directory must be removed")

    def test_delete_does_not_touch_other_users(self):
        # Add another user
        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-other", "bob", "x", now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            ("user-other", json.dumps({"books": []}), now),
        )
        conn.commit()
        conn.close()
        status, _, _ = self._request(
            "DELETE", "/api/account",
            {"confirmUsername": self.username}, token=self.token,
        )
        self.assertEqual(status, 200)
        conn = app_server.get_conn()
        other = conn.execute("SELECT id FROM users WHERE id='user-other'").fetchall()
        conn.close()
        self.assertEqual(len(other), 1, "other users must remain")


if __name__ == "__main__":
    unittest.main()
