import json
import time
import sys
import tempfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import log_server


GOLDEN_SET_PATH = ROOT / "data" / "golden_set.json"
EFFICIENCY_BASELINE_PATH = ROOT / "data" / "golden_set_baseline.json"


class GoldenSetEvaluator:
    def __init__(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        log_server.DB_PATH = base_dir / "test.db"
        log_server.UPLOAD_DIR = base_dir / "uploads"
        log_server.init_db()
        self._seed_user()
        self.original_call_deepseek = log_server.call_deepseek

    def close(self):
        log_server.call_deepseek = self.original_call_deepseek
        self.temp_dir.cleanup()

    def _seed_user(self):
        conn = log_server.get_conn()
        now = log_server.now_iso()
        seeded_state = {
            "books": [
                {
                    "id": "book-1",
                    "title": "Test Book",
                    "author": "Author",
                    "tags": ["seed"],
                    "notes": "initial notes",
                    "currentPage": 12,
                    "totalPages": 200,
                }
            ],
            "sessions": [],
            "quotes": [],
            "chatHistories": {},
        }
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            ("user-test", "tester", "salt$digest", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            ("token-test", "user-test", now, now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
            ("user-test", json.dumps(seeded_state, ensure_ascii=False), now),
        )
        conn.commit()
        conn.close()

    def request_json(self, method, path, payload=None, token="token-test"):
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        handler = log_server.Handler.__new__(log_server.Handler)
        handler.path = path
        handler.command = method
        handler.headers = headers
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status_code = None
        handler.send_response = lambda code: setattr(handler, "_status_code", code)
        handler.send_header = lambda *args, **kwargs: None
        handler.end_headers = lambda: None

        if method == "POST":
            handler.do_POST()
        elif method == "GET":
            handler.do_GET()
        else:
            raise ValueError(f"Unsupported method: {method}")

        payload = json.loads(handler.wfile.getvalue().decode("utf-8"))
        return handler._status_code, payload

    def run_case(self, case):
        if "mockModelError" in case:
            def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
                raise RuntimeError(case["mockModelError"])
        else:
            model_output = case["mockModelOutput"]

            def fake_deepseek(messages, model="deepseek-chat", max_tokens=1200):
                if isinstance(model_output, str):
                    return model_output
                return json.dumps(model_output, ensure_ascii=False)

        log_server.call_deepseek = fake_deepseek
        started_at = time.perf_counter()
        status, payload = self.request_json(
            "POST",
            "/api/chat",
            {"message": case["message"], "bookId": case["bookId"]},
        )
        latency_ms = round((time.perf_counter() - started_at) * 1000, 4)
        expected = case["expected"]
        input_tokens = log_server.estimate_tokens(case["message"])
        output_tokens = log_server.estimate_tokens(payload.get("reply", ""))
        context_size_chars = len(case["message"]) + len(case.get("bookId", ""))
        checks = {
            "httpStatus": status,
            "agentStatus": payload.get("agentStatus"),
            "parseStatus": payload.get("parseStatus"),
            "validationStatus": payload.get("validationStatus"),
            "actionCount": len(payload.get("actions", [])),
            "actionTypes": [action.get("type") for action in payload.get("actions", []) if isinstance(action, dict)],
            "reply": payload.get("reply", ""),
            "latencyMs": latency_ms,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "contextSizeChars": context_size_chars,
        }
        scoring = self.score_case(case, checks)
        failures = [
            {"field": key, "expected": value, "actual": checks.get(key)}
            for key, value in expected.items()
            if checks.get(key) != value
        ]
        return {
            "id": case["id"],
            "scenarioType": case["scenarioType"],
            "groundTruth": case.get("groundTruth", {}),
            "passed": not failures,
            "failures": failures,
            "actual": checks,
            "scores": scoring,
        }

    def score_case(self, case, checks):
        ground_truth = case.get("groundTruth", {})
        expected_outcome = ground_truth.get("expectedOutcome")
        expected_action_types = ground_truth.get("expectedActionTypes", [])
        expected_action_count = ground_truth.get("expectedActionCount", 0)
        expected_robustness = ground_truth.get("expectedRobustness", "pass")

        reply = (checks.get("reply") or "").strip()
        action_types = checks.get("actionTypes", [])
        reply_present = 1.0 if reply else 0.0
        outcome_match = 1.0 if checks.get("agentStatus") == expected_outcome else 0.0
        action_type_match = 1.0 if action_types == expected_action_types else 0.0
        action_count_match = 1.0 if checks.get("actionCount") == expected_action_count else 0.0

        outcome_score = round((outcome_match * 0.5) + (action_type_match * 0.3) + (reply_present * 0.2), 4)
        trajectory_score = round((action_type_match * 0.5) + (action_count_match * 0.4) + (1.0 * 0.1), 4)

        actual_robustness = self.derive_robustness(checks)
        robustness_pass = actual_robustness == expected_robustness

        return {
            "outcome": outcome_score,
            "trajectory": trajectory_score,
            "robustness": {
                "expected": expected_robustness,
                "actual": actual_robustness,
                "passed": robustness_pass,
            },
            "efficiency": self.score_efficiency(checks),
        }

    @staticmethod
    def derive_robustness(checks):
        if checks.get("agentStatus") == "ERROR":
            return "fail"
        if checks.get("parseStatus") == "DEGRADED":
            return "fail"
        if checks.get("validationStatus") == "FAILED":
            return "fail"
        return "pass"

    @staticmethod
    def score_efficiency(checks):
        input_tokens = checks.get("inputTokens", 0)
        output_tokens = checks.get("outputTokens", 0)
        latency_ms = checks.get("latencyMs", 0.0)
        context_size_chars = checks.get("contextSizeChars", 0)

        token_score = max(0.0, 1.0 - ((input_tokens + output_tokens) / 4000))
        latency_score = max(0.0, 1.0 - (latency_ms / 5000))
        context_score = max(0.0, 1.0 - (context_size_chars / 4000))
        overall = round((token_score * 0.4) + (latency_score * 0.4) + (context_score * 0.2), 4)
        return {
            "overall": overall,
            "tokenUsage": round(input_tokens + output_tokens, 4),
            "latencyMs": round(latency_ms, 4),
            "contextSizeChars": context_size_chars,
        }


def summarize_scores(results):
    total = len(results)
    if total == 0:
        return {
            "outcome": 0.0,
            "trajectory": 0.0,
            "robustness_pass_rate": 0.0,
            "efficiency": {
                "overall": 0.0,
                "tokenUsage": 0.0,
                "latencyMs": 0.0,
                "contextSizeChars": 0.0,
            },
        }
    outcome_avg = round(sum(item["scores"]["outcome"] for item in results) / total, 4)
    trajectory_avg = round(sum(item["scores"]["trajectory"] for item in results) / total, 4)
    robustness_pass_rate = round(
        sum(1 for item in results if item["scores"]["robustness"]["passed"]) / total,
        4,
    )
    efficiency_overall = round(sum(item["scores"]["efficiency"]["overall"] for item in results) / total, 4)
    efficiency_tokens = round(sum(item["scores"]["efficiency"]["tokenUsage"] for item in results) / total, 4)
    efficiency_latency = round(sum(item["scores"]["efficiency"]["latencyMs"] for item in results) / total, 4)
    efficiency_context = round(sum(item["scores"]["efficiency"]["contextSizeChars"] for item in results) / total, 4)
    return {
        "outcome": outcome_avg,
        "trajectory": trajectory_avg,
        "robustness_pass_rate": robustness_pass_rate,
        "efficiency": {
            "overall": efficiency_overall,
            "tokenUsage": efficiency_tokens,
            "latencyMs": efficiency_latency,
            "contextSizeChars": efficiency_context,
        },
    }


def compare_with_baseline(current_summary, baseline_summary, drop_threshold=0.05, increase_threshold=0.10):
    regressions = []
    score_fields = ["outcome", "trajectory", "robustness_pass_rate"]
    for field in score_fields:
        current = current_summary.get(field, 0.0)
        baseline = baseline_summary.get(field, 0.0)
        if baseline > 0:
            drop = (baseline - current) / baseline
            if drop > drop_threshold:
                regressions.append(
                    {
                        "metric": field,
                        "baseline": baseline,
                        "current": current,
                        "changeRatio": round(-drop, 4),
                        "type": "score_drop",
                    }
                )

    current_eff = current_summary.get("efficiency", {})
    baseline_eff = baseline_summary.get("efficiency", {})
    for field in ["tokenUsage", "latencyMs", "contextSizeChars"]:
        current = current_eff.get(field, 0.0)
        baseline = baseline_eff.get(field, 0.0)
        if baseline > 0:
            increase = (current - baseline) / baseline
            if increase > increase_threshold:
                regressions.append(
                    {
                        "metric": f"efficiency.{field}",
                        "baseline": baseline,
                        "current": current,
                        "changeRatio": round(increase, 4),
                        "type": "efficiency_regression",
                    }
                )
    return {
        "hasRegression": bool(regressions),
        "regressions": regressions,
    }


def load_baseline_summary():
    if not EFFICIENCY_BASELINE_PATH.exists():
        return None
    payload = json.loads(EFFICIENCY_BASELINE_PATH.read_text(encoding="utf-8"))
    return payload.get("scoreSummary")


def main():
    cases = json.loads(GOLDEN_SET_PATH.read_text(encoding="utf-8"))
    evaluator = GoldenSetEvaluator()
    try:
        results = [evaluator.run_case(case) for case in cases]
    finally:
        evaluator.close()

    passed = sum(1 for item in results if item["passed"])
    summary = {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "scoreSummary": summarize_scores(results),
        "results": results,
    }
    baseline_summary = load_baseline_summary()
    if baseline_summary:
        summary["regressionReport"] = compare_with_baseline(summary["scoreSummary"], baseline_summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
