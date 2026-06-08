"""Regression tests for OPT-022: per-IP rate limiting on the unauthenticated
auth endpoints (/api/login, /api/register, /api/password/reset-request).

Before the fix these three endpoints had no rate limiting at all, leaving
credential stuffing and spam registration undefended.
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class AuthRateLimitTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        # Tight global override so the limit trips after 2 requests.
        self._orig_hour = app_server.RATE_LIMIT_OVERRIDE_HOUR
        self._orig_day = app_server.RATE_LIMIT_OVERRIDE_DAY
        self._orig_xff = app_server.TRUST_X_FORWARDED_FOR
        app_server.RATE_LIMIT_OVERRIDE_HOUR = "2"
        app_server.RATE_LIMIT_OVERRIDE_DAY = "50"
        app_server.init_db()

    def tearDown(self):
        app_server.RATE_LIMIT_OVERRIDE_HOUR = self._orig_hour
        app_server.RATE_LIMIT_OVERRIDE_DAY = self._orig_day
        app_server.TRUST_X_FORWARDED_FOR = self._orig_xff
        self.temp_dir.cleanup()

    def _request(self, path, payload, client_ip="203.0.113.5", xff=None):
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if xff is not None:
            headers["X-Forwarded-For"] = xff
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = path
        handler.command = "POST"
        handler.headers = headers
        handler.client_address = (client_ip, 5000)
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda c: setattr(handler, "_status_code", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        text = handler.wfile.getvalue().decode("utf-8")
        try:
            data = json.loads(text)
        except Exception:
            data = {"_raw": text}
        return handler._status_code, data

    # ---- login ----------------------------------------------------------
    def test_login_blocks_after_ip_limit(self):
        # Wrong creds (401) still consume budget — the rate check runs first.
        for _ in range(2):
            status, _ = self._request("/api/login", {"username": "x", "password": "y"})
            self.assertEqual(status, 401)
        status, body = self._request("/api/login", {"username": "x", "password": "y"})
        self.assertEqual(status, 429)
        self.assertEqual(body["error"], "rate_limited")
        self.assertIn("retry_after_seconds", body)

    # ---- register -------------------------------------------------------
    def test_register_blocks_after_ip_limit(self):
        for i in range(2):
            status, _ = self._request("/api/register", {
                "username": f"user{i}", "password": "pass", "termsAccepted": True,
            })
            self.assertEqual(status, 201)
        status, body = self._request("/api/register", {
            "username": "user3", "password": "pass", "termsAccepted": True,
        })
        self.assertEqual(status, 429)
        self.assertEqual(body["error"], "rate_limited")

    # ---- reset-request --------------------------------------------------
    def test_reset_request_blocks_after_ip_limit(self):
        for _ in range(2):
            status, _ = self._request("/api/password/reset-request", {"identifier": "nobody"})
            self.assertEqual(status, 200)
        status, body = self._request("/api/password/reset-request", {"identifier": "nobody"})
        self.assertEqual(status, 429)
        self.assertEqual(body["error"], "rate_limited")

    # ---- per-IP isolation ----------------------------------------------
    def test_different_ips_have_independent_counters(self):
        for _ in range(2):
            self._request("/api/login", {"username": "x", "password": "y"}, client_ip="1.1.1.1")
        # IP 1.1.1.1 is now blocked
        status_blocked, _ = self._request(
            "/api/login", {"username": "x", "password": "y"}, client_ip="1.1.1.1")
        self.assertEqual(status_blocked, 429)
        # A different IP is unaffected
        status_other, _ = self._request(
            "/api/login", {"username": "x", "password": "y"}, client_ip="2.2.2.2")
        self.assertEqual(status_other, 401)

    def test_login_and_register_have_independent_counters(self):
        for _ in range(2):
            self._request("/api/login", {"username": "x", "password": "y"}, client_ip="9.9.9.9")
        # login exhausted for this IP, register from same IP should still work
        status, _ = self._request("/api/register", {
            "username": "fresh", "password": "pass", "termsAccepted": True,
        }, client_ip="9.9.9.9")
        self.assertEqual(status, 201)

    # ---- X-Forwarded-For handling --------------------------------------
    def test_xff_ignored_when_untrusted(self):
        app_server.TRUST_X_FORWARDED_FOR = False
        # Same real client_address, different spoofed XFF each time: all should
        # share one counter (XFF ignored), so the 3rd is blocked.
        self._request("/api/login", {"username": "x", "password": "y"},
                      client_ip="5.5.5.5", xff="10.0.0.1")
        self._request("/api/login", {"username": "x", "password": "y"},
                      client_ip="5.5.5.5", xff="10.0.0.2")
        status, _ = self._request("/api/login", {"username": "x", "password": "y"},
                                  client_ip="5.5.5.5", xff="10.0.0.3")
        self.assertEqual(status, 429)

    def test_xff_honored_when_trusted(self):
        app_server.TRUST_X_FORWARDED_FOR = True
        # Same proxy client_address, distinct XFF client IPs → independent
        # counters, so none is blocked within the limit.
        for ip in ("10.0.0.1", "10.0.0.2", "10.0.0.3"):
            status, _ = self._request("/api/login", {"username": "x", "password": "y"},
                                      client_ip="172.16.0.1", xff=ip)
            self.assertEqual(status, 401, f"XFF {ip} should be its own counter")

    def test_client_ip_helper_first_xff_hop_when_trusted(self):
        app_server.TRUST_X_FORWARDED_FOR = True
        h = app_server.Handler.__new__(app_server.Handler)
        h.headers = {"X-Forwarded-For": "203.0.113.9, 10.0.0.1, 10.0.0.2"}
        h.client_address = ("172.16.0.1", 5000)
        self.assertEqual(h._client_ip(), "203.0.113.9")

    def test_client_ip_helper_uses_socket_when_untrusted(self):
        app_server.TRUST_X_FORWARDED_FOR = False
        h = app_server.Handler.__new__(app_server.Handler)
        h.headers = {"X-Forwarded-For": "203.0.113.9"}
        h.client_address = ("172.16.0.1", 5000)
        self.assertEqual(h._client_ip(), "172.16.0.1")


if __name__ == "__main__":
    unittest.main()
