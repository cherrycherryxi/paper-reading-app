"""Contracts for the remote Codex Cloud Scheduled nightly pipeline."""
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / ".agents" / "skills" / "nightly-product-agents" / "SKILL.md"
OPENAI_YAML = SKILL.parent / "agents" / "openai.yaml"
SETUP = ROOT / "scripts" / "codex" / "cloud-setup.sh"
MIGRATION = ROOT / "docs" / "codex-cloud-scheduled-migration.md"


class CodexCloudScheduledTests(unittest.TestCase):
    def test_skill_metadata_is_discoverable_and_complete(self):
        source = SKILL.read_text()
        self.assertRegex(source, r"(?s)^---\nname: nightly-product-agents\ndescription: .+?\n---")
        self.assertNotIn("TODO", source)
        self.assertLess(len(source.splitlines()), 500)

        metadata = OPENAI_YAML.read_text()
        self.assertIn('display_name: "Nightly Product Agents"', metadata)
        self.assertIn("$nightly-product-agents", metadata)

    def test_skill_uses_github_as_durable_state_and_protects_production(self):
        source = SKILL.read_text()
        self.assertIn("latest `origin/feature/agent`", source)
        self.assertIn("Never push or merge `main`", source)
        self.assertIn("Never report success without a durable GitHub artifact", source)
        self.assertNotIn("triage-$TODAY.done", source)
        self.assertNotIn("implement-$TODAY.done", source)
        self.assertNotIn("/Users/huangnanqi", source)
        self.assertNotRegex(source, r"push\s+(?:origin\s+)?main")

    def test_all_phases_are_idempotent_and_explore_is_independent(self):
        source = SKILL.read_text()
        for phase in ("triage", "implement", "explore"):
            self.assertIn(f"## Phase: {phase}", source)
        self.assertIn("Last triaged: RUN_DATE", source)
        self.assertIn("Nightly-Agent: implement", source)
        self.assertIn("top-level section for `RUN_DATE`", source)
        self.assertIn("Run independently of the Implement result", source)

    def test_implementation_opens_but_never_merges_a_pr(self):
        source = SKILL.read_text()
        implement = source.split("## Phase: implement", 1)[1].split("## Phase: explore", 1)[0]
        self.assertIn("open a PR targeting `feature/agent`", implement)
        self.assertIn("Never merge it", implement)
        self.assertIn("`.venv/bin/python -m pytest tests/ -v`", implement)
        self.assertIn("`node --test tests/frontend/*.test.js`", implement)
        self.assertIn("exclude `.wolf/`", implement)

    def test_cloud_setup_is_parseable_and_uses_project_venv(self):
        result = subprocess.run(["bash", "-n", str(SETUP)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        source = SETUP.read_text()
        self.assertIn("python3 -m venv .venv", source)
        self.assertIn(".venv/bin/python -m pip install", source)
        self.assertNotRegex(source, re.compile(r"(API_KEY|TOKEN|PASSWORD)="))

    def test_migration_runbook_requires_cloud_before_cutover(self):
        source = MIGRATION.read_text()
        self.assertIn("Scheduled + Cloud", source)
        self.assertIn("先保持暂停", source)
        self.assertIn("手动运行一次", source)
        self.assertIn("连续两个夜晚", source)
        self.assertIn("com.huangnanqi.paper-codex-nightly-*", source)


if __name__ == "__main__":
    unittest.main()
