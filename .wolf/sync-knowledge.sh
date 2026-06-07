#!/usr/bin/env bash
# .wolf/sync-knowledge.sh
#
# 在「开始今天的工作」时运行，把夜间云端 agent（Agent1 triage / Agent2 / Agent3
# 及其 chore(wolf) wrap-up）推送的提交拉下来，并自动解掉 OpenWolf 知识文件的冲突：
#   - memory.md / cerebrum.md / anatomy.md : union 合并（见 .gitattributes，两边新增都保留）
#   - buglog.json                          : 按 .id 去重合并 bug 数组（jq）
#
# 设计原则（吸取此前手解冲突的教训）：
#   * 绝不 auto-stash（曾导致连环冲突）；非 .wolf 改动一律停手让人处理。
#   * 只对 .wolf 知识文件做自动化；代码/其它文件不碰。
#   * 离线 / 已最新 / detached 等情况安全跳过，不阻塞。
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "不在 git 仓库内，跳过"; exit 0; }
cd "$root" || exit 0
branch=$(git symbolic-ref --short HEAD 2>/dev/null) || { echo "detached HEAD，跳过同步"; exit 0; }

git fetch -q origin "$branch" 2>/dev/null || { echo "⚠️ git fetch 失败（离线？），跳过同步"; exit 0; }

if git merge-base --is-ancestor "origin/$branch" HEAD 2>/dev/null; then
  echo "✅ 本地已是最新，无需同步"; exit 0
fi

# --- 清理工作区：只自动提交未提交的 .wolf 知识文件（hook 噪音），其它一律停手 ---
knowledge=".wolf/memory.md .wolf/anatomy.md .wolf/buglog.json .wolf/cerebrum.md"
non_wolf=$(git status --porcelain | grep -vE '^.. \.wolf/(memory|anatomy|buglog|cerebrum)\.(md|json)$' || true)
if [ -n "$non_wolf" ]; then
  echo "⚠️ 工作区有非 .wolf 改动，请先提交/丢弃再同步："
  echo "$non_wolf"
  exit 1
fi
if [ -n "$(git status --porcelain -- $knowledge 2>/dev/null)" ]; then
  git add $knowledge
  git commit -q -m "chore(wolf): pre-sync knowledge snapshot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  echo "已提交本地 .wolf 暂存改动（pre-sync snapshot）"
fi

# --- 合并夜间提交：.gitattributes 的 union 自动解三个 markdown 文件 ---
if git merge --no-edit "origin/$branch" 2>/dev/null; then
  echo "✅ 已同步夜间 agent 改动（union 自动合并知识文件）"
  exit 0
fi

# --- 此时应只剩 buglog.json 冲突 → 按 .id 去重合并 bug 数组 ---
if git diff --name-only --diff-filter=U | grep -qx '.wolf/buglog.json'; then
  git show :2:.wolf/buglog.json > /tmp/wolf_ours.json 2>/dev/null || echo '{"bugs":[]}' > /tmp/wolf_ours.json
  git show :3:.wolf/buglog.json > /tmp/wolf_theirs.json 2>/dev/null || echo '{"bugs":[]}' > /tmp/wolf_theirs.json
  if command -v jq >/dev/null 2>&1 && \
     jq -s '{bugs: (((.[0].bugs // []) + (.[1].bugs // [])) | unique_by(.id))}' \
        /tmp/wolf_ours.json /tmp/wolf_theirs.json > .wolf/buglog.json 2>/dev/null; then
    git add .wolf/buglog.json
    echo "已按 .id 去重合并 buglog.json"
  fi
fi

remaining=$(git diff --name-only --diff-filter=U)
if [ -n "$remaining" ]; then
  echo "⚠️ 仍有冲突需手动解决（已超出自动化范围）："
  echo "$remaining"
  echo "（可 git merge --abort 退回）"
  exit 1
fi
git commit --no-edit -q
echo "✅ 已同步夜间 agent 改动（buglog 按 id 去重）"
