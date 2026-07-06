# Exploration — new optimization directions

Appended by Agent3 (daily 03:00 CST). Each run adds a dated section.
Strong ideas should also be promoted into `backlog.md` as new OPT-NNN items.

---

## 2026-05-30

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

## 2026-05-31

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

## 2026-06-02

### E23 — `resolve_user_from_token` issues a DB write on every authenticated request — unnecessary write churn on read-heavy workload (S)
**What:** `resolve_user_from_token()` at `app_server.py:1262` unconditionally issues `UPDATE sessions SET last_seen_at = ? WHERE token = ?` on every call, even for purely read-only requests (`GET /api/session`, `GET /api/model-logs`, `GET /api/account/plan`). The mobile PWA calls `/api/session` on every app open and each tab-focus event, triggering a write per open. With multiple browser tabs or a polling debug dashboard, this creates a steady write-lock storm on the SQLite file — even idle browse sessions hold a write lock momentarily on every GET.

**Why it matters:** SQLite serialises writes with `BEGIN IMMEDIATE`; each `last_seen_at` update briefly blocks all concurrent readers including the `/api/chat/stream` SSE connections that must not stall. A threshold-based update (write only if `time.time() - last_seen_epoch > 300`) reduces write frequency by ~10–20× for an active user without changing session-expiry semantics (the read path still checks the staleness against `SESSION_LIFETIME_DAYS`).

**Complexity:** S — in `resolve_user_from_token()` at line 1256–1263, add: `if time.time() - last_seen_epoch > 300:` before the `conn.execute("UPDATE sessions …")` call. Two-line change, no schema changes, no tests need updating.

**Files:** `app_server.py:1241-1264` (`resolve_user_from_token`)

---

## 2026-06-03

### E27 — No Web App Manifest — Android/standard Chrome users cannot install the app (S)
**What:** `index.html` has Apple-specific PWA meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title`) but no `<link rel="manifest">` and no `manifest.json`. The Web App Manifest is the standard cross-platform mechanism for installable PWAs; without it, Android Chrome's "Add to Home Screen" banner never fires, and the installed experience has no defined `start_url`, `display: standalone`, or branded `theme_color`. The Apple-only path already works, but Android and desktop Chrome users are left out.

**Why it matters:** The app is designed as a mobile-first reading tracker — install friction directly affects daily active use. Adding a manifest is a 15-line JSON file plus one `<link>` tag. The existing `apple-touch-icon.png` asset can be reused as the PWA icon. Serving the manifest through the existing `_STATIC` dict requires one extra entry.

**Complexity:** S — create `manifest.json` (~15 lines) with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `icons`; add `<link rel="manifest" href="/manifest.json">` to `index.html` and `landing.html`; add `"/manifest.json"` to `_STATIC` in `app_server.py:3404-3415`.

**Files:** new `manifest.json`; `index.html:5-12` (meta head block); `landing.html` (head block); `app_server.py:3404-3415` (_STATIC dict)

---

### E30 — Form inputs have no `maxlength` — pasting large text creates unbounded state documents (S)
**What:** None of the form inputs in `index.html` have `maxlength` attributes: the book title input (line 379), author input (line 380), notes textarea (line 402), quote content textarea (`id="quoteContent"`, line 459), reflection textarea (line 470), session note textarea (line 426), and connection thought textarea (line 607). The backend's only length guard is the 20 MB request cap in `_read_json()` and a 2000-char cap for chat messages (`app_server.py:2152`). A user accidentally pasting a chapter of text into the quote content field creates a state blob that is valid to the backend but semantically broken — it inflates `PUT /api/state` payloads, bloats the SQLite `state_json` column, and inflates the context that `PromptBuilder` injects into chat prompts. There is no user-facing warning that a field is unreasonably long.

**Why it matters:** `maxlength` is a single-attribute client-side guard that prevents accidental paste of large blobs, keeps state documents compact, and gives users immediate feedback. Reasonable limits: book title 200, author 100, notes/reflection 2000, quote content 5000, connection thought 2000. None of these cap legitimate use cases.

**Complexity:** S — add `maxlength` to each text/textarea input in the relevant dialogs in `index.html`. No backend changes required (existing validations remain as server-side guard). Touch: `index.html:379-402, 426, 459, 470, 607`.

**Files:** `index.html:379, 380, 402, 426, 459, 470, 607`

---

## 2026-06-04

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

## 2026-06-05

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

### E51 — WAL file never checkpointed explicitly — unbounded WAL growth silently inflates disk usage between GC runs (S)

**What:** `get_conn()` sets `PRAGMA journal_mode = WAL` once at startup (`app_server.py:334`). SQLite WAL mode auto-checkpoints when the WAL reaches 1000 pages (default `PRAGMA wal_autocheckpoint`), but auto-checkpoint uses `PASSIVE` mode — it does not reclaim disk space (does not shrink the WAL file). The WAL file (`app_state.db-wal`) can therefore grow indefinitely if checkpoints do not complete: under concurrent read load, a `PASSIVE` auto-checkpoint finds readers in the WAL and leaves pages unclaimed. The `_run_gc()` thread already runs every 6 hours on a dedicated connection — it is the natural place to issue `PRAGMA wal_checkpoint(TRUNCATE)`, which waits for all readers to vacate and then resets the WAL file to zero bytes.

**Why it matters:** A production server doing 240 writes/day accumulates a growing WAL file that is never explicitly truncated. Over weeks of sustained use the WAL can reach tens of MB, all of which is disk space that could be reclaimed with one SQL statement. The fix is one line added to `_run_gc()`.

**Complexity:** S — add `conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")` at the end of the `_run_gc()` try-block (`app_server.py:5236-5242`). No schema changes, no new dependencies. The call is a no-op if no WAL pages need flushing (safe to call unconditionally). Touch: `app_server.py:5236-5244`.

**Files:** `app_server.py:5229-5247` (`_run_gc`); `tests/agent/gc_thread_test.py` (add checkpoint assertion)

---

## 2026-06-08

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

## 2026-06-16

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

## 2026-06-23

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

## 2026-06-24

### E112 — 摘抄卡片缩略图（OPT-052 新增）缺少 `onerror` 回退，图片 URL 失效时显示浏览器破图图标 (S)

**What:** `renderQuotes()` 在 `app.js:1455-1457` 中为有 `imageUrl` 的摘抄卡片渲染 `<img>` 标签，但无 `onerror` 处理：

```js
// app.js:1455
${quote.imageUrl
  ? `<img src="${resolveImageUrl(quote.imageUrl)}" alt="摘抄图片" />`
  : '<div class="entry-cover-fallback"></div>'}
```

相比之下，书籍卡片在 `app.js:1162` 渲染后调用 `bindBookCoverImageFallback(card)`（`app.js:229-250`），为每张图片绑定 `error` 事件监听器，失效时优雅回退到 `DEFAULT_BOOK_COVER_URL` 并添加 `has-default-cover` class。摘抄卡片缺少同等保护：图片 URL 失效（文件被删除、上传错误、服务器迁移）时显示浏览器原生破图图标而非灰色占位图。

**Why:** OPT-052 添加了缩略图功能，但遗漏了错误处理。书籍卡片和摘抄卡片应对图片错误有一致行为。Theme 1「采集顺滑」的可靠性目标包括视觉层面的可靠性：旧摘抄图片失效后不应在列表里留下破图图标。

**Complexity:** S — 在 `renderQuotes()` 完成后对新渲染的摘抄卡片图片调用类似 `bindBookCoverImageFallback` 的函数，或在模板 `<img>` 标签上加 `onerror` 内联属性（但 CSP 友好的做法是后者的事件委托形式）。

**Files:** `app.js:1454-1457`（fix 点）、`app.js:229-250`（`bindBookCoverImageFallback` 参考模式）、`app.js:1162`（书籍卡片调用点）

**northstar:** 中——Theme 1「采集顺滑」视觉可靠性分支；图片 URL 失效是真实场景（数据迁移、磁盘清理），破图图标破坏「不假思索信任工具」的体感。

---

### E113 — `buildQuoteSearchCard()` OPT-052 后未同步：全局搜索摘抄结果永远显示灰色占位图 (S)

**What:** OPT-052 在 `renderQuotes()` 的摘抄卡片模板（`app.js:1447-1467`）中加入了条件缩略图渲染，但全局搜索中的摘抄卡片函数 `buildQuoteSearchCard()`（`app.js:1193-1215`）未同步更新——封面区域硬编码为永远显示灰色占位图，即使摘抄有 `imageUrl`：

```js
// app.js:1199-1201 — always fallback, no conditional
<div class="entry-card-cover">
  <div class="entry-cover-fallback"></div>
</div>
```

而 `renderQuotes()` 的摘抄卡片（`app.js:1455`）在 `quote.imageUrl` 存在时正确显示 `<img>`。用户在「摘抄」标签页看到带照片缩略图的 OCR 摘抄卡片，切到全局搜索结果里同一张摘抄却变成灰色方块——同一条数据、两种截然不同的视觉呈现。

**Why:** OPT-052 引入了摘抄缩略图概念，但只更新了一条渲染路径，`buildQuoteSearchCard` 是被遗漏的渲染路径。这会造成视觉不一致（「为什么搜索结果里看不到我拍的照片？」），以及 OCR 卡片在全局搜索中缺少可视化标记，影响识别效率。

**Complexity:** S — 将 `buildQuoteSearchCard`（`app.js:1199-1201`）的封面区域改为与 `renderQuotes` 相同的条件渲染逻辑；同时在渲染后绑定 `onerror` 处理（与 E112 可合并为同一 PR）。

**Files:** `app.js:1193-1215`（`buildQuoteSearchCard` 函数，封面模板区域）

**northstar:** 中——Theme 1 完整性；全局搜索是「回顾」链路的关键入口，视觉一致性直接影响对工具的信任感；OPT-052 产生的代码不一致在此处对用户可见。

---

### E114 — 摘抄详情弹窗顶部图片同样无 `onerror`，URL 失效时弹窗顶部显示破图图标 (S)

**What:** `openQuoteDetail()` 在 `app.js:2244-2251` 设置详情弹窗的 `<img>` src，无任何错误处理：

```js
// app.js:2247
const img = document.getElementById("quoteDetailImg");
if (quote.imageUrl) {
  img.src = resolveImageUrl(quote.imageUrl);
  imgWrap.classList.remove("is-hidden");
} else {
  imgWrap.classList.add("is-hidden");
}
```

若图片 URL 失效，`imgWrap` 已 `remove("is-hidden")`，弹窗顶部整个图片区域会显示浏览器破图图标并占据大量视觉空间。理想行为：`onerror` 时将 `imgWrap` 重新 `add("is-hidden")`，等效于「无图片」状态。

**Why:** 与 E112 同属「OPT-052 系列视觉可靠性补全」；详情弹窗是查看摘抄的主要交互路径，破图图标在此处的视觉冲击比列表卡片更强（占弹窗上方 30%+ 的区域）。三处（列表卡片 / 搜索卡片 / 详情弹窗）统一处理能彻底关闭此类问题。

**Complexity:** S — 在 `app.js:2247` 的 `img.src = ...` 后加一行 `img.onerror = () => imgWrap.classList.add("is-hidden")`；可与 E112/E113 合并为单个 PR。

**Files:** `app.js:2244-2251`（`openQuoteDetail` 中的图片赋值区域）

**northstar:** 中——与 E112 共同构成 OPT-052 视觉可靠性闭环；三处统一修复方能避免遗漏渲染路径再次出现同类问题。

---

## 2026-06-25

### E115 — 搜索输入框每次按键触发全量 DOM 重建，无防抖处理 (S)

**What:** `app.js:4175-4176` 和 `app.js:3956` 中三个搜索输入框直接以原始渲染函数作为事件处理：

```js
// app.js:4175
els.sessionSearch?.addEventListener("input", renderTimeline);
// app.js:4176
els.quoteSearch?.addEventListener("input", renderQuotes);
// app.js:3956
els.connectionSearch?.addEventListener("input", renderConnections);
```

