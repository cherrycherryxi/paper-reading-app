import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from deep_reading import ResearchRunStore


class DeepReadingStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "research.db"
        conn = sqlite3.connect(self.db_path)
        conn.executescript(
            """
            CREATE TABLE user_state (user_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE research_runs (
                run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,dsh_session_id TEXT NOT NULL DEFAULT '',
                context_type TEXT NOT NULL,book_id TEXT NOT NULL DEFAULT '',quote_id TEXT NOT NULL DEFAULT '',
                question TEXT NOT NULL,status TEXT NOT NULL,progress_stage TEXT NOT NULL DEFAULT '',
                progress_message TEXT NOT NULL DEFAULT '',result_json TEXT NOT NULL DEFAULT '{}',
                error_message TEXT NOT NULL DEFAULT '',gateway_token_hash TEXT NOT NULL,
                cancel_requested INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
                completed_at TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE research_run_events (
                event_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,event_type TEXT NOT NULL,
                metadata TEXT NOT NULL,created_at TEXT NOT NULL
            );
            """
        )
        self.state = {
            "books": [{"id": "book-1", "title": "三体"}],
            "quotes": [{"id": "quote-1", "bookId": "book-1", "content": "给岁月以文明"}],
            "sessions": [], "connections": [], "memories": [],
        }
        conn.execute(
            "INSERT INTO user_state VALUES(?,?,?)",
            ("user-1", json.dumps(self.state, ensure_ascii=False), "2026-08-15T00:00:00Z"),
        )
        conn.commit()
        conn.close()
        self.store = ResearchRunStore(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_run_token_binds_gateway_to_server_side_user(self):
        run, token = self.store.create(
            "user-1", {"type": "quote", "bookId": "book-1", "quoteId": "quote-1"}, "找出反驳证据"
        )

        bound = self.store.authenticate_gateway(token)
        self.assertEqual(bound["user_id"], "user-1")
        self.assertEqual(bound["run_id"], run["id"])
        self.assertNotIn("gateway_token", run)
        self.assertIsNone(self.store.authenticate_gateway("wrong-token"))

    def test_context_must_belong_to_user_state(self):
        with self.assertRaisesRegex(ValueError, "bookId does not exist"):
            self.store.create("user-1", {"type": "book", "bookId": "other-user-book"}, "研究")

    def test_cancelled_run_cannot_be_overwritten_by_late_completion(self):
        run, _ = self.store.create("user-1", {"type": "book", "bookId": "book-1"}, "研究")
        cancelled = self.store.cancel(run["id"], "user-1")
        self.store.complete(run["id"], {"summary": "late"})

        current = self.store.get(run["id"], "user-1")
        self.assertEqual(cancelled["status"], "CANCELLED")
        self.assertEqual(current["status"], "CANCELLED")
        self.assertEqual(current["result"], {})

    def test_user_cannot_read_another_users_run(self):
        run, _ = self.store.create("user-1", {"type": "global"}, "研究")
        self.assertIsNone(self.store.get(run["id"], "user-2"))

    def test_startup_recovery_fails_only_interrupted_runs_once(self):
        created, _ = self.store.create("user-1", {"type": "global"}, "尚未启动")
        running, _ = self.store.create("user-1", {"type": "book", "bookId": "book-1"}, "研究中")
        completed, _ = self.store.create("user-1", {"type": "global"}, "已完成")
        self.store.progress(running["id"], "research", "研究中", "RESEARCH_STARTED")
        self.store.complete(completed["id"], {"summary": "done"})

        self.assertEqual(self.store.fail_interrupted_runs(), 2)
        self.assertEqual(self.store.fail_interrupted_runs(), 0)

        for run_id in (created["id"], running["id"]):
            recovered = self.store.get(run_id, "user-1", include_events=True)
            self.assertEqual(recovered["status"], "FAILED")
            self.assertEqual(recovered["progress"]["message"], "服务重启，任务已中断")
            self.assertIn("服务重启中断", recovered["error"])
            self.assertTrue(recovered["completedAt"])
            self.assertEqual(
                [event["type"] for event in recovered["events"]].count("RUN_FAILED"), 1
            )

        untouched = self.store.get(completed["id"], "user-1")
        self.assertEqual(untouched["status"], "COMPLETED")
        self.assertEqual(untouched["result"], {"summary": "done"})


if __name__ == "__main__":
    unittest.main()
