import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


TEST_IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8C8AAAAASUVORK5CYII="


class OCRRecognitionFixTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.original_mcp_dispatcher = app_server.MCPToolDispatcher
        app_server.MCPToolDispatcher = app_server.LocalActionDispatcherForTests

        self.conn = app_server.get_conn()
        self.user_id = "user-test"
        self.username = "tester"
        self.token = "token-test"
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, self.username, "salt$digest", app_server.now_iso()),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(app_server.INITIAL_STATE, ensure_ascii=False), app_server.now_iso()),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (self.token, self.user_id, app_server.now_iso(), app_server.now_iso()),
        )
        self.conn.commit()
        self.conn.close()

        self.original_call_deepseek = app_server.call_deepseek
        self.original_call_kimi_vision = getattr(app_server, "call_kimi_vision", None)
        self.original_urlopen = app_server.urlopen
        self.original_moonshot_api_key = app_server.MOONSHOT_API_KEY
        self.original_moonshot_vision_model = app_server.MOONSHOT_VISION_MODEL
        self.original_kimi_vision_max_tokens = app_server.KIMI_VISION_MAX_TOKENS
        self.original_start_background_ocr = app_server.start_background_ocr
        self.original_throttle_kimi_vision_request = app_server.throttle_kimi_vision_request
        app_server.throttle_kimi_vision_request = lambda: None

    def tearDown(self):
        app_server.call_deepseek = self.original_call_deepseek
        app_server.urlopen = self.original_urlopen
        app_server.MOONSHOT_API_KEY = self.original_moonshot_api_key
        app_server.MOONSHOT_VISION_MODEL = self.original_moonshot_vision_model
        app_server.KIMI_VISION_MAX_TOKENS = self.original_kimi_vision_max_tokens
        app_server.start_background_ocr = self.original_start_background_ocr
        app_server.throttle_kimi_vision_request = self.original_throttle_kimi_vision_request
        if self.original_call_kimi_vision is None:
            if hasattr(app_server, "call_kimi_vision"):
                delattr(app_server, "call_kimi_vision")
        else:
            app_server.call_kimi_vision = self.original_call_kimi_vision
        app_server.MCPToolDispatcher = self.original_mcp_dispatcher
        self.temp_dir.cleanup()

    def request_json(self, method, path, payload=None, token=None):
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        handler = app_server.Handler.__new__(app_server.Handler)
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

        app_server.call_deepseek = fake_deepseek
        app_server.call_kimi_vision = fake_kimi

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

        app_server.call_deepseek = fake_deepseek

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

        app_server.call_deepseek = fake_deepseek
        app_server.call_kimi_vision = fake_kimi

        status, payload = self.request_json(
            "POST",
            "/api/ocr",
            {"imageDataUrl": TEST_IMAGE_DATA_URL},
        )

        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "Unauthorized")
        self.assertEqual(calls["deepseek"], 0)
        self.assertEqual(calls["kimi"], 0)

    def test_kimi_vision_retries_once_after_read_timeout(self):
        calls = []

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

            def read(self):
                return '{"choices":[{"message":{"content":"识别 成功"}}]}'.encode("utf-8")

        def fake_urlopen(request, timeout):
            calls.append(timeout)
            if len(calls) == 1:
                raise TimeoutError("The read operation timed out")
            return FakeResponse()

        app_server.urlopen = fake_urlopen
        app_server.MOONSHOT_API_KEY = "test-key"

        result = app_server.call_kimi_vision([{"role": "user", "content": "extract"}])

        self.assertEqual(result.content, "识别 成功")
        self.assertEqual(calls, [app_server.KIMI_VISION_TIMEOUT_SECONDS, app_server.KIMI_VISION_TIMEOUT_SECONDS])

    def test_kimi_vision_uses_configured_moonshot_vision_model_without_thinking(self):
        observed = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

            def read(self):
                return '{"choices":[{"message":{"content":"ok"}}]}'.encode("utf-8")

        def fake_urlopen(request, timeout):
            observed["body"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse()

        app_server.urlopen = fake_urlopen
        app_server.MOONSHOT_API_KEY = "test-key"
        app_server.MOONSHOT_VISION_MODEL = "kimi-k2.5"
        app_server.KIMI_VISION_MAX_TOKENS = 4096

        result = app_server.call_kimi_vision([{"role": "user", "content": "extract"}])

        self.assertEqual(result.content, "ok")
        self.assertEqual(observed["body"]["model"], "kimi-k2.5")
        self.assertEqual(observed["body"]["thinking"], {"type": "disabled"})
        self.assertEqual(observed["body"]["max_tokens"], 4096)

    def test_kimi_vision_trace_diagnostics_include_empty_content_reasoning_usage(self):
        observed = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

            def read(self):
                return json.dumps(
                    {
                        "model": "kimi-k2.5",
                        "choices": [
                            {
                                "message": {"content": "", "reasoning_content": "thinking"},
                                "finish_reason": "length",
                            }
                        ],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 4096, "total_tokens": 4106},
                    },
                    ensure_ascii=False,
                ).encode("utf-8")

        def fake_urlopen(request, timeout):
            observed["body"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse()

        app_server.urlopen = fake_urlopen
        app_server.MOONSHOT_API_KEY = "test-key"
        app_server.MOONSHOT_VISION_MODEL = "kimi-k2.5"

        result = app_server.call_kimi_vision([{"role": "user", "content": "extract"}])

        self.assertEqual(result.content, "")
        self.assertEqual(result.diagnostics["finishReason"], "length")
        self.assertEqual(result.diagnostics["contentChars"], 0)
        self.assertEqual(result.diagnostics["reasoningChars"], len("thinking"))
        self.assertEqual(result.diagnostics["usage"]["completionTokens"], 4096)
        self.assertEqual(observed["body"]["thinking"], {"type": "disabled"})

    def test_quote_ocr_creates_draft_and_background_fills_clean_text(self):
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "月亮虎", "author": "作者"}],
            "quotes": [],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        def fake_kimi(messages, max_tokens=1200):
            return "这 是 一 段\n\n\n中文 OCR 文字 。"

        app_server.call_kimi_vision = fake_kimi
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "bookId": "book-1",
                "imageDataUrl": TEST_IMAGE_DATA_URL,
                "filename": "quote.png",
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        self.assertTrue(payload.get("traceId", "").startswith("trace-"))
        quote_id = payload["quoteId"]
        returned_quote = next(item for item in payload["state"]["quotes"] if item["id"] == quote_id)
        self.assertEqual(returned_quote["ocrStatus"], "pending")
        self.assertEqual(returned_quote["content"], "")
        self.assertTrue(returned_quote["imageUrl"].startswith(f"/media/{self.user_id}/"))
        self.assertEqual(returned_quote["ocrTraceId"], payload["traceId"])

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        trace = app_server.TraceManager().get_trace(conn, payload["traceId"], self.user_id)
        log = conn.execute(
            "SELECT trace_id, latency_ms, parse_status FROM model_logs WHERE type = 'ocr' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == quote_id)
        self.assertEqual(quote["ocrStatus"], "done")
        self.assertEqual(quote["content"], "这是一段\n\n中文 OCR 文字。")
        self.assertIsNotNone(trace)
        self.assertEqual(trace["requestType"], "ocr")
        self.assertEqual(trace["message"], f"quote_ocr:{quote_id}")
        event_types = [event["eventType"] for event in trace["events"]]
        self.assertIn("REQUEST_RECEIVED", event_types)
        self.assertIn("DRAFT_SAVED", event_types)
        self.assertIn("BACKGROUND_JOB_STARTED", event_types)
        self.assertIn("KIMI_REQUEST_STARTED", event_types)
        self.assertIn("KIMI_REQUEST_FINISHED", event_types)
        self.assertIn("QUOTE_UPDATED", event_types)
        self.assertEqual(log["trace_id"], payload["traceId"])
        self.assertGreaterEqual(log["latency_ms"], 0)
        self.assertEqual(log["parse_status"], "success")

    def test_quote_ocr_auto_applies_tags_from_structured_vision_output(self):
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        observed_prompts = []

        def fake_kimi(messages, max_tokens=1200):
            observed_prompts.append(messages[0]["content"][1]["text"])
            return json.dumps(
                {
                    "text": "组织 行为 的 关键 是 激励 。",
                    "tags": ["小说", "文学", "月亮虎", "组织", "管理", "#激励", "这是一个特别特别长的无效标签"],
                },
                ensure_ascii=False,
            )

        app_server.call_kimi_vision = fake_kimi
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "bookId": "book-1",
                "tags": ["手动标签"],
                "imageDataUrl": TEST_IMAGE_DATA_URL,
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        self.assertIn('"tags"', observed_prompts[0])
        self.assertIn("坏标签示例：小说、文学、月亮虎", observed_prompts[0])

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == payload["quoteId"])
        self.assertEqual(quote["content"], "组织行为的关键是激励。")
        self.assertEqual(quote["tags"], ["手动标签", "组织", "管理", "激励"])
        self.assertEqual(quote["ocrStatus"], "done")

    def test_ocr_parser_unwraps_nested_json_text_payload(self):
        nested = json.dumps(
            {
                "text": json.dumps({"text": "我 不 喜欢 按 年代 平铺 直叙。", "tags": ["记忆"]}, ensure_ascii=False),
                "tags": [],
            },
            ensure_ascii=False,
        )

        result = app_server.parse_ocr_extraction(nested)

        self.assertEqual(result.text, "我不喜欢按年代平铺直叙。")
        self.assertEqual(result.tags, ["记忆"])

    def test_quote_ocr_uses_rescue_when_structured_result_looks_truncated(self):
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        calls = []

        def fake_kimi(messages, max_tokens=1200):
            prompt = messages[0]["content"][1]["text"]
            calls.append(prompt)
            if len(calls) == 1:
                return json.dumps({"text": "理论上它们仿佛", "tags": []}, ensure_ascii=False)
            return "理论上它们仿佛更加富有成效。而我的一些按键却不管用。"

        app_server.call_kimi_vision = fake_kimi
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "bookId": "book-1",
                "imageDataUrl": TEST_IMAGE_DATA_URL,
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        self.assertEqual(len(calls), 2)
        self.assertIn("不要判断划线、标记或标签", calls[1])

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        trace = app_server.TraceManager().get_trace(conn, payload["traceId"], self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == payload["quoteId"])
        self.assertEqual(quote["content"], "理论上它们仿佛更加富有成效。而我的一些按键却不管用。")
        parsed_event = next(event for event in trace["events"] if event["eventType"] == "OCR_EXTRACTION_PARSED")
        self.assertTrue(parsed_event["metadata"]["needsRescue"])

    def test_quote_ocr_does_not_overwrite_user_content_changed_during_background_job(self):
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        captured_job = {}
        app_server.start_background_ocr = lambda target, *args: captured_job.update({"target": target, "args": args})
        app_server.call_kimi_vision = lambda messages, max_tokens=1200: "模型 识别 结果"

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "bookId": "book-1",
                "content": "原始内容",
                "imageDataUrl": TEST_IMAGE_DATA_URL,
            },
            token=self.token,
        )
        self.assertEqual(status, 202)
        quote_id = payload["quoteId"]

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        saved["quotes"][0]["content"] = "用户后来手动改过"
        app_server.save_state(conn, self.user_id, saved)
        conn.close()

        captured_job["target"](*captured_job["args"])

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == quote_id)
        self.assertEqual(quote["content"], "用户后来手动改过")
        self.assertEqual(quote["ocrText"], "模型识别结果")
        self.assertEqual(quote["ocrStatus"], "done")

    def test_quote_reocr_replaces_previous_ocr_content_and_clears_stale_fields(self):
        old_image_url = app_server.save_image(self.user_id, TEST_IMAGE_DATA_URL, "old.png")
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [{
                "id": "quote-1",
                "bookId": "book-1",
                "page": 8,
                "kind": "quote",
                "content": "旧识别内容",
                "reflection": "保留理解",
                "tags": ["旧标签"],
                "imageUrl": old_image_url,
                "ocrText": "旧备用 OCR",
                "ocrStatus": "done",
                "ocrError": "旧错误",
                "createdAt": app_server.now_iso(),
            }],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        app_server.call_kimi_vision = lambda messages, max_tokens=1200: json.dumps(
            {"text": "新 拍照 识别 内容", "tags": ["新主题"]},
            ensure_ascii=False,
        )
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "quoteId": "quote-1",
                "bookId": "book-1",
                "content": "旧识别内容",
                "reflection": "保留理解",
                "tags": ["旧标签"],
                "imageDataUrl": TEST_IMAGE_DATA_URL,
                "filename": "new.png",
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        returned_quote = next(item for item in payload["state"]["quotes"] if item["id"] == "quote-1")
        self.assertNotEqual(returned_quote["imageUrl"], old_image_url)
        self.assertEqual(returned_quote["content"], "旧识别内容")
        self.assertEqual(returned_quote["ocrStatus"], "pending")
        self.assertNotIn("ocrText", returned_quote)
        self.assertNotIn("ocrError", returned_quote)

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == "quote-1")
        self.assertNotEqual(quote["imageUrl"], old_image_url)
        self.assertEqual(quote["content"], "新拍照识别内容")
        self.assertEqual(quote["reflection"], "保留理解")
        self.assertEqual(quote["tags"], ["旧标签", "新主题"])
        self.assertEqual(quote["ocrStatus"], "done")
        self.assertNotIn("ocrText", quote)
        self.assertNotIn("ocrError", quote)

    def test_quote_ocr_can_reuse_saved_image_url_from_existing_quote(self):
        image_url = app_server.save_image(self.user_id, TEST_IMAGE_DATA_URL, "quote.png")
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [{
                "id": "quote-1",
                "bookId": "book-1",
                "page": 8,
                "kind": "quote",
                "content": "",
                "reflection": "先写我的理解",
                "tags": [],
                "imageUrl": image_url,
                "createdAt": app_server.now_iso(),
            }],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        app_server.call_kimi_vision = lambda messages, max_tokens=1200: "已有 图片 的 识别 结果"
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "quoteId": "quote-1",
                "bookId": "book-1",
                "imageUrl": image_url,
                "reflection": "先写我的理解",
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        returned_quote = next(item for item in payload["state"]["quotes"] if item["id"] == "quote-1")
        self.assertEqual(returned_quote["imageUrl"], image_url)
        self.assertEqual(returned_quote["ocrStatus"], "pending")

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == "quote-1")
        self.assertEqual(quote["imageUrl"], image_url)
        self.assertEqual(quote["content"], "已有图片的识别结果")
        self.assertEqual(quote["reflection"], "先写我的理解")
        self.assertEqual(quote["ocrStatus"], "done")

    def test_quote_ocr_uses_rescue_prompt_when_first_response_is_empty(self):
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        calls = []

        def fake_kimi(messages, max_tokens=1200):
            prompt = messages[0]["content"][1]["text"]
            calls.append(prompt)
            return "" if len(calls) == 1 else "重试 后 的 识别 结果"

        app_server.call_kimi_vision = fake_kimi
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "bookId": "book-1",
                "imageDataUrl": TEST_IMAGE_DATA_URL,
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        self.assertEqual(len(calls), 2)
        self.assertIn("不要判断划线、标记或标签", calls[1])

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == payload["quoteId"])
        self.assertEqual(quote["content"], "重试后的识别结果")
        self.assertEqual(quote["ocrStatus"], "done")

    def test_quote_ocr_uses_plain_text_rescue_when_structured_attempt_is_empty(self):
        state = {
            **app_server.INITIAL_STATE,
            "books": [{"id": "book-1", "title": "测试书", "author": "作者"}],
            "quotes": [],
        }
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        calls = []

        def fake_kimi(messages, max_tokens=1200):
            prompt = messages[0]["content"][1]["text"]
            calls.append(prompt)
            if len(calls) == 1:
                return json.dumps({"text": "", "tags": []}, ensure_ascii=False)
            return "我 随身 携带 的 那 副 纸牌 永远 在 洗牌 和 重洗。"

        app_server.call_kimi_vision = fake_kimi
        app_server.start_background_ocr = lambda target, *args: target(*args)

        status, payload = self.request_json(
            "POST",
            "/api/quotes/ocr",
            {
                "engine": "ai",
                "bookId": "book-1",
                "imageDataUrl": TEST_IMAGE_DATA_URL,
            },
            token=self.token,
        )

        self.assertEqual(status, 202)
        self.assertEqual(len(calls), 2)
        self.assertIn("不要判断划线、标记或标签", calls[1])

        conn = app_server.get_conn()
        saved = app_server.load_state(conn, self.user_id)
        conn.close()
        quote = next(item for item in saved["quotes"] if item["id"] == payload["quoteId"])
        self.assertEqual(quote["content"], "我随身携带的那副纸牌永远在洗牌和重洗。")
        self.assertEqual(quote["ocrStatus"], "done")
        self.assertEqual(quote["tags"], [])

    def test_kimi_vision_request_throttle_spaces_consecutive_calls(self):
        app_server.throttle_kimi_vision_request = self.original_throttle_kimi_vision_request
        sleep_calls = []
        monotonic_values = iter([100.0, 100.0, 101.5, 101.5])
        original_monotonic = app_server.time.monotonic
        original_sleep = app_server.time.sleep
        original_last_request_at = app_server.KIMI_VISION_LAST_REQUEST_AT
        app_server.KIMI_VISION_LAST_REQUEST_AT = 0.0
        app_server.time.monotonic = lambda: next(monotonic_values)
        app_server.time.sleep = lambda seconds: sleep_calls.append(seconds)

        try:
            app_server.throttle_kimi_vision_request()
            app_server.throttle_kimi_vision_request()
        finally:
            app_server.time.monotonic = original_monotonic
            app_server.time.sleep = original_sleep
            app_server.KIMI_VISION_LAST_REQUEST_AT = original_last_request_at

        self.assertEqual(sleep_calls, [app_server.KIMI_VISION_MIN_INTERVAL_SECONDS - 1.5])


if __name__ == "__main__":
    unittest.main()