`renderQuotes()`（`app.js:1401-1469`）在 `app.js:1433` 执行同步 `innerHTML` 全量重建：
`els.quotesList.innerHTML = quotes.map(...).join("")`。
对比 `renderBooks()`（`app.js:1269-1317`）使用了 `BATCH=8` + `requestAnimationFrame` 批量渲染（`app.js:1301-1317`），`renderQuotes` 无类似保护。
每一次按键 → 立即触发全量 DOM 重建，移动端大量 OCR 摘抄卡片场景下每次按键约 200–500ms 同步卡顿（JS 主线程阻塞）。
此问题在 explore.md 2026-05-30 E5 和 2026-06-02 E30 均有记录，但从未被提拔为 backlog 条目。

**Why it matters:** Theme 1 验收「零『等太久放弃』」不仅针对 OCR 采集，也针对事后使用体验。积累 100 张以上 OCR 摘抄卡片后，在摘抄标签搜索时每次按键都卡 200ms+ 是典型「低头看手机 → 放弃使用」的场景。防抖 250ms + `renderQuotes` 接受 filter 参数两处改动即可解决。

**Complexity:** S — 在三处 `addEventListener` 外加 `debounce()` 包裹（若无工具函数则内联 `setTimeout/clearTimeout` 模式，约 5 行）；`renderQuotes`/`renderTimeline`/`renderConnections` 各接收一个可选 filter 字符串参数，内部做过滤后再走现有渲染逻辑。

**Files:** `app.js:4175-4176`（`quoteSearch`/`sessionSearch`）；`app.js:3956`（`connectionSearch`）；`app.js:1401-1469`（`renderQuotes`）

**northstar:** 中——搜索是「回顾」链路的入口动作；按键卡顿是 Theme 1「不假思索默认工具」的直接障碍；S 改动消除积累量增长后的体验悬崖。

---

### E116 — `_run_gc()` 不清理可观测性表：`model_logs`/`agent_traces` 随使用无限增长 (S)

**What:** `app_server.py:5451-5469` 的 `_run_gc()`（每 6 小时执行一次）只调用 4 个 GC 函数：

```python
# app_server.py:5458-5461
gc_expired_sessions(conn)
gc_expired_password_reset_tokens(conn)
gc_old_server_errors(conn)
gc_old_rate_limit_rows(conn)
```

以下可观测性表无任何自动清理：
- `model_logs`（`app_server.py:390-402`）：每次 LLM 调用写入完整 prompt + response，行体积 2–5KB
- `agent_traces`（404-420）、`agent_trace_events`（438-445）、`agent_actions`（422-436）、`agent_metrics`（447-457）

唯一清理路径是账户删除（`app_server.py:5410-5417`）。以每日 2-3 次聊天 + 1-2 次 OCR 估算：每日约 10 行 × 平均 3KB = 30KB/day；半年约 5MB、一年超 10MB——体积本身不严重，但 `model_logs` 存全量 prompt（含书单 + 摘抄列表 JSON），随书籍积累单行可超 10KB，一年后总量可达数十 MB。

**Why:** 用户感知 impact 为零（SQLite 文件膨胀不影响请求速度），属后端存储卫生。在阶段 A（个人工具）下优先级极低，但若未来向多用户开放（阶段 B/C），每位用户的可观测性数据都无 GC，将成为磁盘压力。

**Complexity:** S — 新增两个 GC 函数（`gc_old_model_logs(conn, days=90)` 和 `gc_old_agent_data(conn, days=30)`），在 `_run_gc()` 末尾调用；90 天和 30 天门槛满足调试回溯需求。

**Files:** `app_server.py:5451-5469`（`_run_gc`）；`app_server.py:390-457`（表 schema 参考）

**northstar:** 弱——当前规模下用户不可感知；仅存储卫生修复，P3 parked 候选。

---

### E117 — 非超时类聊天流式错误缺少内联重试按钮，错误后无恢复路径 (S)

**What:** `chat.js:702-719` 的错误处理区分了三种路径：

```js
// chat.js:702-719
if (err.name === "AbortError") {
    renderStreamTimeout(msgDiv, retryFn, "超时");  // → 有重试按钮
} else if (data.error_type === "rate_limited") {
    appendMessage("assistant", /* 限流样式消息 */);  // → 无重试按钮
} else {
    appendMessage("assistant", `出错了：${message}`);  // → 无重试按钮
}
```

`renderStreamTimeout()`（`chat.js:724-744`）创建重试按钮，仅由 `AbortError`（30s 空闲超时）路径触发。
限流（429）和其他运行时错误（502/503/网络中断）在 UI 层无重试入口；用户只能手动重新输入刚才的问题。
OPT-069（PR #50）正在为后端 `call_deepseek_stream()` 添加自动重试；但若重试耗尽后仍失败，前端依然无 UI 级重试。

**Why:** 移动网络环境下短暂中断属常见场景；出错后用户需手动重输问题——这正是「走走停停」体验（roadmap §2 北极星反面）。`renderStreamTimeout` 的按钮逻辑已存在，复用到 `rate_limited` 和通用错误路径只需约 10 行改动，将一条死胡同变为一键恢复。

**Complexity:** S — 将 `renderStreamTimeout()` 中的重试按钮逻辑提取为通用 `appendRetryButton(container, retryFn, label)` 函数，在 `rate_limited` 和通用 `else` 分支复用。`retryFn` 已在 `catch` 作用域内可访问。

**Files:** `chat.js:702-719`（错误处理分支）；`chat.js:724-744`（`renderStreamTimeout`，重试按钮参考实现）

**northstar:** 中——聊天是 Theme 2「回顾有价值」的核心动作；出错无法一键重试直接阻断探讨流；S 改动把错误状态从「死胡同」变为「可自愈节点」。

---

### E118 — `connectionDialog` `showModal()` 后无 `focus()`：移动端需点两次才能输入 (S)

**What:** `openConnectionDialog()`（`app.js:3761-3785`）和 `openConnectionForEdit()`（`app.js:3863-3889`）均以 `els.connectionDialog.showModal()` 结束，无后续 `focus()` 调用：

```js
// app.js:3784
els.connectionDialog.showModal();
// （无后续 focus 调用）
```

对比已知问题 OPT-058（摘抄新增对话框）和 OPT-061（阅读记录对话框）—— 这两个 dialog 也有相同的 `showModal()` 无 `focus()` 问题，均已 triaged。`connectionDialog` 是第三个相同模式的对话框，但尚未进入 backlog。`thought` 字段（核心文本输入）是 `connectionDialog` 的主要交互目标。

**Why:** iOS Safari 下 `<dialog>.showModal()` 不自动聚焦第一个可输入元素，用户必须手动点击输入框才能激活键盘。对于 `connectionDialog` 这类低频功能（添加联系 / 编辑联系），额外的点击步骤在移动端是明显的摩擦，但鉴于使用频率低于 OCR 摘抄路径，影响优先级低于 OPT-058/061。

**Complexity:** S — 在两处 `showModal()` 之后分别添加 `setTimeout(() => els.thoughtInput?.focus(), 50)` 或直接 `els.thoughtInput.focus()`（同 OPT-058/061 修复模式）。可与 OPT-058/061 同 PR 批量修复三个对话框。

**Files:** `app.js:3784`（`openConnectionDialog`）；`app.js:3889`（`openConnectionForEdit`）

**northstar:** 弱——连接功能使用频率低，不在 Theme 1/2 核心路径上；建议与 OPT-058/061 合并修复，避免单独开 PR 占预算。

---

## 2026-06-26

### E120 — 自定义摘抄标签仅存 `localStorage`，跨设备不同步，备份导出中不存在 (M)

**What:** `getCustomQuoteTags()` 和 `saveCustomQuoteTags()`（`app.js:460-464`）将用户自定义摘抄标签完全存储在浏览器 localStorage 中：

```js
// app.js:460-464
function getCustomQuoteTags() {
  try { return JSON.parse(localStorage.getItem("quote-custom-tags") || "[]"); } catch { return []; }
}
function saveCustomQuoteTags(tags) {
  localStorage.setItem("quote-custom-tags", JSON.stringify(tags));
}
```

`sanitize_state()`（`app_server.py:633-667`）维护的 server-side state schema（`books/sessions/quotes/connections/chatHistories/chatContexts`）完全不包含 `customQuoteTags` 字段。用户在 iPhone 上建立的标签体系在 `/api/account/export` 导出包中不存在，换设备或清浏览器缓存后标签选项丢失（摘抄 `tags` 字段中已打的字符串保留，但新增摘抄时不再出现这些选项，体验混乱）。E7（2026-05-30）已记录此问题，至今未提拔为 backlog。

**Why it matters:** 自定义标签是用户对摘抄进行主题分类的工具，是 Theme 2「回顾有价值」里「按主题检索」路径的基础。标签体系越积累越难补救——一旦清缓存或换设备，历史摘抄的标签过滤入口消失，造成数据孤岛。

**Complexity:** M — 将 `customQuoteTags` 添加到 `sanitize_state()` schema；`saveCustomQuoteTags()` 改为同时写 localStorage（快速 UI 响应）+ 调用 `save_state()`（持久化）；`getCustomQuoteTags()` 优先从 server state 读，回退 localStorage；需要更新相关测试。

**Files:** `app.js:460-464`（`getCustomQuoteTags`/`saveCustomQuoteTags`）；`app_server.py:633-667`（`sanitize_state` schema）

**northstar:** 中——Theme 2「回顾有价值」以标签一致性为前提；Owner 目前单设备使用不可感知，但标签越积累越难补救，Theme 2 开始前修复最合适。

---

### E121 — 静态文件每次请求从磁盘重读，`_STATIC` 字典在 `do_GET()` 内重建，无内存缓存 (S)

**What:** `do_GET()` 内（`app_server.py:3616`）的 `_STATIC` 字典是局部变量，每次 HTTP 请求都重新创建；匹配到静态路径后，文件内容通过 `(BASE_DIR / filename).read_bytes()`（`app_server.py:3630`）从磁盘读取；`Cache-Control` 设为 `no-store, no-cache, must-revalidate`，浏览器不缓存，每次刷新都重新下载：

```python
# app_server.py:3616 — dict 在函数内，每次重建
_STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    ...
}
# app_server.py:3630 — 每次请求读磁盘
content = (BASE_DIR / filename).read_bytes()
```

此问题已在 explore.md E3（2026-05-30）和 E13（2026-05-31）两次记录，均未提拔为 backlog 条目。

**Why it matters:** 对于阶段 A 个人工具，SSD 随机读 <1ms，性能改善完全不可感知。阶段 B/C 下静态文件内存缓存是标准优化，但依然属于后端性能卫生——长期正确解法是 nginx 反代，而非改 Python 代码。

**Complexity:** S — 将 `_STATIC` 提至模块级常量，首次访问时缓存字节；但 northstar 贡献极弱，建议继续 park，不提拔为 backlog。

**Files:** `app_server.py:3616-3638`（`do_GET` 静态文件分支）

**northstar:** 弱——当前单用户规模下用户完全不可感知；E3/E13 多次记录均未提拔有其道理，建议继续 park，不占预算。

---

### E122 — `renderTimeline()` 不含书籍里程碑事件（startedAt/finishedAt），阅读历程在时间线 Tab 不可见 (M)

**What:** `renderTimeline()`（`app.js:1321-1399`）仅从 `state.sessions` 构建时间线，书籍的 `startedAt`/`finishedAt` 里程碑完全不出现：

```js
// app.js:1321-1333 — allSorted 只包含 sessions
const allSorted = (state.sessions || []).slice().sort(
  (a, b) => (b.date || "").localeCompare(a.date || "")
);
```

`book.startedAt` 和 `book.finishedAt` 已由 `saveSession()` 自动填充（`app.js:2135-2138`），但时间线的 `allSorted` 数组从不包含它们。用户读完一本书，时间线只有若干 session 卡片，没有「📖 开始阅读《XXX》」和「✅ 读完《XXX》」里程碑事件，无法一眼看出某本书的读书区间。与 E119 共享同一数据来源，是「书籍日期数据」的另一个展示维度。

**Why it matters:** Theme 2「回顾有价值」北极星代理指标「本周回顾操作次数」——「我什么时候读完这本书」是最自然的回顾问题。里程碑事件让时间线从「session 日志」升级为「阅读历程图」，是 Theme 2 开始前的价值感基础设施。

