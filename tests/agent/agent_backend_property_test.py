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

    def test_existing_connections_omitted_in_book_context(self):
        """OPT-020: existing_connections must be [] when book_id is set to avoid wasting tokens."""
        builder = app_server.PromptBuilder()
        state = self.load_state()
        state["connections"] = [{"id": f"conn-{i}", "sourceId": "book-1", "targetId": "book-2"} for i in range(25)]

        prompt_with_book = builder.build_chat_prompt(state, "book-1", [])
        user_data_json = prompt_with_book.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        payload_with_book = json.loads(user_data_json)
        self.assertEqual(payload_with_book["existing_connections"], [], "connections should be empty when book_id is set")

        prompt_global = builder.build_chat_prompt(state, "", [])
        user_data_json_global = prompt_global.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        payload_global = json.loads(user_data_json_global)
        self.assertEqual(len(payload_global["existing_connections"]), 20, "connections should be injected (capped at 20) in global context")

    def test_all_books_summary_capped_at_50_most_recent(self):
        """OPT-047: all_books_summary must include at most 50 books, sorted newest-first."""
        builder = app_server.PromptBuilder()
        books = [
            {
                "id": f"book-{i:03d}",
                "title": f"Book {i}",
                "author": "A",
                "updatedAt": f"2026-01-{i:02d}T00:00:00.000Z",
            }
            for i in range(1, 76)
        ]
        state = {"books": books, "sessions": [], "quotes": [], "chatHistories": {}, "connections": []}

        prompt = builder.build_chat_prompt(state, "", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        payload = json.loads(user_data_json)
        summary = payload["all_books_summary"]

        self.assertEqual(len(summary), 50, "all_books_summary must be capped at 50")
        self.assertEqual(summary[0]["id"], "book-075", "first entry should be the most recently updated book")
        self.assertEqual(summary[-1]["id"], "book-026", "last entry should be the 50th most recently updated book")
        ids_in_summary = {b["id"] for b in summary}
        self.assertNotIn("book-001", ids_in_summary, "oldest books must be excluded when over the 50-book cap")

    def test_all_books_summary_includes_reading_status_and_prompt_warns_against_wishlist(self):
        """Bug (2026-06-29): 探讨从书单查找时把没开始读的 wishlist 书也当读过的一并返回。
        修复：all_books_summary 带上每本书的 status，且系统提示明确「我读过的」只取
        finished/reading、不得把 wishlist 算作读过的。"""
        builder = app_server.PromptBuilder()
        books = [
            {"id": "b-fin", "title": "读完的", "author": "A", "status": "finished", "updatedAt": "2026-01-03T00:00:00Z"},
            {"id": "b-read", "title": "在读的", "author": "B", "status": "reading", "updatedAt": "2026-01-02T00:00:00Z"},
            {"id": "b-wish", "title": "想读的", "author": "C", "status": "wishlist", "updatedAt": "2026-01-01T00:00:00Z"},
        ]
        state = {"books": books, "sessions": [], "quotes": [], "chatHistories": {}, "connections": []}

        prompt = builder.build_chat_prompt(state, "", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        summary = json.loads(user_data_json)["all_books_summary"]

        by_id = {b["id"]: b for b in summary}
        self.assertEqual(by_id["b-fin"]["status"], "finished")
        self.assertEqual(by_id["b-read"]["status"], "reading")
        self.assertEqual(by_id["b-wish"]["status"], "wishlist")
        # 系统提示必须告诉模型如何区分阅读状态（关键词够稳，不锁死整句措辞）。
        self.assertIn("wishlist", prompt)
        self.assertIn("status", prompt)
        self.assertIn("读过", prompt)

    def test_all_books_summary_includes_rating_and_finished_date(self):
        """OPT-113: OPT-105 豆瓣导入后 rating/finishedAt 已在数据里，但 all_books_summary
        原来只给模型 id/title/author/status，导致「评分最高的书」「去年读完的书」这类现在
        有真实数据的跨书查询必然答错。修复：summary 带上 rating 与 finishedAt(截到日期)，
        且系统提示说明这两个字段的语义与忽略规则。"""
        builder = app_server.PromptBuilder()
        books = [
            {"id": "b1", "title": "五星书", "author": "A", "status": "finished",
             "rating": 5, "finishedAt": "2025-08-10T12:34:56.000Z", "updatedAt": "2026-01-03T00:00:00Z"},
            {"id": "b2", "title": "未评分书", "author": "B", "status": "finished",
             "rating": 0, "finishedAt": "", "updatedAt": "2026-01-02T00:00:00Z"},
        ]
        state = {"books": books, "sessions": [], "quotes": [], "chatHistories": {}, "connections": []}

        prompt = builder.build_chat_prompt(state, "", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        summary = json.loads(user_data_json)["all_books_summary"]
        by_id = {b["id"]: b for b in summary}

        self.assertEqual(by_id["b1"]["rating"], 5)
        self.assertEqual(by_id["b1"]["finishedAt"], "2025-08-10", "finishedAt 应截到 YYYY-MM-DD")
        self.assertEqual(by_id["b2"]["rating"], 0, "未评分应保留 0，交给模型忽略")
        self.assertEqual(by_id["b2"]["finishedAt"], "", "无读完日期应为空串")
        # 系统提示必须解释 rating/finishedAt 的语义（关键词够稳，不锁死整句措辞）。
        self.assertIn("rating", prompt)
        self.assertIn("finishedAt", prompt)

    def test_all_books_summary_includes_douban_comment(self):
        """OPT-118: OPT-105 豆瓣导入为书写入 doubanComment(一句话短评)，书籍详情与分享图都已读取，
        但 all_books_summary 缺这个字段——「哪本书适合悲伤时读」这类以读后感受为关键词的跨书查询
        只能靠书名瞎猜。修复：summary 带上 doubanComment(截 60 字符控 token)，系统提示说明其语义。"""
        builder = app_server.PromptBuilder()
        long_comment = "治" * 80
        books = [
            {"id": "b1", "title": "有短评的书", "author": "A", "status": "finished",
             "doubanComment": "很治愈，难过的时候翻一翻", "updatedAt": "2026-01-03T00:00:00Z"},
            {"id": "b2", "title": "没短评的书", "author": "B", "status": "finished",
             "updatedAt": "2026-01-02T00:00:00Z"},
            {"id": "b3", "title": "长短评的书", "author": "C", "status": "finished",
             "doubanComment": long_comment, "updatedAt": "2026-01-01T00:00:00Z"},
        ]
        state = {"books": books, "sessions": [], "quotes": [], "chatHistories": {}, "connections": []}

        prompt = builder.build_chat_prompt(state, "", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        summary = json.loads(user_data_json)["all_books_summary"]
        by_id = {b["id"]: b for b in summary}

        self.assertEqual(by_id["b1"]["doubanComment"], "很治愈，难过的时候翻一翻")
        self.assertEqual(by_id["b2"]["doubanComment"], "", "没写短评的书应为空串，交给模型忽略")
        self.assertEqual(by_id["b3"]["doubanComment"], "治" * 60, "过长短评应截到 60 字符控 token")
        # 系统提示必须解释 doubanComment 的语义（关键词够稳，不锁死整句措辞）。
        self.assertIn("doubanComment", prompt)

    def test_all_books_summary_includes_review(self):
        """OPT-121: 用户为整本书保存的 review(读后感/评价) 是跨书回顾类查询最该引用的原声，
        但 all_books_summary 缺这个字段——「帮我回顾读了什么」「哪本我最喜欢」只能靠书名瞎猜。
        修复：summary 带上 review(截 120 字符控 token)，系统提示说明其语义。与 doubanComment 对称。"""
        builder = app_server.PromptBuilder()
        long_review = "感" * 200
        books = [
            {"id": "b1", "title": "有读后感的书", "author": "A", "status": "finished",
             "review": "读完久久不能平静，像被人轻轻拍了拍肩", "updatedAt": "2026-01-03T00:00:00Z"},
            {"id": "b2", "title": "没读后感的书", "author": "B", "status": "finished",
             "updatedAt": "2026-01-02T00:00:00Z"},
            {"id": "b3", "title": "长读后感的书", "author": "C", "status": "finished",
             "review": long_review, "updatedAt": "2026-01-01T00:00:00Z"},
        ]
        state = {"books": books, "sessions": [], "quotes": [], "chatHistories": {}, "connections": []}

        prompt = builder.build_chat_prompt(state, "", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        summary = json.loads(user_data_json)["all_books_summary"]
        by_id = {b["id"]: b for b in summary}

        self.assertEqual(by_id["b1"]["review"], "读完久久不能平静，像被人轻轻拍了拍肩")
        self.assertEqual(by_id["b2"]["review"], "", "没写读后感的书应为空串，交给模型忽略")
        self.assertEqual(by_id["b3"]["review"], "感" * 120, "过长读后感应截到 120 字符控 token")
        # 系统提示必须解释 review 的语义（关键词够稳，不锁死整句措辞）。
        self.assertIn("review", prompt)

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

    def test_books_are_same_ignores_title_subtitle_separator_style(self):
        # Real bug (2026-07-17, OPT-118): a shelf photo produced 「羊道 深山夏牧场」
        # while the library held 「羊道·深山夏牧场」, so 3 duplicates were created.
        # The separator is typography, not part of the name.
        self.assertTrue(app_server.books_are_same("羊道 深山夏牧场", "李娟", "羊道·深山夏牧场", "李娟"))
        self.assertTrue(app_server.books_are_same("羊道:春牧场", "李娟", "羊道·春牧场", "李娟"))
        self.assertTrue(app_server.books_are_same("羊道·前山夏牧场", "李娟", "羊道 前山夏牧场", "李娟"))

    def test_books_are_same_matches_main_title_against_full_cover_title(self):
        # Real bug (2026-07-17, OPT-118): the shelf photo read the full cover
        # 「重走：在公路、河流和驿道上寻找西南联大」while the library held 「重走」,
        # so a duplicate was created on top of a finished, 4-star book.
        self.assertTrue(app_server.books_are_same(
            "重走：在公路、河流和驿道上寻找西南联大", "杨潇", "重走", "杨潇"))
        self.assertTrue(app_server.books_are_same(
            "重走", "杨潇", "重走：在公路、河流和驿道上寻找西南联大", "杨潇"))

    def test_titles_are_same_ignores_edition_suffix(self):
        # Real bug (2026-07-17, OPT-118): the library held 「神经科学——探索脑（第4版）」
        # (reading, started 2025-11-14) while the shelf photo read 「神经科学——探索脑」.
        # An edition is a reprint of the same book, not a different one.
        self.assertTrue(app_server.titles_are_same("神经科学——探索脑（第4版）", "神经科学——探索脑"))
        self.assertTrue(app_server.titles_are_same("人类简史(第2版)", "人类简史"))
        self.assertTrue(app_server.titles_are_same("算法导论 第三版", "算法导论"))
        self.assertTrue(app_server.titles_are_same("深入理解计算机系统（原书第3版）", "深入理解计算机系统"))

    def test_edition_stripping_never_eats_volume_markers(self):
        # The edition rule matches 版 only. Volumes name different books and must
        # survive — this is the line the rule must not cross.
        self.assertFalse(app_server.titles_are_same("花朵与探险", "花朵与探险2"))
        self.assertFalse(app_server.titles_are_same("第二性 I", "第二性 II"))
        self.assertFalse(app_server.titles_are_same("明朝那些事儿：第一部", "明朝那些事儿：第二部"))
        self.assertFalse(app_server.titles_are_same("巴黎评论·诺奖作家访谈（上）", "巴黎评论·诺奖作家访谈（下）"))

    def test_edition_stripping_never_eats_a_real_title(self):
        # Titles that merely contain 版 must come through untouched.
        for title in ("出版之后", "第八版画", "版权谈判", "盗版天堂"):
            with self.subTest(title=title):
                self.assertEqual(app_server.strip_book_edition_suffix(title), title)

    def test_titles_are_same_keeps_series_volumes_apart(self):
        # The subtitle rule must not swallow a series: these share a main title
        # (or a prefix) but are different volumes / different books.
        self.assertFalse(app_server.titles_are_same("明朝那些事儿：第一部", "明朝那些事儿：第二部"))
        self.assertFalse(app_server.titles_are_same("羊道·春牧场", "羊道·深山夏牧场"))
        self.assertFalse(app_server.titles_are_same("第二性 I", "第二性 II"))
        self.assertFalse(app_server.titles_are_same("花朵与探险", "花朵与探险2"))
        # 「·」 is a series separator, not a subtitle marker, so it never truncates.
        self.assertFalse(app_server.titles_are_same("羊道", "羊道·春牧场"))
        # No separator at the boundary: two genuinely different books.
        self.assertFalse(app_server.titles_are_same("活着", "活着为了讲述"))

    def test_book_main_title_for_match_drops_only_the_subtitle(self):
        self.assertEqual(app_server.book_main_title_for_match("重走：在公路上"), "重走")
        self.assertEqual(app_server.book_main_title_for_match("《厌女：日本的女性嫌恶》"), "厌女")
        self.assertEqual(app_server.book_main_title_for_match("羊道·春牧场"), "羊道春牧场")

    def test_books_are_same_accepts_abbreviated_translated_author(self):
        # Real bug (2026-07-17, OPT-118): 「[英] 哈耶克」/「[英] 弗里德里希·哈耶克」/
        # 「[英] 弗里德里希·奥古斯特·冯·哈耶克」are one person; a duplicate was created.
        full = "[英] 弗里德里希·奥古斯特·冯·哈耶克"
        self.assertTrue(app_server.books_are_same("通往奴役之路", "[英] 哈耶克", "《通往奴役之路》", full))
        self.assertTrue(app_server.books_are_same("通往奴役之路", "[英] 弗里德里希·哈耶克", "《通往奴役之路》", full))

    def test_strip_author_nationality_handles_any_bracketed_marker(self):
        # Real bug (2026-07-17): the nationality list was a whitelist, so
        # 「[阿根廷] 豪·路·博尔赫斯」 kept its marker and never matched the library's
        # copy. A country whitelist can't cover a shelf of world literature — the
        # bracket itself is the signal.
        for raw, expected in [
            ("[阿根廷] 豪·路·博尔赫斯", "豪·路·博尔赫斯"),
            ("[哥伦比亚] 马尔克斯", "马尔克斯"),
            ("[苏] 尼·奥斯特洛夫斯基", "尼·奥斯特洛夫斯基"),
            ("[南非] 库切", "库切"),
            ("[以色列] 尤瓦尔·赫拉利", "尤瓦尔·赫拉利"),
            ("〔德〕 赫尔曼·黑塞", "赫尔曼·黑塞"),
            ("(英) 伍尔夫", "伍尔夫"),
        ]:
            with self.subTest(raw=raw):
                self.assertEqual(app_server.strip_author_nationality(raw), expected)

    def test_authors_are_compatible_accepts_segmentwise_abbreviation(self):
        # Chinese publishing abbreviates translated names segment by segment.
        # Real case: the library held 「[阿根廷] 豪·路·博尔赫斯」, the shelf photo read
        # 「[阿根廷] 豪尔赫·路易斯·博尔赫斯」.
        self.assertTrue(app_server.authors_are_compatible(
            "[阿根廷] 豪·路·博尔赫斯", "[阿根廷] 豪尔赫·路易斯·博尔赫斯"))
        self.assertTrue(app_server.authors_are_compatible(
            "[苏] 尼·奥斯特洛夫斯基", "[苏] 尼古拉·奥斯特洛夫斯基"))

    def test_segmentwise_abbreviation_needs_multiple_segments(self):
        # The convention only exists for multi-part translated names; a one-segment
        # Chinese name is whole and must not prefix its way into a longer one.
        self.assertFalse(app_server.authors_are_compatible("金", "金庸"))
        self.assertFalse(app_server.authors_are_compatible("张三", "张三丰"))
        # Same segment count, but not an abbreviation of each other.
        self.assertFalse(app_server.authors_are_compatible("[美] 丹·布朗", "[美] 丹尼尔·格林"))
        self.assertFalse(app_server.authors_are_compatible("[美] 乔治·奥威尔", "[英] 乔治·艾略特"))

    def test_authors_are_compatible_keeps_different_people_apart(self):
        # The subset rule must not merge people who merely share a name part.
        self.assertFalse(app_server.authors_are_compatible("[英] 弗吉尼亚·伍尔夫", "[英] 伦纳德·伍尔夫"))
        self.assertFalse(app_server.authors_are_compatible("余华", "泰戈尔"))
        # Exact-token match only: a surname prefix is not an abbreviation.
        self.assertFalse(app_server.authors_are_compatible("金", "金庸"))

    def test_strip_author_nationality_handles_six_corner_brackets(self):
        # Real data (2026-07-17): 豆瓣 writes 「著者 〔德〕 赫尔曼·黑塞」. 〔〕 was not in
        # the bracket class, so the nationality survived and the book failed to
        # match the library's 「〔德〕 赫尔曼·黑塞」 — a duplicate 荒原狼 was created.
        self.assertEqual(app_server.strip_author_nationality("〔德〕 赫尔曼·黑塞"), "赫尔曼·黑塞")
        self.assertEqual(app_server.strip_author_nationality("【德】黑塞"), "黑塞")
        self.assertEqual(app_server.strip_author_nationality("[德] 黑塞"), "黑塞")

    def test_strip_author_nationality_drops_field_labels(self):
        # 「著者」 is 豆瓣's field label leaking into the scraped author string.
        self.assertEqual(app_server.strip_author_nationality("著者 〔德〕 赫尔曼·黑塞"), "赫尔曼·黑塞")
        self.assertEqual(app_server.strip_author_nationality("作者：李娟"), "李娟")
        self.assertEqual(app_server.strip_author_nationality("著者 李娟"), "李娟")
        # A name that merely starts with those characters must survive intact.
        self.assertEqual(app_server.strip_author_nationality("编者按"), "编者按")

    def test_books_are_same_matches_douban_scraped_author_against_library(self):
        # The two real duplicates found in owner's library on 2026-07-17.
        self.assertTrue(app_server.books_are_same(
            "荒原狼", "著者 〔德〕 赫尔曼·黑塞", "《荒原狼》", "〔德〕 赫尔曼·黑塞"))
        # 豆瓣 lists one book once per edition, so the same title arrives twice with
        # differently-spelled authors; the importer must merge, not create a second.
        self.assertTrue(app_server.books_are_same(
            "钢铁是怎样炼成的", "[苏] 尼·奥斯特洛夫斯基", "钢铁是怎样炼成的", "奥斯特洛夫斯基"))

    def test_book_author_tokens_splits_on_name_separators(self):
        self.assertEqual(app_server.book_author_tokens("[德] 赫尔曼·黑塞"), ["赫尔曼", "黑塞"])
        self.assertEqual(app_server.book_author_tokens("李娟 著"), ["李娟"])
        self.assertEqual(app_server.book_author_tokens(""), [])

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


    def test_opt064_ocr_fields_stripped_from_prompt_quotes(self):
        """OPT-064: ocrText/imageUrl/ocrStatus/ocrSource/ocrError/ocrUpdatedAt/ocrRequestedAt
        must NOT appear in the system prompt sent to the LLM."""
        builder = app_server.PromptBuilder()
        state = {
            "books": [{"id": "bk-1", "title": "测试书", "author": "作者", "updatedAt": "2026-01-01T00:00:00Z"}],
            "sessions": [],
            "quotes": [
                {
                    "id": "q-1",
                    "bookId": "bk-1",
                    "kind": "quote",
                    "content": "这是手工输入的摘抄",
                    "ocrText": "这段大段 OCR 原始文本不应该被发送给模型",
                    "imageUrl": "/media/user/img.jpg",
                    "ocrStatus": "done",
                    "ocrSource": "kimi",
                    "ocrError": "",
                    "ocrUpdatedAt": "2026-01-01T01:00:00Z",
                    "ocrRequestedAt": "2026-01-01T00:59:00Z",
                }
            ],
            "chatHistories": {},
            "connections": [],
        }

        prompt = builder.build_chat_prompt(state, "bk-1", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        payload = json.loads(user_data_json)
        quotes_in_prompt = payload["quotes"]

        self.assertEqual(len(quotes_in_prompt), 1)
        q = quotes_in_prompt[0]
        # Heavy OCR fields must be absent
        for field in ("ocrText", "imageUrl", "ocrStatus", "ocrSource", "ocrError", "ocrUpdatedAt", "ocrRequestedAt"):
            self.assertNotIn(field, q, f"Field '{field}' must not be sent to the LLM")
        # Essential fields must be present
        self.assertEqual(q["id"], "q-1")
        self.assertEqual(q["content"], "这是手工输入的摘抄")
        # The raw ocrText value must not appear anywhere in the prompt string
        self.assertNotIn("这段大段 OCR 原始文本不应该被发送给模型", prompt)

    def test_opt064_ocr_only_quote_content_coalesced_from_ocrtext(self):
        """OPT-064: For OCR quotes where content is empty, ocrText must be coalesced
        into the content field so the LLM still sees the quote's text."""
        builder = app_server.PromptBuilder()
        ocr_text = "这是 OCR 识别出来的全文，content 字段为空"
        state = {
            "books": [{"id": "bk-1", "title": "书", "author": "A", "updatedAt": "2026-01-01T00:00:00Z"}],
            "sessions": [],
            "quotes": [
                {
                    "id": "q-ocr",
                    "bookId": "bk-1",
                    "kind": "quote",
                    "content": "",          # typical for OCR quotes before editing
                    "ocrText": ocr_text,
                    "ocrStatus": "done",
                    "imageUrl": "/media/user/img.jpg",
                }
            ],
            "chatHistories": {},
            "connections": [],
        }

        prompt = builder.build_chat_prompt(state, "bk-1", [])
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        payload = json.loads(user_data_json)
        q = payload["quotes"][0]

        # ocrText field itself must not appear
        self.assertNotIn("ocrText", q)
        # But its value must be coalesced into content
        self.assertEqual(q["content"], ocr_text, "ocrText must be promoted to content for OCR-only quotes")

    def test_opt064_focused_quote_ocr_fields_stripped(self):
        """OPT-064: focused_quote in the prompt must also have OCR fields stripped."""
        builder = app_server.PromptBuilder()
        ocr_text = "focused 摘抄的 OCR 文本"
        state = {
            "books": [{"id": "bk-1", "title": "书", "author": "A", "updatedAt": "2026-01-01T00:00:00Z"}],
            "sessions": [],
            "quotes": [
                {
                    "id": "q-focus",
                    "bookId": "bk-1",
                    "kind": "quote",
                    "content": "",
                    "ocrText": ocr_text,
                    "ocrStatus": "done",
                    "imageUrl": "/media/user/big-image.jpg",
                    "ocrSource": "kimi",
                }
            ],
            "chatHistories": {},
            "connections": [],
        }

        prompt = builder.build_chat_prompt(state, "bk-1", [], quote_id="q-focus")
        user_data_json = prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0]
        payload = json.loads(user_data_json)
        fq = payload["focused_quote"]

        self.assertNotIn("ocrText", fq)
        self.assertNotIn("imageUrl", fq)
        self.assertNotIn("ocrStatus", fq)
        self.assertNotIn("ocrSource", fq)
        self.assertEqual(fq["content"], ocr_text)


if __name__ == "__main__":
    unittest.main()
