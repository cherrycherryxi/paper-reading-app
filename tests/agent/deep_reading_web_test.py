import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import paper_reading_gateway
from deep_reading import ResearchRunStore, web_research_capability


class DeepReadingWebTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "web.db"
        conn = sqlite3.connect(self.db_path)
        conn.executescript("""
            CREATE TABLE user_state(user_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL);
            CREATE TABLE research_runs(run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,dsh_session_id TEXT NOT NULL,
              context_type TEXT NOT NULL,book_id TEXT NOT NULL,quote_id TEXT NOT NULL,question TEXT NOT NULL,
              status TEXT NOT NULL,progress_stage TEXT NOT NULL,progress_message TEXT NOT NULL,result_json TEXT NOT NULL,
              error_message TEXT NOT NULL,gateway_token_hash TEXT NOT NULL,cancel_requested INTEGER NOT NULL,
              created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT NOT NULL,web_enabled INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE research_run_events(event_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,event_type TEXT NOT NULL,
              metadata TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE research_web_requests(request_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,user_id TEXT NOT NULL,
              query TEXT NOT NULL,operation TEXT NOT NULL DEFAULT 'search',endpoint_host TEXT NOT NULL,status TEXT NOT NULL,result_count INTEGER NOT NULL,
              error_message TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE research_web_sources(source_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,user_id TEXT NOT NULL,
              url TEXT NOT NULL,title TEXT NOT NULL,score REAL NOT NULL,created_at TEXT NOT NULL,UNIQUE(run_id,url));
        """)
        self.private_quote = "这是不应该被原样发送到公网的一整段私人摘抄内容，长度足够触发保护规则"
        state = {"books": [{"id": "b1", "title": "时间简史"}], "quotes": [
            {"id": "q1", "bookId": "b1", "content": self.private_quote}
        ]}
        conn.execute("INSERT INTO user_state VALUES(?,?,?)", ("u1", json.dumps(state), "now"))
        conn.commit()
        conn.close()
        self.store = ResearchRunStore(self.db_path)
        self.original = (paper_reading_gateway.DB_PATH, paper_reading_gateway.store)
        paper_reading_gateway.DB_PATH, paper_reading_gateway.store = self.db_path, self.store

    def tearDown(self):
        paper_reading_gateway.DB_PATH, paper_reading_gateway.store = self.original
        self.temp_dir.cleanup()

    def context(self, web_enabled=True):
        _, token = self.store.create("u1", {"type": "book", "bookId": "b1"}, "研究地球年龄", web_enabled)
        request = SimpleNamespace(headers={"authorization": f"Bearer {token}"})
        return SimpleNamespace(request_context=SimpleNamespace(request=request))

    def test_server_switch_defaults_off(self):
        with patch.dict("os.environ", {"DEEP_READING_WEB_ENABLED": ""}, clear=False):
            self.assertFalse(web_research_capability()["available"])
            with self.assertRaisesRegex(PermissionError, "未获联网授权"):
                paper_reading_gateway.search_public_web("地球年龄", ctx=self.context())

    def test_per_run_switch_defaults_off_even_when_server_allows_web(self):
        env = {"DEEP_READING_WEB_ENABLED": "true"}
        with patch.dict("os.environ", env, clear=False):
            with self.assertRaisesRegex(PermissionError, "未获联网授权"):
                paper_reading_gateway.search_public_web("地球年龄", ctx=self.context(False))

    def test_private_quote_cannot_be_used_as_search_query(self):
        env = {"DEEP_READING_WEB_ENABLED": "true"}
        with patch.dict("os.environ", env, clear=False):
            with self.assertRaisesRegex(PermissionError, "私人摘抄"):
                paper_reading_gateway.search_public_web(self.private_quote, ctx=self.context())

    def test_tavily_fixed_host_accepts_vpn_fake_ip(self):
        env = {"DEEP_READING_WEB_ENABLED": "true"}
        with patch.dict("os.environ", env, clear=False), patch(
            "paper_reading_gateway.socket.getaddrinfo",
            return_value=[(2, 1, 6, "", ("127.0.0.1", 443))],
        ), patch("paper_reading_gateway._tavily_request", return_value={"results": []}):
            self.assertEqual(paper_reading_gateway.search_public_web("地球年龄", ctx=self.context()), [])

    def test_search_result_rejects_literal_private_url(self):
        self.assertFalse(paper_reading_gateway._is_public_https_url("https://127.0.0.1/private"))
        self.assertFalse(paper_reading_gateway._is_public_https_url("https://router.local/private"))

    def test_success_uses_pinned_public_ip_and_writes_audit(self):
        class Response:
            status = 200
            def read(self, _):
                return json.dumps({"results": [{
                    "title": "地球年龄", "url": "https://example.org/earth", "content": "约 45.4 亿年",
                }]}).encode()

        class Connection:
            instances = []
            def __init__(self, hostname, port, pinned_ip, timeout):
                self.args = (hostname, port, pinned_ip, timeout)
                self.request_args = None
                self.__class__.instances.append(self)
            def request(self, method, target, body=None, headers=None):
                self.request_args = (method, target, body, headers)
            def getresponse(self):
                return Response()
            def close(self):
                pass

        env = {"DEEP_READING_WEB_ENABLED": "true"}
        with patch.dict("os.environ", env, clear=False), patch(
            "paper_reading_gateway.socket.getaddrinfo",
            return_value=[(2, 1, 6, "", ("203.0.113.10", 443))],
        ), patch("paper_reading_gateway.ipaddress.ip_address") as parse_ip, patch(
            "paper_reading_gateway._PinnedHTTPSConnection", Connection,
        ):
            parse_ip.return_value.is_global = True
            results = paper_reading_gateway.search_public_web("地球年龄", ctx=self.context())
        self.assertEqual(results[0]["url"], "https://example.org/earth")
        self.assertEqual(Connection.instances[0].args[2], "203.0.113.10")
        self.assertEqual(Connection.instances[0].request_args[:2], ("POST", "/search"))
        self.assertEqual(json.loads(Connection.instances[0].request_args[2])["query"], "地球年龄")
        self.assertEqual(Connection.instances[0].request_args[3]["X-Tavily-Access-Mode"], "keyless")
        conn = sqlite3.connect(self.db_path)
        audit = conn.execute("SELECT status,result_count,endpoint_host FROM research_web_requests").fetchone()
        conn.close()
        self.assertEqual(audit, ("SUCCEEDED", 1, "api.tavily.com"))

    def test_extract_only_accepts_urls_discovered_by_same_run(self):
        context = self.context()
        token = context.request_context.request.headers["authorization"][7:]
        run_id = self.store.authenticate_gateway(token)["run_id"]
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO research_web_sources VALUES(?,?,?,?,?,?,?)",
            ("s1", run_id, "u1", "https://example.org/earth", "Earth", 0.9, "now"),
        )
        conn.commit()
        conn.close()
        env = {"DEEP_READING_WEB_ENABLED": "true"}
        with patch.dict("os.environ", env, clear=False), patch(
            "paper_reading_gateway._tavily_request",
            return_value={"results": [{"url": "https://example.org/earth", "raw_content": "约 45.4 亿年"}]},
        ):
            result = paper_reading_gateway.extract_public_pages(
                ["https://example.org/earth"], "地球年龄", ctx=context,
            )
        self.assertEqual(result[0]["content"], "约 45.4 亿年")
        with patch.dict("os.environ", env, clear=False):
            with self.assertRaisesRegex(PermissionError, "搜索结果"):
                paper_reading_gateway.extract_public_pages(
                    ["https://other.example/private"], "地球年龄", ctx=context,
                )


if __name__ == "__main__":
    unittest.main()
