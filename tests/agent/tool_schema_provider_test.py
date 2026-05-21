import unittest

from tool_schema_provider import ToolSchema, ToolSchemaProvider


def build_mock_schemas():
    return [
        ToolSchema(
            name="add_note",
            action_type="add_note",
            description="新增一条摘抄或读书笔记。\n\nArgs:\n    user_id: 用户 ID\n    content: 笔记正文\n    book_id: 书籍 ID",
            required_fields={"content": str},
            optional_fields={"bookId": str, "tags": list},
            enum_constraints={},
            raw_input_schema={},
        ),
        ToolSchema(
            name="add_book",
            action_type="add_book",
            description="把一本书加入用户的书单。",
            required_fields={"title": str},
            optional_fields={"author": str, "reason": str},
            enum_constraints={},
            raw_input_schema={},
        ),
        ToolSchema(
            name="summary",
            action_type="summary",
            description="为某本书追加一段阶段性总结。",
            required_fields={"content": str, "bookId": str},
            optional_fields={},
            enum_constraints={},
            raw_input_schema={},
        ),
        ToolSchema(
            name="question",
            action_type="question",
            description="记录一个最值得深入探究的开放问题。",
            required_fields={"content": str},
            optional_fields={"bookId": str},
            enum_constraints={},
            raw_input_schema={},
        ),
        ToolSchema(
            name="tag",
            action_type="tag",
            description="给一本书追加标签。",
            required_fields={"tags": list, "bookId": str},
            optional_fields={},
            enum_constraints={},
            raw_input_schema={},
        ),
        ToolSchema(
            name="link_thought",
            action_type="link_thought",
            description="在两个已存在的 book/quote 之间建立一条跨实体关联。",
            required_fields={
                "sourceType": str,
                "sourceId": str,
                "targetType": str,
                "targetId": str,
                "kind": str,
                "thought": str,
            },
            optional_fields={"tags": list},
            enum_constraints={
                "sourceType": ["book", "quote"],
                "targetType": ["book", "quote"],
                "kind": ["异曲同工", "引用", "对比", "影响", "延伸"],
            },
            raw_input_schema={},
        ),
    ]


class ToolSchemaProviderTests(unittest.TestCase):
    def setUp(self):
        self.provider = ToolSchemaProvider.initialize_for_testing(build_mock_schemas())

    def tearDown(self):
        ToolSchemaProvider._instance = None

    def test_for_prompt_includes_all_action_types_and_hides_infra_params(self):
        prompt = self.provider.for_prompt()

        for action_type in ["add_note", "add_book", "summary", "question", "tag", "link_thought"]:
            self.assertIn(f'action.type = "{action_type}"', prompt)
        self.assertIn("content (str, 必填)", prompt)
        self.assertIn("bookId (str, 可选)", prompt)
        self.assertIn("tags (list, 可选)", prompt)
        self.assertIn("kind (str, 必填，取值之一：['异曲同工', '引用', '对比', '影响', '延伸'])", prompt)
        self.assertNotIn("user_id:", prompt)

    def test_action_types_preserve_schema_order(self):
        self.assertEqual(
            self.provider.action_types(),
            ["add_note", "add_book", "summary", "question", "tag", "link_thought"],
        )

    def test_validate_action_data_accepts_valid_payloads(self):
        cases = [
            ("add_note", {"content": "笔记", "bookId": "book-1", "tags": ["思想"]}),
            ("add_book", {"title": "三体", "author": "刘慈欣", "reason": "补读"}),
            ("summary", {"content": "总结", "bookId": "book-1"}),
            ("question", {"content": "文明为何猜疑？", "bookId": "book-1"}),
            ("tag", {"tags": ["科幻"], "bookId": "book-1"}),
            (
                "link_thought",
                {
                    "sourceType": "book",
                    "sourceId": "book-1",
                    "targetType": "quote",
                    "targetId": "quote-1",
                    "kind": "引用",
                    "thought": "互相呼应",
                    "tags": ["文明"],
                },
            ),
        ]

        for action_type, data in cases:
            with self.subTest(action_type=action_type):
                self.assertEqual(self.provider.validate_action_data(action_type, data), [])

    def test_validate_action_data_rejects_unknown_missing_type_extra_and_enum_errors(self):
        self.assertEqual(
            self.provider.validate_action_data("shell_exec", {}),
            ["unknown action type: shell_exec"],
        )
        self.assertEqual(
            self.provider.validate_action_data("add_note", {"bookId": "book-1"}),
            ["add_note.content is required and must be str"],
        )
        self.assertEqual(
            self.provider.validate_action_data("tag", {"tags": "科幻", "bookId": "book-1"}),
            ["tag.tags is required and must be list", "tag.tags must be list"],
        )
        self.assertEqual(
            self.provider.validate_action_data("add_book", {"title": "三体", "unexpected": True}),
            ["add_book.unexpected is not allowed"],
        )
        self.assertEqual(
            self.provider.validate_action_data(
                "link_thought",
                {
                    "sourceType": "chapter",
                    "sourceId": "book-1",
                    "targetType": "quote",
                    "targetId": "quote-1",
                    "kind": "相似",
                    "thought": "说明",
                },
            ),
            [
                "link_thought.sourceType must be one of ['book', 'quote'], got: chapter",
                "link_thought.kind must be one of ['异曲同工', '引用', '对比', '影响', '延伸'], got: 相似",
            ],
        )

    def test_get_requires_initialization(self):
        ToolSchemaProvider._instance = None

        with self.assertRaisesRegex(RuntimeError, "ToolSchemaProvider not initialized"):
            ToolSchemaProvider.get()


if __name__ == "__main__":
    unittest.main()
