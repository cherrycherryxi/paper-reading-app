#!/bin/bash
# 每日 01:00：在隔离 clone 中执行夜间 Agent1（Triage）。
# Codex 只改规划/知识白名单；commit 与 push 由 shell 校验后执行。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

CODEX="${PAPER_NIGHTLY_CODEX:-/Users/huangnanqi/.npm-global/bin/codex}"
REPO="${PAPER_NIGHTLY_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
source "$(cd "$(dirname "$0")" && pwd)/nightly-common.sh"
STATE_DIR="${PAPER_NIGHTLY_STATE_DIR:-$HOME/.claude/codex-nightly}"
LOG="${PAPER_NIGHTLY_TRIAGE_LOG:-$HOME/.claude/codex-nightly-triage.log}"
BARK="${PAPER_NIGHTLY_BARK:-$HOME/.claude/scripts/bark-push.sh}"
PYTHON="${PAPER_NIGHTLY_PYTHON:-/usr/bin/python3}"
TODAY="${PAPER_NIGHTLY_TODAY:-$(date +%F)}"
DRY_RUN="${PAPER_NIGHTLY_DRY_RUN:-0}"
SKIP_FETCH="${PAPER_NIGHTLY_SKIP_FETCH:-0}"
BASE_REF="${PAPER_NIGHTLY_BASE_REF:-origin/feature/agent}"
LOCK_DIR="${PAPER_NIGHTLY_TRIAGE_LOCK:-$STATE_DIR/.triage.lock}"
DONE_MARK="$STATE_DIR/triage-$TODAY.done"

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
[ "$DRY_RUN" = 1 ] || [ ! -f "$DONE_MARK" ] || exit 0
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date)] triage 已在运行，跳过。" >> "$LOG"
  exit 0
fi

