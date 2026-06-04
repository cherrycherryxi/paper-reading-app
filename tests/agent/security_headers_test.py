"""Regression tests for OPT-011: security headers on static/HTML responses.

Spins up the real ThreadingHTTPServer on an ephemeral port in a background
thread and asserts the three security headers appear on static HTML routes.
Static serving needs no API keys and no DB writes.
"""
import http.client
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

import app_server


class SecurityHeadersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(cls.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        # Bind to an ephemeral port (0) on loopback.
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app_server.Handler)
        cls.host, cls.port = cls.server.server_address[0], cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.temp_dir.cleanup()

    def _get_headers(self, path: str):
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        try:
            conn.request("GET", path)
            resp = conn.getresponse()
            resp.read()  # drain body
            # Normalize header names to lowercase for case-insensitive lookup.
            return resp.status, {k.lower(): v for k, v in resp.getheaders()}
        finally:
            conn.close()

    def _assert_security_headers(self, path: str):
        status, headers = self._get_headers(path)
        self.assertEqual(status, 200, f"{path} should return 200")
        self.assertEqual(headers.get("x-frame-options"), "SAMEORIGIN", path)
        self.assertEqual(headers.get("x-content-type-options"), "nosniff", path)
        self.assertEqual(
            headers.get("referrer-policy"),
            "strict-origin-when-cross-origin",
            path,
        )

    def test_root_has_security_headers(self):
        self._assert_security_headers("/")

    def test_app_has_security_headers(self):
        self._assert_security_headers("/app")

    def test_index_html_has_security_headers(self):
        self._assert_security_headers("/index.html")

    def test_headers_not_duplicated(self):
        """Each security header must appear exactly once (no double-emit)."""
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        try:
            conn.request("GET", "/app")
            resp = conn.getresponse()
            resp.read()
            names = [k.lower() for k, _ in resp.getheaders()]
        finally:
            conn.close()
        for header in (
            "x-frame-options",
            "x-content-type-options",
            "referrer-policy",
        ):
            self.assertEqual(names.count(header), 1, f"{header} duplicated")


if __name__ == "__main__":
    unittest.main()
