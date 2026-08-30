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

    def test_weekly_script_rejects_implicit_non_sunday_runs(self):
        source = (CODEX_DIR / "weekly-report.sh").read_text()
        self.assertIn('date +%w', source)
        self.assertIn('PAPER_WEEKLY_WEEK:-', source)
        self.assertIn('非周日运行被拒绝', source)

    def test_weekly_reissue_derives_the_requested_iso_week_sunday(self):
        source = (CODEX_DIR / "weekly-report.sh").read_text()
        self.assertIn("datetime.date.fromisocalendar", source)
        self.assertIn("补发日期必须是", source)
        self.assertIn('TODAY="$WEEK_END"', source)

    def test_weekly_production_release_runs_both_project_test_suites(self):
        source = (CODEX_DIR / "weekly-prod-release.sh").read_text()
        self.assertIn('"$TEST_PYTHON" -m pytest tests/ -v', source)
        self.assertIn("node --test tests/frontend/*.test.js", source)
        self.assertLess(source.index("node --test tests/frontend/*.test.js"), source.index("deploy-prod.sh --yes"))

    def test_weekly_production_release_uses_a_clean_isolated_clone(self):
        source = (CODEX_DIR / "weekly-prod-release.sh").read_text()
        self.assertIn("git clone --quiet --branch feature/agent --single-branch --no-local", source)
        self.assertIn('RELEASE_REPO="$TMP_ROOT/repo"', source)
        self.assertIn('TEST_PYTHON="${PAPER_RELEASE_PYTHON:-$REPO/.venv/bin/python}"', source)
        self.assertIn('cd "$RELEASE_REPO"', source)
        self.assertIn("PAPER_RELEASE_DRY_RUN", source)
        self.assertNotIn('cd "$REPO"\n[ "$(date +%w)"', source)

    def test_weekly_production_release_retests_when_remote_moves(self):
        source = (CODEX_DIR / "weekly-prod-release.sh").read_text()
        self.assertIn('MAX_ATTEMPTS="${PAPER_RELEASE_MAX_ATTEMPTS:-3}"', source)
        self.assertIn('LATEST_TARGET=$(git rev-parse origin/feature/agent)', source)
        self.assertIn('if [ "$LATEST_TARGET" != "$TESTED_TARGET" ]', source)
        self.assertIn("测试期间 feature/agent 已从", source)
        self.assertIn('ATTEMPT=$((ATTEMPT + 1))', source)
        self.assertLess(source.index('node --test tests/frontend/*.test.js'), source.index('if [ "$LATEST_TARGET" != "$TESTED_TARGET" ]'))

    def test_weekly_production_release_distinguishes_push_race_from_real_failure(self):
        source = (CODEX_DIR / "weekly-prod-release.sh").read_text()
        self.assertIn('if bash scripts/codex/deploy-prod.sh --yes', source)
        self.assertIn('DEPLOY_HEAD=$(git rev-parse HEAD)', source)
        self.assertIn('if [ "$LATEST_TARGET" != "$DEPLOY_HEAD" ]', source)
        self.assertIn('fail "deploy-prod.sh 执行失败，且远端没有并发推进。"', source)
        self.assertIn('fail "feature/agent 连续变化，已达到 $MAX_ATTEMPTS 次发布上限。"', source)

    def test_production_deploy_retries_health_checks_after_restart(self):
        source = (CODEX_DIR / "deploy-prod.sh").read_text()
        self.assertIn('HEALTH_ATTEMPTS="${PAPER_RELEASE_HEALTH_ATTEMPTS:-15}"', source)
        self.assertIn("check_http()", source)
        self.assertIn("while [ \"$attempt\" -le \"$HEALTH_ATTEMPTS\" ]", source)
        self.assertIn("check_http local_prod_http http://127.0.0.1:8790/", source)
        self.assertIn("check_http public_http https://read.readjot.com/", source)
        self.assertNotIn("sleep 2", source)

    def test_weekly_production_release_emails_each_terminal_outcome(self):
        source = (CODEX_DIR / "weekly-prod-release.sh").read_text()
        self.assertIn('EMAIL_SCRIPT="${PAPER_RELEASE_EMAIL:-', source)
        self.assertIn("✅ Prod 自动发布成功", source)
        self.assertIn("ℹ️ Prod 本周无需发布", source)
        self.assertIn("❌ Prod 自动发布失败", source)
        self.assertIn('[ "$DRY_RUN" = 1 ] && return 0', source)
        self.assertIn('NOTIFICATION_SENT=1', source)
        self.assertLess(source.index("deploy-prod.sh --yes"), source.index("✅ Prod 自动发布成功"))
        self.assertIn('RELEASE_NOTES="docs/releases/', source)
        self.assertIn('RELEASE_CONTENT=$(cat "$RELEASE_NOTES")', source)
        self.assertIn("以下为本次完整 release note", source)
        self.assertNotIn("RELEASE_SUMMARY=$(awk", source)
        self.assertIn("SUCCESS_BODY=$(printf", source)

    def test_codex_autofix_checks_the_secret_at_step_scope(self):
        source = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        job = source.split("  codex-autofix:", 1)[1]
        self.assertNotIn("secrets.OPENAI_API_KEY != ''", job.split("steps:", 1)[0])
        self.assertIn("if: env.OPENAI_API_KEY != ''", job)
        self.assertIn("openai-api-key: ${{ env.OPENAI_API_KEY }}", job)

    def test_codex_autofix_job_is_explicitly_paused(self):
        source = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        job = source.split("  codex-autofix:", 1)[1]
        self.assertIn("${{ false &&", job.split("runs-on:", 1)[0])

    def test_product_owner_is_isolated_and_path_guarded(self):
        source = (CODEX_DIR / "product-owner-monday.sh").read_text()
        self.assertIn("worktree add --quiet --detach", source)
        self.assertIn("--sandbox workspace-write", source)
        self.assertIn("发现越权变更", source)
        self.assertIn("optimization/roadmap.md|optimization/backlog.md", source)
        self.assertIn("push origin HEAD:feature/agent", source)
        self.assertNotIn("push origin main", source)
        self.assertNotIn("deploy-prod", source)

    def test_product_owner_summary_requires_a_complete_decision_record(self):
        source = (CODEX_DIR / "product-owner-monday.sh").read_text()
        for heading in ("【上周结算】", "【本周唯一焦点】", "【为什么现在】", "【本周三件事】", "【明确不做】"):
            self.assertIn(heading, source)
        self.assertIn("SUMMARY_SIZE", source)
        self.assertIn("wc -m", source)
        self.assertIn('SUMMARY_SIZE" -le 600', source)
        self.assertIn("禁止只罗列 OPT/PR 编号", source)
        self.assertIn("需人工确认", source)
        self.assertIn("模型原始摘要", source)

    def test_launchd_schedules_and_commands(self):
        cases = {
            "com.huangnanqi.paper-codex-weekly-report.plist": (0, 18, "weekly-report.sh"),
            "com.huangnanqi.paper-codex-product-owner.plist": (1, 8, "product-owner-monday.sh"),
            "com.huangnanqi.paper-codex-weekly-prod-release.plist": (0, 17, "weekly-prod-release.sh"),
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
            (logs / "2099-01-04.md").write_text("# 日报\n" + "完成真实产品工作。" * 20)

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
