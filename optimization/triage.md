# Triage

Maintained by Agent1 (daily 01:00 CST). Do not hand-edit unless correcting the agent.

Last triaged: 2026-05-30

## Next up

**OPT-007 — 替换已废弃的 imghdr（Python 3.13 将删除）**

This is P0/S: a two-line change in `save_image()` that eliminates a guaranteed future `ImportError`. Python 3.11 already emits a `DeprecationWarning` at import time; Python 3.13 removes `imghdr` entirely, which will crash all image uploads and OCR flows the moment the runtime is upgraded. The fix is fully self-contained — replace `imghdr.what(None, binary)` with 5 lines of magic-byte sniffing (PNG: `\x89PNG`, JPEG: `\xff\xd8`, WebP: `RIFF…WEBP`) and delete the `import imghdr` at line 8. Zero schema changes, zero logic changes, zero test surface beyond the one function.

Key files: `app_server.py:8` (import), `app_server.py:1675-1688` (`save_image()`).

## Prioritized backlog

| id | title | priority | complexity | status | notes |
|----|-------|----------|------------|--------|-------|
| OPT-007 | 替换已废弃的 imghdr | P0 | S | triaged | `import imghdr` at line 8; used only in `save_image()` line 1677. Replace with magic-bytes check (PNG/JPEG/WebP) + fallback to mime_type suffix. Python 3.11 warns; Python 3.13 removes. Touch: app_server.py:8, 1677. |
| OPT-002 | 「书单」加书支持拍照 OCR 识别 | P1 | M | triaged | OCR pipeline (call_ocr_with_fallback, call_kimi_vision) exists for quotes; no book OCR endpoint yet. Need new POST /api/books/ocr handler returning {title, author, tags[]} + frontend camera input in bookDialog. Touch: app_server.py, index.html, app.js. |
| OPT-001 | Excel 批量加书入口位置 | P2 | S | triaged | Import entry confirmed only in meDrawer (#userPanel, index.html:277). Books panel header (index.html:47-68) has only #openBookDialogBtn. Add a secondary "批量导入" link near that button. Existing importExcelInput handler in app.js can be reused. Touch: index.html only. |
| OPT-003 | 自动适配不同手机机型 | P2 | L | triaged | styles.css has clamp/vw only in landing sections; app UI is mostly fixed-px. Existing @media breakpoints (980px, 768px, 480px) do minimal adjustments. Full audit needed to replace px with clamp()/min()/vw for app screens. Risk: visual regressions across all panels. |
| OPT-004 | 桌面端基础适配 | P2 | L | triaged | No centered content column or slide-in drawer for desktop. .desktop-only class exists but app layout is fully mobile-only above 768px. Large architectural change — should be split into sub-tasks (column layout / drawer / keyboard shortcuts). |
| OPT-005 | debug/dashboard token & latency 监测 | P1 | S | done | Implemented in PR #9 (merged 2026-05-30). Aggregate header (5 stat cards) + per-row token badge added to /debug/logs handler. |

## Legend

- priority: P0 (do first) / P1 / P2
- complexity: S (small, <1 PR) / M (medium) / L (large, should be split)
- status: new / triaged / in-progress / done
