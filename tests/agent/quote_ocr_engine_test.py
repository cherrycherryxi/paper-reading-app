"""
OPT-016: Tests for the two-tier quote OCR engine selection.

- call_tesseract_ocr(): fast, non-LLM local OCR via the `tesseract` CLI
  (subprocess) — normalizes stdout, and degrades to TesseractUnavailable on
  missing binary / timeout / nonzero exit (so the endpoint can return a friendly
  "use AI 精识别" instead of 500).
- /api/quotes/ocr: engine="fast" (default) runs Tesseract synchronously and
  returns 200 + recognizedText; engine="ai" keeps the 202 background-job flow.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server

# data:image/png;base64 of b"hello" — valid for decode_data_url; the actual
# bytes never reach a real tesseract because subprocess/call_tesseract_ocr is
# mocked in these tests.
TINY_DATA_URL = "data:image/png;base64,aGVsbG8="


class _FakeResp:
    """Minimal context-manager stand-in for urlopen() responses in tests."""
    def __init__(self, payload):
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class CallTesseractOcrTests(unittest.TestCase):
    def test_returns_normalized_text_from_stdout(self):
        fake = subprocess.CompletedProcess(
            args=["tesseract"], returncode=0,
            stdout="读 书 笔 记\n\n\n第二段".encode("utf-8"), stderr=b"",
        )
        with mock.patch.object(app_server.shutil, "which", return_value="/usr/bin/tesseract"), \
             mock.patch.object(app_server.subprocess, "run", return_value=fake) as run:
            result = app_server.call_tesseract_ocr(TINY_DATA_URL)
        # normalize_ocr_text collapses inter-CJK spaces and >2 blank lines
        self.assertEqual(result.text, "读书笔记\n\n第二段")
        self.assertEqual(result.tags, [])
        # invoked with --psm 6 and the configured langs
        args = run.call_args.args[0]
        self.assertIn("--psm", args)
        self.assertIn(app_server.TESSERACT_LANGS, args)

    def test_default_langs_excludes_eng(self):
        # Regression (bug-OCR-eng): adding +eng makes the LSTM engine fit Latin
        # glyphs onto Chinese strokes and collapses whole pages into gibberish.
        # The shipped default must be chi_sim ONLY.
        default = os.getenv("TESSERACT_LANGS")
        self.assertIsNone(
            default,
            "TESSERACT_LANGS is set in the env; unset it to test the shipped default",
        )
        self.assertEqual(app_server.TESSERACT_LANGS, "chi_sim")
        self.assertNotIn("eng", app_server.TESSERACT_LANGS)

    def test_missing_binary_raises_unavailable(self):
        with mock.patch.object(app_server.shutil, "which", return_value=None):
            with self.assertRaises(app_server.TesseractUnavailable):
                app_server.call_tesseract_ocr(TINY_DATA_URL)

    def test_timeout_raises_unavailable(self):
        with mock.patch.object(app_server.shutil, "which", return_value="/usr/bin/tesseract"), \
             mock.patch.object(app_server.subprocess, "run",
                               side_effect=subprocess.TimeoutExpired(cmd="tesseract", timeout=15)):
            with self.assertRaises(app_server.TesseractUnavailable):
                app_server.call_tesseract_ocr(TINY_DATA_URL)

    def test_nonzero_exit_raises_unavailable(self):
        fake = subprocess.CompletedProcess(args=["tesseract"], returncode=1, stdout=b"", stderr=b"boom")
        with mock.patch.object(app_server.shutil, "which", return_value="/usr/bin/tesseract"), \
             mock.patch.object(app_server.subprocess, "run", return_value=fake):
            with self.assertRaises(app_server.TesseractUnavailable):
                app_server.call_tesseract_ocr(TINY_DATA_URL)


class QuoteOcrEngineRoutingTests(unittest.TestCase):
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
        state = {
            "books": [{"id": "book-1", "title": "Test Book", "author": "A", "tags": [], "notes": ""}],
            "sessions": [], "quotes": [], "chatHistories": {},
        }
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(state, ensure_ascii=False), now),
        )
        conn.commit()
        conn.close()

        self._orig_tess = app_server.call_tesseract_ocr
        self._orig_bg = app_server.start_background_ocr
        self.addCleanup(self._restore)

    def _restore(self):
        app_server.call_tesseract_ocr = self._orig_tess
        app_server.start_background_ocr = self._orig_bg
        self.temp_dir.cleanup()

    def _post_ocr(self, payload):
        body = json.dumps({"bookId": "book-1", "imageDataUrl": TINY_DATA_URL, **payload}).encode("utf-8")
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/quotes/ocr"
        handler.command = "POST"
        handler.headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "Authorization": f"Bearer {self.token}",
        }
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda code: setattr(handler, "_status_code", code)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        return handler._status_code, json.loads(handler.wfile.getvalue().decode("utf-8"))

    def _quote(self, state, quote_id):
        return next((q for q in state.get("quotes", []) if q.get("id") == quote_id), None)

    def test_fast_is_default_and_returns_sync_text(self):
        # No cloud key → fast path is Tesseract-only (deterministic regardless of
        # ambient env / a sourced .env).
        app_server.call_tesseract_ocr = lambda *a, **k: app_server.OcrExtractionResult("识别出的正文", [], False)
        with mock.patch.object(app_server, "BAIDU_OCR_API_KEY", ""), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", ""):
            status, data = self._post_ocr({})  # no engine → default fast
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "done")
        self.assertEqual(data["recognizedText"], "识别出的正文")
        quote = self._quote(data["state"], data["quoteId"])
        self.assertEqual(quote["content"], "识别出的正文")
        self.assertEqual(quote["ocrStatus"], "done")
        self.assertEqual(quote["ocrSource"], "本地 OCR (Tesseract)")

    def test_explicit_fast_engine(self):
        app_server.call_tesseract_ocr = lambda *a, **k: app_server.OcrExtractionResult("文本", [], False)
        with mock.patch.object(app_server, "BAIDU_OCR_API_KEY", ""), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", ""):
            status, data = self._post_ocr({"engine": "fast"})
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "done")

    def test_fast_uses_cloud_when_key_configured(self):
        # With a Baidu key configured, the fast path routes to cloud OCR and
        # labels the source accordingly (ocrSource == "云 OCR (百度)").
        self._orig_cloud = app_server.call_cloud_ocr
        self.addCleanup(lambda: setattr(app_server, "call_cloud_ocr", self._orig_cloud))
        app_server.call_cloud_ocr = lambda *a, **k: app_server.OcrExtractionResult("云端识别正文", [], False)
        with mock.patch.object(app_server, "FAST_OCR_ENGINE", "auto"), \
             mock.patch.object(app_server, "BAIDU_OCR_API_KEY", "k"), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", "s"):
            status, data = self._post_ocr({"engine": "fast"})
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "done")
        self.assertEqual(data["recognizedText"], "云端识别正文")
        self.assertEqual(data["ocrSource"], "云 OCR (百度)")
        quote = self._quote(data["state"], data["quoteId"])
        self.assertEqual(quote["ocrSource"], "云 OCR (百度)")

    def test_ai_engine_uses_background_job_and_returns_202(self):
        calls = []
        app_server.start_background_ocr = lambda *a, **k: calls.append(a)
        status, data = self._post_ocr({"engine": "ai"})
        self.assertEqual(status, 202)
        self.assertEqual(data["status"], "pending")
        self.assertEqual(len(calls), 1)  # background job dispatched, not run inline
        quote = self._quote(data["state"], data["quoteId"])
        self.assertEqual(quote["ocrStatus"], "pending")

    def test_fast_unavailable_degrades_to_failed_200_not_500(self):
        def boom(*a, **k):
            raise app_server.TesseractUnavailable("tesseract 未安装")
        app_server.call_tesseract_ocr = boom
        status, data = self._post_ocr({"engine": "fast"})
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "failed")
        self.assertEqual(data["error"], "fast_ocr_failed")
        # draft is preserved so the user can retry with AI 精识别
        quote = self._quote(data["state"], data["quoteId"])
        self.assertEqual(quote["ocrStatus"], "failed")


class CallCloudOcrTests(unittest.TestCase):
    """OPT-016 mid-term: Baidu accurate_basic cloud OCR for the fast path."""

    def setUp(self):
        # Reset the in-process token cache so tests don't leak into each other.
        app_server._baidu_token_cache["token"] = ""
        app_server._baidu_token_cache["expires_at"] = 0.0

    def test_parses_words_result_into_newline_text(self):
        ocr_resp = _FakeResp({"words_result": [{"words": "第一行"}, {"words": "第二行"}], "words_result_num": 2})
        with mock.patch.object(app_server, "BAIDU_OCR_API_KEY", "k"), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", "s"), \
             mock.patch.object(app_server, "_baidu_access_token", return_value="tok"), \
             mock.patch.object(app_server, "urlopen", return_value=ocr_resp):
            result = app_server.call_cloud_ocr(TINY_DATA_URL)
        self.assertEqual(result.text, "第一行\n第二行")
        self.assertEqual(result.tags, [])

    def test_token_is_cached_across_calls(self):
        token_resp = lambda: _FakeResp({"access_token": "tok", "expires_in": 2592000})
        ocr_resp = lambda: _FakeResp({"words_result": [{"words": "x"}]})
        # 1 token fetch + 2 OCR calls expected (token reused on the 2nd OCR call)
        responses = [token_resp(), ocr_resp(), ocr_resp()]
        with mock.patch.object(app_server, "BAIDU_OCR_API_KEY", "k"), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", "s"), \
             mock.patch.object(app_server, "urlopen", side_effect=responses) as urlopen:
            app_server.call_cloud_ocr(TINY_DATA_URL)
            app_server.call_cloud_ocr(TINY_DATA_URL)
        self.assertEqual(urlopen.call_count, 3)

    def test_error_code_raises_cloud_unavailable(self):
        # error_code 17 = daily quota exhausted
        bad = _FakeResp({"error_code": 17, "error_msg": "Open api daily request limit reached"})
        with mock.patch.object(app_server, "_baidu_access_token", return_value="tok"), \
             mock.patch.object(app_server, "urlopen", return_value=bad):
            with self.assertRaises(app_server.CloudOcrUnavailable):
                app_server.call_cloud_ocr(TINY_DATA_URL)

    def test_assemble_drops_facing_page_noise_and_reflows(self):
        # Main body: left-aligned wide lines. Facing-page noise: narrow fragments
        # far to the right, interleaved by top. Expect noise gone + lines joined
        # into continuous text (Chinese wrap-lines have no separator).
        def line(words, left, top, width, height=60):
            return {"words": words, "location": {"left": left, "top": top, "width": width, "height": height}}
        # tops pitch ~78px with 60px glyph height → small gap (no false paragraph break)
        words_result = [
            line("所有那些凡俗的旅行家都是财迷心窍，或是天", 150, 330, 970),
            line("你们的看", 1195, 314, 153),            # noise
            line("生不安分，在研究指南针的过程中成就永恒。", 145, 408, 959),
            line("反省你我", 1204, 388, 144),            # noise
            line("而最有趣的一场抵达莫过于一艘轮船。", 150, 486, 912),
        ]
        text = app_server._assemble_baidu_lines(words_result)
        self.assertNotIn("你们的看", text)
        self.assertNotIn("反省你我", text)
        self.assertEqual(
            text,
            "所有那些凡俗的旅行家都是财迷心窍，或是天生不安分，在研究指南针的过程中成就永恒。而最有趣的一场抵达莫过于一艘轮船。",
        )

    def test_assemble_inserts_paragraph_break_on_large_vertical_gap(self):
        def line(words, top, height=40):
            return {"words": words, "location": {"left": 150, "top": top, "width": 900, "height": height}}
        words_result = [line("第一段最后一句。", 100), line("第二段第一句。", 400)]  # 260px gap >> 40px
        text = app_server._assemble_baidu_lines(words_result)
        self.assertEqual(text, "第一段最后一句。\n\n第二段第一句。")

    def test_assemble_without_location_falls_back_to_newline_join(self):
        words_result = [{"words": "甲"}, {"words": "乙"}]
        self.assertEqual(app_server._assemble_baidu_lines(words_result), "甲\n乙")

    def test_no_key_raises_cloud_unavailable(self):
        with mock.patch.object(app_server, "BAIDU_OCR_API_KEY", ""), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", ""):
            with self.assertRaises(app_server.CloudOcrUnavailable):
                app_server.call_cloud_ocr(TINY_DATA_URL)


class ResolveFastEngineTests(unittest.TestCase):
    def test_auto_without_key_is_tesseract_only(self):
        with mock.patch.object(app_server, "FAST_OCR_ENGINE", "auto"), \
             mock.patch.object(app_server, "BAIDU_OCR_API_KEY", ""), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", ""):
            chain = app_server._resolve_fast_engine()
        self.assertEqual([key for key, _ in chain], ["tesseract"])

    def test_auto_with_key_is_cloud_only_no_tesseract_fallback(self):
        # 2026-06-24: when cloud is configured, auto mode is cloud-ONLY. We don't
        # cross-fall-back to Tesseract — its Chinese accuracy is poor enough that
        # falling back on a transient cloud timeout produces garbage; a clear
        # "失败，请重试" is better (see _resolve_fast_engine docstring).
        with mock.patch.object(app_server, "FAST_OCR_ENGINE", "auto"), \
             mock.patch.object(app_server, "BAIDU_OCR_API_KEY", "k"), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", "s"):
            chain = app_server._resolve_fast_engine()
        self.assertEqual([key for key, _ in chain], ["cloud"])

    def test_forced_cloud_skips_tesseract(self):
        with mock.patch.object(app_server, "FAST_OCR_ENGINE", "cloud"):
            chain = app_server._resolve_fast_engine()
        self.assertEqual([key for key, _ in chain], ["cloud"])

    def test_run_fast_ocr_raises_when_cloud_fails_and_configured(self):
        # Cloud configured + auto → no Tesseract fallback → the cloud error
        # propagates so the endpoint returns "failed" (no garbage), not silent
        # local OCR. call_tesseract_ocr must NOT be invoked.
        def cloud_boom(*a, **k):
            raise app_server.CloudOcrUnavailable("云识别超时")
        tess = mock.Mock(return_value=app_server.OcrExtractionResult("回落文本", [], False))
        with mock.patch.object(app_server, "FAST_OCR_ENGINE", "auto"), \
             mock.patch.object(app_server, "BAIDU_OCR_API_KEY", "k"), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", "s"), \
             mock.patch.object(app_server, "call_cloud_ocr", side_effect=cloud_boom), \
             mock.patch.object(app_server, "call_tesseract_ocr", tess):
            with self.assertRaises(app_server.CloudOcrUnavailable):
                app_server.run_fast_ocr(TINY_DATA_URL)
        tess.assert_not_called()

    def test_run_fast_ocr_uses_tesseract_when_cloud_not_configured(self):
        # No key → Tesseract remains the sole offline engine.
        with mock.patch.object(app_server, "FAST_OCR_ENGINE", "auto"), \
             mock.patch.object(app_server, "BAIDU_OCR_API_KEY", ""), \
             mock.patch.object(app_server, "BAIDU_OCR_SECRET_KEY", ""), \
             mock.patch.object(app_server, "call_tesseract_ocr",
                               return_value=app_server.OcrExtractionResult("本地文本", [], False)):
            result, label = app_server.run_fast_ocr(TINY_DATA_URL)
        self.assertEqual(result.text, "本地文本")
        self.assertEqual(label, "本地 OCR (Tesseract)")


if __name__ == "__main__":
    unittest.main()
