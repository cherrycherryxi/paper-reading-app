"""Regression tests for ToS/Privacy consent on registration (P1 commercialization)."""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class TermsConsentTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _post(self, path, payload):
        body = json.dumps(payload).encode("utf-8")
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = path
        handler.command = "POST"
        handler.headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
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

    def test_register_without_terms_accepted_returns_400(self):
        status, body = self._post(
            "/api/register",
            {"username": "alice", "password": "secret"},
        )
        self.assertEqual(status, 400)
        self.assertIn("用户协议", body["error"])

    def test_register_with_terms_accepted_false_returns_400(self):
        status, body = self._post(
            "/api/register",
            {"username": "bob", "password": "secret", "termsAccepted": False},
        )
        self.assertEqual(status, 400)

    def test_register_with_terms_accepted_stores_timestamp(self):
        status, body = self._post(
            "/api/register",
            {"username": "carol", "password": "secret", "termsAccepted": True},
        )
        self.assertEqual(status, 201)
        conn = app_server.get_conn()
        row = conn.execute(
            "SELECT terms_accepted_at FROM users WHERE username='carol'"
        ).fetchone()
        conn.close()
        self.assertIsNotNone(row)
        self.assertTrue(row["terms_accepted_at"],
                        "terms_accepted_at must be set when termsAccepted=True at register time")

    def test_legal_pages_are_served_by_backend(self):
        # GET /privacy.html and /terms.html via Handler do_GET
        for path in ("/privacy.html", "/terms.html"):
            handler = app_server.Handler.__new__(app_server.Handler)
            handler.path = path
            handler.command = "GET"
            handler.headers = {}
            handler.rfile = BytesIO(b"")
            handler.wfile = BytesIO()
            handler._status_code = None
            handler._sent_headers = {}
            handler.send_response = lambda c: setattr(handler, "_status_code", c)
            handler.send_header = lambda n, v: handler._sent_headers.__setitem__(n, str(v))
            handler.end_headers = lambda: None
            handler.do_GET()
            self.assertEqual(handler._status_code, 200, f"{path} must return 200")
            self.assertIn(
                "text/html", handler._sent_headers.get("Content-Type", ""),
                f"{path} must be served as HTML",
            )
            content = handler.wfile.getvalue().decode("utf-8")
            self.assertIn("又买了一本书", content,
                          f"{path} should mention the product name")


if __name__ == "__main__":
    unittest.main()
