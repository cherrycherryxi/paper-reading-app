#!/bin/bash
# 每周日 18:00：计算北极星三数、生成周报并发邮件。
# 模型阶段只读；signals 提交、文件写入和邮件均由 shell 确定性执行。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

CODEX="${PAPER_WEEKLY_CODEX:-$(cd "$(dirname "$0")" && pwd)/../agent/codex-exec-compat.sh}"
export AGENT_COMPAT_MODEL_TIER="${PAPER_WEEKLY_MODEL_TIER:-flash}"
export AGENT_COMPAT_TASK="weekly-report"
REPO="${PAPER_WEEKLY_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
LOGDIR="${PAPER_WEEKLY_LOGDIR:-$HOME/.claude/daily-logs}"
REPORTDIR="${PAPER_WEEKLY_REPORTDIR:-$HOME/.claude/weekly-reports}"
LOG="${PAPER_WEEKLY_LOG:-$HOME/.claude/codex-weekly-report.log}"
EMAIL_SCRIPT="${PAPER_WEEKLY_EMAIL:-$HOME/.claude/scripts/send-email.py}"
METRICS_SCRIPT="${PAPER_WEEKLY_METRICS:-$HOME/.claude/scripts/northstar-metrics.py}"
BARK="${PAPER_WEEKLY_BARK:-$HOME/.claude/scripts/bark-push.sh}"
PYTHON="${PAPER_WEEKLY_PYTHON:-/usr/bin/python3}"
REQUESTED_WEEK="${PAPER_WEEKLY_WEEK:-}"
WEEK="${REQUESTED_WEEK:-$(date +%G-W%V)}"
DRY_RUN="${PAPER_WEEKLY_DRY_RUN:-0}"
LOCK_DIR="${PAPER_WEEKLY_LOCK_DIR:-$HOME/.claude/.codex-weekly-report.lock}"

# The report is a Sunday close-of-week artifact.  A migration/manual invocation
# on Monday must not consume that ISO week's report and email markers.  An
# explicit week is an operator recovery action; otherwise only dry-runs may run
# outside Sunday.
if [ "$DRY_RUN" != 1 ] && [ -z "${PAPER_WEEKLY_WEEK:-}" ] && [ "$(date +%w)" != 0 ]; then
  echo "[$(date)] 非周日运行被拒绝；请使用 PAPER_WEEKLY_DRY_RUN=1，或显式设置 PAPER_WEEKLY_WEEK 进行补发。" >> "$LOG"
  exit 0
fi

mkdir -p "$REPORTDIR" "$(dirname "$LOG")"
if [ -n "$REQUESTED_WEEK" ]; then
  WEEK_END=$("$PYTHON" -c '
import datetime
import re
import sys

match = re.fullmatch(r"(\d{4})-W(\d{2})", sys.argv[1])
if not match:
    raise SystemExit("周次必须为 YYYY-Www")
print(datetime.date.fromisocalendar(int(match.group(1)), int(match.group(2)), 7).isoformat())
' "$WEEK") || {
    echo "[$(date)] 无法解析补发周次：$WEEK" >> "$LOG"
    exit 2
  }
  if [ -n "${PAPER_WEEKLY_TODAY:-}" ] && [ "$PAPER_WEEKLY_TODAY" != "$WEEK_END" ]; then
    echo "[$(date)] 补发日期必须是 $WEEK 的周日 $WEEK_END，拒绝使用 $PAPER_WEEKLY_TODAY。" >> "$LOG"
    exit 2
  fi
  TODAY="$WEEK_END"
else
  TODAY="${PAPER_WEEKLY_TODAY:-$(date +%F)}"
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date)] $WEEK 已有周报任务运行，跳过。" >> "$LOG"
  exit 0
