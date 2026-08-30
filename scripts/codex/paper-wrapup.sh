#!/bin/bash
# 每天 23:30（launchd）有条件自动收工日报：
#   - 今日日报已存在（owner 手动跑过『今天就到这』）→ 只补发邮件后跳过；
#   - 检测到活跃的交互式 claude 会话（owner 可能还在工作）→ 跳过，不打断；
#   - 两者都没有 → 让 headless 模型把【完整日报作为回复正文】输出，脚本捕获 stdout 后
#     自己写文件（确定性；不依赖模型主动 Write，也【不用 git-log 兜底】——bug-535 教训）。
# 补漏/补发同样只用模型或补发已生成文件，绝不用 git-log 拼报告。
set -uo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # launchd 默认 C locale

# 这些可用 PAPER_WRAPUP_* 环境变量覆盖（仅供测试注入 mock；生产默认值不变）。
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
RUNNER="${PAPER_WRAPUP_RUNNER:-$SCRIPT_DIR/../agent/agent-runner.sh}"
PROVIDER="${PAPER_WRAPUP_PROVIDER:-claude-deepseek}"
REPO="${PAPER_WRAPUP_REPO:-/Users/huangnanqi/CursorProjects/paper-reading-app}"
LOG="${PAPER_WRAPUP_LOG:-$HOME/.claude/agent-paper-wrapup.log}"
LOGDIR="${PAPER_WRAPUP_LOGDIR:-$HOME/.claude/daily-logs}"
EMAIL_SCRIPT="${PAPER_WRAPUP_EMAIL:-$HOME/.claude/scripts/send-email.py}"
BARK="${PAPER_WRAPUP_BARK:-$HOME/.claude/scripts/bark-push.sh}"
TODAY=$(date +%F)
DAILY="$LOGDIR/$TODAY.md"
MARK="$LOGDIR/.emailed-$TODAY"

echo "[$(date)] === 收工检查 $TODAY ===" >> "$LOG"

# 便携超时（macOS 无 timeout/gtimeout）：run_timeout <秒> <命令...>；超时由 SIGALRM 终止。
run_timeout() { perl -e 'alarm shift @ARGV; exec @ARGV or exit 127' "$@"; }

# 用模型为某一天生成日报，捕获其 stdout 写入文件。确定性关键：文件由【脚本】写，不押在模型
# 肯不肯用 Write 上；内容仍是模型真实分析（git log 只作模型的输入数据，不是最终报告）。
# 用法：gen_report <YYYY-MM-DD> <outfile>；写出合格日报→0，模型没产出合格日报→1（调用方告警，不 git 兜底）。
gen_report() {
    local day="$1" out="$2" raw report
    local recent_log
    recent_log=$(git -C "$REPO" log --all --since="${day} 00:00" --until="${day} 23:59" \
        --pretty='- %h %s' | head -120)
    local prompt="你是 paper-reading-app 的收工助手，请回顾 ${day} 这一天的工作后写一份中文 Markdown 日报。
外层确定性脚本已获取当天所有分支的提交，不要调用 Bash：
${recent_log}

结合这些提交和仓库文件理解到底做了什么。
日报结构：第一行标题 '# 日报 ${day}'，第二行 '项目：paper-reading-app'，随后三节——
① 今日主要工作：每个 bug 修复 / 新功能各写成一个 '### <条目标题>' 小节，每个小节按四点写清（每点用加粗小标题、各占一行，便于阅读）：**存在的问题**（触发的现象或为什么要做）、**目标**（想达到什么）、**实现方法**（怎么做的 + 关键文件/改动）、**最终效果**（做完后可验证的结果）。
② 亮点与可改进 ③ 明天可做的 3-5 条具体事项。
整体写得易读：多用小标题和要点列表，别堆成大段文字。
硬性要求：把【完整日报】放在各自单独成行的 <<<REPORT_START>>> 与 <<<REPORT_END>>> 两个标记之间，
输出在你的回复正文里。不要用 Write 或任何工具写文件，只在正文输出，标记之间只放日报本身。"
    raw=$(run_timeout 600 "$RUNNER" \
        --provider "$PROVIDER" \
        --cwd "$REPO" \
        --mode read-only \
        --model-tier flash \
        --effort low \
        --task paper-wrapup \
        --allowed-tools "Read,Glob,Grep" \
        --prompt "$prompt" 2>>"$LOG")
    # 优先取标记之间；模型漏标记时退而取从 '# 日报' 标题到结尾（仍是模型内容，非 git 兜底）。
    report=$(printf '%s\n' "$raw" | awk '/<<<REPORT_START>>>/{f=1;next} /<<<REPORT_END>>>/{f=0;next} f')
    [ -z "$report" ] && report=$(printf '%s\n' "$raw" | sed -n '/# *日报/,$p')
    if [ -n "$report" ] && printf '%s' "$report" | grep -q "日报 ${day}" \
           && [ "$(printf '%s' "$report" | wc -c | tr -d ' ')" -ge 200 ]; then
        printf '%s\n' "$report" > "$out"
        echo "[$(date)] 日报已由脚本捕获模型输出写入：${out}（$(wc -c < "$out" | tr -d ' ') 字节）" >> "$LOG"
        return 0
    fi
    return 1
}

