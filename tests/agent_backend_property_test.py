import json
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import log_server


class AgentBackendPropertyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        log_server.DB_PATH = base_dir / "test.db"
        log_server.UPLOAD_DIR = base_dir / "uploads"
        log_server.initialize_tool_schema_provider_for_tests()
        log_server.init_db()
        self.original_mcp_dispatcher = log_server.MCPToolDispatcher
        log_server.MCPToolDispatcher = log_server.LocalActionDispatcherForTests

        self.conn = log_server.get_conn()
        self.user_id = "user-test"
        self.username = "tester"
        self.token = "token-test"
        now = log_server.now_iso()
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
        self.original_call_deepseek = log_server.call_deepseek

    def tearDown(self):
        log_server.call_deepseek = self.original_call_deepseek
        log_server.MCPToolDispatcher = self.original_mcp_dispatcher
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

    def load_state(self):
        conn = log_server.get_conn()
        state = log_server.load_state(conn, self.user_id)
        conn.close()
        return state

    def get_table_columns(self, table_name):
        conn = log_server.get_conn()
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        conn.close()
        return {row["name"] for row in rows}

    def _fake_chat_with_action(self, action_type, data, book_id="book-1", message="test-message"):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "ok", "actions": [{"type": action_type, "data": data}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
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
        conn = log_server.get_conn()
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
        validator = log_server.AgentRequestValidator()
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
        parser = log_server.ResponseParser()
        cases = [
            ("plain text response", log_server.PARSE_DEGRADED, "plain text response", []),
            ("", log_server.PARSE_FAILED, "", []),
            ("```json\n{\"reply\":\"ok\",\"actions\":[]}\n```", log_server.PARSE_MARKDOWN_CLEANED, "ok", []),
        ]
        for raw, expected_status, expected_reply, expected_actions in cases:
            result = parser.parse(raw)
            self.assertEqual(result.parse_status, expected_status)
            self.assertEqual(result.reply, expected_reply)
            self.assertEqual(result.actions, expected_actions)
            if expected_status in {log_server.PARSE_DEGRADED, log_server.PARSE_FAILED}:
                self.assertTrue(result.error_message)

    def test_parser_salvages_reply_from_jsonish_output_with_unescaped_quotes(self):
        parser = log_server.ResponseParser()
        raw = '{"reply": "这里有三个问题：\\n\\n**1. 书写本身就是一种反抗吗？**\\n这些"低俗"情绪值得讨论。", "actions": [{"type": "question", "data": {"content": "这些"低俗"情绪？"}}]}'
        result = parser.parse(raw)
        self.assertEqual(result.parse_status, log_server.PARSE_DEGRADED)
        self.assertIn("这里有三个问题", result.reply)
        self.assertIn('这些"低俗"情绪值得讨论。', result.reply)
        self.assertEqual(result.actions, [])

    def test_property_action_validation_enforces_whitelist_length_and_schema(self):
        validator = log_server.ActionValidator()

        unknown = validator.validate([{"type": "shell_exec", "data": {}}])
        self.assertEqual(unknown.validation_status, log_server.VALIDATION_FAILED)
        self.assertTrue(any("unknown action type" in item for item in unknown.errors))

        too_many = validator.validate(
            [
                {"type": "question", "data": {"content": "one"}},
                {"type": "tag", "data": {"tags": ["two"]}},
            ]
        )
        self.assertEqual(too_many.validation_status, log_server.VALIDATION_PARTIAL)
        self.assertEqual(len(too_many.valid_actions), 1)
        self.assertTrue(any("actions length exceeds 1" in item for item in too_many.errors))

        bad_schema = validator.validate([{"type": "tag", "data": {"tags": "not-a-list"}}])
        self.assertEqual(bad_schema.validation_status, log_server.VALIDATION_FAILED)
        self.assertTrue(any("tag.tags" in item for item in bad_schema.errors))

        good = validator.validate([{"type": "add_note", "data": {"content": "note", "tags": ["a"]}}])
        self.assertEqual(good.validation_status, log_server.VALIDATION_SUCCESS)
        self.assertEqual(len(good.valid_actions), 1)

    def test_multiple_question_actions_are_truncated_to_one_action(self):
        validator = log_server.ActionValidator()
        result = validator.validate(
            [
                {"type": "question", "data": {"content": "第一个问题？", "bookId": "book-1"}},
                {"type": "question", "data": {"content": "第二个问题？", "bookId": "book-1"}},
                {"type": "question", "data": {"content": "第三个问题？", "bookId": "book-1"}},
            ]
        )
        self.assertEqual(result.validation_status, log_server.VALIDATION_PARTIAL)
        self.assertEqual(len(result.valid_actions), 1)
        content = result.valid_actions[0]["data"]["content"]
        self.assertEqual(content, "第一个问题？")
        self.assertTrue(any("actions length exceeds 1" in item for item in result.errors))

    def test_property_prompt_data_boundaries_and_context_truncation(self):
        builder = log_server.PromptBuilder()
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
        self.assertIn("只围绕当前书籍本身提炼 1 个", system_instruction)
        self.assertIn("提炼问题、总结、解释当前书时不要主动关联其他书", system_instruction)
        self.assertIn("1 个最核心、最值得继续追问的问题", system_instruction)
        self.assertIn("必须返回对应 action", system_instruction)

    def test_property_response_structure_validation(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "structured reply", "actions": [{"type": "question", "data": {"content": "why"}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "ask me", "bookId": "book-1"},
            token=self.token,
        )
        self.assertEqual(status, 200)
        for key in ["traceId", "agentStatus", "parseStatus", "validationStatus", "reply", "actions", "history", "historyKey"]:
            self.assertIn(key, payload)
        self.assertIsInstance(payload["traceId"], str)
        self.assertIsInstance(payload["reply"], str)
        self.assertIsInstance(payload["actions"], list)
        self.assertIsInstance(payload["history"], list)
        self.assertEqual(payload["historyKey"], "book-1")
        self.assertEqual(payload["actions"][0]["status"], "PENDING_APPROVAL")

    def test_question_action_content_completes_short_lead_in_reply(self):
        question = "汉斯的悲剧是被教育体制决定的，还是他的顺从也参与了共谋？"

        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "基于《在轮下》的核心冲突，一个值得深挖的问题是：", "actions": [{"type": "question", "data": {"content": question}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
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

        reply = log_server.complete_reply_with_action_content(
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
            log_server.call_deepseek = case["setup"] or self.original_call_deepseek
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

            log_server.call_deepseek = fake_deepseek
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
