# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-03T10:26:21.447Z
> Files: 204 tracked | Anatomy hits: 0 | Misses: 0

## ../../../

- `app.js` — Run an async save operation while disabling the submit button and showing a (~29741 tok)
- `chat.js` — els: normalizePreferredBookValue, activeBookId, updatePickerDisplay + 14 more (~3909 tok)
- `index.html` — 🐛 又买了一本书 (~8023 tok)
- `log_server.py` — import: guess_base_url, now_iso, new_id, get_conn + 11 more (~29248 tok)
- `styles.css` — Styles: 149 rules, 51 vars (~13191 tok)

## ../../../../private/tmp/claude-501/-Users-huangnanqi-CursorProjects-paper-reading-app/9f13dddc-a421-447a-b1d7-8ed45193951b/scratchpad/

- `card.html` — Declares html (~522 tok)
- `dual-poster.html` — Declares html (~811 tok)
- `icon-wrap.html` — Declares html (~59 tok)
- `logo-preview.html` — Declares html (~587 tok)
- `og-card.html` — Declares html (~417 tok)
- `slide.html` — Declares html (~606 tok)
- `wechat-poster.html` — Declares html (~594 tok)

## ../../.claude/

- `bark-key.txt` (~6 tok)
- `CLAUDE.md` — 全局工作约定（跨项目） (~421 tok)
- `product-owner-latest.md` — 产品负责人周报 · 2026-W27（6/29 定） (~142 tok)
- `settings.json` (~1484 tok)
- `statusline-command.sh` — Claude Code status line (~335 tok)

## ../../.claude/daily-logs/

- `2026-05-15.md` — 日报 2026-05-15 (~247 tok)
- `2026-05-28.md` — 日报 2026-05-28 (~311 tok)
- `2026-06-02.md` — 日报 2026-06-02 (~411 tok)
- `2026-06-03.md` — 日报 2026-06-03 (~429 tok)
- `2026-06-04.md` — 日报 2026-06-04 (~524 tok)
- `2026-06-08.md` — 日报 2026-06-08 (~484 tok)
- `2026-06-09.md` — 日报 2026-06-09 (~416 tok)
- `2026-06-11.md` — 日报 2026-06-11 (~465 tok)
- `2026-06-13.md` — 日报 2026-06-13 (~486 tok)
- `2026-06-16.md` — 日报 2026-06-16 (~481 tok)
- `2026-06-24.md` — 日报 2026-06-24 (~520 tok)
- `2026-06-26.md` — 日报 2026-06-26 (~397 tok)
- `2026-06-28.md` — 日报 2026-06-28 (~537 tok)
- `2026-06-29.md` — 日报 2026-06-29 (~463 tok)
- `2026-07-02.md` — 日报 2026-07-02 (~532 tok)
- `2026-07-03.md` — 日报 2026-07-03 (~475 tok)

## ../../.claude/hooks/

- `compact-summary.sh` — PostCompact hook — 上下文压缩后，把 Claude Code 刚生成的压缩摘要存成一张「工作日记卡片」 (~494 tok)
- `permission-notify.sh` — PermissionRequest hook — Claude Code 需要授权时弹 macOS 通知 (~515 tok)
- `stop-bark.sh` — Stop hook — Claude Code 完成一轮任务时，若你已切走终端窗口，推送到 iPhone/Apple Watch (Bark) (~383 tok)

## ../../.claude/plans/

- `agent-federated-pony.md` — 思想碰撞（Cross-Book Connection）功能实现计划 (~1250 tok)
- `cheerful-noodling-twilight.md` — Batch Plan — 三项优化「按序全做」(OPT-017 / OPT-011 / E21) (~1316 tok)
- `idempotent-wishing-kurzweil.md` — UI 迭代计划 v2 — 7 项优化 (~1223 tok)
- `mellow-yawning-flute.md` — 探讨页 UI/UX 优化建议 (~412 tok)
- `opt-003-buzzing-graham.md` — OPT-003 — 自动适配不同手机机型 (~880 tok)
- `opt-016-agile-fog.md` — OPT-016 — 摘抄拍照后用非 AI 工具自动提取全文（快速录入备选） (~1344 tok)

## ../../.claude/playbook/

- `PLAYBOOK.md` — 个人项目推进 Playbook (~800 tok)

## ../../.claude/playbook/templates/

