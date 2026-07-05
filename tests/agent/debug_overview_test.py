"""P2 增长总览 /debug/overview 回归锁。

驱动真实 Handler.do_GET,断言:
  1. loopback + 无 ADMIN_TOKEN → 200 且含总览结构与真实聚合数(激活漏斗按 state_json 计)。
  2. 设了 ADMIN_TOKEN 但不带 X-Log-Token → 401(复用 _authorized_for_admin,与其它 /debug/* 一致)。
  3. 页面不泄露用户摘抄正文(隐私边界:只显示计数)。
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class DebugOverviewTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base = Path(self.temp_dir.name)
        app_server.DB_PATH = base / "test.db"
        app_server.UPLOAD_DIR = base / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self._orig_token = app_server.AUTH_TOKEN
        app_server.AUTH_TOKEN = ""  # unset → loopback allowed
        conn = app_server.get_conn()
        now = app_server.now_iso()
        # alice: 有书+摘抄(含一句可识别正文)  bob: 空账号
        alice_state = {"books": [{"id": "b1", "title": "T"}],
                       "quotes": [{"id": "q1", "text": "SECRET_QUOTE_BODY"}],
                       "sessions": [], "chatHistories": {}}
        for uname, st in [("alice", alice_state), ("bob", {"books": []})]:
            conn.execute("INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
                         (f"user-{uname}", uname, "x", now))
            conn.execute("INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
                         (f"user-{uname}", json.dumps(st), now))
        conn.commit()
        conn.close()

    def tearDown(self):
        app_server.AUTH_TOKEN = self._orig_token
        self.temp_dir.cleanup()

    def _get_overview(self, client_ip="127.0.0.1", log_token=None):
        h = app_server.Handler.__new__(app_server.Handler)
        h.path = "/debug/overview"
        h.command = "GET"
        h.client_address = (client_ip, 5432)
        h.headers = {"Content-Length": "0"}
        if log_token is not None:
            h.headers["X-Log-Token"] = log_token
        h.rfile = BytesIO(b"")
        h.wfile = BytesIO()
        h._status = None
        h._active_conn = None
        h.send_response = lambda c: setattr(h, "_status", c)
        h.send_header = lambda *a, **k: None
        h.end_headers = lambda: None
        h.do_GET()
        return h._status, h.wfile.getvalue().decode()

    def test_loopback_renders_overview(self):
        status, body = self._get_overview()
        self.assertEqual(status, 200)
        self.assertIn("Prod 增长总览", body)
        self.assertIn("累计用户", body)
        # 激活漏斗:2 用户中仅 alice 有书/摘抄
        self.assertIn("激活·加书", body)
        self.assertIn("1/2", body)  # 加书 & 摘抄都是 1/2

    def test_does_not_leak_quote_body(self):
        _, body = self._get_overview()
        self.assertNotIn("SECRET_QUOTE_BODY", body,
                         "总览只应显示计数,绝不能渲染用户摘抄正文")

    def test_token_set_without_header_is_unauthorized(self):
        app_server.AUTH_TOKEN = "secret"
        status, body = self._get_overview(client_ip="127.0.0.1", log_token=None)
        self.assertEqual(status, 401)
        self.assertIn("Unauthorized", body)

    def test_token_set_with_matching_header_ok(self):
        app_server.AUTH_TOKEN = "secret"
        status, body = self._get_overview(client_ip="203.0.113.9", log_token="secret")
        self.assertEqual(status, 200)
        self.assertIn("Prod 增长总览", body)


if __name__ == "__main__":
    unittest.main()
