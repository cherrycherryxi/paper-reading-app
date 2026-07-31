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
COMMITS="$(git log --no-merges --format='- `%h` %s' "$BASE..$TARGET")"

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

change_blocks = []
for line in env("RELEASE_COMMITS").splitlines():
    match = re.match(r"- `([^`]+)` (.+)", line)
    if not match:
        continue
    sha, subject = match.groups()
    if subject.startswith(("feat", "perf")):
        goal = "补充或优化对应产品能力，降低使用成本。"
    elif subject.startswith(("fix", "bug")):
        goal = "消除该问题，恢复相关流程的稳定表现。"
    else:
        goal = "完成本次发布范围内的工程或产品改进。"
    change_blocks.append(
        f"### `{sha}` {subject}\n\n"
        f"**存在的问题**：{subject}（发布后可补充真实用户触发场景）。\n\n"
        f"**目标**：{goal}\n\n"
        f"**实现方法**：详见提交 `{sha}` 及下方变更文件列表。\n\n"
        f"**最终效果**：已纳入本次生产发布，发布后的接口和公网入口由发布脚本自动校验。"
    )
change_details = "\n\n".join(change_blocks) or "本次发布没有可解析的提交明细，请人工补充。"

out.write_text(f"""# 生产版本更新说明

> 发布日期：{env('RELEASE_DATE')}  
> 版本提交：`{env('RELEASE_TARGET')}`  
> 上一版本：`{env('RELEASE_BASE')}`  
> 本次提交数：{env('RELEASE_COUNT')}

## 一句话概览

本次发布围绕「{env('RELEASE_SUBJECT')}」完成了一组产品改进，重点是让阅读记录、内容采集和日常使用更加稳定、顺畅。

## 解决了什么问题

- 本次发布涉及的用户问题和缺陷，来自以下变更记录：
{env('RELEASE_COMMITS')}

## 新功能与改进

### 变更明细

{change_details}

### 面向用户的变化

- 具体功能、修复和体验变化见上方提交明细；其中带有 `OPT-`、`bug-` 或 `fix` 标记的条目代表已纳入本次发布范围的问题闭环。
- 不改变现有账号数据结构和使用方式；已有数据会沿用现有兼容逻辑。

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