**Complexity:** M — 从 `state.books` 提取所有有 `startedAt`/`finishedAt` 的书，构建里程碑事件对象列表，与 `sessions` 合并排序后渲染；为里程碑设计专属卡片模板；`searchRaw` 过滤对里程碑事件按书名过滤；无后端/DB schema 改动。

**Files:** `app.js:1321-1399`（`renderTimeline`）；`app.js:2135-2138`（`startedAt`/`finishedAt` 数据来源参考）

**northstar:** 中——直接支撑 Theme 2「回顾有价值」；时间线升级为阅读历程图是北极星「从拍照摘抄到事后回顾」闭环的关键一环；依赖 E119 的数据（已存在，无需新采集路径）。

---

## 2026-06-27

### E124 — `renderTimeline()` 硬上限 10 条，无分页/「加载更多」，阅读历史超 10 次后全部不可见 (M)

**What:** `renderTimeline()`（`app.js:1321-1399`）在无搜索词时将结果截断为 10 条：

```js
// app.js:1337
const sessions = searchRaw
  ? allSorted.filter(...)   // 搜索时：无限制，全量返回
  : allSorted.slice(0, 10); // 无搜索时：仅显示最近 10 条
```

截断是静默的——没有文案提示用户还有更多数据。对比「摘抄」标签页（`renderQuotes()`，`app.js:1401-1469`）显示全部摘抄（无数量上限）、「书单」标签页（`renderBooks()`，`app.js:1269-1317`）同样显示全量，「记录」是唯一有硬上限的标签页。用户即使搜索书名可以看到超 10 条的结果，但无法按时间顺序浏览完整阅读历史。

**Why it matters:** 「记录」标签页是 Theme 2「回顾有价值」北极星代理指标「本周回顾操作次数」的核心落地界面。如果用户有 20+ 次阅读记录（正常积累 2-3 个月），10 条上限意味着超过一半的历史对他们不可见，「今年我读了多少书」「《XX》我什么时候开始读的」等自然回顾问题无从用时间线回答——和没有时间线一样，与 Theme 2 验收条件直接冲突。

**Complexity:** M — 方案 A（最简）：移除 `slice(0, 10)`，一次性渲染全量（需评估 DOM 性能，50+ 条时可结合 OPT-072 的防抖 + requestAnimationFrame batching）；方案 B：在截断处添加「加载更多」按钮（`loadMore` state 变量，click 解除 `slice(0, 10)` 重渲）；方案 C：虚拟滚动（复杂度高，当前不必要）。建议方案 B（不破坏首屏渲染速度，并明确告知「还有 N 条更早的记录」）。

**Files:** `app.js:1329-1337`（sessions 计算与截断）；`app.js:1351-1399`（DOM 渲染循环）

**northstar:** 中——Theme 2「回顾有价值」要求完整历史可访问；当前上限在 2-3 个月真实使用后触发，属 Theme 2 验收前的前置修复。

---

### E126 — `renderQuotes()` 在每张摘抄卡中调用 `getConnectionCount()`（O(m) 全量扫描），无缓存导致 O(n×m) 渲染开销，与 `renderBooks()` 已有 `buildRenderCache()` 模式不一致 (S)

**What:** `renderQuotes()`（`app.js:1401-1469`）在每张摘抄卡的 `.map()` 中直接调用 `getConnectionCount(quote.id)`：

```js
// app.js:1464 — 每张卡调用一次
${getConnectionCount(quote.id) > 0 ? ` <span class="quote-conn-badge">🔗 ${getConnectionCount(quote.id)}</span>` : ""}
```

`getConnectionCount()` 定义（`app.js:675-677`）：
```js
function getConnectionCount(itemId) {
  return (state.connections || []).filter(c => c.sourceId === itemId || c.targetId === itemId).length;
}
```

每次调用均对 `state.connections` 做完整遍历（O(m)）。N 张摘抄卡 × M 条 connections = O(N×M) 扫描，每次 `renderQuotes()` 调用均重复。

对比 `renderBooks()`（`app.js:1269-1317`）：在渲染前调用 `buildRenderCache()`（`app.js:630-651`），其中用 O(M) 时间预构建 `connCountMap`（`Map<id, count>`），每张书卡使用 O(1) 查询。`renderQuotes()` 完全缺少同等缓存机制。

**Why it matters:** 单次非搜索渲染时性能损失可忽略（100 摘抄 × 50 connections = 5000 次比较 ≈ <1ms）。但与 OPT-072（无防抖，每次按键触发全量 renderQuotes）叠加后，每次按键触发 5000+ 次字符串比较，在摘抄和关联数双高的用户处产生可感知卡顿。修复与 OPT-072 同 PR 是最自然的时机。

**Complexity:** S — 在 `renderQuotes()` 的 `.map()` 前插入 3 行缓存构建（复用 `buildRenderCache()` 或内联建 `connCountMap`），将 `getConnectionCount(quote.id)` 替换为 `connCountMap.get(quote.id) || 0`；同样适用于两次 `getQuoteChatCount(quote.id)` 调用。与 OPT-072 合并实现「renderQuotes 性能闭环」最合适。

**Files:** `app.js:675-677`（`getConnectionCount` 线性扫描实现）；`app.js:1464`（`renderQuotes` 中的调用点）；`app.js:630-651`（`buildRenderCache` 参考模式）

**northstar:** 弱——当前单用户规模不可感知；仅 OPT-072 实现时的搭车修复候选，否则独立开 PR 性价比低。

---

## 2026-06-28

### E127 — `addBook()` 和 `importExcel()` 绕过书架上限，`ActionExecutor` 以外的写路径无配额校验 (S)

**What:** 配额校验仅位于 `ActionExecutor.execute_action()`（`app_server.py:3069-3078`）：

```python
# app_server.py:3069-3078
book_cap = PLAN_LIMITS[plan]["book_cap"]
if book_cap and len(state["books"]) >= book_cap:
    return ExecutionResult(False, ACTION_STATUS_FAILED, ...)
```

前端直接写路径完全绕过此校验：
- `addBook()`（`app.js:2115-2158`）：直接将新书 push 到 `state.books` 并调用 `syncState()`，无任何 `book_cap` 检查
- `importExcel()`（`app.js:3341-3417`）：在循环中直接向 `state.books` 追加书籍，同样无配额检查

后端 `save_state()`（`app_server.py:699-708`）和 `do_PUT()` 的 `/api/state` handler（`app_server.py:5348-5387`）均直接 sanitize 并写入，不做配额拦截。测试文件 `tests/agent/plan_tier_test.py:138-162` 仅覆盖 ActionExecutor 路径，未覆盖直接 state save 路径。

**Why it matters:** 免费用户通过 UI 的「加书」按钮或 Excel 批量导入可绕过 10 本上限，积累任意数量的书籍。由于 billing 当前冻结（roadmap §1 决策：`billing 代码冻结`），此问题在阶段 A 无实际危害；但 roadmap §1 写明「升级到 B 才激活 billing」，届时此旁路是一个现成的逃费路径。

**Complexity:** S — 在 `addBook()`（`app.js:2115`）调用 `syncState()` 前插入配额检查（读 user plan 或直接前端软限制）；`importExcel()` 在循环体内做同等检查。可选后端收口：在 `do_PUT /api/state` handler 中对 books 数量做拦截，确保无论哪条写路径都不能突破上限。

**Files:** `app.js:2115-2158`（`addBook`）；`app.js:3341-3417`（`importExcel`）；`app_server.py:5348-5387`（`do_PUT /api/state`）；`app_server.py:3069-3078`（现有校验参考）；`tests/agent/plan_tier_test.py:138-162`（需补直接 state save 路径测试）

**northstar:** 弱/none — billing 冻结，P3 候选；阶段 A 下无实际用户影响；记录以备升级阶段 B 时知道漏洞位置。

---

### E128 — `buildQuoteSearchCard()` 定义但从无调用者，是 OPT-070 待修复的死代码目标 (S)

**What:** `app.js:1269-1291` 定义了 `buildQuoteSearchCard()` 函数。对全文件 grep `buildQuoteSearchCard` 的结果：该名称仅在定义行（1269）出现，**无任何调用点**。函数体本身在 1269-1291 行：

```js
// app.js:1269 — 仅此一处，无调用者
function buildQuoteSearchCard(quote, book) {
  ...
  return card;
}
```

OPT-070（`status: triaged`）的 description 明确写道：「全局搜索摘抄卡片函数 `buildQuoteSearchCard()`（`app.js:1193-1215`）未同步更新……封面区域硬编码为灰色占位图」——但如果该函数根本没有调用者，那么 OPT-070 所描述的「全局搜索结果显示灰色方块」实际上不可能通过此函数触发。OPT-070 的修复对象（全局搜索摘抄视觉）若确实存在，其真实代码路径不在 `buildQuoteSearchCard()`。

注：`E113`（2026-06-24）和 OPT-070（`status: triaged`）均基于此函数，但两者均未确认调用者。如果全局搜索路径实际走了另一个函数，则 OPT-070 的实现需要先找到正确的调用路径再修复。

**Why it matters:** 死代码（~23 行）是小的代码卫生问题，但它影响 OPT-070 的实现正确性：Agent2 若按 OPT-070 的 how 修复 `buildQuoteSearchCard` 而调用者不存在，修改不会对用户产生任何效果。建议实施 OPT-070 前先确认全局搜索摘抄的真实渲染路径，再决定是修复 `buildQuoteSearchCard` 还是删除它。

**Complexity:** S — 若确认无调用者：删除函数体（app.js 减少 ~23 行），同时更新 OPT-070 的 how 指向正确渲染路径；若找到调用者：修复说明文档，按 OPT-070 修复图片渲染。

**Files:** `app.js:1269-1291`（`buildQuoteSearchCard` 函数定义）；`app.js`（全文搜索调用者，预期 0 处）；`optimization/backlog.md`（OPT-070 需补充调用路径注释）

**northstar:** 弱/none — 纯代码卫生；对用户不可感知；价值在于防止 OPT-070 修复错误目标。建议在 OPT-070 实施前由 Agent2 确认调用路径后再处理。

---

> 本次 run 同时将 E120（customQuoteTags localStorage-only，2026-06-26）和 E122（renderTimeline 不含书籍里程碑，2026-06-26）提拔为 OPT-077/OPT-078 — 两条已有充分代码证据但在此前各轮 run 中仅记录未提拔。

## 2026-06-29

### E129 — 摘抄卡 ⋯ 菜单无「建立关联」入口，需额外两步进详情弹窗才能触发 (S)

**Signal:** 2026-06-29 `signals.md` — 「😖 从摘抄卡片点『建立关联』时，来源没自动填入当前摘抄（还得手动选）」

**What:** `app.js:1528-1531` — 摘抄卡片的 ⋯ 右键菜单：

```js
<ul class="card-context-menu" hidden>
  <li><button type="button" data-quote-menu="chat">去聊</button></li>
  <li><button type="button" data-quote-menu="edit">编辑</button></li>
  <li class="menu-item-danger"><button type="button" data-quote-menu="delete">删除</button></li>
</ul>
```

仅有「去聊」「编辑」「删除」三项，**无「建立关联」选项**。当前从摘抄卡触发关联的唯一路径：点卡片 → 打开详情弹窗 → 点「建立关联」按钮（`app.js:4121-4125`），比 ⋯ 菜单路径多两步。`quoteMenuHandler`（`app.js` ⋯ 菜单分发点）已有 `case "chat"`/`"edit"`/`"delete"` 分支，加 `case "connect"` 完全无结构改动。

**Why it matters:** 「建立关联」是 app 差异化的核心操作（Theme 2 的基础）；每次触发比 ⋯ 菜单多两步，摩擦积累后放弃率上升。从菜单直达可将路径由 3 步压缩至 1 步，对实现代价极低（约 3 行 HTML + 3 行 JS）。

**Complexity:** S

**Files:** `app.js:1528-1531`（菜单 HTML 模板）；`app.js:~1535`（`quoteMenuHandler` switch，加 `case "connect"`）；`app.js:4121-4125`（详情弹窗触发路径，调用签名参考）

**northstar:** 中 — Theme 2「回顾有价值」；关联是 app 差异化功能，从摘抄卡直达「建立关联」消除两步固定摩擦，直接降低关联操作的放弃率；signal 2026-06-29 佐证。

