"""Regression tests for password reset flow (P1 commercialization)."""
import json
import re
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path

import app_server


class PasswordResetTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        # Stub SMTP to always "succeed" with a captured envelope
        self._sent = []

        def fake_send(*, to, subject, body):
            self._sent.append({"to": to, "subject": subject, "body": body})
            return True, "sent"

        self._orig_send = app_server.send_email_via_smtp
        app_server.send_email_via_smtp = fake_send

        # Seed a user with email
        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, email, created_at, terms_accepted_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            ("user-1", "alice", app_server.hash_password("oldpass"), "alice@example.com", now, now),
        )
        # And a user WITHOUT email
        conn.execute(
            "INSERT INTO users (id, username, password_hash, email, created_at, terms_accepted_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            ("user-2", "bob", app_server.hash_password("oldpass"), "", now, now),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        app_server.send_email_via_smtp = self._orig_send
        self.temp_dir.cleanup()

    def _post(self, path, payload, token=None):
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = path
        handler.command = "POST"
        handler.headers = headers
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda c: setattr(handler, "_status_code", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        body_text = handler.wfile.getvalue().decode("utf-8")
        try:
            return handler._status_code, json.loads(body_text)
        except Exception:
            return handler._status_code, {"_raw": body_text}

    def _last_token(self):
        last = self._sent[-1]
        m = re.search(r"#reset-password=([\w\-_]+)", last["body"])
        return m.group(1) if m else None

    def test_request_by_email_sends_link_with_token(self):
        status, body = self._post(
            "/api/password/reset-request", {"identifier": "alice@example.com"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(len(self._sent), 1)
        self.assertEqual(self._sent[0]["to"], "alice@example.com")
        self.assertIn("#reset-password=", self._sent[0]["body"])

    def test_request_by_username_also_works(self):
        status, body = self._post(
            "/api/password/reset-request", {"identifier": "alice"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(self._sent), 1)

    def test_unknown_identifier_returns_generic_ok_no_email_sent(self):
        status, body = self._post(
            "/api/password/reset-request", {"identifier": "nobody@example.com"},
        )
        # Generic OK to prevent account enumeration.
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(len(self._sent), 0)

    def test_request_user_without_email_returns_specific_error(self):
        # bob has no email — we surface this because the user is asking for
        # their own account, not enumerating others.
        status, body = self._post(
            "/api/password/reset-request", {"identifier": "bob"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "no_email_on_file")
        self.assertEqual(len(self._sent), 0)

    def test_reset_with_valid_token_updates_password_and_revokes_sessions(self):
        # Create an active session first
        conn = app_server.get_conn()
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at)"
            " VALUES (?, ?, ?, ?)",
            ("session-tok", "user-1", app_server.now_iso(), app_server.now_iso()),
        )
        conn.commit()
        conn.close()

        self._post("/api/password/reset-request", {"identifier": "alice"})
        token = self._last_token()
        self.assertIsNotNone(token)

        status, body = self._post(
            "/api/password/reset", {"token": token, "password": "newpass"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])

        # Old password should no longer work
        conn = app_server.get_conn()
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id='user-1'"
        ).fetchone()
        self.assertTrue(app_server.verify_password("newpass", row["password_hash"]))
        self.assertFalse(app_server.verify_password("oldpass", row["password_hash"]))
        # All sessions must be revoked
        sess = conn.execute(
            "SELECT 1 FROM sessions WHERE user_id='user-1'"
        ).fetchall()
        conn.close()
        self.assertEqual(len(sess), 0, "all sessions must be revoked on password reset")

    def test_token_cannot_be_used_twice(self):
        self._post("/api/password/reset-request", {"identifier": "alice"})
        token = self._last_token()
        status1, _ = self._post(
            "/api/password/reset", {"token": token, "password": "first"},
        )
        self.assertEqual(status1, 200)
        status2, body2 = self._post(
            "/api/password/reset", {"token": token, "password": "second"},
        )
        self.assertEqual(status2, 400)
        self.assertEqual(body2["code"], "used")

    def test_expired_token_is_rejected(self):
        conn = app_server.get_conn()
        past = (datetime.utcnow() - timedelta(minutes=60)).isoformat() + "Z"
        conn.execute(
            "INSERT INTO password_reset_tokens (token, user_id, expires_at, created_at)"
            " VALUES (?, ?, ?, ?)",
            ("expired-tok", "user-1", past, past),
        )
        conn.commit()
        conn.close()
        status, body = self._post(
            "/api/password/reset", {"token": "expired-tok", "password": "newpass"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "expired")

    def test_unknown_token_is_rejected(self):
        status, body = self._post(
            "/api/password/reset", {"token": "never-existed", "password": "x123"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "not_found")

    def test_reset_request_falls_back_to_log_when_smtp_unconfigured(self):
        # Restore real send_email_via_smtp; with no SMTP env vars set in
        # test it returns (False, "smtp_not_configured")
        app_server.send_email_via_smtp = self._orig_send
        # Make sure SMTP_HOST is empty in the module
        orig_host = app_server.SMTP_HOST
        app_server.SMTP_HOST = ""
        try:
            status, body = self._post(
                "/api/password/reset-request", {"identifier": "alice"},
            )
            self.assertEqual(status, 200)
            # Generic OK still returned to the client (no info leak)
            self.assertTrue(body["ok"])
            # Token should have been written to server_errors as a dev log
            conn = app_server.get_conn()
            rows = conn.execute(
                "SELECT error_message FROM server_errors WHERE path='/api/password/reset-request'"
            ).fetchall()
            conn.close()
            self.assertGreaterEqual(len(rows), 1)
            self.assertIn("smtp fallback", rows[0]["error_message"])
            self.assertIn("#reset-password=", rows[0]["error_message"])
        finally:
            app_server.SMTP_HOST = orig_host

    def test_set_email_endpoint_updates_and_validates(self):
        # Create a session for bob (who has no email yet)
        conn = app_server.get_conn()
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at)"
            " VALUES (?, ?, ?, ?)",
            ("bob-tok", "user-2", app_server.now_iso(), app_server.now_iso()),
        )
        conn.commit()
        conn.close()
        # Bad email rejected
        status, _ = self._post(
            "/api/account/email", {"email": "not-an-email"}, token="bob-tok",
        )
        self.assertEqual(status, 400)
        # Valid email accepted
        status, body = self._post(
            "/api/account/email", {"email": "bob@example.com"}, token="bob-tok",
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["email"], "bob@example.com")
        # Conflict with another user's email
        status, body = self._post(
            "/api/account/email", {"email": "alice@example.com"}, token="bob-tok",
        )
        self.assertEqual(status, 409)

    def test_email_validator(self):
        self.assertTrue(app_server._is_valid_email("a@b.co"))
        self.assertTrue(app_server._is_valid_email("user.name+tag@example.com"))
        self.assertFalse(app_server._is_valid_email(""))
        self.assertFalse(app_server._is_valid_email("nope"))
        self.assertFalse(app_server._is_valid_email("a@b"))
        self.assertFalse(app_server._is_valid_email("a @b.co"))
        self.assertFalse(app_server._is_valid_email("a" * 300))


if __name__ == "__main__":
    unittest.main()
