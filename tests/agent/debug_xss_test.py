"""Regression tests for OPT-034: stored XSS in /debug/logs and /debug/agent-dashboard.

User-controlled fields (prompt, input, output, username, error, action data)
must be HTML-escaped so that injected <script> tags are neutralised.
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


def _make_loopback_handler(path: str) -> app_server.Handler:
    h = app_server.Handler.__new__(app_server.Handler)
    h.path = path
    h.command = "GET"
    h.headers = {"Content-Length": "0"}
    h.rfile = BytesIO(b"")
    h.wfile = BytesIO()
    h.client_address = ("127.0.0.1", 9999)
    h._status = None
    h.send_response = lambda c, *a, **kw: setattr(h, "_status", c)
    h.send_header = lambda *a, **kw: None
    h.end_headers = lambda: None
    h.log_message = lambda *a, **kw: None
    h.log_request = lambda *a, **kw: None
    return h


class DebugLogsXSSTest(unittest.TestCase):
    XSS_PAYLOAD = '</pre><script>alert("xss")</script><pre>'

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self._orig_token = app_server.AUTH_TOKEN
        # Blank token → loopback auto-passes _authorized_for_admin()
        app_server.AUTH_TOKEN = ""

        # Insert a model_log row with XSS payload in every user-controlled field.
        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-xss", self.XSS_PAYLOAD, "x", now),
        )
        conn.execute(
            "INSERT INTO model_logs"
            " (id, user_id, username, type, model, prompt, input, output, error, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                "log-xss",
                "user-xss",
                self.XSS_PAYLOAD,           # username
                "chat",
                "deepseek-chat",
                self.XSS_PAYLOAD,           # prompt
                self.XSS_PAYLOAD,           # input
                self.XSS_PAYLOAD,           # output
                self.XSS_PAYLOAD,           # error
                now,
            ),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        app_server.AUTH_TOKEN = self._orig_token
        self.temp_dir.cleanup()

    def _get_debug_logs_html(self) -> str:
        h = _make_loopback_handler("/debug/logs")
        h.do_GET()
        return h.wfile.getvalue().decode("utf-8")

    def test_script_tag_not_in_debug_logs(self):
        body = self._get_debug_logs_html()
        self.assertNotIn("<script>", body,
                         "/debug/logs must HTML-escape user content; raw <script> found")

    def test_xss_payload_escaped_in_debug_logs(self):
        body = self._get_debug_logs_html()
        # The escaped form of < should appear (the payload is present but neutralised)
        self.assertIn("&lt;", body,
                      "HTML-escaped content expected; &lt; not found")

    def test_status_200_for_loopback(self):
        h = _make_loopback_handler("/debug/logs")
        h.do_GET()
        self.assertEqual(h._status, 200)


class DebugAgentDashboardXSSTest(unittest.TestCase):
    XSS_PAYLOAD = '<script>document.cookie</script>'

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self._orig_token = app_server.AUTH_TOKEN
        app_server.AUTH_TOKEN = ""

        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-dash-xss", self.XSS_PAYLOAD, "x", now),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        app_server.AUTH_TOKEN = self._orig_token
        self.temp_dir.cleanup()

    def _get_dashboard_html(self) -> str:
        h = _make_loopback_handler("/debug/agent-dashboard")
        h.do_GET()
        return h.wfile.getvalue().decode("utf-8")

    def test_script_tag_not_in_dashboard(self):
        body = self._get_dashboard_html()
        self.assertNotIn("<script>", body,
                         "/debug/agent-dashboard must HTML-escape username; raw <script> found")

    def test_username_escaped_in_dashboard(self):
        body = self._get_dashboard_html()
        self.assertIn("&lt;script&gt;", body)


if __name__ == "__main__":
    unittest.main()
