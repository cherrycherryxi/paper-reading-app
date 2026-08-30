"""Contracts for the formal paper-wrapup provider migration."""

import plistlib
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "codex" / "paper-wrapup.sh"
PLIST = ROOT / "scripts" / "codex" / "launchd" / "com.huangnanqi.paper-agent-wrapup.plist"


class PaperWrapupRunnerMigrationTests(unittest.TestCase):
    def test_script_uses_runner_read_only_without_model_bash(self):
        source = SCRIPT.read_text()
        self.assertIn("agent-runner.sh", source)
        self.assertIn('PROVIDER="${PAPER_WRAPUP_PROVIDER:-claude-deepseek}"', source)
        self.assertIn('--mode read-only', source)
        self.assertIn('--effort low', source)
        self.assertIn('--allowed-tools "Read,Glob,Grep"', source)
        self.assertNotIn('"$CODEX" exec', source)
        self.assertIn('recent_log=$(git -C "$REPO" log', source)
        self.assertIn("不要调用 Bash", source)
        self.assertIn("<<<REPORT_START>>>", source)

    def test_new_launchagent_is_distinct_and_uses_the_runtime_keychain(self):
        with PLIST.open("rb") as handle:
            data = plistlib.load(handle)
        self.assertEqual(data["Label"], "com.huangnanqi.paper-agent-wrapup")
        self.assertEqual(data["StartCalendarInterval"], {"Hour": 23, "Minute": 30})
        self.assertEqual(data["ProgramArguments"][0], "/bin/bash")
        self.assertTrue(data["ProgramArguments"][1].endswith("scripts/codex/paper-wrapup.sh"))
        serialized = PLIST.read_text()
        self.assertNotIn("sk-", serialized)
        self.assertNotIn(".zshrc", serialized)
        self.assertEqual(data["EnvironmentVariables"]["PAPER_WRAPUP_PROVIDER"], "claude-deepseek")

    def test_shell_and_plist_parse(self):
        shell = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(shell.returncode, 0, shell.stderr)
        plist = subprocess.run(["plutil", "-lint", str(PLIST)], capture_output=True, text=True)
        self.assertEqual(plist.returncode, 0, plist.stderr)


if __name__ == "__main__":
    unittest.main()
