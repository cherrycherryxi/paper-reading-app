"""Contract tests for the Codex Sunday/Monday local automations."""
import os
import plistlib
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CODEX_DIR = ROOT / "scripts" / "codex"
LAUNCHD_DIR = CODEX_DIR / "launchd"


class CodexWeeklyAutomationTests(unittest.TestCase):
    def test_scripts_use_codex_without_legacy_claude_model_calls(self):
        for name in ("weekly-report.sh", "product-owner-monday.sh"):
            source = (CODEX_DIR / name).read_text()
            self.assertIn("codex", source.lower())
            self.assertNotIn("claude -p", source.lower())
            self.assertNotIn("$CLAUDE", source)

    def test_weekly_model_is_read_only_and_shell_owns_idempotency(self):
        source = (CODEX_DIR / "weekly-report.sh").read_text()
        self.assertIn("--sandbox read-only", source)
        self.assertIn("<<<REPORT_START>>>", source)
        self.assertIn(".signals-$WEEK", source)
        self.assertIn(".emailed-$WEEK", source)
        self.assertIn('grep -Fqx "$METRICS_ROW"', source)
        self.assertIn("worktree add", source)

    def test_product_owner_is_isolated_and_path_guarded(self):
        source = (CODEX_DIR / "product-owner-monday.sh").read_text()
        self.assertIn("worktree add --quiet --detach", source)
        self.assertIn("--sandbox workspace-write", source)
        self.assertIn("发现越权变更", source)
        self.assertIn("optimization/roadmap.md|optimization/backlog.md", source)
        self.assertIn("push origin HEAD:feature/agent", source)
        self.assertNotIn("push origin main", source)
        self.assertNotIn("deploy-prod", source)

    def test_launchd_schedules_and_commands(self):
        cases = {
            "com.huangnanqi.paper-codex-weekly-report.plist": (0, 18, "weekly-report.sh"),
            "com.huangnanqi.paper-codex-product-owner.plist": (1, 9, "product-owner-monday.sh"),
        }
        for filename, (weekday, hour, script) in cases.items():
            with (LAUNCHD_DIR / filename).open("rb") as handle:
                data = plistlib.load(handle)
            interval = data["StartCalendarInterval"]
            self.assertEqual(interval["Weekday"], weekday)
            self.assertEqual(interval["Hour"], hour)
            self.assertEqual(interval["Minute"], 0)
            self.assertTrue(data["Label"].startswith("com.huangnanqi.paper-codex-"))
            self.assertTrue(data["ProgramArguments"][1].endswith(script))

    def test_weekly_dry_run_generates_report_without_email_or_git(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            logs = root / "daily"
            reports = root / "reports"
            logs.mkdir()
            (logs / f"{date.today().isoformat()}.md").write_text("# 日报\n" + "完成真实产品工作。" * 20)

            fake_codex = root / "codex"
            report_body = "# 周报 2099-W01\n\n## 本周进展\n" + "已完成可靠迁移。" * 40
            fake_codex.write_text(
                "#!/bin/bash\nprintf '%s\\n' '<<<REPORT_START>>>'\n"
                f"printf '%s\\n' '{report_body}'\n"
                "printf '%s\\n' '<<<REPORT_END>>>'\n"
            )
            fake_codex.chmod(0o755)

            fake_metrics = root / "metrics.py"
            fake_metrics.write_text(
                "import sys\n"
                "print('| 2099-01-07 | 北极星 | 📊 测试 |' if '--row' in sys.argv else '使用天数 1')\n"
            )

            env = os.environ.copy()
            env.update({
                "PAPER_WEEKLY_DRY_RUN": "1",
                "PAPER_WEEKLY_CODEX": str(fake_codex),
                "PAPER_WEEKLY_REPO": str(ROOT),
                "PAPER_WEEKLY_LOGDIR": str(logs),
                "PAPER_WEEKLY_REPORTDIR": str(reports),
                "PAPER_WEEKLY_LOG": str(root / "weekly.log"),
                "PAPER_WEEKLY_METRICS": str(fake_metrics),
                "PAPER_WEEKLY_WEEK": "2099-W01",
                "PAPER_WEEKLY_TODAY": "2099-01-07",
                "PAPER_WEEKLY_LOCK_DIR": str(root / "weekly.lock"),
            })
            result = subprocess.run(
                ["bash", str(CODEX_DIR / "weekly-report.sh")],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
                timeout=20,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = reports / "2099-W01.md"
            self.assertTrue(report.exists())
            self.assertIn("可靠迁移", report.read_text())
            self.assertIn("北极星三数", report.read_text())
            self.assertFalse((reports / ".emailed-2099-W01").exists())


if __name__ == "__main__":
    unittest.main()
