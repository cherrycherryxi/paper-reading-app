import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import log_server


TEST_IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8C8AAAAASUVORK5CYII="


class OCRRecognitionFixTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        log_server.DB_PATH = base_dir / "test.db"
        log_server.UPLOAD_DIR = base_dir / "uploads"
        log_server.init_db()

        self.conn = log_server.get_conn()
        self.user_id = "user-test"
        self.username = "tester"
        self.token = "token-test"
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, self.username, "salt$digest", log_server.now_iso()),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(log_server.INITIAL_STATE, ensure_ascii=False), log_server.now_iso()),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (self.token, self.user_id, log_server.now_iso(), log_server.now_iso()),
        )
        self.conn.commit()
        self.conn.close()

        self.original_call_deepseek = log_server.call_deepseek
        self.original_call_kimi_vision = getattr(log_server, "call_kimi_vision", None)

    def tearDown(self):
        log_server.call_deepseek = self.original_call_deepseek
        if self.original_call_kimi_vision is None:
            if hasattr(log_server, "call_kimi_vision"):
                delattr(log_server, "call_kimi_vision")
        else:
            log_server.call_kimi_vision = self.original_call_kimi_vision
        self.temp_dir.cleanup()

    def request_json(self, method, path, payload=None, token=None):
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        handler = log_server.Handler.__new__(log_server.Handler)
        handler.path = path
        handler.command = method
        handler.headers = headers
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None

        def send_response(code):
            handler._status_code = code

        handler.send_response = send_response
        handler.send_header = lambda *args, **kwargs: None
        handler.end_headers = lambda: None

        if method == "POST":
            handler.do_POST()
        elif method == "GET":
            handler.do_GET()
        elif method == "PUT":
            handler.do_PUT()
        elif method == "DELETE":
            handler.do_DELETE()
        else:
            raise ValueError(f"Unsupported method: {method}")

        payload = json.loads(handler.wfile.getvalue().decode("utf-8"))
        return handler._status_code, payload

    def test_bug_exploration_ocr_should_use_kimi_vision_helper(self):
        calls = {"deepseek": 0, "kimi": 0}

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            calls["deepseek"] += 1
            return "deepseek output"

        def fake_kimi(messages, max_tokens=1200):
            calls["kimi"] += 1
            return "kimi output"

        log_server.call_deepseek = fake_deepseek
        log_server.call_kimi_vision = fake_kimi

        status, payload = self.request_json(
            "POST",
            "/api/ocr",
            {"imageDataUrl": TEST_IMAGE_DATA_URL},
            token=self.token,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["text"], "kimi output")
        self.assertEqual(calls["kimi"], 1)
        self.assertEqual(calls["deepseek"], 0)

    def test_preservation_chat_route_still_uses_deepseek_chat(self):
        observed = {}

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            observed["messages"] = messages
            observed["model"] = model
            return json.dumps({"reply": "ok", "actions": []}, ensure_ascii=False)

        log_server.call_deepseek = fake_deepseek

        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "你好", "bookId": ""},
            token=self.token,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["reply"], "ok")
        self.assertEqual(observed["model"], "deepseek-chat")
        self.assertEqual(observed["messages"][-1]["content"], "你好")

    def test_preservation_unauthenticated_ocr_returns_401_without_model_calls(self):
        calls = {"deepseek": 0, "kimi": 0}

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            calls["deepseek"] += 1
            return "should not run"

        def fake_kimi(messages, max_tokens=1200):
            calls["kimi"] += 1
            return "should not run"

        log_server.call_deepseek = fake_deepseek
        log_server.call_kimi_vision = fake_kimi

        status, payload = self.request_json(
            "POST",
            "/api/ocr",
            {"imageDataUrl": TEST_IMAGE_DATA_URL},
        )

        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Unauthorized")
        self.assertEqual(calls["deepseek"], 0)
        self.assertEqual(calls["kimi"], 0)


if __name__ == "__main__":
    unittest.main()
