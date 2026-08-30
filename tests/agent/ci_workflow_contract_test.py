"""Regression contracts for the CI and Codex auto-remediation wiring."""
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CI = ROOT / ".github" / "workflows" / "ci.yml"
PROMPT = ROOT / ".github" / "codex" / "prompts" / "ci-autofix.md"
PRE_PUSH = ROOT / ".githooks" / "pre-push"


class CiWorkflowContractTests(unittest.TestCase):
    def test_public_scan_uses_runner_standard_grep_not_ripgrep(self):
        source = CI.read_text()
        self.assertIn("grep -R -n -E", source)
        self.assertIn("log_server\\\\.py", source)
        self.assertNotIn("rg --hidden", source)

    def test_failed_feature_push_uses_codex_not_claude_issue_handoff(self):
        source = CI.read_text()
        self.assertIn("openai/codex-action@v1", source)
        self.assertIn("secrets.OPENAI_API_KEY", source)
        self.assertIn("github.ref == 'refs/heads/feature/agent'", source)
        self.assertNotIn("@claude", source)
        self.assertNotIn("gh issue create", source)

    def test_codex_prompt_requires_a_pr_and_forbids_direct_shared_branch_pushes(self):
        source = PROMPT.read_text()
        self.assertIn("绝不直接推送 `feature/agent` 或 `main`", source)
        self.assertIn("目标为 `feature/agent` 的 PR", source)
        self.assertIn(".venv/bin/python -m pytest tests/agent/ -q", source)
        self.assertIn("node --test tests/frontend/*.test.js", source)

    def test_pre_push_clears_inherited_git_repository_environment_before_tests(self):
        source = PRE_PUSH.read_text()
        self.assertIn("git rev-parse --local-env-vars", source)
        self.assertIn('unset "$git_var"', source)
        self.assertLess(source.index("git rev-parse --local-env-vars"), source.index("node --test"))


if __name__ == "__main__":
    unittest.main()
