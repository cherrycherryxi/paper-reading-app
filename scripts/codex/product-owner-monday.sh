#!/bin/bash
# 每周一 09:00：在隔离 worktree 中运行 Codex 产品负责人仪式。
# Codex 只改白名单文件；commit/push/email 由 shell 在校验后执行。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

CODEX="${PAPER_PRODUCT_CODEX:-/Users/huangnanqi/.npm-global/bin/codex}"
REPO="${PAPER_PRODUCT_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
LOG="${PAPER_PRODUCT_LOG:-$HOME/.claude/codex-product-owner.log}"
SUMMARY="${PAPER_PRODUCT_SUMMARY:-$HOME/.claude/product-owner-latest.md}"
EMAIL_SCRIPT="${PAPER_PRODUCT_EMAIL:-$HOME/.claude/scripts/send-email.py}"
BARK="${PAPER_PRODUCT_BARK:-$HOME/.claude/scripts/bark-push.sh}"
PYTHON="${PAPER_PRODUCT_PYTHON:-/usr/bin/python3}"
WEEK="${PAPER_PRODUCT_WEEK:-$(date +%G-W%V)}"
DRY_RUN="${PAPER_PRODUCT_DRY_RUN:-0}"
SKIP_PRUNE="${PAPER_PRODUCT_SKIP_PRUNE:-0}"
LOCK_DIR="${PAPER_PRODUCT_LOCK_DIR:-$HOME/.claude/.codex-product-owner.lock}"

mkdir -p "$(dirname "$LOG")" "$(dirname "$SUMMARY")"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date)] $WEEK 已有产品仪式运行，跳过。" >> "$LOG"
  exit 0
fi

