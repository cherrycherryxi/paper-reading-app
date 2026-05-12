import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.agent_golden_set_eval import GoldenSetEvaluator, compare_with_baseline, summarize_scores


class AgentEvaluationFrameworkTests(unittest.TestCase):
    def setUp(self):
        self.evaluator = GoldenSetEvaluator()

    def tearDown(self):
        self.evaluator.close()

    def test_outcome_score_rewards_matching_outcome_action_and_reply(self):
        case = {
            "groundTruth": {
                "expectedOutcome": "OK",
                "expectedActionTypes": ["add_note"],
                "expectedActionCount": 1,
                "expectedRobustness": "pass",
            }
        }
        checks = {
            "agentStatus": "OK",
            "actionTypes": ["add_note"],
            "actionCount": 1,
            "reply": "有内容",
            "parseStatus": "SUCCESS",
            "validationStatus": "SUCCESS",
        }
        scores = self.evaluator.score_case(case, checks)
        self.assertEqual(scores["outcome"], 1.0)
        self.assertEqual(scores["trajectory"], 1.0)
        self.assertTrue(scores["robustness"]["passed"])

    def test_outcome_and_trajectory_scores_drop_when_action_type_mismatches(self):
        case = {
            "groundTruth": {
                "expectedOutcome": "OK",
                "expectedActionTypes": ["tag"],
                "expectedActionCount": 1,
                "expectedRobustness": "pass",
            }
        }
        checks = {
            "agentStatus": "OK",
            "actionTypes": ["question"],
            "actionCount": 1,
            "reply": "有内容",
            "parseStatus": "SUCCESS",
            "validationStatus": "SUCCESS",
        }
        scores = self.evaluator.score_case(case, checks)
        self.assertLess(scores["outcome"], 1.0)
        self.assertLess(scores["trajectory"], 1.0)
        self.assertTrue(scores["robustness"]["passed"])

    def test_robustness_fails_for_error_degraded_or_validation_failed(self):
        variants = [
            {"agentStatus": "ERROR", "parseStatus": "FAILED", "validationStatus": "FAILED"},
            {"agentStatus": "DEGRADED", "parseStatus": "DEGRADED", "validationStatus": "SUCCESS"},
            {"agentStatus": "DEGRADED", "parseStatus": "SUCCESS", "validationStatus": "FAILED"},
        ]
        case = {
            "groundTruth": {
                "expectedOutcome": "DEGRADED",
                "expectedActionTypes": [],
                "expectedActionCount": 0,
                "expectedRobustness": "fail",
            }
        }
        for variant in variants:
            checks = {
                **variant,
                "actionTypes": [],
                "actionCount": 0,
                "reply": "fallback",
            }
            scores = self.evaluator.score_case(case, checks)
            self.assertEqual(scores["robustness"]["actual"], "fail")
            self.assertTrue(scores["robustness"]["passed"])

    def test_score_summary_aggregates_all_dimensions(self):
        results = [
            {
                "scores": {
                    "outcome": 1.0,
                    "trajectory": 0.8,
                    "robustness": {"passed": True},
                    "efficiency": {"overall": 0.9, "tokenUsage": 10.0, "latencyMs": 1.0, "contextSizeChars": 20.0},
                }
            },
            {
                "scores": {
                    "outcome": 0.5,
                    "trajectory": 0.6,
                    "robustness": {"passed": False},
                    "efficiency": {"overall": 0.7, "tokenUsage": 14.0, "latencyMs": 2.0, "contextSizeChars": 30.0},
                }
            },
        ]
        summary = summarize_scores(results)
        self.assertEqual(summary["outcome"], 0.75)
        self.assertEqual(summary["trajectory"], 0.7)
        self.assertEqual(summary["robustness_pass_rate"], 0.5)
        self.assertEqual(summary["efficiency"]["overall"], 0.8)
        self.assertEqual(summary["efficiency"]["tokenUsage"], 12.0)
        self.assertEqual(summary["efficiency"]["latencyMs"], 1.5)
        self.assertEqual(summary["efficiency"]["contextSizeChars"], 25.0)

    def test_efficiency_score_contains_token_latency_and_context_metrics(self):
        case = {
            "groundTruth": {
                "expectedOutcome": "OK",
                "expectedActionTypes": [],
                "expectedActionCount": 0,
                "expectedRobustness": "pass",
            }
        }
        checks = {
            "agentStatus": "OK",
            "actionTypes": [],
            "actionCount": 0,
            "reply": "有内容",
            "parseStatus": "SUCCESS",
            "validationStatus": "SUCCESS",
            "inputTokens": 20,
            "outputTokens": 10,
            "latencyMs": 100.0,
            "contextSizeChars": 120,
        }
        scores = self.evaluator.score_case(case, checks)
        self.assertIn("efficiency", scores)
        self.assertGreater(scores["efficiency"]["overall"], 0.0)
        self.assertEqual(scores["efficiency"]["tokenUsage"], 30)
        self.assertEqual(scores["efficiency"]["latencyMs"], 100.0)
        self.assertEqual(scores["efficiency"]["contextSizeChars"], 120)

    def test_regression_detection_flags_score_drop_and_efficiency_regression(self):
        baseline = {
            "outcome": 1.0,
            "trajectory": 1.0,
            "robustness_pass_rate": 1.0,
            "efficiency": {
                "overall": 1.0,
                "tokenUsage": 100.0,
                "latencyMs": 100.0,
                "contextSizeChars": 200.0,
            },
        }
        current = {
            "outcome": 0.9,
            "trajectory": 0.96,
            "robustness_pass_rate": 0.94,
            "efficiency": {
                "overall": 0.8,
                "tokenUsage": 130.0,
                "latencyMs": 125.0,
                "contextSizeChars": 210.0,
            },
        }
        report = compare_with_baseline(current, baseline)
        self.assertTrue(report["hasRegression"])
        metrics = {item["metric"] for item in report["regressions"]}
        self.assertIn("outcome", metrics)
        self.assertIn("robustness_pass_rate", metrics)
        self.assertIn("efficiency.tokenUsage", metrics)
        self.assertIn("efficiency.latencyMs", metrics)


if __name__ == "__main__":
    unittest.main()
