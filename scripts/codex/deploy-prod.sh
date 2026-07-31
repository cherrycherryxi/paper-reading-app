#!/usr/bin/env bash
# 生产发布入口：生成版本说明、推送 feature/agent 和 main、更新并重启 Prod。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PROD="/Users/huangnanqi/CursorProjects/paper-reading-app-prod"
REMOTE="${REMOTE:-origin}"
YES=0

if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ]; then
  YES=1
fi

cd "$ROOT"
[ "$(git branch --show-current)" = "feature/agent" ] || {
  echo "发布已停止：必须从 feature/agent 发布。" >&2
  exit 1
}
[ -z "$(git status --porcelain)" ] || {
  echo "发布已停止：工作树有未提交改动，请先处理。" >&2
  git status --short >&2
  exit 1
}

git fetch "$REMOTE" feature/agent main
BASE="$(git rev-parse "$REMOTE/main")"
TARGET="$(git rev-parse HEAD)"
[ "$BASE" != "$TARGET" ] || {
  echo "没有待发布的新提交：feature/agent 与 main 已一致。"
  exit 0
}

echo "即将发布：$BASE -> $TARGET"
if [ "$YES" != 1 ]; then
  read -r -p "确认生成更新说明并发布到 Prod？[y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "已取消。"; exit 0 ;; esac
fi

NOTES="docs/releases/$(date +%Y-%m-%d)-${TARGET:0:8}.md"
scripts/codex/release-hook.sh "$BASE" "$TARGET" "$NOTES"
git add "$NOTES"
git commit -m "docs: add production release notes $(date +%Y-%m-%d)"

git push "$REMOTE" feature/agent
ALLOW_MAIN_PUSH=1 git push "$REMOTE" feature/agent:main

git -C "$PROD" pull --ff-only "$REMOTE" main
launchctl kickstart -k "gui/$(id -u)/com.huangnanqi.paper-backend-prod"
sleep 2

curl -sS -o /dev/null -w 'local_prod_http=%{http_code}\n' http://127.0.0.1:8790/
curl -sS -o /dev/null -w 'public_http=%{http_code}\n' https://read.readjot.com/
echo "生产发布完成：$(git -C "$PROD" rev-parse --short HEAD)"
