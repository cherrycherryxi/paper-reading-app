"""Regression tests for OPT-067 quote-scoped chat-history recovery."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server


class ChatHistoryContextTests(unittest.TestCase):
    def test_quote_history_key_without_context_stays_quote_scoped(self):
        state = app_server.sanitize_state({
            "quotes": [{"id": "q1", "bookId": "b1", "content": "摘抄"}],
            "chatHistories": {
                "quote:q1": [{"role": "user", "content": "继续聊"}],
            },
        })

        self.assertEqual(list(state["chatHistories"]), ["quote:q1"])
        self.assertEqual(
            state["chatContexts"]["quote:q1"],
            {"type": "quote", "bookId": "b1", "quoteId": "q1"},
        )

    def test_quote_id_only_context_does_not_collapse_to_global(self):
        state = app_server.sanitize_state({
            "chatHistories": {
                "quote:q-orphan": [{"role": "assistant", "content": "历史"}],
            },
            "chatContexts": {
                "quote:q-orphan": {"type": "quote", "quoteId": "q-orphan"},
            },
        })

        self.assertEqual(list(state["chatHistories"]), ["quote:q-orphan"])
        self.assertEqual(
            state["chatContexts"]["quote:q-orphan"],
            {"type": "quote", "quoteId": "q-orphan"},
        )


if __name__ == "__main__":
    unittest.main()
