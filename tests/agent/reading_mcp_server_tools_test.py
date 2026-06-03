import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import reading_mcp_server


class ReadingMCPServerToolTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        self.original_db_path = reading_mcp_server.DB_PATH
        reading_mcp_server.DB_PATH = self.db_path
        self.user_id = "user-test"
        self.initial_state = {
            "books": [
                {
                    "id": "book-1",
                    "title": "三体",
                    "author": "刘慈欣",
                    "status": "reading",
                    "notes": "初始笔记",
                    "tags": ["科幻"],
                    "createdAt": "2026-01-01T00:00:00",
                    "updatedAt": "2026-01-01T00:00:00",
                },
                {
                    "id": "book-2",
                    "title": "黑暗森林",
                    "author": "刘慈欣",
                    "status": "wishlist",
                    "notes": "",
                    "tags": [],
                    "createdAt": "2026-01-02T00:00:00",
                    "updatedAt": "2026-01-02T00:00:00",
                },
            ],
            "quotes": [
                {
                    "id": "quote-1",
                    "bookId": "book-1",
                    "content": "给岁月以文明。",
                    "kind": "quote",
                    "tags": ["摘抄"],
                    "createdAt": "2026-01-03T00:00:00",
                }
            ],
            "sessions": [],
            "chatHistories": {},
            "connections": [],
        }
        self._init_db(self.initial_state)

    def tearDown(self):
        reading_mcp_server.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def _init_db(self, state):
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "CREATE TABLE user_state (user_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            (self.user_id, json.dumps(state, ensure_ascii=False), "2026-01-01T00:00:00"),
        )
        conn.commit()
        conn.close()

    def _load_state(self):
        conn = sqlite3.connect(self.db_path)
        row = conn.execute("SELECT state_json FROM user_state WHERE user_id = ?", (self.user_id,)).fetchone()
        conn.close()
        return json.loads(row[0])

    def test_add_note_writes_note_to_quotes_head(self):
        result = reading_mcp_server.add_note(self.user_id, "这是一个新想法", "book-1", ["思想"])

        self.assertTrue(result["ok"])
        created = result["created"]
        self.assertEqual(created["bookId"], "book-1")
        self.assertEqual(created["content"], "这是一个新想法")
        self.assertEqual(created["kind"], "note")
        self.assertEqual(created["tags"], ["思想"])

        state = self._load_state()
        self.assertEqual(state["quotes"][0]["id"], created["id"])
        self.assertEqual(state["quotes"][0]["kind"], "note")

    def test_add_note_rejects_empty_content_without_writing(self):
        result = reading_mcp_server.add_note(self.user_id, "", "book-1")

        self.assertEqual(result, {"ok": False, "error": "content is required"})
        self.assertEqual(self._load_state(), self.initial_state)

    def test_add_book_creates_wishlist_book_and_skips_duplicate(self):
        created_result = reading_mcp_server.add_book(self.user_id, "球状闪电", "刘慈欣", "补充阅读")

        self.assertTrue(created_result["ok"])
        created = created_result["created"]
        self.assertEqual(created["title"], "球状闪电")
        self.assertEqual(created["author"], "刘慈欣")
        self.assertEqual(created["status"], "wishlist")
        self.assertEqual(created["notes"], "补充阅读")

        skipped_result = reading_mcp_server.add_book(self.user_id, "球状闪电", "刘慈欣", "重复推荐")
        self.assertTrue(skipped_result["ok"])
        self.assertTrue(skipped_result["skipped"])

        state = self._load_state()
        matching = [book for book in state["books"] if book["title"] == "球状闪电" and book["author"] == "刘慈欣"]
        self.assertEqual(len(matching), 1)
        self.assertEqual(state["books"][0]["id"], created["id"])

    def test_add_book_skips_duplicate_when_author_has_nationality_marker(self):
        created_result = reading_mcp_server.add_book(self.user_id, "悉达多", "黑塞", "补充阅读")
        self.assertTrue(created_result["ok"])

        skipped_result = reading_mcp_server.add_book(self.user_id, "《悉达多》", "[德] 黑塞", "重复推荐")
        self.assertTrue(skipped_result["ok"])
        self.assertTrue(skipped_result["skipped"])

        state = self._load_state()
        matching = [book for book in state["books"] if book["title"] == "悉达多"]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["author"], "黑塞")

    def test_add_book_rejects_empty_title(self):
        result = reading_mcp_server.add_book(self.user_id, "")

        self.assertEqual(result, {"ok": False, "error": "title is required"})
        self.assertEqual(self._load_state(), self.initial_state)

    def test_summary_appends_to_existing_book_notes(self):
        result = reading_mcp_server.summary(self.user_id, "阶段性总结", "book-1")

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated"], {"bookId": "book-1"})
        state = self._load_state()
        book = next(item for item in state["books"] if item["id"] == "book-1")
        self.assertEqual(book["notes"], "初始笔记\n\n阶段性总结")
        self.assertIn("updatedAt", book)

    def test_summary_rejects_missing_book(self):
        result = reading_mcp_server.summary(self.user_id, "阶段性总结", "missing-book")

        self.assertEqual(result, {"ok": False, "error": "book not found: missing-book"})
        self.assertEqual(self._load_state(), self.initial_state)

    def test_question_upserts_one_question_per_book(self):
        first_result = reading_mcp_server.question(self.user_id, "文明如何跨越猜疑链？", "book-1")
        second_result = reading_mcp_server.question(self.user_id, "技术爆炸是否必然发生？", "book-1")

        self.assertTrue(first_result["ok"])
        self.assertTrue(second_result["ok"])
        state = self._load_state()
        questions = [
            quote
            for quote in state["quotes"]
            if quote.get("kind") == "question" and quote.get("bookId") == "book-1"
        ]
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["content"], "技术爆炸是否必然发生？")
        self.assertEqual(questions[0]["tags"], ["问题"])

    def test_question_rejects_empty_content(self):
        result = reading_mcp_server.question(self.user_id, "", "book-1")

        self.assertEqual(result, {"ok": False, "error": "content is required"})
        self.assertEqual(self._load_state(), self.initial_state)

    def test_tag_merges_tags_and_rejects_invalid_requests(self):
        result = reading_mcp_server.tag(self.user_id, ["科幻", "宇宙社会学"], "book-1")

        self.assertTrue(result["ok"])
        self.assertEqual(set(result["updated"]["tags"]), {"科幻", "宇宙社会学"})
        state = self._load_state()
        book = next(item for item in state["books"] if item["id"] == "book-1")
        self.assertEqual(set(book["tags"]), {"科幻", "宇宙社会学"})

        self.assertEqual(
            reading_mcp_server.tag(self.user_id, [], "book-1"),
            {"ok": False, "error": "tags is required"},
        )
        self.assertEqual(
            reading_mcp_server.tag(self.user_id, ["哲学"], "missing-book"),
            {"ok": False, "error": "book not found: missing-book"},
        )

    def test_link_thought_creates_connection_between_existing_entities(self):
        result = reading_mcp_server.link_thought(
            self.user_id,
            source_type="book",
            source_id="book-1",
            target_type="quote",
            target_id="quote-1",
            kind="异曲同工",
            thought="  都在讨论文明尺度  ",
            tags=["文明"],
        )

        self.assertTrue(result["ok"])
        created = result["created"]
        self.assertEqual(created["sourceType"], "book")
        self.assertEqual(created["sourceId"], "book-1")
        self.assertEqual(created["targetType"], "quote")
        self.assertEqual(created["targetId"], "quote-1")
        self.assertEqual(created["kind"], "异曲同工")
        self.assertEqual(created["thought"], "都在讨论文明尺度")
        self.assertEqual(created["tags"], ["文明"])

        state = self._load_state()
        self.assertEqual(state["connections"][0]["id"], created["id"])

    def test_link_thought_rejects_invalid_kind_type_and_missing_entity(self):
        self.assertIn(
            "invalid kind",
            reading_mcp_server.link_thought(
                self.user_id, "book", "book-1", "quote", "quote-1", "相似", "说明"
            )["error"],
        )
        self.assertEqual(
            reading_mcp_server.link_thought(
                self.user_id, "chapter", "book-1", "quote", "quote-1", "引用", "说明"
            ),
            {"ok": False, "error": "source_type and target_type must be 'book' or 'quote'"},
        )
        self.assertEqual(
            reading_mcp_server.link_thought(
                self.user_id, "book", "missing-book", "quote", "quote-1", "引用", "说明"
            ),
            {"ok": False, "error": "source book not found: missing-book"},
        )
        self.assertEqual(self._load_state(), self.initial_state)

    def test_missing_user_state_returns_error_shape(self):
        result = reading_mcp_server.add_note("missing-user", "内容", "book-1")

        self.assertFalse(result["ok"])
        self.assertIn("user_state not found for user_id=missing-user", result["error"])


if __name__ == "__main__":
    unittest.main()
