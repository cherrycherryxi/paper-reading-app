"""
OPT-002: Tests for the synchronous book-cover OCR endpoint POST /api/books/ocr.

The endpoint mirrors /api/ocr (auth -> rate limit -> read imageDataUrl -> call
Kimi vision -> parse {title,author,tags} -> 200). It does NOT use the async
trace/pending pipeline of /api/quotes/ocr because book title/author are short.
"""
import json
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server

# data:image/png;base64 of b"hello" — never reaches a real vision API because
# call_kimi_vision is monkeypatched in these tests.
TINY_DATA_URL = "data:image/png;base64,aGVsbG8="


class BookOcrEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        conn = app_server.get_conn()
        self.user_id = "user-test"
        self.token = "token-test"
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, "tester", "salt$digest", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (self.token, self.user_id, now, now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(
                {"books": [], "sessions": [], "quotes": [], "chatHistories": {}},
                ensure_ascii=False,
            ), now),
        )
        conn.commit()
        conn.close()

        self._orig_kimi = app_server.call_kimi_vision
        self._orig_key = app_server.MOONSHOT_API_KEY
        self.addCleanup(self._restore)

    def _restore(self):
        app_server.call_kimi_vision = self._orig_kimi
        app_server.MOONSHOT_API_KEY = self._orig_key
        self.temp_dir.cleanup()

    def _post(self, body_dict, token=None):
        if token is None:
            token = self.token
        body = json.dumps(body_dict).encode("utf-8")
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/books/ocr"
        handler.command = "POST"
        headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        handler.headers = headers
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda code: setattr(handler, "_status_code", code)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        raw = handler.wfile.getvalue().decode("utf-8")
        return handler._status_code, json.loads(raw) if raw else {}

    def test_success_returns_parsed_fields(self):
        app_server.call_kimi_vision = lambda *a, **k: app_server.KimiVisionResult(
            content=json.dumps(
                {"title": "悉达多", "author": "黑塞", "tags": ["成长"]},
                ensure_ascii=False,
            ),
            diagnostics={},
        )
        status, data = self._post({"imageDataUrl": TINY_DATA_URL})
        self.assertEqual(status, 200)
        self.assertEqual(data["title"], "悉达多")
        self.assertEqual(data["author"], "黑塞")
        self.assertEqual(data["tags"], ["成长"])

    def test_success_tolerates_markdown_code_fence(self):
        app_server.call_kimi_vision = lambda *a, **k: app_server.KimiVisionResult(
            content="```json\n{\"title\": \"活着\", \"author\": \"余华\", \"tags\": [\"小说\", \"苦难\"]}\n```",
            diagnostics={},
        )
        status, data = self._post({"imageDataUrl": TINY_DATA_URL})
        self.assertEqual(status, 200)
        self.assertEqual(data["title"], "活着")
        self.assertEqual(data["author"], "余华")
        # "小说" is a forbidden tag and is stripped by normalize_ocr_tags
        self.assertEqual(data["tags"], ["苦难"])

    def test_missing_image_returns_400(self):
        app_server.call_kimi_vision = lambda *a, **k: self.fail("should not call vision")
        status, data = self._post({})
        self.assertEqual(status, 400)
        self.assertIn("imageDataUrl", data["error"])

    def test_unauthorized_returns_401(self):
        status, data = self._post({"imageDataUrl": TINY_DATA_URL}, token="")
        self.assertEqual(status, 401)

    def test_missing_key_returns_friendly_error(self):
        # call_kimi_vision raises RuntimeError when MOONSHOT_API_KEY is unset;
        # the route catches it and returns a 500 with the message in `error`.
        app_server.MOONSHOT_API_KEY = ""
        app_server.call_kimi_vision = self._orig_kimi
        status, data = self._post({"imageDataUrl": TINY_DATA_URL})
        self.assertEqual(status, 500)
        self.assertIn("MOONSHOT_API_KEY", data["error"])


if __name__ == "__main__":
    unittest.main()
