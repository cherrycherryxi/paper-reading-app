import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class _Runner:
    def __init__(self):
        self.started = []

    def start(self, run, token):
        self.started.append((run, token))


class _FailingRunner:
    def start(self, run, token):
        raise RuntimeError("runner startup failed")


class DeepReadingApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = app_server.DB_PATH
        self.original_upload_dir = app_server.UPLOAD_DIR
        app_server.DB_PATH = Path(self.temp_dir.name) / "test.db"
        app_server.UPLOAD_DIR = Path(self.temp_dir.name) / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        now = app_server.now_iso()
        conn = app_server.get_conn()
        conn.execute("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)", ("u1", "reader", "x", now))
        conn.execute("INSERT INTO sessions(token,user_id,created_at,last_seen_at) VALUES(?,?,?,?)", ("token", "u1", now, now))
        state = {"books": [{"id": "b1", "title": "三体"}], "quotes": [{"id": "q1", "bookId": "b1", "content": "文明"}]}
        conn.execute("INSERT INTO user_state(user_id,state_json,updated_at) VALUES(?,?,?)", ("u1", json.dumps(state), now))
        conn.commit()
        conn.close()
        self.runner = _Runner()
        self.original_runner = app_server.research_runner
        self.original_gateway = app_server.ensure_research_gateway
        self.original_capability = app_server.harness_capability
        app_server.research_runner = lambda: self.runner
        app_server.ensure_research_gateway = lambda: None
        app_server.harness_capability = lambda: {"available": True, "reason": ""}

    def tearDown(self):
        app_server.research_runner = self.original_runner
        app_server.ensure_research_gateway = self.original_gateway
        app_server.harness_capability = self.original_capability
        app_server.DB_PATH = self.original_db_path
        app_server.UPLOAD_DIR = self.original_upload_dir
        self.temp_dir.cleanup()

    def request(self, method, path, payload=None, token="token"):
        raw = json.dumps(payload or {}).encode()
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = path
        handler.command = method
        handler.headers = {"Content-Length": str(len(raw)), "Authorization": f"Bearer {token}"}
        handler.rfile = BytesIO(raw)
        handler.wfile = BytesIO()
        handler._active_conn = None
        handler.send_response = lambda status: setattr(handler, "status", status)
        handler.send_header = lambda *_: None
        handler.end_headers = lambda: None
        getattr(handler, f"do_{method}")()
        return handler.status, json.loads(handler.wfile.getvalue())

    def test_create_get_list_and_cancel_research_run(self):
        status, created = self.request("POST", "/api/research-runs", {
            "context": {"type": "quote", "bookId": "b1", "quoteId": "q1"},
            "question": "有哪些支持和反驳？",
        })
        self.assertEqual(status, 202)
        run_id = created["run"]["id"]
        self.assertEqual(len(self.runner.started), 1)

        status, fetched = self.request("GET", f"/api/research-runs/{run_id}")
        self.assertEqual(status, 200)
        self.assertEqual(fetched["run"]["context"]["quoteId"], "q1")

        status, listed = self.request("GET", "/api/research-runs?bookId=b1")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in listed["runs"]], [run_id])

        status, cancelled = self.request("POST", f"/api/research-runs/{run_id}/cancel")
        self.assertEqual(status, 200)
        self.assertEqual(cancelled["run"]["status"], "CANCELLED")

    def test_gateway_startup_failure_marks_created_run_failed(self):
        app_server.ensure_research_gateway = lambda: (_ for _ in ()).throw(ValueError("gateway startup failed"))

        status, response = self.request("POST", "/api/research-runs", {
            "context": {"type": "book", "bookId": "b1"},
            "question": "启动失败后会怎样？",
        })

        self.assertEqual(status, 500)
        self.assertEqual(response["error"], "gateway startup failed")
        status, listed = self.request("GET", "/api/research-runs")
        self.assertEqual(status, 200)
        self.assertEqual(listed["runs"][0]["status"], "FAILED")
        self.assertEqual(listed["runs"][0]["error"], "gateway startup failed")

    def test_runner_startup_failure_marks_created_run_failed(self):
        app_server.research_runner = lambda: _FailingRunner()

        status, response = self.request("POST", "/api/research-runs", {
            "context": {"type": "book", "bookId": "b1"},
            "question": "启动失败后会怎样？",
        })

        self.assertEqual(status, 500)
        self.assertEqual(response["error"], "runner startup failed")
        status, listed = self.request("GET", "/api/research-runs")
        self.assertEqual(status, 200)
        self.assertEqual(listed["runs"][0]["status"], "FAILED")
        self.assertEqual(listed["runs"][0]["error"], "runner startup failed")

    def test_research_proposal_enters_existing_approval_state_machine(self):
        run, _ = app_server.research_store().create(
            "u1", {"type": "book", "bookId": "b1"}, "形成一个待追问问题"
        )
        result = app_server.persist_research_proposals(run, {
            "summary": "结论",
            "proposals": [{
                "type": "question",
                "data": {"content": "文明延续的代价是什么？"},
                "reason": "值得继续追问",
                "evidenceIds": ["q1"],
            }],
        })

        action = result["proposals"][0]["action"]
        self.assertEqual(action["status"], app_server.ACTION_STATUS_PENDING)
        self.assertEqual(action["data"]["bookId"], "b1")
        conn = app_server.get_conn()
        state = app_server.load_state(conn, "u1")
        conn.close()
        self.assertEqual(state["quotes"][0]["id"], "q1")

    def test_unverifiable_evidence_is_removed_before_result_persistence(self):
        run, _ = app_server.research_store().create("u1", {"type": "global"}, "核验证据")
        result = app_server.persist_research_proposals(run, {
            "evidenceMap": [
                {"claim": "可核验", "evidenceIds": ["q1"]},
                {"claim": "模型虚构", "evidenceIds": ["missing"]},
            ],
            "proposals": [],
        })
        self.assertEqual([item["claim"] for item in result["evidenceMap"]], ["可核验"])
        self.assertIn("已移除 1 条", result["evidenceWarning"])


if __name__ == "__main__":
    unittest.main()
