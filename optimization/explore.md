# Exploration — new optimization directions

Appended by Agent3 (daily 03:00 CST). Each run adds a dated section.
Strong ideas should also be promoted into `backlog.md` as new OPT-NNN items.

---

## 2026-05-30

### E1 — Global search ignores the quotes tab entirely (S)
**What:** `globalSearch()` in `app.js:1049-1066` calls only `matchBooks()` and passes results to `renderSearchResults()`. The existing `matchQuotes()` helper at `app.js:887` is never invoked from this path. A user who searches for keywords they remember from a quote gets no results unless they switch to the quotes tab and type again in the per-tab search box.

**Why it matters:** Search is a core discovery flow. Silently returning only book results while ignoring an existing, functional quote-search helper is a UX gap that will grow more painful as users accumulate more quotes. The fix is ~10 lines: call `matchQuotes()`, render matched quotes as a second section in `renderSearchResults()`.

**Complexity:** S — `app.js` only; no backend changes needed. `global-search.test.js` would need one new test case.

**Files:** `app.js:877-888, 1017-1066`; `tests/frontend/global-search.test.js`

---

### E2 — `imghdr` is deprecated and removed in Python 3.13 (S)
**What:** `app_server.py` imports `imghdr` (line 8) and uses it at line 1677 (`imghdr.what(None, binary)`) to detect image format when saving uploaded images. Python 3.11 already emits a `DeprecationWarning`; `imghdr` is removed in Python 3.13. A runtime upgrade would cause an `ImportError` crash on the first image upload.

**Why it matters:** The risk is a silent ticking bomb — works today, breaks on upgrade. The fix is a 5-line magic-bytes fallback: PNG starts with `\x89PNG`, JPEG with `\xff\xd8`, WebP with `RIFF...WEBP`. No external dependency needed.

**Complexity:** S — one function (`save_image`, ~5 lines), no schema changes, no test changes required.

**Files:** `app_server.py:8, 1675-1690`

---

### E3 — Static JS/CSS served with `no-store`; ETag/304 would eliminate repeat downloads (S)
**What:** `app.js`, `chat.js`, and `styles.css` are served with `Cache-Control: no-store, no-cache, must-revalidate` (line 2989). On every page load — even a PWA re-open — the browser downloads the full 100KB+ of JS and CSS from scratch. The `/assets/` route already uses `immutable` caching (line 3011); only the main app files are missing this optimization.

**Why it matters:** Mobile users on slow connections experience a noticeable lag on each app open. Adding ETag (SHA-256 of file bytes, computed once at startup) + 304 short-circuit costs ~10 lines of Python and zero risk — the existing `CLIENT_VERSION` / build-version check already ensures stale caches are busted on deploy.

**Complexity:** S — all in the `do_GET` static file handler (`app_server.py:2984-2993`). No frontend changes needed.

**Files:** `app_server.py:2963-2993`

---

### E4 — `link_thought` action missing from backend execution test suite (S)
**What:** `tests/agent/agent_backend_reliability_test.py:334` tests `add_book`, `add_note`, `summary`, `question`, and `tag` actions end-to-end, but `link_thought` (the most complex action in `ActionExecutor`) has no coverage at the execution layer. The executor validates `kind` against a 5-item whitelist, checks source/target types, verifies that referenced IDs exist in state, and can produce three distinct error paths — all untested.

**Why it matters:** `link_thought` is the only agent action that touches the `connections` part of state, and its validation has four independent guard clauses. Any regression there is invisible to CI.

**Complexity:** S — add one test method to `agent_backend_reliability_test.py` that seeds a book + quote, invokes `link_thought` via the `/api/chat` + approve flow, and asserts the connection appears in state.

**Files:** `tests/agent/agent_backend_reliability_test.py`; `app_server.py:2631-2661`

---

### E5 — `renderQuotes()` rebuilds full DOM on every keystroke with no debounce (S)
**What:** The quote search input fires `renderQuotes()` on every `input` event (line 3575). `renderQuotes()` rebuilds the entire `els.quotesList.innerHTML` synchronously — for a user with 200+ quotes this is a full DOM rebuild on every character typed. `renderBooks()` uses a `requestAnimationFrame` batching strategy (line 1100-1117) but `renderQuotes()` does not.

