"""Regression tests for session token rolling expiry (P0 commercialization)."""
import json
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import app_server


def _iso_days_ago(days):
    return (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).isoformat() + "Z"


class SessionExpiryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        # Tight lifetime for test speed
        self._orig_lifetime = app_server.SESSION_LIFETIME_DAYS
        app_server.SESSION_LIFETIME_DAYS = 30
        app_server.init_db()

        self.conn = app_server.get_conn()
        self.user_id = "user-test"
        self.username = "tester"
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, self.username, "salt$digest", now),
        )

    def tearDown(self):
        app_server.SESSION_LIFETIME_DAYS = self._orig_lifetime
        try:
            self.conn.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def _insert_session(self, token, last_seen_iso):
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            (token, self.user_id, last_seen_iso, last_seen_iso),
        )
        self.conn.commit()

    def test_fresh_token_resolves_to_user(self):
        self._insert_session("fresh", app_server.now_iso())
        row = app_server.resolve_user_from_token(self.conn, "fresh")
        self.assertIsNotNone(row)
        self.assertEqual(row["id"], self.user_id)

    def test_recently_used_token_within_lifetime_resolves(self):
        # 5 days ago, well within 30-day lifetime
        self._insert_session("recent", _iso_days_ago(5))
        row = app_server.resolve_user_from_token(self.conn, "recent")
        self.assertIsNotNone(row, "token used 5 days ago must still resolve")
        # last_seen_at should have been bumped to now
        ls = self.conn.execute(
            "SELECT last_seen_at FROM sessions WHERE token=?", ("recent",)
        ).fetchone()
        self.assertIsNotNone(ls)
        delta = time.time() - app_server._parse_iso_to_epoch(ls["last_seen_at"])
        self.assertLess(delta, 5, "last_seen_at should bump to roughly now on use")

    def test_stale_token_past_lifetime_is_rejected_and_deleted(self):
        # 31 days ago, just past 30-day lifetime
        self._insert_session("stale", _iso_days_ago(31))
        row = app_server.resolve_user_from_token(self.conn, "stale")
        self.assertIsNone(row, "stale token must not resolve")
        remaining = self.conn.execute(
            "SELECT 1 FROM sessions WHERE token=?", ("stale",)
        ).fetchall()
        self.assertEqual(len(remaining), 0,
                         "stale token row must be deleted after rejection")

    def test_nonexistent_token_returns_none_without_side_effects(self):
        row = app_server.resolve_user_from_token(self.conn, "never-existed")
        self.assertIsNone(row)

    def test_empty_token_returns_none(self):
        self.assertIsNone(app_server.resolve_user_from_token(self.conn, ""))
        self.assertIsNone(app_server.resolve_user_from_token(self.conn, None))

    def test_gc_expired_sessions_removes_only_stale_rows(self):
        self._insert_session("fresh", _iso_days_ago(1))
        self._insert_session("stale-1", _iso_days_ago(40))
        self._insert_session("stale-2", _iso_days_ago(90))
        deleted = app_server.gc_expired_sessions(self.conn, lifetime_days=30)
        self.assertEqual(deleted, 2)
        rows = self.conn.execute("SELECT token FROM sessions ORDER BY token").fetchall()
        self.assertEqual([r["token"] for r in rows], ["fresh"])

    def test_logout_all_revokes_every_session_for_user(self):
        token1 = "tk-1"
        token2 = "tk-2"
        token3 = "tk-3-other-user"
        self._insert_session(token1, app_server.now_iso())
        self._insert_session(token2, app_server.now_iso())
        # Insert session for another user
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-other", "bob", "x", app_server.now_iso()),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            (token3, "user-other", app_server.now_iso(), app_server.now_iso()),
        )
        self.conn.commit()
        self.conn.close()

        body = json.dumps({}).encode("utf-8")
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/logout-all"
        handler.command = "POST"
        handler.headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "Authorization": f"Bearer {token1}",
        }
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda c: setattr(handler, "_status_code", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        self.assertEqual(handler._status_code, 200)
        payload = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["revoked"], 2,
                         "should revoke both of this user's sessions")

        conn = app_server.get_conn()
        remaining = conn.execute(
            "SELECT user_id FROM sessions ORDER BY user_id"
        ).fetchall()
        conn.close()
        self.assertEqual([r["user_id"] for r in remaining], ["user-other"],
                         "other users' sessions must remain")

    def test_stale_token_on_api_call_returns_401(self):
        # Session expired 35 days ago
        self._insert_session("stale-tok", _iso_days_ago(35))
        self.conn.close()

        body = b"{}"
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/session"
        handler.command = "GET"
        handler.headers = {
            "Content-Type": "application/json",
            "Content-Length": "0",
            "Authorization": "Bearer stale-tok",
        }
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda c: setattr(handler, "_status_code", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_GET()
        self.assertEqual(handler._status_code, 401,
                         "stale token must produce 401 so client clears auth")


if __name__ == "__main__":
    unittest.main()
