# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-31T17:05:47.483Z
> Files: 79 tracked | Anatomy hits: 0 | Misses: 0

## ../../../

- `app.js` — Run an async save operation while disabling the submit button and showing a (~29741 tok)
- `chat.js` — els: normalizePreferredBookValue, activeBookId, updatePickerDisplay + 14 more (~3909 tok)
- `index.html` — 🐛 又买了一本书 (~8023 tok)
- `log_server.py` — import: guess_base_url, now_iso, new_id, get_conn + 11 more (~29248 tok)
- `styles.css` — Styles: 149 rules, 51 vars (~13191 tok)

## ../../.claude/

- `settings.json` (~372 tok)
- `statusline-command.sh` — Claude Code status line (~335 tok)

## ../../.claude/daily-logs/

- `2026-05-15.md` — 日报 2026-05-15 (~247 tok)
- `2026-05-28.md` — 日报 2026-05-28 (~311 tok)

## ../../.claude/plans/

- `agent-federated-pony.md` — 思想碰撞（Cross-Book Connection）功能实现计划 (~1250 tok)
- `idempotent-wishing-kurzweil.md` — UI 迭代计划 v2 — 7 项优化 (~1223 tok)
- `mellow-yawning-flute.md` — 探讨页 UI/UX 优化建议 (~412 tok)

## ../../.claude/scripts/

- `weekly-report.sh` (~274 tok)

## ../../Library/LaunchAgents/

- `com.huangnanqi.weekly-report.plist` (~301 tok)

## ./

- `.DS_Store` (~2186 tok)
- `.gitignore` — Git ignore rules (~37 tok)
- `app_server.py` — import: initialize_tool_schema_provider_for_tests, guess_base_url, now_iso, new_id + 10 more (~37526 tok)
- `app.js` — AUTH_TOKEN_KEY: isTabActive, createId, getBackendBaseUrl + 9 more (~35722 tok)
- `chat.js` — els: normalizePreferredBookValue, activeBookId, activeQuoteId + 19 more (~9710 tok)
- `CLAUDE.md` — OpenWolf (~1077 tok)
- `index.html` — 🐛 又买了一本书 (~7944 tok)
- `log_server.py` — import: guess_base_url, now_iso, new_id, get_conn + 12 more (~27130 tok)
- `paper-reading-app-需求文档.md` — Paper Reading App — 需求文档 v1.0 (~683 tok)
- `README.md` — Project documentation (~538 tok)
- `styles.css` — Styles: 148 rules, 55 vars (~15363 tok)
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


## data/

- `golden_set_baseline.json` (~68 tok)
- `golden_set.json` (~11660 tok)

## optimization/

- `backlog.md` — Optimization Backlog (~1105 tok)
- `triage.md` — Triage (~793 tok)

## scripts/

- `dev_backend.py` — backend_python, check_backend_environment, check_mcp_server, iter_watched_files (~1582 tok)

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

## tests/frontend/

- `regression-fixed-bugs.test.js` — regression-fixed-bugs.test.js (~11819 tok)

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
