"""Regression tests for admin-username gating of operator UI."""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class AdminGatingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self._orig_admins = app_server.ADMIN_USERNAMES
        app_server.ADMIN_USERNAMES = "alice,bob"
        # Seed two users — alice is admin, eve is not.
        conn = app_server.get_conn()
        now = app_server.now_iso()
        for username, token in [("alice", "tok-alice"), ("eve", "tok-eve")]:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
                (f"user-{username}", username, "x", now),
            )
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
                (token, f"user-{username}", now, now),
            )
            conn.execute(
                "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
                (f"user-{username}", json.dumps({"books": []}), now),
            )
        conn.commit()
        conn.close()

    def tearDown(self):
        app_server.ADMIN_USERNAMES = self._orig_admins
        self.temp_dir.cleanup()

    def _get_session(self, token):
        h = app_server.Handler.__new__(app_server.Handler)
        h.path = "/api/session"
        h.command = "GET"
        h.headers = {"Authorization": f"Bearer {token}", "Content-Length": "0"}
        h.rfile = BytesIO(b"")
        h.wfile = BytesIO()
        h._status = None
        h.send_response = lambda c: setattr(h, "_status", c)
        h.send_header = lambda *a, **k: None
        h.end_headers = lambda: None
        h.do_GET()
        return json.loads(h.wfile.getvalue().decode())

    def test_is_admin_username_matches_listed_users(self):
        self.assertTrue(app_server.is_admin_username("alice"))
        self.assertTrue(app_server.is_admin_username("bob"))
        self.assertFalse(app_server.is_admin_username("eve"))
        self.assertFalse(app_server.is_admin_username(""))

    def test_is_admin_username_empty_env_means_no_admins(self):
        orig = app_server.ADMIN_USERNAMES
        try:
            app_server.ADMIN_USERNAMES = ""
            self.assertFalse(app_server.is_admin_username("alice"))
        finally:
            app_server.ADMIN_USERNAMES = orig

    def test_is_admin_username_strips_whitespace(self):
        orig = app_server.ADMIN_USERNAMES
        try:
            app_server.ADMIN_USERNAMES = " alice , bob "
            self.assertTrue(app_server.is_admin_username("alice"))
            self.assertTrue(app_server.is_admin_username("bob"))
            # leading/trailing whitespace in the username itself does NOT pass
            self.assertFalse(app_server.is_admin_username(" alice"))
        finally:
            app_server.ADMIN_USERNAMES = orig

    def test_session_response_marks_admin_true_for_listed_user(self):
        body = self._get_session("tok-alice")
        self.assertEqual(body["user"]["is_admin"], True)

    def test_session_response_marks_admin_false_for_other_user(self):
        body = self._get_session("tok-eve")
        self.assertEqual(body["user"]["is_admin"], False)

    def test_default_admin_includes_dev_account(self):
        # The module-level default keeps the dev's own username as an admin
        # so local sessions just work. This is documented behavior — assert
        # it doesn't silently regress.
        src = (Path(__file__).resolve().parent.parent.parent / "app_server.py").read_text()
        self.assertIn('ADMIN_USERNAMES = os.getenv("ADMIN_USERNAMES", "Huangnanxi")', src)


if __name__ == "__main__":
    unittest.main()
