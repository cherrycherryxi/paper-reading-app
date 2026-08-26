#!/bin/bash
# 每日 05:00，07:00 补偿重试：执行夜间 Agent3（Explore）。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

CODEX="${PAPER_NIGHTLY_CODEX:-/Users/huangnanqi/.npm-global/bin/codex}"
REPO="${PAPER_NIGHTLY_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
source "$(cd "$(dirname "$0")" && pwd)/nightly-common.sh"
STATE_DIR="${PAPER_NIGHTLY_STATE_DIR:-$HOME/.claude/codex-nightly}"
LOG="${PAPER_NIGHTLY_EXPLORE_LOG:-$HOME/.claude/codex-nightly-explore.log}"
BARK="${PAPER_NIGHTLY_BARK:-$HOME/.claude/scripts/bark-push.sh}"
TODAY="${PAPER_NIGHTLY_TODAY:-$(date +%F)}"
DRY_RUN="${PAPER_NIGHTLY_DRY_RUN:-0}"
SKIP_FETCH="${PAPER_NIGHTLY_SKIP_FETCH:-0}"
BASE_REF="${PAPER_NIGHTLY_BASE_REF:-origin/feature/agent}"
LOCK_DIR="${PAPER_NIGHTLY_EXPLORE_LOCK:-$STATE_DIR/.explore.lock}"
DONE_MARK="$STATE_DIR/explore-$TODAY.done"

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
[ "$DRY_RUN" = 1 ] || [ ! -f "$DONE_MARK" ] || exit 0
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date)] explore 已在运行，跳过。" >> "$LOG"
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
alert() { [ "$DRY_RUN" = 1 ] || bash "$BARK" "$1" "$2" "paper-nightly-explore" "timeSensitive" >> "$LOG" 2>&1 || true; }
fail() { RUN_FAILED=1; echo "[$(date)] explore 失败：${1}" >> "$LOG"; alert "❌ 夜间 Explore 失败" "${TODAY}：${1}"; exit 1; }

echo "[$(date)] === Codex nightly explore $TODAY (dry_run=$DRY_RUN) ===" >> "$LOG"
if [ "$SKIP_FETCH" != 1 ]; then
  git -C "$REPO" fetch origin feature/agent >> "$LOG" 2>&1 || fail "fetch feature/agent"
fi
nightly_create_clone || fail "创建或校验隔离 clone"

OPEN_PRS=""
for attempt in 1 2 3; do
  OPEN_PRS=$(run_timeout 90 gh pr list --repo cherrycherryxi/paper-reading-app --state open --base feature/agent --limit 20 --json number,title,headRefName --jq '.[] | "- #\(.number) [\(.headRefName)] \(.title)"' 2>>"$LOG" || true)
  [ -n "$OPEN_PRS" ] && break
  echo "[$(date)] open PR 证据获取失败或为空（${attempt}/3）。" >> "$LOG"
  sleep 5
done
[ -n "$OPEN_PRS" ] || OPEN_PRS="（无 open PR 或 GitHub 数据不可用；不得据此臆造状态。）"

PROMPT="你是 paper-reading-app 夜间 Agent3（Explore）。当前上海日期是 ${TODAY}。当前目录是隔离 clone；不要 commit、push、开 PR、合并或发布。

完整遵循 AGENTS.md，先读 .wolf/anatomy.md、.wolf/cerebrum.md、.wolf/buglog.json。读取 optimization/backlog.md、optimization/triage.md、optimization/roadmap.md、optimization/signals.md，并查看最近 git 历史。

当前 open PR（用于避免重复发现）：
$OPEN_PRS

任务：
1. 探索 3-6 个尚未进入 backlog 的新方向，可覆盖 UX、测试、性能、无障碍、错误处理和代码健康；优先当前 Theme 或真实 signal。
2. EVIDENCE RULE：任何现有缺陷/缺失都必须实际打开当前文件核实，引用准确 file:line；禁止凭记忆捏造 UI 文案或行为。先确认不是 backlog、open PR、已合并代码或 explore 旧项的重复。
3. 向 optimization/explore.md 追加 $TODAY 小节，每项写 what/why/S-M-L/files/northstar。explore 是 append-only，不重写历史。
4. 最多提拔 1-2 个证据最强的方向到 optimization/backlog.md，使用远端当前最大 OPT 编号之后的空闲编号；新提拔项必须写成 \`- status: new\`，不得创造 \`open\` 等状态；不确定或弱北极星项不提拔。
5. 只允许修改 optimization/explore.md、optimization/backlog.md 和 .wolf/；绝不写应用代码，绝不开 PR。
6. 回复末尾用 <<<SUMMARY_START>>> 与 <<<SUMMARY_END>>> 包住 250 字以内中文摘要。
"

nightly_disable_project_hooks || fail "隔离 clone 内 Codex hooks"
RAW=$(run_timeout 1500 "$CODEX" exec -C "$WT" --sandbox workspace-write --ephemeral "$PROMPT" 2>>"$LOG" || true)
nightly_restore_project_hooks
SUMMARY=$(printf '%s\n' "$RAW" | awk '/<<<SUMMARY_START>>>/{f=1;next} /<<<SUMMARY_END>>>/{f=0;next} f')
[ -n "$SUMMARY" ] || fail "Codex 未产出摘要"

nightly_assert_clone || fail "隔离 clone Git 状态失效；现场已保留"

CHANGED=$( { git -C "$WT" diff --name-only; git -C "$WT" ls-files --others --exclude-standard; } | sort -u )
[ -n "$CHANGED" ] || fail "Codex 未更新 explore"
while IFS= read -r path; do
  case "$path" in
    optimization/explore.md|optimization/backlog.md|.wolf/*) ;;
    *) fail "发现越权变更：$path" ;;
  esac
done <<< "$CHANGED"
git -C "$WT" diff --check >> "$LOG" 2>&1 || fail "git diff --check"

if [ "$DRY_RUN" = 1 ]; then
  echo "[$(date)] explore dry-run 通过；变更：${CHANGED}；摘要：${SUMMARY}" >> "$LOG"
  exit 0
fi

git -C "$WT" add optimization/explore.md optimization/backlog.md .wolf/ >> "$LOG" 2>&1
git -C "$WT" commit -m "chore(explore): Codex nightly directions $TODAY" >> "$LOG" 2>&1 || fail "提交"
git -C "$WT" push origin HEAD:feature/agent >> "$LOG" 2>&1 || fail "推送 feature/agent（可能有并发更新）"
printf '%s\n' "$SUMMARY" > "$DONE_MARK"
echo "[$(date)] explore 完成。" >> "$LOG"