TMP_ROOT=""
WT=""
cleanup() {
  if [ -n "$WT" ] && [ -d "$WT" ]; then git -C "$REPO" worktree remove --force "$WT" >> "$LOG" 2>&1 || true; fi
  [ -n "$TMP_ROOT" ] && rmdir "$TMP_ROOT" 2>/dev/null || true
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[$(date)] === Codex product-owner $WEEK (dry_run=$DRY_RUN) ===" >> "$LOG"
run_timeout() { perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$@"; }
alert() { [ "$DRY_RUN" = 1 ] || bash "$BARK" "$1" "$2" "paper-product-owner" "timeSensitive" >> "$LOG" 2>&1 || true; }
fail_stage() {
  local stage="$1"
  echo "[$(date)] 失败阶段：$stage" >> "$LOG"
  if [ "$DRY_RUN" != 1 ]; then
    printf '本周 Codex 产品负责人仪式失败。\n\n周次：%s\n失败阶段：%s\n日志：%s\n' "$WEEK" "$stage" "$LOG" \
      | "$PYTHON" "$EMAIL_SCRIPT" --subject "本周焦点 · ${WEEK}（Codex 失败）" >> "$LOG" 2>&1 || true
    alert "❌ 产品仪式失败" "${WEEK} 失败阶段：${stage}。请查看 codex-product-owner.log。"
  fi
  exit 1
}

git -C "$REPO" fetch origin feature/agent >> "$LOG" 2>&1 || fail_stage "fetch feature/agent"
TMP_ROOT=$(mktemp -d)
WT="$TMP_ROOT/wt"
git -C "$REPO" worktree add --quiet --detach "$WT" origin/feature/agent >> "$LOG" 2>&1 \
  || fail_stage "创建隔离 worktree"

RECENT_LOG=$(git -C "$WT" log --all --since='8 days ago' --pretty='- %h %cs %s' --date=short | head -120)
if command -v gh >/dev/null 2>&1; then
  MERGED_PRS=$(gh pr list --repo cherrycherryxi/paper-reading-app --state merged --base feature/agent --limit 20 \
    --json number,title,mergedAt --jq '.[] | "- #\(.number) \(.mergedAt // "") \(.title)"' 2>>"$LOG" || true)
else
  MERGED_PRS=""
fi
[ -n "$MERGED_PRS" ] || MERGED_PRS="（GitHub PR 数据不可用；只能依据本地 git log 和仓库文件判断，不得臆造 PR。）"

PRUNE_TASK=""
if [ "$(date +%d)" -le 7 ] && [ "$SKIP_PRUNE" != 1 ]; then
  PRUNE_TASK="每月首个周一：保守清理 optimization/explore.md 中超过 90 天且未提拔、或问题已修复的条目，移至『已归档』节；拿不准就保留。禁止 cat/完整读取 explore.md，先用 rg 定位日期和状态，只检查最多 30 个候选，避免把整个蓄水池灌入上下文。"
fi

PROMPT="你是 paper-reading-app 的产品负责人，执行 $WEEK 周一仪式。当前目录是隔离 worktree，不写应用代码，不 commit、不 push、不发布。

先读 optimization/roadmap.md、signals.md、backlog.md、triage.md；必要时读 explore.md 和代码核实事实。

最近 8 天提交：
$RECENT_LOG

最近合并 PR：
$MERGED_PRS

任务：
1. 先结算 roadmap 上周焦点，逐项核实真实完成状态，写达成率 N/M 和未竟项去向；计划外工作挤占焦点时明确记录。
2. 结合 signals、当前 Theme 和北极星三数，确定本周唯一焦点及 1-3 件具体事项。
3. 同步修正 backlog/triage 中与真实代码或提交不一致的状态；无北极星贡献的未完成项可标 P3 parked 并写理由。
4. $PRUNE_TASK
5. 仅允许修改 optimization/roadmap.md、optimization/backlog.md、optimization/explore.md、optimization/triage.md 和 .wolf/。不得修改其他文件。
6. 最后在回复中输出 250 字以内中文摘要，放在单独成行的 <<<SUMMARY_START>>> 与 <<<SUMMARY_END>>> 之间，包含：上周达成率、本周唯一焦点、原因、本周事项、park/prune（如有）。

所有完成状态必须基于真实文件、代码或上述提交证据，不得臆造。"

RAW=$(run_timeout 900 "$CODEX" exec -C "$WT" --sandbox workspace-write --ephemeral "$PROMPT" 2>>"$LOG" || true)
PRODUCT_SUMMARY=$(printf '%s\n' "$RAW" | awk '/<<<SUMMARY_START>>>/{f=1;next} /<<<SUMMARY_END>>>/{f=0;next} f')
[ -z "$PRODUCT_SUMMARY" ] && PRODUCT_SUMMARY=$(printf '%s\n' "$RAW" | sed -n '/上周.*达成/,$p' | head -40)
[ -n "$PRODUCT_SUMMARY" ] && [ "$(printf '%s' "$PRODUCT_SUMMARY" | wc -c | tr -d ' ')" -ge 80 ] \
  || fail_stage "Codex 未产出合格摘要"

CHANGED=$( { git -C "$WT" diff --name-only; git -C "$WT" ls-files --others --exclude-standard; } | sort -u )
[ -n "$CHANGED" ] || fail_stage "Codex 未更新产品文件"
while IFS= read -r path; do
  case "$path" in
    optimization/roadmap.md|optimization/backlog.md|optimization/explore.md|optimization/triage.md|.wolf/*) ;;
    *) fail_stage "发现越权变更：$path" ;;
  esac
done <<< "$CHANGED"
git -C "$WT" diff --check >> "$LOG" 2>&1 || fail_stage "git diff --check"

printf '%s\n' "$PRODUCT_SUMMARY" > "$SUMMARY"
if [ "$DRY_RUN" = 1 ]; then
  echo "[$(date)] dry-run 通过；变更文件：$CHANGED" >> "$LOG"
  printf '%s\n' "$SUMMARY"
  exit 0
fi

git -C "$WT" add optimization/roadmap.md optimization/backlog.md optimization/explore.md optimization/triage.md .wolf/ >> "$LOG" 2>&1
git -C "$WT" commit -m "chore(product-owner): Codex 周一焦点 $WEEK" >> "$LOG" 2>&1 \
  || fail_stage "提交产品仪式变更"
git -C "$WT" push origin HEAD:feature/agent >> "$LOG" 2>&1 \
  || fail_stage "推送 feature/agent（远端可能并发更新）"

if run_timeout 90 "$PYTHON" "$EMAIL_SCRIPT" --subject "本周焦点 · $WEEK · paper-reading-app（Codex）" \
  --body-file "$SUMMARY" >> "$LOG" 2>&1; then
  echo "[$(date)] 产品焦点邮件已发。" >> "$LOG"
else
  echo "[$(date)] 产品变更已推送，但邮件发送失败。" >> "$LOG"
  alert "⚠️ 产品邮件失败" "$WEEK 产品焦点已推送，但邮件未发出：$SUMMARY"
  exit 1
fi
