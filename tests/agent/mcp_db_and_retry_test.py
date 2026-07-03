"""两个 prod bug 的回归锁:

1) MCP DB 路由:reading_mcp_server 的库/端口必须可用环境变量覆盖,否则 prod 的
   agent 动作会派发到默认 8788 的 dev-库 MCP → 「user_state not found」/写错库。
2) 重试:FAILED 动作必须可重新审批(FAILED→APPROVED),否则前端点「重试」重发
   /approve 被状态机拒,永远只能忽略。
"""
import os
import re
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, ROOT)


class McpDbConfigTest(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(ROOT, "reading_mcp_server.py"), encoding="utf-8") as f:
            self.src = f.read()

    def test_db_path_env_overridable(self):
        self.assertRegex(self.src, r"os\.getenv\(\s*[\"']READING_MCP_DB[\"']",
                         "reading_mcp_server 的 DB_PATH 必须可用 READING_MCP_DB 覆盖")

    def test_port_env_overridable(self):
        self.assertRegex(self.src, r"os\.getenv\(\s*[\"']MCP_PORT[\"']",
                         "MCP 端口必须可用 MCP_PORT 覆盖(prod 需独立端口)")

    def test_db_path_actually_reflects_env(self):
        import importlib
        os.environ["READING_MCP_DB"] = "/tmp/__probe_reading.db"
        try:
            mod = importlib.reload(importlib.import_module("reading_mcp_server"))
            self.assertEqual(str(mod.DB_PATH), "/tmp/__probe_reading.db")
        finally:
            del os.environ["READING_MCP_DB"]
            importlib.reload(importlib.import_module("reading_mcp_server"))


class FailedRetryTransitionTest(unittest.TestCase):
    def test_failed_can_be_reapproved_for_retry(self):
        with open(os.path.join(ROOT, "app_server.py"), encoding="utf-8") as f:
            src = f.read()
        # allowed 转换表里 FAILED 必须允许 → APPROVED
        block = re.search(r"ACTION_STATUS_FAILED:\s*\{([^}]*)\}", src)
        self.assertIsNotNone(block, "状态机应显式列出 FAILED 的允许转换")
        self.assertIn("ACTION_STATUS_APPROVED", block.group(1),
                      "FAILED 必须允许重新审批(重试)")
        # EXECUTED / REJECTED 仍须为终态(空集)
        self.assertRegex(src, r"ACTION_STATUS_EXECUTED:\s*set\(\)")
        self.assertRegex(src, r"ACTION_STATUS_REJECTED:\s*set\(\)")


if __name__ == "__main__":
    unittest.main()