- `agent-pipeline-prompts.md` — 夜间三 agent 流水线提示词模板 (~1438 tok)
- `roadmap.template.md` — 项目推进方案（roadmap） (~191 tok)
- `signals.template.md` — Signals — 真实使用信号日志 (~64 tok)

## ../../.claude/projects/-Users-huangnanqi-CursorProjects-paper-reading-app/memory/

- `feedback_reply_in_chinese.md` (~94 tok)
- `feedback_update_stale_docs.md` (~188 tok)
- `MEMORY.md` (~370 tok)
- `project_brand_share_kit.md` (~327 tok)
- `project_optimization_pipeline.md` (~549 tok)
- `reference_claude_code_hooks.md` (~548 tok)
- `reference_global_playbook.md` (~332 tok)
- `reference_personal_infra_index.md` (~419 tok)
- `reference_remote_access_setup.md` — 2026-07-02 更新：Cloudflare 固定命名隧道 + prod/dev 分离 (~1611 tok)
- `reference_weekly_report_email.md` (~339 tok)

## ../../.claude/scripts/

- `email-cheatsheet.sh` — email-cheatsheet — 把全局共享工具 / 常用命令速查发到邮箱。 (~473 tok)
- `newproj.sh` — newproj — 显式、可交互、安全地为新项目铺设 OpenWolf + roadmap/signals 脚手架。 (~922 tok)
- `paper-tunnel.sh` — Cloudflare quick tunnel for the paper-reading backend (localhost:8787), (~485 tok)
- `product-owner-monday.sh` — 产品负责人周一仪式（本机 launchd，每周一）。读 signals + 上周 PR + backlog/roadmap， (~642 tok)
- `run_prod_mcp.sh` — Prod 独立 MCP 服务(reading_mcp_server)——绑 prod 库 + 独立端口 8798, (~131 tok)
- `send-email.py` — Send a text file as an email via Gmail SMTP. (~899 tok)
- `tunnel-watchdog.sh` — 隧道/后端看门狗：KeepAlive 只在进程退出时重启，但 cloudflared 常出现「进程活着、 (~322 tok)
- `weekly-report.sh` (~476 tok)

## ../../.claude/skills/organize-downloads/

- `SKILL.md` — Organize Downloads（下载文件夹整理） (~534 tok)

## ../../Library/LaunchAgents/

- `com.huangnanqi.caffeinate.plist` (~174 tok)
- `com.huangnanqi.paper-backend.plist` (~291 tok)
- `com.huangnanqi.paper-mcp-prod.plist` (~285 tok)
- `com.huangnanqi.paper-tunnel.plist` (~255 tok)
- `com.huangnanqi.product-owner.plist` (~307 tok)
- `com.huangnanqi.tunnel-watchdog.plist` (~247 tok)
- `com.huangnanqi.weekly-report.plist` (~301 tok)

## ./

- `.DS_Store` (~2186 tok)
- `.gitignore` — Git ignore rules (~196 tok)
- `app_server.py` — import: static_asset_version, is_admin_username, build_sample_state, initialize_tool_schema_provider (~68118 tok)
- `app.js` — AUTH_TOKEN_KEY: isTabActive, createId, getBackendBaseUrl + 4 more (~49578 tok)
- `app.js` — AUTH_TOKEN_KEY: isTabActive, createId, getBackendBaseUrl + 4 more (~46807 tok)
- `chat.js` — STREAM_IDLE_TIMEOUT_MS: normalizePreferredBookValue, activeBookId, activeQuoteId + 20 more (~11314 tok)
- `CLAUDE.md` — OpenWolf (~1301 tok)
- `docker-compose.yml` — Docker Compose services (~879 tok)
- `Dockerfile` — Docker container definition (~366 tok)
- `index.html` — 🐛 又买了一本书 (~10720 tok)
- `index.html` — 🐛 又买了一本书 (~10088 tok)
- `landing.html` — 又买了一本书 · 与你的纸质书共读 (~5448 tok)
- `log_server.py` — import: guess_base_url, now_iso, new_id, get_conn + 12 more (~27130 tok)
- `paper-reading-app-需求文档.md` — Paper Reading App — 需求文档 v1.0 (~683 tok)
- `reading_mcp_server.py` — add_note, add_book, summary (~4352 tok)
- `README.md` — Project documentation (~538 tok)
- `requirements.txt` — Python dependencies (~123 tok)
- `styles.css` — Styles: 102 rules, 150 vars (~23015 tok)
- `week6_reasoning_agent_control.html` — Week 6 · 推理模型应用 & Agent 可控性 (~12870 tok)

