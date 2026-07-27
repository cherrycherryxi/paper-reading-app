"""
Regression tests for OPT-135 + OPT-137:

OPT-135: build_chat_prompt() — existing_connections must be filtered to the
         current book/quote context instead of always returning [] when book_id is set.

OPT-137: build_system_instruction() — system instructions must explain the
         existing_connections field so the AI knows how to use it.
"""
import json
import tempfile
import unittest
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server


def _make_state(connections=None):
    now = app_server.utc_now_iso()
    return {
        "books": [
            {"id": "book-1", "title": "一", "author": "甲", "updatedAt": now},
            {"id": "book-2", "title": "二", "author": "乙", "updatedAt": now},
        ],
        "quotes": [
            {"id": "quote-1", "bookId": "book-1", "content": "摘抄甲", "kind": "quote",
             "page": 1, "tags": [], "createdAt": now},
            {"id": "quote-2", "bookId": "book-2", "content": "摘抄乙", "kind": "quote",
             "page": 2, "tags": [], "createdAt": now},
        ],
        "connections": connections or [],
        "sessions": [],
        "chatHistories": {},
        "chatContexts": {},
    }


class ExistingConnectionsFilterTest(unittest.TestCase):
    """OPT-135: existing_connections must be context-filtered, not always []."""

    def setUp(self):
        app_server.initialize_tool_schema_provider_for_tests()
        self.builder = app_server.PromptBuilder()
        self.connections = [
            {"id": "c1", "sourceType": "book", "sourceId": "book-1",
             "targetType": "book", "targetId": "book-2",
             "kind": "对比", "thought": "甲乙对比"},
            {"id": "c2", "sourceType": "quote", "sourceId": "quote-1",
             "targetType": "book", "targetId": "book-2",
             "kind": "延伸", "thought": "摘抄延伸"},
            {"id": "c3", "sourceType": "book", "sourceId": "book-2",
             "targetType": "book", "targetId": "book-1",
             "kind": "引用", "thought": "乙引甲"},
            {"id": "c4", "sourceType": "quote", "sourceId": "quote-2",
             "targetType": "quote", "targetId": "quote-2",
             "kind": "异曲同工", "thought": "与 book-1 无关"},
        ]

    def _parse_connections(self, prompt):
        """Extract existing_connections list from the prompt's user_data JSON."""
        start = prompt.index("<user_data>") + len("<user_data>")
        end = prompt.index("</user_data>")
        return json.loads(prompt[start:end].strip())["existing_connections"]

    # ── global context ────────────────────────────────────────────────────────

    def test_global_context_returns_all_connections(self):
        """No book_id → show all connections (up to 20)."""
        state = _make_state(self.connections)
        prompt = self.builder.build_chat_prompt(state, book_id="", chat_history=[])
        conns = self._parse_connections(prompt)
        # All 4 connections must be visible in global context
        ids = {c["id"] for c in conns}
        self.assertIn("c1", ids)
        self.assertIn("c2", ids)
        self.assertIn("c3", ids)
        self.assertIn("c4", ids)

    # ── book context ──────────────────────────────────────────────────────────

    def test_book_context_shows_connections_involving_book(self):
        """book_id set, no quote → only connections touching that book."""
        state = _make_state(self.connections)
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        conns = self._parse_connections(prompt)
        ids = {c["id"] for c in conns}
        # c1 (sourceId=book-1), c2 (targetId=book-2 but no book-1 side) → c2 NOT here
        # c3 (targetId=book-1) → yes
        self.assertIn("c1", ids, "c1 has sourceId=book-1, must be included")
        self.assertIn("c3", ids, "c3 has targetId=book-1, must be included")
        self.assertNotIn("c4", ids, "c4 has no book-1 side, must be excluded")

    def test_book_context_was_previously_returning_empty(self):
        """The old bug: in book context existing_connections was always []. Regression lock."""
        state = _make_state(self.connections)
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        conns = self._parse_connections(prompt)
        self.assertGreater(len(conns), 0, "existing_connections must not be empty in book context when connections exist")

    def test_book_context_excludes_unrelated_connections(self):
        """Connections unrelated to the current book must not be sent (saves tokens + prevents confusion)."""
        state = _make_state(self.connections)
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        conns = self._parse_connections(prompt)
        ids = {c["id"] for c in conns}
        # c2 has sourceId=quote-1 (book-1) and targetId=book-2 → should appear because quote-1 belongs to book-1
        # Actually: c2.sourceId = quote-1, not book-1; c2.targetId = book-2, not book-1
        # So c2 should NOT be included in book-1 context (only direct id match)
        self.assertNotIn("c4", ids)

    # ── quote context ─────────────────────────────────────────────────────────

    def test_quote_context_shows_connections_involving_quote_or_book(self):
        """quote_id set → connections where sourceId or targetId is quote-1 OR book-1."""
        state = _make_state(self.connections)
        prompt = self.builder.build_chat_prompt(
            state, book_id="book-1", chat_history=[], quote_id="quote-1"
        )
        conns = self._parse_connections(prompt)
        ids = {c["id"] for c in conns}
        # c1: sourceId=book-1 → yes
        # c2: sourceId=quote-1 → yes
        # c3: targetId=book-1 → yes
        # c4: no quote-1 or book-1 side → no
        self.assertIn("c1", ids)
        self.assertIn("c2", ids)
        self.assertIn("c3", ids)
        self.assertNotIn("c4", ids)

    # ── no connections ────────────────────────────────────────────────────────

    def test_book_context_with_no_connections_returns_empty(self):
        """When there are no connections at all, existing_connections must be []."""
        state = _make_state([])
        prompt = self.builder.build_chat_prompt(state, book_id="book-1", chat_history=[])
        conns = self._parse_connections(prompt)
        self.assertEqual(conns, [])


class SystemInstructionConnectionsDescriptionTest(unittest.TestCase):
    """OPT-137: system instruction must describe existing_connections field."""

    def setUp(self):
        app_server.initialize_tool_schema_provider_for_tests()

    def _instruction(self, book_id="", has_focused_quote=False):
        return app_server.PromptBuilder.build_system_instruction(book_id, has_focused_quote)

    def test_global_context_instruction_mentions_existing_connections(self):
        inst = self._instruction(book_id="")
        self.assertIn("existing_connections", inst)

    def test_book_context_instruction_mentions_existing_connections(self):
        inst = self._instruction(book_id="book-1")
        self.assertIn("existing_connections", inst)

    def test_quote_context_instruction_mentions_existing_connections(self):
        inst = self._instruction(book_id="book-1", has_focused_quote=True)
        self.assertIn("existing_connections", inst)

    def test_instruction_explains_dedup_guard(self):
        """The instruction must tell the AI to avoid duplicate connections."""
        inst = self._instruction(book_id="book-1")
        # Key dedup guidance: check existing list before suggesting new link
        self.assertTrue(
            "重复" in inst or "已存在" in inst,
            "System instruction must mention duplicate-avoidance for existing_connections"
        )


if __name__ == "__main__":
    unittest.main()
