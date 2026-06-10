"""Regression tests for OPT-037 (explore E26): DB connection-leak safety net.

Request handlers that do NOT go through ``_require_user`` — the admin /debug/*
views and the pre-auth endpoints (login / register / password reset) — open
their connection via ``self._open_conn()``, which registers it on
``self._active_conn``. If the handler body raises before its explicit
``conn.close()``, ``handle_one_request``'s ``finally`` must close that
connection; otherwise the leaked connection (and its shared SQLite lock)
eventually surfaces as ``database is locked`` on unrelated requests.

These tests drive a real request through ``handle_one_request`` (not a direct
``do_GET`` call) so the ``finally`` safety net actually executes.
"""
import sqlite3
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest import mock

import app_server


def _make_handler() -> app_server.Handler:
    h = app_server.Handler.__new__(app_server.Handler)
    h.wfile = BytesIO()
    h.client_address = ("127.0.0.1", 9999)
    h.send_response = lambda *a, **kw: None
    h.send_header = lambda *a, **kw: None
    h.end_headers = lambda: None
    h.log_message = lambda *a, **kw: None
    h.log_request = lambda *a, **kw: None
    h.log_error = lambda *a, **kw: None
    return h


def _drive(h: app_server.Handler, raw: bytes) -> None:
    """Feed a full HTTP request through the real handle_one_request path."""
    h.rfile = BytesIO(raw)
    h.handle_one_request()


def _is_closed(conn: sqlite3.Connection) -> bool:
    try:
        conn.execute("SELECT 1")
        return False
    except sqlite3.ProgrammingError:
        return True


class ConnectionLeakSafetyNetTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self._orig_token = app_server.AUTH_TOKEN
        app_server.AUTH_TOKEN = ""  # blank → loopback auto-passes admin gate

        # Track every connection opened via get_conn so we can assert the
        # handler's leaked connection was closed by the safety net.
        self._real_get_conn = app_server.get_conn
        self.opened: list[sqlite3.Connection] = []

        def tracking_get_conn():
            c = self._real_get_conn()
            self.opened.append(c)
            return c

        self._patch = mock.patch.object(app_server, "get_conn", tracking_get_conn)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()
        app_server.AUTH_TOKEN = self._orig_token
        self.temp_dir.cleanup()

    def test_debug_logs_leak_closed_by_safety_net(self):
        """A raise inside /debug/logs after _open_conn must not leak the conn."""
        h = _make_handler()
        with mock.patch.object(app_server, "list_logs", side_effect=RuntimeError("boom")):
            _drive(h, b"GET /debug/logs HTTP/1.1\r\nHost: x\r\n\r\n")
        # The first connection opened is the handler's _open_conn() connection.
        self.assertTrue(self.opened, "handler should have opened a connection")
        self.assertTrue(
            _is_closed(self.opened[0]),
            "/debug/logs leaked its connection — safety net did not close it",
        )
        self.assertIsNone(h._active_conn, "_active_conn must be reset after the request")

    def test_login_leak_closed_by_safety_net(self):
        """Pre-auth endpoint (POST /api/login) is the highest-risk path: a raise
        after _open_conn (here, in _enforce_rate_limit) must not leak the conn."""
        h = _make_handler()
        with mock.patch.object(
            app_server.Handler, "_enforce_rate_limit", side_effect=RuntimeError("boom")
        ):
            _drive(
                h,
                b"POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\n{}",
            )
        self.assertTrue(self.opened, "handler should have opened a connection")
        self.assertTrue(
            _is_closed(self.opened[0]),
            "/api/login leaked its connection — safety net did not close it",
        )
        self.assertIsNone(h._active_conn)

    def test_normal_request_resets_active_conn(self):
        """Regression: a successful request closes its conn explicitly, the
        finally double-closes (sqlite3 no-op), and _active_conn resets to None."""
        h = _make_handler()
        _drive(h, b"GET /debug/logs HTTP/1.1\r\nHost: x\r\n\r\n")
        self.assertIsNone(h._active_conn)
        self.assertTrue(self.opened, "handler should have opened a connection")
        self.assertTrue(
            _is_closed(self.opened[0]),
            "successful /debug/logs should have closed its connection",
        )


if __name__ == "__main__":
    unittest.main()
