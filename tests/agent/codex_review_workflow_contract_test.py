"""Regression contracts for handing Codex review findings back to Codex."""
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "codex-address-review.yml"


class CodexReviewWorkflowContractTests(unittest.TestCase):
    def setUp(self):
        self.source = WORKFLOW.read_text()

    def test_only_current_same_repo_feature_reviews_trigger(self):
        self.assertIn("pull_request_review:", self.source)
        self.assertIn("types: [submitted]", self.source)
        self.assertIn("chatgpt-codex-connector[bot]", self.source)
        self.assertIn("base.ref == 'feature/agent'", self.source)
        self.assertIn("head.repo.full_name == github.repository", self.source)
        self.assertIn("review.commit_id == github.event.pull_request.head.sha", self.source)

    def test_cloud_review_followup_is_explicitly_paused(self):
        job = self.source.split("  request-fix:", 1)[1]
        self.assertIn("${{ false &&", job.split("runs-on:", 1)[0])

    def test_only_actionable_review_comments_are_handed_back(self):
        self.assertIn("listCommentsForReview", self.source)
        self.assertIn("img\\.shields\\.io\\/badge\\/P[0-3]-", self.source)
        self.assertIn("@codex address that feedback", self.source)

    def test_requests_are_deduplicated_and_bounded(self):
        self.assertIn("codex-address-review:", self.source)
        self.assertIn("priorAttempts >= 2", self.source)
        self.assertIn("NEED-HUMAN", self.source)
        self.assertIn("cancel-in-progress: false", self.source)

    def test_owner_connected_token_is_required_without_bot_fallback(self):
        self.assertIn("CODEX_TRIGGER_TOKEN is required", self.source)
        self.assertIn("github-token: ${{ secrets.CODEX_TRIGGER_TOKEN }}", self.source)
        self.assertNotIn("secrets.CODEX_TRIGGER_TOKEN || github.token", self.source)
        self.assertIn("issues: write", self.source)
        self.assertIn("pull-requests: write", self.source)


if __name__ == "__main__":
    unittest.main()
