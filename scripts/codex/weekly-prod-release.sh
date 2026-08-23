#!/usr/bin/env bash
# 每周日 17:00：仅经统一发布脚本将 feature/agent 发布到 Prod。
set -euo pipefail

REPO="${PAPER_RELEASE_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
LOG="${PAPER_RELEASE_LOG:-$HOME/.claude/codex-weekly-prod-release.log}"
LOCK_DIR="${PAPER_RELEASE_LOCK_DIR:-$HOME/.claude/.codex-weekly-prod-release.lock}"
DRY_RUN="${PAPER_RELEASE_DRY_RUN:-0}"
EMAIL_SCRIPT="${PAPER_RELEASE_EMAIL:-$HOME/.claude/scripts/send-email.py}"
PROD_REPO="${PAPER_RELEASE_PROD_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app-prod}"
TMP_ROOT=""
RELEASE_REPO=""
RUN_FAILED=0
NOTIFICATION_SENT=0

mkdir -p "$(dirname "$LOG")"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then exit 0; fi
cleanup() {
  local rc=$?
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then
    if [ "$RUN_FAILED" = 1 ]; then
      echo "[$(date)] 保留失败现场：$TMP_ROOT" >> "$LOG"
    else
      rm -rf "$TMP_ROOT"
    fi
  fi
  if [ "$rc" -ne 0 ] && [ "$DRY_RUN" != 1 ] && [ "$NOTIFICATION_SENT" != 1 ]; then
    notify "❌ Prod 自动发布失败 · $(date +%F)" \
      "周日自动生产发布失败，Prod 未被报告为成功。请查看日志：$LOG"
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
notify() {
  local subject="$1" body="$2"
  [ "$DRY_RUN" = 1 ] && return 0
  if /usr/bin/python3 "$EMAIL_SCRIPT" --subject "$subject" --body "$body" >> "$LOG" 2>&1; then
    NOTIFICATION_SENT=1
  else
    echo "[$(date)] 发布通知邮件发送失败：$subject" >> "$LOG"
  fi
  return 0
}
fail() {
  RUN_FAILED=1
  echo "[$(date)] $1" >> "$LOG"
  exit 1
}
trap cleanup EXIT INT TERM
echo "[$(date)] weekly prod release starting" >> "$LOG"

[ "$DRY_RUN" = 1 ] || [ "$(date +%w)" = 0 ] || { echo "[$(date)] 非周日，拒绝发布。" >> "$LOG"; exit 0; }

SOURCE="${PAPER_RELEASE_SOURCE:-$(git -C "$REPO" remote get-url origin)}"
TEST_PYTHON="${PAPER_RELEASE_PYTHON:-$REPO/.venv/bin/python}"
TMP_ROOT=$(mktemp -d) || fail "无法创建隔离发布目录。"
RELEASE_REPO="$TMP_ROOT/repo"
git clone --quiet --branch feature/agent --single-branch --no-local "$SOURCE" "$RELEASE_REPO" >> "$LOG" 2>&1 \
  || fail "无法创建 feature/agent 隔离 clone。"
git -C "$RELEASE_REPO" config --local core.hooksPath /dev/null
[ -x "$TEST_PYTHON" ] || fail "开发环境 Python 不可用，拒绝发布。"
cd "$RELEASE_REPO"

[ "$(git branch --show-current)" = feature/agent ] || fail "隔离 clone 非 feature/agent，拒绝发布。"
[ -z "$(git status --porcelain)" ] || fail "隔离 clone 工作树不干净，拒绝发布。"
git fetch origin feature/agent:refs/remotes/origin/feature/agent main:refs/remotes/origin/main >> "$LOG" 2>&1 \
  || fail "无法获取最新 feature/agent/main。"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent)" ] || fail "隔离 clone 不是最新 feature/agent，拒绝发布。"
if [ "$(git rev-parse origin/main)" = "$(git rev-parse origin/feature/agent)" ]; then
  echo "[$(date)] 无待发布提交。" >> "$LOG"
  notify "ℹ️ Prod 本周无需发布 · $(date +%F)" \
    "feature/agent 与 main 已一致，本周没有待发布提交。生产环境未执行更新。"
  exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
  echo "[$(date)] dry-run：隔离 clone 与远端分支校验通过，跳过测试和生产发布。" >> "$LOG"
  exit 0
fi

if ! "$TEST_PYTHON" -m pytest tests/ -v >> "$LOG" 2>&1; then
  echo "[$(date)] Python 测试失败，拒绝发布。" >> "$LOG"
  exit 1
fi
if ! node --test tests/frontend/*.test.js >> "$LOG" 2>&1; then
  echo "[$(date)] 前端测试失败，拒绝发布。" >> "$LOG"
  exit 1
fi

PRE_DEPLOY_TARGET=$(git rev-parse HEAD)
RELEASE_NOTES="docs/releases/$(date +%F)-${PRE_DEPLOY_TARGET:0:8}.md"
bash scripts/codex/deploy-prod.sh --yes >> "$LOG" 2>&1
PROD_SHA=$(git -C "$PROD_REPO" rev-parse HEAD)
if [ -f "$RELEASE_NOTES" ]; then
  RELEASE_CONTENT=$(cat "$RELEASE_NOTES")
else
  RELEASE_CONTENT="更新说明文件未找到，请查看发布日志：$LOG"
fi
SUCCESS_BODY=$(printf '周日自动生产发布已完成。\n\nProd SHA: %s\n本地入口与公网入口均已通过发布脚本 HTTP 健康检查。\n\n以下为本次完整 release note：\n\n%s' \
  "$PROD_SHA" "$RELEASE_CONTENT")
notify "✅ Prod 自动发布成功 · $(date +%F)" "$SUCCESS_BODY"
