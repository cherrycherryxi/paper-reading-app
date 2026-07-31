"""Regression coverage for OPT-120 (recoverable async OCR) and OPT-102.

The tests use the real HTTP handlers with a tiny fake OCR engine, so they lock
the request boundary and persisted state rather than only helper functions.
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
import app_server


PNG = b"\x89PNG\r\n\x1a\nsmall-image"


class OcrReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        app_server.DB_PATH = root / "test.db"
        app_server.UPLOAD_DIR = root / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.user_id, self.token = "user-test", "token-test"
        now = app_server.now_iso()
        conn = app_server.get_conn()
        conn.execute("INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
                     (self.user_id, "tester", "salt$digest", now))
        conn.execute("INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
                     (self.token, self.user_id, now, now))
        state = {"books": [{"id": "book-1", "title": "T"}], "sessions": [],
                 "quotes": [], "chatHistories": {}, "connections": []}
        conn.execute("INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
                     (self.user_id, json.dumps(state), now))
        conn.commit()
        conn.close()
        self.old_fast = app_server.run_fast_ocr
        self.old_bg = app_server.start_background_ocr
        self.addCleanup(self._restore)

    def _restore(self):
        app_server.run_fast_ocr = self.old_fast
        app_server.start_background_ocr = self.old_bg
        self.temp_dir.cleanup()

    def _handler(self, path, body=b"", headers=None):
        h = app_server.Handler.__new__(app_server.Handler)
        h.path, h.command = path, "POST"
        h.headers = {"Authorization": f"Bearer {self.token}", "Content-Length": str(len(body)), **(headers or {})}
        h.rfile, h.wfile, h._status_code = BytesIO(body), BytesIO(), None
        h.send_response = lambda code: setattr(h, "_status_code", code)
        h.send_header = lambda *a, **k: None
        h.end_headers = lambda: None
        h.client_address = ("127.0.0.1", 9999)
        return h

    def test_ocr_status_can_retrieve_pending_request_after_lost_response(self):
        app_server.start_background_ocr = lambda *args, **kwargs: None
        body = json.dumps({
            "bookId": "book-1", "engine": "ai", "ocrRequestId": "req-recover",
            "imageDataUrl": "data:image/png;base64," + __import__("base64").b64encode(PNG).decode(),
        }).encode()
        post = self._handler("/api/quotes/ocr", body, {"Content-Type": "application/json"})
        post.do_POST()
        self.assertEqual(post._status_code, 202)

        get = app_server.Handler.__new__(app_server.Handler)
        get.path = "/api/quotes/ocr-status?requestId=req-recover"
        get.command, get.headers = "GET", {"Authorization": f"Bearer {self.token}"}
        get.wfile, get._status_code = BytesIO(), None
        get.send_response = lambda code: setattr(get, "_status_code", code)
        get.send_header = lambda *a, **k: None
        get.end_headers = lambda: None
        get.client_address = ("127.0.0.1", 9999)
        get.do_GET()
        payload = json.loads(get.wfile.getvalue())
        self.assertEqual(get._status_code, 200)
        self.assertEqual(payload["status"], "pending")
        self.assertEqual(payload["state"]["quotes"][0]["ocrRequestId"], "req-recover")


if __name__ == "__main__":
    unittest.main()