---

### E130 — 关联对话框目标摘抄选择器 `quoteLabel()` 截断至 32 字 + 行内省略号双重截断，同书多摘抄无法区分 (S)

**Signal:** 2026-06-29 `signals.md` — 「目标若选摘抄，关键词搜索后每条摘抄显示不完整（被截断），看不清内容、找不到想关联的那一条」

**What:** `quoteLabel()` 在 `app.js:3812-3817`：

```js
function quoteLabel(q) {
  const book = state.books.find((b) => b.id === q.bookId);
  const bookName = book ? book.title : "未知书籍";
  const content = (q.content || "").slice(0, 32) + (q.content?.length > 32 ? "…" : "");
  return `${bookName} · ${content}`;
}
```

`app.js:3849` 对候选 `<li>` 同时施加 `overflow:hidden;white-space:nowrap;text-overflow:ellipsis`——32 字截断 + CSS 省略号**双重截断**。中文摘抄 32 字极易撞车：同一本书的相邻摘抄在下拉列表中几乎无法辨识。

**Why it matters:** 目标摘抄无法区分 = 无法准确建立关联 = Theme 2 核心路径可用性降为零。这是 owner 2026-06-29 信号明确点名的摩擦点。最小修复：`slice(0, 32)` → `slice(0, 60)`（单行仍可容纳），或将 `<li>` 改为双行（书名一行、内容一行）彻底解决。

**Complexity:** S — `app.js:3815` 一行改动；可选 `app.js:3849` 样式调整为双行布局。

**Files:** `app.js:3812-3817`（`quoteLabel`）；`app.js:3849`（`<li>` style）

**northstar:** 中 — Theme 2「建立关联」核心路径；关联质量取决于能否准确选到目标摘抄；signal 2026-06-29 明确佐证；与 E129 组合为「建立关联」体验的完整修复包。

---

### E131 — 从摘抄上下文触发「建立关联」时，目标类型默认为「书」而非「摘抄」，每次建立 quote→quote 关联需手动切换 (S)

**What:** `openConnectionDialog`（`app.js:3910-3933`）第 3914 行：

```js
const resolvedTargetType = targetType || "book";
```

当从摘抄详情弹窗触发（`sourceType === "quote"`，`targetType` 为 `undefined`）时，目标类型默认为「书」。用户想建立摘抄→摘抄关联（最常见的知识连接场景），必须手动将目标下拉从「书」切换为「摘抄」——是每次操作的固定步骤。

**Why it matters:** 摘抄→摘抄关联是知识建立连接的主流形式；以「书」为默认在 quote 触发上下文违反最小惊讶原则。一行修复即可消除这一固定步骤。

**Complexity:** S — `app.js:3914` 单行：`const resolvedTargetType = targetType || (sourceType === "quote" ? "quote" : "book")`

**Files:** `app.js:3914`（`openConnectionDialog` 目标类型默认值）

**northstar:** 弱/中 — 减少 quote→quote 关联的固定步骤；与 E129/E130 组合构成「建立关联」体验完整修复包；建议三者合并为同一 PR。

---

### E132 — 关联对话框摘抄选择器无搜索时仅展示前 30 条，积累量超 30 条的用户存在可发现性盲区 (S)

**What:** `app.js:3820`（`filteredQuotes` 内）：

```js
if (!query) return allQuotes.slice(0, 30);
```

无搜索词时下拉候选列表最多 30 条，超出部分不可见且无任何提示。用户有 31+ 条摘抄时，只有主动搜索才能发现更多候选；若不记得目标摘抄的关键词，则根本找不到它。

**Why it matters:** 与 E130 配套：即使增大显示字数，若目标摘抄不在候选列表中也无济于事。最小修复：`slice(0, 30)` → `slice(0, 50)` + 若还有更多则加「还有 N 条，请输入关键词搜索」提示文案。

**Complexity:** S — `app.js:3820` 单行改动；提示文案可选（约 5 行）。

**Files:** `app.js:3820`（`filteredQuotes` 默认返回值）

**northstar:** 弱 — 仅影响摘抄积累量超 30 条的用户；当前阶段 A 边缘场景；与 E130 修复时搭车处理成本最低。

---

> 本次 run 将 E129（摘抄卡 ⋯ 菜单无建立关联入口）和 E130（关联目标摘抄标签双重截断）提拔为 OPT-079/OPT-080 — 两条均有 2026-06-29 signal 直接佐证且经 `app.js` 代码核实充分。E131/E132 作为配套项登记，建议与 OPT-079/OPT-080 合并为单一 PR「建立关联体验修复包」。

## 2026-06-30

### E133 — Organize/Candidates 批量采集功能全链路失活：前端完整实现但无 HTML Dialog、无调用者、后端无对应端点 (M)

**What:** `app.js:114-127` 共 11 处 `els.*` 引用——`els.organizeDialog`、`els.candidatesDialog`、`els.organizeRawText`、`els.organizeSubmitBtn`、`els.organizeTabPaste`、`els.organizeTabPhoto`、`els.organizePastePane`、`els.organizePhotoPane`、`els.organizePhotoPreview`、`els.organizePhotoImg`、`els.organizePickPhotoBtn`——均通过 `document.querySelector()` 查询**不存在于 `index.html` 的 DOM 元素**，运行时全部返回 `null`。

`index.html` 全文中无任何 `id="organizeDialog"` 或 `id="candidatesDialog"` 定义（grep 0 匹配）。函数 `openOrganizeDialog()`（`app.js:2808-2822`）是该功能的唯一入口，但**在整个代码库中无任何调用者**（grep `openOrganizeDialog` 仅定义行一处）。

前端在 `submitOrganizePaste()`（`app.js:2862`）调用：
```js
const data = await apiFetch("/api/organize/parse", { method: "POST", ... });
```
但 `app_server.py` 中**无任何 `/api/organize/parse` 端点**（全文 grep 0 匹配）。

即：该功能在三个层次均失活——① HTML Dialog 不存在（11 个 null ref）；② 前端 trigger 无 caller；③ 后端 API 未实现。

**Why it matters:** 该功能实现了一个完整的「粘贴文字 → AI 识别拆分摘抄候选 → 逐条审批保存」批量采集流程（`submitOrganizePaste`→`openCandidatesDialog`→`approveCandidateItem`，共约 150 行 JS + AI 调用链），代码已就绪但完全沉默。若激活：可将用户读书笔记/划线截图中的文字批量转化为摘抄卡片，是 Theme 1「采集顺滑」的强力补充路径——不依赖逐张 OCR，而是文字粘贴批量入库。当前代码是完整的投资，唯一缺失是激活它的「门把手」。

**Complexity:** M — 需补齐三层：① 在 `index.html` 中添加 `<dialog id="organizeDialog">` 和 `<dialog id="candidatesDialog">` 的 HTML（参考 connectionDialog 模式）；② 在书籍详情弹窗（`bookDetailDialog`）或 OCR 入口旁增加一个「整理文字摘抄」触发按钮，调用 `openOrganizeDialog(bookId)`；③ 在 `app_server.py` 新增 `POST /api/organize/parse` 端点（复用现有 `PromptBuilder`/`call_deepseek()`/`ActionExecutor` 链路）。

**Files:** `app.js:114-127`（null refs）；`app.js:2808-2914`（完整前端实现）；`index.html`（缺 Dialog HTML）；`app_server.py`（缺 `/api/organize/parse` 端点）

**northstar:** 中/强（如激活）——批量从文字中提取摘抄，直接支撑 Theme 1「采集顺滑」；现有 OCR 路径仅支持逐图识别，文字粘贴路径覆盖「书中已有电子文字」「读书笔记 App 导出」等场景，是一条尚未开放的高价值采集通道。→ **promoted to OPT-081**

---

### E134 — `renderTimeline()` 阅读统计摘要（sessionStats）仅在搜索时显示，默认无搜索的「记录」Tab 完全不展示累计阅读数据 (S)

**What:** `renderTimeline()`（`app.js:1418-1428`）对 `els.sessionStats` 的控制逻辑：

```js
// app.js:1419-1428
if (els.sessionStats) {
    if (searchRaw && sessions.length) {
        const totalMin = sessions.reduce((sum, s) => sum + Number(s.minutes || 0), 0);
        const totalPages = sessions.reduce((sum, s) => sum + Math.max(0, ...), 0);
        els.sessionStats.textContent = `${sessions.length} 次记录 · 共 ${totalMin} 分钟 · 约 ${totalPages} 页`;
        els.sessionStats.classList.remove("is-hidden");
    } else {
        els.sessionStats.classList.add("is-hidden");  // ← 无搜索时恒隐
    }
}
```

`sessionStats` 仅在 `searchRaw` 为真（用户主动输入搜索词）时显示。默认状态（无搜索、最近 10 条）：聚合数据面板完全隐藏。用户有 30 条历史 session 时，「记录」Tab 的默认视图无任何统计摘要——不显示「共 30 次」「累计 1 800 分钟」「约 2 500 页」。

**Why it matters:** roadmap §2 明确将「本周使用天数」和「本周新增摘抄数」列为北极星代理指标，owner 每周需手动计算。「记录」Tab 默认视图展示全量聚合摘要（总次数 / 总分钟 / 估算总页数）是零成本的数据可见性提升：让 owner 打开「记录」Tab 时立刻感知积累量，不必搜索也不必手算。这也是「不假思索的默认工具」的一个具体表现：app 主动告知阅读量，而非等用户问。

修复极简：将 `if (searchRaw && sessions.length)` 改为 `if (sessions.length)`，同时将统计行文案从「N 次记录」调整为「最近 10 条 · 共 M 次记录 · 累计 T 分钟」（默认视图）。

**Complexity:** S — 仅 `app.js:1419-1428` 的条件判断改动，约 3-5 行；需同步考虑搜索时的文案（当前「N 次记录 · 共 T 分钟 · 约 P 页」适合搜索结果语境，默认视图可用稍不同文案区分）。

**Files:** `app.js:1418-1428`（`renderTimeline` sessionStats 控制块）；`app.js:1408-1416`（`sessions` slice 与 `searchRaw` 变量，修改时参考）

**northstar:** 中——roadmap §2 代理指标「本周使用天数」依赖 session 数据可见；聚合统计让积累量可感知，符合北极星「不假思索的默认工具」体感（app 应该告诉我读了多少，而非让我翻记录）；S 改动，无风险。→ **promoted to OPT-082**

---

### E135 — 关联搜索（`renderConnections` searchRaw 过滤）不匹配 `connection.tags`，按标签词找关联无效 (S)

**What:** `renderConnections()`（`app.js:824-840`）的搜索 haystack：

```js
// app.js:833-839
const haystack = [
    getBookTitle(c.sourceType, c.sourceId),
    getBookTitle(c.targetType, c.targetId),
    c.thought || "",
].join(" ").toLowerCase();
return haystack.includes(searchRaw);
```

`c.tags` 字段（由 `connectionDialog` 的 `tags` 输入项写入，如「哲学, 叙事, 人性」）完全不包含在 haystack 中。用户在连接对话框输入的 `tags` 字段，是对关联主题的标注——日后通过这些主题词检索时，搜索框找不到。

对比：`renderTimeline()` 的 haystack 包含 `book.title + book.author + session.note`（`app.js:1411-1414`）；`renderQuotes()` 搜索包含 `content + tags + book.title`（`app.js:1430-1440`）——两处均包含 tags；唯独 `renderConnections()` 缺失。

**Why it matters:** 关联的 tags（如「哲学」「叙事」）是用户对思想碰撞主题的显式标注，是「按主题浏览关联」的自然路径。搜索「哲学」在关联 Tab 无效（仅搜 thought 和书名），与 `renderQuotes` 的搜索行为不一致，违反最小惊讶原则。Theme 2「回顾有价值」的一个核心场景是「列出所有我标记过『哲学』的思想关联」——当前 tags 不可搜，该场景完全无法实现。

**Complexity:** S — 在 `app.js:835-837` 的 haystack 数组末尾追加 `(c.tags || []).join(" ")` 一行，无其他改动。

**Files:** `app.js:833-839`（`renderConnections` haystack 构建；对比 `app.js:1430-1440`（`renderQuotes` haystack，已含 tags，作为参考模式）