**Why it matters:** Mobile browsers have limited JS execution budgets. A 300ms debounce on the search input + the same rAF-batched render pattern already used by `renderBooks()` would eliminate jank on the quotes tab for power users with large collections.

**Complexity:** S — add a `debounce()` wrapper at the event listener (line 3575) and optionally batch quote card appends the same way `renderBooks()` does.

**Files:** `app.js:3575, 1189-1253`

---

### E6 — Rate-limit headroom never surfaced to user before the 429 wall (M)
**What:** `check_and_record_rate_limit()` returns `hour_count`, `hour_limit`, `day_count`, `day_limit` on every successful request (line 1092-1130), but the chat endpoints never forward this to the client. Users discover they've hit the limit only when a request fails with a 429; there is no prior warning. The streaming chat handler (`/api/chat/stream`) sends an initial JSON header chunk before streaming begins — it could include `{"remaining": {"hour": N, "day": M}}` there.

**Why it matters:** Surprise 429s erode trust. A one-line addition to the pre-stream JSON header (sent unconditionally, zero latency cost) would let `chat.js` show "今日剩余 2 次" before the last request fires. The backend already has all the data.

**Complexity:** M — backend change to the stream header (~5 lines); `chat.js` needs to parse the header chunk and update a UI counter; one new JS test.

**Files:** `app_server.py` (stream handler ~line 3979); `chat.js` (~line 587); `tests/frontend/chat-agent-approval.test.js`

---

## 2026-05-30 (pass 2)

### E7 — Custom quote tags stored only in localStorage — not synced across devices (M)
**What:** `getCustomQuoteTags()` and `saveCustomQuoteTags()` at `app.js:405-409` use `localStorage["quote-custom-tags"]` as the sole store for user-defined tag vocabulary. `sanitize_state()` in `app_server.py:565-599` has no `customQuoteTags` field; `INITIAL_STATE` at line 148-155 also omits it. A user who creates a custom tag on their phone and opens the app on a desktop browser finds an empty tag picker.

**Why it matters:** Tags are a first-class organizational primitive. Custom tags built up over time (book genres, personal reading goals) are invisible on any second device, and lost entirely if localStorage is cleared. The fix is to add `customQuoteTags` to `sanitize_state()` + `INITIAL_STATE`, persist it on save, and read from server state on load rather than from localStorage.

**Complexity:** M — backend: add field to `sanitize_state()` and `INITIAL_STATE` (~5 lines); frontend: replace `getCustomQuoteTags()`/`saveCustomQuoteTags()` to read from `state.customQuoteTags` and issue a state-save on change; one-time migration merges existing localStorage tags into first sync.

**Files:** `app_server.py:148-155, 565-599`; `app.js:405-410, 659` (state save path)

---

### E8 — `json.loads()` in `summarize_metrics()` has no error handling — one corrupted row crashes the whole metrics endpoint (S)
**What:** `MetricsCollector.summarize_metrics()` at `app_server.py:2427` calls `json.loads(row["dimensions"])` inside a loop over all metric rows with no try-except. The `dimensions` column is written by `record_metric()` — if any row has truncated JSON (e.g., from a mid-write crash or a schema migration), the entire call raises `json.JSONDecodeError` and the `/debug/metrics` and `/debug/logs` endpoints return 500.

**Why it matters:** One bad row in `agent_metrics` breaks the metrics dashboard for that user permanently until manual DB surgery. The fix is a two-line try-except that skips the bad row and continues.

**Complexity:** S — wrap the `json.loads` call at line 2427 in `try/except json.JSONDecodeError`, log a warning, and `continue`.

**Files:** `app_server.py:2401-2435` (`MetricsCollector.summarize_metrics`)

---

### E9 — `_read_json()` reads the full request body with no size cap — DoS via oversized payload (M)
**What:** `_read_json()` at `app_server.py:2899-2902` reads `content_length = int(self.headers.get("Content-Length", "0"))` and then calls `self.rfile.read(content_length)` with no upper bound. All POST endpoints that accept JSON (including `/api/upload-image` and `/api/quotes/ocr` which receive base64-encoded images) allocate however many bytes the caller claims. An unauthenticated attacker — or one who passes the rate-limit check on the first request — can send a `Content-Length: 2000000000` header and force the process to block reading and allocate gigabytes.

