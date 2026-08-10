#!/bin/bash
# 每天 10:00（launchd）无人值守晨间任务：
#   1) 审查昨晚 base=feature/agent 的新 PR，按闸门自动合并 / 改后合并 / 重大留人；
#   2) 生成今日 2 张候选选题卡，写入 today-pick.md（STATUS: WAITING）并邮件发给 owner。
# 只动 feature/agent，绝不 push main、绝不发 prod。闸门与测试门禁见下方 prompt。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # launchd 默认 C locale，防中文标点被吞进变量名

CODEX="${PAPER_CODEX:-/Users/huangnanqi/.npm-global/bin/codex}"
REPO="/Users/huangnanqi/CursorProjects/paper-reading-app"
STATE_DIR="$HOME/.claude/paper-loop"
LOG="$HOME/.claude/codex-paper-morning.log"
TODAY=$(date +%F)
TOKEN=$(openssl rand -hex 3)

PICK="$STATE_DIR/today-pick.md"
CARDS="$STATE_DIR/cards-$TODAY.md"
REVIEW_SUMMARY="$STATE_DIR/review-$TODAY.md"

mkdir -p "$STATE_DIR"
echo "[$(date)] === 晨间任务 $TODAY (token:$TOKEN) ===" >> "$LOG"
cd "$REPO" || { echo "[$(date)] repo 不存在" >> "$LOG"; exit 1; }

# --- git 同步：用确定性对账器 sync-knowledge.sh 提交 .wolf 噪声 + 合并夜间 agent 提交
# （union 合 md、jq 按 .id 去重 buglog.json），绝不 reset/丢提交。合完立即推送，
# 让本地==远端后再进模型阶段——否则未推送的 .wolf 快照会在模型合 PR 时与远端分叉、
# 逼出 reset --hard 丢记账（2026-07-21 复现过）。---
git fetch origin >> "$LOG" 2>&1
git checkout feature/agent >> "$LOG" 2>&1
bash "$REPO/.wolf/sync-knowledge.sh" >> "$LOG" 2>&1 || echo "[$(date)] sync-knowledge 未完成（可能有非 .wolf 改动），见 log" >> "$LOG"
git push origin feature/agent >> "$LOG" 2>&1 || echo "[$(date)] pre-morning .wolf 推送未成功，下次同步兜底" >> "$LOG"

# --- Phase 1：审查 + 按闸门处置昨晚新 PR ---
BEFORE_HEAD=$(git rev-parse HEAD)   # 用于 Phase1 后判断是否合入了后端改动（见 paper-dev-reload.sh）
rm -f "$REVIEW_SUMMARY"
"$CODEX" exec -C "$REPO" --dangerously-bypass-approvals-and-sandbox --ephemeral "你是 paper-reading-app 的夜间 PR 处理员。处理 base=feature/agent 的 open PR（重点是最近 24h 新建的）。全程只动 feature/agent，绝不 push main、绝不发 prod。

