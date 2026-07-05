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


class DebugGateTests(unittest.TestCase):
    """OPT-028: /debug/* must not be world-readable when ADMIN_TOKEN is unset."""

    def setUp(self):
        self._orig_token = app_server.AUTH_TOKEN

    def tearDown(self):
        app_server.AUTH_TOKEN = self._orig_token

    def _handler(self, client_ip, log_token=None, extra_headers=None):
        h = app_server.Handler.__new__(app_server.Handler)
        h.client_address = (client_ip, 54321)
        headers = {"X-Log-Token": log_token} if log_token is not None else {}
        if extra_headers:
            headers.update(extra_headers)
        h.headers = headers
        return h

    def test_token_unset_denies_remote_client(self):
        app_server.AUTH_TOKEN = ""
        self.assertFalse(self._handler("203.0.113.7")._authorized_for_admin())

    def test_token_unset_allows_loopback_ipv4(self):
        app_server.AUTH_TOKEN = ""
        self.assertTrue(self._handler("127.0.0.1")._authorized_for_admin())

    def test_token_unset_allows_loopback_ipv6(self):
        app_server.AUTH_TOKEN = ""
        self.assertTrue(self._handler("::1")._authorized_for_admin())

    def test_token_unset_allows_ipv4_mapped_loopback(self):
        app_server.AUTH_TOKEN = ""
        self.assertTrue(self._handler("::ffff:127.0.0.1")._authorized_for_admin())

    def test_token_set_requires_matching_header_even_from_loopback(self):
        app_server.AUTH_TOKEN = "secret"
        # Loopback no longer auto-passes once a token is configured.
        self.assertFalse(self._handler("127.0.0.1")._authorized_for_admin())
        self.assertFalse(self._handler("127.0.0.1", "wrong")._authorized_for_admin())
        self.assertTrue(self._handler("127.0.0.1", "secret")._authorized_for_admin())

    def test_token_set_allows_remote_with_matching_header(self):
        app_server.AUTH_TOKEN = "secret"
        self.assertTrue(self._handler("203.0.113.7", "secret")._authorized_for_admin())
        self.assertFalse(self._handler("203.0.113.7", "wrong")._authorized_for_admin())

    def test_token_unset_denies_tunneled_request_despite_loopback_addr(self):
        # bug-380: cloudflared connects from 127.0.0.1, so client_address looks
        # local; a forwarding header proves it came through the tunnel and must
        # NOT be trusted as loopback (else /debug/* is world-readable).
        app_server.AUTH_TOKEN = ""
        for hdr in ("CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP", "CF-Ray"):
            self.assertFalse(
                self._handler("127.0.0.1", extra_headers={hdr: "8.8.8.8"})._authorized_for_admin(),
                f"loopback addr + {hdr} must be denied")

    def test_token_unset_still_allows_genuine_local_browser(self):
        # A real local browser hitting 127.0.0.1 directly sends no forwarding
        # header → dev convenience preserved.
        app_server.AUTH_TOKEN = ""
        self.assertTrue(self._handler("127.0.0.1")._authorized_for_admin())


if __name__ == "__main__":
    unittest.main()