**northstar:** 中——Theme 2「回顾有价值」以「按主题检索」为前提；关联 tags 是用户主动标注的主题信号，不可搜等于标注了却找不回来；S 级单行修复，与 OPT-079/OPT-080（建立关联体验）搭车成本最低。

---

> 本次 run 将 E133（Organize/Candidates 功能全链路失活）提拔为 OPT-081，将 E134（sessionStats 默认视图恒隐）提拔为 OPT-082。E135（关联 tags 不可搜）作为候选登记，建议与 OPT-079/OPT-080「建立关联体验修复包」合并实施。

---

## 2026-07-01

### E136 — `renderQuotes()` 搜索 haystack 不含 `ocrText`：AI-OCR 直存摘抄完全不可搜 (S)

**What:** `renderQuotes()`（`app.js:1495-1503`）haystack 构建：

```js
// app.js:1495-1503
const haystack = [
  book?.title || "",
  book?.author || "",
  item.content || "",    // ← 只含 content，不含 ocrText
  (item.tags || []).join(" "),
].join(" ").toLowerCase();
```

而同函数第 1519 行的**显示**逻辑：

```js
// app.js:1519
quote.content || quote.ocrText
```

明确以 `ocrText` 作为 content 为空时的 fallback。快速 OCR 识别成功后，若用户**未手动编辑即直接保存**，保存的数据结构为 `{content: "", ocrText: "<识别全文>"}` ——`content` 永远为空串。这些摘抄可以正常显示，但搜索任何关键词都命中不了。`matchQuotes()`（`app.js:1142`）同样只校验 `quote.content || ""`，已知设计上不接入 globalSearch，但也会影响 Chat 上下文注入的摘抄召回。

**Why it matters:** 快速 OCR 是「采集顺滑」路径中最高频的保存方式：识别完毕→直接点保存，不经编辑。用户积累的 OCR 摘抄越多，「摘抄」Tab 搜索越失准。这是对 Theme 2「回顾有价值」的直接打击：摘抄存进去、却找不回来，积累越多越沮丧。修复极简（haystack 多加一个字段），性价比极高。

**Complexity:** S — `app.js:1498` 将 `item.content || ""` 改为 `item.content || item.ocrText || ""`（或在 haystack 数组末尾追加 `item.ocrText || ""`）；可同步修复 `app.js:1143` 的 `matchQuotes`（`fuzzyMatch(quote.content || "", ...)` → `fuzzyMatch(quote.content || quote.ocrText || "", ...)`）。两处改动，无副作用。

**Files:** `app.js:1498`（renderQuotes haystack）；`app.js:1143`（matchQuotes）

**northstar:** 强——Theme 2「回顾有价值」的前提是「能搜到」；快速 OCR 摘抄是最高频的采集输出物，它不可搜等于整个 OCR 路径的回顾价值归零；S 复杂度，一行修复，应作为 P1/S 热修。

---

### E137 — `openNewSessionForBook()` 从不预填 `startPage`，用户每次需手动输入已知的起始页 (S)

**What:** `openNewSessionForBook()`（`app.js:2430-2441`）每次打开对话框时：

```js
// app.js:2436
els.sessionForm.querySelector('[name="startPage"]').value = "";  // 永远清空
```

而 `addSession()`（`app.js:2221-2232`）在提交时会维护：

```js
// app.js:2221-2225
book.currentPage = Math.max(book.currentPage || 0, endPage);
book.lastReadAt = date;
book.updatedAt = now;
```

`book.currentPage` 始终等于该书所有 session 中最大的 `endPage`。对于**顺序阅读**的用户，下一次 session 的 `startPage` = `book.currentPage + 1`。这个值应用已知、每次却要用户手动输入。

**Why it matters:** 「记阅读 session」是 W27 本周唯一焦点的核心路径（roadmap §2 短期节），owner 6/26 信号显示该路径有多处录入摩擦（OPT-059/058/061/066）。`startPage` 每次手动输入是重复摩擦：读者在书中天然知道"我从哪页接着读"，但 app 明明记录着 currentPage 却不利用。一键预填能减少每次录入 1–2 次交互，积少成多。注意：仅适合顺序阅读场景，因此实现时应以「建议值」呈现（字段可改），不强制覆盖。

**Complexity:** S — `app.js:2436` 将 `value = ""` 改为 `value = (book.currentPage > 0 ? book.currentPage + 1 : "")` ；需在该行前先取到 `book = state.books.find(b => b.id === bookId)`（查看上下文，`openNewSessionForBook(bookId)` 入参已有 bookId）。2–4 行改动，无其他依赖。

**Files:** `app.js:2430-2441`（`openNewSessionForBook`）；参照 `app.js:2221-2232`（`addSession`，维护 `book.currentPage`）

**northstar:** 中——Theme 1「采集顺滑」每日触点；session 录入是 roadmap W27 焦点路径，减少摩擦直接支撑「每天真实记一次阅读 session」的验收目标；S 复杂度，且与 OPT-059/061/066（同路径修复包）搭车成本最低。

---

### E138 — `deleteSession()` 删除记录后不回写 `book.currentPage`，导致进度数据残留 (S)

**What:** `deleteSession()`（`app.js:2490-2505`）仅从 sessions 数组过滤掉目标项，不触碰 book 字段：

```js
// app.js:2490-2505
state.sessions = state.sessions.filter((item) => item.id !== sessionId);
// 没有任何 book.currentPage / book.lastReadAt / book.status / book.startedAt 更新
try { await syncState(); renderTimeline(); showToast("阅读记录已删除"); }
```

相比之下，`addSession()`（`app.js:2221-2232`）每次提交都更新 `book.currentPage`、`book.lastReadAt`、`book.updatedAt`，并检查 `finished` 状态。若用户误加了一条 session（比如 endPage 填错），删除后 `book.currentPage` 仍保留那次错误的最大值，E137 的预填功能也会基于错误基准推算 `startPage`。

**Why it matters:** 正确性问题（数据写入和删除路径逻辑不对称），影响范围是 book 进度显示和 E137 预填的准确性。删除边界 session 后需手动修正书籍当前页，体验差。修复逻辑：删除后重新扫描该书所有剩余 sessions，取最大 endPage 回写 `book.currentPage`（若无 session 则清零）。

**Complexity:** S-M — 需要在删除后的回调里找到关联 book，遍历其余 sessions 计算新 currentPage/lastReadAt，并判断 finished 状态。约 10–15 行，测试覆盖建议补充。

**Files:** `app.js:2490-2505`（`deleteSession`）；参照 `app.js:2221-2232`（`addSession` 的回写逻辑）

**northstar:** 弱-中——数据正确性背景项，不直接对应北极星代理指标，但若 E137 预填依赖 `book.currentPage` 则两者耦合；建议与 E137（OPT-084）同 PR 修复，消除逻辑不对称。

---

### E139 — `renderConnections()` 无关联数量显示，「关联」Tab 无法感知积累 (S)

**What:** `renderConnections()`（`app.js:812-848`）渲染关联列表，但整个函数没有写入任何计数元素。`index.html` 第 152 行：

```html
<div id="connectionsList" class="connections-list empty-state">
```

`connectionsList` div 内无 count span，函数内也无对应赋值逻辑。对比：
- 书单 Tab：`<span id="bookCount">共 N 本</span>`（`index.html`），`renderBooks()` 更新它
- 摘抄 Tab：`<span id="quoteCount">N 条摘抄</span>`（`index.html`），`renderQuotes()` 更新它
- 关联 Tab：无计数元素

用户有 20 条关联时，「关联」Tab 标题/列表顶端无任何「共 20 条」提示。

**Why it matters:** 积累感知是 Theme 2「回顾有价值」的基础体感——其他 Tab 均有计数反馈，关联 Tab 缺席。关联功能是较新的功能（OPT-079/OPT-080 正在修复建立关联体验），用户开始积累关联后，计数是最低成本的「看见积累」机制。修复为纯前端、零后端，与 OPT-079/OPT-080 搭车合并代价极低。

**Complexity:** S — `index.html`：在 `connectionsList` 上方插入 `<div class="list-count" id="connectionCount"></div>`；`app.js:renderConnections`：在渲染末尾加一行 `document.getElementById("connectionCount").textContent = filteredConnections.length > 0 ? \`共 ${filteredConnections.length} 条\` : ""`。两文件各 1–2 行，纯 UI 改动。

**Files:** `app.js:812-848`（`renderConnections`）；`index.html`（`connectionsList` 容器区域）

**northstar:** 弱-中——孤立看贡献有限；但与 OPT-079/OPT-080「建立关联体验」搭车时，这条改动将计数反馈补全，让关联 Tab 与书单/摘抄 Tab 体验对齐，符合最小惊讶原则。S 级改动，建议搭车。

---

> 本次 run 将 E136（ocrText 不在搜索 haystack）提拔为 OPT-083，将 E137（session startPage 预填）提拔为 OPT-084。E138（deleteSession 不回写 book 进度）和 E139（关联 Tab 无计数）作为候选登记，建议分别与 OPT-084 和 OPT-079/OPT-080 搭车合并实施。

---

## 2026-07-02

> 本次 run 聚焦：关联搜索质量、sample 数据清理、timestamp 一致性。所有结论均经代码 Read 验证。
> 提拔：E141 → OPT-088，E140 → OPT-089。

### E140 — `clearSampleData()` 不清理 chatHistories / chatContexts

**What (verified):** `app.js:1729-1744`：
```js
const SAMPLE_COLLECTIONS = ["books", "quotes", "connections", "sessions"];
async function clearSampleData() {
  if (!currentUser?.id) return;
  for (const k of SAMPLE_COLLECTIONS) {
    state[k] = (state[k] || []).filter((it) => !(it && it.isSample));
  }
  try { await syncState(); } catch (error) { showToast(`清除失败：${error.message}`); return; }
  render();
  ...
  showToast("示例已清除");
}
```
`SAMPLE_COLLECTIONS` 不含 `chatHistories` / `chatContexts`。对比 `deleteBook()`（`app.js:2353-2366`）会显式删除 `state.chatHistories[bookId]`、`state.chatHistories["book:"+bookId]`、`state.chatContexts[*]`。若用户对示例书"百年孤独"（`sample-book-marquez`）发起过对话，点「一键清除」后，`state.chatHistories["book:sample-book-marquez"]` 和 `state.chatContexts["book:sample-book-marquez"]` 仍残留，随 syncState 写回后端，形成僵尸聊天历史。

**Why it matters:** 「一键清除」的语义是「像没来过一样」。僵尸聊天历史不可见（无 UI 入口），但占用 state 体积并干扰导出——用户导出时会带走无对应书籍的孤儿聊天记录。S 级改动，对齐 `deleteBook()` 逻辑即可。现有测试 `tests/frontend/sample-onboarding.test.js:95-108` 的 `clearSampleData` 用例不验证 chatHistories，修复时需同步补测。

**Complexity:** S — `app.js:clearSampleData` 补全 chatHistories/chatContexts 清理（对照 `deleteBook` 约 10 行）；`tests/frontend/sample-onboarding.test.js` 补充断言。

**Files:** `app.js:1729-1744`（clearSampleData），`app.js:2353-2366`（deleteBook 参考模式），`tests/frontend/sample-onboarding.test.js:95-108`

**northstar:** 弱-中——数据干净是「无忧采集」的隐性前提；onboarding 体验（示例→清除→空白起步）是新用户留存的关键路径，状态残留会污染首次真实使用体验。

---

### E141 — `renderConnections()` 搜索 haystack 缺少引文内容

**What (verified):** `app.js:847-860`：
```js
const getBookTitle = (type, id) => {
  if (type === "book") return state.books.find((b) => b.id === id)?.title || "";
  if (type === "quote") {
    const q = state.quotes.find((q) => q.id === id);
    return state.books.find((b) => b.id === q?.bookId)?.title || ""; // 返回书名，非摘抄内容
  }
  return "";
};
const haystack = [
  getBookTitle(c.sourceType, c.sourceId),
  getBookTitle(c.targetType, c.targetId),
  c.thought || "",
].join(" ").toLowerCase();
```
当 source 或 target 为 `quote` 类型时，haystack 仅含**书名**，不含 `quote.content` / `quote.ocrText`。用户按摘抄文字搜索关联，找不到结果。