步骤：
1. git fetch；用 \`gh pr list --state open --base feature/agent --json number,title,headRefName,createdAt\` 列出待处理 PR。若无，把「无待处理 PR」写入 ${REVIEW_SUMMARY} 后结束。
2. 逐个 PR：checkout 其分支，结合仓库真实代码做完整审查（正确性 / 回归 / 安全 / 是否违反 .wolf/cerebrum.md 的 Do-Not-Repeat 与约定）。
3. 按闸门处置：
   - 审查无阻断问题 → 跑测试：\`.venv/bin/python -m pytest tests/ -q\` 以及相关 \`node --test tests/frontend/*.test.js\`；全绿 → \`gh pr merge <n> --squash --delete-branch\`。
   - 有可修的小问题 → 在该 PR 分支上直接改，commit & push 到同分支，重跑测试；全绿再 --squash 合并。
   - 重大问题（设计取舍 / 安全 / 测试反复修仍红 / 需人判断）→ 不合并，留 OPEN，用 \`gh pr comment\` 留一条中文说明原因。
4. 每个 PR 合并后必须完成**选题状态对账**：切回并同步最新 \`feature/agent\`，按合并 PR 的标题、正文（\`Backlog: OPT-NNN\`）和合并提交核实对应条目；将已实现的 OPT 在 \`optimization/triage.md\` 和 \`optimization/backlog.md\` 标为 \`done\`，写入 PR/commit 证据。若没有对应 OPT，不要臆造条目。把这次对账作为独立 \`chore(triage): reconcile morning merges ${TODAY}\` 提交推送到 \`feature/agent\`，再继续；绝不能让已合并条目仍以 \`in-progress\` 进入候选卡。
5. 把每个 PR 的处置结论（编号 / 标题 / 合并|改后合并|留OPEN+原因 / 测试结果）汇总成中文，用 apply_patch 写入 ${REVIEW_SUMMARY}。
6. 合并完切回 feature/agent，运行 \`bash .wolf/sync-knowledge.sh\` 同步远端（它会确定性合并 .wolf 知识文件：union 合 md、jq 按 .id 去重 buglog.json）。**严禁用 \`git reset --hard\` 或 \`git rebase\` 去解 .wolf 冲突，严禁丢弃任何本地 .wolf 提交**——.wolf 的一切冲突一律交给 sync-knowledge.sh。
断言任何「已合并 / 测试通过」前必须真实执行核实，不要臆造。" \
   >> "$LOG" 2>&1

echo "[$(date)] Phase1(审查合并) 结束" >> "$LOG"

# 合入的后端改动要重启 dev 才生效（静态前端文件不用）。确定性地回到 feature/agent 同步再判断。
git checkout feature/agent >> "$LOG" 2>&1 || true
bash "$REPO/.wolf/sync-knowledge.sh" >> "$LOG" 2>&1 || echo "[$(date)] Phase1 后 sync-knowledge 未完成，见 log" >> "$LOG"
bash "$HOME/.claude/scripts/paper-dev-reload.sh" "$BEFORE_HEAD" "$LOG"

# --- Phase 2：生成今日 2 张候选卡（复用『开始今天的工作』钩子的选题逻辑）---
# 幂等：今天已生成过就不覆盖（防 launchd 重复触发）
if [ -f "$PICK" ] && grep -q "^DATE: $TODAY" "$PICK"; then
    echo "[$(date)] 今日卡片已存在，跳过 Phase2 生成" >> "$LOG"
else
    rm -f "$CARDS"
    "$CODEX" exec -C "$REPO" --dangerously-bypass-approvals-and-sandbox --ephemeral "开始今天的工作

候选前的硬性对账：先 \`git fetch origin feature/agent\` 并同步到最新 \`feature/agent\`；读取 \`optimization/roadmap.md\`、\`optimization/triage.md\`、\`optimization/backlog.md\`，并读取 \`$HOME/.claude/product-owner-latest.md\`（若存在）和 \`$HOME/.claude/weekly-reports/\` 下最新一份周报（若存在）。周一焦点、roadmap 与周报是候选优先级的参考：优先选择能推进本周唯一焦点、回应上周待改进点或验证周报信号的条目；在卡片的「价值」中说明这种关联。它们不是完成状态的证据，不能据此复活已完成工作。

再用 \`gh pr list --state all --base feature/agent\` 和最近合并提交核实。候选只能来自当前仍未完成的 \`new\` 或 \`triaged\` 条目。**绝不能**把 \`done\`、\`in-progress\`、已有 open PR、已合并 PR 或当前代码已经实现的条目写入候选卡；文档状态与代码/PR 证据冲突时，以 GitHub 已合并 PR 和当前代码为准并排除该条目。写卡前逐一复核两个编号均满足这些条件；若只剩一个合格项，只写一张卡，不得用已完成项凑数。

额外要求（不写应用代码、不做深度调研，只在按流程选出最多 2 张卡片后）：把最终候选卡片用 apply_patch 写入文件 ${CARDS}。有两个合格项时严格用如下两张格式；只有一个时只写卡片①，绝不伪造卡片②（不要写别的）：
## 卡片①
编号: <OPT/E 编号>
标题: <标题>
优先级·复杂度: <P?·S/M/L>
价值: <一句话>

## 卡片②
编号: ...
标题: ...
优先级·复杂度: ...
价值: ...

写完即停。" \
       >> "$LOG" 2>&1

    # 用脚本拼装机器可读表头（TOKEN/STATUS/CHOICE 由脚本掌控，不交给模型）
    if [ -s "$CARDS" ]; then
        {
            echo "DATE: $TODAY"
            echo "TOKEN: $TOKEN"
            echo "STATUS: WAITING"
            echo "CHOICE:"
            echo "---"
            cat "$CARDS"
        } > "$PICK"
        echo "[$(date)] 今日卡片已写入 $PICK" >> "$LOG"
    else
        echo "[$(date)] 警告：未生成 cards 文件，Phase2 失败" >> "$LOG"
    fi
fi

# --- 邮件：先发选题卡（要 owner 回复 1/2/both），再附 PR 处置摘要 ---
# token 以 pick 文件为单一真源（幂等跳过 Phase2 时仍与 reader 一致）
EMAIL_TOKEN=$(grep -m1 '^TOKEN:' "$PICK" 2>/dev/null | awk '{print $2}')
[ -n "$EMAIL_TOKEN" ] || EMAIL_TOKEN="$TOKEN"
FOCUS=$(bash "$HOME/.claude/scripts/paper-owner-focus.sh" "$REPO" 2>/dev/null)
BODY="$STATE_DIR/morning-mail-$TODAY.md"
{
    if [ -n "$FOCUS" ]; then
        echo "📌 本周焦点（待你亲自做，不进卡片流也别忘了）："
        echo "$FOCUS" | sed 's/^/   · /'
        echo
        echo "----------------------------------------"
    fi
    if [ -s "$PICK" ]; then
        echo "【今日 2 张候选选题卡】回复本邮件，正文首行写 1 / 2 / both 即可让它自动实现："
        echo
        sed '1,5d' "$PICK"   # 去掉机器表头，只发卡片正文
        echo
    fi
    echo "----------------------------------------"
    echo "【昨晚 PR 处置摘要】"
    if [ -s "$REVIEW_SUMMARY" ]; then cat "$REVIEW_SUMMARY"; else echo "（无摘要，见 paper-morning.log）"; fi
} > "$BODY"

# 发信（send-email.py 内部已重试 4 次应对 SMTP 偶发断连）。若仍失败（如代理出口封 SMTP），
# 改走 Bark 推送兜底——至少让 owner 第一时间看到今日选题卡，不至于两眼一抹黑。
if /usr/bin/python3 "$HOME/.claude/scripts/send-email.py" \
    --subject "今日选题 · ${TODAY} · paper-reading-app｜回复 1 / 2 / both （token:${EMAIL_TOKEN}）" \
    --body-file "$BODY" >> "$LOG" 2>&1; then
    echo "[$(date)] 晨间邮件已发" >> "$LOG"
else
    echo "[$(date)] 晨间邮件发送失败（4 次重试后仍失败）→ 改走 Bark 兜底" >> "$LOG"
    BARK_BODY="邮件发不出(疑代理封SMTP)。token:${EMAIL_TOKEN}
$(sed '1,5d' "$PICK" | grep -E '^编号|^标题' | paste -d' ' - - 2>/dev/null | head -4)
回信可能也读不到——想做就进项目用 /loop 选。"
    bash "$HOME/.claude/scripts/bark-push.sh" "📋 今日选题（邮件失败）" "$BARK_BODY" >> "$LOG" 2>&1 || true
fi

# 把本地 .wolf 快照推回，避免 pre-morning snapshot 日积月累堵塞次日 pull（best-effort）
git -C "$REPO" push origin feature/agent >> "$LOG" 2>&1 || echo "[$(date)] push 未成功（可能远端已更新），下次同步兜底" >> "$LOG"

echo "[$(date)] 晨间任务完成。" >> "$LOG"
