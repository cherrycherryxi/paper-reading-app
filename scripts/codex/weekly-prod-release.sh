#!/usr/bin/env bash
# 每周日 17:00：仅经统一发布脚本将 feature/agent 发布到 Prod。
set -euo pipefail

REPO="${PAPER_RELEASE_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
LOG="${PAPER_RELEASE_LOG:-$HOME/.claude/codex-weekly-prod-release.log}"
LOCK_DIR="${PAPER_RELEASE_LOCK_DIR:-$HOME/.claude/.codex-weekly-prod-release.lock}"
DRY_RUN="${PAPER_RELEASE_DRY_RUN:-0}"
TMP_ROOT=""
RELEASE_REPO=""
RUN_FAILED=0

mkdir -p "$(dirname "$LOG")"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then exit 0; fi
cleanup() {
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then
    if [ "$RUN_FAILED" = 1 ]; then
      echo "[$(date)] 保留失败现场：$TMP_ROOT" >> "$LOG"
    else
      rm -rf "$TMP_ROOT"
    fi
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
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
[ "$(git rev-parse origin/main)" != "$(git rev-parse origin/feature/agent)" ] || { echo "[$(date)] 无待发布提交。" >> "$LOG"; exit 0; }

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

bash scripts/codex/deploy-prod.sh --yes >> "$LOG" 2>&1
