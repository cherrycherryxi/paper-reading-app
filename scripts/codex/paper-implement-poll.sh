#!/bin/bash
# 每 30 分钟（launchd StartInterval 1800）轮询一次：
#   若今日 today-pick.md 仍 STATUS: WAITING，读 owner 回复邮件；选到了就 headless
#   深度调研并实现该卡、跑测试、开 PR（base feature/agent），完成后把 STATUS 置 DONE。
# 无状态、可反复触发：非 WAITING 秒退；没选到秒退。绝不发 prod。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # launchd 默认 C locale，防中文标点被吞进变量名

CODEX="${PAPER_CODEX:-/Users/huangnanqi/.npm-global/bin/codex}"
REPO="/Users/huangnanqi/CursorProjects/paper-reading-app"
STATE_DIR="$HOME/.claude/paper-loop"
PICK="$STATE_DIR/today-pick.md"
READER="$HOME/.claude/scripts/paper-pick-reader.py"
LOG="$HOME/.claude/codex-paper-implement-poll.log"

[ -f "$PICK" ] || exit 0
STATUS=$(grep -m1 '^STATUS:' "$PICK" | awk '{print $2}')
[ "$STATUS" = "WAITING" ] || exit 0   # 只在等待选择时才干活

CHOICE=$(/usr/bin/python3 "$READER" 2>>"$LOG")
[ -n "$CHOICE" ] || exit 0            # 还没回信

echo "[$(date)] 收到选择: ${CHOICE}，开始实现" >> "$LOG"
# 占位，防止下一次轮询重复触发
/usr/bin/sed -i '' "s/^STATUS:.*/STATUS: IMPLEMENTING/" "$PICK"
/usr/bin/sed -i '' "s/^CHOICE:.*/CHOICE: $CHOICE/" "$PICK"

cd "$REPO" || exit 1
git fetch origin >> "$LOG" 2>&1
git checkout feature/agent >> "$LOG" 2>&1
# 确定性对账 .wolf 知识文件（union 合 md、jq 去重 buglog）再推送，避免与远端分叉；绝不 reset。
bash "$REPO/.wolf/sync-knowledge.sh" >> "$LOG" 2>&1 || echo "[$(date)] sync-knowledge 未完成（可能有非 .wolf 改动），见 log" >> "$LOG"
git push origin feature/agent >> "$LOG" 2>&1 || echo "[$(date)] 轮询前 .wolf 推送未成功，下次同步兜底" >> "$LOG"
BEFORE_HEAD=$(git rev-parse HEAD)   # 用于事后判断是否合入了后端改动（见末尾 paper-dev-reload.sh）

case "$CHOICE" in
    both) WHICH="卡片① 和 卡片② 两张都实现（各开一个 PR）" ;;
    1)    WHICH="卡片①" ;;
    2)    WHICH="卡片②" ;;
esac

"$CODEX" exec -C "$REPO" --dangerously-bypass-approvals-and-sandbox --ephemeral "owner 已选定今日选题：${WHICH}。候选卡片详情见文件 ${PICK}。请完整实现：
1. 对选中项做深度调研：根因定位 + 方案取舍。
2. 改代码实现（遵循 .wolf/cerebrum.md 约定，写得像周围代码）。
3. 跑测试：\`.venv/bin/python -m pytest tests/ -q\` + 相关 \`node --test\`；必须全绿。
4. 开 PR：base 必须是 feature/agent，绝不 main、绝不发 prod。PR 描述写清动机与改动。
5. 【走完全程·上 dev】复审自己的改动，确认无阻断问题且测试全绿后，套用晨间闸门同样标准把 PR 合进 feature/agent：\`gh pr merge <n> --squash --delete-branch\`，随后 \`git checkout feature/agent && bash .wolf/sync-knowledge.sh\` 让 dev 立即生效。**严禁用 \`git reset --hard\` 或 \`git rebase\` 去解 .wolf 冲突、严禁丢弃本地 .wolf 提交**——.wolf 冲突一律交给 sync-knowledge.sh。绝不 push main、绝不发 prod（发版仍由 owner 手动）。
6. 全部完成后，用 sed 或 apply_patch 把 ${PICK} 里的 \`STATUS: IMPLEMENTING\` 改为 \`STATUS: DONE\`。
若测试反复修仍红或遇到需人判断的重大问题，不要硬合：把 PR 留 OPEN（不合并）、在 ${PICK} 追加一行 \`NEED-HUMAN: <原因>\`，并保持 STATUS: IMPLEMENTING。断言任何「已合并/测试通过」前先真实执行核实。" \
   >> "$LOG" 2>&1

echo "[$(date)] 实现流程结束，准备发邮件" >> "$LOG"

# 合入的后端改动要重启 dev 才生效（静态前端文件不用）。确定性地回到 feature/agent 同步再判断。
git checkout feature/agent >> "$LOG" 2>&1 || true
bash "$REPO/.wolf/sync-knowledge.sh" >> "$LOG" 2>&1 || echo "[$(date)] 实现后 sync-knowledge 未完成，见 log" >> "$LOG"
bash "$HOME/.claude/scripts/paper-dev-reload.sh" "$BEFORE_HEAD" "$LOG"

TODAY=$(date +%F)
BODY="$STATE_DIR/impl-mail-$TODAY.md"
{
    echo "今日选题（${CHOICE}）已实现：测试通过的已合入 feature/agent、dev 立即生效（prod 仍需 owner 手动发版）。"
    echo "如某项有需人工判断的问题，会保留为 OPEN PR 且下方状态含 NEED-HUMAN——请据此判断是否还有待办。"
    echo
    echo "--- today-pick 状态（STATUS: DONE=已合入 dev）---"
    cat "$PICK"
} > "$BODY"
/usr/bin/python3 "$HOME/.claude/scripts/send-email.py" \
    --subject "今日选题已实现 · $TODAY · paper-reading-app" \
    --body-file "$BODY" >> "$LOG" 2>&1 || true

echo "[$(date)] 完成。" >> "$LOG"
