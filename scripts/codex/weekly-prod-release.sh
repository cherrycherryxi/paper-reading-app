#!/usr/bin/env bash
# 每周日 17:00：仅经统一发布脚本将 feature/agent 发布到 Prod。
set -euo pipefail

REPO="${PAPER_RELEASE_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
LOG="${PAPER_RELEASE_LOG:-$HOME/.claude/codex-weekly-prod-release.log}"
LOCK_DIR="${PAPER_RELEASE_LOCK_DIR:-$HOME/.claude/.codex-weekly-prod-release.lock}"

mkdir -p "$(dirname "$LOG")"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then exit 0; fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM
echo "[$(date)] weekly prod release starting" >> "$LOG"

cd "$REPO"
[ "$(date +%w)" = 0 ] || { echo "[$(date)] 非周日，拒绝发布。" >> "$LOG"; exit 0; }
[ "$(git branch --show-current)" = feature/agent ] || { echo "[$(date)] 非 feature/agent，拒绝发布。" >> "$LOG"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "[$(date)] 工作树不干净，拒绝发布。" >> "$LOG"; exit 1; }
git fetch origin feature/agent main >> "$LOG" 2>&1
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent)" ] || { echo "[$(date)] 本地不是最新 feature/agent，拒绝发布。" >> "$LOG"; exit 1; }
[ "$(git rev-parse origin/main)" != "$(git rev-parse origin/feature/agent)" ] || { echo "[$(date)] 无待发布提交。" >> "$LOG"; exit 0; }

if ! .venv/bin/python -m pytest tests/ -v >> "$LOG" 2>&1; then
  echo "[$(date)] Python 测试失败，拒绝发布。" >> "$LOG"
  exit 1
fi
if ! node --test tests/frontend/*.test.js >> "$LOG" 2>&1; then
  echo "[$(date)] 前端测试失败，拒绝发布。" >> "$LOG"
  exit 1
fi

bash scripts/codex/deploy-prod.sh --yes >> "$LOG" 2>&1
