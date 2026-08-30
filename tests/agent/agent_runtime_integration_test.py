"""Project contracts for the shared user-level agent runtime."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "scripts" / "agent"
RUNNER = AGENT_DIR / "agent-runner.sh"
COMPAT = AGENT_DIR / "codex-exec-compat.sh"


class AgentRuntimeIntegrationTests(unittest.TestCase):
    def test_project_adapters_are_thin_and_have_overrides(self):
        runner = RUNNER.read_text()
        compat = COMPAT.read_text()
        self.assertIn("/Users/huangnanqi/.local/bin/agent-runner", runner)
        self.assertIn("PAPER_AGENT_RUNNER_BIN", runner)
        self.assertIn("/Users/huangnanqi/.local/bin/codex-exec-compat", compat)
        self.assertIn("PAPER_CODEX_COMPAT_BIN", compat)
        self.assertNotIn("ANTHROPIC_BASE_URL", runner + compat)
        self.assertNotIn("deepseek-v4", runner + compat)

    def test_adapters_forward_arguments_without_interpreting_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            capture = root / "capture"
            fake = root / "fake"
            fake.write_text("#!/bin/bash\nprintf '<%s>' \"$@\" > \"$CAPTURE\"\n")
            fake.chmod(0o755)
            for adapter, variable in ((RUNNER, "PAPER_AGENT_RUNNER_BIN"), (COMPAT, "PAPER_CODEX_COMPAT_BIN")):
                env = os.environ.copy()
                env.update({variable: str(fake), "CAPTURE": str(capture)})
                result = subprocess.run(["bash", str(adapter), "one", "带 空格"], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(capture.read_text(), "<one><带 空格>")

    def test_missing_runtime_fails_closed(self):
        env = os.environ.copy()
        env["PAPER_AGENT_RUNNER_BIN"] = "/definitely/missing/agent-runner"
        result = subprocess.run(["bash", str(RUNNER), "--help"], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 127)
        self.assertIn("unavailable", result.stderr)


if __name__ == "__main__":
    unittest.main()
