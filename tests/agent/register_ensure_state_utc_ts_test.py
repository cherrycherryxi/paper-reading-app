"""Regression tests for OPT-038: user registration and ensure_user_state() must
write UTC-Z timestamps (ending with 'Z'), not naive-local now_iso().

The `user_state.updated_at` column doubles as the optimistic-lock version token
(state_version / save_state_checked). save_state() writes it with utc_now_iso();
if the seed rows written at registration / ensure_user_state() use naive-local
now_iso(), the first stateVersion handed to the client is a different format than
every later version, polluting the version field."""
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
    return bool(UTC_Z_RE.match(ts or ""))


class RegisterEnsureStateUtcTimestampTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.conn = app_server.get_conn()

    def tearDown(self):
        try:
            self.conn.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def test_ensure_user_state_seeds_utc_version(self):
        user_id = "user-ensure"
        # A bare user with no user_state row yet — ensure_user_state inserts one.
        app_server.ensure_user_state(self.conn, user_id)
        version = app_server.state_version(self.conn, user_id)
        self.assertTrue(
            _is_utc(version),
            f"ensure_user_state seeded a non-UTC version token: {version!r}",
        )

    def test_ensure_user_state_version_matches_save_state_format(self):
        user_id = "user-ensure-2"
        app_server.ensure_user_state(self.conn, user_id)
        seeded = app_server.state_version(self.conn, user_id)
        # A subsequent real save uses utc_now_iso(); both must share the format so
        # the optimistic-lock comparison is apples-to-apples.
        state = app_server.load_state(self.conn, user_id)
        app_server.save_state(self.conn, user_id, state)
        after_save = app_server.state_version(self.conn, user_id)
        self.assertTrue(_is_utc(seeded))
        self.assertTrue(_is_utc(after_save))


class RegisterHandlerUtcTimestampTests(unittest.TestCase):
    """Drives the real /api/register handler and asserts the seeded
    user_state version token + users.created_at / terms_accepted_at are UTC-Z."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _register(self, username, password):
        from io import BytesIO

        body = json.dumps({
            "username": username, "password": password, "termsAccepted": True,
        }).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/register"
        handler.command = "POST"
        handler.headers = headers
        handler.client_address = ("203.0.113.9", 5000)
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda c: setattr(handler, "_status_code", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        return handler._status_code

    def test_register_seeds_utc_version_and_created_at(self):
        status = self._register("utcuser", "password123")
        self.assertEqual(status, 201)

        conn = app_server.get_conn()
        try:
            user_row = conn.execute(
                "SELECT id, created_at, terms_accepted_at FROM users WHERE username = ?",
                ("utcuser",),
            ).fetchone()
            self.assertIsNotNone(user_row)
            self.assertTrue(
                _is_utc(user_row["created_at"]),
                f"users.created_at not UTC-Z: {user_row['created_at']!r}",
            )
            self.assertTrue(
                _is_utc(user_row["terms_accepted_at"]),
                f"users.terms_accepted_at not UTC-Z: {user_row['terms_accepted_at']!r}",
            )
            version = app_server.state_version(conn, user_row["id"])
            self.assertTrue(
                _is_utc(version),
                f"seeded user_state version not UTC-Z: {version!r}",
            )
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
