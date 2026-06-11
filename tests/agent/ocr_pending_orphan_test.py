"""OPT-042 (Fix A): the fast OCR path must not leave an orphaned "pending"
quote card.

Before the fix, /api/quotes/ocr committed a `ocrStatus:"pending"` draft
(save_state) BEFORE running the synchronous fast OCR, then saved again with the
final status. If the request was interrupted between those two saves (server
restart / dropped connection), the card was orphaned at "pending" forever.

The fix makes the fast path save EXACTLY ONCE — after OCR finishes — so an
interruption leaves no card at all. The async AI path still persists the
pending draft (it must, so the client can poll and the background job can load
it).
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server

TEST_IMAGE_DATA_URL = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4"
    "2mP8/x8AAwMCAO+a8C8AAAAASUVORK5CYII="
)


class OcrPendingOrphanTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        self.user_id = "user-test"
        self.token = "token-test"
        seeded_state = dict(app_server.INITIAL_STATE)
        seeded_state["books"] = [{"id": "book-1", "title": "T", "author": "A"}]
        conn = app_server.get_conn()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, "tester", "salt$digest", app_server.now_iso()),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            (self.token, self.user_id, app_server.now_iso(), app_server.now_iso()),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps(seeded_state, ensure_ascii=False), app_server.now_iso()),
        )
        conn.commit()
        conn.close()

        # Count save_state calls so we can assert the fast path commits ONCE.
        self._orig_save_state = app_server.save_state
        self.save_calls = []

        def counting_save_state(conn, user_id, state):
            self.save_calls.append(1)
            return self._orig_save_state(conn, user_id, state)

        app_server.save_state = counting_save_state

        # Never spawn a real background thread; just record AI-path dispatch.
        self._orig_start_bg = app_server.start_background_ocr
        self.bg_calls = []
        app_server.start_background_ocr = lambda *a, **kw: self.bg_calls.append(a)

        self._orig_run_fast = app_server.run_fast_ocr

    def tearDown(self):
        app_server.save_state = self._orig_save_state
        app_server.start_background_ocr = self._orig_start_bg
        app_server.run_fast_ocr = self._orig_run_fast
        self.temp_dir.cleanup()

    def _post_ocr(self, engine):
        body = json.dumps(
            {"bookId": "book-1", "engine": engine, "imageDataUrl": TEST_IMAGE_DATA_URL}
        ).encode("utf-8")
        h = app_server.Handler.__new__(app_server.Handler)
        h.path = "/api/quotes/ocr"
        h.command = "POST"
        h.headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "Authorization": f"Bearer {self.token}",
        }
        h.rfile = BytesIO(body)
        h.wfile = BytesIO()
        h._status_code = None
        h.send_response = lambda code: setattr(h, "_status_code", code)
        h.send_header = lambda *a, **kw: None
        h.end_headers = lambda: None
        h.client_address = ("127.0.0.1", 9999)
        h.do_POST()
        return h._status_code, json.loads(h.wfile.getvalue().decode("utf-8"))

    def _persisted_quotes(self):
        conn = app_server.get_conn()
        state = app_server.load_state(conn, self.user_id)
        conn.close()
        return state.get("quotes", [])

    def test_fast_success_persists_done_and_saves_once(self):
        app_server.run_fast_ocr = lambda data_url, trace_event=None: (
            app_server.OcrExtractionResult("识别出来的正文", []),
            "快速识别",
        )
        status, payload = self._post_ocr("fast")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "done")
        quotes = self._persisted_quotes()
        self.assertEqual(len(quotes), 1)
        self.assertEqual(quotes[0]["ocrStatus"], "done")
        self.assertNotEqual(quotes[0]["ocrStatus"], "pending")
        # The orphan window was the pre-OCR pending commit; the fast path must
        # now save exactly once.
        self.assertEqual(len(self.save_calls), 1, "fast path must save_state exactly once")

    def test_fast_failure_persists_failed_not_pending(self):
        def boom(data_url, trace_event=None):
            raise RuntimeError("tesseract missing")

        app_server.run_fast_ocr = boom
        status, payload = self._post_ocr("fast")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "failed")
        quotes = self._persisted_quotes()
        self.assertEqual(len(quotes), 1)
        # The card is failed (image kept for retry), never stuck at pending.
        self.assertEqual(quotes[0]["ocrStatus"], "failed")
        self.assertEqual(len(self.save_calls), 1, "fast failure must also save once")

    def test_ai_path_persists_pending_and_dispatches_job(self):
        status, payload = self._post_ocr("ai")
        self.assertEqual(status, 202)
        self.assertEqual(payload["status"], "pending")
        quotes = self._persisted_quotes()
        self.assertEqual(len(quotes), 1)
        # AI is async: the pending draft MUST be persisted so the client can
        # poll and the background job can load it.
        self.assertEqual(quotes[0]["ocrStatus"], "pending")
        self.assertEqual(len(self.bg_calls), 1, "AI path must dispatch the background job")
        self.assertEqual(len(self.save_calls), 1, "AI path saves the pending draft once")


if __name__ == "__main__":
    unittest.main()
