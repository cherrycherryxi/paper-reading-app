#!/bin/bash
# 每日 04:00：执行夜间 Agent2（Implement）。只开 feature/agent PR，绝不合并。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

CODEX="${PAPER_NIGHTLY_CODEX:-/Users/huangnanqi/.npm-global/bin/codex}"
REPO="${PAPER_NIGHTLY_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
STATE_DIR="${PAPER_NIGHTLY_STATE_DIR:-$HOME/.claude/codex-nightly}"
LOG="${PAPER_NIGHTLY_IMPLEMENT_LOG:-$HOME/.claude/codex-nightly-implement.log}"
BARK="${PAPER_NIGHTLY_BARK:-$HOME/.claude/scripts/bark-push.sh}"
TODAY="${PAPER_NIGHTLY_TODAY:-$(date +%F)}"
DRY_RUN="${PAPER_NIGHTLY_DRY_RUN:-0}"
SKIP_FETCH="${PAPER_NIGHTLY_SKIP_FETCH:-0}"
SKIP_DEP="${PAPER_NIGHTLY_SKIP_DEPENDENCY:-0}"
BASE_REF="${PAPER_NIGHTLY_BASE_REF:-origin/feature/agent}"
LOCK_DIR="${PAPER_NIGHTLY_IMPLEMENT_LOCK:-$STATE_DIR/.implement.lock}"
TRIAGE_MARK="$STATE_DIR/triage-$TODAY.done"
DONE_MARK="$STATE_DIR/implement-$TODAY.done"

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
[ "$DRY_RUN" = 1 ] || [ ! -f "$DONE_MARK" ] || exit 0
if [ "$SKIP_DEP" != 1 ] && [ ! -f "$TRIAGE_MARK" ]; then
  echo "[$(date)] implement 跳过：缺少当天 triage 完成标记。" >> "$LOG"
  exit 75
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date)] implement 已在运行，跳过。" >> "$LOG"
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
run_timeout() { perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$@"; }
alert() { [ "$DRY_RUN" = 1 ] || bash "$BARK" "$1" "$2" "paper-nightly-implement" "timeSensitive" >> "$LOG" 2>&1 || true; }
fail() { echo "[$(date)] implement 失败：${1}" >> "$LOG"; alert "❌ 夜间 Implement 失败" "${TODAY}：${1}"; exit 1; }

echo "[$(date)] === Codex nightly implement $TODAY (dry_run=$DRY_RUN) ===" >> "$LOG"
if [ "$SKIP_FETCH" != 1 ]; then
  git -C "$REPO" fetch origin feature/agent >> "$LOG" 2>&1 || fail "fetch feature/agent"
fi
TMP_ROOT=$(mktemp -d)
WT="$TMP_ROOT/wt"
git -C "$REPO" worktree add --quiet --detach "$WT" "$BASE_REF" >> "$LOG" 2>&1 || fail "创建隔离 worktree"

PROMPT="你是 paper-reading-app 夜间 Agent2（Implement）。当前上海日期是 ${TODAY}。当前目录是隔离 worktree；只修改文件，不执行 git/gh，不 commit、不 push、不开 PR、不合并、不发布。

完整遵循 AGENTS.md：先读 .wolf/anatomy.md、.wolf/cerebrum.md、.wolf/buglog.json。读取 optimization/triage.md。

新鲜度：如果 Last triaged 不是 ${TODAY}，或 Next up 明确预算耗尽/没有可实现项，不改文件；回复单独三行 <<<NIGHTLY_STATUS>>>、SKIP、<<<NIGHTLY_STATUS_END>>> 后结束。

否则只实现 Next up 指派的一个条目：
1. 先核实根因与现状，采取 smallest viable scope；禁止第二个条目。
2. 可修改应用代码和测试；不得迁移数据库、删除用户数据、修改生产数据/凭据、做大重构、修改 main 或部署脚本。
3. 补充针对性测试；shell 会在你结束后运行完整 Python/Node 测试。
4. 在 optimization/triage.md 对应项标 in-progress，并注明『Codex nightly PR pending』；不要修改 roadmap/signals/explore。
5. 最后严格输出：
<<<NIGHTLY_STATUS>>>
IMPLEMENT
<<<NIGHTLY_STATUS_END>>>
<<<ITEM_ID>>>
OPT-NNN
<<<ITEM_ID_END>>>
<<<TITLE>>>
简短 PR 标题
<<<TITLE_END>>>
<<<SUMMARY_START>>>
中文说明问题、改动和测试，300 字以内
<<<SUMMARY_END>>>

不要声称测试通过；测试由外层 shell 真实执行。"

RAW=$(run_timeout 1800 "$CODEX" exec -C "$WT" --dangerously-bypass-approvals-and-sandbox --ephemeral "$PROMPT" 2>>"$LOG" || true)
STATUS=$(printf '%s\n' "$RAW" | awk '/<<<NIGHTLY_STATUS>>>/{f=1;next} /<<<NIGHTLY_STATUS_END>>>/{f=0;next} f' | head -1 | tr -d '[:space:]')
if [ "$STATUS" = "SKIP" ]; then
  if [ "$DRY_RUN" != 1 ]; then
    printf '%s\n' "SKIP：当天无可实现指派。" > "$DONE_MARK"
  fi
  echo "[$(date)] implement 正常跳过。" >> "$LOG"
  exit 0
fi
[ "$STATUS" = "IMPLEMENT" ] || fail "Codex 未返回有效状态"

ITEM_ID=$(printf '%s\n' "$RAW" | awk '/<<<ITEM_ID>>>/{f=1;next} /<<<ITEM_ID_END>>>/{f=0;next} f' | head -1 | tr -d '[:space:]')
TITLE=$(printf '%s\n' "$RAW" | awk '/<<<TITLE>>>/{f=1;next} /<<<TITLE_END>>>/{f=0;next} f' | head -1)
SUMMARY=$(printf '%s\n' "$RAW" | awk '/<<<SUMMARY_START>>>/{f=1;next} /<<<SUMMARY_END>>>/{f=0;next} f')
printf '%s' "$ITEM_ID" | grep -Eq '^OPT-[0-9]{3,}$' || fail "无效 ITEM_ID：$ITEM_ID"
[ -n "$TITLE" ] && [ -n "$SUMMARY" ] || fail "缺少标题或摘要"

CHANGED=$( { git -C "$WT" diff --name-only; git -C "$WT" ls-files --others --exclude-standard; } | sort -u )
[ -n "$CHANGED" ] || fail "Codex 未产生实现变更"
while IFS= read -r path; do
  case "$path" in
    .env|.env.*|uploads/*|data/*|scripts/codex/*|scripts/deploy*|.github/workflows/*) fail "禁止变更：$path" ;;
  esac
done <<< "$CHANGED"
git -C "$WT" diff --check >> "$LOG" 2>&1 || fail "git diff --check"

if [ "$DRY_RUN" = 1 ]; then
  echo "[$(date)] implement dry-run 通过；${ITEM_ID}；变更：${CHANGED}" >> "$LOG"
  exit 0
fi

PY_STATUS=0
JS_STATUS=0
(cd "$WT" && run_timeout 1800 "$REPO/.venv/bin/python" -m pytest tests/ -q) >> "$LOG" 2>&1 || PY_STATUS=$?
(cd "$WT" && run_timeout 1200 node --test tests/frontend/*.test.js) >> "$LOG" 2>&1 || JS_STATUS=$?
TEST_RESULT="Python=${PY_STATUS}；Node=${JS_STATUS}"

BRANCH="auto/codex-${ITEM_ID#OPT-}-${TODAY//-/}-$PPID"
git -C "$WT" checkout -b "$BRANCH" >> "$LOG" 2>&1 || fail "创建实现分支"
git -C "$WT" add -A >> "$LOG" 2>&1
git -C "$WT" commit -m "feat($ITEM_ID): $TITLE" >> "$LOG" 2>&1 || fail "提交实现"
git -C "$WT" push -u origin "$BRANCH" >> "$LOG" 2>&1 || fail "推送实现分支"

BODY="$TMP_ROOT/pr-body.md"
printf '%s\n\nBacklog: %s\n\nTests: %s\n\nAutomated by Codex nightly Agent2; targets feature/agent and is never auto-merged by this job.\n' "$SUMMARY" "$ITEM_ID" "$TEST_RESULT" > "$BODY"
GH_ARGS=(pr create --repo cherrycherryxi/paper-reading-app --base feature/agent --head "$BRANCH" --title "$ITEM_ID · $TITLE" --body-file "$BODY")
if [ "$PY_STATUS" -ne 0 ] || [ "$JS_STATUS" -ne 0 ]; then GH_ARGS+=(--draft); fi
PR_URL=""
for attempt in 1 2 3; do
  PR_URL=$(run_timeout 120 gh "${GH_ARGS[@]}" 2>>"$LOG" || true)
  [ -n "$PR_URL" ] || PR_URL=$(run_timeout 60 gh pr view "$BRANCH" --repo cherrycherryxi/paper-reading-app --json url --jq .url 2>>"$LOG" || true)
  [ -n "$PR_URL" ] && break
  echo "[$(date)] 创建/查询 PR 失败（${attempt}/3）。" >> "$LOG"
  sleep 5
done
[ -n "$PR_URL" ] || fail "创建 PR"

printf '%s\n%s\n%s\n' "$ITEM_ID" "$PR_URL" "$TEST_RESULT" > "$DONE_MARK"
echo "[$(date)] implement 完成：${PR_URL}（${TEST_RESULT}）" >> "$LOG"
if [ "$PY_STATUS" -ne 0 ] || [ "$JS_STATUS" -ne 0 ]; then
  alert "⚠️ 夜间 Implement 留下 Draft PR" "${ITEM_ID} 测试未全绿：${TEST_RESULT}；${PR_URL}"
fi
