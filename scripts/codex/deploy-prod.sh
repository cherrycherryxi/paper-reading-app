#!/usr/bin/env bash
# 生产发布入口：生成版本说明、推送 feature/agent 和 main、更新并重启 Prod。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PROD="/Users/huangnanqi/CursorProjects/paper-reading-app-prod"
REMOTE="${REMOTE:-origin}"
YES=0
FROM_MAIN=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=1 ;;
    --from-main) FROM_MAIN=1 ;;
    *) echo "用法: $0 [--yes] [--from-main]" >&2; exit 2 ;;
  esac
done

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
if [ "$FROM_MAIN" = 1 ]; then
  BASE="$(git -C "$PROD" rev-parse HEAD)"
  TARGET="$(git rev-parse "$REMOTE/main")"
else
  BASE="$(git rev-parse "$REMOTE/main")"
  TARGET="$(git rev-parse HEAD)"
fi
[ "$BASE" != "$TARGET" ] || {
  echo "没有待发布的新提交：Prod 已是 main 当前版本。"
  exit 0
}

git merge-base --is-ancestor "$BASE" "$TARGET" || {
  echo "发布已停止：待发布版本不是 Prod 当前版本的后继，拒绝回退或跨线发布。" >&2
  exit 1
}

echo "即将发布：$BASE -> $TARGET"
if [ "$YES" != 1 ]; then
  read -r -p "确认生成更新说明并发布到 Prod？[y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "已取消。"; exit 0 ;; esac
fi

if [ "$FROM_MAIN" = 1 ]; then
  RELEASE_WORKTREE="$(mktemp -d /private/tmp/paper-release-main.XXXXXX)"
  BARE_SETTING="$(git config --local --get core.bare || true)"
  cleanup_release_worktree() {
    git worktree remove --force "$RELEASE_WORKTREE" 2>/dev/null || true
    if [ -n "$BARE_SETTING" ]; then
      git config --local core.bare "$BARE_SETTING"
    else
      git config --local --unset-all core.bare 2>/dev/null || true
    fi
  }
  trap cleanup_release_worktree EXIT
  git worktree add --detach "$RELEASE_WORKTREE" "$TARGET"
  NOTES="docs/releases/$(date +%Y-%m-%d)-${TARGET:0:8}.md"
  (
    cd "$RELEASE_WORKTREE"
    "$ROOT/scripts/codex/release-hook.sh" "$BASE" "$TARGET" "$NOTES"
    git add "$NOTES"
    git commit -m "docs: add production release notes $(date +%Y-%m-%d)"
    ALLOW_MAIN_PUSH=1 git push "$REMOTE" HEAD:main
  )
  TARGET="$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)"
else
  NOTES="docs/releases/$(date +%Y-%m-%d)-${TARGET:0:8}.md"
  scripts/codex/release-hook.sh "$BASE" "$TARGET" "$NOTES"
  git add "$NOTES"
  git commit -m "docs: add production release notes $(date +%Y-%m-%d)"

  git push "$REMOTE" feature/agent
  ALLOW_MAIN_PUSH=1 git push "$REMOTE" feature/agent:main
  TARGET="$(git rev-parse HEAD)"
fi

git -C "$PROD" pull --ff-only "$REMOTE" main
launchctl kickstart -k "gui/$(id -u)/com.huangnanqi.paper-backend-prod"
sleep 2

curl -sS -o /dev/null -w 'local_prod_http=%{http_code}\n' http://127.0.0.1:8790/
curl -sS -o /dev/null -w 'public_http=%{http_code}\n' https://read.readjot.com/
echo "生产发布完成：$(git -C "$PROD" rev-parse --short HEAD)"
