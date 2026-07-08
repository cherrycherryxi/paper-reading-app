"""OPT-078 后端覆盖：sanitize_state 持久化自定义摘抄标签 customQuoteTags。

自定义摘抄标签此前只存浏览器 localStorage，换设备/清缓存即丢，也不进导出包。
现在纳入 server-side state：sanitize_state 必须保留该字段，并做去重/去空白/限量清洗。
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import app_server  # noqa: E402


class CustomQuoteTagsSanitizeTests(unittest.TestCase):
    def test_preserves_custom_quote_tags(self):
        out = app_server.sanitize_state({"customQuoteTags": ["金句", "转折", "隐喻"]})
        self.assertEqual(out["customQuoteTags"], ["金句", "转折", "隐喻"])

    def test_missing_field_defaults_to_empty_list(self):
        out = app_server.sanitize_state({})
        self.assertEqual(out["customQuoteTags"], [])
        # 字段必须存在（导出/前端都依赖它一直在）
        self.assertIn("customQuoteTags", out)

    def test_non_list_becomes_empty_list(self):
        for bad in ("金句", 123, {"a": 1}, None):
            out = app_server.sanitize_state({"customQuoteTags": bad})
            self.assertEqual(out["customQuoteTags"], [], f"{bad!r} 应清成 []")

    def test_dedupes_and_strips_and_drops_non_strings(self):
        out = app_server.sanitize_state(
            {"customQuoteTags": ["  金句  ", "金句", "", "   ", 42, None, "隐喻", "隐喻"]}
        )
        # strip 后去重、丢空白/非字符串，保留首次出现顺序
        self.assertEqual(out["customQuoteTags"], ["金句", "隐喻"])

    def test_caps_at_200(self):
        out = app_server.sanitize_state(
            {"customQuoteTags": [f"tag{i}" for i in range(500)]}
        )
        self.assertEqual(len(out["customQuoteTags"]), 200)
        self.assertEqual(out["customQuoteTags"][0], "tag0")

    def test_does_not_disturb_other_fields(self):
        # 新字段不能影响既有 schema 键
        out = app_server.sanitize_state({"customQuoteTags": ["x"]})
        for k in ("books", "sessions", "quotes", "chatHistories", "chatContexts", "connections"):
            self.assertIn(k, out)


if __name__ == "__main__":
    unittest.main()
