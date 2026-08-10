#!/usr/bin/env bash
# 生产发布 hook：根据本次 Prod 版本与上一版本的提交记录生成更新说明。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
BASE="${1:?用法: release-hook.sh <base-sha> <target-sha> [output-file]}"
TARGET="${2:?用法: release-hook.sh <base-sha> <target-sha> [output-file]}"
OUT="${3:-}"

cd "$ROOT"
if [ -z "$OUT" ]; then
  OUT="docs/releases/$(date +%Y-%m-%d)-${TARGET:0:8}.md"
fi
mkdir -p "$(dirname "$OUT")"

TARGET_SUBJECT="$(git show -s --format=%s "$TARGET")"
TARGET_DATE="$(git show -s --format=%cs "$TARGET")"
COMMIT_COUNT="$(git rev-list --count "$BASE..$TARGET")"
STAT="$(git diff --stat "$BASE..$TARGET")"
FILES="$(git diff --name-status "$BASE..$TARGET")"
COMMITS="$(git log --no-merges --format='%h%x1f%s%x1f%b%x1e' "$BASE..$TARGET")"

export RELEASE_DATE="$TARGET_DATE" RELEASE_TARGET="$TARGET" RELEASE_BASE="$BASE" \
  RELEASE_COUNT="$COMMIT_COUNT" RELEASE_SUBJECT="$TARGET_SUBJECT" RELEASE_STAT="$STAT" \
  RELEASE_FILES="$FILES" RELEASE_COMMITS="$COMMITS"

python3 - "$OUT" <<'PY'
import os
import pathlib
import re
import sys

out = pathlib.Path(sys.argv[1])

def env(name):
    return os.environ.get(name, "")

internal_prefixes = ("chore", "docs", "test", "ci", "build", "refactor")
user_changes, maintenance = [], []
for record in env("RELEASE_COMMITS").split("\x1e"):
    parts = record.strip().split("\x1f", 2)
    if len(parts) < 2:
        continue
    sha, subject = parts[:2]
    body = parts[2].strip() if len(parts) > 2 else ""
    title = re.sub(r"^[a-z]+(?:\([^)]*\))?!?:\s*", "", subject, flags=re.I)
    item = (sha, subject, title, body)
    if subject.lower().startswith(internal_prefixes):
        maintenance.append(item)
    else:
        user_changes.append(item)

def summary(body):
    # Commit/PR 正文是唯一可用证据；保留前几段，不用标题臆测用户场景。
    text = re.sub(r"\n{3,}", "\n\n", body).strip()
    text = re.sub(r"(?m)^\s*(?:#{1,6}|[-*])\s*(?:tests?|验证|test results?)\b.*$", "", text, flags=re.I)
    return text[:900].rstrip()

blocks = []
for sha, subject, title, body in user_changes:
    detail = summary(body)
    blocks.append(f"### {title}\n\n"
                  f"**本次变化**：{subject}。\n\n"
                  f"**实现依据**：{detail if detail else '提交未提供正文说明；请查看提交和下方文件清单。'}\n\n"
                  f"**发布结果**：已随本版本进入生产；接口与公网入口由发布脚本校验。\n\n"
                  f"_追溯：`{sha}`_")
change_details = "\n\n".join(blocks) or "本次没有面向用户的功能提交；仅包含维护性变更。"
commit_list = "\n".join(f"- `{sha}` {subject}" for sha, subject, _, _ in user_changes) or "- 无"
maintenance_list = "\n".join(f"- `{sha}` {subject}" for sha, subject, _, _ in maintenance) or "- 无"

out.write_text(f"""# 生产版本更新说明

> 发布日期：{env('RELEASE_DATE')}  
> 版本提交：`{env('RELEASE_TARGET')}`  
> 上一版本：`{env('RELEASE_BASE')}`  
> 本次提交数：{env('RELEASE_COUNT')}

## 一句话概览

本次发布包含 {len(user_changes)} 项面向用户的变化和 {len(maintenance)} 项维护性变更。以下内容只陈述提交正文和代码范围能够支持的事实。

## 解决了什么问题

- 面向用户的提交：
{commit_list}

## 新功能与改进

### 变更明细

{change_details}

### 内部维护（不作为新功能宣传）

{maintenance_list}

### 实现与质量保障

- 代码变更统计：

```text
{env('RELEASE_STAT')}
```

- 变更文件：

```text
{env('RELEASE_FILES')}
```

## 最终效果与验证

- 发布目标：生产环境 `main` 指针。
- 服务动作：Prod 工作树快进更新后重启现有服务。
- 发布前必须通过项目的前端和 Python 回归测试；发布后必须检查本地 Prod 接口与公网入口。

## 影响范围

- 前端：以变更文件列表为准。
- 后端/API：以变更文件列表为准。
- 数据迁移：本次发布脚本不会主动修改生产数据库；如提交包含迁移，需在这里补充迁移说明。

## 回滚信息

如需回滚，将生产代码快进/切换回上一版本 `{env('RELEASE_BASE')}`，然后重启 Prod 服务；生产数据库和用户上传文件不会被发布脚本删除。

## 发布记录

- 生成方式：`scripts/codex/release-hook.sh`
- 本文档由生产发布 hook 自动生成；发布后可人工补充「面向用户的变化」中的业务描述。
""", encoding="utf-8")
PY
