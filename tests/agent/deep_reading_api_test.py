import json
import threading
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import app_server


class _Runner:
    def __init__(self):
        self.started = []
        self.cancelled = []

    def start(self, run, token):
        self.started.append((run, token))

    def cancel(self, run_id):
        self.cancelled.append(run_id)


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
        self.original_web_capability = app_server.web_research_capability
        app_server.research_runner = lambda: self.runner
        app_server.ensure_research_gateway = lambda: None
        app_server.harness_capability = lambda: {"available": True, "reason": ""}
        app_server.web_research_capability = lambda: {"available": True, "reason": ""}

    def tearDown(self):
        app_server.research_runner = self.original_runner
        app_server.ensure_research_gateway = self.original_gateway
        app_server.harness_capability = self.original_capability
        app_server.web_research_capability = self.original_web_capability
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
        self.assertEqual(self.runner.cancelled, [run_id])

    def test_web_permission_is_explicit_per_run_and_not_sticky(self):
        _, first = self.request("POST", "/api/research-runs", {
            "context": {"type": "book", "bookId": "b1"}, "question": "联网研究", "webEnabled": True,
        })
        _, second = self.request("POST", "/api/research-runs", {
            "context": {"type": "book", "bookId": "b1"}, "question": "离线研究",
        })
        self.assertTrue(first["run"]["webEnabled"])
        self.assertFalse(second["run"]["webEnabled"])

    def test_web_permission_is_rejected_when_operator_switch_is_off(self):
        app_server.web_research_capability = lambda: {"available": False, "reason": "管理员未启用联网研究"}
        status, response = self.request("POST", "/api/research-runs", {
            "context": {"type": "book", "bookId": "b1"}, "question": "联网研究", "webEnabled": True,
        })
        self.assertEqual(status, 400)
        self.assertEqual(response["code"], "web_research_unavailable")
        self.assertEqual(self.runner.started, [])

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

    def test_malformed_proposals_are_filtered_without_losing_valid_result(self):
        run, _ = app_server.research_store().create(
            "u1", {"type": "book", "bookId": "b1"}, "过滤畸形建议"
        )
        result = app_server.persist_research_proposals(run, {
            "summary": "仍可保留的结论",
            "openQuestions": ["还需要什么证据？"],
            "proposals": [
                None,
                "not-an-object",
                {
                    "type": "question",
                    "data": {"content": "文明延续的代价是什么？"},
                    "evidenceIds": ["q1"],
                },
            ],
        })

        self.assertEqual(result["summary"], "仍可保留的结论")
        self.assertEqual(result["openQuestions"], ["还需要什么证据？"])
        self.assertEqual(result["proposalWarning"], "已移除 2 条格式无效的研究建议")
        self.assertEqual(len(result["proposals"]), 1)
        self.assertEqual(result["proposals"][0]["action"]["status"], app_server.ACTION_STATUS_PENDING)
        current = app_server.research_store().get(run["id"], "u1")
        self.assertEqual(current["status"], "COMPLETED")
        self.assertEqual(current["result"]["summary"], "仍可保留的结论")

    def test_unverifiable_evidence_is_removed_before_result_persistence(self):
        run, _ = app_server.research_store().create("u1", {"type": "global"}, "核验证据")
        result = app_server.persist_research_proposals(run, {
            "summary": "仍有真实证据支撑的结论",
            "evidenceMap": [
                {"claim": "可核验", "evidenceIds": ["q1"]},
                {"claim": "模型虚构", "evidenceIds": ["missing"]},
            ],
            "proposals": [],
        })
        self.assertEqual([item["claim"] for item in result["evidenceMap"]], ["可核验"])
        self.assertEqual(result["summary"], "仍有真实证据支撑的结论")
        self.assertIn("已移除 1 条", result["evidenceWarning"])

    def test_summary_is_downgraded_when_all_claimed_evidence_is_unverifiable(self):
        run, _ = app_server.research_store().create("u1", {"type": "global"}, "核验全部证据")
        result = app_server.persist_research_proposals(run, {
            "summary": "这是一个失去证据支撑的实质性结论",
            "evidenceMap": [{"claim": "模型虚构", "evidenceIds": ["missing"]}],
            "proposals": [],
        })

        self.assertEqual(result["evidenceMap"], [])
        self.assertEqual(result["summary"], "证据不足，无法形成可靠的研究结论。")
        self.assertIn("已移除 1 条", result["evidenceWarning"])

    def test_summary_is_unchanged_when_model_claimed_no_evidence(self):
        run, _ = app_server.research_store().create("u1", {"type": "global"}, "本来就没有证据")
        result = app_server.persist_research_proposals(run, {
            "summary": "当前没有足够的阅读记录可供分析",
            "evidenceMap": [],
            "proposals": [],
        })

        self.assertEqual(result["evidenceMap"], [])
        self.assertEqual(result["summary"], "当前没有足够的阅读记录可供分析")
        self.assertNotIn("evidenceWarning", result)

    def test_cancellation_winning_write_lock_creates_no_trace_or_action(self):
        run, _ = app_server.research_store().create("u1", {"type": "book", "bookId": "b1"}, "取消竞态")
        cancelling_conn = app_server.get_conn()
        cancelling_conn.execute("BEGIN IMMEDIATE")
        cancelling_conn.execute(
            "UPDATE research_runs SET status='CANCELLED', cancel_requested=1 WHERE run_id=?", (run["id"],)
        )
        finished = threading.Event()
        outcome = {}

        def persist():
            try:
                outcome["result"] = app_server.persist_research_proposals(run, {
                    "proposals": [{
                        "type": "question",
                        "data": {"content": "取消后不应保存"},
                        "reason": "回归测试",
                        "evidenceIds": ["q1"],
                    }],
                })
            finally:
                finished.set()

        worker = threading.Thread(target=persist)
        worker.start()
        self.assertFalse(finished.wait(0.1), "proposal persistence should wait for cancellation's write lock")
        cancelling_conn.commit()
        cancelling_conn.close()
        worker.join(timeout=2)
        self.assertTrue(finished.is_set())
        self.assertIn("result", outcome)

        conn = app_server.get_conn()
        action_count = conn.execute("SELECT COUNT(*) FROM agent_actions WHERE user_id='u1'").fetchone()[0]
        trace_count = conn.execute(
            "SELECT COUNT(*) FROM agent_traces WHERE user_id='u1' AND request_type='deep_reading'"
        ).fetchone()[0]
        conn.close()
        self.assertEqual(action_count, 0)
        self.assertEqual(trace_count, 0)

    def test_proposal_commit_atomically_completes_before_late_cancel(self):
        run, _ = app_server.research_store().create("u1", {"type": "book", "bookId": "b1"}, "完成竞态")
        validation_started = threading.Event()
        release_validation = threading.Event()
        persistence_finished = threading.Event()
        cancellation_finished = threading.Event()
        outcome = {}
        original_validate = app_server.ActionValidator.validate

        def blocking_validate(validator, actions):
            validation_started.set()
            if not release_validation.wait(2):
                raise AssertionError("validation release timed out")
            return original_validate(validator, actions)

        def persist():
            try:
                outcome["result"] = app_server.persist_research_proposals(run, {
                    "summary": "原子完成",
                    "proposals": [{
                        "type": "question",
                        "data": {"content": "完成后应可见"},
                        "reason": "回归测试",
                        "evidenceIds": ["q1"],
                    }],
                })
            finally:
                persistence_finished.set()

        def cancel():
            try:
                outcome["cancel"] = app_server.research_store().cancel(run["id"], "u1")
            finally:
                cancellation_finished.set()

        with patch.object(app_server.ActionValidator, "validate", blocking_validate):
            persistence_worker = threading.Thread(target=persist)
            persistence_worker.start()
            self.assertTrue(validation_started.wait(1))

            cancellation_worker = threading.Thread(target=cancel)
            cancellation_worker.start()
            self.assertFalse(
                cancellation_finished.wait(0.1),
                "cancel should wait while the completion transaction owns the write lock",
            )

            release_validation.set()
            persistence_worker.join(timeout=2)
            cancellation_worker.join(timeout=2)

        self.assertTrue(persistence_finished.is_set())
        self.assertTrue(cancellation_finished.is_set())
        self.assertEqual(outcome["cancel"]["status"], "COMPLETED")

        current = app_server.research_store().get(run["id"], "u1")
        self.assertEqual(current["status"], "COMPLETED")
        self.assertEqual(current["result"]["summary"], "原子完成")
        self.assertEqual(current["result"]["proposals"][0]["action"]["status"], app_server.ACTION_STATUS_PENDING)

        conn = app_server.get_conn()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM agent_actions WHERE user_id='u1'").fetchone()[0], 1)
        self.assertEqual(
            conn.execute(
                "SELECT COUNT(*) FROM agent_traces WHERE user_id='u1' AND request_type='deep_reading'"
            ).fetchone()[0],
            1,
        )
        conn.close()


if __name__ == "__main__":
    unittest.main()
