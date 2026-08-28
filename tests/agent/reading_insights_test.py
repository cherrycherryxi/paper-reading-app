import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import app_server


class ReadingInsightsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = app_server.DB_PATH
        app_server.DB_PATH = Path(self.temp_dir.name) / "test.db"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        now = app_server.now_iso()
        conn = app_server.get_conn()
        conn.execute("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)", ("u1", "reader", "x", now))
        conn.execute("INSERT INTO sessions(token,user_id,created_at,last_seen_at) VALUES(?,?,?,?)", ("token", "u1", now, now))
        conn.execute("INSERT INTO user_state(user_id,state_json,updated_at) VALUES(?,?,?)", ("u1", "{}", now))
        conn.commit()
        conn.close()

    def tearDown(self):
        app_server.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def request(self, payload, token="token"):
        raw = json.dumps(payload).encode()
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/reading-insights"
        handler.command = "POST"
        handler.client_address = ("127.0.0.1", 12345)
        handler.headers = {"Content-Length": str(len(raw)), "Authorization": f"Bearer {token}"}
        handler.rfile = BytesIO(raw)
        handler.wfile = BytesIO()
        handler._active_conn = None
        handler.send_response = lambda status: setattr(handler, "status", status)
        handler.send_header = lambda *_: None
        handler.end_headers = lambda: None
        handler.do_POST()
        return handler.status, json.loads(handler.wfile.getvalue())

    def test_parser_accepts_fenced_json_and_bounds_copy(self):
        result = app_server.parse_reading_insight_narratives(
            '```json\n{"momentum":"稳定","structure":"聚焦","themes":"时间",'
            '"sediment":"开始形成关联"}\n```'
        )
        self.assertEqual(result["themes"], "时间")
        self.assertEqual(set(result), set(app_server.READING_INSIGHT_KEYS))

    def test_parser_rejects_missing_dimension(self):
        with self.assertRaises(ValueError):
            app_server.parse_reading_insight_narratives('{"momentum":"稳定"}')

    @patch("app_server.call_deepseek")
    def test_endpoint_sends_only_aggregate_metrics_and_returns_contract(self, model):
        model.return_value = json.dumps({
            "momentum": "最近节奏稳定。",
            "structure": "当前阅读较聚焦。",
            "themes": "时间是近期主题。",
            "sediment": "可以增加跨书关联。",
        }, ensure_ascii=False)
        metrics = {"weeks": [0, 10, 20], "themes": [{"name": "时间", "bookCount": 3}]}
        status, payload = self.request({"metrics": metrics})
        self.assertEqual(status, 200)
        self.assertEqual(payload["narratives"]["themes"], "时间是近期主题。")
        prompt = model.call_args.args[0][0]["content"]
        self.assertIn('"bookCount":3', prompt)
        self.assertNotIn("摘抄原文", prompt)

    def test_endpoint_requires_auth_and_rejects_empty_metrics(self):
        status, _ = self.request({"metrics": {}}, token="bad")
        self.assertEqual(status, 401)
        status, payload = self.request({"metrics": {}})
        self.assertEqual(status, 400)
        self.assertIn("无效", payload["error"])


if __name__ == "__main__":
    unittest.main()
