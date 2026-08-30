#!/bin/bash
# Read-only CCDS shadow for paper-wrapup.
# It never emails, touches the canonical daily-log directory, changes Git state,
# or installs/loads a LaunchAgent. Output is kept under a separate shadow root.
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
RUNNER="${PAPER_WRAPUP_SHADOW_RUNNER:-$SCRIPT_DIR/agent-runner.sh}"
REPO="${PAPER_WRAPUP_SHADOW_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
OUTDIR="${PAPER_WRAPUP_SHADOW_OUTDIR:-$HOME/.claude/agent-shadow/paper-wrapup}"
LOG="${PAPER_WRAPUP_SHADOW_LOG:-$HOME/.claude/agent-shadow/paper-wrapup.log}"
DAY="${PAPER_WRAPUP_SHADOW_DAY:-$(date +%F)}"
PROVIDER="${PAPER_WRAPUP_SHADOW_PROVIDER:-claude-deepseek}"
# Claude Code prices unknown third-party models with its own rate table, so its
# --max-budget-usd can reject a cheap DeepSeek call prematurely. Keep this
# optional until the outer runner calculates cost from JSON usage itself.
MAX_BUDGET_USD="${PAPER_WRAPUP_SHADOW_MAX_BUDGET_USD-}"
TIMEOUT_SECONDS="${PAPER_WRAPUP_SHADOW_TIMEOUT:-600}"
OUT="$OUTDIR/$DAY.md"
META="$OUTDIR/$DAY.meta"

mkdir -p "$OUTDIR" "$(dirname "$LOG")"
run_timeout() { perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$@"; }
fail() { echo "[$(date)] shadow wrapup 失败：$1" >> "$LOG"; exit 1; }

PROMPT="你是 paper-reading-app 的只读收工助手。请回顾 ${DAY} 的仓库工作并写中文 Markdown 日报。
只允许读取仓库和执行只读 Git 命令。不要修改文件、提交、推送、发邮件、访问生产服务或输出秘密。
先检查 AGENTS.md、CLAUDE.md 和当天所有分支提交，再基于仓库事实写作，不用提交标题臆造结果。
结构要求：第一行 '# 日报 ${DAY}'，第二行 '项目：paper-reading-app'；随后包含“今日主要工作”“亮点与可改进”“下一步”三节。
把完整日报放在单独成行的 <<<REPORT_START>>> 与 <<<REPORT_END>>> 之间。标记之间只放日报。"

echo "[$(date)] === CCDS shadow wrapup $DAY provider=$PROVIDER ===" >> "$LOG"
RUN_ARGS=(
  --provider "$PROVIDER"
  --cwd "$REPO"
  --mode read-only
  --model-tier flash
  --effort low
  --task paper-wrapup-shadow
  --allowed-tools "Read,Glob,Grep,Bash"
  --prompt "$PROMPT"
)
[ -z "$MAX_BUDGET_USD" ] || RUN_ARGS+=(--max-budget-usd "$MAX_BUDGET_USD")
set +e
RAW=$(run_timeout "$TIMEOUT_SECONDS" "$RUNNER" "${RUN_ARGS[@]}" 2>>"$LOG")
STATUS=$?
set -e
[ "$STATUS" -eq 0 ] || fail "runner exit=$STATUS"

REPORT=$(printf '%s\n' "$RAW" | awk '/<<<REPORT_START>>>/{f=1;next} /<<<REPORT_END>>>/{f=0;next} f')
[ -n "$REPORT" ] || fail "缺少 REPORT 标记或正文为空"
printf '%s' "$REPORT" | grep -q "日报 ${DAY}" || fail "日报日期不匹配"
SIZE=$(printf '%s' "$REPORT" | wc -c | tr -d ' ')
[ "$SIZE" -ge 200 ] || fail "日报过短：${SIZE} bytes"

TMP_OUT="$OUT.tmp.$$"
TMP_META="$META.tmp.$$"
printf '%s\n' "$REPORT" > "$TMP_OUT"
{
  printf 'day=%s\n' "$DAY"
  printf 'provider=%s\n' "$PROVIDER"
  printf 'bytes=%s\n' "$SIZE"
  printf 'generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'side_effects=shadow-only\n'
} > "$TMP_META"
mv "$TMP_OUT" "$OUT"
mv "$TMP_META" "$META"
echo "[$(date)] shadow wrapup 通过：$OUT (${SIZE} bytes)" >> "$LOG"
printf '%s\n' "$OUT"