TMP_ROOT=""
WT=""
RUN_FAILED=0
HOOKS_FILE=""
HOOKS_BACKUP=""
cleanup() {
  nightly_restore_project_hooks
  nightly_cleanup_clone
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
run_timeout() { perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$@"; }
alert() { [ "$DRY_RUN" = 1 ] || bash "$BARK" "$1" "$2" "paper-nightly-triage" "timeSensitive" >> "$LOG" 2>&1 || true; }
fail() { RUN_FAILED=1; echo "[$(date)] triage 失败：${1}" >> "$LOG"; alert "❌ 夜间 Triage 失败" "${TODAY}：${1}"; exit 1; }

echo "[$(date)] === Codex nightly triage $TODAY (dry_run=$DRY_RUN) ===" >> "$LOG"
if [ "$SKIP_FETCH" != 1 ]; then
  git -C "$REPO" fetch origin feature/agent >> "$LOG" 2>&1 || fail "fetch feature/agent"
fi
nightly_create_clone || fail "创建或校验隔离 clone"

RECENT_LOG=$(git -C "$WT" log --all --since='8 days ago' --pretty='- %h %cs %s' --date=short | head -120)
PR_JSON=""
for attempt in 1 2 3; do
  PR_JSON=$(run_timeout 90 gh pr list --repo cherrycherryxi/paper-reading-app --state all --base feature/agent --limit 50 \
    --json number,title,state,isDraft,createdAt,mergedAt,headRefName 2>>"$LOG" || true)
  [ -n "$PR_JSON" ] && break
  echo "[$(date)] GitHub PR 证据获取失败（${attempt}/3）。" >> "$LOG"
  sleep 5
done
if [ -n "$PR_JSON" ]; then
  PR_EVIDENCE=$(printf '%s' "$PR_JSON" | "$PYTHON" -c 'import json,sys
for p in json.load(sys.stdin):
 print(f"- #{p[\"number\"]} {p[\"state\"]} created={p[\"createdAt\"]} merged={p.get(\"mergedAt\") or \"-\"} head={p[\"headRefName\"]} {p[\"title\"]}")')
  AUTO_COUNT=$(printf '%s' "$PR_JSON" | "$PYTHON" -c 'import json,sys
from datetime import datetime,timedelta,timezone
cutoff=datetime.now(timezone.utc)-timedelta(days=7)
print(sum(1 for p in json.load(sys.stdin) if p["headRefName"].startswith("auto/") and datetime.fromisoformat(p["createdAt"].replace("Z","+00:00")) >= cutoff))')
else
  PR_EVIDENCE="（GitHub PR 数据不可用。）"
  AUTO_COUNT="UNKNOWN"
fi

PROMPT="你是 paper-reading-app 夜间 Agent1（Triage）。当前上海日期是 ${TODAY}。当前目录是隔离 clone；不要 commit、push、开 PR 或发布。

先完整遵循 AGENTS.md，并按要求读取 .wolf/anatomy.md、.wolf/cerebrum.md；这是规划维护，不写应用代码。读取 optimization/roadmap.md、optimization/signals.md、optimization/backlog.md、optimization/triage.md，并用真实代码和下方证据核实状态。GitHub 数据已经由外层一次性获取，不要再调用 gh 或逐个访问 GitHub API。

最近 8 天提交：
${RECENT_LOG}

最近 50 个 feature/agent PR：
${PR_EVIDENCE}

最近 7 天 auto/ PR 数：${AUTO_COUNT}

任务：
1. 对每个未完成 backlog 项评估 priority、S/M/L 和北极星贡献；当前 Theme 与真实 signal 高于纯工程判断。无合理北极星贡献的一律 P3 parked，不能指派。
2. 用最近合并 PR 与 git log 对账，merged 项在 backlog 和 triage 都标 done；不得凭描述臆断完成。
3. 每 7 天最多 8 个 headRefName 以 auto/ 开头的实现 PR。使用上方外层统计；达到上限时 Next up 明写预算耗尽且不指派。若统计为 UNKNOWN，为避免超预算也不指派，并写明证据不可用。
4. 夜间路径只可指派**复杂度 S**、验收边界清楚、无需 owner 产品/设计判断的局部任务（例如回归修复、明确的正确性或可访问性缺口）。优先级不改变这个边界：P1 但属于 M/L、信息架构/导航调整、主页重构、视觉方案、需要在多种体验取舍中选择、或 owner 新反馈尚需诠释的项，一律留给 07:00 晨间候选卡，不能写入 Next up。若没有合格的夜间 S 任务，Next up 明确写“无符合夜间条件的任务”，不要为了填满预算而指派。
5. 将 optimization/triage.md 的 Last triaged 更新为 ${TODAY}，并至多指派一个符合上述夜间边界的未完成项；写明理由、关键文件、signal/Theme，并在理由中写“夜间适配：是”及其依据。
6. 只允许修改 optimization/triage.md、optimization/backlog.md 和 .wolf/。不要修改 roadmap/signals/explore 或应用代码。
7. 回复末尾输出单独成行的 <<<SUMMARY_START>>> 与 <<<SUMMARY_END>>>，中间写 200 字以内中文摘要。

所有判断必须有仓库证据。"

nightly_disable_project_hooks || fail "隔离 clone 内 Codex hooks"
RAW=$(run_timeout 1200 "$CODEX" exec -C "$WT" --sandbox workspace-write --ephemeral "$PROMPT" 2>>"$LOG" || true)
nightly_restore_project_hooks
SUMMARY=$(printf '%s\n' "$RAW" | awk '/<<<SUMMARY_START>>>/{f=1;next} /<<<SUMMARY_END>>>/{f=0;next} f')
[ -n "$SUMMARY" ] || fail "Codex 未产出摘要"

nightly_assert_clone || fail "隔离 clone Git 状态失效；现场已保留"

CHANGED=$( { git -C "$WT" diff --name-only; git -C "$WT" ls-files --others --exclude-standard; } | sort -u )
[ -n "$CHANGED" ] || fail "Codex 未更新 triage"
while IFS= read -r path; do
  case "$path" in
    optimization/triage.md|optimization/backlog.md|.wolf/*) ;;
    *) fail "发现越权变更：$path" ;;
  esac
done <<< "$CHANGED"
git -C "$WT" diff --check >> "$LOG" 2>&1 || fail "git diff --check"

if [ "$DRY_RUN" = 1 ]; then
  echo "[$(date)] triage dry-run 通过；变更：${CHANGED}；摘要：${SUMMARY}" >> "$LOG"
  exit 0
fi

git -C "$WT" add optimization/triage.md optimization/backlog.md .wolf/ >> "$LOG" 2>&1
git -C "$WT" commit -m "chore(triage): Codex nightly triage $TODAY" >> "$LOG" 2>&1 || fail "提交"
git -C "$WT" push origin HEAD:feature/agent >> "$LOG" 2>&1 || fail "推送 feature/agent（可能有并发更新）"
printf '%s\n' "$SUMMARY" > "$DONE_MARK"
echo "[$(date)] triage 完成。" >> "$LOG"
