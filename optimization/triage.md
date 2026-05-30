# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-05-30

## Next up

**OPT-005 — debug/dashboard 看板增加每条请求的 token、延迟监测**

The data is already there: `list_logs()` returns `inputTokens`, `outputTokens`, and `latencyMs` for every row, and the DB schema already records them. The current `/debug/logs` dashboard only renders `latencyMs` per request in the summary line but silently drops token counts, and there is no aggregate header (today's total tokens, avg latency, P95). This is a pure Python HTML-template change (~40 lines in `app_server.py:3208-3267`) with zero risk to application logic or data. Highest value-to-effort ratio of all open items.

Key files: `app_server.py` (the `/debug/logs` handler at line 3201, the `list_logs()` helper at line 1563).

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | triaged | Data already in DB and returned by list_logs(); only HTML rendering missing. Add inputTokens/outputTokens per row + aggregate summary (today total, avg latency, P95). Touch: app_server.py:3208-3267. |
| OPT-002 | 「书单」加书支持拍照 OCR 识别 | P1 | M | triaged | OCR pipeline (call_ocr_with_fallback, call_kimi_vision) exists for quotes; no book OCR endpoint yet. Need new POST /api/books/ocr handler returning {title, author, tags[]} + frontend camera input in bookDialog. Touch: app_server.py, index.html, app.js. |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | Import entry confirmed only in meDrawer (#userPanel, index.html:277). Books panel header (index.html:47-68) has only #openBookDialogBtn. Add a secondary "批量导入" link near that button. Existing importExcelInput handler in app.js can be reused. Touch: index.html only. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | triaged | styles.css has clamp/vw only in landing sections; app UI is mostly fixed-px. Existing @media breakpoints (980px, 768px, 480px) do minimal adjustments. Full audit needed to replace px with clamp()/min()/vw for app screens. Risk: visual regressions across all panels. |
| OPT-004 | 桌面端基础适配 | P2 | L | triaged | No centered content column or slide-in drawer for desktop. .desktop-only class exists but app layout is fully mobile-only above 768px. Large architectural change — should be split into sub-tasks (column layout / drawer / keyboard shortcuts). |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
