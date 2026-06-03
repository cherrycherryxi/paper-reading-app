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


class AgentBackendPropertyTests(unittest.TestCase):
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
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, self.username, "salt$digest", now),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (self.token, self.user_id, now, now),
        )
        seeded_state = {
            "books": [
                {
                    "id": "book-1",
                    "title": "Test Book",
                    "author": "Author",
                    "tags": ["seed"],
                    "notes": "initial notes",
                    "currentPage": 12,
                    "totalPages": 200,
                }
            ],
            "sessions": [],
            "quotes": [],
            "chatHistories": {},
        }
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(seeded_state, ensure_ascii=False), now),
        )
        self.conn.commit()
        self.conn.close()
        self.original_call_deepseek = app_server.call_deepseek
        self.original_call_deepseek_stream = app_server.call_deepseek_stream

    def tearDown(self):
        app_server.call_deepseek = self.original_call_deepseek
        app_server.call_deepseek_stream = self.original_call_deepseek_stream
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
        handler.send_response = lambda code: setattr(handler, "_status_code", code)
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

    def request_sse_events(self, method, path, payload=None, token=None):
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
        handler.send_response = lambda code: setattr(handler, "_status_code", code)
        handler.send_header = lambda *args, **kwargs: None
        handler.end_headers = lambda: None

        if method == "POST":
            handler.do_POST()
        else:
            raise ValueError(f"Unsupported method: {method}")

        raw = handler.wfile.getvalue().decode("utf-8")
        events = []
        for part in raw.split("\n\n"):
            part = part.strip()
            if not part.startswith("data: "):
                continue
            events.append(json.loads(part[6:]))
        return handler._status_code, events

    def load_state(self):
        conn = app_server.get_conn()
        state = app_server.load_state(conn, self.user_id)
        conn.close()
        return state

    def get_table_columns(self, table_name):
        conn = app_server.get_conn()
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        conn.close()
        return {row["name"] for row in rows}

    def _fake_chat_with_action(self, action_type, data, book_id="book-1", message="test-message"):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "ok", "actions": [{"type": action_type, "data": data}]},
                ensure_ascii=False,
            )

        app_server.call_deepseek = fake_deepseek
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": message, "bookId": book_id},
            token=self.token,
        )
        self.assertEqual(status, 200)
        return payload

    def test_property_database_migration_creates_expected_schema(self):
        expected_tables = {"agent_traces", "agent_actions", "agent_trace_events", "model_logs"}
        conn = app_server.get_conn()
        tables = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        conn.close()
        self.assertTrue(expected_tables.issubset(tables))

        self.assertTrue(
            {
                "trace_id",
                "user_id",
                "request_type",
                "status",
                "parse_status",
                "validation_status",
                "latency_ms",
                "input_tokens",
                "output_tokens",
                "message",
                "book_id",
                "error_message",
                "created_at",
                "updated_at",
            }.issubset(self.get_table_columns("agent_traces"))
        )
        self.assertTrue(
            {
                "action_id",
                "trace_id",
                "user_id",
                "action_type",
                "action_data",
                "status",
                "error_message",
                "created_at",
                "updated_at",
                "approved_at",
                "executed_at",
            }.issubset(self.get_table_columns("agent_actions"))
        )
        self.assertTrue(
            {"event_id", "trace_id", "event_type", "metadata", "created_at"}.issubset(
                self.get_table_columns("agent_trace_events")
            )
        )
        self.assertTrue(
            {
                "trace_id",
                "latency_ms",
                "input_tokens",
                "output_tokens",
                "parse_status",
                "validation_status",
            }.issubset(self.get_table_columns("model_logs"))
        )

    def test_property_request_validation_ordering(self):
        validator = app_server.AgentRequestValidator()
        cases = [
            ("", "", "message is required"),
            ("x" * 2001, "", "message exceeds 2000 characters"),
            ("spamspam" * 20, "", "message appears excessively repetitive"),
            ("valid content", "missing-book", "bookId does not exist"),
        ]
        state = self.load_state()
        for message, book_id, expected_error in cases:
            result = validator.validate_chat_request(message, book_id, state)
            self.assertFalse(result.is_valid)
            self.assertEqual(result.error_message, expected_error)

        valid = validator.validate_chat_request("  hello   world  ", "book-1", state)
        self.assertTrue(valid.is_valid)
        self.assertEqual(valid.sanitized_input, "hello world")

    def test_property_parse_failure_visibility(self):
        parser = app_server.ResponseParser()
        cases = [
            ("plain text response", app_server.PARSE_DEGRADED, "plain text response", []),
            ("", app_server.PARSE_FAILED, "", []),
            ("```json\n{\"reply\":\"ok\",\"actions\":[]}\n```", app_server.PARSE_MARKDOWN_CLEANED, "ok", []),
        ]
        for raw, expected_status, expected_reply, expected_actions in cases:
            result = parser.parse(raw)
            self.assertEqual(result.parse_status, expected_status)
            self.assertEqual(result.reply, expected_reply)
            self.assertEqual(result.actions, expected_actions)
            if expected_status in {app_server.PARSE_DEGRADED, app_server.PARSE_FAILED}:
                self.assertTrue(result.error_message)

    def test_parser_salvages_reply_from_jsonish_output_with_unescaped_quotes(self):
        parser = app_server.ResponseParser()
        raw = '{"reply": "这里有三个问题：\\n\\n**1. 书写本身就是一种反抗吗？**\\n这些"低俗"情绪值得讨论。", "actions": [{"type": "question", "data": {"content": "这些"低俗"情绪？"}}]}'
        result = parser.parse(raw)
        self.assertEqual(result.parse_status, app_server.PARSE_DEGRADED)
        self.assertIn("这里有三个问题", result.reply)
        self.assertIn('这些"低俗"情绪值得讨论。', result.reply)
        self.assertEqual(result.actions, [])

    def test_parser_salvages_valid_actions_when_reply_json_is_malformed(self):
        parser = app_server.ResponseParser()
        raw = '{"reply": "这句"不成 JSON"，但 actions 是完整的", "actions": [{"type": "question", "data": {"content": "我们应该追问什么？"}}]}'
        result = parser.parse(raw)

        self.assertEqual(result.parse_status, app_server.PARSE_DEGRADED)
        self.assertIn("这句", result.reply)
        self.assertEqual(result.actions, [{"type": "question", "data": {"content": "我们应该追问什么？"}}])

    def test_parser_prefers_json_block_when_model_outputs_text_then_json(self):
        parser = app_server.ResponseParser()
        raw = '先说了一段自然语言。\n\n```json\n{"reply":"结构化回答","actions":[{"type":"question","data":{"content":"追问什么？"}}]}\n```'
        result = parser.parse(raw)

        self.assertEqual(result.parse_status, app_server.PARSE_MARKDOWN_CLEANED)
        self.assertEqual(result.reply, "结构化回答")
        self.assertEqual(result.actions, [{"type": "question", "data": {"content": "追问什么？"}}])

    def test_reply_extractor_keeps_unescaped_quotes_inside_streamed_reply(self):
        extractor = app_server.ReplyExtractor()
        raw = '{"reply": "宇宙里不存在统一的\"现在\"。所谓\"发明时间\"更像叙事工具。", "actions": []}'
        streamed = "".join(extractor.feed(ch) for ch in raw)

        self.assertEqual(streamed, '宇宙里不存在统一的"现在"。所谓"发明时间"更像叙事工具。')

    def test_reply_extractor_stops_at_actions_field_not_inner_quote(self):
        extractor = app_server.ReplyExtractor()
        chunks = ['{"reply": "前半段', '带着"引号"', '继续", "actions": [{"type": "tag"}]}']
        streamed = "".join(extractor.feed(chunk) for chunk in chunks)

        self.assertEqual(streamed, '前半段带着"引号"继续')

    def test_reply_extractor_marks_actions_first_json_as_structured_buffer(self):
        extractor = app_server.ReplyExtractor()
        streamed = extractor.feed('{"actions": [{"type": "question", "data": {"content": "why"}}], ')

        self.assertEqual(streamed, "")
        self.assertTrue(extractor.is_buffering_structured_response())

    def test_property_action_validation_enforces_whitelist_length_and_schema(self):
        validator = app_server.ActionValidator()

        unknown = validator.validate([{"type": "shell_exec", "data": {}}])
        self.assertEqual(unknown.validation_status, app_server.VALIDATION_FAILED)
        self.assertTrue(any("unknown action type" in item for item in unknown.errors))

        too_many = validator.validate(
            [
                {"type": "question", "data": {"content": "one"}},
                {"type": "tag", "data": {"tags": ["two"]}},
            ]
        )
        self.assertEqual(too_many.validation_status, app_server.VALIDATION_PARTIAL)
        self.assertEqual(len(too_many.valid_actions), 1)
        self.assertTrue(any("actions length exceeds 1" in item for item in too_many.errors))

        bad_schema = validator.validate([{"type": "tag", "data": {"tags": "not-a-list"}}])
        self.assertEqual(bad_schema.validation_status, app_server.VALIDATION_FAILED)
        self.assertTrue(any("tag.tags" in item for item in bad_schema.errors))

        good = validator.validate([{"type": "add_note", "data": {"content": "note", "tags": ["a"]}}])
        self.assertEqual(good.validation_status, app_server.VALIDATION_SUCCESS)
        self.assertEqual(len(good.valid_actions), 1)

    def test_multiple_question_actions_are_truncated_to_one_action(self):
        validator = app_server.ActionValidator()
        result = validator.validate(
            [
                {"type": "question", "data": {"content": "第一个问题？", "bookId": "book-1"}},
                {"type": "question", "data": {"content": "第二个问题？", "bookId": "book-1"}},
                {"type": "question", "data": {"content": "第三个问题？", "bookId": "book-1"}},
            ]
        )
        self.assertEqual(result.validation_status, app_server.VALIDATION_PARTIAL)
        self.assertEqual(len(result.valid_actions), 1)
        content = result.valid_actions[0]["data"]["content"]
        self.assertEqual(content, "第一个问题？")
        self.assertTrue(any("actions length exceeds 1" in item for item in result.errors))

    def test_property_prompt_data_boundaries_and_context_truncation(self):
        builder = app_server.PromptBuilder()
        state = self.load_state()
        history = [{"role": "user", "content": f"message-{index}"} for index in range(60)]
        prompt = builder.build_chat_prompt(state, "book-1", history)

        self.assertIn("<system_instruction>", prompt)
        self.assertIn("</system_instruction>", prompt)
        self.assertIn("<user_data>", prompt)
        self.assertIn("</user_data>", prompt)
        self.assertIn("<conversation_history>", prompt)
        self.assertIn("</conversation_history>", prompt)

        history_json = prompt.split("<conversation_history>\n", 1)[1].split("\n</conversation_history>", 1)[0]
        parsed_history = json.loads(history_json)
        self.assertEqual(len(parsed_history), 40)
        self.assertEqual(parsed_history[0]["content"], "message-20")
        self.assertEqual(parsed_history[-1]["content"], "message-59")
        system_instruction = prompt.split("<system_instruction>\n", 1)[1].split("\n</system_instruction>", 1)[0]
        self.assertNotIn("Test Book", system_instruction)
        self.assertNotIn("Author", system_instruction)
        self.assertIn('action.type = "add_book"', system_instruction)
        self.assertIn("只围绕当前上下文本身提炼 1 个", system_instruction)
        self.assertIn("提炼问题、总结、解释当前书时不要主动关联其他书", system_instruction)
        self.assertIn("1 个最核心、最值得继续追问的问题", system_instruction)
        self.assertIn("必须返回对应 action", system_instruction)

    def test_quote_scoped_chat_uses_quote_history_key_and_prompt_context(self):
        state = self.load_state()
        state["quotes"] = [
            {
                "id": "quote-1",
                "bookId": "book-1",
                "kind": "quote",
                "content": "这是一条需要讨论的摘抄",
                "page": 12,
                "tags": ["摘抄"],
            }
        ]
        conn = app_server.get_conn()
        app_server.save_state(conn, self.user_id, state)
        conn.close()

        observed = {}

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            observed["prompt"] = messages[0]["content"]
            return json.dumps({"reply": "ok", "actions": []}, ensure_ascii=False)

        app_server.call_deepseek = fake_deepseek
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "围绕这条摘抄聊聊", "context": {"type": "quote", "bookId": "book-1", "quoteId": "quote-1"}},
            token=self.token,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["historyKey"], "quote:quote-1")
        self.assertEqual(payload["context"], {"type": "quote", "bookId": "book-1", "quoteId": "quote-1"})
        self.assertIn('"type": "quote"', observed["prompt"])
        self.assertIn('"focused_quote"', observed["prompt"])
        self.assertIn("这是一条需要讨论的摘抄", observed["prompt"])

    def test_property_response_structure_validation(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "structured reply", "actions": [{"type": "question", "data": {"content": "why"}}]},
                ensure_ascii=False,
            )

        app_server.call_deepseek = fake_deepseek
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "ask me", "bookId": "book-1"},
            token=self.token,
        )
        self.assertEqual(status, 200)
        for key in ["traceId", "agentStatus", "parseStatus", "validationStatus", "reply", "actions", "history", "historyKey", "context"]:
            self.assertIn(key, payload)
        self.assertIsInstance(payload["traceId"], str)
        self.assertIsInstance(payload["reply"], str)
        self.assertIsInstance(payload["actions"], list)
        self.assertIsInstance(payload["history"], list)
        self.assertEqual(payload["historyKey"], "book:book-1")
        self.assertEqual(payload["context"], {"type": "book", "bookId": "book-1"})
        self.assertEqual(payload["actions"][0]["status"], "PENDING_APPROVAL")

    def test_streaming_chat_retries_non_stream_when_stream_finish_reason_is_not_stop(self):
        def fake_stream(messages, model="deepseek-chat", max_tokens=2400):
            yield "半截回答："
            yield "《激情耗尽》（薇塔·萨克"
            return "length"

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps({"reply": "完整回答", "actions": []}, ensure_ascii=False)

        app_server.call_deepseek_stream = fake_stream
        app_server.call_deepseek = fake_deepseek

        status, events = self.request_sse_events(
            "POST",
            "/api/chat/stream",
            {"message": "从摘抄去聊", "bookId": "book-1"},
            token=self.token,
        )

        self.assertEqual(status, 200)
        payload = events[-1]
        self.assertTrue(payload["done"])
        self.assertEqual(payload["reply"], "完整回答")
        self.assertEqual(payload["history"][-1]["content"], "完整回答")

        trace_status, trace_payload = self.request_json("GET", f"/api/agent-traces/{payload['traceId']}", token=self.token)
        self.assertEqual(trace_status, 200)
        self.assertTrue(any(event["eventType"] == "STREAM_RETRY" for event in trace_payload["events"]))

    def test_property_legacy_chat_history_keys_migrate_to_context_keys(self):
        state = app_server.sanitize_state(
            {
                "books": [],
                "sessions": [],
                "quotes": [],
                "chatHistories": {
                    "book-1": [{"role": "user", "content": "legacy book"}],
                    "__general__": [{"role": "user", "content": "legacy global"}],
                    "quote:quote-1": [{"role": "user", "content": "quote context"}],
                },
                "chatContexts": {
                    "quote:quote-1": {"type": "quote", "bookId": "book-1", "quoteId": "quote-1"},
                },
                "connections": [],
            }
        )

        self.assertEqual(state["chatHistories"]["book:book-1"][0]["content"], "legacy book")
        self.assertEqual(state["chatHistories"]["global"][0]["content"], "legacy global")
        self.assertEqual(state["chatHistories"]["quote:quote-1"][0]["content"], "quote context")
        self.assertEqual(state["chatContexts"]["book:book-1"], {"type": "book", "bookId": "book-1"})
        self.assertEqual(state["chatContexts"]["global"], {"type": "global"})
        self.assertEqual(state["chatContexts"]["quote:quote-1"], {"type": "quote", "bookId": "book-1", "quoteId": "quote-1"})

    def test_question_action_content_completes_short_lead_in_reply(self):
        question = "汉斯的悲剧是被教育体制决定的，还是他的顺从也参与了共谋？"

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "基于《在轮下》的核心冲突，一个值得深挖的问题是：", "actions": [{"type": "question", "data": {"content": question}}]},
                ensure_ascii=False,
            )

        app_server.call_deepseek = fake_deepseek
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "提炼问题", "bookId": "book-1"},
            token=self.token,
        )
        self.assertEqual(status, 200)
        self.assertIn(question, payload["reply"])
        self.assertIn(question, payload["history"][-1]["content"])

    def test_question_action_content_completes_dash_lead_in_reply(self):
        question = "这种以做事来安顿身心、对抗虚妄的方式，其力量来源是什么？"

        reply = app_server.complete_reply_with_action_content(
            "读完《阿城精选集》，这些人物共同指向人的尊严如何安放。基于此，我为你提炼了这样一个问题——",
            [{"type": "question", "data": {"content": question, "bookId": "book-1"}}],
        )

        self.assertIn(question, reply)

    def test_property_trace_and_action_ids_are_unique_across_requests(self):
        action_ids = set()
        trace_ids = set()
        for index in range(8):
            payload = self._fake_chat_with_action(
                "add_note",
                {"content": f"note-{index}", "tags": [f"t{index}"]},
                message=f"msg-{index}",
            )
            self.assertNotIn(payload["traceId"], trace_ids)
            trace_ids.add(payload["traceId"])
            self.assertEqual(len(payload["actions"]), 1)
            action_id = payload["actions"][0]["id"]
            self.assertNotIn(action_id, action_ids)
            action_ids.add(action_id)
            self.assertEqual(payload["actions"][0]["status"], "PENDING_APPROVAL")

    def test_property_state_machine_terminal_states_reject_further_transitions(self):
        pending_payload = self._fake_chat_with_action(
            "add_book",
            {"title": "Unique Book", "author": "Author A"},
        )
        action_id = pending_payload["actions"][0]["id"]

        approve_status, approve_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )
        self.assertEqual(approve_status, 200)
        self.assertEqual(approve_payload["action"]["status"], "EXECUTED")

        invalid_transitions = [
            self.request_json("POST", f"/api/agent-actions/{action_id}/approve", token=self.token),
            self.request_json("POST", f"/api/agent-actions/{action_id}/reject", token=self.token),
        ]
        for status, payload in invalid_transitions:
            self.assertEqual(status, 400)
            self.assertIn("invalid action state transition", payload["error"])

        reject_payload = self._fake_chat_with_action(
            "question",
            {"content": "一个问题"},
            message="second",
        )
        rejected_action_id = reject_payload["actions"][0]["id"]
        reject_status, reject_result = self.request_json(
            "POST",
            f"/api/agent-actions/{rejected_action_id}/reject",
            token=self.token,
        )
        self.assertEqual(reject_status, 200)
        self.assertEqual(reject_result["action"]["status"], "REJECTED")
        for status, payload in [
            self.request_json("POST", f"/api/agent-actions/{rejected_action_id}/approve", token=self.token),
            self.request_json("POST", f"/api/agent-actions/{rejected_action_id}/reject", token=self.token),
        ]:
            self.assertEqual(status, 400)
            self.assertIn("invalid action state transition", payload["error"])

    def test_add_book_action_skips_duplicate_when_author_has_nationality_marker(self):
        pending_payload = self._fake_chat_with_action(
            "add_book",
            {"title": "《Test Book》", "author": "[英] Author"},
        )
        action_id = pending_payload["actions"][0]["id"]

        approve_status, approve_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )
        self.assertEqual(approve_status, 200)
        self.assertEqual(approve_payload["action"]["status"], "EXECUTED")

        state = self.load_state()
        matching = [book for book in state["books"] if book.get("title") == "Test Book"]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["author"], "Author")

    def test_duplicate_signature_treats_nationality_marker_as_same_author(self):
        # The reported bug: same book added twice differs only by nationality marker.
        self.assertEqual(
            app_server.book_duplicate_signature("悉达多", "黑塞"),
            app_server.book_duplicate_signature("《悉达多》", "[德] 黑塞"),
        )

    def test_duplicate_signature_keeps_translated_given_name_initial(self):
        # Regression: "丹·布朗" must not be reduced to "布朗" by treating the
        # leading single char "丹" as a nationality marker before the middle dot.
        self.assertNotEqual(
            app_server.book_duplicate_signature("达芬奇密码", "布朗"),
            app_server.book_duplicate_signature("达芬奇密码", "[美] 丹·布朗"),
        )

    def test_books_are_same_treats_empty_author_as_wildcard(self):
        # Title-only input should match an existing same-title book that has an author.
        self.assertTrue(app_server.books_are_same("悉达多", "", "悉达多", "黑塞"))
        self.assertTrue(app_server.books_are_same("悉达多", "黑塞", "悉达多", ""))
        self.assertTrue(app_server.books_are_same("悉达多", "", "悉达多", ""))

    def test_books_are_same_keeps_distinct_same_title_authors(self):
        # Two same-title books with different known authors stay distinct.
        self.assertFalse(app_server.books_are_same("活着", "余华", "活着", "泰戈尔"))
        # Empty title never matches.
        self.assertFalse(app_server.books_are_same("", "", "", "黑塞"))

    def test_property_execution_is_idempotent_after_first_approval(self):
        pending_payload = self._fake_chat_with_action(
            "tag",
            {"tags": ["哲学", "认知"]},
        )
        action_id = pending_payload["actions"][0]["id"]

        approve_status, approve_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )
        self.assertEqual(approve_status, 200)
        self.assertEqual(approve_payload["action"]["status"], "EXECUTED")
        state_after_first = self.load_state()
        first_book = next(book for book in state_after_first["books"] if book["id"] == "book-1")
        first_tag_count = len(first_book["tags"])

        duplicate_status, duplicate_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )
        self.assertEqual(duplicate_status, 400)
        self.assertIn("invalid action state transition", duplicate_payload["error"])

        state_after_second = self.load_state()
        second_book = next(book for book in state_after_second["books"] if book["id"] == "book-1")
        self.assertEqual(len(second_book["tags"]), first_tag_count)
        self.assertEqual(sorted(second_book["tags"]), sorted(first_book["tags"]))

    def test_property_structured_error_responses_keep_required_fields(self):
        def fake_error(messages, model="deepseek-chat", max_tokens=1200):
            raise RuntimeError("upstream failure")

        error_cases = [
            {
                "path": "/api/chat",
                "payload": {"message": "", "bookId": ""},
                "expect_status": 400,
                "setup": None,
            },
            {
                "path": "/api/chat",
                "payload": {"message": "hello", "bookId": "missing-book"},
                "expect_status": 400,
                "setup": None,
            },
            {
                "path": "/api/chat",
                "payload": {"message": "hello", "bookId": ""},
                "expect_status": 500,
                "setup": fake_error,
            },
        ]

        for case in error_cases:
            app_server.call_deepseek = case["setup"] or self.original_call_deepseek
            status, payload = self.request_json("POST", case["path"], case["payload"], token=self.token)
            self.assertEqual(status, case["expect_status"])
            self.assertIn("traceId", payload)
            self.assertIn("agentStatus", payload)
            self.assertIn("parseStatus", payload)
            self.assertIn("validationStatus", payload)
            self.assertIn("error", payload)
            self.assertEqual(payload["agentStatus"], "ERROR")
            self.assertTrue(payload["traceId"].startswith("trace-"))

    def test_property_dangerous_actions_are_rejected_by_whitelist(self):
        dangerous_action_types = [
            "delete_everything",
            "shell_exec",
            "drop_database",
            "write_file",
            "network_call",
        ]
        for action_type in dangerous_action_types:
            def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200, current=action_type):
                return json.dumps(
                    {"reply": "bad action", "actions": [{"type": current, "data": {}}]},
                    ensure_ascii=False,
                )

            app_server.call_deepseek = fake_deepseek
            status, payload = self.request_json(
                "POST",
                "/api/chat",
                {"message": f"trigger-{action_type}", "bookId": ""},
                token=self.token,
            )
            self.assertEqual(status, 200)
            self.assertEqual(payload["agentStatus"], "DEGRADED")
            self.assertEqual(payload["validationStatus"], "FAILED")
            self.assertEqual(payload["actions"], [])
            self.assertTrue(any(action_type in item for item in payload["validationErrors"]))


if __name__ == "__main__":
    unittest.main()
