"""示例内容（新用户 onboarding）后端逻辑测试。

build_sample_state() 供注册时种入；每条带 isSample=True，前端据此显示「一键清除」
横幅。sanitize_state 对数组条目整体透传，必须保留 isSample。
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import app_server  # noqa: E402


class SampleStateTests(unittest.TestCase):
    def test_build_sample_state_flags_all_items(self):
        s = app_server.build_sample_state()
        for k in ("books", "quotes", "connections", "sessions"):
            self.assertTrue(s[k], f"{k} 应有示例条目")
            for it in s[k]:
                self.assertTrue(it.get("isSample"), f"{k} 条目必须标 isSample=True")

    def test_sample_connection_points_to_existing_quotes(self):
        s = app_server.build_sample_state()
        qids = {q["id"] for q in s["quotes"]}
        for c in s["connections"]:
            self.assertIn(c["sourceId"], qids, "关联来源须指向存在的示例摘抄")
            self.assertIn(c["targetId"], qids, "关联目标须指向存在的示例摘抄")

    def test_sample_quotes_reference_existing_books(self):
        s = app_server.build_sample_state()
        bids = {b["id"] for b in s["books"]}
        for q in s["quotes"]:
            self.assertIn(q["bookId"], bids, "示例摘抄须挂在示例书上")

    def test_sanitize_state_preserves_isSample(self):
        # sanitize_state 不深度清洗数组条目 → isSample 必须存活，否则清除机制失效。
        out = app_server.sanitize_state(app_server.build_sample_state())
        self.assertTrue(out["books"][0].get("isSample"))
        self.assertTrue(out["quotes"][0].get("isSample"))
        self.assertTrue(out["connections"][0].get("isSample"))
        self.assertTrue(out["sessions"][0].get("isSample"))


if __name__ == "__main__":
    unittest.main()