## .claude/

- `.DS_Store` (~1640 tok)
- `settings.json` (~441 tok)

## .claude/agent-memory/

- `.DS_Store` (~1640 tok)

## .claude/agents/

- `ux-reviewer.md` — Review Methodology (~5004 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .claude/worktrees/agent-a955434a231687678/

- `styles.css` — Styles: 106 rules, 150 vars (~20918 tok)

## .claude/worktrees/agent-a955434a231687678/tests/frontend/

- `regression-fixed-bugs.test.js` — regression-fixed-bugs.test.js (~18536 tok)

## .claude/worktrees/agent-aaa330ed46a04f6e9/

- `app_server.py` — import: is_admin_username, initialize_tool_schema_provider_for_tests, guess_base_url, now_iso + 5 mo (~62671 tok)

## .claude/worktrees/agent-aaa330ed46a04f6e9/tests/agent/

- `db_index_test.py` — Tests for secondary indexes on the observability tables (OPT-017). (~844 tok)

## .claude/worktrees/agent-aebfc23151e99c216/

- `app_server.py` — import: is_admin_username, initialize_tool_schema_provider_for_tests, guess_base_url, now_iso + 5 mo (~62725 tok)

## .claude/worktrees/agent-aebfc23151e99c216/tests/agent/

- `security_headers_test.py` — Regression tests for OPT-011: security headers on static/HTML responses. (~917 tok)

## .kiro/specs/agent-backend-reliability/

- `.config.kiro` (~30 tok)
- `design.md` — Design Document: Agent Backend Reliability (~10580 tok)
- `requirements.md` — Requirements Document (~5741 tok)
- `tasks.md` — Implementation Plan: Agent Backend Reliability (~4523 tok)

## .kiro/specs/book-list-ordering-fix/

- `.config.kiro` (~30 tok)
- `bugfix.md` — Bugfix Requirements Document (~758 tok)
- `design.md` — Book List Ordering Fix — Bugfix Design (~4038 tok)
- `tasks.md` — Implementation Plan (~2167 tok)

## .kiro/specs/global-search/

- `.config.kiro` (~30 tok)
- `design.md` — Design Document: Global Search (~5275 tok)
- `requirements.md` — Requirements Document (~1766 tok)
- `tasks.md` — Implementation Plan: Global Search (~2333 tok)

## .kiro/specs/ocr-recognition-fix/

- `.config.kiro` (~30 tok)
- `bugfix.md` — Bugfix Requirements Document (~761 tok)
- `design.md` — OCR Recognition Fix — Bugfix Design (~4644 tok)
- `tasks.md` — Implementation Plan (~1453 tok)

## .kiro/specs/ui-redesign/

- `.config.kiro` (~28 tok)
- `design.md` — Design Document: UI Redesign — ChaTin App Aesthetic (~5683 tok)
- `requirements.md` — Requirements Document (~3686 tok)
- `tasks.md` — Implementation Plan: UI Redesign — ChaTin App Aesthetic (~3323 tok)

## assets/


## assets/brand/


## data/

- `golden_set_baseline.json` (~68 tok)
- `golden_set.json` (~11660 tok)

## optimization/

- `backlog.md` — Optimization Backlog (~21094 tok)
- `backlog.md` — Optimization Backlog (~17683 tok)
- `backlog.md` — Optimization Backlog (~10520 tok)
- `explore.md` — Exploration — new optimization directions (~51760 tok)
- `explore.md` — Exploration — new optimization directions (~29517 tok)
- `roadmap.md` — 项目推进方案(roadmap) (~1310 tok)
- `roadmap.md` — 项目推进方案(roadmap) (~988 tok)
- `signals.md` — Signals — 真实使用信号日志 (~343 tok)
- `triage.md` — Triage (~4149 tok)

## scripts/

- `dev_backend.py` — backend_python, check_backend_environment, check_mcp_server, iter_watched_files (~1692 tok)
- `dev_backend.sh` (~153 tok)
- `generate_thumbnails.py` — 为 uploads 下的图片生成书单用缩略图（<stem>.thumb.jpg，最长边 400px）。 (~735 tok)
- `run_backend_service.sh` — Unattended backend runner for launchd (stable serving, NOT the dev watcher). (~123 tok)
- `start_backend.sh` (~348 tok)

## tests/

- `agent_backend_property_test.py` — Tests: property_database_migration_creates_expected_schema, property_request_validation_ordering, property_parse_failure_visibility, property_actio... (~5249 tok)
- `agent_backend_reliability_test.py` — Tests: chat_response_includes_trace_and_persists_pending_action, chat_parse_failure_returns_degraded_status_without_actions, chat_validation_failur... (~6925 tok)
- `agent_evaluation_framework_test.py` — Tests: outcome_score_rewards_matching_outcome_action_and_reply, outcome_and_trajectory_scores_drop_when_action_type_mismatches, robustness_fails_fo... (~1854 tok)
- `agent_golden_set_eval.py` — GoldenSetEvaluator: close, request_json, run_case, fake_deepseek + 8 more (~3461 tok)
- `agent_link_thought_test.py` — LinkThoughtTests: setUp, tearDown, request_json, chat + 13 more (~3572 tok)
- `book-list-ordering-fix.test.js` — test: createElementStub, innerHTML, innerHTML + 5 more (~2497 tok)
- `chat-agent-approval.test.js` — test: createElementStub, innerHTML, innerHTML + 3 more (~3620 tok)
- `global-search.test.js` — test: createElementStub, innerHTML, innerHTML + 11 more (~4276 tok)
- `ocr_recognition_fix_test.py` — Tests: bug_exploration_ocr_should_use_kimi_vision_helper, preservation_chat_route_still_uses_deepseek_chat, preservation_unauthenticated_ocr_return... (~1623 tok)
- `quote-content-display.test.js` — Regression test for bug-098: quote card content truncation (~1122 tok)
- `ui-redesign.test.js` — test: getRuleBlock (~1581 tok)

## tests/agent/

- `action_executor_utc_ts_test.py` — Regression tests for OPT-024: ActionExecutor must write UTC timestamps (ending with 'Z'). (~1960 tok)
- `agent_backend_property_test.py` — AgentBackendPropertyTests: setUp, tearDown, request_json, request_sse_events + 12 more (~9956 tok)
- `book_ocr_endpoint_test.py` — OPT-002: POST /api/books/ocr sync route — mocks call_kimi_vision, asserts 200 {title,author,tags}, 400 no image, 401 unauth, friendly no-key error. (~1300 tok)
- `connection_leak_test.py` — Regression tests for OPT-037 (explore E26): DB connection-leak safety net. (~1406 tok)
- `db_index_test.py` — Tests for secondary indexes on the observability tables (OPT-017 / OPT-025). (~1153 tok)
- `debug_xss_test.py` — Regression tests for OPT-034: stored XSS in /debug/logs and /debug/agent-dashboard. (~1410 tok)
- `deepseek_retry_test.py` — DeepseekRetryTest: test_success_no_retry, test_retries_on_429, side_effect, test_retries_on_503 + 24 (~4466 tok)
- `gc_thread_test.py` — Tests for the GC background thread wired up in main() (OPT-010). (~1367 tok)
- `mcp_db_and_retry_test.py` — 两个 prod bug 的回归锁: (~600 tok)
- `media_cors_test.py` — Regression test for OPT-023: /media/ route must NOT emit Access-Control-Allow-Origin. (~819 tok)
- `metrics_json_guard_test.py` — SummarizeMetricsJsonGuardTest: setUp, tearDown, test_valid_rows_still_counted, test_corrupted_row_sk (~1322 tok)
- `ocr_pending_orphan_test.py` — OPT-042 (Fix A): the fast OCR path must not leave an orphaned "pending" (~1786 tok)
- `password_reset_test.py` — Regression tests for password reset flow (P1 commercialization). (~2891 tok)
- `plan_tier_test.py` — Regression tests for free/Plus plan tiers (P2 commercialization). (~2279 tok)
- `quote_ocr_engine_test.py` — _FakeResp: read, test_returns_normalized_text_from_stdout, test_default_langs_excludes_eng, test_mis (~5000 tok)
- `reading_mcp_server_tools_test.py` — ReadingMCPServerToolTests: setUp, tearDown, test_add_note_writes_note_to_quotes_head, test_add_note_ (~3253 tok)
- `request_body_size_cap_test.py` — _FakeHeaders: get, send_response, send_header, setUp + 10 more (~1891 tok)
- `session_expiry_test.py` — Regression tests for session token rolling expiry (P0 commercialization). (~2042 tok)
- `static_cache_test.py` — OPT-086: 静态资源缓存策略测试。 (~692 tok)

## tests/frontend/

- `account-import-format.test.js` — OPT-040: importData() must (1) unwrap both export formats — the lightweight (~4075 tok)
- `book-cover-thumbnail-lazy.test.js` — 书单封面「缩略图 + 懒加载」优化：书单原来一次性拉 28MB 原图封面，改为用 (~1084 tok)
- `book-dates-display.test.js` — OPT-074: startedAt / finishedAt are written to the book object via saveSession() (~1526 tok)
- `book-detail-ux.test.js` — OPT-049: book-detail dialog UX fixes from real-usage signals (2026-06-13): (~1954 tok)
- `book-detail-ux.test.js` — OPT-049: book-detail dialog UX fixes from real-usage signals (2026-06-13): (~1704 tok)
- `book-duplicate.test.js` — test: elStub, innerHTML, innerHTML, createHarness, getElement (~1786 tok)
- `book-list-ordering-fix.test.js` — test: createElementStub, innerHTML, innerHTML + 5 more (~4028 tok)
- `book-ocr.test.js` — OPT-002: runBookOcr() POSTs cover to /api/books/ocr and fills bookForm title/author/tags only when empty (never overwrites user input). (~1500 tok)
- `book-reading-dates.test.js` — OPT-074: a book's startedAt/finishedAt are auto-filled by saveSession() but were (~6007 tok)
- `book-reading-dates.test.js` — OPT-074: book startedAt/finishedAt display in detail dialog + editable date inputs in edit dialog (~2600 tok)
- `connection-crud.test.js` — OPT-045: regression coverage for the 关联 (Connection) Tab — the app's (~2791 tok)
- `dialog-escape-cleanup.test.js` — OPT-062: confirm dialogs must clean up event listeners when the Escape key (~2726 tok)
- `excel-entry-books-page.test.js` — Regression tests for OPT-001: books-page secondary entry for Excel batch import. (~1319 tok)
- `login-fast-and-retry-btn.test.js` — 两个移动端体验修复： (~698 tok)
- `ocr-cancel-cleanup.test.js` — Bug (2026-06-24): photo → 快速识别 creates+persists a quote server-side (~1806 tok)
- `ocr-fast-panel-integration.test.js` — Integration test for the FAST OCR path (runOcrFromImage("fast")): (~1884 tok)
- `ocr-line-selector.test.js` — OPT-055: 快速 OCR 行级编辑/删除面板 (~4036 tok)
- `ocr-stale-recovery.test.js` — OPT-042 (Fix B): recoverStalePendingOcr() flips quotes orphaned at (~1458 tok)
- `quote-card-image-thumb.test.js` — OPT-052: quote card shows image thumbnail when quote.imageUrl is present, (~1647 tok)
- `quote-ocr-fast.test.js` — OPT-016: runOcrFromImage(engine) — fast path sends engine:"fast" and fills the (~1628 tok)
- `quote-tag-picker-persist.test.js` — 摘抄标签 picker 的来源 = 默认标签 + 用户经输入框「手动敲过」的自定义标签(localStorage)。 (~1664 tok)
- `regression-fixed-bugs.test.js` — regression-fixed-bugs.test.js (~19862 tok)
- `regression-fixed-bugs.test.js` — regression-fixed-bugs.test.js (~19497 tok)
- `session-crud.test.js` — OPT-045: regression coverage for the 记录 (Session) Tab, which had no (~2616 tok)
- `ui-redesign.test.js` — test: getRuleBlock (~3176 tok)

## wechat-miniprogram/

- `app.js` (~3 tok)
- `app.json` (~90 tok)
- `app.wxss` (~442 tok)
- `project.config.json` (~251 tok)
- `project.private.config.json` (~161 tok)
- `sitemap.json` (~34 tok)

## wechat-miniprogram/pages/index/

- `index.js` — Declares statusOptions (~3325 tok)
- `index.json` (~12 tok)
- `index.wxml` (~2527 tok)
- `index.wxss` (~729 tok)

## wechat-miniprogram/utils/

- `store.js` — STORAGE_KEY: loadState, saveState, createId (~223 tok)