fi
cleanup() { rmdir "$LOCK_DIR" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "[$(date)] === Codex weekly report $WEEK (dry_run=$DRY_RUN) ===" >> "$LOG"
run_timeout() { perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$@"; }
alert() { [ "$DRY_RUN" = 1 ] || bash "$BARK" "$1" "$2" "paper-weekly" "timeSensitive" >> "$LOG" 2>&1 || true; }

METRICS_TXT=$("$PYTHON" "$METRICS_SCRIPT" 2>>"$LOG" || true)
METRICS_ROW=$("$PYTHON" "$METRICS_SCRIPT" --row 2>>"$LOG" || true)
SIGNALS_MARK="$REPORTDIR/.signals-$WEEK"

record_metrics() {
  [ -n "$METRICS_ROW" ] || { echo "[$(date)] 北极星三数计算失败。" >> "$LOG"; return 1; }
  if [ "$DRY_RUN" = 1 ]; then
    echo "[$(date)] dry-run：跳过 signals commit/push：$METRICS_ROW" >> "$LOG"
    return 0
  fi
  [ -f "$SIGNALS_MARK" ] && return 0

  git -C "$REPO" fetch origin feature/agent >> "$LOG" 2>&1 || return 1
  local parent wt
  parent=$(mktemp -d)
  wt="$parent/wt"
  if ! git -C "$REPO" worktree add --quiet --detach "$wt" origin/feature/agent >> "$LOG" 2>&1; then
    rmdir "$parent" 2>/dev/null || true
    return 1
  fi

  if grep -Fqx "$METRICS_ROW" "$wt/optimization/signals.md"; then
    echo "[$(date)] signals 已含本周北极星行，不重复提交。" >> "$LOG"
  else
    printf '%s\n' "$METRICS_ROW" >> "$wt/optimization/signals.md"
    git -C "$wt" add optimization/signals.md
    if ! git -C "$wt" commit -m "docs(signals): 北极星周记 $WEEK (Codex 自动)" >> "$LOG" 2>&1 \
      || ! git -C "$wt" push origin HEAD:feature/agent >> "$LOG" 2>&1; then
      git -C "$REPO" worktree remove --force "$wt" >> "$LOG" 2>&1 || true
      rmdir "$parent" 2>/dev/null || true
      return 1
    fi
  fi
  git -C "$REPO" worktree remove --force "$wt" >> "$LOG" 2>&1 || true
  rmdir "$parent" 2>/dev/null || true
  touch "$SIGNALS_MARK"
  return 0
}

if ! record_metrics; then
  echo "[$(date)] 北极星 signal 未能安全提交；周报仍继续，邮件中标记异常。" >> "$LOG"
  alert "⚠️ 周报指标提交失败" "$WEEK 北极星三数未写入 feature/agent，请查看 codex-weekly-report.log。"
fi

FILES=()
for i in 6 5 4 3 2 1 0; do
  day=$(date -j -f %F -v-${i}d "$TODAY" +%F 2>/dev/null || date -d "$TODAY -${i} day" +%F 2>/dev/null || true)
  [ -n "$day" ] && [ -f "$LOGDIR/$day.md" ] && FILES+=("$LOGDIR/$day.md")
done

REPORT_FILE="$REPORTDIR/$WEEK.md"
if [ ! -s "$REPORT_FILE" ]; then
  if [ "${#FILES[@]}" -gt 0 ]; then
    PROMPT="你是 paper-reading-app 的周报助手。只读以下最近七天日报并整合一份中文 Markdown 周报：
${FILES[*]}

结构必须是：# 周报 ${WEEK}；## 本周进展；## 本周亮点；## 待改进点；## 下周计划（3-5 条）。
基于文件事实，不臆造提交、PR 或结果。把完整周报放在各自单独成行的 <<<REPORT_START>>> 和 <<<REPORT_END>>> 之间。不要写文件，不要修改仓库，只在回复正文输出。"
    RAW=$(run_timeout 600 "$CODEX" exec -C "$REPO" --sandbox read-only --ephemeral "$PROMPT" 2>>"$LOG" || true)
    REPORT=$(printf '%s\n' "$RAW" | awk '/<<<REPORT_START>>>/{f=1;next} /<<<REPORT_END>>>/{f=0;next} f')
    [ -z "$REPORT" ] && REPORT=$(printf '%s\n' "$RAW" | sed -n '/# *周报/,$p')
    if [ -n "$REPORT" ] && printf '%s' "$REPORT" | grep -q "周报 $WEEK" \
      && [ "$(printf '%s' "$REPORT" | wc -c | tr -d ' ')" -ge 200 ]; then
      printf '%s\n' "$REPORT" > "$REPORT_FILE"
    fi
  fi

  if [ ! -s "$REPORT_FILE" ]; then
    cat > "$REPORT_FILE" <<EOF
# 周报 ${WEEK}（降级版）

本周周报模型未产出合格正文，以下仅保留北极星三数；请查看日志：${LOG}。
EOF
  fi
fi

if ! grep -q "北极星三数" "$REPORT_FILE"; then
  cat >> "$REPORT_FILE" <<EOF

---

## 北极星三数（paper-reading-app，自动统计）

${METRICS_TXT:-（本周指标计算失败）}

❓ **升级触发器①：本周你每天主动想用它吗？（是/否 + 一句话）**
EOF
fi

EMAILED_MARK="$REPORTDIR/.emailed-$WEEK"
if [ "$DRY_RUN" = 1 ]; then
  echo "[$(date)] dry-run 完成：$REPORT_FILE" >> "$LOG"
  printf '%s\n' "$REPORT_FILE"
  exit 0
fi

if [ ! -f "$EMAILED_MARK" ]; then
  if run_timeout 90 "$PYTHON" "$EMAIL_SCRIPT" --subject "周报 $WEEK" --body-file "$REPORT_FILE" >> "$LOG" 2>&1; then
    touch "$EMAILED_MARK"
    echo "[$(date)] 周报邮件已发：$WEEK" >> "$LOG"
  else
    echo "[$(date)] 周报邮件发送失败。" >> "$LOG"
    alert "❌ 周报邮件失败" "${WEEK} 已生成但邮件未发出：$REPORT_FILE"
    exit 1
  fi
else
  echo "[$(date)] $WEEK 已发过邮件，不重复发送。" >> "$LOG"
fi
