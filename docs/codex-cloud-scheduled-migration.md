# Codex Cloud Scheduled 夜间 Agent

## 目标架构

Claude Routine 的三个远程 Agent 迁移为 ChatGPT/Codex **Scheduled + Cloud** 任务。业务规则集中在仓库 Skill `$nightly-product-agents`；Scheduled 只负责执行时间和 phase 参数。

Cloud 任务必须关联 GitHub 仓库 `cherrycherryxi/paper-reading-app`，以 `feature/agent` 为工作分支。禁止使用 Local 或 Worktree 执行环境，否则任务仍依赖本机开机和桌面端运行。

## Cloud Environment

在 Codex Cloud Environment 中设置：

- Repository: `cherrycherryxi/paper-reading-app`
- Base branch: `feature/agent`
- Setup script: `bash scripts/codex/cloud-setup.sh`
- Agent internet access: 仅允许 GitHub；若原生 GitHub 工具已提供提交与 PR 能力，无需开放额外域名
- Secrets: 不配置生产凭据、DeepSeek/Baidu OCR 密钥或 Bark URL

首次创建环境后，手动运行一次以下只读检查：

```bash
.venv/bin/python -m pytest tests/agent/codex_cloud_scheduled_test.py -v
node --test tests/frontend/*.test.js
```

## Scheduled Tasks

三个任务均选择独立运行、Cloud 环境、仓库 `paper-reading-app`。任务逻辑通过 GitHub 状态幂等，不使用本机 `.done` 文件。

### 01:00 Triage

```text
Use $nightly-product-agents with phase=triage for paper-reading-app. Work against the latest origin/feature/agent, use Asia/Shanghai as RUN_DATE, and return the required Chinese completion summary with a durable GitHub artifact.
```

### 04:00 Implement

```text
Use $nightly-product-agents with phase=implement for paper-reading-app. Work against the latest origin/feature/agent, implement only today's assigned Next up item, and open but never merge a PR targeting feature/agent. Return the required Chinese completion summary with the PR URL.
```

### 05:00 Explore

```text
Use $nightly-product-agents with phase=explore for paper-reading-app. Work independently of the Implement result against the latest origin/feature/agent, use Asia/Shanghai as RUN_DATE, and return the required Chinese completion summary with a durable GitHub artifact.
```

## 切换步骤

1. 创建 Cloud Environment，并通过只读检查。
2. 创建三个 Scheduled 任务，先保持暂停。
3. 分别手动运行一次，确认 Triage 有远端提交、Implement 有 PR、Explore 有远端提交或合法幂等跳过。
4. 暂停三个本地 `com.huangnanqi.paper-codex-nightly-*` LaunchAgent。
5. 启用三个 Cloud Scheduled 任务，观察连续两个夜晚。
6. 两晚均成功后卸载本地 LaunchAgent；plist 与 shell 保留一个发布周期作为回滚材料。

任何阶段失败都不得由下一阶段静默兜底。Explore 不依赖 Implement；失败详情应保留在 Scheduled run 中。
