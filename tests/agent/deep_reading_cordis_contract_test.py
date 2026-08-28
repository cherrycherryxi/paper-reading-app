import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORDIS = ROOT / "experiments" / "dsh-paper-reading" / "cordis.yml"
REQUIREMENTS = ROOT / "requirements-dsh.txt"


class DeepReadingCordisContractTests(unittest.TestCase):
    def test_sdk_upgrade_is_exactly_pinned(self):
        self.assertIn("deepseek-harness-sdk==0.1.1rc1", REQUIREMENTS.read_text(encoding="utf-8"))

    def test_gateway_tools_share_the_root_registry_and_are_strictly_ordered(self):
        source = CORDIS.read_text(encoding="utf-8")
        self.assertNotIn("@deepseek-ai/dsh-agent-spine-demo", source)
        self.assertIn("@deepseek-ai/dsh-tools", source)
        self.assertIn("mode: native", source)
        expected = (
            "get_reading_context",
            "search_quotes",
            "list_books",
            "get_connections",
            "get_confirmed_memories",
            "get_reading_timeline",
            "search_public_web",
        )
        for tool in expected:
            self.assertIn(f"mcp__paper-reading__{tool}", source)
        self.assertNotIn("mcp__paper-reading__get_book", source)
        self.assertNotIn("mcp__paper-reading__list_connections", source)

    def test_jsonrpc_entry_is_last_and_no_dangerous_provider_is_loaded(self):
        source = CORDIS.read_text(encoding="utf-8")
        self.assertGreater(source.rfind("@deepseek-ai/dsh-sdk-jsonrpc-server"), source.rfind("@deepseek-ai/dsh-mcp-client"))
        for forbidden in ("dsh-tool-bash", "dsh-fs-local", "dsh-terminal", "dsh-subprocess-local"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