**Why it matters:** The server is a single-process `ThreadingHTTPServer` with no reverse proxy in the default dev setup. One malicious request can starve all other users. Adding a `MAX_REQUEST_BYTES` constant (~20 MB) and a 413 rejection before the read costs three lines.

**Complexity:** M — add constant `MAX_REQUEST_BYTES = 20 * 1024 * 1024`; in `_read_json()` reject with 413 if `content_length > MAX_REQUEST_BYTES`; add the same check in the Stripe webhook raw-body read at line 3676-3677.

**Files:** `app_server.py:2899-2902` (`_read_json`), `app_server.py:3676-3677` (webhook handler)

---

### E10 — Export exists but there is no import endpoint — backups are unrestorable (M)
**What:** `GET /api/account/export` at `app_server.py:3129-3188` produces a complete JSON dump of user state, model logs, agent traces, and uploaded file metadata. There is no corresponding `POST /api/account/import` endpoint. The export JSON even includes an `exportFormat: 1` version field, signalling intent for a future importer — but that importer was never built.

**Why it matters:** Users who export their data for backup, account migration, or GDPR reasons cannot restore it. The export file is therefore a dead artefact. For a SaaS product with a "data export" compliance feature, the absence of restore makes the export promise hollow.

**Complexity:** M — add `POST /api/account/import` that: (1) reads the export JSON; (2) validates `exportFormat == 1`; (3) passes `payload["state"]` through `sanitize_state()`; (4) calls `save_state()`. No image files are restored (note that in the export body); document this clearly. Add one integration test.

**Files:** `app_server.py` (new handler near line 3129); `tests/agent/account_export_delete_test.py`

---

## 2026-05-31

### E11 — Four GC functions defined but never called — DB grows forever (S)
**What:** `gc_expired_sessions()`, `gc_expired_password_reset_tokens()`, `gc_old_server_errors()`, and `gc_old_rate_limit_rows()` are all fully implemented in `app_server.py` (lines 1019, 1485, 1495, 1503) and are tested individually in `session_expiry_test.py`, `server_errors_test.py`, and `rate_limit_test.py`. None of them are called anywhere outside those tests — not at startup, not on a timer, not on any request. Every expired session row, every used/expired password reset token, every server error older than 30 days, and every stale rate-limit counter window persists in the DB forever. The `main()` function at line 4631 only calls `init_db()` and `serve_forever()`.

**Why it matters:** On a live deployment this is a slow leak. Rate-limit counters alone create two rows per user per active hour/day window; after a year of moderate use the table will have tens of thousands of orphan rows, degrading the `BEGIN IMMEDIATE` lock contention in `check_and_record_rate_limit()`. Sessions never expire from the DB even though `SESSION_LIFETIME_DAYS` is enforced at the query level, wasting storage. The fix is trivial: add a background thread (or a per-request probabilistic trigger) that calls all four GC functions with a fresh connection. No schema changes, no new logic.

**Complexity:** S — one new helper `_run_gc()` that calls all four GC functions, invoked as a daemon thread at startup (every 6 hours). Five lines of new code.

**Files:** `app_server.py:1019, 1485, 1495, 1503, 4631-4638`

---

