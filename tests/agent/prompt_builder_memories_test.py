import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import app_server


class PromptBuilderMemoriesTests(unittest.TestCase):
    def setUp(self):
        app_server.initialize_tool_schema_provider_for_tests()

    def test_opt148_injects_global_and_current_book_confirmed_memories(self):
        state = app_server.sanitize_state({"books": [{"id": "b1", "title": "书"}], "memories": [
            {"id": "g", "content": "我偏好具体段落", "sourceContext": {"type": "global"}},
            {"id": "b", "content": "这本书要关注叙事", "sourceContext": {"type": "book", "bookId": "b1"}},
            {"id": "other", "content": "不应召回", "sourceContext": {"type": "book", "bookId": "b2"}},
        ]})
        prompt = app_server.PromptBuilder().build_chat_prompt(state, "b1", [])
        self.assertIn("我偏好具体段落", prompt)
        self.assertIn("这本书要关注叙事", prompt)
        self.assertNotIn("不应召回", prompt)

    def test_opt152_prefers_specific_and_recent_memories_within_eight_item_budget(self):
        memories = [
            {
                "id": f"global-{index}", "content": f"全局记忆 {index}",
                "sourceContext": {"type": "global"},
                "updatedAt": f"2026-08-{index:02d}T00:00:00Z",
            }
            for index in range(1, 10)
        ]
        memories.extend([
            {
                "id": "book", "content": "书级记忆", "sourceContext": {"type": "book", "bookId": "b1"},
                "updatedAt": "2026-01-01T00:00:00Z",
            },
            {
                "id": "quote", "content": "摘抄级记忆", "sourceContext": {"type": "quote", "bookId": "b1", "quoteId": "q1"},
                "updatedAt": "2025-01-01T00:00:00Z",
            },
        ])
        state = app_server.sanitize_state({"books": [{"id": "b1", "title": "书"}], "memories": memories})
        prompt = app_server.PromptBuilder().build_chat_prompt(state, "b1", [], "q1")
        payload = json.loads(prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0])
        recalled = payload["confirmed_memories"]

        self.assertEqual(len(recalled), 8)
        self.assertEqual([item["content"] for item in recalled[:2]], ["摘抄级记忆", "书级记忆"])
        self.assertEqual([item["content"] for item in recalled[2:]], [f"全局记忆 {index}" for index in range(9, 3, -1)])
        self.assertNotIn("全局记忆 1", [item["content"] for item in recalled])
