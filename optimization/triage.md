# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-07

## Next up

**OPT-025 — agent_trace_events 缺 trace_id 索引（P1 / S）**

`init_db()` 的 OPT-017 补丁（`app_server.py:501-508`）为 `model_logs`、`agent_traces`、`agent_actions`、`agent_metrics` 各加了索引，但遗漏了 `agent_trace_events` 表。`get_trace()`（`app_server.py:2645`）执行 `WHERE trace_id = ? ORDER BY created_at ASC`，是对无索引表的全扫。Plus 用户一年后该表超 25 万行，每次 trace 详情加载全扫。

修复：在 `app_server.py:509`（executescript 结束 `"""` 之前）追加一行：
`CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON agent_trace_events(trace_id, created_at);`

零 schema 变更，零接口变更，幂等（`IF NOT EXISTS`），下次启动自动建好。全部高优先级项（OPT-022/028/029/030）均已有 open PR，此项是下一个可领取的最高价值任务。
Key files: `app_server.py:421`（表定义）、`app_server.py:501-509`（索引块，加在 509 之前）、`app_server.py:2645`（热查询路径）。

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-028 | /debug/* 端点默认对所有人开放 | P0 | S | in-progress (PR #26) | PR open. `_authorized_for_admin()` 改为未设 ADMIN_TOKEN 时仅允许 loopback（127.0.0.1）。解决了默认部署下所有用户私信完全公开的 P0 安全漏洞。 |
| OPT-025 | agent_trace_events 缺 trace_id 索引 | P1 | S | triaged | **Next up.** `app_server.py:509` 追加 `CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON agent_trace_events(trace_id, created_at)`. OPT-017 同类遗漏，零风险，下次启动自动建好。 |
| OPT-029 | execute_action() 非原子读改写 | P1 | M | in-progress (PR #27) | Layer A. `BEGIN IMMEDIATE` 包裹读改写周期，序列化并发审批，防止双标签页静默丢弃变更。`app_server.py:2956-3080`. |
| OPT-030 | 跨设备 state 整体覆盖（乐观锁 Layer B / E35） | P1 | M | in-progress (PR #29) | Layer B. `updated_at` 版本号 + `PUT /api/state` 条件保存 + 409 冲突 toast。`app_server.py` + `app.js` + `chat.js`. |
| OPT-022 | 登录/注册端点无限速 | P1 | M | in-progress (PR #28) | IP 维度限速，复用 `check_and_record_rate_limit`（`app_server.py:1462`）；`login`/`register`/`password/reset-request` 三端点均无限速。`app_server.py:3889, 3939, 4015`. |
| OPT-016 | 非 AI 摘抄 OCR 快路径（百度云 OCR） | P1 | L | in-progress | 代码已完成（21 测试全绿）。**阻塞**：owner 待配置百度 API key 并真机端到端验证。Agent2 无法推进。 |
| OPT-026 | 书单卡片 ··· 按钮可见性 | P2 | S | triaged | `styles.css:1276` `.card-menu-btn` 无背景/无边框/低对比，无 affordance。加半透明圆形背景 + 提高对比 + hover 反馈。注意用 `var(--color-*)` token 兼容暗色模式。 |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | 入口仅在「我的」抽屉（`index.html:306`）。在书单页 `#openBookDialogBtn` 旁加「批量导入」二级入口，复用现有 `importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-027 | 卡片操作入口三页不统一 | P2 | M | triaged | **需 owner 定方向**（A=全部溢出菜单 / B=全部内联按钮）后再动 `app.js` 三个 render 路径 + styles。阻塞于决策，Agent2 不可领取。 |
| OPT-030 | *(see above)* | | | | |
| OPT-029 | *(see above)* | | | | |
| OPT-028 | *(see above)* | | | | |
| OPT-024 | ActionExecutor datetime 排序 bug | P1 | S | done | Merged PR #25 (2026-06-07). 7× `datetime.now().isoformat()` → `utc_now_iso()` in `app_server.py:2971-3074`. |
| OPT-023 | /media/ CORS 通配符移除 | P0 | S | done | Merged PR #24. `app_server.py:3509` 删 1 行 + `media_cors_test.py` 5 例守卫。 |
| OPT-022 | *(see above)* | | | | |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done | Merged PR #21. ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`. |
| OPT-020 | PromptBuilder 注入无关 existing_connections | P1 | S | done | Merged PR #22. `[] if book_id else …[:20]`. |
| OPT-019 | Toast 缺少 aria-live（WCAG 4.1.3 AA） | P1 | S | done | Merged PR #23. |
| OPT-018 | CSS 动画缺少 prefers-reduced-motion（WCAG 2.2.2 A） | P1 | S | done | Merged PR #23. |
| OPT-017 | model_logs/agent_traces 缺 user_id 索引 | P1 | S | done | Merged PR #19. |
| OPT-013 | 按钮缺 :focus-visible（WCAG 2.4.7 AA） | P1 | S | done | Merged PR #23. |
| OPT-012 | call_deepseek() 无重试逻辑 | P1 | S | done | Merged PR #18. |
| OPT-011 | HTML 响应缺少安全头 | P1 | S | done | Merged PR #20. |
| OPT-015 | 摘抄卡面 UI 优化 | P2 | M | done | Merged PR #16. |
| OPT-014 | OCR 摘抄卡排序 bug | P1 | S | done | commit e9bdba9. |
| OPT-010 | GC 函数从未调用 | P1 | S | done | Merged PR #13. |
| OPT-009 | _read_json() 无请求体大小上限 | P0 | S | done | Merged PR #12. |
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | done | Merged PR #11. |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Merged PR #10. |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Merged PR #9. |
| OPT-004 | 桌面端基础适配 | P2 | L | done | commit b5bebb1. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | done | commit 8874de3. |
| OPT-002 | 「书单」加书支持拍照 OCR | P1 | M | done | Merged PR #17. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
