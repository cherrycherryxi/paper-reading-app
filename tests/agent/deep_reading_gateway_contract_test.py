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

    def test_quote_reflection_is_returned_searchable_and_user_scoped(self):
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
            owner_state = {
                "books": [{"id": "b1", "title": "三体"}],
                "quotes": [
                    {"id": "q1", "bookId": "b1", "content": "宇宙很大", "reflection": "黑暗森林也是信任困境"},
                    {"id": "q2", "bookId": "b1", "content": "另一条摘抄", "reflection": "无关理解"},
                ],
            }
            other_state = {
                "books": [{"id": "b2", "title": "别人的书"}],
                "quotes": [{"id": "q3", "bookId": "b2", "content": "秘密", "reflection": "信任困境"}],
            }
            conn.executemany("INSERT INTO user_state VALUES(?,?,?)", (
                ("u1", json.dumps(owner_state), "now"),
                ("u2", json.dumps(other_state), "now"),
            ))
            conn.commit()
            conn.close()
            store = ResearchRunStore(db_path)
            _, token = store.create("u1", {"type": "quote", "bookId": "b1", "quoteId": "q1"}, "研究")
            original_path, original_store = paper_reading_gateway.DB_PATH, paper_reading_gateway.store
            paper_reading_gateway.DB_PATH, paper_reading_gateway.store = db_path, store
            try:
                request = SimpleNamespace(headers={"authorization": f"Bearer {token}"})
                ctx = SimpleNamespace(request_context=SimpleNamespace(request=request))

                focused = paper_reading_gateway.get_reading_context(ctx)["quote"]
                self.assertEqual(focused["reflection"], "黑暗森林也是信任困境")
                self.assertNotIn("note", focused)

                matches = paper_reading_gateway.search_quotes("信任困境", ctx=ctx)
                self.assertEqual([item["id"] for item in matches], ["q1"])
                self.assertEqual(matches[0]["reflection"], "黑暗森林也是信任困境")
            finally:
                paper_reading_gateway.DB_PATH, paper_reading_gateway.store = original_path, original_store

    def test_quote_search_matches_owning_book_title_and_author_only_for_token_owner(self):
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
            owner_state = {
                "books": [
                    {"id": "b1", "title": "冬牧场", "author": "李娟"},
                    {"id": "b2", "title": "万物有灵且美", "author": "吉米·哈利"},
                ],
                "quotes": [
                    {"id": "q1", "bookId": "b1", "content": "雪落在寂静的荒野"},
                    {"id": "q2", "bookId": "b2", "content": "动物诊所的一天"},
                ],
            }
            other_state = {
                "books": [{"id": "b3", "title": "秘密冬牧场", "author": "李娟"}],
                "quotes": [{"id": "secret", "bookId": "b3", "content": "别人的摘抄"}],
            }
            conn.executemany("INSERT INTO user_state VALUES(?,?,?)", (
                ("u1", json.dumps(owner_state), "now"),
                ("u2", json.dumps(other_state), "now"),
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

                self.assertEqual(
                    [item["id"] for item in paper_reading_gateway.search_quotes("冬牧场", ctx=ctx)],
                    ["q1"],
                )
                self.assertEqual(
                    [item["id"] for item in paper_reading_gateway.search_quotes("吉米·哈利", ctx=ctx)],
                    ["q2"],
                )
                self.assertEqual(paper_reading_gateway.search_quotes("完全无关", ctx=ctx), [])
                self.assertNotIn(
                    "secret",
                    [item["id"] for item in paper_reading_gateway.search_quotes("李娟", ctx=ctx)],
                )
            finally:
                paper_reading_gateway.DB_PATH, paper_reading_gateway.store = original_path, original_store

    def test_reading_timeline_returns_real_page_fields_and_is_user_scoped(self):
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
            owner_state = {
                "books": [{"id": "b1", "title": "三体"}, {"id": "b2", "title": "球状闪电"}],
                "sessions": [
                    {
                        "id": "s1", "bookId": "b1", "date": "2026-08-20", "minutes": 45,
                        "startPage": 12, "endPage": 36, "pagesRead": 25, "note": "读完第一章",
                        "createdAt": "2026-08-20T12:00:00Z",
                    },
                    {
                        "id": "s2", "bookId": "b2", "date": "2026-08-19", "minutes": 20,
                        "startPage": 1, "endPage": 10, "pagesRead": 10,
                    },
                ],
            }
            other_state = {
                "books": [{"id": "b1", "title": "别人的书"}],
                "sessions": [
                    {
                        "id": "secret", "bookId": "b1", "date": "2026-08-21", "minutes": 60,
                        "startPage": 100, "endPage": 150, "pagesRead": 51,
                    },
                ],
            }
            conn.executemany("INSERT INTO user_state VALUES(?,?,?)", (
                ("u1", json.dumps(owner_state), "now"),
                ("u2", json.dumps(other_state), "now"),
            ))
            conn.commit()
            conn.close()
            store = ResearchRunStore(db_path)
            _, token = store.create("u1", {"type": "book", "bookId": "b1"}, "研究阅读进度")
            original_path, original_store = paper_reading_gateway.DB_PATH, paper_reading_gateway.store
            paper_reading_gateway.DB_PATH, paper_reading_gateway.store = db_path, store
            try:
                request = SimpleNamespace(headers={"authorization": f"Bearer {token}"})
                ctx = SimpleNamespace(request_context=SimpleNamespace(request=request))

                timeline = paper_reading_gateway.get_reading_timeline(ctx=ctx)

                self.assertEqual([item["id"] for item in timeline], ["s1"])
                self.assertEqual(timeline[0]["startPage"], 12)
                self.assertEqual(timeline[0]["endPage"], 36)
                self.assertEqual(timeline[0]["pagesRead"], 25)
                self.assertNotIn("pages", timeline[0])
                self.assertNotIn("secret", [item["id"] for item in timeline])
            finally:
                paper_reading_gateway.DB_PATH, paper_reading_gateway.store = original_path, original_store


if __name__ == "__main__":
    unittest.main()
