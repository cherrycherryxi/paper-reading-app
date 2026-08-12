#!/bin/bash
# Shared isolation helpers for the local Codex nightly tasks.
# A clone deliberately has its own .git directory: linked worktrees share
# repository configuration and can therefore be poisoned by another process.

nightly_create_clone() {
  local source
  source="$REPO"
  if git -C "$REPO" remote get-url origin >/dev/null 2>&1; then
    source=$(git -C "$REPO" remote get-url origin)
  fi

  TMP_ROOT=$(mktemp -d) || return 1
  WT="$TMP_ROOT/repo"
  git clone --quiet --no-checkout --no-local "$source" "$WT" >> "$LOG" 2>&1 || return 1
  git -C "$WT" checkout --quiet --detach "$BASE_REF" >> "$LOG" 2>&1 || return 1
  git -C "$WT" config --local core.bare false || return 1
  git -C "$WT" config --local core.hooksPath /dev/null || return 1
  nightly_assert_clone || return 1
}

nightly_assert_clone() {
  [ -n "${WT:-}" ] && [ -d "$WT/.git" ] || return 1
  [ "$(git -C "$WT" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || return 1
  git -C "$WT" status --porcelain >/dev/null 2>&1
}

nightly_cleanup_clone() {
  if [ -n "${TMP_ROOT:-}" ] && [ -d "$TMP_ROOT" ]; then
    if [ "${RUN_FAILED:-0}" = 1 ]; then
      echo "[$(date)] 保留失败现场：${TMP_ROOT}" >> "$LOG"
    else
      rm -rf "$TMP_ROOT"
    fi
  fi
}

nightly_disable_project_hooks() {
  HOOKS_FILE="$WT/.codex/hooks.json"
  HOOKS_BACKUP="$TMP_ROOT/codex-hooks.json"
  [ -f "$HOOKS_FILE" ] || return 0
  mv "$HOOKS_FILE" "$HOOKS_BACKUP" || return 1
  echo "[$(date)] 已临时隔离 clone 内 Codex/OpenWolf hooks。" >> "$LOG"
}

nightly_restore_project_hooks() {
  [ -n "${HOOKS_FILE:-}" ] && [ -n "${HOOKS_BACKUP:-}" ] && [ -f "$HOOKS_BACKUP" ] \
    && mv "$HOOKS_BACKUP" "$HOOKS_FILE" 2>>"$LOG" || true
}
