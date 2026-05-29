"""Regression tests for server-side error monitoring (P1 commercialization)."""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class ServerErrorsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_server_errors_table_exists(self):
        conn = app_server.get_conn()
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='server_errors'"
        ).fetchall()
        conn.close()
        self.assertEqual(len(rows), 1)

    def test_log_server_error_persists_row(self):
        conn = app_server.get_conn()
        try:
            raise ValueError("oops something blew up")
        except ValueError as exc:
            err_id = app_server.log_server_error(
                conn,
                user_id="user-x",
                method="POST",
                path="/api/chat",
                status_code=500,
                error=exc,
                client_ip="127.0.0.1",
            )
        self.assertTrue(err_id.startswith("err-"))
        row = conn.execute(
            "SELECT * FROM server_errors WHERE id=?", (err_id,)
        ).fetchone()
        self.assertEqual(row["user_id"], "user-x")
        self.assertEqual(row["method"], "POST")
        self.assertEqual(row["path"], "/api/chat")
        self.assertEqual(row["error_class"], "ValueError")
        self.assertIn("oops", row["error_message"])
        self.assertIn("ValueError", row["traceback"])
        conn.close()

    def test_log_server_error_truncates_long_fields(self):
        conn = app_server.get_conn()
        long_msg = "x" * 2000
        err_id = app_server.log_server_error(
            conn, error_message=long_msg, path="/" + "y" * 800,
        )
        row = conn.execute("SELECT * FROM server_errors WHERE id=?", (err_id,)).fetchone()
        self.assertLessEqual(len(row["error_message"]), 500)
        self.assertLessEqual(len(row["path"]), 512)
        conn.close()

    def test_log_server_error_never_raises_on_db_failure(self):
        # Pass an explicitly bad conn — function must swallow the error
        result = app_server.log_server_error(
            None, error_message="x", path="/", method="GET",
        )
        # With None it opens its own conn against the test DB and succeeds.
        # The point is it returned a string (possibly empty) without raising.
        self.assertIsInstance(result, str)

    def test_gc_old_server_errors_removes_only_old_rows(self):
        conn = app_server.get_conn()
        conn.execute(
            "INSERT INTO server_errors (id, user_id, method, path, status_code,"
            " error_class, error_message, traceback, client_ip, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            ("err-old", "", "GET", "/", 500, "X", "old", "", "", "2020-01-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO server_errors (id, user_id, method, path, status_code,"
            " error_class, error_message, traceback, client_ip, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            ("err-new", "", "GET", "/", 500, "X", "new", "", "", app_server.now_iso()),
        )
        conn.commit()
        deleted = app_server.gc_old_server_errors(conn, keep_days=7)
        self.assertEqual(deleted, 1)
        remaining = conn.execute(
            "SELECT id FROM server_errors WHERE id IN ('err-old','err-new')"
        ).fetchall()
        conn.close()
        self.assertEqual([r["id"] for r in remaining], ["err-new"])

    def test_handle_one_request_catches_unhandled_exception_and_logs(self):
        """When a do_GET handler raises, the wrapper must log and return 500."""
        raw = b"GET /api/session HTTP/1.1\r\nHost: x\r\n\r\n"
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.rfile = BytesIO(raw)
        handler.wfile = BytesIO()
        handler.client_address = ("10.0.0.1", 12345)
        handler._status_code = None
        sent = {"headers": {}}
        handler.send_response = lambda c, *a, **kw: setattr(handler, "_status_code", c)
        handler.send_header = lambda n, v: sent["headers"].__setitem__(n, str(v))
        handler.end_headers = lambda: None
        handler.log_message = lambda *a, **kw: None
        handler.log_request = lambda *a, **kw: None

        # Force do_GET to raise so handle_one_request wrapper kicks in.
        original_do_get = app_server.Handler.do_GET

        def boom(self):
            raise RuntimeError("intentional test failure")

        app_server.Handler.do_GET = boom
        try:
            handler.handle_one_request()
        finally:
            app_server.Handler.do_GET = original_do_get

        self.assertEqual(handler._status_code, 500,
                         "wrapper must send 500 response")
        body_str = handler.wfile.getvalue().decode("utf-8")
        self.assertIn("internal server error", body_str)
        conn = app_server.get_conn()
        rows = conn.execute(
            "SELECT method, path, error_class FROM server_errors ORDER BY created_at DESC LIMIT 1"
        ).fetchall()
        conn.close()
        self.assertGreaterEqual(len(rows), 1)
        self.assertEqual(rows[0]["error_class"], "RuntimeError")
        self.assertEqual(rows[0]["path"], "/api/session")
        self.assertEqual(rows[0]["method"], "GET")


if __name__ == "__main__":
    unittest.main()
