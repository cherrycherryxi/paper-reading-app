import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import log_server


class AgentBackendReliabilityTests(unittest.TestCase):
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

    def request_text(self, method, path, payload=None, token=None):
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

        if method == "GET":
            handler.do_GET()
        elif method == "POST":
            handler.do_POST()
        else:
            raise ValueError(f"Unsupported method: {method}")
        return handler._status_code, handler.wfile.getvalue().decode("utf-8")

    def load_state(self):
        conn = log_server.get_conn()
        state = log_server.load_state(conn, self.user_id)
        conn.close()
        return state

    def fetch_action(self, action_id):
        conn = log_server.get_conn()
        action = log_server.ActionStateMachine().get_action(conn, action_id, self.user_id)
        conn.close()
        return action

    def test_chat_response_includes_trace_and_persists_pending_action(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {
                    "reply": "这里是回答",
                    "actions": [{"type": "add_note", "data": {"content": "新笔记", "tags": ["洞察"]}}],
                },
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek

        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "帮我记一条", "bookId": "book-1"},
            token=self.token,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["agentStatus"], "OK")
        self.assertEqual(payload["parseStatus"], "SUCCESS")
        self.assertEqual(payload["validationStatus"], "SUCCESS")
        self.assertTrue(payload["traceId"].startswith("trace-"))
        self.assertEqual(len(payload["actions"]), 1)
        self.assertEqual(payload["actions"][0]["status"], "PENDING_APPROVAL")
        self.assertEqual(payload["actions"][0]["data"]["bookId"], "book-1")

        trace_status, trace_payload = self.request_json(
            "GET",
            f"/api/agent-traces/{payload['traceId']}",
            token=self.token,
        )
        self.assertEqual(trace_status, 200)
        self.assertEqual(trace_payload["traceId"], payload["traceId"])
        self.assertEqual(trace_payload["actions"][0]["status"], "PENDING_APPROVAL")
        event_types = [event["eventType"] for event in trace_payload["events"]]
        self.assertIn("REQUEST_RECEIVED", event_types)
        self.assertIn("ACTION_CREATED", event_types)
        self.assertIn("RESPONSE_SENT", event_types)

    def test_chat_parse_failure_returns_degraded_status_without_actions(self):
        log_server.call_deepseek = lambda messages, model="deepseek-chat", max_tokens=1200: "not json"

        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "随便聊聊", "bookId": ""},
            token=self.token,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["agentStatus"], "DEGRADED")
        self.assertEqual(payload["parseStatus"], "DEGRADED")
        self.assertEqual(payload["reply"], "not json")
        self.assertEqual(payload["actions"], [])

    def test_chat_validation_failure_rejects_unknown_action_type(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {
                    "reply": "给你一个奇怪动作",
                    "actions": [{"type": "delete_everything", "data": {}}],
                },
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek

        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "来个动作", "bookId": ""},
            token=self.token,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["agentStatus"], "DEGRADED")
        self.assertEqual(payload["validationStatus"], "FAILED")
        self.assertEqual(payload["actions"], [])
        self.assertTrue(any("unknown action type" in item for item in payload["validationErrors"]))

    def test_approve_action_executes_server_side_mutation(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {
                    "reply": "已准备添加标签",
                    "actions": [{"type": "tag", "data": {"tags": ["哲学", "方法论"]}}],
                },
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        _, chat_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "给这本书打标签", "bookId": "book-1"},
            token=self.token,
        )
        action_id = chat_payload["actions"][0]["id"]

        approve_status, approve_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )

        self.assertEqual(approve_status, 200)
        self.assertTrue(approve_payload["ok"])
        self.assertEqual(approve_payload["action"]["status"], "EXECUTED")
        updated_book = next(book for book in approve_payload["state"]["books"] if book["id"] == "book-1")
        self.assertIn("哲学", updated_book["tags"])
        self.assertIn("方法论", updated_book["tags"])

        state = self.load_state()
        stored_book = next(book for book in state["books"] if book["id"] == "book-1")
        self.assertIn("哲学", stored_book["tags"])

    def test_reject_action_transitions_without_state_mutation(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {
                    "reply": "要不要加一本书",
                    "actions": [{"type": "add_book", "data": {"title": "New Book", "author": "A"}}],
                },
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        _, chat_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "推荐一本", "bookId": ""},
            token=self.token,
        )
        action_id = chat_payload["actions"][0]["id"]

        reject_status, reject_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/reject",
            token=self.token,
        )

        self.assertEqual(reject_status, 200)
        self.assertTrue(reject_payload["ok"])
        self.assertEqual(reject_payload["action"]["status"], "REJECTED")
        state = self.load_state()
        self.assertFalse(any(book["title"] == "New Book" for book in state["books"]))

    def test_invalid_chat_request_returns_structured_error(self):
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "", "bookId": ""},
            token=self.token,
        )

        self.assertEqual(status, 400)
        self.assertEqual(payload["agentStatus"], "ERROR")
        self.assertEqual(payload["validationStatus"], "FAILED")
        self.assertTrue(payload["traceId"].startswith("trace-"))

    def test_state_machine_transitions_cover_valid_and_invalid_paths(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "记录一个问题", "actions": [{"type": "question", "data": {"content": "为什么？"}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        _, chat_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "记录问题", "bookId": "book-1"},
            token=self.token,
        )
        action_id = chat_payload["actions"][0]["id"]
        initial_action = self.fetch_action(action_id)
        self.assertEqual(initial_action["status"], "PENDING_APPROVAL")
        self.assertEqual(initial_action["data"]["bookId"], "book-1")

        approve_status, approve_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )
        self.assertEqual(approve_status, 200)
        self.assertEqual(approve_payload["action"]["status"], "EXECUTED")
        executed_action = self.fetch_action(action_id)
        self.assertEqual(executed_action["status"], "EXECUTED")

        invalid_status, invalid_payload = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/reject",
            token=self.token,
        )
        self.assertEqual(invalid_status, 400)
        self.assertIn("invalid action state transition", invalid_payload["error"])

    def test_action_execution_supports_add_book_add_note_summary_and_question(self):
        scenarios = [
            (
                "add_book",
                {"title": "New Book", "author": "A", "reason": "值得读"},
                lambda state: any(book["title"] == "New Book" for book in state["books"]),
            ),
            (
                "add_note",
                {"content": "一条笔记", "tags": ["洞察"]},
                lambda state: any(item.get("content") == "一条笔记" for item in state["quotes"]),
            ),
            (
                "summary",
                {"content": "阶段性总结"},
                lambda state: "阶段性总结" in next(book for book in state["books"] if book["id"] == "book-1")["notes"],
            ),
            (
                "question",
                {"content": "接下来该怎么想？"},
                lambda state: any(item.get("kind") == "question" and item.get("content") == "接下来该怎么想？" for item in state["quotes"]),
            ),
        ]

        for index, (action_type, data, assertion) in enumerate(scenarios):
            def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200, current_type=action_type, current_data=data):
                return json.dumps(
                    {"reply": "ok", "actions": [{"type": current_type, "data": current_data}]},
                    ensure_ascii=False,
                )

            log_server.call_deepseek = fake_deepseek
            _, chat_payload = self.request_json(
                "POST",
                "/api/chat",
                {"message": f"case-{index}", "bookId": "book-1"},
                token=self.token,
            )
            action_id = chat_payload["actions"][0]["id"]
            approve_status, approve_payload = self.request_json(
                "POST",
                f"/api/agent-actions/{action_id}/approve",
                token=self.token,
            )
            self.assertEqual(approve_status, 200)
            self.assertEqual(approve_payload["action"]["status"], "EXECUTED")
            self.assertTrue(assertion(self.load_state()))

    def test_question_action_upserts_one_question_per_book(self):
        contents = ["第一个问题？", "第二个问题？"]

        for content in contents:
            def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200, current_content=content):
                return json.dumps(
                    {"reply": current_content, "actions": [{"type": "question", "data": {"content": current_content}}]},
                    ensure_ascii=False,
                )

            log_server.call_deepseek = fake_deepseek
            _, chat_payload = self.request_json(
                "POST",
                "/api/chat",
                {"message": content, "bookId": "book-1"},
                token=self.token,
            )
            action_id = chat_payload["actions"][0]["id"]
            approve_status, _ = self.request_json(
                "POST",
                f"/api/agent-actions/{action_id}/approve",
                token=self.token,
            )
            self.assertEqual(approve_status, 200)

        questions = [
            item for item in self.load_state()["quotes"]
            if item.get("kind") == "question" and item.get("bookId") == "book-1"
        ]
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["content"], "第二个问题？")

    def test_approval_endpoint_returns_failed_status_when_execution_raises(self):
        conn = log_server.get_conn()
        trace_id = "trace-manual"
        log_server.TraceManager().create_trace(
            conn,
            trace_id=trace_id,
            user_id=self.user_id,
            message="manual",
            book_id="book-1",
        )
        action = log_server.ActionStateMachine().create_action(
            conn,
            trace_id,
            self.user_id,
            {"type": "summary", "data": {"content": "should fail", "bookId": "book-1"}},
        )
        conn.close()

        original_execute = log_server.ActionExecutor.execute_action

        def fake_execute(self, conn, user_id, action):
            return log_server.ExecutionResult(False, log_server.ACTION_STATUS_FAILED, action, error_message="boom")

        log_server.ActionExecutor.execute_action = fake_execute
        try:
            status, payload = self.request_json(
                "POST",
                f"/api/agent-actions/{action['id']}/approve",
                token=self.token,
            )
        finally:
            log_server.ActionExecutor.execute_action = original_execute

        self.assertEqual(status, 500)
        self.assertEqual(payload["action"]["status"], "FAILED")
        self.assertEqual(payload["error"], "boom")
        failed_action = self.fetch_action(action["id"])
        self.assertEqual(failed_action["status"], "FAILED")
        self.assertEqual(failed_action["errorMessage"], "boom")

    def test_trace_query_covers_success_failed_and_not_found(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "这里是回答", "actions": [{"type": "add_note", "data": {"content": "新笔记", "tags": ["洞察"]}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        _, success_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "成功场景", "bookId": "book-1"},
            token=self.token,
        )
        success_status, success_trace = self.request_json(
            "GET",
            f"/api/agent-traces/{success_payload['traceId']}",
            token=self.token,
        )
        self.assertEqual(success_status, 200)
        self.assertEqual(success_trace["status"], "OK")
        self.assertTrue(len(success_trace["events"]) >= 1)

        def fake_error(messages, model="deepseek-chat", max_tokens=1200):
            raise RuntimeError("upstream exploded")

        log_server.call_deepseek = fake_error
        error_status, error_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "失败场景", "bookId": ""},
            token=self.token,
        )
        self.assertEqual(error_status, 500)
        trace_status, failed_trace = self.request_json(
            "GET",
            f"/api/agent-traces/{error_payload['traceId']}",
            token=self.token,
        )
        self.assertEqual(trace_status, 200)
        self.assertEqual(failed_trace["status"], "ERROR")
        self.assertEqual(failed_trace["errorMessage"], "upstream exploded")
        self.assertTrue(any(event["eventType"] == "MODEL_ERROR" for event in failed_trace["events"]))

        missing_status, missing_payload = self.request_json(
            "GET",
            "/api/agent-traces/trace-does-not-exist",
            token=self.token,
        )
        self.assertEqual(missing_status, 404)
        self.assertEqual(missing_payload["error"], "Trace not found")

    def test_metrics_collection_tracks_requests_actions_and_failures(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "这里是回答", "actions": [{"type": "add_note", "data": {"content": "新笔记", "tags": ["洞察"]}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        _, success_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "成功请求", "bookId": "book-1"},
            token=self.token,
        )
        action_id = success_payload["actions"][0]["id"]
        approve_status, _ = self.request_json(
            "POST",
            f"/api/agent-actions/{action_id}/approve",
            token=self.token,
        )
        self.assertEqual(approve_status, 200)

        _, reject_chat = self.request_json(
            "POST",
            "/api/chat",
            {"message": "拒绝请求", "bookId": "book-1"},
            token=self.token,
        )
        reject_action_id = reject_chat["actions"][0]["id"]
        reject_status, _ = self.request_json(
            "POST",
            f"/api/agent-actions/{reject_action_id}/reject",
            token=self.token,
        )
        self.assertEqual(reject_status, 200)

        log_server.call_deepseek = lambda messages, model="deepseek-chat", max_tokens=1200: (_ for _ in ()).throw(RuntimeError("boom"))
        error_status, _ = self.request_json(
            "POST",
            "/api/chat",
            {"message": "失败请求", "bookId": ""},
            token=self.token,
        )
        self.assertEqual(error_status, 500)

        conn = log_server.get_conn()
        trace_id = "trace-failed-exec"
        log_server.TraceManager().create_trace(conn, trace_id=trace_id, user_id=self.user_id, message="manual", book_id="book-1")
        action = log_server.ActionStateMachine().create_action(
            conn,
            trace_id,
            self.user_id,
            {"type": "summary", "data": {"content": "x"}},
        )
        conn.close()
        original_execute = log_server.ActionExecutor.execute_action
        log_server.ActionExecutor.execute_action = lambda self, conn, user_id, action: log_server.ExecutionResult(False, log_server.ACTION_STATUS_FAILED, action, error_message="exec fail")
        try:
            failed_exec_status, _ = self.request_json(
                "POST",
                f"/api/agent-actions/{action['id']}/approve",
                token=self.token,
            )
        finally:
            log_server.ActionExecutor.execute_action = original_execute
        self.assertEqual(failed_exec_status, 500)

        metrics_status, metrics_payload = self.request_json("GET", "/api/agent-metrics", token=self.token)
        self.assertEqual(metrics_status, 200)
        metrics = metrics_payload["metrics"]
        self.assertEqual(metrics["requestCount"], 3)
        self.assertEqual(metrics["errorCount"], 1)
        self.assertEqual(metrics["approvalCount"], 2)
        self.assertEqual(metrics["rejectionCount"], 1)
        self.assertEqual(metrics["executionCount"], 1)
        self.assertEqual(metrics["failedExecutionCount"], 1)
        self.assertGreaterEqual(metrics["avgLatencyMs"], 0.0)
        self.assertGreaterEqual(metrics["avgInputTokens"], 0.0)
        self.assertGreaterEqual(metrics["avgOutputTokens"], 0.0)

    def test_agent_dashboard_renders_metrics_summary_html(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "这里是回答", "actions": [{"type": "add_note", "data": {"content": "新笔记", "tags": ["洞察"]}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        _, chat_payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": "成功请求", "bookId": "book-1"},
            token=self.token,
        )
        action_id = chat_payload["actions"][0]["id"]
        self.request_json("POST", f"/api/agent-actions/{action_id}/approve", token=self.token)

        status, html = self.request_text("GET", "/debug/agent-dashboard")
        self.assertEqual(status, 200)
        self.assertIn("Agent Operational Dashboard", html)
        self.assertIn("tester", html)
        self.assertIn("Requests", html)
        self.assertIn("Approvals", html)
        self.assertIn("Avg Latency", html)

    def test_model_logs_include_actions_and_trace_errors(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "推荐这本书", "actions": [{"type": "add_book", "data": {"title": "Deep Work", "author": "Cal Newport"}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        self.request_json(
            "POST",
            "/api/chat",
            {"message": "推荐一本相关书", "bookId": "book-1"},
            token=self.token,
        )

        status, payload = self.request_json("GET", "/api/model-logs", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["logs"]), 1)
        log_item = payload["logs"][0]
        self.assertEqual(log_item["actions"][0]["type"], "add_book")
        self.assertEqual(log_item["actions"][0]["status"], "PENDING_APPROVAL")
        self.assertEqual(log_item["actions"][0]["data"]["title"], "Deep Work")
        self.assertEqual(log_item["traceErrorMessage"], "")

    def test_debug_logs_html_renders_action_block(self):
        def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
            return json.dumps(
                {"reply": "记录一下", "actions": [{"type": "tag", "data": {"tags": ["哲学"]}}]},
                ensure_ascii=False,
            )

        log_server.call_deepseek = fake_deepseek
        self.request_json(
            "POST",
            "/api/chat",
            {"message": "给我打标签", "bookId": "book-1"},
            token=self.token,
        )

        status, html = self.request_text("GET", "/debug/logs")
        self.assertEqual(status, 200)
        self.assertIn("Actions", html)
        self.assertIn("tag", html)
        self.assertIn("PENDING_APPROVAL", html)


if __name__ == "__main__":
    unittest.main()