**Why it matters:** 关联功能主体是「摘抄 ↔ 摘抄」或「摘抄 ↔ 书」的连线。摘抄内容是关联最自然的搜索词，当前搜索实际只能按书名和 thought 过滤，功能形同虚设——Theme 2「回顾有价值」的核心用例（「我在想 X 话题时找到了哪些连线？」）命中率极低。

**Complexity:** S — `getBookTitle` 重命名为 `getSearchLabel`，quote 分支追加 `(q?.content || q?.ocrText || "").slice(0, 60)`；haystack 不变，约 3 行修改。

**Files:** `app.js:847-860`（renderConnections / getBookTitle），可选：`tests/frontend/connections.test.js`（若存在）

**northstar:** 中——直接影响 Theme 2「找到相关联想法」体验；关联搜索是 Theme 2 核心交互之一，但修复仅针对已有功能的缺陷，不扩展功能边界。

---

### E142 — `build_sample_state()` 用 `now_iso()`（本地时间）而非 `utc_now_iso()`

**What (verified):** `app_server.py:200`：
```python
def build_sample_state() -> dict:
    now = now_iso()  # "2026-07-02T23:16:25"（无时区）
```
`now_iso()`（`app_server.py:347`）返回 `datetime.now().isoformat(timespec="seconds")`，无时区标识。`utc_now_iso()`（`app_server.py:352`）返回带 `Z` 的 UTC 串，其注释明确：「Use this for timestamps the frontend sorts/compares against client-side timestamps」。前端 `addSession()` 用 `new Date().toISOString()`（UTC+Z），示例 session 用本地时间串，同日内 `localeCompare` 排序会错乱（UTC+8 环境下示例时间串 `T23:xx` > 用户时间串 `T04:xx`，示例排在用户当天记录之前）。

**Complexity:** S — `app_server.py:200` 将 `now_iso()` 改为 `utc_now_iso()`，一行修改。

**Files:** `app_server.py:200`（build_sample_state），`app_server.py:347-355`（now_iso / utc_now_iso 定义）

**northstar:** 弱——示例数据时序错乱仅影响新用户 onboarding 期间的 Timeline 显示，且仅在非 UTC+8 时区或夜间创建账号时明显。值得一改但不急。

---

### E143 — `renderTimeline()` 用 `localeCompare` 排序 session，与 OPT-037 修复的 book 排序不一致

**What (verified):** `app.js:1439`：
```js
const allSorted = [...state.sessions].sort((a, b) =>
  (b.date || "").localeCompare(a.date || "")
);
```
OPT-037（PR #已合并）将 `compareBooksForList()` 的 `localeCompare` 改为 `Date.parse()`，解决 UTC+Z 与本地时间串混合排序问题。但 `renderTimeline()` 的 session 排序沿用 `localeCompare`，存在相同隐患：当示例 session（`now_iso()` 本地串，E142 已记录）与用户 session（UTC+Z 串）混在同一 Timeline 时，同日内顺序可能颠倒。

**Complexity:** S — `app.js:1439` 将 `localeCompare` 改为 `Date.parse(b.date) - Date.parse(a.date)`，一行修改；`Date.parse` 对两种格式均健壮。

**Files:** `app.js:1439`（renderTimeline sort）

**northstar:** 弱-中——Timeline 是「看见自己读书积累」的主界面；排序错乱虽低频，但会在「凌晨记录 + 当天早些时候有示例 session」场景下误导 owner 的使用天数指标（roadmap §2 北极星可观测代理指标第一项）。与 E142 搭车修复为零额外成本。

---

### E144 — `build_sample_state()` 示例书 `currentPage` 与示例 session `endPage` 不一致

**What (verified):** `app_server.py:204-235`：
```python
"books": [
    {"id": "sample-book-marquez", "title": "百年孤独",
     "currentPage": 120, "status": "reading", ...},
],
"sessions": [
    {"id": "sample-session-1", "bookId": "sample-book-marquez",
     "startPage": 1, "endPage": 30, "pagesRead": 30, ...},
],
```
`addSession()` 会执行 `book.currentPage = Math.max(book.currentPage || 0, endPage)`。示例数据手工构造，`currentPage=120` 远高于唯一 session 的 `endPage=30`，违反此不变式。新用户看到书卡显示「读到第 120 页」，却只有一条「第 1–30 页」的阅读记录，数据自相矛盾，影响可信度。

**Complexity:** S — `app_server.py:204`：将 `"currentPage": 120` 改为 `"currentPage": 30`（对齐 session endPage），或补充第二条 session（startPage=31, endPage=120）以使数据更丰富。后者更能展示产品价值（多条阅读记录的 Timeline）。

**Files:** `app_server.py:204-235`（build_sample_state）

**northstar:** 弱-中——示例数据是新用户对产品能力的第一印象；一致的示例数据（多条 session + 进度吻合）能更好展示阅读 Timeline 的价值，辅助 onboarding 转化。

---

> 本次 run 将 E141（关联搜索 haystack 缺摘抄内容）提拔为 OPT-088，将 E140（clearSampleData 不清 chatHistories）提拔为 OPT-089。E142/E143/E144（timestamp 一致性 + 示例数据修正）建议搭车 E141/E140 实施，S 级代价。

## 2026-07-03

> 本次 run 聚焦：记录会话路径的时区一致性、页数统计精度、Timeline 排序、deleteSession 进度回写缺失、示例数据时间戳。所有断言均经代码 Read 验证。
> 提拔：E145 → OPT-090，E146 → OPT-091。

### E145 — `editSession()` date 字段用 `toISOString().split("T")[0]` 而非已有的 `isoToDateInput()` 辅助函数

**What (verified):** `app.js:2412`：
```js
const dateStr = session.date ? new Date(session.date).toISOString().split("T")[0] : "";
els.sessionForm.querySelector('[name="date"]').value = dateStr;
```
`isoToDateInput()`（`app.js:477-484`）已有本地时区感知的转换（`d.getFullYear()` / `d.getMonth()` / `d.getDate()` 取本地分量），且已被正确用于书籍编辑表单（`app.js:2647-2648`）：
```js
els.bookEditForm.elements.startedAt.value = isoToDateInput(book.startedAt); // OPT-074
els.bookEditForm.elements.finishedAt.value = isoToDateInput(book.finishedAt); // OPT-074
```
但 `editSession()` 没有调用它，而是直接调 `.toISOString()` 再 split。对于在 UTC+8 00:00–07:59（本地深夜/清晨）记录、date 字段留空后端走 `new Date().toISOString()` 默认路径的 session，`session.date` 为 UTC 前一天的时间串（如 `2026-07-02T16:30:00.000Z`），`.toISOString().split("T")[0]` 返回 `2026-07-02`，但本地实际是 `2026-07-03`——编辑时日期字段预填错一天。

**Why it matters:** OPT-059（本周 W27 最高优先项）正在修复新建 session 的日期预填；`editSession()` 是完全对称的 bug，在同一路径上，修复方式也完全一致：将 `toISOString().split("T")[0]` 换成 `isoToDateInput(session.date)`，1 行改动，复用已有辅助。漏掉编辑路径意味着 owner 在深夜用完 OPT-059 后新建了正确日期的 session，但第二天打开编辑时仍看到昨天——数据准确性缺口未完全填上，Theme 1「采集顺滑」验收不完整。

**Complexity:** S — `app.js:2412`：将 `new Date(session.date).toISOString().split("T")[0]` 改为 `isoToDateInput(session.date)`；1 行修改，零后端/CSS 变更，零测试变更（`isoToDateInput` 已在 OPT-074 测试中覆盖）。

**Files:** `app.js:2412`（editSession）；参照 `app.js:477-484`（isoToDateInput 定义）；`app.js:2647-2648`（正确使用参考）

**northstar:** 中——直接在 W27 唯一焦点「记阅读 session」路径上消除 date 预填的时区错误，与 OPT-059 构成完整对（新建 + 编辑），Theme 1「数据准确」验收要求两个入口都正确。

---

### E146 — `renderTimeline()` 用 `localeCompare` 排序 session，OPT-037 的书单修复漏覆盖 Timeline

**What (verified):** `app.js:1439`：
```js
const allSorted = [...state.sessions].sort((a, b) =>
  (b.date || "").localeCompare(a.date || "")
);
```
OPT-037（PR #42，2026-06-13）已将 `compareBooksForList()` 的同类 `localeCompare` 改为 `Date.parse(b.createdAt) - Date.parse(a.createdAt)`，OPT-014 已将 `renderQuotes()` 改为 `Date.parse`，但 `renderTimeline()` 的 session 排序未同步修复。`session.date` 在新建路径存为 `${dateValue}T12:00:00` 锚定本地正午的 UTC 串，在空日期 fallback 路径存为当前 UTC 时间串；混合排序时，同一本地日历日创建的 session 会因时间串字面值（是否带毫秒、是否带 Z）而乱序。

**Why it matters:** `renderTimeline()` 是「动态」Tab 的主视图，也是 OPT-077（阅读里程碑事件）的预定接入点。排序不一致是与 OPT-037 完全相同的已知问题类别，一行修改复用相同的修复模式，对 Timeline 日期顺序的准确性是 roadmap §2「本周使用天数」可观测代理指标的基础。

**Complexity:** S — `app.js:1439`：将 `(b.date || "").localeCompare(a.date || "")` 改为 `Date.parse(b.date || "") - Date.parse(a.date || "")`（降序）；1 行修改，零其他影响。

**Files:** `app.js:1439`（renderTimeline sort），参照 `app.js:1026`（OPT-037 已修复的书单 sort）

**northstar:** 弱-中——Timeline 是「看见自己读书积累」的主界面，date 排序正确是「本周使用天数」观测准确的前提；S 级改动，与 OPT-037 同一修复系列，建议与 E145 合并同一 PR。

---

### E147 — `deleteSession()` 删除记录后不回写 `book.currentPage` / `book.lastReadAt`，进度数据残留

**What (verified):** `app.js:2583-2598`：
```js
state.sessions = state.sessions.filter((item) => item.id !== sessionId);
try { await syncState(); renderTimeline(); showToast("阅读记录已删除"); }
```
删除后对任何书籍字段不作任何更新。对比 `addSession()`（`app.js:2314-2325`）每次新建都做：
```js
book.currentPage = Math.max(book.currentPage || 0, endPage);
book.lastReadAt = date;
```
若用户误填了 endPage（如 endPage=400）并删除该 session，`book.currentPage` 保持 400 不变；OPT-084（startPage 预填）将基于 `book.currentPage=400` 错误计算下次起始页，给出错误建议值 401。

**Why it matters:** 新建/删除路径逻辑不对称是正确性缺陷。「记阅读 session」是 W27 焦点路径，OPT-059/061/066 正在打磨其顺滑度；deleteSession 的进度残留会在用户纠错（删掉错误 session）后立即在 OPT-084 的预填中暴露出来，产生新的摩擦。

**Complexity:** S-M — 删除后需扫描该书所有剩余 session 找最大 endPage 回写 `book.currentPage`（若无 session 则清零），同步更新 `book.lastReadAt` 和 finished 状态判断；约 10–15 行，参照 `addSession()` 逻辑。建议与 OPT-084（startPage 预填）合并一 PR，因两者共享 `book.currentPage` 的读写路径。

**Files:** `app.js:2583-2598`（deleteSession）；参照 `app.js:2314-2325`（addSession 回写逻辑）

**northstar:** 弱-中——数据准确性背景项；孤立看贡献有限，但 E145/OPT-084 使 `book.currentPage` 成为 session 录入的关键输入，deleteSession 残留进度会直接降低预填准确度，削弱 Theme 1「零摩擦录入」验收的实效。

---

### E148 — `pagesRead` 计算 `endPage - startPage` 少 1，阅读量指标系统性低估

**What (verified):** `app.js:2303` 和 `2310`：
```js
pagesRead: endPage - startPage,
```
`build_sample_state()` 的示例 session（`app_server.py:251`）手工赋值 `"pagesRead": 30, "startPage": 1, "endPage": 30`，而公式给出 `30 - 1 = 29`，两者相差 1。`getBookMetrics()`（`app.js:767`）和 `buildRenderCache()`（`app.js:740`）均直接累加 `item.pagesRead`：
```js
pages: sessions.reduce((sum, item) => sum + Number(item.pagesRead || 0), 0)
```
读第 1 页到第 30 页实际读了 30 页，公式存 29——每条 session 都少记 1 页，书卡和书本级指标长期低估总阅读量。

