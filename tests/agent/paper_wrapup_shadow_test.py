"""Safety and output-contract tests for the CCDS wrapup shadow job."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "agent" / "paper-wrapup-shadow.sh"


class PaperWrapupShadowTests(unittest.TestCase):
    def run_shadow(self, runner_source):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = root / "runner"
            runner.write_text(runner_source)
            runner.chmod(0o755)
            outdir = root / "shadow"
            canonical = root / "daily-logs"
            canonical.mkdir()
            env = os.environ.copy()
            env.update(
                {
                    "PAPER_WRAPUP_SHADOW_RUNNER": str(runner),
                    "PAPER_WRAPUP_SHADOW_REPO": str(ROOT),
                    "PAPER_WRAPUP_SHADOW_OUTDIR": str(outdir),
                    "PAPER_WRAPUP_SHADOW_LOG": str(root / "shadow.log"),
                    "PAPER_WRAPUP_SHADOW_DAY": "2099-02-03",
                    "PAPER_WRAPUP_SHADOW_TIMEOUT": "10",
                    "HOME": str(root),
                }
            )
            result = subprocess.run(
                ["bash", str(SCRIPT)], cwd=ROOT, env=env,
                capture_output=True, text=True, timeout=20, check=False,
            )
            files = {p.relative_to(root): p.read_text() for p in root.rglob("*") if p.is_file()}
            return result, files

    def test_shell_syntax_and_no_side_effect_commands(self):
        result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        source = SCRIPT.read_text()
        for forbidden in ("send-email.py", "bark-push.sh", "git push", "git commit", "launchctl"):
            self.assertNotIn(forbidden, source)
        self.assertIn("--mode read-only", source)
        self.assertIn("--effort low", source)
        self.assertIn("--max-budget-usd", source)

    def test_valid_report_is_written_only_to_shadow_directory(self):
        body = "# 日报 2099-02-03\n项目：paper-reading-app\n\n## 今日主要工作\n" + "真实工作。" * 50
        runner = "#!/bin/bash\nprintf '%s\\n' '<<<REPORT_START>>>'\nprintf '%s\\n' '" + body + "'\nprintf '%s\\n' '<<<REPORT_END>>>'\n"
        result, files = self.run_shadow(runner)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(Path("shadow/2099-02-03.md"), files)
        self.assertIn("真实工作", files[Path("shadow/2099-02-03.md")])
        self.assertIn("side_effects=shadow-only", files[Path("shadow/2099-02-03.meta")])
        self.assertNotIn(Path("daily-logs/2099-02-03.md"), files)

    def test_runner_failure_or_invalid_output_fails_closed(self):
        result, files = self.run_shadow("#!/bin/bash\nexit 9\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(Path("shadow/2099-02-03.md"), files)

        result, files = self.run_shadow("#!/bin/bash\nprintf 'unmarked output\\n'\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(Path("shadow/2099-02-03.md"), files)


if __name__ == "__main__":
    unittest.main()