### E12 — HTML responses served with no security headers (S)
**What:** The `_STATIC` handler in `do_GET()` (line 2995-3005) serves `landing.html`, `index.html`, `privacy.html`, and `terms.html` with only `Content-Type` and `Cache-Control` headers. There are no `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, or `Referrer-Policy` headers. The JSON API sends `Access-Control-Allow-Origin: *` on every endpoint (lines 2883, 2894, 2905, 2965), including authenticated ones.

**Why it matters:** Without `X-Frame-Options: SAMEORIGIN`, the app pages can be embedded as iframes for clickjacking attacks. Without `X-Content-Type-Options: nosniff`, older browsers can MIME-sniff responses. For a commercial app handling user reading data and payment flows, these headers are baseline hygiene expected by any security scanner. The fix is 4-5 header lines added to the static-file response block and one helper method that emits them consistently.

**Complexity:** S — add `_send_security_headers()` helper; call it in `do_GET()` for HTML responses. Touch: `app_server.py:2995-3005`.

**Files:** `app_server.py:2890-2909, 2995-3005`

---

### E13 — Static files read from disk on every HTTP request (S)
**What:** The `_STATIC` dict in `do_GET()` at line 2983 is rebuilt as a local variable on every request, and each file is read fresh with `(BASE_DIR / filename).read_bytes()` (line 2997) on every hit — no in-memory cache. `app.js` (~115 KB), `styles.css` (~100 KB), and `landing.html` change only on deploy. On a busy server serving the PWA to mobile users, this means repeated disk I/O for large files that never change at runtime.

**Why it matters:** Moving the preload to module-level startup (read once, store bytes in a dict) eliminates all per-request disk reads for static files. Combined with the E3 ETag/304 optimization (already in explore.md but not yet backlogged), this halves the work for cache-hit requests too. The change is safe: `serve_forever()` in a `ThreadingHTTPServer` has no file-watch mechanism; files would only refresh on server restart anyway.

**Complexity:** S — preload `_STATIC_CACHE: dict[str, bytes]` at module level or in `main()` before `serve_forever()`. Swap `content = (BASE_DIR / filename).read_bytes()` to a dict lookup. Touch: `app_server.py:2983-3005`.

**Files:** `app_server.py:2983-3005`

---

### E14 — `renderTimeline` and `renderConnections` also fire on every keystroke without debounce (S)
**What:** `els.sessionSearch.addEventListener("input", renderTimeline)` at `app.js:3575` and `els.connectionSearch.addEventListener("input", renderConnections)` at `app.js:3420` both trigger their respective full DOM rebuild on every character typed. `renderQuotes()` was flagged in E5 for the same pattern. All three search inputs share the same anti-pattern: no debounce wrapper, no `requestAnimationFrame` batching. The session timeline iterates all sessions and quotes; the connections panel iterates all connections with two-sided label resolution.

**Why it matters:** Users with many sessions or connections experience keystroke lag, especially on low-end mobile browsers. A 200ms debounce (the same fix proposed for `renderQuotes` in E5) applied consistently to all three search inputs would eliminate the jank at negligible implementation cost.

**Complexity:** S — define a single `debounce(fn, ms)` utility in `app.js`, wrap all three search-input event listeners. Touch: `app.js:3420, 3575-3576`. (E5 already covers `renderQuotes`; this item covers the two missed cases.)

**Files:** `app.js:3420, 3575-3576, 610, 1122`

---

### E15 — `model_logs` and `agent_metrics` tables have no row cap — unbounded growth for active users (M)
**What:** `model_logs` is written on every LLM/OCR call (line 1534); `agent_metrics`, `agent_traces`, `agent_trace_events`, and `agent_actions` are written on every agent pipeline run (lines 2221, 2234, 2319, 2472). None have a per-user row cap or a time-based pruning job. The GC functions (`gc_old_server_errors`, `gc_old_rate_limit_rows`) exist for the auxiliary tables but not for the primary observability tables. A Plus user who makes the full daily 240 chat requests × 365 days accumulates 87,600 `model_logs` rows, each containing the full system prompt (1–3 KB) — around 200 MB per year, per heavy user, in a single `state_json`-adjacent SQLite file.

**Why it matters:** SQLite performance degrades as tables grow past tens of thousands of rows when queries scan without covering indexes. `list_logs()` already caps the query at `LIMIT 30`/`100`, so query results stay fast — but the table scan to reach `ORDER BY created_at DESC LIMIT 30` still touches all rows unless the index is used. A simple `gc_old_model_logs(keep_days=90)` function (delete rows older than 90 days, keep last 500 per user) would cap growth without data loss for the debugging use case.

**Complexity:** M — add `gc_old_model_logs()` and `gc_old_agent_data()` functions; add them to the `_run_gc()` call proposed in E11. Verify that `list_logs()` and `summarize_metrics()` indexes survive. Touch: `app_server.py:1562-1577` (check indexes), new GC functions near line 1503.

**Files:** `app_server.py:332-399, 1495-1513, 1534-1560`
