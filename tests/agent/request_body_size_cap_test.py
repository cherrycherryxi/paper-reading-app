"""
OPT-009: Tests that _read_json() and the Stripe webhook path enforce
MAX_REQUEST_BYTES, returning HTTP 413 on oversized Content-Length headers
rather than attempting a gigantic rfile.read() that would OOM/block threads.
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class _FakeHeaders(dict):
    """Minimal headers stub that supports .get() like http.server uses."""

    def get(self, key, default=""):
        return super().get(key.lower(), super().get(key, default))


def _make_handler(method, path, content_length, body=b""):
    """Construct a Handler instance with stubbed rfile/wfile/headers."""
    handler = app_server.Handler.__new__(app_server.Handler)
    handler.path = path
    handler.command = method
    handler.headers = _FakeHeaders(
        {
            "Content-Length": str(content_length),
            "Content-Type": "application/json",
        }
    )
    handler.rfile = BytesIO(body)
    handler.wfile = BytesIO()
    handler._status_code = None
    handler._sent_headers = {}

    def send_response(code):
        handler._status_code = code

    def send_header(name, value):
        handler._sent_headers[name.lower()] = str(value)

    handler.send_response = send_response
    handler.send_header = send_header
    handler.end_headers = lambda: None
    return handler


class RequestBodySizeCapTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    # ------------------------------------------------------------------
    # MAX_REQUEST_BYTES constant
    # ------------------------------------------------------------------

    def test_max_request_bytes_constant_is_20mb(self):
        self.assertEqual(app_server.MAX_REQUEST_BYTES, 20 * 1024 * 1024)

    # ------------------------------------------------------------------
    # _read_json() size check
    # ------------------------------------------------------------------

    def test_read_json_returns_413_on_oversized_content_length(self):
        """A Content-Length header larger than MAX_REQUEST_BYTES must produce 413."""
        oversized = app_server.MAX_REQUEST_BYTES + 1
        handler = _make_handler("POST", "/api/register", oversized)

        with self.assertRaises(app_server._RequestTooLarge):
            handler._read_json()

        self.assertEqual(handler._status_code, 413)
        response = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertEqual(response["error"], "request_too_large")

    def test_read_json_exactly_at_limit_is_allowed(self):
        """A request body exactly at MAX_REQUEST_BYTES is accepted."""
        body = b'{"key": "value"}'
        handler = _make_handler("POST", "/api/register", len(body), body)
        # Temporarily set the limit to exactly the body length
        orig = app_server.MAX_REQUEST_BYTES
        app_server.MAX_REQUEST_BYTES = len(body)
        try:
            result = handler._read_json()
        finally:
            app_server.MAX_REQUEST_BYTES = orig
        self.assertEqual(result["key"], "value")

    def test_read_json_small_body_is_accepted(self):
        """Normal small requests must not be affected by the guard."""
        body = json.dumps({"foo": "bar"}).encode("utf-8")
        handler = _make_handler("POST", "/api/login", len(body), body)
        result = handler._read_json()
        self.assertEqual(result["foo"], "bar")

    def test_read_json_zero_content_length_returns_empty_dict(self):
        """Content-Length: 0 (no body) should return {}."""
        handler = _make_handler("POST", "/api/login", 0)
        result = handler._read_json()
        self.assertEqual(result, {})

    # ------------------------------------------------------------------
    # Stripe webhook path
    # ------------------------------------------------------------------

    def test_stripe_webhook_returns_413_on_oversized_body(self):
        """POST /api/billing/webhook with oversized Content-Length returns 413."""
        oversized = app_server.MAX_REQUEST_BYTES + 1
        handler = _make_handler("POST", "/api/billing/webhook", oversized)
        handler.do_POST()
        self.assertEqual(handler._status_code, 413)
        response = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertEqual(response["error"], "request_too_large")

    def test_stripe_webhook_small_body_proceeds_to_signature_check(self):
        """A small Stripe webhook payload should pass the size guard and reach
        the signature-verification step (returning 400, not 413)."""
        body = json.dumps({"type": "test.event"}).encode("utf-8")
        handler = _make_handler("POST", "/api/billing/webhook", len(body), body)
        handler.headers["Stripe-Signature"] = "bad-sig"
        handler.do_POST()
        # 400 means the size guard was NOT triggered (signature check ran)
        self.assertEqual(handler._status_code, 400)
        response = json.loads(handler.wfile.getvalue().decode("utf-8"))
        self.assertNotEqual(response.get("error"), "request_too_large")

    # ------------------------------------------------------------------
    # _RequestTooLarge exception class
    # ------------------------------------------------------------------

    def test_request_too_large_is_not_subclass_of_value_error(self):
        """_RequestTooLarge is a dedicated sentinel — it must NOT be a ValueError
        or any other standard exception subclass so callers can distinguish it."""
        exc = app_server._RequestTooLarge()
        self.assertNotIsInstance(exc, (ValueError, OSError, IOError))

    def test_do_post_raises_request_too_large_not_generic_exception(self):
        """When _read_json() rejects oversized body, do_POST() must propagate
        _RequestTooLarge specifically (so handle_one_request catches it before
        the generic Exception handler which would try to send a second 500)."""
        oversized = app_server.MAX_REQUEST_BYTES + 1
        handler = _make_handler("POST", "/api/register", oversized)
        with self.assertRaises(app_server._RequestTooLarge):
            handler.do_POST()
        # Confirm the 413 was sent before the raise
        self.assertEqual(handler._status_code, 413)


if __name__ == "__main__":
    unittest.main()