**Why it matters:** 阅读量统计是最直接的「自我感知进步」指标；10 次 session 就低估 10 页，100 次 session 低估 100 页。修复方式有争议：若改公式（`+1`）则历史数据与新数据不一致（需迁移或接受分裂）；若只更新渲染层而不动存储，则 `pagesRead` 字段与显示脱节。建议：仅改公式（`endPage - startPage + 1`），历史数据保持不动（差 1 页属于「旧数据自然老化」），同时在样本数据中更正（已与公式一致的 30 保持不动）。

**Complexity:** S — `app.js:2303` 和 `2310`：`endPage - startPage` → `endPage - startPage + 1`；`renderTimeline()` 的统计行（`app.js:1452`）也用同一公式，同步修改。共 3 处，各 1 字符修改。

**Files:** `app.js:2303, 2310`（addSession）；`app.js:1452`（renderTimeline 统计行）

**northstar:** 弱-中——阅读量统计不直接是 roadmap §2 的三个代理指标之一（本周使用天数 / 新增摘抄数 / 回顾操作次数），但与「不假思索的默认工具」要求基础数据可靠相符；系统性 -1 页/session 偏差是隐性可信度问题。

---

### E149 — `build_sample_state()` 用 `now_iso()`（本地时间）且 `currentPage=120` 与唯一 session `endPage=30` 矛盾

**What (verified):** `app_server.py:217`：
```python
now = now_iso()  # "2026-07-03T10:XX:XX"，无时区
```
`utc_now_iso()` 的注释（`app_server.py:368-371`）明确：「Use this for timestamps the frontend sorts/compares against client-side timestamps」。示例书 `b1` 的 `currentPage=120`（`app_server.py:222`），但唯一示例 session 为 `startPage=1, endPage=30`（`app_server.py:250`）；`addSession()` 的不变式是 `book.currentPage = max(currentPage, endPage)`，即 currentPage 应等于所有 session endPage 的最大值（此处应为 30，而非 120）。两个问题叠加：① 时间戳本地时间排序混乱（与新用户自己添加的 UTC+Z 数据混排）；② 示例数据自相矛盾（页码显示「读到 120 页」但只有 1-30 页的记录）。

**Why it matters:** 示例数据是新用户对产品的第一印象。不一致的示例（进度 120 页 vs 只有 30 页 session）会让用户对数据的可信度产生疑问。两项修复均为 1–2 行：① `now = utc_now_iso()`；② `currentPage: 30`（或补一条 31-120 的 session 使数据更丰富）。

**Complexity:** S — `app_server.py:217`（`now_iso()` → `utc_now_iso()`）+ `app_server.py:222`（`currentPage: 120` → `currentPage: 30`）；共 2 处，1 行各。

**Files:** `app_server.py:211-253`（build_sample_state）

**northstar:** 弱——仅影响新用户 onboarding；但示例数据是产品能力的橱窗，与当前首屏体验打磨方向吻合。建议与 OPT-089/clearSampleData 搭车修复。

---

> 本次 run 将 E145（editSession 日期 timezone 预填 bug）提拔为 OPT-090，将 E146（renderTimeline localeCompare 排序）提拔为 OPT-091。E147（deleteSession 不回写进度）、E148（pagesRead 少 1）、E149（示例数据 now_iso + 数值不一致）作为候选登记，建议分别搭车相关 PR 合并实施。

---

## 2026-07-04

### E150 — `matchBooks()` 只搜 `title`/`author`，忽略 `tags` / `notes`，书单「按主题/标签找书」零结果

**What (verified):** `app.js:1160-1163`：
```js
function matchBooks(query) {
  return state.books.filter(
    (book) => fuzzyMatch(book.title, query) || fuzzyMatch(book.author || "", query)
  );
}
```
书籍对象存有 `tags`（数组，`app.js:2251`）和 `notes`（字符串，`app.js:2252`）两个字段，但 `matchBooks()` 不检索它们。`globalSearch()`（`app.js:1355-1373`）和书单 Tab 搜索均通过 `matchBooks()` 路由；书单标签 `小说(成长/哲学)` 或 notes 中含「成长」的书，搜索「成长」返回零结果。

**Why it matters:** 2026-07-03 signal：「书单搜『成长』零结果——但库里有多本成长题材（标签 `小说(成长/哲学)`、简介含「成长」）」。roadmap W28「Theme 2 第一刀『检索修通』」明确列出 `matchBooks()` app.js:1156 作为首个需要修复的搜索入口。2-3 行修改即可命中标签与 notes；修复后书单按主题/标签找书的场景直接打通。

**Complexity:** S — `app.js:1160-1163`：在 `fuzzyMatch(book.author || "", query)` 后追加 `|| (book.tags || []).some(t => fuzzyMatch(t, query)) || fuzzyMatch(book.notes || "", query)`；单文件，零后端，零 DB 变更。

**Files:** `app.js:1160-1163`（matchBooks），参照 `app.js:2251-2252`（addBook tags/notes 存储确认）

**northstar:** 中——roadmap W28 显式优先项，Theme 2「检索修通」首刀；S 级修复，signal 直接验证，建议本周 PR 一并实施。→ 提拔为 OPT-092

---

### E151 — 跨页摘抄：OCR 仅支持单张照片，跨页句子无法一次拼入同一条摘抄

**What:** 2026-07-03 signal：「一段摘抄有可能跨页（横跨左右两页或翻页续写），现在加摘抄只能拍一张，跨页的句子拍不全 → 希望能拍 2 张照片一起 OCR，拼成同一条摘抄」。当前 `addQuoteModal` 的文件选择器（`app.js` 快速 OCR 入口）接受 `accept="image/*"` 但为 `<input type="file" accept="image/*">`（单文件），返回单张图片 Blob 后立即上传识别；多张图拼接无任何支持。用户目前只能分两次拍、手动合并，或只拍一页后在文本框里补齐。

**Why it matters:** 书籍竖排和诗文摘抄中跨页现象常见；强制单张拍摄会导致「摘抄不完整」或「手动拼接」的摩擦——与「拍照摘抄不假思索」的北极星直接冲突。实现上可分两阶段：Phase 1 允许选多张图各自识别、结果拼接；Phase 2 探索两张图合并为同一 API 请求（Kimi vision 支持多图）。

**Complexity:** M — Phase 1：`<input multiple>`，前端并发调用两次 OCR，按顺序拼接结果至同一文本框；约 30-40 行。Phase 2 需评估 Kimi multi-image payload；后端无结构变更，quote 存储不变。

**Files:** `app.js`（addQuoteModal file input + OCR 上传逻辑）；`app_server.py`（`/api/ocr` 端点，评估多图支持）

**northstar:** 中-高——「拍照摘抄→摘抄卡」是 Theme 1「采集顺滑」的核心场景；跨页摘抄是该场景的长尾痛点，覆盖频率因书而异但摩擦极高。

---

### E152 — 书籍对象无「开始阅读」/ 「读完」日期字段，依赖手动添加 session 记录，容易遗忘

**What:** `app.js:2244-2258`（`addBook()`）的书籍对象结构只有 `status`（未开始/在读/已读）、`currentPage`、`lastReadAt`（由 `addSession()` 自动写入）；无独立的 `startedAt`（第一次翻开日期）/ `finishedAt`（读完日期）字段。2026-06-26 signal：「想记下开始/读完日期，但现在只能手动加『记录』，经常忘 → 希望每本书有『开始阅读 / 读完』日期字段，能自动或一键标记，不依赖手动加记录」。实际上，`startedAt` 可从该书最早 session 的 `date` 字段推导，`finishedAt` 可从 `status=已读` 的时机自动打戳。

**Why it matters:** 读完一本书是「记阅读」场景里最有仪式感的节点；无法快速记录「哪天开始 / 哪天读完」是用户明确表达的摩擦。当前只能靠 session 记录间接推算，体验不直观，且不查全 session 无法在书卡看到。若自动推导（从 session 取 min/max date），零额外用户操作；若补字段，也可在「书详情」展示「已读：2026-06-01 ~ 2026-06-26」。

**Complexity:** S-M — 方案 A（纯计算，无结构变更）：`getBookMetrics()`（`app.js:767`）追加 `startedAt = min(sessions.date)`，`finishedAt = max(sessions.date)`，书详情渲染展示；完全向后兼容，无 DB 变更。方案 B（存结构字段）：`addBook()` 增加字段，需迁移脚本。建议先走方案 A。

**Files:** `app.js:767`（getBookMetrics）；书详情渲染函数；可选：`addBook()` / `editBook()` 表单增加手动字段

**northstar:** 中——2026-06-26 signal 直接记录；「开始日期 / 读完日期」与「记阅读」Theme 高度相符，自动推导版本是零摩擦实现，可与 OPT-059/061 同路径发布。

---

### E153 — 聊天面板「最新」标签独占整行，压缩左侧主操作区宽度

**What:** 2026-06-16 signal：「聊天输入框里『最新』独占一行，挤压了左侧交互内容的空间 → 希望它不占整行」。`chat.js` 的模型选择 UI 或上下文切换标签中，「最新」徽章/标签使用 `display:block` 或在 flex 行内撑满，导致输入区有效宽度减少。需读 `chat.js` 对应 DOM 结构确认根因，可能是 `flex: 1` 缺失或 `white-space: nowrap` 问题。

**Why it matters:** 输入框宽度是聊天体验的直接参数；在 iPhone 12（375px）窄屏下，任何非必要的整行元素都显著压缩可用空间。纯 CSS 修复，零逻辑变更。

**Complexity:** S — 定位 `chat.js` 中「最新」标签的 CSS 类，改为 `inline` / `inline-flex` 或删除多余的换行；`styles.css` 可能也需小调。预计 1–3 行。

**Files:** `chat.js`（模型/上下文选择区 DOM）；`styles.css`（对应样式）

**northstar:** 弱-中——聊天是 Theme 2「回顾有价值」的探索入口；输入框宽度直接影响打字体验，signal 已明确记录。S 级，可搭车任意 chat.js 修改。

---

### E154 — OCR 结果无法按行快速删除，整页识别后手动清理负担重

**What:** 2026-06-16 signal：「快速 OCR 很快但会识别整页全文，只想留划线句，得手动删一大堆很麻烦 → 希望能『一行一行快速删除』OCR 结果」。OCR 识别后结果填入 `<textarea>`（`app.js` addQuote 流程），用户须在 textarea 中手动定位并删去整页无关文字；每行末尾无一键删除操作，且 textarea 无行级结构感知。

**Why it matters:** 快速 OCR 覆盖整页导致「有用内容 / 无用内容」比例低，用户编辑成本与页面密度正比。若在 OCR 结果上方渲染逐行列表（每行带×按钮），用户可在 2–3 次点击内清理 10 行无关文字，而现在需要 textarea 内精确选中多行删除——对手机用户尤其痛苦。

**Complexity:** M — 将 OCR 返回文本按 `\n` 切分，渲染为 `<ul>` 逐行 + 删除按钮；确认后再拼回纯文本写入 content 字段；需在 addQuote 流程中插入「逐行确认」步骤或可折叠区域。约 40–60 行前端，无后端改动。

**Files:** `app.js`（addQuote / OCR 结果展示区域）；`styles.css`（行列表样式）

**northstar:** 中——「拍照摘抄→只留划线句」是 Theme 1「采集顺滑」最高频摩擦；整页识别是现阶段 OCR 管线的已知缺陷，行删除是成本最低的用户侧缓解手段。

---

> 本次 run 将 E150（matchBooks tags/notes）提拔为 OPT-092。将 E147（deleteSession 不回写 book.currentPage，上轮已登记）提拔为 OPT-093。E151（跨页 OCR）、E152（书籍阅读日期字段）、E153（聊天「最新」标签占行）、E154（OCR 逐行删除）作为候选登记。

## 2026-07-05

