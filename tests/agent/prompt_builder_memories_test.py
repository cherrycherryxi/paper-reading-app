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

    def test_opt152_keeps_eight_most_recent_relevant_memories(self):
        memories = [
            {
                "id": f"memory-{index}",
                "content": f"记忆 {index}",
                "sourceContext": {"type": "global"},
                "createdAt": f"2026-08-{index:02d}T00:00:00Z",
                "updatedAt": f"2026-08-{index:02d}T00:00:00Z",
            }
            for index in range(1, 10)
        ]
        state = app_server.sanitize_state({"memories": memories})
        prompt = app_server.PromptBuilder().build_chat_prompt(state, "", [])
        payload = json.loads(prompt.split("<user_data>\n", 1)[1].split("\n</user_data>", 1)[0])

        self.assertEqual(
            [memory["content"] for memory in payload["confirmed_memories"]],
            [f"记忆 {index}" for index in range(9, 1, -1)],
        )
        self.assertNotIn("记忆 1", prompt)
