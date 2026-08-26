"""Regression contracts for the Codex morning review and candidate-card flow."""
import subprocess
import plistlib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MORNING = ROOT / "scripts" / "codex" / "paper-morning.sh"


class CodexMorningAutomationTests(unittest.TestCase):
    def test_launchd_runs_every_day_at_seven(self):
        plist_path = ROOT / "scripts" / "codex" / "launchd" / "com.huangnanqi.paper-codex-morning.plist"
        with plist_path.open("rb") as handle:
            schedule = plistlib.load(handle)["StartCalendarInterval"]
        self.assertEqual(schedule, {"Hour": 7, "Minute": 0})

    def test_script_parses_and_uses_codex(self):
        result = subprocess.run(["bash", "-n", str(MORNING)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        source = MORNING.read_text()
        self.assertIn('"$CODEX" exec', source)
        self.assertNotIn("$CLAUDE", source)

    def test_merged_prs_are_reconciled_before_candidate_generation(self):
        source = MORNING.read_text()
        review_index = source.index("选题状态对账")
        cards_index = source.index("候选前的硬性对账")
        self.assertLess(review_index, cards_index)
        self.assertIn("optimization/triage.md", source[review_index:cards_index])
        self.assertIn("optimization/backlog.md", source[review_index:cards_index])
        self.assertIn("chore(triage): reconcile morning merges ${TODAY}", source)

    def test_candidate_prompt_excludes_completed_and_in_progress_items(self):
        source = MORNING.read_text()
        prompt = source[source.index("候选前的硬性对账"):source.index("额外要求")]
        self.assertIn("optimization/roadmap.md", prompt)
        self.assertIn("product-owner-latest.md", prompt)
        self.assertIn("weekly-reports", prompt)
        self.assertIn("不是完成状态的证据", prompt)
        self.assertIn(r"\`new\` 或 \`triaged\`", prompt)
        self.assertIn(r"\`done\`、\`in-progress\`、已有 open PR、已合并 PR", prompt)
        self.assertIn("当前代码已经实现", prompt)

    def test_email_copy_matches_the_actual_candidate_count(self):
        source = MORNING.read_text()
        self.assertIn("CARD_COUNT=$(grep -Ec '^## 卡片(①|②)$'", source)
        self.assertIn('CARD_LABEL="今日 1 张候选选题卡"', source)
        self.assertIn('REPLY_HINT="1"', source)
        self.assertIn('CARD_LABEL="今日 2 张候选选题卡"', source)
        self.assertIn('REPLY_HINT="1 / 2 / both"', source)
        self.assertIn("【${CARD_LABEL}】", source)
        self.assertIn("回复 ${REPLY_HINT}", source)
        card_branch = source[source.index('if [ "$CARD_COUNT" -ge 1 ]; then', source.index('BODY=')):source.index("fi", source.index('if [ "$CARD_COUNT" -ge 1 ]; then', source.index('BODY=')))]
        self.assertIn("sed '1,5d' \"$PICK\"", card_branch)

    def test_blank_card_output_never_enters_waiting_or_requests_a_reply(self):
        source = MORNING.read_text()
        self.assertIn("GENERATED_CARD_COUNT=$(grep -Ec '^## 卡片(①|②)$'", source)
        self.assertIn("STATUS: NO_CANDIDATES", source)
        self.assertIn("今日无合格候选，不进入 WAITING", source)
        self.assertIn('CARD_LABEL="今日无候选选题卡"', source)
        self.assertIn("本日无需回复", source)
        self.assertIn('MAIL_SUBJECT="今日选题 · ${TODAY} · paper-reading-app｜今日无候选"', source)


if __name__ == "__main__":
    unittest.main()