> 本次 run 核实 E153（聊天「最新」标签）已修（OPT-054 PR #47 done）、E154（OCR 逐行删除）已修（OPT-055 PR #46 done），两条 stale。新增 E155–E157 三条方向；将 E148（pagesRead 差一）提拔为 OPT-094，E155（摘抄页码预填）提拔为 OPT-095。

### E155 — 新建摘抄对话框页码字段从不预填 `book.currentPage`，与 OPT-084 形成对称缺陷

**What:** `app.js:2520`（`openNewQuoteForBook()`）硬写 `els.quoteForm.querySelector('[name="page"]').value = ""`，无论 `book.currentPage` 是否有值，页码字段永远置空。OPT-084（阅读记录 startPage 预填当前页）已 triaged，摘抄页码存在完全相同的模式却未登记。用户拍照摘抄时通常知道当前页码（即 `book.currentPage`），每次新建摘抄都需手动填写。

**Why it matters:** 「拍照摘抄」是北极星路径最高频操作；页码字段是摘抄对话框中唯一无默认值的常用字段。OPT-084 已明确「startPage 预填当前页」有价值，摘抄页码与之对称，S 级修复，可搭车 OPT-084 同一 PR。

**Complexity:** S — 在 `openNewQuoteForBook(bookId)` 内读取 `state.books.find(b => b.id === bookId)?.currentPage`，若有值则填入，否则保持空。1–3 行，纯前端，无 API 改动。

**Files:** `app.js:2520`（openNewQuoteForBook）

**northstar:** 弱-中——「采集顺滑」直接受益；手机上手动输入数字页码每次都是小摩擦，预填消除这一摩擦。S 级，建议搭车 OPT-084。

---

### E156 — `/api/account/export` 导出时间戳使用 `now_iso()`（本地时间）而非 `utc_now_iso()`，违反 UTC 策略

**What:** `app_server.py:3905`：`"exportedAt": now_iso()`；OPT-014/024/031 已在所有用户可见时间戳上建立 `utc_now_iso()` 统一策略。`now_iso()` 输出服务器本地时间（不带 Z 后缀），导出文件的 `exportedAt` 字段与所有其他 ISO 时间戳格式不一致，跨时区环境下时间含义模糊。

**Why it matters:** 导出文件是离线备份；`exportedAt` 是文件唯一的时间戳，若未来做导出历史对比或版本校验，本地时间会产生歧义。S 级单行修复，无需设计讨论。

**Complexity:** S — 将 `app_server.py:3905` 的 `now_iso()` 改为 `utc_now_iso()`，单行，无测试变更。

**Files:** `app_server.py:3903-3905`（/api/account/export handler）

**northstar:** 弱——数据一致性，非用户直接感知路径；但与既定策略对齐，预防将来时区 bug。S 级，可搭车任意后端 PR。

---

### E157 — 摘抄列表过滤维度仅有 全部/摘抄/笔记，缺少「拍照来源」过滤器

**What:** `index.html:129-132`：过滤 chips 固定为三项（`全部` / `摘抄` / `笔记`）；`app.js:1521-1535`（`renderQuotes()`）仅按 `q.kind === "quote"` / `q.kind === "note"` 过滤。现有 quote 对象有 `source` 字段（`"ocr"` / `"manual"`），但未用于任何过滤维度。用户无法快速找出所有「拍照生成」的摘抄进行批量审核或补充页码。

**Why it matters:** 随着 OCR 存量增多，用户「想回去补全旧摘抄」（2026-07-05 北极星主观信号：「很想把之前读过的书的摘抄补全」）需要一个「按来源过滤」入口；若 OCR 摘抄有明确标识，用户可系统性地找到并完善它们，提升回顾价值（Theme 2）。

**Complexity:** M — 前端：`index.html` 增加「拍照」chip，`renderQuotes()` 增加 `source === "ocr"` 分支（约 15–20 行）；需确认后端 OCR 路径是否写入 `source: "ocr"`（若否，需补写 5 行后端逻辑）。整体前后端均需小改。

**Files:** `index.html:129-132`（filter chips）；`app.js:1521-1535`（renderQuotes filter logic）；`app_server.py`（OCR addQuote 路径，确认 source 字段写入）

**northstar:** 弱-中——「回顾有价值」Theme 2；「拍照」过滤能帮用户快速定位 OCR 存量做系统性整理，与主观信号直接对应。

---

> 本次 run 将 E148（pagesRead 差一）提拔为 OPT-094，E155（摘抄页码预填）提拔为 OPT-095。E151（跨页 OCR）、E152（书籍阅读日期字段）、E156（导出时间戳 UTC 一致性）、E157（摘抄来源过滤）作为候选登记。

## 已归档

> 2026-07-06 月度 prune(roadmap §5 规则3)。归档标准:问题已被已合并 PR 修掉,或已列 ⛔ 排除表。
> 年龄标准(>90天未提拔)本次命中 0 条——蓄水池最早条目仅 2026-05-30。保守起见,未修的重复条目一律留在活跃区。

- E1 — Global search ignores the quotes tab entirely (S) — 归档:已列 backlog ⛔ 排除表(全局搜索含摘抄=设计决策,永不提拔)
- E2 — `imghdr` is deprecated and removed in Python 3.13 (S) — 归档:已修 OPT-007 (PR#10)
- E3 — Static JS/CSS served with `no-store`; ETag/304 would eliminate repeat downloads (S) — 归档:已修 OPT-086 (静态资源 immutable 缓存)
- E8 — `json.loads()` in `summarize_metrics()` has no error handling — one corrupted row crashes the whole metrics endpoint (S) — 归档:已修 OPT-008 (PR#11)
- E9 — `_read_json()` reads the full request body with no size cap — DoS via oversized payload (M) — 归档:已修 OPT-009 (PR#12)
- E10 — Export exists but there is no import endpoint — backups are unrestorable (M) — 归档:已修 OPT-040 (导入端点/护栏, PR#36)
- E11 — Four GC functions defined but never called — DB grows forever (S) — 归档:已修 OPT-010 (PR#13)
- E12 — HTML responses served with no security headers (S) — 归档:已修 OPT-011 (PR#20)
- E16 — `call_deepseek()` has zero retry logic; transient 429/502 silently fails three critical paths (S) — 归档:已修 OPT-012 (PR#18)
- E17 — Buttons have no `:focus-visible` style — keyboard users get zero focus indicator (S) — 归档:已修 OPT-013 (PR#23)
- E21 — App ships with no `prefers-color-scheme: dark` support; reading at night forces bright white screen (M) — 归档:已修 OPT-021 (PR#21)
- E22 — `model_logs` and `agent_traces` have no `user_id` index — debug dashboard does full table scans (S) — 归档:已修 OPT-017 (PR#19)
- E24 — Streaming chat fetch has no AbortController timeout — server hang or silent network drop freezes the UI indefinitely (M) — ✅ DONE (commit c5c4281) — 归档:已修 (commit c5c4281, 条目自标 DONE)
- E25 — CSS transitions and infinite animation lack `prefers-reduced-motion` guard — WCAG Level A violation (S) — 归档:已修 OPT-018 (PR#23)
- E26 — Handler methods acquire `conn` but close it manually without `try/finally` — exceptions after `_require_user()` leak the connection (M) — 归档:已修 OPT-039 (PR#35, _open_conn 安全网)
- E28 — Toast notification lacks `aria-live` — screen reader users never hear transient feedback (S) — 归档:已修 OPT-019 (PR#23)
- E29 — `PromptBuilder` injects `existing_connections[:20]` into every chat request — irrelevant for 80%+ of chats (S) — 归档:已修 OPT-020 (PR#22)
- E31 — Auth endpoints have no rate limiting — credential stuffing and spam registration undefended (M) — 归档:已修 OPT-022 (PR#28)
- E32 — `/media/` serves user images unauthenticated with wildcard CORS — any site can hotlink private photos (S) — 归档:已修 OPT-023 (PR#24)
- E35 — `syncState()` has no optimistic locking — concurrent tabs or devices silently overwrite each other (M) — 归档:已修 OPT-030 (PR#29)
- E36 — `ActionExecutor` uses `datetime.now().isoformat()` — agent-created records carry naïve local time + microseconds (same timezone bug as OPT-014, unfixed path) (S) — 归档:已修 OPT-024 (PR#25)
- E37 — `agent_trace_events` table has no index on `trace_id` — trace detail fetch is a full table scan (S) — 归档:已修 OPT-025 (PR#30)
- E41 — `/debug/*` endpoints are world-readable when `ADMIN_TOKEN` is unset — all users' AI chat content exposed (S) — 归档:已修 OPT-028 (PR#26)
- E42 — `execute_action()` reads and writes state non-atomically — concurrent approvals from two browser tabs silently discard mutations (M) — 归档:已修 OPT-029 (PR#27/#29)
- E47 — `reading_mcp_server.py` uses `datetime.now().isoformat()` — same naïve-local-time bug as OPT-024, unpatched path (S) — 归档:已修 OPT-031 (PR#32)
- E50 — `<dialog>` elements have no `aria-labelledby` — screen readers announce modals with no name (WCAG 4.1.2 Level A) (S) — 归档:已修 OPT-033 (PR#34)
- E52 — Debug dashboard injects user content unescaped into HTML — stored XSS via chat messages (S) — 归档:已修 OPT-034 (PR#33)
- E61 — `compareBooksForList()` secondary sort still uses `localeCompare` — `renderQuotes()` was defensively fixed by OPT-014 but `renderBooks()` was not (S) — 归档:已修 OPT-037 (PR#42)
- E68 — Session CRUD and Connection CRUD have no frontend JS tests — two of the four main tabs are regression-blind (M) — 归档:已修 OPT-045 (PR#43)
- E74 — `PromptBuilder.all_books_summary` injected without count limit — 500-book users pay ~8,000 extra tokens per chat request (S) — 归档:已修 OPT-047 (PR#45)
- E86 — 摘抄卡面从不显示图片缩略图——拍照 OCR 后卡面无视觉区分度 (S) — 归档:已修 OPT-052 (PR#48)
- E87 — 「↓ 最新」按钮独占一个布局行压缩消息区——改为叠加在消息列表上的浮动按钮 (S) — 归档:已修 OPT-054 (PR#47)
- E88 — 快速 OCR 填入整页全文后无行级删除 UI，用户须手动选删大段内容 (M) — 归档:已修 OPT-055 (PR#46)
- E94 — Session 新建表单日期预填 UTC 日期，UTC+8 凌晨用户（00:00–08:00）看到昨天日期 (S) — 归档:已修 OPT-059 (PR#54)
- E100 — `showConfirmDialog()` 与 `deleteBook()` 均未处理 Escape 关闭，残留 `{ once: true }` 监听器可触发错误删除 (S) — 归档:已修 OPT-062 (PR#49)
- E102 — `compress_chat_history_if_needed()` API 失败时静默写入截断历史，永久丢失旧消息 (S) — 归档:已修 OPT-063 (PR#49)
- E104 — "↓ 最新" 滚动按钮占独立行，挤压聊天区垂直空间 [signal-backed 2026-06-16] (S) — 归档:已修 OPT-054 (PR#47, 与E87同)
- E105 — OCR 结果填入单块 `<textarea>` 无逐行快删 UI，整页全文需手动剪辑 [signal-backed 2026-06-16] (M) — 归档:已修 OPT-055 (PR#46, 与E88同)
- E108 — 导入减量守卫未覆盖 `chatHistories`：旧备份覆盖聊天记录不弹确认 (S) — 归档:已修 OPT-068 (PR#51)
- E109 — `call_deepseek_stream()` 无重试逻辑：主聊天路径遇瞬断即崩 (S) — 归档:已修 OPT-069 (PR#50)
- E119 — 书籍 `startedAt`/`finishedAt` 字段数据已自动填充但从未在 UI 展示，与 2026-06-26 信号直接对应 (S) [signal-backed] — 归档:已修 OPT-074 (PR#53)
- E123 — `saveBookEdit()` 手动将状态设为「已读完」时不自动写入 `finishedAt`，OPT-074 上线后将出现日期展示空洞 (S) — 归档:已修 OPT-074/075 (PR#53)
- E125 — 书籍编辑对话框无 `startedAt`/`finishedAt` 日期输入字段，用户无法手动修正自动填充的日期 (S/M) — 归档:已修 OPT-074 (PR#53, 含编辑日期字段)
