"""Regression tests for E26: connection-leak safety net in handle_one_request.

`_require_user()` opens a sqlite connection and records it on
`self._active_conn`. Route handlers close it manually at each exit point, but
if a handler body raises *after* `_require_user()` opened the connection but
*before* its explicit `conn.close()`, the connection (and its shared SQLite
lock) would leak. `Handler.handle_one_request` closes `self._active_conn` in a
finally as a catch-all, so a single raised exception can never leak a
connection regardless of which endpoint raised. Without this net, accumulated
leaks surface as `sqlite3.OperationalError: database is locked` on unrelated
requests.
"""
import http.server
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class _TrackedConn:
    """Transparent proxy around a sqlite3.Connection that counts close()."""

    def __init__(self, real):
        object.__setattr__(self, "_real", real)
        object.__setattr__(self, "closed", 0)

    def close(self):
        object.__setattr__(self, "closed", object.__getattribute__(self, "closed") + 1)
        return object.__getattribute__(self, "_real").close()

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_real"), name)

    def __setattr__(self, name, value):
        setattr(object.__getattribute__(self, "_real"), name, value)


class ConnLeakFallbackTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        # Seed a user + session token so _require_user resolves successfully.
        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-leak", "leaker", "x", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            ("tok-leak", "user-leak", now, now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            ("user-leak", json.dumps({"books": []}), now),
        )
        conn.commit()
        conn.close()

        # Track close() on every connection _require_user (and others) open.
        self._orig_get_conn = app_server.get_conn
        self._tracked = []

        def tracking_get_conn(*args, **kwargs):
            tc = _TrackedConn(self._orig_get_conn(*args, **kwargs))
            self._tracked.append(tc)
            return tc

        app_server.get_conn = tracking_get_conn

        # Route super().handle_one_request() straight to the do_<command> method
        # so we exercise Handler.handle_one_request's try/except/finally without
        # standing up a real HTTP socket.
        self._orig_super_h1r = http.server.BaseHTTPRequestHandler.handle_one_request

        def fake_super_handle_one_request(handler):
            getattr(handler, "do_" + handler.command)()

        http.server.BaseHTTPRequestHandler.handle_one_request = fake_super_handle_one_request

    def tearDown(self):
        app_server.get_conn = self._orig_get_conn
        http.server.BaseHTTPRequestHandler.handle_one_request = self._orig_super_h1r
        self.temp_dir.cleanup()

    def _make_handler(self, path, command="GET", token="tok-leak"):
        h = app_server.Handler.__new__(app_server.Handler)
        h.path = path
        h.command = command
        h.headers = {"Authorization": f"Bearer {token}", "Content-Length": "0"}
        h.client_address = ("127.0.0.1", 0)
        h.rfile = BytesIO(b"")
        h.wfile = BytesIO()
        h._status = None
        h.send_response = lambda code, *a: setattr(h, "_status", code)
        h.send_header = lambda *a, **k: None
        h.end_headers = lambda: None
        return h

    def test_active_conn_closed_when_handler_body_raises(self):
        # Force an exception inside the handler *after* _require_user opened a
        # connection. handle_one_request catches + logs it (no re-raise), then
        # the finally must still close the leaked connection.
        orig_load_state = app_server.load_state

        def boom(*args, **kwargs):
            raise RuntimeError("boom inside handler body")

        app_server.load_state = boom
        try:
            h = self._make_handler("/api/session")
            h.handle_one_request()
        finally:
            app_server.load_state = orig_load_state

        # First tracked conn is the one _require_user opened for this request.
        self.assertGreater(len(self._tracked), 0)
        self.assertGreater(
            self._tracked[0].closed,
            0,
            "the _require_user connection must be closed by the finally net",
        )
        self.assertIsNone(getattr(h, "_active_conn", None))

    def test_active_conn_closed_on_success(self):
        h = self._make_handler("/api/session")
        h.handle_one_request()
        self.assertEqual(h._status, 200)
        self.assertGreater(self._tracked[0].closed, 0)
        self.assertIsNone(getattr(h, "_active_conn", None))

    def test_active_conn_cleared_on_unauthorized(self):
        # Bad token -> 401 early-return path also clears _active_conn.
        h = self._make_handler("/api/session", token="nope")
        h.handle_one_request()
        self.assertEqual(h._status, 401)
        self.assertGreater(self._tracked[0].closed, 0)
        self.assertIsNone(getattr(h, "_active_conn", None))


if __name__ == "__main__":
    unittest.main()
