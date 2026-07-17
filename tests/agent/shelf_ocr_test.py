"""OPT-118 书架 OCR：解析器与提示词的真实行为测试。

用例来自 2026-07-17 用 owner 真实书架照片跑 kimi-k2.5 的实测发现：
模型会把副标题拆成独立一本、会给编造的书高置信度、会用 Markdown 围栏包 JSON。
"""
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server


class ParseShelfOcrExtractionTests(unittest.TestCase):
    def test_parses_plain_json_array(self):
        books = app_server.parse_shelf_ocr_extraction(
            '[{"title":"一九八四","author":"[英] 乔治·奥威尔","confidence":0.95}]'
        )
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]["title"], "一九八四")
        self.assertEqual(books[0]["author"], "[英] 乔治·奥威尔")
        self.assertEqual(books[0]["confidence"], 0.95)

    def test_strips_markdown_fence(self):
        """kimi 实测会用 ```json 围栏包住数组。"""
        raw = '```json\n[{"title":"厌女","author":"[日] 上野千鹤子","confidence":0.85}]\n```'
        books = app_server.parse_shelf_ocr_extraction(raw)
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]["title"], "厌女")

    def test_salvages_array_from_surrounding_prose(self):
        raw = '好的，我识别到以下书籍：\n[{"title":"蛙","author":"莫言","confidence":0.9}]\n希望有帮助。'
        books = app_server.parse_shelf_ocr_extraction(raw)
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]["title"], "蛙")

    def test_drops_entries_without_title(self):
        books = app_server.parse_shelf_ocr_extraction(
            '[{"title":"","author":"某人","confidence":0.9},'
            ' {"title":"   ","confidence":0.8},'
            ' {"title":"谈美","author":"朱光潜","confidence":0.9}]'
        )
        self.assertEqual([b["title"] for b in books], ["谈美"])

    def test_missing_author_and_confidence_get_safe_defaults(self):
        books = app_server.parse_shelf_ocr_extraction('[{"title":"金色梦乡"}]')
        self.assertEqual(books[0]["author"], "")
        self.assertEqual(books[0]["confidence"], 0.0)

    def test_confidence_is_clamped_and_non_numeric_tolerated(self):
        books = app_server.parse_shelf_ocr_extraction(
            '[{"title":"A","confidence":5},{"title":"B","confidence":-2},{"title":"C","confidence":"高"}]'
        )
        self.assertEqual([b["confidence"] for b in books], [1.0, 0.0, 0.0])

    def test_malformed_payload_returns_empty_list_not_raise(self):
        for raw in ("", "对不起，我无法识别这张图片。", "{}", '{"title":"不是数组"}', "null", "[[]]"):
            with self.subTest(raw=raw):
                self.assertEqual(app_server.parse_shelf_ocr_extraction(raw), [])

    def test_non_dict_entries_are_skipped(self):
        books = app_server.parse_shelf_ocr_extraction('["一九八四", null, {"title":"蛙","confidence":0.9}]')
        self.assertEqual([b["title"] for b in books], ["蛙"])


class ShelfOcrPromptTests(unittest.TestCase):
    def test_prompt_forbids_splitting_subtitles(self):
        """实测缺陷：《重走：在公路…》《厌女：日本的女性嫌恶》被拆成两本。"""
        prompt = app_server.SHELF_OCR_PROMPT
        self.assertIn("副标题", prompt)
        self.assertIn("重走", prompt, "应带上实测中招的具体例子，模型对具体例子更敏感")
        self.assertIn("厌女", prompt)

    def test_prompt_forbids_inventing_titles(self):
        """实测缺陷：横放看不清的书被编造成另一本书，还给了 0.70 置信度。"""
        prompt = app_server.SHELF_OCR_PROMPT
        self.assertIn("严禁", prompt)
        self.assertIn("编造", prompt)

    def test_prompt_asks_for_confidence_and_array_output(self):
        prompt = app_server.SHELF_OCR_PROMPT
        self.assertIn("confidence", prompt)
        self.assertIn("JSON 数组", prompt)


if __name__ == "__main__":
    unittest.main()
