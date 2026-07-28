"""
Regression test for OPT-139:

build_chat_prompt() slices a book's quotes to 20 for the AI. The old code took
`[...][:20]` in raw array order, which — for a book with >20 quotes — surfaced the
*oldest* 20 and hid the most recent ones. Under heavy OCR annotation a single book
easily exceeds 20 quotes, so the AI reviewing/discussing a book saw stale context.

Fix: sort by createdAt descending before slicing, mirroring the all_books_summary
precedent, so the AI always sees the book's newest 20 quotes.
"""
import json
import unittest
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server


def _make_state(quote_count=25):
    """One book with `quote_count` quotes, createdAt ascending q00 (oldest) .. qNN (newest)."""
    now = app_server.utc_now_iso()
    quotes = []
    for i in range(quote_count):
        # createdAt strictly increasing so sort order is unambiguous
        quotes.append({
            "id": f"q{i:02d}",
            "bookId": "book-1",
            "content": f"摘抄 {i:02d}",
            "kind": "quote",
            "page": i + 1,
            "tags": [],
            "createdAt": f"2026-01-{i + 1:02d}T00:00:00.000Z",
        })
    return {
        "books": [{"id": "book-1", "title": "一", "author": "甲", "updatedAt": now}],
        "quotes": quotes,
        "connections": [],
        "sessions": [],
        "chatHistories": {},
        "chatContexts": {},
    }


class RecentQuotesSliceTest(unittest.TestCase):
    def setUp(self):
        app_server.initialize_tool_schema_provider_for_tests()
        self.builder = app_server.PromptBuilder()

    def _parse_quotes(self, prompt):
        start = prompt.index("<user_data>") + len("<user_data>")
        end = prompt.index("</user_data>")
        return json.loads(prompt[start:end].strip())["quotes"]

    def test_book_with_more_than_20_quotes_sends_newest_20(self):
        state = _make_state(quote_count=25)
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        quotes = self._parse_quotes(prompt)
        self.assertEqual(len(quotes), 20)
        ids = {q["id"] for q in quotes}
        # newest is q24; oldest is q00. The 20 kept must be q05..q24.
        self.assertIn("q24", ids, "newest quote must be present")
        self.assertIn("q05", ids, "the 20th-newest quote must be present")
        # The 5 oldest (q00..q04) must be dropped — this is the regression lock:
        # the old code kept these and dropped the newest 5 instead.
        for dropped in ("q00", "q01", "q02", "q03", "q04"):
            self.assertNotIn(dropped, ids, f"{dropped} is among the oldest 5 and must be excluded")

    def test_book_with_20_or_fewer_quotes_sends_all(self):
        state = _make_state(quote_count=8)
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        quotes = self._parse_quotes(prompt)
        self.assertEqual(len(quotes), 8)

    def test_quotes_are_ordered_newest_first(self):
        state = _make_state(quote_count=25)
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        quotes = self._parse_quotes(prompt)
        self.assertEqual(quotes[0]["id"], "q24", "first quote should be the newest")


if __name__ == "__main__":
    unittest.main()
