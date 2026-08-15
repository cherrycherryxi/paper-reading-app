import inspect
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import paper_reading_gateway
from deep_reading import ResearchRunStore


class DeepReadingGatewayContractTests(unittest.TestCase):
    def test_gateway_exposes_only_read_tools_without_identity_argument(self):
        tools = {
            "get_reading_context": paper_reading_gateway.get_reading_context,
            "search_quotes": paper_reading_gateway.search_quotes,
            "list_books": paper_reading_gateway.list_books,
            "get_connections": paper_reading_gateway.get_connections,
            "get_confirmed_memories": paper_reading_gateway.get_confirmed_memories,
            "get_reading_timeline": paper_reading_gateway.get_reading_timeline,
        }
        self.assertEqual(len(tools), 6)
        self.assertFalse(any(name.startswith(("add_", "update_", "delete_", "save_")) for name in tools))
        for function in tools.values():
            params = inspect.signature(function).parameters
            self.assertNotIn("user_id", params)
            self.assertNotIn("token", params)

    def test_bound_gateway_reads_only_the_token_owners_state(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "gateway.db"
            conn = sqlite3.connect(db_path)
            conn.executescript("""
                CREATE TABLE user_state(user_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL);
                CREATE TABLE research_runs(run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,dsh_session_id TEXT NOT NULL,
                  context_type TEXT NOT NULL,book_id TEXT NOT NULL,quote_id TEXT NOT NULL,question TEXT NOT NULL,
                  status TEXT NOT NULL,progress_stage TEXT NOT NULL,progress_message TEXT NOT NULL,result_json TEXT NOT NULL,
                  error_message TEXT NOT NULL,gateway_token_hash TEXT NOT NULL,cancel_requested INTEGER NOT NULL,
                  created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT NOT NULL);
                CREATE TABLE research_run_events(event_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,event_type TEXT NOT NULL,
                  metadata TEXT NOT NULL,created_at TEXT NOT NULL);
            """)
            conn.execute("INSERT INTO user_state VALUES(?,?,?)", (
                "u1", json.dumps({"books": [{"id": "b1", "title": "三体"}], "quotes": []}), "now"
            ))
            conn.commit()
            conn.close()
            store = ResearchRunStore(db_path)
            _, token = store.create("u1", {"type": "book", "bookId": "b1"}, "研究")
            original_path, original_store = paper_reading_gateway.DB_PATH, paper_reading_gateway.store
            paper_reading_gateway.DB_PATH, paper_reading_gateway.store = db_path, store
            try:
                request = SimpleNamespace(headers={"authorization": f"Bearer {token}"})
                ctx = SimpleNamespace(request_context=SimpleNamespace(request=request))
                result = paper_reading_gateway.get_reading_context(ctx)
                self.assertEqual(result["book"]["title"], "三体")
                self.assertNotIn("userId", result)
                bad = SimpleNamespace(request_context=SimpleNamespace(request=SimpleNamespace(headers={})))
                with self.assertRaises(PermissionError):
                    paper_reading_gateway.get_reading_context(bad)
            finally:
                paper_reading_gateway.DB_PATH, paper_reading_gateway.store = original_path, original_store


if __name__ == "__main__":
    unittest.main()
