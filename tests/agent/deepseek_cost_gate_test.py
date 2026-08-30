import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DeepseekCostGateContractTests(unittest.TestCase):
    def test_nightly_implement_skips_before_model(self):
        source = (ROOT / "scripts/codex/nightly-implement.sh").read_text()
        gate = source.index("TRIAGE_DATE=")
        model = source.index('run_codex_implement "$PROMPT"')
        self.assertLess(gate, model)
        self.assertIn("正常跳过，未调用模型", source)
        self.assertIn("无可指派", source)

    def test_morning_skips_empty_pr_list_before_model(self):
        source = (ROOT / "scripts/codex/paper-morning.sh").read_text()
        preflight = source.index("OPEN_PR_JSON=")
        review_model = source.index('AGENT_COMPAT_MODEL_TIER=pro "$CODEX" exec')
        self.assertLess(preflight, review_model)
        self.assertIn('[ "$OPEN_PR_JSON" = "[]" ]', source)
        self.assertIn("Phase1 空 PR，确定性跳过模型", source)

    def test_morning_candidate_generation_uses_flash(self):
        source = (ROOT / "scripts/codex/paper-morning.sh").read_text()
        self.assertIn('AGENT_COMPAT_MODEL_TIER=flash "$CODEX" exec', source)

    def test_implement_poll_defers_pro_during_weekday_peak(self):
        source = (ROOT / "scripts/codex/paper-implement-poll.sh").read_text()
        gate = source.index("WEEKDAY=$(date +%u)")
        reader = source.index('CHOICE=$(/usr/bin/python3 "$READER"')
        model = source.index('"$CODEX" exec')
        self.assertLess(gate, reader)
        self.assertLess(gate, model)
        self.assertIn('[ "$HOUR" -ge 9 ] && [ "$HOUR" -lt 12 ]', source)
        self.assertIn('[ "$HOUR" -ge 14 ] && [ "$HOUR" -lt 18 ]', source)
        self.assertIn("保持 WAITING", source)

    def test_planning_prompts_forbid_full_history_reads(self):
        for relative in (
            "scripts/codex/nightly-triage.sh",
            "scripts/codex/nightly-explore.sh",
        ):
            source = (ROOT / relative).read_text()
            self.assertIn("禁止完整读取", source, relative)


if __name__ == "__main__":
    unittest.main()
