# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-05-31

## Next up

**OPT-008 — summarize_metrics() 中 json.loads 无 try-except**

P0/S. A single corrupted `dimensions` row in `agent_metrics` causes `json.loads` at `app_server.py:2438` to throw `json.JSONDecodeError`, which propagates unhandled and returns HTTP 500 on `/debug/logs` and `/debug/metrics` for that user — permanently, until the row is manually deleted. The fix is two lines: wrap the `json.loads` call in `try/except json.JSONDecodeError`, `continue` in the except branch (optionally add a `logging.warning`). Zero schema changes, zero logic changes, zero new endpoints.

Key files: `app_server.py:2435-2438` (`summarize_metrics()` row loop).

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-008 | summarize_metrics json.loads 无 try-except | P0 | S | triaged | Single unguarded `json.loads(row["dimensions"])` at line 2438. One corrupt row → permanent 500 on all monitoring endpoints for that user. Fix: wrap in try/except json.JSONDecodeError + continue. Touch: app_server.py:2435-2438. |
| OPT-009 | _read_json() 无请求体大小上限 | P1 | S | triaged | `_read_json()` at line 2912 and Stripe webhook read at line 3688 both call `self.rfile.read(length)` with no upper bound. Malicious Content-Length header can OOM the process and hang all other requests. Fix: define `MAX_REQUEST_BYTES = 20 * 1024 * 1024`, return 413 before read if exceeded. Touch: app_server.py:2910-2913, 3688. |
| OPT-002 | 「书单」加书支持拍照 OCR 识别 | P1 | M | triaged | OCR pipeline (call_ocr_with_fallback, call_kimi_vision) exists for quotes; no book OCR endpoint yet. Need new POST /api/books/ocr handler returning {title, author, tags[]} + frontend camera input in bookDialog. Touch: app_server.py, index.html, app.js. |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | Import entry confirmed only in meDrawer (#userPanel, index.html:277). Books panel header (index.html:47-68) has only #openBookDialogBtn. Add a secondary "批量导入" link near that button. Existing importExcelInput handler in app.js can be reused. Touch: index.html only. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | triaged | styles.css has clamp/vw only in landing sections; app UI is mostly fixed-px. Existing @media breakpoints (980px, 768px, 480px) do minimal adjustments. Full audit needed to replace px with clamp()/min()/vw for app screens. Risk: visual regressions across all panels. |
| OPT-007 | 替换已废弃的 imghdr | P0 | S | done | Implemented in PR #10 (merged 2026-05-31). Replaced imghdr.what() with _detect_image_type() magic-byte helper. |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Implemented in PR #9 (merged 2026-05-30). Aggregate header (5 stat cards) + per-row token badge added to /debug/logs handler. |
| OPT-004 | 桌面端基础适配 | P2 | L | done | Implemented (commit b5bebb1). Sidebar nav + chat master-detail desktop layout. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
