"""Contract tests for the Codex triage/implement/explore nightly pipeline."""
import os
import plistlib
import re
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CODEX_DIR = ROOT / "scripts" / "codex"
LAUNCHD_DIR = CODEX_DIR / "launchd"


class CodexNightlyAutomationTests(unittest.TestCase):
    scripts = {
        "triage": CODEX_DIR / "nightly-triage.sh",
        "implement": CODEX_DIR / "nightly-implement.sh",
        "explore": CODEX_DIR / "nightly-explore.sh",
    }

    def test_scripts_parse_and_do_not_invoke_claude(self):
        for path in self.scripts.values():
            result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            source = path.read_text()
            self.assertIn("codex", source.lower())
            self.assertNotIn("claude -p", source.lower())
            self.assertNotIn("$CLAUDE", source)
            self.assertIn("worktree add --quiet --detach", source)
            self.assertNotIn("push origin main", source)
            self.assertNotIn("deploy-prod", source)

    def test_shell_variables_are_braced_before_non_ascii_text(self):
        for path in self.scripts.values():
            source = path.read_text()
            matches = list(re.finditer(r"\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]", source))
            self.assertEqual(matches, [], f"unbraced shell variable before non-ASCII text in {path}")

    def test_dependency_markers_and_idempotency(self):
        triage = self.scripts["triage"].read_text()
        implement = self.scripts["implement"].read_text()
        explore = self.scripts["explore"].read_text()
        self.assertIn("triage-$TODAY.done", triage)
        self.assertIn("triage-$TODAY.done", implement)
        self.assertIn("implement-$TODAY.done", implement)
        self.assertIn("implement-$TODAY.done", explore)
        self.assertIn("explore-$TODAY.done", explore)

    def test_model_permissions_and_path_guards(self):
        triage = self.scripts["triage"].read_text()
        implement = self.scripts["implement"].read_text()
        explore = self.scripts["explore"].read_text()
        self.assertIn("--sandbox workspace-write", triage)
        self.assertIn("optimization/triage.md|optimization/backlog.md|.wolf/*", triage)
        self.assertIn("AUTO_COUNT", triage)
        self.assertIn("from datetime import datetime", triage)
        self.assertIn("不要再调用 gh", triage)
        self.assertIn("for attempt in 1 2 3", triage)
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", implement)
        self.assertIn("--base feature/agent", implement)
        self.assertIn("--draft", implement)
        self.assertIn('gh pr view "$BRANCH"', implement)
        self.assertNotIn("gh pr merge", implement)
        self.assertIn("--sandbox workspace-write", explore)
        self.assertIn("optimization/explore.md|optimization/backlog.md|.wolf/*", explore)

    def test_launchd_schedules(self):
        cases = {
            "com.huangnanqi.paper-codex-nightly-triage.plist": [1],
            "com.huangnanqi.paper-codex-nightly-implement.plist": [4],
            "com.huangnanqi.paper-codex-nightly-explore.plist": [5, 7],
        }
        for filename, expected_hours in cases.items():
            with (LAUNCHD_DIR / filename).open("rb") as handle:
                data = plistlib.load(handle)
            intervals = data["StartCalendarInterval"]
            if isinstance(intervals, dict):
                intervals = [intervals]
            self.assertEqual([item["Hour"] for item in intervals], expected_hours)
            self.assertTrue(data["Label"].startswith("com.huangnanqi.paper-codex-nightly-"))

    def test_implement_skip_dry_run_has_no_completion_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "repo"
            repo.mkdir()
            (repo / "README.md").write_text("nightly fixture\n")
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "config", "user.email", "nightly@example.test"], check=True)
            subprocess.run(["git", "-C", str(repo), "config", "user.name", "Nightly Test"], check=True)
            subprocess.run(["git", "-C", str(repo), "add", "README.md"], check=True)
            subprocess.run(["git", "-C", str(repo), "commit", "-qm", "fixture"], check=True)
            fake_codex = root / "codex"
            fake_codex.write_text(
                "#!/bin/bash\n"
                "printf '%s\\n' '<<<NIGHTLY_STATUS>>>' SKIP '<<<NIGHTLY_STATUS_END>>>'\n"
            )
            fake_codex.chmod(0o755)
            env = os.environ.copy()
            env.update({
                "PAPER_NIGHTLY_DRY_RUN": "1",
                "PAPER_NIGHTLY_SKIP_FETCH": "1",
                "PAPER_NIGHTLY_SKIP_DEPENDENCY": "1",
                "PAPER_NIGHTLY_BASE_REF": "HEAD",
                "PAPER_NIGHTLY_CODEX": str(fake_codex),
                "PAPER_NIGHTLY_REPO": str(repo),
                "PAPER_NIGHTLY_STATE_DIR": str(root / "state"),
                "PAPER_NIGHTLY_IMPLEMENT_LOG": str(root / "implement.log"),
                "PAPER_NIGHTLY_TODAY": "2099-01-01",
            })
            result = subprocess.run(
                ["bash", str(self.scripts["implement"])],
                cwd=ROOT,
                env=env,
                text=True,
                errors="replace",
                capture_output=True,
                timeout=20,
                check=False,
            )
            log_text = (root / "implement.log").read_text(errors="replace")
            self.assertEqual(result.returncode, 0, result.stderr + "\n" + log_text)
            self.assertFalse((root / "state" / "implement-2099-01-01.done").exists())

    def test_triage_dry_run_parses_prefetched_pr_evidence_without_side_effects(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "repo"
            (repo / "optimization").mkdir(parents=True)
            (repo / "optimization" / "triage.md").write_text("Last triaged: old\n")
            (repo / "optimization" / "backlog.md").write_text("# Backlog\n")
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "config", "user.email", "nightly@example.test"], check=True)
            subprocess.run(["git", "-C", str(repo), "config", "user.name", "Nightly Test"], check=True)
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), "commit", "-qm", "fixture"], check=True)

            fake_gh = root / "gh"
            fake_gh.write_text(
                "#!/bin/bash\n"
                "printf '%s\\n' '[{\"number\":9,\"title\":\"fixture\",\"state\":\"OPEN\","
                "\"isDraft\":false,\"createdAt\":\"2099-01-01T00:00:00Z\",\"mergedAt\":null,"
                "\"headRefName\":\"auto/fixture\"}]'\n"
            )
            fake_gh.chmod(0o755)
            fake_codex = root / "codex"
            fake_codex.write_text(
                "#!/bin/bash\n"
                "while [ $# -gt 0 ]; do if [ \"$1\" = -C ]; then wt=\"$2\"; shift 2; else shift; fi; done\n"
                "printf '%s\\n' 'Last triaged: 2099-01-01' >> \"$wt/optimization/triage.md\"\n"
                "printf '%s\\n' '<<<SUMMARY_START>>>' 'Triage fixture summary' '<<<SUMMARY_END>>>'\n"
            )
            fake_codex.chmod(0o755)
            env = os.environ.copy()
            env.update({
                "PATH": f"{root}:{env['PATH']}",
                "PAPER_NIGHTLY_DRY_RUN": "1",
                "PAPER_NIGHTLY_SKIP_FETCH": "1",
                "PAPER_NIGHTLY_BASE_REF": "HEAD",
                "PAPER_NIGHTLY_CODEX": str(fake_codex),
                "PAPER_NIGHTLY_REPO": str(repo),
                "PAPER_NIGHTLY_STATE_DIR": str(root / "state"),
                "PAPER_NIGHTLY_TRIAGE_LOG": str(root / "triage.log"),
                "PAPER_NIGHTLY_TODAY": "2099-01-01",
            })
            result = subprocess.run(
                ["bash", str(self.scripts["triage"])], cwd=ROOT, env=env,
                text=True, errors="replace", capture_output=True, timeout=20, check=False,
            )
            log_text = (root / "triage.log").read_text(errors="replace")
            self.assertEqual(result.returncode, 0, result.stderr + "\n" + log_text)
            self.assertIn("dry-run 通过", log_text)
            self.assertFalse((root / "state" / "triage-2099-01-01.done").exists())


if __name__ == "__main__":
    unittest.main()
