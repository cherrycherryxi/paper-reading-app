# dsh 深度共读旁路

这里仅保存 DeepSeek Harness 的组合配置。主应用继续使用纯 Python 后端和原生
ES2020 前端，不引入 Node、TypeScript 或构建步骤。

运行时依赖两个本地进程：

1. `app_server.py`（8787）管理用户、研究任务、结果和审批；
2. `paper_reading_gateway.py`（8789）只向 dsh 暴露当前任务授权的只读 MCP 工具。

dsh 使用 Python SDK 的内置 runtime。此配置没有 Shell、文件系统、PTY、外网工具和
写入工具。Gateway bearer token 由主应用按任务生成，模型不可见 `user_id`。

在官方支持的平台安装：

```bash
.venv/bin/python -m pip install -r requirements-dsh.txt
```

该旁路默认关闭。仅在开发或隔离实验环境显式启用：

```bash
export DEEP_READING_ENABLED=1
```

未设置时，前端仍显示工作台入口和不可用原因，但不能创建任务。不要在 Prod 隐式设置。

当前项目开发机是 Intel macOS 13，而 rc6 的配套 runtime wheel 对该平台不可用。
生产式验证仍应放到官方支持的 macOS 14 arm64 环境，或封装为 Linux sidecar 服务。

开发机需要联调时，可以在 dsh 官方源码仓库构建单文件 JSONRPC runtime，并显式传入：

```bash
export DSH_RUNTIME_BIN=/absolute/path/to/dsh-jsonrpc-agent
```

需要调试源码入口时也可设置 `DSH_RUNTIME_ENTRY`，并用可选的 `DSH_NODE_BIN` 指定
Node。两种方式都只用于开发机。Node、TypeScript、dsh 源码和依赖均留在主仓库之外；
本项目没有新增 `package.json`、前端构建步骤或 Node 生产依赖。未配置这些变量时，
仍使用 SDK 自带的官方 runtime wheel。

2026-08-15 的真实联调已验证 V4 Pro 能执行 `tools/list` 和多次 `tools/call`，产出带
真实 evidence ID 的结果，并生成进入既有审批状态机的 proposal。配置必须保留两项
安全措施：根级 Tool Registry，以及 Runner 的 MCP discovery grace + `toolOrder` 强校验。
删除任一项都可能让首轮请求在空工具视图上运行。