# 发邮件（带超时防 SMTP 卡死），成功才打 marker（幂等）。用法：send_report <date> <file> <marker> [主题前缀]
send_report() {
    local day="$1" file="$2" mark="$3" pfx="${4:-自动日报}"
    if run_timeout 90 /usr/bin/python3 "$EMAIL_SCRIPT" \
            --subject "${pfx} · ${day} · paper-reading-app" --body-file "$file" >> "$LOG" 2>&1; then
        touch "$mark"; echo "[$(date)] 邮件已发送：${day}" >> "$LOG"; return 0
    fi
    echo "[$(date)] 邮件发送失败：${day}，见 log。" >> "$LOG"; return 1
}

alert() {
    bash "$BARK" "$1" "$2" "paper-wrapup" "timeSensitive" >> "$LOG" 2>&1 || true
}

# --- 补漏/补发（最近 3 天，绝不用 git 兜底）---
#   * 有日报文件却没打过 marker → 补发邮件（处理「生成了但当晚邮件被打断」的丢件，07-19 类）。
#   * 没日报文件（当天因『仍在工作』被跳过）→ 用模型补生成一份真报告再发；模型失败则告警，不 git 兜底。
for _d in 1 2 3; do
    _DAY=$(date -v-${_d}d +%F 2>/dev/null || date -d "-${_d} day" +%F 2>/dev/null || true)
    [ -n "${_DAY:-}" ] || continue
    _DFILE="$LOGDIR/${_DAY}.md"; _DMARK="$LOGDIR/.emailed-${_DAY}"
    [ -f "$_DMARK" ] && continue
    if [ -f "$_DFILE" ]; then
        send_report "$_DAY" "$_DFILE" "$_DMARK" "自动日报（补发）"
    else
        echo "[$(date)] 补漏：${_DAY} 缺日报 → 模型补生成（不用 git 兜底）。" >> "$LOG"
        if gen_report "$_DAY" "$_DFILE"; then
            send_report "$_DAY" "$_DFILE" "$_DMARK" "自动日报（次日补）"
        else
            echo "[$(date)] 补漏失败：${_DAY} 模型未产出合格日报，按要求不 git 兜底，跳过。" >> "$LOG"
            alert "⚠️ 日报补漏失败" "paper-reading-app ${_DAY}：模型没吐出合格日报，未用 git 兜底。想要就手动补。"
        fi
    fi
done

# --- 今日：已手动写过 → 只确保发过邮件 ---
if [ -f "$DAILY" ]; then
    if [ ! -f "$MARK" ]; then
        echo "[$(date)] 今日日报已存在（手动写过）→ 补发邮件通知。" >> "$LOG"
        send_report "$TODAY" "$DAILY" "$MARK"
    else
        echo "[$(date)] 今日日报已存在且已发过邮件，跳过。" >> "$LOG"
    fi
    exit 0
fi

# --- 无手动日报 → 让模型生成今日日报（stdout 捕获，不 git 兜底）---
# [2026-07-29] 曾在此处先判断"是否仍在工作"（transcript 最近 30 分钟有无新消息），有则跳过、
# 不打断。但补漏循环（上面）用的是同一种独立 headless 调用、且不受此限制，天天在 owner 活跃时
# 跑都没出过问题——说明这个"不打断"顾虑对现在这种彻底独立于交互会话的后台调用已不成立。而
# owner 几乎每晚 23:00-23:30 都在用交互会话工作，导致"今日生成"夜夜被挡，只能靠隔天补漏追上，
# 形成永久慢一拍的循环（今日永远缺、补的永远是昨天）。见 buglog bug-548。现在与补漏循环一致，
# 无条件执行，不再检测活跃会话。
echo "[$(date)] 无手动日报 → 模型生成今日日报。" >> "$LOG"
if gen_report "$TODAY" "$DAILY"; then
    send_report "$TODAY" "$DAILY" "$MARK"
else
    echo "[$(date)] ⚠️ 模型未产出合格今日日报（疑 session limit / 无输出）。按要求不 git 兜底，仅告警。" >> "$LOG"
    alert "❌ 日报生成失败" "paper-reading-app ${TODAY}：模型没吐出合格日报（疑 session limit）。未用 git 兜底。想要就手动『今天就到这』重写。"
fi
echo "[$(date)] 完成。" >> "$LOG"
