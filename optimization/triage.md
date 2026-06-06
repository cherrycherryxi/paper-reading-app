# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-06-06

## Next up

**OPT-024 — ActionExecutor datetime排序 bug（P1 / S）**

`ActionExecutor.execute_action()` 在 7 处（`app_server.py:2971, 2994, 3014, 3024, 3035, 3045, 3074`）仍调用 `datetime.now().isoformat()`，写入 naive 本地时间 + 微秒。OPT-014 已修复 OCR 路径、`utc_now_iso()`（line 285）已存在，但 ActionExecutor 路径漏修——任何用过 agent action（`add_note`/`add_book`/`summary`/`tag`/`question`/`link_thought`）的用户 agent 生成内容恒排在前面。修复方式与 OPT-014 完全一致：7 处 `datetime.now().isoformat()` → `utc_now_iso()`，零 schema 变更，零测试变更。Key files: `app_server.py:2971, 2994, 3014, 3024, 3035, 3045, 3074`.

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-024 | ActionExecutor datetime 排序 bug | P1 | S | triaged | 7× `datetime.now().isoformat()` → `utc_now_iso()` in `app_server.py:2955-3077`. 与 OPT-014 同根因、同修法，零风险。**→ Next up** |
| OPT-022 | 登录/注册端点无限速 | P1 | M | triaged | 复用 `check_and_record_rate_limit`（`app_server.py:1462`）以 username/IP 为 key；3 端点（line 3889/3939/4015）均无限速。需新增 IP 提取 + 失败计数维度。安全基线，M 复杂度。 |
| OPT-025 | agent_trace_events 缺 trace_id 索引 | P1 | S | triaged | 现有索引（`app_server.py:500-508`）遗漏 `agent_trace_events`；`get_trace()` line 2645 全扫。追加 1 条 `CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON agent_trace_events(trace_id, created_at)` 即可。OPT-017 同类遗漏。 |
| OPT-016 | 非 AI 摘抄 OCR 快路径 | P1 | L | in-progress | 代码已完成（云 OCR 百度 accurate_basic + Tesseract 回落，21 测试全绿）。**阻塞**：owner 待配置百度 API key 并真机端到端验证。Agent2 无法推进。 |
| OPT-026 | 书单卡片 ··· 按钮可见性 | P2 | S | triaged | `.card-menu-btn`（`styles.css:1276`）`background:none; border:none; color:var(--color-success-fg)`，无 affordance。加半透明圆形背景 + 提高对比 + hover 反馈。与 OPT-027 相关，可合并处理。 |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | 入口仅在「我的」抽屉（`index.html:306`）。在书单页 `#openBookDialogBtn` 旁加「批量导入」二级入口，复用现有 `importExcelInput` 处理逻辑。Touch: `index.html` only。 |
| OPT-027 | 卡片操作入口三页不统一 | P2 | M | triaged | 书单用 `···` 菜单，记录/摘抄用卡面内联按钮（`app.js:1029-1035` vs `1269/1338`）。**需 owner 定方向**（A=全统一到溢出菜单 / B=全统一到内联按钮）后再动 3 个 render 路径 + styles。 |
| OPT-023 | /media/ CORS 通配符移除 | P0 | S | done | Merged PR #24. `app_server.py:3509` 删 1 行 + `media_cors_test.py` 5 例守卫。 |
| OPT-022 | *(see above)* | | | | |
| OPT-021 | 暗色模式（系统跟随） | P1 | M | done | Merged PR #21. ~30 硬编码色 → 语义变量 + `@media (prefers-color-scheme: dark)`。 |
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
