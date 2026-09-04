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

## 2026-07-06

> 本次 run 核实 E135（connections 搜索 haystack 缺 tags）及 E149（build_sample_state 时间/currentPage 不一致）仍未提拔，确认证据仍有效。新增 E158–E161 四条方向：OPT-087 刚加的 `book.review` 字段未进 matchBooks()（E158）；两条来自 2026-07-06 信号的功能方向（E159 AI 读后感，E160 星级评分）；E161 补充 E135 的姊妹缺陷（connections 全局搜索也漏 tags）。将 E135（connections 搜索 haystack 缺 tags）提拔为 OPT-096，E158（book.review 未进 matchBooks）提拔为 OPT-097。

### E158 — `matchBooks()` 不搜索 `book.review`，OPT-087 刚加的读后感字段无法被全局搜索命中 (S)

**What:** `app.js:1163-1166`（`matchBooks()`）：

```js
function matchBooks(query) {
  return state.books.filter(
    (book) => fuzzyMatch(book.title, query) || fuzzyMatch(book.author || "", query)
  );
}
```

仅搜 `title` + `author`。OPT-087（2026-07-06 同日上线）在书籍对象新增了 `review` 字段（`app.js:2259`，`app.js:3173`），前端表单已保存，详情页已展示（`app.js:3266-3274`），分享卡已使用（`app.js:2834`）。但 `matchBooks()` 未更新，用户在搜索框输入任何读后感关键词，书单 tab 返回零结果。同一函数也缺 `book.tags`、`book.notes`（已列 OPT-092 / E150），`review` 是 OPT-087 带来的新增空缺。

**Why it matters:** 用户写下读后感后自然会尝试「搜某本书的感受」；搜索无结果不仅浪费输入，还会让刚添加的功能显得无效。S 级单函数修改，且与 OPT-092（matchBooks 补 tags/notes）完全同质，可搭车同一 PR。

**Complexity:** S — 在 `matchBooks()` 的 filter 条件里增加 `|| fuzzyMatch(book.review || "", query)`（1 行）。Touch: `app.js:1165`（matchBooks filter）；可同步搭车 OPT-092 一并处理。

**Files:** `app.js:1163-1166`（matchBooks）；参照 `app.js:2259`（addBook review 存储）

**northstar:** 弱-中——「事后回顾」路径：用户通过搜索重新找到有感情关联的书；review 字段刚上线，不修意味着这一字段对搜索毫无价值。与 OPT-092 同类，建议搭车。→ **promoted to OPT-097**

---

### E159 — 信号驱动：「AI 一键生成读后感」功能缺失，用户须全手写 [signal-backed 2026-07-06] (M)

**What:** 2026-07-06 signals.md 新增信号「AI 一键生成读后感」。现有 OPT-087 在书籍对象加入了 `review` 字段（`app.js:2259`，`index.html:361/425` 均有 `<textarea name="review">`），但字段纯手工填写——无 AI 生成入口。Chat 面板（`chat.js`）已有「AI 帮你记录」能力，`PromptBuilder.build_chat_prompt()`（`app_server.py:2398-2435`）在 focused-book 模式下注入完整 book 对象（包含 sessions / quotes），理论上具备上下文来生成 review。

**Why it matters:** 「每次读完一本书后愿意写读后感」与「一键让 AI 生成草稿后微调」之间存在明显摩擦差。OPT-087 已打通字段存储，AI 生成 review 草稿是最自然的下一步：一个「✨ 生成读后感」按钮在书籍编辑对话框或详情页触发，调用现有 `/api/chat` 端点（focused mode），返回文本后填入 textarea，用户确认或微调后保存。

**Complexity:** M — 前端：在书籍编辑对话框（`index.html:425`）的 `review` textarea 旁加「✨ AI 起草」按钮；点击后调用 `/api/chat`（不流式，系统提示要求生成读后感草稿），返回文本填入字段。后端：`PromptBuilder` 已有 focused-book 注入，可复用；可用 `/api/chat` 的非流式调用（已有 `call_deepseek()`），无新 API 端点。总约 40–60 行前端 + 轻微后端 prompt 调整。

**Files:** `index.html:425`（书籍编辑对话框 review 区域）；`app.js`（新建 `generateBookReview()` 函数）；`app_server.py:2398-2435`（PromptBuilder — 可能需小调 system prompt）；`chat.js`（可复用 fetchChat 逻辑）

**northstar:** 中——「拍照摘抄→事后回顾」闭环的终点是「能沉淀书的个人意义」；AI 起草读后感显著降低从读书到写感想的摩擦，与 Theme 2「回顾有价值」直接对应，且由明确信号驱动。

---

### E160 — 信号驱动：书籍缺少独立 1–5 星评分字段，用户只能把喜好埋进文本 [signal-backed 2026-07-06] (M)

**What:** 2026-07-06 signals.md 新增信号「喜欢程度/喜爱程度 → 独立 1-5 星评分字段」。当前书籍对象字段为 `{id, title, author, status, notes, tags, review, currentPage, lastReadAt, startedAt, finishedAt, createdAt, updatedAt}`（`app.js:2250-2271` addBook 路径，结合 OPT-087 新增 review）；无数值型喜好字段。用户须在 `notes` 或 `review` 中手写「5星」，无法做基于评分的过滤/排序。

**Why it matters:** 数值评分是复盘书单时最高频的筛选维度（「只看我评了4星以上的」）；对外展示（WeChat 分享卡）也能直接渲染星级，比文字更直观。与 OPT-087 的 review 字段是天然配对——review 是文字主观感受，rating 是数值化的喜好程度。`sanitize_state()` 已将 books 直接透传，新字段无需后端 schema 变更（与 OPT-087/review 同等处理）。

**Complexity:** M — 前端：在 addBook/editBook 表单（`index.html:361/425`）各加一个星级选择器（1–5 radio 或点击式 `<button>`）；`app.js:2259`（addBook）补存 `rating: Number(...) || 0`；`app.js:3173`（saveBookEdit）同；书单卡面（`app.js:renderBooks()`）显示星标；可选：bookList 排序加「按评分」维度。约 60–80 行前端，无后端改动。

**Files:** `index.html:361`（newBookDialog）；`index.html:425`（bookEditDialog）；`app.js:2259`（addBook）；`app.js:3173`（saveBookEdit）；`app.js`（renderBooks 卡面）

**northstar:** 中——「事后回顾」路径；评分让书单从「打过的书的列表」变为「可按个人价值检索的书库」，直接服务 Theme 2「回顾有价值」，且由明确信号驱动。

---

### E161 — `renderConnections()` 搜索 haystack 缺少 `c.tags`，标签已存储但无法搜索（E135 确认仍有效）(S)

**What:** `app.js:862-866`（`renderConnections()` 搜索过滤）：

```js
const haystack = [
  getBookTitle(c.sourceType, c.sourceId),
  getBookTitle(c.targetType, c.targetId),
  c.thought || "",
].join(" ").toLowerCase();
return haystack.includes(searchRaw);
```

`c.tags`（connections 对象上的标签数组，`index.html` addConnection 表单有 tags 输入字段）被完全排除在 haystack 之外。用户给关联打了「哲学」标签，在搜索框输入「哲学」，该关联不会出现。此条在 E135（2026-06-30）首次登记，今日（2026-07-06）再次核实代码未变，证据有效，从未提拔。

**Why it matters:** 标签是「关联」对象上关系分类的唯一显式维度；搜索跳过 tags 意味着标签系统对搜索路径完全无效。S 级单行修复：将 haystack 数组第三项改为 `[c.thought || "", ...(c.tags || [])].join(" ")`。与 E150/E158 同质——searchable fields 系列共同构成 OPT-092 bundle 的延伸。

**Complexity:** S — 将 `app.js:862-866` haystack 数组的 `c.thought || ""` 替换为 `...[c.thought || "", ...(c.tags || [])]`（1–2 行改动）。无后端改动，无 schema 变更。Touch: `app.js:862-866`（renderConnections filter）。

**Files:** `app.js:862-866`（renderConnections haystack）；参照 `app.js:1163-1166`（matchBooks — 同类缺陷）

**northstar:** 弱-中——「回顾有价值」：用户依赖标签做概念检索，关联搜索漏 tags 使标签化工作付之东流。S 级，建议与 OPT-092（matchBooks 补 tags）、OPT-097（matchBooks 补 review）搭车同一 PR。→ **promoted to OPT-096**

---

> 本次 run 核实 E135（renderConnections haystack 缺 tags）仍有效，提拔为 OPT-096；新增 E158 并提拔为 OPT-097；E159（AI 读后感生成）、E160（书籍星级评分）作为 M 级信号驱动方向登记。

## 2026-07-07

> 本次 run 聚焦：debug/overview 格式不匹配（当前 bug）、renderQuotes 搜索漏 reflection 字段、matchQuotes 死代码。  
> 将 E159（AI 一键生成读后感）和 E160（书籍 1-5 星评分）从 2026-07-06 蓄水池提拔为 OPT-098/OPT-099。

### E162 — `/debug/overview` 用空格格式 `dw_sp` 查询 `model_logs`/`server_errors`，但两表均用 `now_iso()` T 格式存储，格式不匹配导致当天边界计算偏差 (S)

**What (verified):** `app_server.py:4192`：

```python
dw_sp = (now - _td(days=win)).strftime("%Y-%m-%d %H:%M:%S")  # model_logs 用空格格式
```

注释称 `model_logs` 用空格格式存储，但实际插入时（`app_server.py:2079`）调用 `now_iso()`，而 `now_iso()` 定义为（`app_server.py:364-365`）：

```python
def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")
```

Python `.isoformat()` 默认使用 T 分隔符，产生 `YYYY-MM-DDTHH:MM:SS` 格式——而非空格格式。`server_errors.created_at`（`app_server.py:1705`：`now_iso()`）同样为 T 格式。`dw_sp` 被用于两表共 5 处 WHERE 子句（lines 4205, 4212, 4213, 4217, 4224）。

SQLite 文本比较中，`'T'`（0x54）> `' '`（0x20），因此存储值 `"2026-06-24T10:00:00"` 与截止值 `"2026-06-24 12:00:00"` 比较时，因位置 10 的 T > 空格，结果为「大于」——即使实际时间早 2 小时。效果：**截止日当天所有记录均被纳入窗口，无论时间早晚**，窗口边界比预期宽最多约 24 小时。同一文件中已存在 T 格式的对照变量 `dw_iso = (now - _td(days=win)).strftime("%Y-%m-%dT%H:%M:%S")`（line 4191），可直接复用。

**Why it matters:** `/debug/overview` 是 prod 运营监控看板（活跃用户数、LLM 调用量、错误数），错误的时间窗口边界导致 7 天窗口中最多多统计截止日全天数据，使 DAU/LLM 量/错误数轻微虚高；注释「model_logs 用空格格式」与实际代码相悖，会误导维护者理解 DB 格式。S 级一字修复，消除 `dw_sp` 变量，统一用 `dw_iso`。

**Complexity:** S — 将 `app_server.py:4192` 的 `dw_sp` 定义删除（或改为 T 格式），将所有 `dw_sp` 用例（lines 4205, 4212, 4213, 4217, 4224）替换为已有的 `dw_iso`，同时删除错误注释。共 6 处改动，全在同一函数体，无 schema / 前端 / 测试变更。

**Files:** `app_server.py:4191-4192`（dw_iso/dw_sp 定义）；`app_server.py:4205, 4212, 4213, 4217, 4224`（5 处 dw_sp 用例）；`app_server.py:364-365`（now_iso 定义，确认 T 格式）；`app_server.py:2079`（model_logs 插入，确认 now_iso 用例）

**northstar:** 弱——admin/monitoring 路径，不影响用户数据；但错误注释掩盖了真实格式，可能误导后续维护者对 DB timestamp 格式的判断。S 级，可搭车任何后端 PR。

---

### E163 — `renderQuotes()` 搜索 haystack 遗漏 `quote.reflection`，用户无法通过个人理解文本找到摘抄 (S)

**What (verified):** `app.js:1534-1539`：

```js
const haystack = [
  book?.title || "",
  book?.author || "",
  item.content || "",
  (item.tags || []).join(" "),
].join(" ").toLowerCase();
```

haystack 涵盖书名、作者、摘抄原文、标签，但不含 `item.reflection`（「我的理解」字段）。`reflection` 在 UI 多处展示：摘抄详情弹窗（`app.js:2463-2464`：`if (quote.reflection) { reflEl.textContent = quote.reflection; }`）、书详情摘抄预览（`app.js:3298`：`${quote.reflection ? `<span ...>${escapeHtml(quote.reflection)}</span>` : ""}`)）、摘抄分享图（`app.js:2692`：`const reflection = truncateForShare(quote.reflection || "", 90)`）。用户若在 reflection 中记下「这句话让我想到自己创业时的迷茫」，搜索「创业」或「迷茫」，零结果。

**Why it matters:** reflection 是「为什么这句话值得记」的记录——摘抄对象中最个人化、最有长期检索价值的字段。随着 owner 摘抄库增大（2026-07-05 北极星：「很想把之前读过的书的摘抄补全」），reflection 不可搜索意味着这批个人感悟文字与检索路径完全断开，直接违背 Theme 2「回顾有价值」的目标。S 级单行追加，与 E150/E161/OPT-092/096/097 同属「searchable fields 补全」系列，可搭车同一 bundle PR。

**Complexity:** S — 在 `app.js:1538`（`(item.tags || []).join(" ")` 之后）追加 `(item.reflection || ""),`；1 行修改，零后端/DB/测试改动。

**Files:** `app.js:1534-1539`（renderQuotes haystack）；参照 `app.js:2463-2464`（reflection 详情展示）；`app.js:2692`（reflection 分享图用例，确认字段权重）

**northstar:** 弱-中——Theme 2「回顾有价值」：reflection 是「个人意义」字段，搜索它让用户能按「感悟」而非只能按「原文」找到摘抄；已有标签搜索（OPT-092）覆盖了分类维度，补上 reflection 覆盖内容维度，两者合力形成完整的语义搜索。→ **promoted to OPT-098**

---

### E164 — `matchQuotes()` 是死代码：`app.js:1170` 定义但从未在生产代码中调用，注释已过时 (S)

**What (verified):** `app.js:1170-1172`：

```js
// Used by book-detail and quote-tab filtering only. Intentionally NOT wired into globalSearch().
function matchQuotes(query) {
  return state.quotes.filter((quote) => isRegularQuote(quote) && fuzzyMatch(quote.content || "", query));
}
```

注释声称此函数被「书详情和摘抄 Tab 过滤」使用，但 `grep -n "matchQuotes" app.js` 只返回该定义行（line 1170），无任何调用点。`renderQuotes()`（`app.js:1519-1541`）的实际过滤逻辑使用自己的内联 haystack（包含书名、作者、摘抄内容、标签，比 `matchQuotes()` 更全面），不调用此函数。函数仅在 `tests/frontend/global-search.test.js:149, 347-355` 被测试文件直接引用（作为 exports 测试）。

**Why it matters:** 过时注释（"Used by book-detail and quote-tab filtering"）与实际代码不符，会误导维护者：若有人想优化摘抄搜索逻辑（如 E163），可能错误地改 `matchQuotes()` 而非 `renderQuotes()` 的 haystack，产生无效变更。与此同时，`matchQuotes()` 只搜 `content`，比 `renderQuotes()` 的 haystack 更窄，若误将其接入主过滤路径会造成搜索质量退步。

**Complexity:** S — 两个选项：① 清除死代码：删除 `app.js:1170-1172` + 对应测试 `tests/frontend/global-search.test.js:149, 347-355`；② 若后续需提取共享函数，基于 `renderQuotes()` 的完整 haystack 重写（而非现函数）并正确接入。推荐选项①（及时清理），避免「已有函数但无人维护」的陷阱。

**Files:** `app.js:1170-1172`（matchQuotes 死定义）；`tests/frontend/global-search.test.js:149, 347-355`（对应测试）

**northstar:** 弱——代码健康；死代码 + 过时注释不影响用户，但增加维护风险。可搭车任意 app.js 修改。

---

> 本次 run（2026-07-07）核实 `/debug/overview` 时间格式 bug（E162，当前可复现）、`renderQuotes()` 遗漏 reflection（E163，S 级 Theme 2 提升）、`matchQuotes()` 死代码（E164，代码健康）。  
> 从 2026-07-06 蓄水池将 E159（AI 读后感生成）提拔为 OPT-098，E160（书籍 1-5 星评分）提拔为 OPT-099；两项均有 2026-07-06 信号直接驱动、代码路径已验证。E162（dw_sp 修正）、E163（reflection 搜索）、E164（死代码清理）登记候选，建议搭车相关 PR。

## 2026-07-08

### E165 — Excel 导入将「喜欢程度」列写入 `notes` 文本，未填入 OPT-099 新增的 `book.rating` 字段——信号驱动的功能内成回归 (S)

**What (verified):** `importFromExcel()`（`app.js:4089-4113`）提取「喜欢程度」列后将其推入 `notesParts`：

```js
// app.js:4092-4095
const rating = String(getRowField(row, ["喜欢程度", "评分", "rating"])).trim();
if (translator) notesParts.push(`译者：${translator}`);
if (intro) notesParts.push(`简介：${intro}`);
if (rating) notesParts.push(`喜欢程度：${rating}`);
```

构建书籍对象时（`app.js:4098-4113`）：

```js
// app.js:4106
notes: notesParts.join("\n"),
// 无 rating: 字段
```

对比 OPT-099（2026-07-08 同日合并）新增的路径——`addBook()`（`app.js:2316`）和 `saveBookEdit()`（`app.js:3274`）均已存取 `book.rating`，详情页（`app.js:3371-3380`）和分享卡（`app.js:2907`）均已展示星级。唯独 Excel 导入路径未同步，用户从 Excel 批量入库数百本书后，每本书的「喜欢程度：5」都被埋在 `notes` 文本中，而非 `rating` 数字字段，无法触发星级 UI 展示。

**Why it matters:** 2026-07-06 信号明确指出「喜欢程度被混进内容简介，希望拆成独立字段」——OPT-099 响应了该信号，但遗漏了 Excel 导入路径。用户最常通过 Excel 批量初始化书单，若历史书单含「喜欢程度」列，导入后依然看不到星级，体验与信号诉求直接矛盾。修复代价极小（2 行）：提取数值并加入 book 对象 `rating` 字段。

**Complexity:** S — `app.js:4092`：改为 `const ratingNum = Number(rating) || 0;`；`app.js:4098-4113` book 对象加 `rating: ratingNum`；可选：`notesParts.push` 的 rating 一行同时删除（已存入独立字段，无需再写 notes）。Touch: `app.js:4092-4113`（importFromExcel 书籍对象构建段）。

**Files:** `app.js:4089-4113`（importFromExcel 书籍对象构建）；对比参照 `app.js:2316`（addBook rating 存取）；`app.js:3274`（saveBookEdit rating 存取）

**northstar:** 强——2026-07-06 信号直接驱动（OPT-099 为信号响应，本项修复同信号下的遗漏路径）；Excel 是书单初始化的主通道，修复后用户历史书单评分才能真正进入 rating 字段，OPT-099 的用户价值才算闭环。→ **promoted to OPT-100**

---

### E166 — `generateBookReview()` 只填 textarea，未存 AI 来源标记；详情页「我的读后」标签对 AI 草稿和手写读后感零区分 (S)

**What (verified):** `generateBookReview()`（`app.js:2264-2291`）将 AI 回复直接填入 textarea：

```js
// app.js:2281
if (reply) {
  textarea.value = reply;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
```

函数仅操作 `textarea.value`，不写入任何 AI 来源标记字段（`reviewIsAi`、`aiGenerated`、`review_source` 等在全文件 grep 中零出现）。书籍详情展示（`app.js:3371-3375`）：

```js
// app.js:3375
`<div class="book-detail-review"><span class="book-detail-sub-label">我的读后</span><p>${escapeHtml(detailReview)}</p></div>`
```

标签硬编码为「我的读后」，无法区分「AI 草稿」与「手写读后感」。

**Why it matters:** 2026-07-06 信号明确要求：「展示时明确标注『AI 根据笔记整理』，与手写读后感区分」。缺乏区分会导致两个问题：① 用户不确定某段读后感是 AI 草稿还是自己写的，在意义感知上有混淆；② OPT-098 的 AI 功能价值被静默掩盖——用户可能不记得哪些读后感是 AI 生成的。修复的最小可行方案：存一个 `book.reviewIsAi: true` 标记，详情页据此在标签旁追加「（AI 草稿）」提示；分享卡同步展示区分文案。

**Complexity:** S — ① `generateBookReview()`（`app.js:2280-2282`）填入 reply 后，同步触发一个 `data-review-is-ai="true"` 的 hidden input 或直接在提交时读取（最简：在 textarea 附近加一个 `<input type="hidden" name="reviewIsAi" value="true">` 由 AI 按钮点击时写入）；② `addBook()`（`app.js:2316`）和 `saveBookEdit()`（`app.js:3274`）存取 `reviewIsAi: formData.get("reviewIsAi") === "true"`；③ 详情页（`app.js:3375`）和可选分享卡（`app.js:2907`）根据 `book.reviewIsAi` 在「我的读后」标签旁追加「（AI 草稿）」。零后端变更，零 DB schema 变更。Touch: `app.js:2280-2282`（generateBookReview）；`index.html`（hidden input）；`app.js:2316`、`app.js:3274`（addBook/saveBookEdit 存取）；`app.js:3375`（详情页展示）。

**Files:** `app.js:2264-2291`（generateBookReview）；`app.js:3371-3375`（书籍详情 review 展示）；`app.js:2907`（分享卡 review 段）；`index.html`（addBook/editBook 对话框，AI 按钮所在）

**northstar:** 中——OPT-098 上线了 AI 读后感功能，但「AI vs 手写」无法区分是该功能的完整性缺口；2026-07-06 信号对此有明确诉求；S 修复使 OPT-098 的价值真正落地。→ **promoted to OPT-101**

---

### E167 — Excel 导入成功只弹 2 秒 toast，与 JSON 导入的持久结果弹窗（`showImportResult`）体验不一致 (S)

**What (verified):** Excel 导入成功路径（`app.js:4124`）：

```js
showToast(`Excel 导入成功：新增 ${imported} 本`);
```

JSON 导入成功路径（`app.js:3994`）：

```js
showImportResult(state);  // 持久弹窗，显示书/摘抄/记录/关联明细数字
```

`showImportResult()` 定义于 `app.js:3958`，展示一个用户须主动关闭的结果对话框，包含 4 行明细（books / quotes / sessions / connections 各自数量）。OPT-041（PR #42）已将 JSON 导入从 toast 升级为此弹窗，但 Excel 路径未做同等升级。toast 2 秒自动消失，「有 7 本重复被跳过」用户无从验证。

**Why it matters:** 数据导入的透明度是 OPT-041 立意核心（误导入事故驱动）。Excel 用户「新增 3 本」但文件里有 10 本时，无法确认是否有 7 本被跳过还是文件格式问题。双入口体验不一致降低用户对导入功能的信任感。`showImportResult()` 已存在，复用成本极低；Excel-only 导入（无摘抄/记录）时结果弹窗仅展示书数行，其余行为 0，可接受。

**Complexity:** S — `app.js:4124`：将 `showToast(...)` 改为 `showImportResult(state)`（1 行），确认 `showImportResult` 对 quotes/sessions 均为 0 时展示正常（已验证 `showImportResult` 读取 `state.quotes.length` 等，Excel 导入不增加摘抄故显示 0，无副作用）。Touch: `app.js:4124`。

**Files:** `app.js:4124`（Excel 导入成功路径）；`app.js:3994`（JSON 导入参照）；`app.js:3958`（showImportResult 定义）

**northstar:** 弱/中——与 OPT-041「零丢失」原则一脉相承；Excel 是 W28 OPT-001 的核心入口，用户首次批量导入应得到与 JSON 相同透明度的反馈；S 改动，建议与 E165（Excel import rating）搭车同一 PR。

---

### E168 — `deleteBook()` 对话框仅显示书名，级联删除数量（N 摘抄 / M 记录）不具体 (S)

**What (verified):** `deleteBook()`（`app.js:2432-2434`）：

```js
els.deleteBookMessage.textContent = book.title;
els.deleteBookDialog.showModal();
```

`#deleteBookDialog`（`index.html:530-539`）内有静态警告「⚠️ 同时删除该书的所有阅读记录、摘抄和探讨历史，无法恢复。」，但 `els.deleteBookMessage` 仅填入书名，未包含具体数量——「删除《百年孤独》」而非「删除《百年孤独》（含 23 张摘抄、5 条记录）」。

**Why it matters:** 删除是不可逆操作。用户有「意外删掉书」的真实风险（尤其误触）；「23 张摘抄将永久消失」的量级感知，与类别警告「所有摘抄」的抽象感知，在放弃率上有本质差异。`state.quotes.filter(q => q.bookId === bookId).length` 等统计值 app 本地即可计算，无需额外 API 调用。

**Complexity:** S — `app.js:2432` 前插入 3 行：计算该书的 quotes 数和 sessions 数，若非零则将「（含 N 张摘抄、M 条记录）」追加到 `deleteBookMessage.textContent`。Touch: `app.js:2429-2434`（deleteBook dialog 填充段）。

**Files:** `app.js:2429-2434`（deleteBook dialog 填充）；`index.html:530-539`（deleteBookDialog 模板）

**northstar:** 弱/中——「不假思索的默认工具」须让用户对破坏性操作有清晰感知；级联数量可见性是透明度系列（OPT-043/041）的对称延伸；与 E169 搭车是最低成本方案。

---

### E169 — `deleteQuote()` 确认文案不提及将级联删除关联，用户无感知 connections 静默消失 (S)

**What (verified):** `deleteQuote()`（`app.js:3181-3187`）：

```js
// app.js:3183-3187
showConfirmDialog({
  message: "确定删除这张摘抄卡片吗？",  // 无关联数量
  onConfirm: async () => {
    state.quotes = state.quotes.filter((item) => item.id !== quoteId);
    state.connections = (state.connections || []).filter((c) => c.sourceId !== quoteId && c.targetId !== quoteId);  // 静默删除关联
```

用户点击「确认」时，该摘抄的所有「思想关联」一并被删除，但对话框文案只说「确定删除这张摘抄卡片吗？」，完全不提关联。对比 `deleteBook()`（`index.html:533`）已有「⚠️ 同时删除该书的所有阅读记录、摘抄和探讨历史，无法恢复。」类别级警告。关联（connections）是 Theme 2 差异化数据——用户手动建立的思想碰撞链接，误删无法恢复。

**Why it matters:** 「建立关联」是 app 差异化功能（owner 主动投入，OPT-079/080 专项优化）；删摘抄时静默消灭关联与「零丢失」原则相悖。`getConnectionCount(quoteId)` 已有实现（`app.js:675-677`），若返回 > 0 即可在文案末追加「及其 N 个思想关联」，约 3 行。

**Complexity:** S — `app.js:3183` 前插入 2 行：`const connCount = getConnectionCount(quoteId); const connNote = connCount > 0 ? \`及其 ${connCount} 个思想关联\` : "";`，将 `message` 改为 `` `确定删除这张摘抄卡片${connNote}吗？` ``。Touch: `app.js:3181-3185`。

**Files:** `app.js:3181-3187`（deleteQuote showConfirmDialog 段）；`app.js:675-677`（getConnectionCount 参照）

**northstar:** 中——Theme 2「回顾有价值」的前提是连接网络数据可靠；关联是用户花时间建立的意义链接，无声消失最为有害；S 修复，与 E168（deleteBook 数量）、OPT-043（导入过载守卫）同属「破坏性操作透明度」系列，建议三者合并为单一 PR。

---

> 本次 run（2026-07-08）核实 Excel 导入 rating 回归（E165，OPT-099 遗漏路径，signal-backed）、AI 读后感来源标记缺失（E166，2026-07-06 信号明确要求，代码路径已验证）、Excel/JSON 双导入体验不一致（E167，E96 重登记）、deleteBook/deleteQuote 级联数量透明度缺口（E168/E169，E89/E92 重登记）。将 E165 提拔为 OPT-100、E166 提拔为 OPT-101，均有 signal 直接佐证且代码路径完整核实。

## 2026-07-09

### E170 — 分享卡片 canvas 硬编码亮色主题调色板，完全忽略 OS 深色模式 (S-M)

`app.js:2599-2606`：
```js
const SHARE_CARD = {
  W: 1080, PAD: 84,
  bg: "#f5f0e8", ink: "#3d4a3f", inkSoft: "#5a6a5d", inkMuted: "#8a948a",
  accent: "#c9a85a", pillBg: "#e7ecdf",
  ...
};
```
`app.js:2683-2684`（`newShareCanvas()`）：
```js
ctx.fillStyle = C.bg;   // 始终使用亮色米白底，不检测 prefers-color-scheme
ctx.fillRect(0, 0, C.W, height);
```

三种分享卡片（`renderQuoteShareCard`、`renderConnectionShareCard`、`renderBookShareCard`）全部调用 `newShareCanvas(C, height)`，`C` 恒为同一个 `SHARE_CARD` 对象。代码中无任何 `window.matchMedia('(prefers-color-scheme: dark)')` 调用。OPT-021（PR#21）已通过 CSS `@media` 实现全 UI 深色模式，但 canvas 在 CSS 之外；OPT-087（2026-07-06）上线分享卡片时未补充暗色路径。

**Why it matters:** 深色模式用户点击「分享」时，输出的是 #f5f0e8 米白底卡片——与深色 UI 视觉割裂，发到微信朋友圈/聊天时观感突兀。分享卡片是 app 的对外展示窗口，OPT-087 刚上线即暴露此遗漏。修复方案：新增 `SHARE_CARD_DARK`（深色版调色板），在三个 `renderXShareCard` 入口各查一次 `matchMedia`，根据结果选择调色板传入 `newShareCanvas`。

**Complexity:** S-M — 新增一个常量对象 + 三处各加一行 `matchMedia` 判断，无 API/schema 改动。Touch: `app.js:2599-2606`（新增 `SHARE_CARD_DARK`）、`renderQuoteShareCard`、`renderConnectionShareCard`、`renderBookShareCard` 各入口（各 1 行）。

**Files:** `app.js` — `SHARE_CARD`（line 2599）、`newShareCanvas`（line 2676）、三个 `renderXShareCard` 函数

**northstar:** 中——分享卡片是「让阅读感染他人」的对外接口；深色模式用户输出白底卡片体验割裂，影响分享意愿；OPT-087 刚上线，修暗色路径是该功能的完整度收尾。

---

### E171 — MCP `summary()` 写入 `book.notes` 而非 `book.review`——OPT-098 上线后两条 AI 路径语义分裂 (S)

`reading_mcp_server.py:323`：
```python
book["notes"] = ((book.get("notes") or "") + "\n\n" + content).strip()
```
工具 docstring（lines 300-306）明确："会把总结内容追加到对应书的 book.notes 字段末尾……这是面向书的『成长记录』"。

OPT-098（2026-07-08 合并）为 AI 生成读后感新增了独立的 `book.review` 字段；in-app `generateBookReview()` 写入 `book.review`，书籍详情页渲染时（`app.js:3374-3379`）将 `book.review` 显示为「我的读后」，将 `book.notes` 显示为「内容简介」。

MCP `summary()` 写入 `book.notes`，导致：
1. MCP 产生的 AI 摘要在 UI 里被贴「内容简介」标签——语义完全错位。
2. OPT-101 计划为 `book.review` 追加 `reviewIsAi` 来源标记；MCP 路径永远不会触发该标记，AI 来源区分对 MCP 用户无效。
3. 两条 AI 摘要路径并存：in-app → `book.review`；MCP → `book.notes`——同一用户操作的双轨分叉难以维护。

**Why it matters:** 2026-07-06 信号「AI 把书的笔记整理成读后感」直接驱动 OPT-098；MCP `summary()` 是同一诉求的另一入口，修复后两条路径才能进入同一字段、共享 OPT-101 的 `reviewIsAi` 标记。S 级 1 行改动。

**Complexity:** S — `reading_mcp_server.py:323` 改 `book["notes"]` → `book["review"]`；更新 docstring（line 296-307）说明目标字段已变更；确认 `sanitize_state()` 已透传 `review` 字段（`app_server.py:699-749` 通过 book 对象原样存取，无需改动）。

**Files:** `reading_mcp_server.py:290-328`（`summary()` 工具；核心改 line 323，更新 docstring）

**northstar:** 中——2026-07-06 信号直接驱动；MCP 路径写入错字段使 OPT-098 对 MCP 用户名存实亡，OPT-101 的来源标记亦无法覆盖；S 修复完成 OPT-098 的跨客户端闭环。→ **提拔为 OPT-103**

---

### E172 — 账户导出 `exportedAt` 使用 `now_iso()`（naive 本地时间，无 Z 后缀），与导出体内所有其他 ISO 字段不一致 (S)

`app_server.py:3938`：
```python
export = {
    "exportFormat": 1,
    "exportedAt": now_iso(),   # e.g. "2026-07-09T11:30:00"，无时区
    "user": { ... },
    "state": state,            # state 内所有 createdAt/updatedAt 均为 UTC+Z
    ...
}
```
`now_iso()`（`app_server.py:364`）返回 naive 本地时间字符串，无 `Z` 后缀。导出体内书籍/摘抄/会话的 `createdAt`/`updatedAt` 由前端 `new Date().toISOString()` 生成，格式为 UTC+Z（如 `"2026-07-09T03:30:00.000Z"`）。

对比：E36/OPT-024（`ActionExecutor`）、E47/OPT-031（`reading_mcp_server.py`）、E56（`TraceManager`）均已修复或登记同类 `now_iso()` 滥用。E44（`save_state()` 的 `updated_at`）同类未修。本条专指导出端点的元数据字段。

**Why it matters:** `exportedAt` 是导出备份的锚点时间戳；naive 时间与体内 UTC+Z 字段并存，任何解析器须猜测时区。若未来加入"对比两份导出差异"或"分析备份间隔"功能，这里埋的歧义会直接放大。1 行改动，零副作用。

**Complexity:** S — `app_server.py:3938` 改 `now_iso()` → `utc_now_iso()`；`utc_now_iso` 已定义（line 368），无需额外改动。

**Files:** `app_server.py:3936-3938`（export 字典构建）

**northstar:** 弱——数据质量；`exportedAt` 与导出体内其他字段时区不一致，为未来解析路径埋下歧义；S 改动，无 UI 影响。

---

> 本次 run（2026-07-09）在 OPT-098（AI 读后感）和 OPT-087（分享卡片）上线后做后续扫描。新发现 3 条：E170 分享卡片 canvas 不感知深色模式（OPT-087 上线遗漏）、E171 MCP summary() 仍写 book.notes 而非 OPT-098 新增的 book.review（跨客户端语义分裂，S 修复，signal-backed）、E172 账户导出 exportedAt 使用 naive 本地时间（与导出体内 UTC+Z 字段不一致）。将 E171 提拔为 OPT-103（MCP 路径跨客户端闭环，signal-backed）、E170 提拔为 OPT-104（分享卡片暗色路径）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-10

### E173 — 豆瓣阅读记录一键导入（读完日期 / 评分 / 读后感）——四条历史信号汇聚，当前无任何导入路径 (M)

全文件 grep `douban`、`豆瓣` 零匹配：`app.js`、`app_server.py`、`index.html` 均无相关代码。

三个目标字段均已就位：
- `book.finishedAt`（OPT-074，PR#53）——`sanitize_state()` 透传，书籍详情/编辑对话框均有 date input
- `book.rating`（OPT-099，2026-07-08）——`app.js:2316`（`addBook`）、`app.js:3274`（`saveBookEdit`）已存储
- `book.review`（OPT-087/098，2026-07-06/08）——详情、分享、编辑均已展示

豆瓣「我读」导出 CSV 标准列：书名、作者、出版社、出版年、页数、我的评分（1-5）、阅读状态、标签、我的评论、读完日期。列与字段映射：`我的评分` → `book.rating`；`读完日期` → `book.finishedAt`；`我的评论` → `book.review`。

实现范式可复用 `importFromExcel()`（`app.js:4087-4145`）的三步模式：
1. `FileReader` 读 CSV（注意豆瓣 CSV 可能 GBK 编码，须 `TextDecoder('gb18030')` 解码）→ 逐行解析
2. 按书名模糊匹配（`fuzzyMatch`，已有）→ 命中则 patch 三字段，未命中则新增书籍
3. `syncState()` 保存，`showImportResult()` 展示结果（新增/更新书目数量）

**Why it matters:** 四条信号汇聚：2026-06-26（读完日期）、2026-07-06（评分）、2026-07-06（AI 读后感）、2026-07-10（owner 显式请求豆瓣一键导入）；且 triage 2026-07-10 明确指示 Agent3「评估并提拔为新 OPT」。豆瓣是中文读者最主要的历史数据仓库，一次导入批量补全三个字段，无需逐本手动录入；三个目标字段均已存在，导入逻辑可复用已有范式，M 复杂度可控。

**Complexity:** M — 新增 `importFromDouban()` 函数（约 80-100 行：CSV 解析 + 书名匹配 + 三字段 patch）；`index.html` 在「我的」抽屉导入区加隐藏 file input（`accept=".csv"`）+ 触发按钮 + 可选引导弹窗（说明豆瓣 CSV 导出步骤，复用 `#importExcelModal` 结构）；无后端/DB schema 变更（字段均已存在）。

**Files:** `app.js`（新增 `importFromDouban()` + 事件绑定）; `index.html`（导入按钮 + file input + 可选引导弹窗）

**northstar:** 强——四条信号驱动；OPT-074/099/098 三项已完成字段层建设，本项打通数据入口，是「补全历史阅读档案」路径的最终一步；直接推进 Theme B0「对外可用」用户首次使用时的数据完整度。→ **提拔为 OPT-105**

---

### E174 — 书单卡面不展示 `book.rating`，OPT-099 上线后书单页评分对用户不可见 (S)

`app.js:1298-1311`（`buildBookSearchCard()` 卡面渲染末段，实际读取代码）：
```js
const tags = (book.tags || [])
  .map(t => `<span class="book-tag">${escapeHtml(t)}</span>`)
  .join("");
// ...
<div class="book-grid-meta">🕐 ${metrics.count} 次 · ✍️ ${qCount} 张${cCount ? ` · 🔗 ${cCount} 关联` : ""}</div>
<div class="book-grid-meta">📖 ${escapeHtml(progressText)}</div>
${tags ? `<div class="book-tag-row">${tags}</div>` : ""}
```
无任何 `book.rating` 展示代码。对比：书籍详情对话框（`app.js:3368-3369`）调用 `renderStarRating(book.rating)`；书卡分享图（`app.js:2929`）同样展示星级。OPT-099（2026-07-08）添加了 `book.rating` 字段并在上述两处展示，但 `buildBookSearchCard()` 未同步更新。

**Why it matters:** 书单页是最高频入口；评分在卡面不可见意味着用户浏览书单时无法感知哪些书值得重读或推荐——须点进详情才能看到星级，降低了 OPT-099 的实际信息密度价值。`renderStarRating()` 已存在，S 级 1-2 行改动，无 API/schema 变更。

**Complexity:** S — 在 `buildBookSearchCard()` tag-row 后追加：`${book.rating > 0 ? \`<div class="book-grid-meta">${renderStarRating(book.rating)}</div>\` : ""}` 约 1-2 行；`renderStarRating()` 已存在可直接复用，建议与 OPT-100（Excel 导入 rating 路径）搭车同一 PR 对齐 rating 展示完整性。

**Files:** `app.js:1307-1311`（`buildBookSearchCard` 卡面尾部渲染区域）

**northstar:** 弱-中——OPT-099 的星级评分使书单从纯列表变为可感知价值排序的书库；卡面若不显示评分，则该特性在最高频入口对用户无效；是 OPT-099 完整性的末端收尾。

---

> 本次 run（2026-07-10）响应 triage 2026-07-10 显式指令（豆瓣导入评估）并做 OPT-098/099 上线后的后续扫描。新发现 2 条：E173 豆瓣阅读记录一键导入（四条信号汇聚，M 级，三个目标字段已就位，补写导入函数即可）、E174 书单卡面不展示 `book.rating`（OPT-099 上线遗漏，S 级 1-2 行补渲染）。同时将 2026-07-08 已核实的 E169（`deleteQuote()` 确认弹窗不提及级联删除关联数量，`getConnectionCount()` 已存在可直接复用，Theme 2 核心数据保护，S 级 3-4 行改动）提拔为 OPT-106。将 E173 提拔为 OPT-105（triage 指定 + 四条信号 + 强 northstar）、E169 提拔为 OPT-106（S 级，Theme 2 连接网络数据可靠性）。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-11

> 本次 run 聚焦：2026-07-11 信号直接驱动的三条方向（AI 读后感截断错配、书单多维筛选无统一清除、关联对话框 OCR 摘抄标签空白）。所有断言均经代码 Read 验证，file:line 已标注。
> 提拔：E176（书单多维筛选无统一「清除全部」）→ OPT-107；E175（AI 读后感字数与分享卡截断错配）→ OPT-108。

### E175 — `generateBookReview()` 提示词要求 100-200 字，但分享卡在 150 字处截断——AI 读后感可能总被截断 (S)

**What (verified):** `app.js:2317`（`generateBookReview()` 发送给 LLM 的 message）：

```js
message: "请根据你的阅读记录和摘抄，为这本书写一段简短的读后感（100-200字），包含你对这本书的个人感受和评价。",
```

`app.js:2950`（`renderBookShareCard()` 书卡内容截断）：

```js
const notes = truncateForShare(review || book.notes || "", 150);
```

`truncateForShare()`（`app.js:2690-2693`）在 150 字处切断并追加"…"。若 AI 生成 151-200 字的读后感（提示词允许上限 200 字），分享卡将展示被截断版本——正是 2026-07-11 owner 报告的问题。修复：把提示词字数上限从「200 字」改为「120 字」（为"…"留余量），使 AI 输出保证在截断门槛以内。

**Why it matters:** 2026-07-11 信号：「AI 生成读后感时限制字数，篇幅最好正好适合在书卡分享图里全文展示（不被截断、也不留大片空白）」。OPT-098（AI 读后感生成）和 OPT-087（分享卡）均已上线，但两者字数约束未对齐，导致新功能在分享时仍出现截断。提示词字数调整是最小代价的闭环。

**Complexity:** S — `app.js:2317`：将「100-200字」改为「80-120字」（确保 AI 输出落在 `truncateForShare` 150 字门槛以内）；零后端/HTML/schema 改动。Touch: `app.js:2317`（generateBookReview message 字段）；参照 `app.js:2950`（书卡截断门槛）。

**Files:** `app.js:2317`（generateBookReview LLM message）；`app.js:2950`（truncateForShare 截断门槛，参照）

**northstar:** 中——OPT-098（AI 读后感）和 OPT-087（分享卡）是 Theme 2「让阅读感染他人」路径的两块积木；字数不对齐使分享时读后感总被截断，降低分享意愿；S 修复完成两个已上线功能的最后一块拼图。→ **提拔为 OPT-108**

---

### E176 — 书单三个过滤维度（文字搜索 + 状态筛选 + 标签筛选）无统一「一键清除」，`restoreDefaultView()` 只重置文字搜索而不重置 chip 状态 (S-M)

**What (verified):** 书单 Tab 有三个独立的过滤维度：

1. 文字搜索（`#booksSearchInput`，`index.html:89`，`type="search"`）
2. 状态筛选 chip（`selectedStatusFilter`，`app.js:195`，默认 `"all"`）
3. 标签筛选 chip（`selectedTagFilter`，`app.js:196`，默认 `""`）

`app.js:1408-1418`（`restoreDefaultView()`）：

```js
function restoreDefaultView() {
  searchQuery = "";
  if (els.statusFilterChips) {
    els.statusFilterChips.style.display = "";  // ← 只让 chip 条可见，不重置选中状态
  }
  const tagStrip = document.querySelector("#tagFilterStrip");
  if (tagStrip) {
    tagStrip.style.display = "";               // ← 同上，只让标签条可见
  }
  renderBooks();                               // ← selectedStatusFilter / selectedTagFilter 未被重置
}
```

`globalSearch("")`（清空搜索时）调用 `restoreDefaultView()`，使 chip 条重新可见，但 `selectedStatusFilter` 和 `selectedTagFilter` 模块变量保持上次用户选中的值不变。`renderBooks()`（`app.js:1450-1456`）仍以旧 chip 值过滤结果，用户以为「已清除」，实际仍在筛选状态中。

**Why it matters:** 2026-07-11 信号：「用关键词搜索/筛选后，希望有一个『快速清除筛选』的按钮（如搜索框内的 ✕ 或一键清空），一下回到全部，不用手动逐字删关键词。书单/摘抄/关联各搜索框都适用」。书单 `type="search"` 输入自带浏览器原生 ✕ 按钮，但只清除文字、不重置 chip——行为与「一下回到全部」预期不符。修复：`restoreDefaultView()` 内追加 `selectedStatusFilter = "all"; selectedTagFilter = "";` 并同步更新 chip 的 active CSS 状态。

**Complexity:** S-M — `app.js:1408-1418`（`restoreDefaultView()`）：追加变量重置 + 同步更新 chip active 状态（参照 `app.js:5178-5182` 的更新模式）；可选在 `index.html:89-97` 区域插入显式「清除全部」按钮（仅过滤激活时可见）。约 10-15 行改动，无后端/schema 变更。

**Files:** `app.js:1408-1418`（restoreDefaultView）；`app.js:195-196`（selectedStatusFilter/selectedTagFilter 定义）；`app.js:5178-5182`（chip active 状态更新参照）；可选 `index.html:89-97`（搜索框 + chip strip 区域）

**northstar:** 中——W28「检索修通」的可用性前提：多维筛选后无法一键复位违反最小惊讶原则，降低筛选功能信任度；2026-07-11 信号明确驱动，是 Theme 2「回顾有价值→能找到」路径的基础流畅度保障。→ **提拔为 OPT-107**

---

### E177 — `quoteLabel()` 在关联对话框摘抄下拉中不回落 `ocrText`，OCR 摘抄在目标选择列表中全部显示为「书名 · 」空白标签 (S)

**What (verified):** `initQuoteCombobox()`（`app.js:4593-4597`）构建每条摘抄的显示标签：

```js
function quoteLabel(q) {
  const book = state.books.find((b) => b.id === q.bookId);
  const bookName = book ? book.title : "未知书籍";
  const content = (q.content || "").slice(0, 70) + (q.content?.length > 70 ? "…" : "");
  return `${bookName} · ${content}`;
}
```

`content` 回落链为 `(q.content || "").slice(0, 70)`——当 `q.content` 为空字符串时（快速 OCR 直接保存、未手动编辑的摘抄），`content` 为空，标签退化为 `"书名 · "`，无任何可辨识内容。

对比同文件已有的正确回落模式：`renderQuotes()`（`app.js:1519`）以 `quote.content || quote.ocrText` 显示摘抄原文；用户在摘抄列表 Tab 看到完整 OCR 文本，而在关联对话框同一张摘抄的标签变为空白。来自同一本书的多张 OCR 摘抄在下拉中全部显示相同的 `"书名 · "` 空标签，用户无法区分。

`filteredQuotes()`（`app.js:4600-4607`）的关键词搜索同样只检索 `item.content`（`app.js:4605`），不含 `item.ocrText`，OCR 摘抄也无法被搜索到。

**Why it matters:** 2026-07-11 信号：「目标若选摘抄，关键词搜索后每条摘抄显示不完整（被截断），看不清内容、找不到想关联的那一条」。快速 OCR 是最高频采集路径，OCR-only 摘抄占比随使用积累快速上升。这些摘抄在关联目标选择框中对用户完全不可辨识，严重阻碍 Theme 2「建立关联」场景。修复：`quoteLabel()` 的 `content` 改为 `(q.content || q.ocrText || "").slice(0, 70)`，同步修复 `filteredQuotes()` 的搜索加 `ocrText` 列，共约 2 行。

**Complexity:** S — `app.js:4596`：将 `(q.content || "").slice(0, 70)` 改为 `(q.content || q.ocrText || "").slice(0, 70)`（1 行）；`app.js:4605`：搜索加 `|| (item.ocrText || "").toLowerCase().includes(lower)` 分支（1 行）；零副作用，无 HTML/后端/schema 改动。

**Files:** `app.js:4584-4690`（`initQuoteCombobox`，含 `quoteLabel:4593`、`filteredQuotes:4600-4607`）；参照 `app.js:1519`（renderQuotes 中已有 content || ocrText 回落模式）

**northstar:** 中——Theme 2「建立关联」的可操作性直接前提：若用户无法在目标选择框中识别 OCR 摘抄，整个连接建立流程对 OCR 存量高的用户形同瘫痪；S 级 2 行修复，与 2026-07-11 信号直接对应。

---

> 本次 run（2026-07-11）响应 2026-07-11 信号三条方向：AI 读后感字数与分享卡截断错配（E175，S 级，`app.js:2317` vs `app.js:2950`）、书单三维过滤无统一「一键清除」（E176，S-M 级，`app.js:1408-1418` restoreDefaultView 未重置 selectedStatusFilter/selectedTagFilter）、关联对话框 OCR 摘抄标签空白（E177，S 级，`app.js:4596` quoteLabel 缺 ocrText 回落）。将 E176 提拔为 OPT-107，E175 提拔为 OPT-108。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-12

### E178 — `renderTimeline()` 搜索 haystack 不含 `s.date`，用户无法按时间段（"6月"、"2026-07"）搜索动态记录

**What (verified):** `app.js:1512`：
```js
const haystack = [book?.title || "", book?.author || "", s.note || ""].join(" ").toLowerCase();
```
`s.date` 为 ISO 字符串（如 `"2026-06-01T00:00:00.000Z"`），未被拼入 haystack。用户在动态 Tab 搜索「6月」、「2026-07」或具体日期时，即便有匹配 session，搜索也返回零结果。

**Why it matters:** Theme 2「回顾有价值」的核心场景之一是「按时间段回顾：这个月读了什么 / 去年某月读了什么」。「动态」Tab 是专为时序阅读记录设计的界面，但不支持按日期搜索，与设计初衷背道而驰。只需将 `s.date?.slice(0, 7) || ""` 拼入 haystack（截取年月前缀 `"2026-06"`），搜「2026-06」即可命中该月所有记录，1 行改动，且与 OPT-076（时间线加载更多，PR #62 in-progress）天然搭车。

**Complexity:** S — `app.js:1512`：haystack 数组末尾加 `s.date?.slice(0, 7) || ""`，1 行，零副作用，无 HTML/后端/schema 改动。

**Files:** `app.js:1512`（`renderTimeline` haystack 构建）

**northstar:** 中——Theme 2「回顾有价值」直接命中；动态 Tab 是时序浏览的唯一界面，缺少日期搜索是功能完整度缺口；S 级 1 行修复，建议搭车 OPT-076（PR #62）。

---

### E179 — `addSession()` 仅在 `book.startedAt` 为空时写入；补录更早记录后开始日期不更新

**What (verified):** `app.js:2447`：
```js
if (!book.startedAt && !(book.finishedAt && date > book.finishedAt)) book.startedAt = date;
```
条件 `!book.startedAt` 只在字段为空时才写入。若用户先记了 2026-06-15 的 session（`book.startedAt = "2026-06-15"`），后来补录 2026-06-01 更早的起点，`addSession()` 因 `!book.startedAt` 为 false 直接跳过，`book.startedAt` 停留在 `"2026-06-15"`，OPT-074（PR #53）书卡展示的「开始日期」永远不会更正为实际更早日期。

**Why it matters:** OPT-074 已上线「开始/读完日期」书卡展示，开始日期现在对用户可见。补录历史 session 后，`startedAt` 停在错误值，书卡时间跨度失真；与 OPT-093（`deleteSession()` 不回写 `currentPage`）属同类数据准确性问题。修复将条件改为 `(!book.startedAt || date < book.startedAt)` 即可，与 OPT-093 搭车成本最低。

**Complexity:** S — `app.js:2447`：将 `if (!book.startedAt && ...)` 改为 `if ((!book.startedAt || date < book.startedAt) && ...)`，1 行，纯前端，零后端/DB 改动。

**Files:** `app.js:2447`（`addSession` `startedAt` 写入条件）

**northstar:** 弱-中——OPT-074 上线后的数据准确性收尾；补录早期记录场景不高频，但错误展示已出现在 UI；建议与 OPT-093（deleteSession 不回写进度）合并一 PR。

---

### E180 — Excel 导入模板无「读后感」列，`importExcel()` 不写入 `book.review`——与 OPT-100（rating）的对称遗漏

**What (verified):** `app.js:4083`（`downloadExcelTemplate()` 模板列定义）：
```js
const headers = ["书名", "作者", "状态", "标签", "总页数", "开始时间", "完成时间", "译者", "简介", "喜欢程度"];
```
列表中无「读后感」。`importExcel()`（`app.js:4130-4153`）解析行时不提取 review 数据，构建的 book 对象（`app.js:4139`）无 `review` 字段。OPT-098（AI 读后感 `book.review` 字段）和 OPT-105（豆瓣 CSV 导入，将解析 `我的评论` → `book.review`）已分别上线/triaged，但 Excel 路径（最老、最常用的批量导入通道）尚未补齐这一对称改动。

**Why it matters:** OPT-100（2026-07-08，已 triaged）已修 Excel `喜欢程度 → book.rating`；本项是同批遗漏的对称续集。用户自制 Excel（来自 Notion/Sheets/书单导出）如含手写读后感，导入时只能写入 `notes` 混合字段，无法进入 `review` 独立展示；OPT-101 的 `reviewIsAi` 标记也因此无从区分。S 修复与 OPT-100 改动完全对称，`getRowField()` 模式已有，约 3 行。

**Complexity:** S — ① `app.js:4083`：headers 末尾加 `"读后感"`；② `app.js:4130-4136` 区附近加 `const review = String(getRowField(row, ["读后感", "review", "我的评论"])).trim()`；③ book 对象（`app.js:4139`）补 `review: review || ""`；共约 3 行，纯前端，零后端/DB 变更，复用已有 `getRowField()` 模式。

**Files:** `app.js:4083`（模板 headers）；`app.js:4130-4153`（`importExcel` 解析 + book 对象构建段）

**northstar:** 弱-中——Excel 批量导入是新用户书单初始化主通道；OPT-100 修 rating、本项修 review，合并后 Excel 路径与豆瓣 CSV（OPT-105）在数据完整度上对齐；S 级，与 OPT-100 对称改动，可合并一 PR。

---

### E181 — 跨页 OCR：E151（2026-07-04 候选登记）蓄水 8 天，2026-07-03 信号明确，正式提拔

> 此条为 E151（2026-07-04 蓄水池）的提拔记录；`runOcrFromImage()` 单图限制的完整发现见 E151。

**What (verified):** `app.js:4229-4280`（`runOcrFromImage()`）请求体：
```js
body: JSON.stringify({
  imageDataUrl: dataUrl,      // 单张图片 data URL
  imageUrl: savedImageUrl,    // 单张图片 URL
  filename: pendingQuoteImage?.name || "quote-image",
}),
```
前端 file input 为单选（无 `multiple`），后端 `/api/quotes/ocr` 端点解析单个 `imageDataUrl`（`app_server.py` OCR 路由），无多图合并逻辑。

**Why it matters:** 2026-07-03 signal（蓄水 8 天）：「一段摘抄有可能跨页……现在加摘抄只能拍一张，跨页的句子拍不全 → 希望能拍 2 张照片一起 OCR，拼成同一条摘抄」。竖排书、诗文、长段引用跨页高频出现；强制单张导致「摘抄不完整」或「手动拼接」，与北极星「拍照摘抄不假思索」直接冲突。Phase 1（前端串行调两次 OCR、按顺序拼接至同一文本框）可独立实现，不需后端结构变更。

**Complexity:** M — Phase 1：`<input multiple>`，前端顺序 OCR 两张图，结果拼接（`\n\n` 分隔）写入 textarea，约 30–40 行前端改动，后端无变更。Phase 2（Kimi multi-image API）可选扩展，需评估 `/api/quotes/ocr` 端点 payload 格式。quote 存储结构不变。

**Files:** `app.js`（addQuote file input + `runOcrFromImage` 调用逻辑）；`app_server.py`（`/api/quotes/ocr` 端点，Phase 2 可选扩展）

**northstar:** 中-高——Theme 1「采集顺滑」核心场景；信号明确、蓄水 8 天，正式提拔为 OPT-109。

---

> 本次 run（2026-07-12）新增四条方向：E178（时间线 haystack 缺 date 字段，S，搭车 PR #62）、E179（addSession retroactive startedAt 不更新，S，搭车 OPT-093）、E180（Excel 导入缺「读后感」列，S，与 OPT-100 对称）、E181（跨页 OCR，M，E151 蓄水 8 天正式提拔）。将 E181（E151 原候选）提拔为 OPT-109，E180 提拔为 OPT-110。E178/E179 作为候选登记，建议分别搭车 OPT-076 和 OPT-093。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-13

### E182 — `PromptBuilder.build_chat_prompt()` 的 `all_books_summary` 缺少 `rating` 和 `finishedAt`——AI 无法回答「评分最高的书」或「去年读完的书」类跨书查询 (S)

**What (verified):** `app_server.py:2432-2434`（`all_books_summary` 构建段）：
```python
"all_books_summary": [
    {"id": b.get("id"), "title": b.get("title"), "author": b.get("author", ""), "status": b.get("status", "")}
    for b in sorted(user_state.get("books", []), key=lambda b: b.get("updatedAt", ""), reverse=True)[:50]
],
```
`all_books_summary` 只含 4 个字段（id/title/author/status），不含 `rating`（OPT-099，2026-07-08 上线）和 `finishedAt`（OPT-074，2026-06 上线）。对比：focused `book` 对象（`app_server.py:2421`）注入全量字段，但只覆盖当前上下文书籍；`all_books_summary` 是 AI 跨书查询的唯一数据来源。

**Why it matters:** OPT-099 加了 1-5 星评分、OPT-074 加了读完日期，两者的核心价值在于「跨书回顾」——用户最可能对 AI 问的正是「帮我找评分最高的书」「去年我读了哪些书」「有没有适合分享的 5 星书」。这些问题直接依赖 `all_books_summary` 里的 `rating` 和 `finishedAt`，但两个字段当前均不在 payload 里，AI 只能凭书名猜测。S 级 2 行修复，token 开销极低（50 本 × ~15 字符 ≈ 750 tokens，远低于 OPT-020 节省的额度）。

**Complexity:** S — `app_server.py:2433`：dict 末尾追加 `"rating": b.get("rating", 0), "finishedAt": (b.get("finishedAt") or "")[:10]`（截 ISO 到 YYYY-MM-DD 节省 token）。无 schema/接口/测试变更。

**Files:** `app_server.py:2432-2434`（`all_books_summary` 构建段）

**northstar:** 中——Theme 2「回顾有价值」AI 查询层；OPT-099/074 两个已上线字段对 AI 跨书问答完全不可见，本修复使「最近读完」「评分最高」两类高频回顾询问可被 AI 正确处理。

---

### E183 — `compareBooksForList()` 二级排序用 `createdAt`——OPT-105 豆瓣导入后「已读完」组书籍排序语义错乱 (S)

**What (verified):** `app.js:1238-1246`（`compareBooksForList()`）：
```js
function compareBooksForList(a, b) {
  const statusDelta = (bookStatusOrder[a.status] ?? 99) - (bookStatusOrder[b.status] ?? 99);
  if (statusDelta !== 0) return statusDelta;
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
}
```
二级排序键为 `createdAt`（书籍入库时间）。批量导入路径（`importExcel()`，`app.js:4155`：`const now = new Date().toISOString(); ... createdAt: now`）——同一次导入的所有书籍 `createdAt` 相同，同一状态组内的相对顺序退化为原始数组顺序（CSV 行序），无语义。OPT-105 豆瓣导入（本周焦点）预期写入大量具有有效 `finishedAt` 的"已读完"书，若不切换二级排序键，"已读完"过滤视图内书籍将以随机顺序展示。

对于语义上更合理的二级键：`"finished"` 状态组 → `finishedAt` desc（最近读完的先出现）；`"reading"` 状态组 → `lastReadAt` desc（最近打开的先出现）；`"wishlist"` 状态组 → `createdAt` desc（保持现状）。

**Why it matters:** 「最近读完了哪些书」是「回顾」场景最基础的查询，Douban 导入后「已读完」列表有语义时间轴但显示为随机顺序，Theme 2 验收的「回顾操作次数」路径直接受损。S 修复：用 status-aware 三分支替换当前单一二级键，纯前端，无 HTML/后端/schema 变更。

**Complexity:** S — `app.js:1239-1245`：将 `return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)` 替换为 status-aware 三分支（`finished` → finishedAt，`reading` → lastReadAt，其余 → createdAt），约 5-8 行，无测试变更。

**Files:** `app.js:1238-1246`（`compareBooksForList`）；`app.js:4155`（importExcel `createdAt: now` 证明同批同时间戳）

**northstar:** 中——Theme 2「回顾有价值」的浏览层前提；OPT-105 Douban 导入后「按时序浏览已读完书单」是核心回顾场景，当前排序使该场景失效；S 级，建议搭车 OPT-105 PR 或紧随其后。

---

### E184 — 「已读完」书卡展示阅读进度（"100% · X/X 页"），不展示 `finishedAt`——OPT-074 字段仅在详情层可见 (S)

**What (verified):** `app.js:1296-1299`（`buildBookSearchCard` progressText 构建段）：
```js
const progressText =
  progress === null
    ? `已读到第 ${book.currentPage || 0} 页`
    : `${progress}% · ${book.currentPage || 0}/${book.totalPages} 页`;
```
`book.status === "finished"` 的书若有 `totalPages` 则显示"100% · X/X 页"（永远如此）；若无 `totalPages` 则显示"已读到第 X 页"（对已读完书完全无意义）。两种情况均不展示 `book.finishedAt`。

对比：书籍详情（`app.js:3423`）已展示 `读完 ${formatDate(book.finishedAt)}`；书卡是用户浏览书单时的唯一信息层，不打开详情就看不到读完日期。`formatDate` 已存在（`app.js` 全局），直接复用。

**Why it matters:** 「已读完」书卡的核心使用场景是浏览阅读史，「什么时候读的」是第一问，而非「读了多少页」（100% 无新增价值）。OPT-074 上线后书卡缺失读完日期，意味着浏览「已读完」列表时缺少时间维度，与 Theme 2「让阅读史可被回顾」直接冲突。OPT-105 Douban 导入将为大量书籍填入有效 `finishedAt`，此时修复收益最大。

**Complexity:** S — `app.js:1296-1299`：对 `book.status === "finished"` 分支单独输出 `` `读完 ${formatDate(book.finishedAt) || "日期未记录"}` ``（约 3-4 行）；`formatDate` 已存在，零新依赖。建议与 E183（compareBooksForList 排序）合并一 PR，共同构成「已读完」书单时序体验闭环。

**Files:** `app.js:1296-1299`（`buildBookSearchCard` progressText 段）；`app.js:3423`（书籍详情 finishedAt 展示参照）

**northstar:** 中——Theme 2「回顾有价值」直接命中；已读完书单是阅读史的核心视图，书卡缺少时间锚点使逐本回顾必须点开详情，摩擦大；S 修复，OPT-105 导入后 finishedAt 数量暴增时价值最大。

---

> 本次 run（2026-07-13）聚焦 OPT-105（豆瓣导入，本周焦点）合并后的「已读完」书单体验影响扫描，以及 E177/E178 的正式提拔。新发现 3 条：E182（PromptBuilder all_books_summary 缺 rating/finishedAt，S，AI 跨书回顾能力残缺）、E183（compareBooksForList 二级排序用 createdAt，批量导入后状态组排序语义错乱，S）、E184（已读完书卡不展示 finishedAt，OPT-074 字段未达卡面层，S）。将 E177（quoteLabel ocrText 回落缺失，2026-07-11 核实）提拔为 OPT-111；将 E178（时间线 haystack 缺 date 字段，2026-07-12 核实）提拔为 OPT-112。E174（书卡不展 rating）、E179（addSession startedAt 不溯更新）为已核实未提拔候选，建议分别与 OPT-100 和 OPT-093 搭车。所有本次新发现均基于实际代码读取，已标注 file:line。

## 2026-07-14

### E185 — `buildBookSearchCard()` 书卡从不展示 `book.rating`——OPT-099（1-5 星评分）上线后核心入口仍为零评分可见度 (S)

**What (verified):** `app.js:1303-1348`（`buildBookSearchCard()`）：书卡 body 仅含三行 `book-grid-meta`（记录次数 / 摘抄数 / 关联数，以及阅读进度行），无任何 rating 显示。对比 `app.js:3066`（`renderBookShareCard`）：`const rating = book.rating || 0`——分享卡已正确读取 rating 并渲染星级。OPT-099（PR #58，2026-07-08 合并）在编辑/新增对话框加入了 1-5 星输入，书籍详情页也已展示星级，但 `buildBookSearchCard()` 从未同步更新。

**Why it matters:** 书单卡片是用户最高频触达的信息层——搜书、翻书单、回顾时全经此层。评分字段的核心价值是「一眼识别优质书」，若卡面不显示星级，OPT-099 对浏览体验的贡献几乎为零；用户须点开详情才能看到评分，与「快速回顾」诉求背道而驰。S 修复可立即激活 OPT-099 在最高频入口的实际价值。

**Complexity:** S — `app.js:1303-1348`：仿照 `renderBookShareCard` 的星级渲染（`app.js:3066`），在 `book-grid-meta` 行追加 `${book.rating ? "★".repeat(book.rating) + "☆".repeat(5 - book.rating) : ""}` 或数字展示，约 2-3 行。无 HTML/后端/schema 改动。

**Files:** `app.js:1303-1348`（`buildBookSearchCard` 卡 body 段）；`app.js:3066`（`renderBookShareCard` rating 参照）

**northstar:** 中——OPT-099 已上线但最高频入口看不到评分，「快速识别优质书回顾」路径的 S 级补全；与 Theme 2「回顾有价值」直接对齐。

---

### E186 — `addSession()` 的 `startedAt` 赋值有 `!book.startedAt` 守卫——补录更早阅读记录时开始日期永远不会往前修正 (S)

**What (verified):** `app.js:2552`（`addSession()` 内 startedAt 更新段）：
```js
if (!book.startedAt && !(book.finishedAt && date > book.finishedAt)) book.startedAt = date;
```
`!book.startedAt` 守卫意味着一旦任意 session 写入了 `startedAt`，后续补录更早日期的 session 不会将 `startedAt` 更新到更早。例：用户已有 2026-03-01 开始记录，后补录 2026-01-15 的阅读（遗漏月份），`startedAt` 仍保持 2026-03-01，书卡显示的「开始阅读日期」偏晚约 6 周。对比：`finishedAt`（`app.js:2556`）已做"择大更新"（仅推迟读完日期），但 `startedAt` 无对应"择小更新"逻辑。

**Why it matters:** OPT-074 将 `startedAt` 带到了书卡展示层，日期偏差直接对用户可见；补录历史记录（豆瓣导入后的手工微调）是 OPT-105 完成后的典型操作；修正守卫约 1 行代码，可消除「显示开始日期比实际晚」的系统性偏差。S 修复，纯前端，无后端/schema 变更。

**Complexity:** S — `app.js:2552`：将 `if (!book.startedAt && ...)` 改为 `if (!book.startedAt || (date < book.startedAt && !(book.finishedAt && date > book.finishedAt)))`（择小更新，约 1 行）。建议搭车 OPT-093（`deleteSession()` 回写 currentPage）在同区域改动。

**Files:** `app.js:2552`（`addSession` startedAt 赋值处）；对比 `app.js:2556`（finishedAt 择大更新参照）

**northstar:** 弱-中——OPT-074 将 `startedAt` 展示在书卡上，日期偏差在补录历史场景下直接对用户可见；1 行修复，豆瓣导入（OPT-105）后用户补录微调频率将提升。

---

### E187 — `deleteConnection()` 确认弹窗无永久性提示，关联中的「想法/insight」内容无声消失 (S)

**What (verified):** `app.js:4904-4918`（`deleteConnection()` 函数体）：
```js
showConfirmDialog({
  message: "确定删除这条关联记录吗？",
  onConfirm: async () => { ... }
});
```
`message` 只有一行通用提示，无任何关于「关联中存储的 thought 内容将永久删除」的说明，也不展示被删关联的 thought 文本预览。关联数据结构含 `connection.thought`（用户手写想法）字段。OPT-106（triaged）已覆盖 `deleteQuote()` 的级联透明度，但 `deleteConnection()` 本身的 thought 内容消失未被警示。

**Why it matters:** 关联的「想法」字段是用户在两条摘抄之间主动写下的意义碰撞——比摘抄本身更高密度的思考输出，删除代价最高。当前确认框语义过浅，用户在快速操作时难以意识到 thought 内容同时永久消失。S 修复（约 3-4 行）完成 OPT-050/OPT-062/OPT-106「破坏性操作透明度」系列在 `deleteConnection()` 侧的对称覆盖。

**Complexity:** S — `app.js:4904`：在 `showConfirmDialog` 调用前读取 `const conn = state.connections.find(c => c.id === connId)`；若 `conn.thought` 非空，将 message 改为 `` `确定删除这条关联记录吗？${conn.thought ? "（关联中的「想法」内容将同时删除）" : ""}` ``；约 3-4 行，零 API/schema 变更。

**Files:** `app.js:4904-4918`（`deleteConnection` showConfirmDialog 调用处）；参照 `app.js:3193-3199`（`deleteQuote` OPT-106 透明度模式）

**northstar:** 中——Theme 2 核心数据保护；thought 字段是最高密度用户输出，删除透明度直接影响数据完整性；与 OPT-050/062/106 透明度系列对称，S 级修复。

---

> 本次 run（2026-07-14）扫描 OPT-099（rating 字段）和 OPT-074（startedAt/finishedAt）的前端覆盖完整度，以及破坏性操作透明度系列的未覆盖路径。新发现 3 条：E185（书卡不展 rating，OPT-099 上线后最高频入口仍为零评分可见度，S）、E186（addSession startedAt 不溯更新，补录历史场景偏差系统性存在，S）、E187（deleteConnection 确认弹窗无 thought 内容提示，透明度系列缺口，S）。将昨日 run（2026-07-13）发现的 E182（all_books_summary 缺 rating/finishedAt）提拔为 OPT-113，E183（compareBooksForList 二级排序语义错乱）提拔为 OPT-114。E184（已读完书卡不展示 finishedAt）列为候选，建议搭车 OPT-114 合并为「已读完书单时序体验」PR。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-15

> 扫描焦点：OPT-105（豆瓣导入，今日落地）的数据下游覆盖完整度——新字段 `doubanComment` 是否在搜索、AI 摘要、导入反馈三个消费层均已接入。

### E188 — `matchBooks()` 过滤器不含 `book.doubanComment`——OPT-105 导入的 110 条豆瓣短评数据不可搜索 (S)

**What (verified):** `app.js:1239-1247`（`matchBooks()` 函数体）：
```js
function matchBooks(query) {
  return state.books.filter(
    (book) =>
      fuzzyMatch(book.title, query) ||
      fuzzyMatch(book.author || "", query) ||
      (book.tags || []).some((t) => fuzzyMatch(t, query)) ||
      fuzzyMatch(book.notes || "", query) ||
      fuzzyMatch(book.review || "", query)
      // 无 doubanComment 分支
  );
}
```
`doubanComment` 字段由 OPT-105（今日落地，commit b978f9f）的 `importDoubanCsv()` 写入（`app.js:4359`：`const doubanComment = get(r, iComment)`）；书卡分享（`app.js:3055`）和书籍详情（`app.js:3532`）均可读取该字段；但 `matchBooks()` 的五个 `fuzzyMatch` 分支没有 `doubanComment`，豆瓣短评内容无法被书单搜索或 `globalSearch()` 命中。

**Why it matters:** OPT-105 的核心价值是「为 110 本书一次性补齐豆瓣阅读数据」，其中豆瓣短评是高信息密度的主观内容（读后感关键词、作品特征标签）；用户按书中印象词搜索「治愈感」「看完想哭」时，这批内容完全不参与匹配。S 修复：在 `matchBooks()` 末尾追加 `|| fuzzyMatch(book.doubanComment || "", query)`，1 行，无 API/schema 变更，与 `review` 字段处理模式完全对称。

**Complexity:** S — `app.js:1246`（`fuzzyMatch(book.review || "", query)` 行之后）追加 1 行；同时 `saveBookEdit()` 的书籍搜索入口 `globalSearch()`（`app.js:4175`）通过调用 `matchBooks()` 自动获得覆盖，无需额外修改。Touch: `app.js:1239-1247`（matchBooks 过滤器）。

**Files:** `app.js:1239-1247`（matchBooks）；参照 `app.js:4359`（importDoubanCsv 写入 doubanComment）

**northstar:** 中——Theme 2「回顾有价值→能找到」；OPT-105 今日落地，豆瓣短评内容已在数据层，但搜索路径不通，最直接的后续 1 行修复；提拔为 OPT-116。

---

### E189 — `importDoubanCsv()` 用 `showToast()` 而非 `showImportResult()` 反馈结果——110 本书导入后 2 秒内反馈消失 (S)

**What (verified):** `app.js:4381-4384`（`importDoubanCsv()` 结尾）：
```js
showToast(`豆瓣导入完成：回填 ${updated} 本、新增 ${created} 本`);
```
对比 JSON 导入（`app.js:3839`）和 Excel 导入（`app.js:4226`）均调用 `showImportResult(result)`——后者是持久化 modal，显示书籍/摘抄/记录/关联四行分类统计，用户须主动关闭。豆瓣 CSV 导入使用 `showToast()`（约 2 秒自动消失），110 本书批量回填的结果在用户来不及阅读时即消失，无任何 breakdown（回填 N 本 vs 新增 N 本两类外无更多明细）。

**Why it matters:** 批量操作的结果透明度是 OPT-040/041 系列已建立的惯例（避免用户误导入后不知发生了什么）；豆瓣导入规模（110 本）远大于典型单次 Excel 导入，反馈持久度不及 Excel 路径，体验倒置。S 修复：替换为 `showImportResult()` 调用（或保持 toast 但加一行书名预览的模态辅助），约 3-5 行；需注意 `showImportResult()` 接收 `{ books, quotes, sessions, connections }` 结构，豆瓣导入只有 books，其余传 `0`。

**Complexity:** S — `app.js:4381-4384`（importDoubanCsv 结尾段）；`showImportResult()` 定义在 `app.js:858`；调用约 1 行，数据结构填充约 2-3 行。Touch: `app.js:4381-4384`（showToast 替换点）。

**Files:** `app.js:4381-4384`（importDoubanCsv 反馈段）；参照 `app.js:858`（showImportResult 定义）、`app.js:4226`（Excel 导入 showImportResult 调用参照）

**northstar:** 弱-中——导入透明度，OPT-040/041 延伸；批量操作规模越大透明度越重要，豆瓣导入是最大批次场景（110 本）却是反馈最弱的路径。

---

### E190 — `all_books_summary` 同行修复（OPT-113 搭车点）：`doubanComment` 亦不在 AI 跨书上下文中 (S)

**What (verified):** `app_server.py:2432-2434`（`PromptBuilder.build_chat_prompt()` 的 `all_books_summary` 段，OPT-113 的目标修复点）：
```python
"all_books_summary": [
    {"id": b.get("id"), "title": b.get("title"), "author": b.get("author", ""), "status": b.get("status", "")}
    for b in sorted(user_state.get("books", []), key=lambda b: b.get("updatedAt", ""), reverse=True)[:50]
],
```
OPT-113（triaged，Next up，将在下一个 PR 修复）将在此处追加 `"rating"` 和 `"finishedAt"`；但 `"doubanComment"` 同样缺席——OPT-105 今日导入的豆瓣短评（用户对每本书的主观读后印象）对 AI 完全不可见，「帮我找讲成长故事的书」「哪本书让我觉得值得二刷」等查询无法利用这批数据。

**Why it matters:** `all_books_summary` 是 AI 跨书查询的唯一数据窗口；OPT-113 本次将改这一行的 dict，最自然的时机是同步追加 `doubanComment`（字段已在今日 OPT-105 写入数据库），否则 OPT-113 合并后仍需另开 PR 补这一个字段，产生不必要的碎片 PR。截断 60 字符以控制 token 增量（50 本 × 60 字符 ≈ 3000 chars，相对 OPT-113 的 rating/finishedAt 增量极小）。

**Complexity:** S — `app_server.py:2433`（OPT-113 改动点）：追加 `"doubanComment": (b.get("doubanComment") or "")[:60]`，1 行，建议搭车 OPT-113 PR 同时落地。Touch: `app_server.py:2432-2434`（all_books_summary 构建段）。

**Files:** `app_server.py:2432-2434`（all_books_summary 构建段）；参照 `app.js:4359`（importDoubanCsv 写入 doubanComment）

**northstar:** 弱-中——OPT-113 搭车点；doubanComment 是今日 OPT-105 为 110 本书批量写入的高密度语义字段，AI 不可见即浪费了这批数据对「AI 帮你找书」场景的价值；单独 PR 代价不合算，搭车 OPT-113 代价趋近于零。

---

> 本次 run（2026-07-15）扫描焦点为 OPT-105（豆瓣导入，今日 W29 焦点落地）的数据下游覆盖完整度。新发现 3 条：E188（matchBooks 不含 doubanComment，S，northstar 中，直接 1 行修复）、E189（importDoubanCsv 反馈 showToast 而非 showImportResult，S，northstar 弱-中，透明度倒置）、E190（all_books_summary 缺 doubanComment，S，northstar 弱-中，OPT-113 搭车点）。将昨日 run（2026-07-14）发现的 E185（buildBookSearchCard 不展示 rating）提拔为 OPT-115，今日发现的 E188（matchBooks 缺 doubanComment）提拔为 OPT-116。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-16

> 扫描焦点：OPT-105（豆瓣导入，已落地）后的 UI 数据曝光缺口——110 本书的新字段（`finishedAt`、`doubanComment`）在最高频视图层的可见度；以及 2026-07-16 信号（owner 几乎不用「记录」页面）对应的隐性时序数据机会。E186、E187 为本次新验证（上次 run 探索发现但未写入 explore.md），E190 上次已记录但未提拔，E191、E192、E193 为今日新发现。

---

### E191 — `buildBookSearchCard()` 对「已读完」书籍展示进度文字而非 `finishedAt` 日期，OPT-105 导入的 110 个读完日期在最高频浏览入口完全不可见 (S)

**What (verified):** `app.js:1324-1358`（`buildBookSearchCard()` 函数体）：
```js
// app.js:1341-1354
const progressText =
  book.totalPages && book.currentPage
    ? `${Math.round((book.currentPage / book.totalPages) * 100)}%·${book.currentPage}/${book.totalPages}页`
    : book.currentPage
    ? `已读到第${book.currentPage}页`
    : "";
```
`progressText` 对所有书籍状态使用同一分支，「已读完」书籍展示「已读到第X页」或「X%·X/Y页」——读完后的页数进度毫无意义，而 `book.finishedAt`（OPT-105 为 110 本书批量写入、OPT-074 手动录入逻辑上线）从不出现在卡面。书籍详情弹窗（`app.js:3532`）和书卡分享图（`app.js:3023`）均已读取 `finishedAt`，书单卡面（打开 App 的第一视角）是唯一遗漏入口。

**Why it matters:** 「已读完」状态下用户关心的是「我什么时候读完的」而非「已读到哪页」；OPT-105 落地后 110 本书有真实读完日期，OPT-074 上线后手动录入日期也可靠，但书单主视图完全看不到这些数据。「回顾有价值」的核心前提是让时序信息触手可及，书单卡面是用户每次打开 App 的第一视角，时序缺口直接削弱 Theme 2 体验。S 修复：在 `book.status === "finished"` 时将 `progressText` 替换为 `finishedAt` 短日期（`YYYY-MM-DD`），约 3-4 行 JS，0 行 CSS 变更，无 API/schema 变更。

**Complexity:** S — `app.js:1341-1356`（progressText 构建段）：在 progressText 赋值前加 `if (book.status === "finished" && book.finishedAt) return \`读完 ${book.finishedAt.slice(0, 10)}\``（可复用 `formatDate()` 若有），替换进度文字分支。Touch: `app.js:1341-1356`（progressText 构建），无 CSS/API/schema 变更。

**Files:** `app.js:1324-1358`（buildBookSearchCard）；参照 `app.js:3023`（书卡分享已读取 finishedAt）、`app.js:3532`（书籍详情已读取 finishedAt）

**northstar:** 中-高——Theme 2「回顾有价值」浏览入口层。OPT-115（rating 徽章，triaged）激活了评分字段；本项使 finishedAt 在同一卡面可见，两项组合后「已读完」书卡完整传达「何时读完、满意度如何」，形成可扫描的时序回顾层；S 修复，与 OPT-115 天然合并为一 PR。→ **提拔 OPT-119**

---

### E186 — `addSession()` 仅在 `!book.startedAt` 时设置开始日期，早于现有日期的补录无法追溯更新 `startedAt` (S)

**What (verified):** `app.js:2564`（`addSession()` 新建路径）：
```js
if (!book.startedAt && !(book.finishedAt && date > book.finishedAt))
  book.startedAt = date;
```
`!book.startedAt` 守卫意味着：一旦 `startedAt` 已有值，无论新补录的 session 日期是否更早，都不更新。编辑路径（`app.js:2533-2550`）更新 `currentPage, lastReadAt, updatedAt, status, finishedAt`，完全不含 `startedAt`。OPT-105（豆瓣导入）写入 `finishedAt` 后，owner 可能在书架上反向补录「最初什么时候开始读这本书」的阅读记录——此时 `startedAt` 要么是豆瓣导入时自动推算的晚于实际日期，要么根本没有值，而新补录的更早日期无法纠正它。

**Why it matters:** 2026-07-16 信号显示 owner 几乎不显式使用「记录」页，但 OPT-105 批量填完 finishedAt 后，重建「从什么时候开始读」的时序是下一个自然冲动；若补录反向不生效，owner 修完后看到开始日期仍错，时序数据可信度下降。S 修复：将新建路径守卫从 `!book.startedAt` 改为 `!book.startedAt || (date < book.startedAt && ...)`，保留 finishedAt 矛盾守卫；编辑路径补充同一 `if` 逻辑。约 2-3 行。

**Complexity:** S — `app.js:2564`（新建路径 startedAt 赋值行）：改为 `if ((!book.startedAt || date < book.startedAt) && !(book.finishedAt && date > book.finishedAt))`；`app.js:2550`（编辑路径结尾）：补一行相同的 startedAt 最早日期收敛逻辑。Touch: `app.js:2550`、`app.js:2564`。

**Files:** `app.js:2533-2550`（addSession 编辑路径）；`app.js:2564`（addSession 新建路径 startedAt 赋值）

**northstar:** 中——Theme 2「回顾有价值」时序数据可信度；owner 2026-06-26 已明确「希望有开始/读完日期字段」，补录机制若有偏差则 OPT-105 后的时序回顾可信度打折。S 修复，无 UI/API/schema 变更。

---

### E187 — `deleteConnection()` 确认弹窗不提示 `connection.thought` 字段将永久删除，用户手写关联感悟无声消失 (S)

**What (verified):** `app.js:5040-5054`（`deleteConnection()` 函数体）：
```js
showConfirmDialog({
  message: "确定删除这条关联记录吗？",
  onConfirm: async () => { /* 直接 filter 删除 */ }
});
```
`connection.thought`（用户在「建立关联」时手写的「为什么建立这条关联/读到了什么」）是 connections 数据中信息密度最高的字段，也是纯用户创作内容（不可 AI 重新生成），但确认弹窗只问「确定删除这条关联记录吗？」，不提示 thought 内容即将消失。对比 `deleteQuote()`（OPT-106，PR #68，已上线）：若摘抄参与了关联，弹窗追加「（同时删除 N 条关联）」警告；`deleteConnection()` 方向相反——即使 thought 有内容，弹窗也完全不显示。

**Why it matters:** `connection.thought` 是 Theme 2「建立关联」工作流中用户主动产出的最高密度内容（比摘抄文本更个人化），无声删除等于永久抹去用户的思考记录；与 OPT-043（导入过载守卫）、OPT-106（deleteQuote 级联透明度）已建立的「破坏性操作透明度」系列完全对称。S 修复：在 `showConfirmDialog` 前读 `conn.thought`，若非空则 message 追加「（关联感悟将一并删除）」或预览前 20 字。

**Complexity:** S — `app.js:5040`：在 `showConfirmDialog` 前加 `const thought = (conn.thought || "").trim()`；message 改为 `` `确定删除这条关联记录吗？${thought ? `（关联感悟将一并删除）` : ""}` ``。约 3 行，0 API/schema 变更。Touch: `app.js:5040-5054`（deleteConnection showConfirmDialog 调用段）。

**Files:** `app.js:5040-5054`（deleteConnection）；参照 `app.js:3193-3209`（deleteQuote OPT-106 同类改动参照）

**northstar:** 中——Theme 2「建立关联」数据可靠性；关联感悟是用户二次思考的结晶，是 Theme 2 核心产出，S 修复且有 OPT-106 既有代码模式可直接复用。

---

### E192 — 2026-07-16 信号：owner 几乎不显式新增「记录」，quote 的 `createdAt` 时间戳可作为隐式阅读时序数据替代记录页面 (M)

**What:** 2026-07-16 信号（signals.md 末行）：owner 很少显式新增「记录」，记录页面几乎不用，方向倾向「以摘抄流作为阅读足迹的唯一载体」。验证当前 quote 数据结构：每条摘抄有 `createdAt`（ISO 时间戳，`app_server.py:sanitize_state()`），`book.id` 可关联到书籍；`renderTimeline()`（`app.js:1515`）目前只消费 `sessions` 数组，完全不使用 quotes 数据。

**Why it matters:** 如果 owner 长期以摘抄代替显式记录，则「动态」Tab 的时序数据将永远是空的（零 sessions），而摘抄流（28 条/周）实际上已经隐式记录了「哪天在读哪本书」——把 quotes 的 createdAt 投影到动态时间轴，owner 在不做任何额外操作的情况下就能获得一条完整的阅读时序足迹。这与 2026-06-26 信号「自动或一键标记读完日期」和 roadmap 「records replaced by implicit quote stream」方向完全一致。

**Complexity:** M — 需新增「按书+日期聚合 quotes 推算阅读时段」逻辑，以 `{date, bookId, quoteCount}` 形态合并进 `renderTimeline()`；统计层不复杂，主要工作在 UI 层如何区分「显式记录」与「隐式摘抄日」的视觉表达（避免重叠/混淆）。需产品侧决策：是否合并显示，或提供开关。

**Files:** `app.js:1515`（renderTimeline haystack）；`app.js:1595-1617`（renderTimeline stats bar）；`app_server.py:sanitize_state()`（quotes 的 createdAt 来源）

**northstar:** 高——2026-07-16 信号直接对应，owner 明确倾向「以摘抄流替代手动记录」；本方向若落地，可将「动态」Tab 的有效数据密度从当前（几乎空）提升为 quotes 流密度（28条/周），是 Theme 2「回顾有价值」核心入口的实质性重构。M 复杂度，需产品决策后才宜实现，先记录为方向。

---

> 本次 run（2026-07-16）扫描焦点：OPT-105 后新字段在 UI 可见度的残余缺口 + 2026-07-16 信号（owner 不用「记录」页）对应的时序数据机会。新发现 4 条：E191（buildBookSearchCard 已读完不显 finishedAt，S，northstar 中-高，直接 3 行修复）、E186（addSession startedAt 追溯守卫缺失，S，northstar 中，补录语义正确性）、E187（deleteConnection thought 无声删除，S，northstar 中，OPT-106 对称延伸）、E192（quote createdAt 作为隐式阅读时序，M，northstar 高，需产品决策）。E190（all_books_summary 缺 doubanComment）上次已记录，今日提拔为 OPT-118；E191 今日提拔为 OPT-119。所有 S 级断言均基于实际代码读取，已标注 file:line。

## 2026-07-17

### E193 — `runShelfOcr()` 在 20 秒等待期间无加载状态：触发按钮不禁用、无 spinner，仅靠 2 秒 toast 提示 (S)

**What:** `app.js:4556` 调用 `showToast("正在识别书架，约需 20 秒…")`，toast 2 秒后消失；随后 `await apiFetch(...)` 在 `app.js:4559` 发起请求、等待最长 20 秒，但这段时间内触发控件（`index.html:329` 的 `<label>` 包裹 `<input type="file" id="shelfOcrInput">`）没有任何禁用逻辑，也没有激活 spinner 或全局加载遮罩。若用户在等待期间误触「拍照/选图」按钮，将并发发起第二次 shelf OCR 请求（`runShelfOcr()` 里无并发守卫）。对比 `runOcr()`（`app.js:4488`）在 try 块内激活 `ocrSpinner`、finally 里关闭，`runShelfOcr()` 缺乏对称的 try/finally 加载态。

**Why it matters:** OPT-118/PR #73 刚把「书架识别」作为核心新功能上线，且真机测试已证实一次识别要跑 16–20 秒（OPT-120 排查记录）。20 秒空白等待期没有视觉反馈，用户不知道是否还在运行、是否可以离开；加上按钮不禁用，误触重拍是真实风险。与 `runOcr()` 的加载态模式对称修复即可。

**Complexity:** S — 在 `runShelfOcr()` 函数体加 `try { disableBtn / showSpinner } finally { enableBtn / hideSpinner }`，参照 `runOcr()` 已有模式（`app.js:4488-4540`）。需确认 `<label>` 触发器的禁用路径（`<label>` 本身不支持 `disabled`，需改为 `pointer-events:none` 或额外守卫变量）；约 8–10 行修改。

**Files:** `app.js:4553-4598`（runShelfOcr）；`app.js:4488-4540`（runOcr，参照模式）；`index.html:329`（触发按钮）

**northstar:** 中——Theme 1「采集顺滑」。OPT-118 新增的书架识别是 PR #73 重点功能，20 秒等待无反馈是上线后的明显体验漏洞；S 修复，已有 `runOcr()` 的对称代码模式可直接复用。

---

### E194 — `PromptBuilder.all_books_summary` 包含 `doubanComment` 但不含 `book.review`；用户手写读后感对跨书 AI 查询不可见 (S)

**What:** `app_server.py:2607-2612`，`all_books_summary` 生成的每本书 dict 字段为 `id, title, author, status, rating, finishedAt, doubanComment`，其中 `doubanComment`（豆瓣评论）已在 OPT-118 中补入，但 `review`（用户自己写的读后感，2026-07-06 新增字段）缺席。单本书上下文（`app_server.py:2592` 直传完整 `book` 对象）没有此问题；缺口仅在跨书摘要路径。

**Why it matters:** 用户通过「AI 根据笔记整理」生成或手写 `review` 字段后，询问 AI「帮我回顾一下最近读了哪些书，有什么感受」或「推荐给朋友一本」之类跨书问题时，AI 看不到这些读后感，无法引用用户自己的评价，只能回退到书名/作者层面泛泛而谈。OPT-105 豆瓣导入后 `doubanComment` 已补入 `all_books_summary`，`review` 应同步补齐，否则「用户自己写的」反而比「豆瓣上别人写的」更不可见。

**Complexity:** S — `app_server.py:2611` 在 `all_books_summary` dict 追加一行 `"review": (b.get("review") or "")[:60]`（60 字截断保持 token 节约，与 `doubanComment` 截断长度对齐）。零 schema/API/前端变更。

**Files:** `app_server.py:2607-2612`（all_books_summary dict）

**northstar:** 中——Theme 2「回顾有价值」AI 查询层。S 单行修复，直接提升跨书回顾类问题的 AI 答复质量；`review` 字段是 2026-07-06 新增功能，此缺口是同批上线的遗漏，修复优先级高。

---

### E195 — `deleteBook()` 确认对话框只显示书名 + 通用警告文字；三类关联数据（N 次记录、M 条摘抄、K 条关联）的具体数量不展示，但辅助函数已全部就位 (S)

**What:** `app.js:2714`：`els.deleteBookMessage.textContent = book.title;`——对话框消息仅设为书名。`index.html:636`：`<p class="delete-confirm-warning">⚠️ 同时删除该书的所有阅读记录、摘抄和探讨历史，无法恢复。</p>`——静态通用文字，不含数量。`deleteBook()` 在 `app.js:2740-2742` 同时级联删除 sessions、quotes 及涉及该书 quotes 的 connections。三个辅助函数已存在且低开销：`getBookSessions(bookId).length`（`app.js:930`）、`getQuoteCount(bookId)`（`app.js:946`）、`getConnectionCount(bookId)`（`app.js:950`）。

**Why it matters:** 删书是最高破坏性操作（无法撤销，级联删三类数据），但警告是最模糊的——用户在点确认前不知道「到底会消失多少东西」。OPT-043（导入零内容守卫）、OPT-106（deleteQuote 级联透明度）已建立「破坏性操作前显示具体影响数量」的设计原则，`deleteBook()` 是同系列的最大缺口：一本有 30 条摘抄和 10 条关联的书，用户不知道确认按钮会炸掉多少内容。

**Complexity:** S — 在 `app.js:2714` 之后读三个 count，拼进 `els.deleteBookMessage` 或修改 `.delete-confirm-warning` 的 textContent；例：「同时删除 5 次阅读记录、12 条摘抄、3 条关联，无法恢复。」约 6–8 行，0 API/schema 变更。

**Files:** `app.js:2708-2715`（deleteBook 消息设置）；`index.html:636`（静态警告文字）；`app.js:930,946,950`（getBookSessions/getQuoteCount/getConnectionCount）

**northstar:** 中——OPT-043/106「破坏性操作透明度」系列补全，S 修复且所有数据函数已就位；用户在删除高价值书目（如已有大量摘抄的书）时能看到具体损失，避免误操作。

---

> 本次 run（2026-07-17）扫描焦点：OPT-118 书架识别新上线后的体验漏洞 + OPT-105/豆瓣字段在 AI 上下文的完整性残余缺口 + 破坏性操作透明度系列补全。新发现 3 条：E193（runShelfOcr 无加载态，S，northstar 中，runOcr 对称修复）、E194（all_books_summary 缺 review 字段，S，northstar 中，1 行补全）、E195（deleteBook 对话框无具体数量，S，northstar 中，辅助函数已就位）。OPT-121 提拔 E194（1 行修复，直接影响 AI 回顾质量）；OPT-122 提拔 E186（addSession startedAt 追溯守卫，2026-07-16 遗留未促）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-18

### E196 — `deleteSession()` 删除记录后不重算 `book.currentPage`；下次新增记录的起始页自动填充将显示过期值 (S)

**What:** `app.js:3480-3495`，`deleteSession()` 仅执行 `state.sessions = state.sessions.filter((item) => item.id !== sessionId)` 然后同步，整个函数体没有任何 `book.currentPage` 重算逻辑。与此形成对照的是，`addSession()`（`app.js:2671, 2688`）每次保存都用 `book.currentPage = Math.max(book.currentPage || 0, endPage)` 把最高到达页推高。删除操作只能让 sessions 缩短，但 `book.currentPage` 不会随之回退。

`openNewSessionForBook()`（`app.js:3421`）用 `book?.currentPage > 0 ? book.currentPage + 1 : ""` 自动填充新记录的「起始页」。场景：用户误加了一条 endPage=200 的记录 → 立即删除 → 下次打开新记录表单，起始页自动填充 201（已过期）。如果该书实际当前进度是 120 页，用户必须手动清空并重填。

**Why it matters:** 「新增记录」是 Theme 1「采集顺滑」的核心路径；自动填充「上次读到哪一页」是降低手动输入摩擦的关键 UX。但只要用户曾经删除过任意一条记录（误操作、重复录入均有可能），这个自动填充就会变成噪声而非助力。修复方案：删除后从剩余 sessions 中重算 `book.currentPage = Math.max(0, ...remainingSessions.filter(s => s.bookId === deletedSession.bookId).map(s => s.endPage))`，约 4-6 行，无 API/schema 变更。

**Complexity:** S

**Files:** `app.js:3480-3495`（deleteSession）；`app.js:3421`（openNewSessionForBook startPage 自动填充）；`app.js:2671,2688`（addSession 的 currentPage 推高逻辑，修复时的对称参照）

**northstar:** 中——Theme 1「采集顺滑」。`openNewSessionForBook()` 的起始页自动填充是减少采集摩擦的具体实现；删除记录后填充失效直接增加「打开新记录 → 看到错误值 → 手动清空重填」的操作步骤；S 修复。

---

### E197 — `_run_gc()` 不包含 `model_logs`、`agent_traces`、`agent_actions`、`agent_trace_events`、`agent_metrics` 五张观测表；SQLite 将无限增长 (S)

**What:** `app_server.py:5986-6004`，`_run_gc()` 每 6 小时调用四个辅助函数：`gc_expired_sessions`、`gc_expired_password_reset_tokens`、`gc_old_server_errors`、`gc_old_rate_limit_rows`。`app_server.py:456-523` 定义的五张观测表均不在 GC 范围内——且对应的 GC 函数根本不存在（grep `def gc_old_model|def gc_.*trace|def gc_agent` 零结果）。这五张表的行仅在用户彻底注销账号时才被批量删除（`app_server.py:5906, 5949-5952`）。

增长估算：`model_logs` 每行存储完整 `prompt TEXT / input TEXT / output TEXT`（三个全文 LLM blob），每次 AI 对话写入 1 行；日常 3-5 次对话 × 约 3-10 KB/行 ≈ 5-15 MB/月、60-180 MB/年（不含 agent 流量）。`agent_trace_events` 每个 trace 写入多行事件；`agent_metrics` 每个 trace 写入多行指标——两者增长与对话量同步叠加。SQLite 单文件存储在个人服务器上，无外部存储扩展，DB 文件无限膨胀。

**Why it matters:** 这是个人常驻服务器的典型长尾问题：短期不可见，1-2 年后 SQLite 文件可能膨胀到数百 MB，影响备份/恢复速度，且`/debug/logs`（全量 model_logs 渲染）会随行数增加而越来越卡。E11（OPT-010，PR#13）修复了「4 个 GC 函数已定义但从未调用」，但 model_logs/agent 观测表从未有对应 GC 函数，是该修复遗漏的 N+1 张表。S 修复：2-3 个 GC 函数 + `_run_gc()` 里的两行调用。

**Complexity:** S

**Files:** `app_server.py:5986-6004`（`_run_gc()`，添加两行调用）；`app_server.py:2201-2227`（已有 GC 函数，新函数仿照 `gc_old_server_errors` 结构实现）；`app_server.py:456-523`（目标表 schema，含 `created_at` 字段可用作 GC 基准）

**northstar:** 中——基础设施可靠性。`model_logs`/`agent_traces` 是 Theme 2 回顾质量的观测基础（`/debug/logs` 是唯一的 AI 交互追溯入口）；表无限增长会逐步拖慢这个入口，并在某一天造成意外的磁盘压力。S 修复，保持个人服务器长期运行健康。

---

### E198 — 「记录」Tab 低参与度信号已明确（2026-07-16），手动录入 5 字段是阻力最高的采集路径；自动从 currentPage 变化推算 session 可大幅降低门槛 (M)

**What:** `optimization/signals.md` 2026-07-16 记录："owner 很少显式新增「记录」,记录页面几乎不用 → 要么自动推算阅读时间段与页数，要么砍掉记录页面"。`index.html:787`，「记录」占据底部导航 6 个 Tab 之一，与「摘抄」/「聊天」并列——但参与度显著落后。`app.js:2627`，`addSession()` 要求手动填写 startPage/endPage/minutes/date/note 五个字段；`app.js:2590`，`saveBook()` 的书籍编辑对话框已有 `currentPage` 字段，用户每次手动更新读到哪页时，这个 delta（endPage = 新 currentPage，startPage = 旧 currentPage）完全可以自动生成一条 session stub。

**Why it matters:** 「记录」的核心价值在「回顾节奏」，但手动录 5 个字段的成本远高于普通书籍进度更新（只需改一个数字）；实际使用中用户选择跳过「记录」而直接在书卡更新 currentPage。存在两条可行的降摩擦路径：
- 路径 A（M）：`saveBook()` 检测到 `currentPage` 变化时，弹一个轻量的确认气泡（「刚才读到第 X 页，顺手记录一下？」），预填 endPage=新currentPage、startPage=旧currentPage，只需用户填 minutes 并确认。
- 路径 B（S）：把「记录」从底部主导航下沉为书卡详情内的二级入口，腾出底部 Tab 给更高频操作，不改录入流程但降低视觉权重与误点率。

**Complexity:** M（路径 A）/ S（路径 B）

**Files:** `app.js:2585-2625`（saveBook，添加 currentPage delta 检测 + 轻量提示）；`index.html:787`（路径 B：底部 Tab 调整）；`app.js:3414-3431`（openNewSessionForBook，预填逻辑可复用）

**northstar:** 高——直接对应「每周阅读记录新增数」北极星指标（roadmap §2）。2026-07-12 north star 显示该数字处于低位；路径 A 将录入摩擦从「5 字段主动填写」降至「1 字段（minutes）确认」，预期能把有效 session 录入率从几乎为零拉升到与 currentPage 更新同频。

---

> 本次 run（2026-07-18）扫描焦点：session 采集路径完整性（从 E198 signals 信号出发）+ 删除操作的状态一致性 + 后端 SQLite 长期健康。新发现 3 条：E196（deleteSession 不重算 book.currentPage，S，northstar 中，addSession 对称修复）、E197（observability 表无 GC，S，northstar 中，2-3 个新 GC 函数）、E198（记录 Tab 低参与度 / currentPage delta 自动推算，M，northstar 高，saveBook + openNewSessionForBook）。OPT-123 提拔 E196（S 级直接 bug，修复自动填充一致性）；OPT-124 提拔 E197（S 级基础设施，防 DB 无限膨胀）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-19

### E199 — `deleteBook()` 确认对话框仅展示书名，不显示关联数据量；用户不知道将同时删去多少条记录与摘抄 (S)

**What:** `app.js:2723-2730`，`deleteBook()` 构造确认对话框时只设置 `els.deleteBookMessage.textContent = book.title`，无任何级联数量说明。`getBookSessions(bookId)`（`app.js:930`）、`getQuoteCount(bookId)`（`app.js:946`）、`getConnectionCount(bookId)`（`app.js:950`）三个辅助函数已存在且可直接调用，返回记录数/摘抄数/关联数。

**Why it matters:** 删书是不可逆操作，同时会从 `state.sessions`、`state.quotes` 中清理所有关联行（`app.js:2736-2743`）。如果用户书单很大或存在大量历史摘抄，误删一本的代价极高，但现有弹窗给不出任何数量提示——用户只看到书名，无法在删前评估。OPT-043（删书确认）和 OPT-106（删记录透明度）已奠定了「破坏性操作显示影响范围」的产品语义，本条是该系列的自然延伸，3 个辅助函数均已就位，约 2-3 行 template literal 变更。

**Complexity:** S

**Files:** `app.js:2723-2730`（deleteBook 确认消息构造）；`app.js:930, 946, 950`（getBookSessions / getQuoteCount / getConnectionCount，可直接调用）

**northstar:** 中——破坏性操作透明度（OPT-043/106 系列延续）；删书是低频但高风险操作，显示级联数量能防止误删摘抄数据，间接保护「新增摘抄」北极星的历史积累。

---

### E200 — `deleteConnection()` 确认对话框不显示 `connection.thought`；用户的手写关联想法在确认前不可见 (S)

**What:** `app.js:5315-5325`，`deleteConnection()` 调用 `showConfirmDialog({ message: "确定删除这条关联记录吗？", ... })`。`connection.thought` 字段存储用户手写的关联思考笔记（如「这两本书都强调了 X 概念」），在确认删除前完全不展示。相比之下，`deleteBook()` 至少展示书名，`deleteSession()` 在确认时展示记录日期范围。

**Why it matters:** `connection.thought` 是关联关系中唯一由用户亲写的内容，删除后不可恢复；但确认弹窗仅显示泛用文本，用户必须靠记忆判断「这条关联是否值得保留」。若用户在关联列表中误点删除，没有任何视觉回调能帮助他们识别这是哪条记录。修复：在 `showConfirmDialog` 的 `message` 中加入 `connection.thought` 的前 40 字预览（空时降级为两端节点描述），约 3-4 行。

**Complexity:** S

**Files:** `app.js:5315-5325`（deleteConnection，showConfirmDialog 调用）；`app.js:5109-5130`（quoteLabel 辅助函数，可用于生成关联节点描述）

**northstar:** 中——与 OPT-106「破坏性操作透明度」对称，保护用户的手写思考笔记不被误删。关联是 Theme 2「回顾有价值」的核心数据结构，现有 connections 存量不高但每条都含用户心血。

---

### E201 — `runShelfOcr()` 无 try/finally 加载态管理：20 秒等待期间按钮不禁用、无 spinner，与 `runOcr()` 对称实现相比存在明显缺口 (S)

**What:** `app.js:4568-4612`，`runShelfOcr()` 仅在函数开头调用 `showToast("正在识别书架，约需 20 秒…")`（2 秒后自动消失），进入 `try` 块后无任何加载状态更新，也没有 `finally` 块来恢复按钮或隐藏 spinner。对比：`runOcr()`（`app.js:4488-4540`）有完整的 `try { disableBtn() / showSpinner() } finally { enableBtn() / hideSpinner() }` 结构，OCR 期间按钮灰化、toast 持续可见。`runShelfOcr()` 是 OPT-118（PR #73，2026-07-17）新上线的功能，加载态管理在 PR 中被遗漏。

**Why it matters:** 书架 OCR 耗时 20-28 秒（owner 真机实测，optimization/signals.md 2026-07-17）。这段时间用户没有任何持续进行中的视觉反馈：toast 2 秒后消失、触发按钮仍可点击（可能触发重复提交）、无 spinner。与 `runOcr()` 对比，用户体验明显不一致：同为 OCR 功能，单本封面 OCR 有完整的加载态，书架 OCR 没有。修复模式已在 `runOcr()` 中存在，直接复制 try/finally 结构约 6-8 行。

**Complexity:** S

**Files:** `app.js:4568-4612`（runShelfOcr，加 try/finally 加载态）；`app.js:4488-4540`（runOcr，参照对称实现）

**northstar:** 中——Theme 1「采集顺滑」。OPT-118 书架 OCR 是新用户冷启动的「即时兑现」钩子，20 秒等待期间有无反馈直接影响用户对功能的信任感；无 spinner 时用户会怀疑是否在处理，可能重复点击或刷新页面，导致 OPT-120 所描述的断线丢结果问题更频繁。

---

### E202 — `renderQuotes()` 每条摘抄调用 `getConnectionCount()` 两次：三元 ternary 的条件分支各一次，O(n×m) filter 翻倍 (S)

**What:** `app.js:1880`，摘抄列表模板的关联徽章渲染：

```js
${getConnectionCount(quote.id) > 0 ? ` <span class="quote-conn-badge">🔗 ${getConnectionCount(quote.id)}</span>` : ""}
```

同一个 `quote.id` 在同一行被调用两次。`getConnectionCount()`（`app.js:950`）内部执行 `(state.connections || []).filter((c) => c.source === id || c.target === id).length`——每次调用是 O(m)（m = connections 总数）全量 filter。`renderQuotes()` 遍历 n 条摘抄时，这个 filter 执行 2n 次（而非 n 次）。

**Why it matters:** 摘抄列表是 Theme 2「回顾有价值」的核心视图，每次过滤/切换 tag/搜索都触发 `renderQuotes()` 全量重建。目前 n×m 规模较小（摘抄 <200、connections <50），但 2x 冗余可通过 `const connCount = getConnectionCount(quote.id)` 缓存一行消除，属于无风险低成本修复。

**Complexity:** S（1 行修复）

**Files:** `app.js:1880`（renderQuotes，ternary 内双调用）；`app.js:950`（getConnectionCount，O(m) filter）

**northstar:** 弱——纯性能，当前规模无感知；但「摘抄增长 + 关联增长」是北极星的正向指标，理应让渲染复杂度随数量线性而非 2x 线性增长。

---

### E203 — `buildQuoteSearchCard()`（`app.js:1519`）是死代码：grep 全库零调用点；OPT-070「全局搜索摘抄结果显灰色占位图」以此为修复目标，照此实现后用户仍不可见（需重新定位实际渲染路径）

**What:** `app.js:1519` 定义了 `function buildQuoteSearchCard(quote, book)`，但 grep 全仓库（包含 `app.js`、`chat.js`、`index.html`）结果为该函数名**零调用**。OPT-070 在 triage.md 中描述「全局搜索摘抄结果永远显示灰色占位图」，并将修复目标指向 `` `app.js:1519`（entry-card-cover 未填图）``。但该函数从未被调用，即使修复了函数体，用户也不会看到任何变化——问题的实际根源在别处（全局搜索的摘抄结果可能通过另一个渲染路径或 DOM 模板直接生成，而非经由 `buildQuoteSearchCard()`）。

**Why it matters:** OPT-070 是 triage.md 中 P2 triaged 的条目，下一轮 Agent2 实现时若直接按目前描述动手，将产生一个无用的修改——函数从不被调用，改了也不解决用户看到的问题。在指派前需重新 locate 全局搜索摘抄结果的实际渲染路径（`globalSearch()` 函数或其下游的摘抄结果 DOM 生成逻辑）并更新 backlog 条目中的 `app.js` 行号。

**Complexity:** S（重新定位 + 修复；但需先验证实际渲染路径后才能估算）

**Files:** `app.js:1519`（buildQuoteSearchCard，死代码）；需定位 `globalSearch()` 下游摘抄渲染路径

**northstar:** 中——Theme 2 搜索视觉（triage.md OPT-070 原有优先级）；本条价值在于**防止浪费一次 PR 额度**在无效修复上，同时触发对实际问题路径的重新定位。

---

> 本次 run（2026-07-19）扫描焦点：破坏性操作透明度系列（OPT-043/106 已有基础）、OPT-118 书架 OCR 新功能遗漏加载态、渲染性能低垂果实、backlog 准确性验证（OPT-070 目标函数死代码）。新发现 5 条：E199（deleteBook 无级联数量，S，northstar 中）、E200（deleteConnection 无 thought 预览，S，northstar 中）、E201（runShelfOcr 无 try/finally 加载态，S，northstar 中，runOcr 对称实现已存在）、E202（renderQuotes 双重 getConnectionCount，S，northstar 弱）、E203（buildQuoteSearchCard 死代码，OPT-070 修复目标失效，需重新定位）。提拔 OPT-125（E199，deleteBook 级联透明度，S，三辅助函数已就位）、OPT-126（E201，runShelfOcr 加载态，S，runOcr 已有对称实现）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-20

### E204 — `addSession()` 编辑路径 `book.currentPage` 单调递增：`endPage` 缩小后驻留旧值，下次新记录起始页自动填充显示过期数 (S)

**What:** `app.js:2695`，`addSession()` 的编辑路径（`existingId` 不为空时）执行 `book.currentPage = Math.max(book.currentPage || 0, endPage)`。`Math.max` 的语义是「只往高推」——用户把某条记录的 `endPage` 从 200 改为 100 时，`book.currentPage` 保持 200，下次调用 `openNewSessionForBook()`（`app.js:3454`）时起始页自动填充 `book.currentPage > 0 ? book.currentPage + 1 : ""`，显示 201（而非 101）。OPT-123（已 triaged）修复了**删除路径**（`deleteSession()` 删后不重算 `currentPage`），但同款问题在**编辑路径**未覆盖；OPT-123 的 `how` 注释本身已预告「需同步在 editSession()→addSession() 的 edit 路径验证是否有对称场景（endPage 编小时 currentPage 应同样向下修正）」，说明这一分支是已知的遗漏。

**Why it matters:** 「打开新记录表单 → 起始页已填好」是 Theme 1 采集路径的关键便利，降低用户每次记录时的手工输入量。用户有时需要纠正之前填错的页码（如结束页多填了 100 页），但编辑缩小 `endPage` 后再开新记录，自动填充仍显示修正前的最大值，等于「自动填充帮倒忙」。修复与 OPT-123 delete-path 完全对称：编辑保存后扫描该书所有剩余 sessions，取最大 endPage 赋给 `book.currentPage`，约 4-6 行，甚至可以抽取 `recomputeCurrentPage(bookId)` 辅助函数供两处复用。

**Complexity:** S

**Files:** `app.js:2686-2705`（addSession 编辑路径，`Math.max` 单调递增处）；`app.js:3454`（openNewSessionForBook，起始页自动填充消费 `currentPage`）；参照 OPT-123 delete-path 逻辑（`app.js:3515-3530`）

**northstar:** 中——Theme 1「采集顺滑」，与 OPT-123 同向。起始页自动填充是录入降摩擦核心；编辑路径的 `Math.max` 让「纠错操作」（编辑缩小 endPage）反而制造新错误（过期自动填充），长期会降低用户对该功能的信赖。

---

### E205 — `resolveConnectionSide()` 缺 `ocrText` 回落：OCR 摘抄作为关联节点时标签显示为空引号 (S)

**What:** `app.js:968`，`resolveConnectionSide()` 生成摘抄侧关联节点标签：
```js
return { label: `"${(quote.content || "").slice(0, 36)}${quote.content?.length > 36 ? "…" : ""}"`, sub: ... };
```
只用 `quote.content`，无 `ocrText` 回落。然而 `app.js:5200` 注释明确写道「OCR 摘抄正文只存在 ocrText 里（content 为空），回落后标签才不会退化成「书名 · 」，搜索也才命中得到（OPT-111，与列表/详情/分享卡的 content || ocrText 口径一致）」，并在 `quoteText()` helper（`app.js:5202`）中规范化为 `q.content || q.ocrText || ""`。全仓库其他展示摘抄文本的路径——`renderQuotes()`（`app.js:1855`）、`openQuoteDetail()`（`app.js:3477`）、分享卡（`app.js:3092`）、quote combobox（`app.js:5202`）——均已有 `content || ocrText` 口径；`resolveConnectionSide()` 是全仓库唯一读取 `quote.content` 用于展示却未回落的函数。结果：拍照后内容仍在 `ocrText`（`content` 为 `""`）的摘抄若被建立关联，关联卡片该侧节点显示为 `""…""`（空引号 + 省略号），无法识别是哪条摘抄。

**Why it matters:** OCR 是该 app 的核心摘抄路径（Theme 1「采集顺滑」）；「建立关联」是 Theme 2「回顾有价值」的核心互动。两者交叉时——OCR 摘抄作为关联节点——因标签显示空文本，关联列表中对应条目完全无法识别指向哪条摘抄，令已建立的关联回顾价值归零。修复为 1 处代码、2 处字符级改动（加 `|| quote.ocrText`），与全仓库现有口径对齐，零风险零副作用。

**Complexity:** S（1 处代码，1-2 行修改）

**Files:** `app.js:968`（resolveConnectionSide，缺 ocrText 回落）；参照 `app.js:5202`（quoteText helper，已有正确口径）

**northstar:** 中——OCR 采集（Theme 1）与关联回顾（Theme 2）两条核心路径的交叉点 bug；修复后 OCR 摘抄才能完整参与 Theme 2 关联网络并在回顾时正确显示，属于「解锁已建立关联的可用性」。

---

### E206 — `renderTimeline()` stats bar 在 OPT-077 落地后存在 NaN 风险：若里程碑对象混入 `allSorted` 将导致统计数字损坏 (S)

**What:** `app.js:1723`，`renderTimeline()` 中 `allSorted = [...state.sessions].sort(...)` 是纯 sessions 数组；stats bar（`app.js:1741-1742`）对 `statSource`（= `searchRaw ? sessions : allSorted`）全量 reduce 求 `totalMin = statSource.reduce((sum, s) => sum + Number(s.minutes || 0), 0)` 和 `totalPages = statSource.reduce((sum, s) => sum + Math.max(0, Number(s.endPage || 0) - Number(s.startPage || 0)), 0)`。OPT-077（PR #81，in-progress）将在时间线中插入书籍里程碑卡（startedAt/finishedAt 事件）。若里程碑对象被混入 `allSorted`（例如作为带 `type: "milestone"` 标记的扁平数组元素），这些对象无 `minutes`/`endPage`/`startPage` 字段，`Number(undefined) = NaN`，reduce 将对整条 `totalMin`/`totalPages` 产出 NaN，stats bar 显示「NaN 次记录 · NaN 分钟 · NaN 页」。若 OPT-077 只在 DOM 渲染层插入里程碑（不进 `allSorted`），则无影响。此条是**预防性提示**，需在 PR #81 review 时核实里程碑对象是否混入 `allSorted`。

**Why it matters:** OPT-077 是 W30 夜间轨显式焦点，预计本周内合并。stats bar 是时间线视图唯一的量化阅读统计入口（Theme 2 回顾量化锚点），若被 NaN 污染，回顾视图的数字区域将完全失效，且错误静默（显示 NaN 而非报错，难以察觉）。修复方式极轻量：若里程碑确实混入 `allSorted`，在 stats bar reduce 前加 `.filter(s => s.minutes !== undefined)` 守卫即可（1 行），应在 OPT-077 PR review 时同步确认并按需加 guard。

**Complexity:** S（预防性 guard，1 行 filter；取决于 OPT-077 的实现选择）

**Files:** `app.js:1723`（allSorted 定义）；`app.js:1739-1742`（stats bar reduce，需加 filter guard）；OPT-077 PR #81

**northstar:** 中——保护 Theme 2 回顾视图的量化统计不被 NaN 污染；此条价值在于防止 OPT-077 合并后引入静默回归，应作为 PR review checklist 项。

---

> 本次 run（2026-07-20）扫描焦点：addSession 编辑路径状态一致性（OPT-123 delete-path 的对称遗漏）、OCR 摘抄在关联卡中的 content/ocrText 口径一致性、OPT-077 里程碑落地前的 stats bar NaN 防御。新发现 3 条：E204（addSession 编辑路径 currentPage 单调递增，S，northstar 中，OPT-123 edit-path 对称遗漏）、E205（resolveConnectionSide 缺 ocrText 回落，S，northstar 中，1-2 行修复，全仓库唯一漏网函数）、E206（renderTimeline stats bar NaN 预警，S，northstar 中，OPT-077 落地前预防性提示）。提拔 OPT-127（E205，resolveConnectionSide ocrText 回落，S，最小改动 × 最高可用性恢复）、OPT-128（E204，addSession 编辑路径 currentPage，S，OPT-123 的自然延伸，建议合并同一 PR 实现）。所有断言均基于实际代码读取，已标注 file:line。

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

## 2026-07-21

### E207 — `chat.js:92` `quotePreview()` 缺 `ocrText` 回落：OCR 摘抄钉选时聊天欢迎屏幕显示「书名 · 」(S)

**What:** `chat.js:92`，`quotePreview()` 函数：
```js
function quotePreview(quote) {
  const text = String(quote?.content || "").replace(/\s+/g, " ").trim();
  return text.length > 36 ? `${text.slice(0, 36)}...` : text;
}
```
未回落到 `quote?.ocrText`。`chat.js:131` 同文件 `renderChatMessages()` 中已有正确口径：`const content = String(quote.content || quote.ocrText || "").trim()`——同一文件、4 行之差，模式已存在但未应用于 `quotePreview()`。`chat.js:279`（聊天欢迎屏幕副标题）调用 `quotePreview(quote)` 生成 `"书名 · <preview>"`；当 OCR 摘抄 `content` 为空时，`quotePreview()` 返回 `""`，副标题显示为 `"书名 · "`，末尾 dot 后内容为空，视觉上明显破损。`chat.js:121`（上下文栏）用 `preview || "当前摘抄"` 回落，部分遮盖了问题，但欢迎屏幕无此回落。

**Why it matters:** 拍照 OCR 是该 app 的主要摘抄路径（Theme 1 核心）；「将摘抄钉选到聊天」是 Theme 2 的核心互动——用户围绕这条摘抄讨论内容。两者交汇点（OCR 摘抄钉选后聊天欢迎屏）显示空预览，不仅影响沉浸感，更让用户无法在进入对话前确认正确摘抄已被选中。修复为 1 行：加 `|| quote?.ocrText`，与文件内第 131 行已有口径完全对齐。

**Complexity:** S（1 行修改）

**Files:** `chat.js:92`（quotePreview，加 ocrText 回落）；参照 `chat.js:131`（已有正确口径）

**northstar:** 中——OCR 采集（Theme 1）与围绕摘抄的聊天讨论（Theme 2）两条核心路径的交叉点；欢迎屏副标题空白直接破坏「摘抄已钉选」的视觉确认感。

---

### E208 — OPT-077 里程碑条目无分页：110 本豆瓣书 → 首次渲染 110 个里程碑 DOM 节点 vs `SESSION_PAGE_SIZE = 10` (S/M)

**What:** `app.js:229`，`const SESSION_PAGE_SIZE = 10`——会话初始渲染上限。`app.js:1754-1758`，里程碑收集（OPT-077 引入，PR #81 合并）：
```js
const milestoneItems = [];
if (!searchRaw) {
  state.books.forEach((book) => {
    if (book.startedAt) milestoneItems.push({ ... });
    if (book.finishedAt) milestoneItems.push({ ... });
  });
}
```
**全量无上限**——owner 通过 OPT-105 Douban CSV 导入约 110 本书，每本设置 `finishedAt`（未设 `startedAt`），即第一次打开时间线就会追加 ~110 个里程碑 DOM 节点。`app.js:1769-1771`，`timelineItems` = 全量里程碑 + 前 10 条会话；「加载更多」按钮（`app.js:1834-1844`）只判断 `allSorted.length > sessionDisplayLimit`（纯会话溢出），与里程碑数量无关。里程碑无法被「加载更多」控制，也无独立分页机制。

**Why it matters:** 110 DOM 节点不会让浏览器崩溃，但：(1) 初次渲染体感延迟可感知（每节点含 `article + div + h3 + p + time` 等子元素，实际节点数 ~550+）；(2) 时间线变成「里程碑海」，10 条会话卡被 110 张里程碑卡淹没，回顾主线（会话进度）可视比例大幅下降；(3) OPT-077 的初衷是「点睛」而非「主角」，无上限破坏了该初衷。合理修复：首次渲染仅展示最近 N（如 12）条里程碑，其余通过「加载更多」或独立「显示更多里程碑」控件展开，与 SESSION_PAGE_SIZE 语义对齐。

**Complexity:** S/M（逻辑 S，但需确认「加载更多」按钮的条件联动，约 10-15 行）

**Files:** `app.js:1754-1771`（milestoneItems 收集 + timelineItems 合并）；`app.js:1834-1844`（加载更多按钮，需同步更新溢出判断条件）；`app.js:229`（SESSION_PAGE_SIZE 参照常量）

**northstar:** 中——Theme 2「回顾有价值」；OPT-077 里程碑是 W30 焦点，规模化后应保持视觉比例合理，避免把真正的阅读进度卡埋在里程碑堆中。

---

### E209 — OPT-077 里程碑卡片无点击导航：点击「🎉 读完了《书名》」无反应 (S)

**What:** `app.js:1783-1789`，里程碑卡片渲染：
```js
const card = document.createElement("article");
card.className = `timeline-milestone timeline-milestone--${milestoneType}`;
card.innerHTML = `<div class="milestone-icon">${icon}</div>...`;
els.timeline.appendChild(card);
return;  // 无 addEventListener
```
无 `click` 事件监听器。对比：`app.js:1825-1829`，会话卡有完整点击处理：`article.addEventListener("click", () => { ...; openSessionDetail(session.id); })`。里程碑卡展示「🎉 读完了《深度工作》」等信息，自然语义是「点击 → 打开书籍详情」，但实际点击无响应，卡片视觉上和会话卡形态相近，交互预期落空。

**Why it matters:** 里程碑是 OPT-077 引入的入口点，点击应能导航到书籍详情（书名、状态、完读日期等），是 Theme 2「书籍完读回顾」路径的自然延伸。一行修复即可：`card.addEventListener("click", () => openBookDetailDialog(book.id))`，与会话卡的 `openSessionDetail()` 模式完全对称，无 API 变更。

**Complexity:** S（1 行 addEventListener）

**Files:** `app.js:1783-1789`（里程碑卡渲染，加 click → openBookDetailDialog）

**northstar:** 中——Theme 2 回顾路径；里程碑作为「书籍人生阶段」标记，可点击才能形成完整的「时间线 → 书籍详情 → 重温」回顾闭环。

---

### E210 — Session 搜索框和关联搜索框缺防抖：每次按键触发全量 DOM 重建 (S)

**What:** `app.js:5786`：
```js
els.sessionSearch?.addEventListener("input", renderTimeline);
```
`app.js:5554`：
```js
els.connectionSearch?.addEventListener("input", renderConnections);
```
两处均无防抖。`renderTimeline()` 在 OPT-077 合并后（PR #81）每次执行需收集里程碑、合并 timelineItems、批量创建 DOM 节点，成本比之前更高。`renderConnections()` 类似。OPT-072（triaged，P2）已覆盖摘抄搜索防抖（`app.js:5787`），但 session 搜索和关联搜索不在其 scope 内。

**Why it matters:** 当前 owner 书库规模（~110 本 + 若干 sessions）下体感影响轻微，但 OPT-077 的里程碑 DOM 生成使 `renderTimeline()` 在大书库下变得更重，与 E208 联动形成叠加效应。防抖是标准 input 事件优化，约 2-3 行（复用 `debounce()` 函数若已存在，否则 3-5 行添加 helper），与 OPT-072 的摘抄搜索防抖完全对称，建议同一 PR 一次修清三个搜索框。

**Complexity:** S（2-5 行，可合并入 OPT-072）

**Files:** `app.js:5786`（sessionSearch，加防抖）；`app.js:5554`（connectionSearch，加防抖）；可合并 OPT-072 scope

**northstar:** 弱——当前规模下体感轻微；但 E208（里程碑无分页）使 renderTimeline() 变重，两者若同时在场会放大键入响应延迟；建议与 OPT-072 合并处理以节省 PR 额度。

---

> 本次 run（2026-07-21）扫描焦点：OPT-077 落地后的里程碑相关回归与缺口、OCR 摘抄在聊天路径的 ocrText 口径遗漏、搜索防抖覆盖度。新发现 4 条：E207（chat.js quotePreview 缺 ocrText，S，northstar 中，1 行修复）、E208（OPT-077 里程碑无分页，S/M，northstar 中，110 本豆瓣书首渲 110 DOM 节点）、E209（里程碑卡无点击导航，S，northstar 中，1 行 addEventListener）、E210（session/connection 搜索缺防抖，S，northstar 弱，建议合并 OPT-072）。提拔 OPT-129（E207，chat.js quotePreview ocrText，S，1 行修复，最小改动高优先级）、OPT-130（E208，OPT-077 里程碑分页，S/M，OPT-077 规模化使用后的必要跟进）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-22

### E211 — 书籍详情对话框摘抄预览缺 ocrText 回落：OCR 摘抄在「最近摘抄」栏显示为空白 — 2026-07-22

**What:** `openBookDetailDialog()` 渲染「最近摘抄」预览（最多 2 条）时，使用 `quote.content || ""` 而无 `ocrText` 回落。OCR 摘抄（`content` 为空，文本存于 `ocrText`）在此处显示为空字符串，按钮仅剩元信息行（页码 / 日期），主体内容完全不可见。

**Evidence:**
- `app.js:3825`：`<span class="book-detail-quote-content">${escapeHtml(quote.content || "")}</span>` — 无 ocrText 分支
- 对比同一对话框打开 quoteDetail 的路径，`app.js:2891`：`quote.content || quote.ocrText ||` — 已正确回落
- 对比同文件其他展示路径均已修复（`app.js:968`、`app.js:1890`、`app.js:3145`、`app.js:3530`）
- 书籍详情「摘抄/笔记」区域是用户回顾一本书时最先触达的内容快照，OCR 摘抄在此处空白直接破坏 Theme 2 回顾体验

**Why it matters:** 主采集路径（拍照 OCR）产生的摘抄恰好是 ocrText-only；书籍详情是 Theme 2 「回顾」核心入口；预览区最多 2 条，OCR 摘抄为主时这 2 条全空，等于完全失效。1 行修复，零副作用，与文件内已有口径完全对齐。

**Complexity:** S（1 行：`quote.content || ""` → `quote.content || quote.ocrText || ""`）

**Files:** `app.js:3825`

**northstar:** 中——书籍详情摘抄预览是 Theme 2「回顾有价值」最直接的展示窗口；OCR 采集是主路径；两者交叉点的展示缺陷修复即为 northstar 贡献。

---

### E212 — OPT-077 里程碑卡无点击导航：点击「读完了」无任何响应，无法跳转书籍详情 — 2026-07-22

**What:** OPT-077（PR #81）引入的里程碑卡（startedAt / finishedAt）仅创建 `article` 元素并设置 innerHTML，无 `addEventListener("click", ...)`。用户点击「🎉 读完了《深度工作》」卡片，页面无任何响应。相邻的 session 卡在同一渲染循环中有明确的点击处理：`app.js:1539`（article.addEventListener click → openSessionDetail）。

**Evidence:**
- `app.js:1784-1790`（里程碑分支）：`card.className = ...; card.innerHTML = ...; els.timeline.appendChild(card); return;` — 全段无 `addEventListener`
- `app.js:1539`（session 分支）：`article.addEventListener("click", () => { openSessionDetail(session.id); })` — 对比鲜明
- `openBookDetailDialog(bookId)` 函数已存在（`app.js:3760` 附近），只需 1 行调用
- 里程碑卡携带 `book` 对象（`item.book`，见 `app.js:1783`），bookId 随手可得

**Why it matters:** 时间线作为「阅读足迹入口」，里程碑是用户最自然的「我想重温这本书」触发点——「读完了」一栏本身就是回顾欲望最高的时刻。无点击行为使里程碑从可交互组件退化为纯装饰文字，错失 Theme 2「读完 → 回顾」最顺手的跳转路径。1 行修复。

**Complexity:** S（1 行：在 `els.timeline.appendChild(card)` 之前加 `card.addEventListener("click", () => openBookDetailDialog(book.id))`）

**Files:** `app.js:1789`（里程碑渲染块末尾，`appendChild` 前）

**northstar:** 中——Theme 2；时间线里程碑「点击进入书籍详情 → 回顾摘抄/笔记/评分」是「默认工具」体验的核心交互闭环，当前缺失。

---

### E213 — `reading_mcp_server.py` `_save_state()` 绕过乐观锁：MCP 工具写入与 Web App 并发时可静默覆盖对方状态 — 2026-07-22

**What:** `reading_mcp_server.py:75-80`，`_save_state()` 直接执行 `UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?`，不读取当前版本号、不做比较。`app_server.py` 的 `save_state_checked()`（OPT-030 引入）使用版本条件 UPDATE（`state_version` 字段）防止并发覆盖。MCP server 被所有 6 个工具调用（`_save_state` 出现在 `reading_mcp_server.py:226/285/328/369/412/500`），任何一次 Claude Desktop MCP 调用与用户同时在 Web App 编辑均存在竞态。

**Evidence:**
- `reading_mcp_server.py:75-80`：盲 UPDATE，无版本字段
- 对比 `app_server.py` 中 `save_state_checked()`（OPT-030）：有 version 读取 + compare + conditional UPDATE 机制
- MCP 工具覆盖范围：6 处调用（`add_book`、`add_session`、`add_quote`、`tag_book`、`update_book`、`update_reading_status`）

**Why it matters:** 数据完整性；用户同时用 Claude Desktop MCP 和 Web App 时，后写入方静默覆盖先写入方。当前 owner 处于「豆瓣大批量导入」阶段，并发写入风险最高。northstar 贡献弱（工程卫生为主），但潜在数据丢失风险值得记录。

**Complexity:** S（每个写入点前增加 version 读取 + 比较，约 10-15 行；或提取公共 `_save_state_checked()` helper，约 20 行）

**Files:** `reading_mcp_server.py:75-80`（`_save_state`），所有 6 处调用点

**northstar:** 弱——工程卫生 / 数据完整性；与 northstar 主路径无直接关联，但属于「不出问题的基础」。

---

### E214 — 书籍详情对话框无阅读记录概览：Theme 2 回顾缺少书级阅读足迹摘要 — 2026-07-22

**What:** `index.html` 中 `#bookDetailDialog` 包含：标题/作者/状态、开始/读完日期、notes/评分/读后感、关联问题、最近摘抄（2 条）、关联关系列表——但无任何 sessions 信息。`app.js:3761-3840`（`openBookDetailDialog()`）完整实现中无一处读取 `state.sessions`（仅 `app.js:931` `getBookSessions()` 定义，从未在书籍详情内调用）。用户进入书籍详情无法看到「读了几次、每次读到哪页、花了多少时间」的汇总。

**Evidence:**
- `app.js:3761-3840`：全函数无 `getBookSessions` / `state.sessions` 调用
- `app.js:931`：`getBookSessions(bookId)` 已封装，返回 `state.sessions.filter((item) => item.bookId === bookId)`，可直接使用
- `index.html:410-433`（bookDetailDialog HTML 骨架）：无 session 相关容器
- 对比：时间线（OPT-077）已有里程碑，但书籍详情无「该书 sessions 小列表」——两者信息不互通

**Why it matters:** Theme 2 核心场景：「这本书我读了多久？分几次？每次读到哪里？」无法在书籍详情内一眼看到。`getBookSessions()` 已封装，新增一个 sessions 摘要区（3-5 条最近阅读记录：日期 + 页范围 + 时长）约 M 复杂度（新增 HTML 容器 + JS 渲染逻辑 + CSS），但能显著提升书级回顾密度。

**Complexity:** M（新增 HTML section + JS 渲染约 20-30 行 + CSS 若干行）

**Files:** `index.html:410-433`（新增 section 骨架）、`app.js:3820` 区域（新增 sessions 渲染）、`styles.css`

**northstar:** 中——Theme 2；书籍详情 = 最重要的书级回顾页，补充阅读记录概览使之从「摘抄+评价」升级为「完整阅读档案」，直接服务 owner 希望「事后回顾」的 northstar 场景。

---

> 本次 run（2026-07-22）扫描焦点：OPT-077 里程碑落地后的交互完整性（点击行为）、ocrText 口径在书籍详情路径的覆盖度、MCP 写入路径的数据完整性、Theme 2 书级回顾信息密度。新发现 4 条：E211（书籍详情摘抄预览缺 ocrText，S，1 行，northstar 中——直接 Theme 2 回顾表面）、E212（OPT-077 里程碑无点击导航，S，1 行，northstar 中——闭合「时间线→书籍详情」跳转闭环）、E213（MCP `_save_state` 绕过乐观锁，S，northstar 弱，数据完整性风险）、E214（书籍详情无 sessions 摘要，M，northstar 中，Theme 2 回顾信息补全）。提拔 OPT-131（E211，S，最小改动，ocrText 口径收尾）、OPT-132（E212，S，里程碑点击补全，1 行，Theme 2 交互闭环）。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-23

### E215 — `all_books_summary` 50 本上限：110 本豆瓣书中约 60 本对 AI 跨书查询永久不可见

**Evidence:**
- `app_server.py:2609-2616`：`all_books_summary` 列表推导末尾 `[:50]`，按 `updatedAt` 降序取前 50 本
- `app_server.py:2615`：`for b in sorted(..., key=lambda b: b.get("updatedAt", ""), reverse=True)[:50]`
- `app.js:4608`（OPT-105 Douban CSV 导入流程）：`const now = new Date().toISOString()`，批量导入时所有 110 本书写入同一 `updatedAt = now`
- 同一批次导入的书 `updatedAt` 完全相同 → `sorted()` 排序结果由 `state.books` 原始顺序决定（排序稳定）→ 数组后半段约 60 本永久排在 top 50 之外，AI 永远看不到它们
- `PromptBuilder.build_chat_prompt()`（`app_server.py:2584-2632`）：系统 prompt 直接使用 `all_books_summary`；`app_server.py:2643` 系统指令提示 AI 用该列表回答「哪些书」的问题，但列表残缺

**Why it matters:** Theme 2 核心场景「你帮我找一本我读过但想不起名字的书，主题是 XX」或「把我读过的历史书列出来」——如果 60+ 本书从未进入上下文，AI 回答将系统性缺失，用户误以为 AI 知道全部却答错，信任度受损比「告知我看到了 50 本」更低。

**Complexity:** S（一行：`[:50]` 改 `[:100]` 或加 smarter selection；系统指令需同步更新说明上限）

**Files:** `app_server.py:2615`（`[:50]` 上限行）；`app_server.py:2643`（系统指令）

**northstar:** 中——Theme 2「回顾有价值」；AI 跨书查询是 owner 的核心使用场景之一（2026-07-05 信号 47 次 explore 操作），但 110 本豆瓣书中超过一半永久不进上下文，修复后 AI 可见书库扩大一倍。

---

### E216 — `parseExcelDateToIso()` 产出 UTC 午夜，与 `addSession()` 本地正午不一致：同日 Douban 里程碑排在 session 卡之前

**Evidence:**
- `app.js:648-651`（`parseExcelDateToIso()`）：文本格式日期分支调用 `new Date(text).toISOString()`；`new Date("2022-09-15")` 被 JS 解析为 UTC midnight → ISO 串 `"2022-09-15T00:00:00.000Z"`
- `app.js:2710`（`addSession()` 日期处理）：`new Date(\`${dateValue}T12:00:00\`).toISOString()` → UTC+8 环境 = UTC 04:00 → ISO 串 `"2022-09-15T04:00:00.000Z"`
- `app.js:1776-1779`（`renderTimeline()` 排序）：`timelineItems.sort((a, b) => (b.date > a.date ? 1 : -1))` 按原始 ISO 字符串字典序比较，UTC midnight 早于 UTC 04:00 → 同日 Douban 里程碑排在 session 卡上方
- `app.js:545-549`（`dateInputToIso()`）：专门为 `<input type="date">` 产出的 `YYYY-MM-DD` 串做本地正午处理——`new Date(\`${s}T12:00:00\`).toISOString()`，与 `addSession()` 口径完全一致；`parseExcelDateToIso()` 文本分支未复用此函数

**Why it matters:** 在 UTC+8 环境下差异为 4 小时，视觉上只影响「同一日历日内 Douban 里程碑 vs 手动 session」的排序，不会跨日——当前影响轻微。但一旦有 UTC-N 用户（或服务器日期处理上下文），`parseExcelDateToIso()` 产出的 UTC midnight 会跨越日历日（如 UTC-5 下 00:00Z = 前一天 19:00 本地），导致里程碑日期显示偏移一天。修复成本极低，一致性收益清晰。

**Complexity:** S（1-2 行：`parseExcelDateToIso()` 文本分支改调 `dateInputToIso(s)` 或内联 `T12:00:00` 拼接）

**Files:** `app.js:648-651`（`parseExcelDateToIso` 文本分支）；参照 `app.js:545-549`（`dateInputToIso`）、`app.js:2710`（addSession 口径）

**northstar:** 弱——时间线日期排序一致性问题，不直接影响核心回顾体验，但属于 OPT-105 Douban 导入工程收尾，低成本，建议与 Theme 2 相关 PR 搭车修复。

---

### E217 — `all_books_summary` 缺 `startedAt` 字段：AI 无法回答「我哪些书是 2024 年开始读的」

**Evidence:**
- `app_server.py:2610-2614`（`all_books_summary` per-book dict 构造）：包含 `id`、`title`、`author`、`status`、`rating`、`finishedAt`（`[:10]`）、`doubanComment`（`[:60]`）、`review`（`[:120]`）——无 `startedAt`
- `app_server.py:2643`（系统指令片段）：明确告知 AI 可用 `finishedAt` 筛选日期——但无对应的 `startedAt` 指引
- `app.js:1756-1763`（OPT-077 里程碑）：`if (book.startedAt)` 分支存在，说明 `startedAt` 在 state.books 中已广泛使用（Douban 导入后 110 本书部分有 `startedAt`）
- 与 E215 相同数据路径：`startedAt` 不进 `all_books_summary`，AI 系统 prompt 中无此字段，自然语言查询「2023 年开始读的书」得不到正确结果

**Why it matters:** `finishedAt` 进了 prompt 但 `startedAt` 没进，产生不对称性——AI 能回答「哪些书是某年读完的」但不能回答「哪些书是某年开始读的」；Theme 2 时间轴查询覆盖度只有一半。S 级修复：在 dict 里加一个字段，同步更新系统指令一行。

**Complexity:** S（1 行 dict entry + 1 行系统指令更新）

**Files:** `app_server.py:2614`（dict 末尾加 `"startedAt": (b.get("startedAt") or "")[:10]`）；`app_server.py:2643`（系统指令补充 `startedAt` 说明）

**northstar:** 弱/中——Theme 2；与 E215（50 本上限）合并修复性价比最高，共同保证 AI 书库查询的广度与深度。

---

> 本次 run（2026-07-23）扫描焦点：AI 上下文数据完整性（all_books_summary 覆盖边界）、日期处理一致性（UTC vs 本地时区口径）、startedAt/finishedAt 字段对称性。新发现 3 条：E215（all_books_summary [:50] 上限，60+ 豆瓣书 AI 不可见，S，northstar 中——Theme 2）、E216（parseExcelDateToIso UTC 午夜 vs addSession 本地正午，S，northstar 弱——一致性收尾）、E217（startedAt 缺失于 all_books_summary，S，northstar 弱/中——Theme 2 时态查询对称性）。提拔 OPT-133（E213，MCP _save_state 绕过乐观锁，S，数据完整性）、OPT-134（E215，all_books_summary 50 本上限，S，Theme 2，northstar 中）。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-24

### E219 — `stateContentCount()` 含 `chatHistories` 键数但 `showImportResult()` 只报 4 类：零内容导入守卫可被仅含聊天历史的备份文件绕过 (S)

**What:** `app.js:4382-4391`（`stateContentCount()`）将 5 个字段求和：`books + sessions + quotes + connections`（数组长度）+ `chatHistories`（对象键数）。零内容守卫（`app.js:4440`）条件为 `stateContentCount(resolved) === 0`——若备份文件包含 `chatHistories` 条目但 `books/quotes/sessions/connections` 全部为空数组，`stateContentCount(resolved)` 返回 > 0，守卫不触发，导入继续执行，真实书单/摘抄数据被清空。同时 `showImportResult()`（`app.js:4396-4414`）仅展示书籍/摘抄/记录/关联 4 行，完全不报 `chatHistories`——两个函数在同一字段集上行为不一致。

**Evidence:**
- `app.js:4382-4391`（stateContentCount）：`Object.keys(s.chatHistories || {}).length` 纳入求和
- `app.js:4396-4414`（showImportResult rows 数组）：`["书籍", "摘抄", "记录", "关联"]`——无 chatHistories 行
- `app.js:4440`：`if (stateContentCount(resolved) === 0 && stateContentCount(state) > 0)` — 零内容守卫单一判断入口
- 减少守卫（`app.js:4451-4458`）对每个字段独立检查（包含 chatHistories），提供二层保护——但仅在当前账号有非空 books/quotes/sessions/connections 时才能触发，不能完全覆盖零内容守卫的绕过场景

**Why it matters:** 守卫设计意图是「未识别格式文件解析为空内容 → 阻止误清空账号数据」，`chatHistories` 纳入 stateContentCount 与这一语义不符。减少守卫（OPT-043）提供二层保护，实际风险有限，但零内容守卫与结果展示的字段口径不一致是潜在语义混乱来源，S 级可修清。

**Complexity:** S（2-3 行：零内容守卫改为独立检查 `books+quotes+sessions+connections`，或提取 `stateStructuralCount()` 剥离 chatHistories）

**Files:** `app.js:4382-4391`（stateContentCount）；`app.js:4440`（零内容守卫条件）

**northstar:** 弱——数据安全卫生；减少守卫已提供二层保护，northstar 贡献间接，边缘案例防御。

---

### E220 — `_strip_quote_for_prompt()` 不截断 `content` 字段：20 条 OCR 全页文本可向系统 prompt 注入 20,000+ chars (S)

**What:** `app_server.py:2576-2581`（`_strip_quote_for_prompt()`）按字段白名单过滤 quote 字段，但对 `content` 字段长度无任何截断。对比：`all_books_summary`（`app_server.py:2609-2615`）对 `doubanComment` 截 60 chars、`review` 截 120 chars，统一控制 token 用量；而 quote 的 `content` 字段原样传入，单条 OCR 全页扫描可达 400-1500 chars。

**Evidence:**
- `app_server.py:2576-2581`（`_strip_quote_for_prompt`）：`result = {k: v for k, v in q.items() if k in _QUOTE_PROMPT_FIELDS}` — content 字段原样复制，无 `[:N]`
- `app_server.py:2587`：`raw_quotes = [...][:20]` — 条数上限 20，但每条内容长度不受限
- `app_server.py:2613-2614`（all_books_summary dict）：`"doubanComment": ...[:60]`、`"review": ...[:120]` — 同文件已有截断策略，未延伸到 quote content
- 20 条 × 1000 chars OCR 内容 ≈ 20,000 chars，叠加 all_books_summary + 系统指令，极端情况可触碰 DeepSeek API 上下文窗口限制

**Why it matters:** 用户通过 OCR 采集全页文本时（快速识别路径），每次 AI 对话携带数万字原始扫描内容，增加 LLM 成本，同时压缩 `chat_history[-40:]` 实际可携带的历史轮次（token 用尽时较早的对话轮被截断）。添加软截断（如 `content[:400]`）与 all_books_summary 策略一致，不影响正常摘抄分析质量，只限制 OCR 全页扫描的超长尾。

**Complexity:** S（1-2 行：`_strip_quote_for_prompt` 对 content 加 `[:400]`，可选对 reflection/note 加 `[:200]`）

**Files:** `app_server.py:2576-2581`（`_strip_quote_for_prompt`，加 content 截断）；`app_server.py:2571-2573`（`_QUOTE_PROMPT_FIELDS` 参照处）

**northstar:** 弱——AI 运营成本控制与上下文窗口卫生；不直接影响用户可见功能，防止极端场景下超限失败（间接影响 Theme 2 AI 探讨可靠性）。

---

### E221 — `existing_connections` 在书/摘抄上下文中恒为空列表：AI 无法回答「这本书我关联过什么」，也无法避免建议重复关联 (S)

**What:** `app_server.py:2617`：
```python
"existing_connections": [] if book_id else user_state.get("connections", [])[:20],
```
当 `book_id` 非空（用户在特定书或摘抄的聊天上下文中）时，`existing_connections` 硬编码为空列表，无论该书/摘抄已有多少条手动建立的关联。全局上下文（`book_id == ""`）最多发送原始数组前 20 条（无排序/无过滤）。

**Evidence:**
- `app_server.py:2617`：`[] if book_id else user_state.get("connections", [])[:20]` — 书本/摘抄上下文恒空
- `app_server.py:2644-2647`（系统指令）：明确允许 AI 在 focused_quote 上下文返回 `link_thought` action，sourceId 为 focused_quote.id 或 book.id——但空的 existing_connections 使 AI 无法检测重复，也无法回答「我已有哪些关联」
- 对比 `book_payload["quotes"]`（`app_server.py:2587`）：book 上下文中该书摘抄最多 20 条完整发送；但该书所有关联为 []，信息不对称
- 场景复现：用户在《活着》聊天框问「这本书我关联过什么其他书？」→ AI 回答「没有关联」——即使用户已手动建立了「《活着》→《百年孤独》（主题共鸣）」的关联

**Why it matters:** 「建立关联」（`link_thought`）是 Theme 2 核心，用户在书/摘抄上下文（book_id 非空）时最有创建关联的动机，也最想询问「已有什么关联」。现有实现在最需要关联信息的上下文中向 AI 完全隐藏所有关联，同类修复 OPT-134 扩大了书库覆盖（all_books_summary[:50] → [:120]），本项修复关联覆盖。S 修复：book_id 非空时按 bookId 过滤相关 connections（sourceId/targetId 匹配书或其摘抄），最多 10 条，与 quotes[:20] 上限策略对齐。

**Complexity:** S（5-10 行：替换 `[] if book_id else` 为按 bookId 过滤相关 connections，上限 10 条；无 schema/接口/前端变更）

**Files:** `app_server.py:2617`（`existing_connections` 构建逻辑）；`app_server.py:2584-2618`（`build_chat_prompt` 上下文参照）

**northstar:** 中——Theme 2「建立关联」；用户在书/摘抄 AI 对话中询问或建立关联时，现有关联完全对 AI 不可见，直接影响 AI 辅助「思想碰撞」场景质量；与 OPT-134（AI 上下文数据完整性系列）同方向。

---

> 本次 run（2026-07-24）扫描焦点：导入守卫字段口径一致性、AI 系统 prompt quote content 截断策略、书/摘抄上下文中 existing_connections 覆盖度。新发现 3 条：E219（stateContentCount/showImportResult 字段口径不一致，S，northstar 弱，导入守卫语义混乱）、E220（_strip_quote_for_prompt 无 content 截断，S，northstar 弱，LLM 成本/上下文窗口）、E221（existing_connections 在书上下文中恒空，S，northstar 中，Theme 2「建立关联」AI 场景直接受损）。提拔 OPT-135（E221，S，AI 上下文关联可见性，northstar 中）、OPT-136（E214，来自 2026-07-22 run，M，书籍详情 sessions 摘要，northstar 中）。E216（parseExcelDateToIso UTC 午夜）、E217（all_books_summary 缺 startedAt）已由 OPT-134（PR #91）合并修复，不另行提拔。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-26

> 扫描焦点：OPT-135（existing_connections 覆盖修复，已 triaged）下游 AI 使用路径的完整性——系统指令是否同步更新、MCP 层是否有去重保护；以及 MCP 并发写入冲突在 dispatcher 侧的处理。读取了 `app_server.py:2639-2670`（build_system_instruction）、`reading_mcp_server.py:446-537`（link_thought + 所有工具异常处理）、`mcp_dispatcher.py`（全文）、`tests/agent/reading_mcp_server_tools_test.py`（全文）、`scripts/dev_backend.py`（全文）。

---

### E222 — `build_system_instruction()` 无 `existing_connections` 字段说明：OPT-135 落地后 AI 有数据但不知道如何使用 (S)

**What (verified):** `app_server.py:2643-2670`（`build_system_instruction()`）的 `common_rules`（第 5 条，`app_server.py:2648`）详细说明了 `all_books_summary`、`rating`、`startedAt`、`finishedAt`、`doubanComment`、`review` 六个字段的含义与使用规则；`focused_quote` 场景的 `scenario_rules`（`app_server.py:2652`）和 `book` 场景的 `scenario_rules`（`app_server.py:2656`）均规定 `sourceId`/`targetId` 必须来自 `all_books_summary` 或 `quotes`。但 `existing_connections` 字段（由 `app_server.py:2622` 发送到 `user_data`）在任何场景的系统指令里**一字未提**。

**Evidence:**
- `app_server.py:2622`：`"existing_connections": [] if book_id else user_state.get("connections", [])[:20]` — 字段已发送（全局上下文下最多 20 条；OPT-135 修复后书本上下文将发送该书相关关联）
- `app_server.py:2648`（common_rules 第 5 条）：从 `all_books_summary 最多包含 120 本书` 开始，共 400+ 字说明该字段；`existing_connections` 零提及
- `app_server.py:2652`（focused_quote 场景规则 8）：`"sourceId 必须是 focused_quote.id 或 book.id，targetId 必须是 all_books_summary 中已有书籍的 id 或 quotes 中已有摘抄的 id"` — 无任何关于 `existing_connections` 的指引
- `app_server.py:2656`（book 场景规则 7）：同上，无 `existing_connections` 提及
- 对比：`all_books_summary` 在 `build_system_instruction()` 中有完整语义说明（字段含义、status 过滤规则、rating/date 处理方式）；`existing_connections` 完全缺失

**Why it matters:** OPT-135（已 triaged）落地后，`existing_connections` 将在书/摘抄上下文中填充该书的相关关联（最多 10 条）。但没有系统指令告诉 AI：(1) 该字段是什么（已有的思想关联列表）；(2) 在建议 `link_thought` action 之前应先检查此列表、避免提议重复连接；(3) 用户问「我已经关联过什么」时应直接读取此字段回答。结果：OPT-135 修复数据层，AI 收到真实数据，但行为与空数据时相同——不用它、不提它、仍可能建议重复关联。

**Complexity:** S（3-5 行：在 `common_rules` 或 `link_thought` 相关 `scenario_rules` 中追加一段说明，格式与 `all_books_summary` 第 5 条说明对齐；无后端逻辑/schema 变更）

**Files:** `app_server.py:2643-2670`（`build_system_instruction`，`common_rules` 或 `focused_quote`/`book` 场景的 `scenario_rules`）

**northstar:** 中——Theme 2「建立关联」；是 OPT-135 的必要配套：单修数据层（OPT-135）而不修指令层（本项），AI 获得了关联数据但无法使用，等于 OPT-135 只完成了一半；S 改动，建议与 OPT-135 同 PR 合并。→ **promoted to OPT-137**

---

### E223 — `link_thought()` 无重复连接检测：同一对实体可被 AI 反复关联，`connections` 积累无用重复项 (S)

**What (verified):** `reading_mcp_server.py:498-530`（`link_thought()` 核心逻辑）：

```python
if not _exists(source_type, source_id):
    return {"ok": False, "error": f"source {source_type} not found: {source_id}"}
if not _exists(target_type, target_id):
    return {"ok": False, "error": f"target {target_type} not found: {target_id}"}

connection = {
    "id": _new_id("conn"),
    ...
}
state.setdefault("connections", []).insert(0, connection)
_save_state(conn, user_state, state, version)
return _ok(state, {"created": connection})
```

函数验证了 source/target 实体存在，但**不检查**是否已存在 `(source_id, target_id)` 相同的关联。每次调用都无条件 `insert(0, connection)`。对比：`add_book()` 同文件（`reading_mcp_server.py:288-296`）有显式去重：`exists = any(_books_are_same(...) for b in books)`。

**Evidence:**
- `reading_mcp_server.py:508-524`：entity 存在性检查 → 直接 insert，无 connections 列表扫描
- `reading_mcp_server.py:259-301`（`add_book`）：`exists = any(...)` 去重逻辑存在，`link_thought` 无类似保护
- `tests/agent/reading_mcp_server_tools_test.py:207-251`：`test_link_thought_creates_connection_between_existing_entities` 只测试成功创建；无测试用例验证重复 `(source_id, target_id)` 的行为（不拒绝也不去重）
- 场景复现：用户多次在同一本书的上下文中问「关联一下」，AI 多轮对话各生成一条 `link_thought`；`connections` 列表可积累 5 条内容相同但 id 不同的「《三体》→《黑暗森林》异曲同工」记录

**Why it matters:** 「建立关联」是 Theme 2 核心，关联列表是展示「思想碰撞」的核心视图。重复关联不仅污染数据（用户在关联 Tab 看到同一对书的多条关联），还使 `existing_connections`（OPT-135）可能返回多条重复项给 AI，进一步混淆 AI 的去重判断。S 修复：在 `link_thought()` 中加 2-3 行检查 `state["connections"]` 是否已有 `(source_id, target_id)` 相同的关联；也可返回已有关联而不是 `ok=False`（`skipped=True`，类似 `add_book` 的 dedup 策略）。

**Complexity:** S（3-5 行：在 `reading_mcp_server.py:508` 之后、`insert` 之前，扫描 `state["connections"]` 查找相同 source_id+target_id；返回 `_ok(state, {"skipped": True, "existing": existing_conn})` 而非错误）

**Files:** `reading_mcp_server.py:498-530`（`link_thought` 核心逻辑，加 dedup）；`tests/agent/reading_mcp_server_tools_test.py`（补测重复关联 skipped 行为）

**northstar:** 中——Theme 2「建立关联」；关联数据质量直接影响用户在关联 Tab 的回顾体验；与 E222（系统指令指引）协同——先有 dedup 行为保证（本项），再有 AI 指引（E222），才能端到端避免重复关联。→ **promoted to OPT-138**

---

### E224 — `_StateVersionConflict` 在 MCP 工具层被 `except Exception` 吞掉，`mcp_dispatcher.py` 无识别与重试，并发写入冲突导致 action 永久 FAILED (M)

**What (verified):** `reading_mcp_server.py:253-254`（`add_note` 异常处理，其他工具同结构）：

```python
except Exception as error:
    return {"ok": False, "error": str(error)}
```

`_StateVersionConflict`（`reading_mcp_server.py:66-76`）在 `_save_state()` 检测到乐观锁竞争时抛出（`reading_mcp_server.py:105-106`），被上述 `except Exception` 捕获，返回 `{"ok": False, "error": "state_version_conflict: user_state for user_id=... was modified concurrently; please reload and retry"}`。

`mcp_dispatcher.py:191-192`：

```python
if not raw.get("ok", False):
    return MCPCallResult(ok=False, tool_name=tool_name, raw_result=raw, error=raw.get("error", "tool returned ok=False"))
```

dispatcher 不检查 `error` 字符串内容，不识别 `"state_version_conflict:"` 前缀，无任何重试逻辑。`app_server.py:5819-5847` 收到 `execution.success == False` → 将 action 标记为 `ACTION_STATUS_FAILED` → 返回 500 给客户端。

**Evidence:**
- `reading_mcp_server.py:66-76`（`_StateVersionConflict` 定义）、`reading_mcp_server.py:105-106`（`_save_state` 抛出点）
- `reading_mcp_server.py:253-254`、`439-440`、`527-528`：add_note/tag/link_thought 三个写入工具均用裸 `except Exception` 覆盖所有异常，含 `_StateVersionConflict`
- `mcp_dispatcher.py:191-192`：`error=raw.get("error", ...)` 原样返回，无前缀检测
- `app_server.py:5796-5847`：`execution.success` 为 False → `ACTION_STATUS_FAILED`，无重试分支
- 对比：HTTP API 的 `save_state_checked()`（OPT-030）检测版本冲突并向客户端返回专用错误码，由客户端重试；MCP 路径无等价机制
- `tests/agent/reading_mcp_server_tools_test.py`：无测试覆盖 `_StateVersionConflict` 路径（`test_save_state_sanitizes_before_writing` 只测正常保存路径）

**Why it matters:** 乐观锁（OPT-133）是防止 MCP 与 HTTP API 并发覆盖的核心机制。但触发冲突的正确响应是「重试」，而非「永久失败」。用户在 iPhone 上审批 AI action 的同时若从 PC 编辑同一本书，MCP 写入将被 OCC 拒绝，action 标记 FAILED，用户看到 500 错误，需要重新发起整个 AI 对话才能再次尝试保存同一条笔记——即便该笔记本身完全正确。

**Complexity:** M（2 条路径选一：A. `mcp_dispatcher.py` 检测 `"state_version_conflict:"` 前缀后重试 1 次，5-10 行；B. MCP 工具层为 `_StateVersionConflict` 返回专用 `{"ok": False, "conflict": True}` 字段，dispatcher 识别后重试，10-15 行更清晰）

**Files:** `mcp_dispatcher.py:184-193`（dispatch 重试逻辑）；`reading_mcp_server.py:253-254`、`439-440`、`527-528`（各工具异常处理，可选增加 `conflict` 字段）；`tests/agent/reading_mcp_server_tools_test.py`（补测冲突场景）

**northstar:** 弱-中——Theme 2 AI 探讨可靠性：OPT-133 用乐观锁防止数据损失，本项让冲突从「静默失败」变为「自动重试」，补全 OPT-133 的 happy-path 设计；并发窗口窄（典型用户单设备），触发概率低，但后果（用户重做整轮对话）比锁冲突本身严重。

---

### E225 — `reading_mcp_server.py` 无进程健康探针：崩溃后所有后续 AI action 审批均以 "MCP call failed" 失败，用户无恢复提示 (M)

**What (verified):** `mcp_dispatcher.py:183-186`：

```python
try:
    raw = asyncio.run(_call_tool_async(tool_name, arguments))
except Exception as error:
    return MCPCallResult(ok=False, tool_name=tool_name, error=f"MCP call failed: {error}")
```

`app_server.py:29`：`from mcp_dispatcher import MCPToolDispatcher` — 模块级导入，无懒加载或可选导入。`scripts/dev_backend.py:137-138`：`if not check_mcp_server(): raise RuntimeError("MCP server is not reachable")` — 只在启动时检查一次。

**Evidence:**
- `mcp_dispatcher.py:184-186`：`asyncio.run(...)` 若 MCP 服务不在线，`streamablehttp_client` 抛出 `ConnectionRefusedError`，被捕获后返回 `"MCP call failed: [Errno 111] Connection refused"`
- `app_server.py:5847`：`self._send_json({"error": execution.error_message, "action": final_action}, 500)` — 客户端收到的错误信息含 `"MCP call failed"` 前缀，无面向用户的恢复提示
- `scripts/dev_backend.py:67-93`（`check_mcp_server()`）：只在 `start_backend()` 时执行一次，无持续心跳；MCP 进程在运行期崩溃后 `dev_backend.py` 不重启它
- `scripts/start_mcp.sh`：独立 shell 脚本，手动启动，无 PID 管理或 watchdog
- `CLAUDE.md` run 命令（`python3 app_server.py`）不提 MCP 服务需单独启动

**Why it matters:** MCP 服务是 AI action 执行路径的单点故障。服务崩溃（uvicorn 内存异常、Python 异常、端口冲突）导致全部后续 `approve` 请求 500，AI 探讨中审批 action 的功能对用户完全不可用，直到手动重启 `scripts/start_mcp.sh`。用户没有任何「MCP 服务未运行，请重启」的提示，只会看到重复的通用 500 错误。M 改进方向：`app_server.py` 启动时 ping MCP（复用 `dev_backend.py` 的 `check_mcp_server()` 逻辑）并在状态端点暴露健康信息；或在 action approve handler 捕获 `"MCP call failed"` 后返回更具体的 503 + 用户可读错误。

**Complexity:** M（两路并行：1. `app_server.py` action approve handler 将 `"MCP call failed"` 前缀映射为 503 + 面向用户的中文提示 "AI 助手暂时不可用，请联系管理员重启服务"，约 5 行；2. `scripts/dev_backend.py` 增加 MCP 心跳监测（每 60s `check_mcp_server()`，失败时尝试重启 `start_mcp.sh`），约 20 行）

**Files:** `app_server.py:5847`（error message 映射）；`mcp_dispatcher.py:186`（`"MCP call failed"` 前缀标准化）；`scripts/dev_backend.py:153-180`（主循环加 MCP 心跳）

**northstar:** 弱——基础设施可靠性；不直接影响 AI 功能质量，但影响功能可用性；适合北极星指标回落时（如当前 7/26 week 全线最低）优先稳基础设施。

---

> 本次 run（2026-07-26）扫描焦点：OPT-135（existing_connections 数据层修复）下游 AI 指令层配套完整性、MCP `link_thought` 数据质量保护、并发写冲突在 MCP dispatcher 侧的处理逻辑、MCP 服务进程健康管理。新发现 4 条：E222（系统指令无 existing_connections 说明，S，northstar 中，Theme 2 OPT-135 配套）、E223（link_thought 无重复连接检测，S，northstar 中，关联数据质量）、E224（StateVersionConflict 被 dispatcher 吞掉不重试，M，northstar 弱-中，OPT-133 完整性）、E225（MCP 服务无健康探针，M，northstar 弱，基础设施可靠性）。提拔 OPT-137（E222，S，系统指令 existing_connections 说明，northstar 中，建议与 OPT-135 同 PR）、OPT-138（E223，S，link_thought dedup，northstar 中）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-27

### E226 — `build_chat_prompt` 按书 quote 切片取最旧 20 条：书注量超过 20 时最近添加的摘抄对 AI 不可见 — `app_server.py:2591` (S)

**What (verified):**

```python
raw_quotes = [item for item in user_state.get("quotes", []) if item.get("bookId") == book_id][:20] if book_id else []
```

`app_server.py:2591`：`[:20]` 直接截取列表推导结果，无 `sorted()` 调用，保留原始 state 插入顺序（oldest-first）。对同一本书注量超过 20 条的情况，最近添加的摘抄被静默排除出 AI 上下文。

**Evidence:**
- `app_server.py:2591`：`[:20]` 无任何 `key=` 排序，取插入顺序前 20 条
- 对比同文件 `all_books_summary` 构造（`app_server.py:2620`）：`sorted(user_state.get("books", []), key=lambda b: b.get("updatedAt", ""), reverse=True)[:120]`——书列表显式以最近更新倒序排序，摘抄列表无等价处理
- State 中 quotes 以追加方式积累（前端 `state.quotes.push(newQuote)` 后调用 `syncState()`），故插入顺序等于创建时间升序（最旧在前）

**Why it matters:** Owner 已通过豆瓣导入 110 本书并持续 OCR 批注，部分核心书籍（如《活着》《百年孤独》原型书）可能积累 20+ 条摘抄。AI 看到的是 6 个月前的旧摘抄，对上周刚加的句子一无所知——恰好颠倒了相关性优先级。

**Complexity:** S（将 `[:20]` 改为先按 `createdAt` 降序排序再取前 20：`sorted([q for q in ... if q.get("bookId") == book_id], key=lambda q: q.get("createdAt", ""), reverse=True)[:20]`，保持 token 预算不变，只改选取策略；1 行改动）

**Files:** `app_server.py:2591`

**northstar:** 中——Theme 2「回顾有价值」：AI 探讨质量直接依赖所见摘抄的相关性；保持 20 条上限但优先选最新，比扩大上限代价更低（无 token 增加），直接服务于「随手翻书对话」体验。

---

### E227 — 建立关联弹窗：来源为摘抄时目标类型仍默认「书籍」，quote-to-quote 关联每次须手动切换下拉 — `app.js:5404-5405` (S)

**What (verified):**

```javascript
document.getElementById("connSourceType").value = sourceType || "book";   // app.js:5404
document.getElementById("connTargetType").value = targetType || "book";   // app.js:5405
```

`openConnectionDialog`（`app.js:5401-5425`）：`targetType` 未传入时固定默认 `"book"`，不受 `sourceType` 影响。

调用来源均未传 `targetType`：
- `app.js:5626`：`openConnectionDialog({ sourceType: "quote", sourceId: quoteId })` — 来源摘抄已填，目标仍默认书籍
- `app.js:5879`：`openConnectionDialog({ sourceType: "quote", sourceId: id })` — 同上

```javascript
toggleConnComboboxes("source", sourceType || "book");   // app.js:5412
toggleConnComboboxes("target", targetType || "book");   // app.js:5413
```

`toggleConnComboboxes`（`app.js:5427-5438`）基于 type 值显示/隐藏对应下拉，目标下拉联动同样固定显示「书籍」combobox。

**Evidence:**
- `app.js:5405`：`targetType || "book"` — 无 sourceType 推断逻辑
- 2026-06-29 signal：「目标若选摘抄，关键词搜索后每条摘抄显示不完整（被截断），看不清内容、找不到想关联的那一条」——可见 owner 确实有 quote-to-quote 关联需求，每次都要先切换目标类型

**Why it matters:** quote-to-quote 是「思想碰撞」最核心的用例——两条摘抄相互呼应、形成关联。来源为摘抄时默认目标为书籍是反自然的（摘抄 → 书会让关联退化为"这条摘抄来自哪本书"）。每次建立摘抄间关联需额外点一次类型切换。

**Complexity:** S（当 `sourceType === "quote"` 且 `targetType` 未传入时，默认目标类型改为 `"quote"`：将 `targetType || "book"` 改为 `targetType || (sourceType === "quote" ? "quote" : "book")`，同步应用到 `toggleConnComboboxes` 调用；约 2 行改动）

**Files:** `app.js:5404-5405`（目标类型默认值）、`app.js:5412-5413`（`toggleConnComboboxes` 调用）

**northstar:** 中——Theme 2「建立关联」：与 2026-06-29 signal 直接相关；减少 quote-to-quote 关联操作步骤，降低每次建立摘抄间连接的摩擦；S 改动零 backend/schema 变更。

---

### E228 — 聊天限速错误无「重试」按钮：与 OPT-073 通用错误路径不对称 — `chat.js:717-720` (S)

**What (verified):**

```javascript
if (error?.code === "rate_limited") {
  thinking.classList.remove("chat-bubble-loading");
  thinking.textContent = error.message;
  thinking.classList.add("chat-rate-limited");
} else {
  // OPT-073: non-timeout streaming errors ... also need a one-tap recovery path
  thinking.textContent = `出错了：${error.message}`;
  thinking.classList.add("chat-error");
  appendRetryControl(thinking, text);   // ← 重试按钮
}
```

`chat.js:717-729`：rate-limited 分支仅显示 `error.message` + CSS 类，无 `appendRetryControl` 调用；else 分支（OPT-073 修复后）有内联重试按钮。`error.retryAfter`（`chat.js:642`）已解析出等待秒数，但未被消费。

**Why it matters:** 被限速后用户需手动重新输入或滚动回原消息重发。对单用户 app 触发概率极低，优先级低；主要是与 OPT-073 的设计一致性问题。

**Complexity:** S（在 rate-limited 分支加一行 `appendRetryControl(thinking, text)` 或带 `retryAfter` 倒计时的延迟版按钮）

**Files:** `chat.js:717-720`

**northstar:** 弱——代码一致性，单用户限速概率极低，对北极星指标无直接贡献；建议预算充裕时顺手做。

---

### E229 — `matchQuotes()` 定义后从未被调用：死代码，且缺少 `ocrText` 回落 — `app.js:1372-1374` (S)

**What (verified):**

```javascript
// Used by book-detail and quote-tab filtering only. Intentionally NOT wired into globalSearch().
function matchQuotes(query) {
  return state.quotes.filter((quote) => isRegularQuote(quote) && fuzzyMatch(quote.content || "", query));
}
```

`app.js:1371-1374`：注释声称「Used by book-detail and quote-tab filtering」，但全文搜索无任何 `matchQuotes(` 调用点——函数从未被调用。实际摘抄过滤在 `renderQuotes`（`app.js:1877-1888`）以内联逻辑实现，haystack 正确包含 `item.content || item.ocrText || ""`。

注意：`matchQuotes` 仅使用 `quote.content || ""`，若被调用将导致 OCR 摘抄（content 为空、文本在 ocrText）漏搜——但当前死代码，不产生实际 bug。

**Why it matters:** 死代码混淆代码意图（注释说「在用」但实际未用），且若未来误引入调用将出现 OCR 摘抄漏搜 regression。S 清理。

**Complexity:** S（直接删除 1372-1374 行，或补 `ocrText` 回落后接入 `renderQuotes`）

**Files:** `app.js:1372-1374`

**northstar:** 无——纯代码卫生，不影响用户可见功能。

---

> 本次 run（2026-07-27）扫描焦点：PromptBuilder per-book quote 选取策略、建立关联弹窗目标类型默认值、聊天限速 UX 一致性、死代码。新发现 4 条：E226（per-book quote slice 取最旧 20 非最新，S，northstar 中，Theme 2 AI 上下文相关性）、E227（关联弹窗来源摘抄时目标仍默认书籍，S，northstar 中，2026-06-29 signal 佐证，Theme 2 摩擦减少）、E228（限速错误无重试按钮，S，northstar 弱，代码一致性）、E229（matchQuotes 死代码且缺 ocrText 回落，S，无北极星贡献）。提拔 OPT-139（E226，S，per-book quote 最新优先，Theme 2）、OPT-140（E227，S，关联弹窗目标默认推断，Theme 2）。所有断言均基于实际代码读取，已标注 file:line。

## 2026-07-28

### E230 — `all_books_summary` 缺少 `tags` 字段：AI 无法按标签跨书查询 — `app_server.py:2626-2634` (S)

**What (verified):**

```python
"all_books_summary": [
    {"id": b.get("id"), "title": b.get("title"), "author": b.get("author", ""),
     "status": b.get("status", ""), "rating": b.get("rating", 0),
     "startedAt": (b.get("startedAt") or "")[:10],
     "finishedAt": (b.get("finishedAt") or "")[:10],
     "doubanComment": (b.get("doubanComment") or "")[:60],
     "review": (b.get("review") or "")[:120]}
    for b in sorted(user_state.get("books", []), key=lambda b: b.get("updatedAt", ""), reverse=True)[:120]
],
```

`app_server.py:2626-2634`：dict comprehension 包含 9 个字段（id/title/author/status/rating/startedAt/finishedAt/doubanComment/review），**无 `tags` 字段**。`build_system_instruction()` 规则 5（`app_server.py:2661`）详细说明了上述所有字段的含义与使用规则，同样无任何对 `tags` 的提及——即便数据层补上 tags，AI 也不知道如何使用。

**Why it matters:** OPT-134（PR #91）已将书库上限从 50 扩展到 120，但 `tags` 仍对 AI 不可见。2026-07-03 signal：「为读书会按主题找书，书单搜「成长」零结果——库里有多本成长题材（标签 `小说(成长/哲学)`、简介含「成长」）」——同一痛点在 AI 对话中完全存在：owner 无法问「帮我找书架上成长类的书」并期待 AI 从标签命中。OPT-092（PR #60）已修复 `matchBooks()` 的 tags 盲区，AI 提示词端同款盲区尚未补上。

**Complexity:** S（`app_server.py:2632` 加一行 `"tags": b.get("tags", [])`；`app_server.py:2661` 末尾追加约 1-2 句 tags 使用说明）

**Files:** `app_server.py:2626-2634`（all_books_summary 构造）、`app_server.py:2661`（系统指令规则 5）

**northstar:** 中——Theme 2「回顾有价值」；AI 跨书标签查询（「成长/悬疑/哲学类」「读书会推荐」）是基于分类的阅读回顾基础能力；2026-07-03 signal 直接佐证；与 OPT-092 在搜索路径同系列，本项修复 AI 对话路径。

---

### E231 — 聊天压缩阈值仅 10 条：书籍深度探讨过早丢失早期对话上下文 — `app_server.py:2524-2525` (S)

**What (verified):**

```python
_COMPRESS_THRESHOLD = 10   # messages before triggering compression  # app_server.py:2524
_COMPRESS_KEEP_RECENT = 6  # recent messages to keep verbatim         # app_server.py:2525
```

10 条消息（约 5 轮用户提问）即触发压缩；将早期消息压缩为 200 字 LLM 摘要后替换（`app_server.py:2541-2543`：`"将以下对话压缩为200字内摘要，保留书名、核心观点和已执行的操作"`），仅保留最近 6 条原文。探讨同一本书的多轮对话——前 3 轮讨论整体观感、第 4-5 轮就某段摘抄深入、第 6 轮引用第 2 轮观点——到第 11 条时，早期细粒度讨论已不可恢复性地被压缩到 200 字。

**Why it matters:** 2026-07-05 北极星：探讨 47 次，是第二高频操作；探讨是 owner 最常用的 AI 功能。阈值提高到 20 对 token 预算冲击极小（单条消息 50-200 token，增量 10 条约 1-2k token），但将「不丢失」的有效对话轮次从 5 轮扩展到 10 轮——正好覆盖一次书籍深度探讨的典型长度。

**Complexity:** S（`_COMPRESS_THRESHOLD = 10` → 20；`_COMPRESS_KEEP_RECENT = 6` → 8；约 2 行改动）

**Files:** `app_server.py:2524-2525`

**northstar:** 弱中——无信号直接佐证，但探讨是第二高频操作（7/05: 47 次），阈值过低是所有深度对话会话的系统性上下文衰退；S 改动，无 schema/接口/前端变更。

---

### E232 — 关联弹窗 `filteredQuotes()` 不搜索摘抄标签：按标签找目标摘抄失败 — `app.js:5303-5311` (S)

**What (verified):**

```javascript
function filteredQuotes(q) {
    if (!q) return allQuotes.slice(0, 30);
    const lower = q.toLowerCase();
    return allQuotes.filter((item) => {
        const book = state.books.find((b) => b.id === item.bookId);
        return quoteText(item).toLowerCase().includes(lower) ||
            (book?.title || "").toLowerCase().includes(lower);
    }).slice(0, 30);
}
```

`app.js:5303-5311`（`initQuoteCombobox()` 内）：过滤仅匹配 `quoteText(item)`（content/ocrText）和 `book.title`，**不搜索 `item.tags` 和 `item.reflection`**。对比：`renderQuotes()` haystack（`app.js:1880-1886`）已正确包含 tags 和 reflection，两处过滤逻辑不对称——用户在摘抄 Tab 按标签能找到摘抄，在关联弹窗按同一标签却找不到。

**Why it matters:** 用户若给摘抄打了「哲学」「成长」标签，在建立关联时输入该标签无法找到目标摘抄，需手动回忆原文片段才能匹配。标签本是摘抄分类的主要手段，却在「建立关联」（最需要按主题查找摘抄）的场景下完全失效。

**Complexity:** S（`filteredQuotes` 过滤末尾加 `|| (item.tags || []).some(t => t.toLowerCase().includes(lower))`，约 1 行）

**Files:** `app.js:5303-5311`（`initQuoteCombobox` 内 `filteredQuotes`）

**northstar:** 弱中——Theme 2「建立关联」；标签是摘抄分类的主要手段，关联弹窗无法按标签检索降低了按主题建立摘抄间关联的可行性；与 OPT-092（matchBooks 补 tags）、OPT-096（renderConnections 补 c.tags）同属 searchable-fields 系列。

---

> 本次 run（2026-07-28）扫描焦点：all_books_summary 数据字段完整性、聊天压缩策略、关联弹窗检索覆盖面。新发现 3 条：E230（all_books_summary 缺 tags，S，northstar 中，2026-07-03 signal 直接佐证，Theme 2 AI 跨书标签查询）、E231（压缩阈值 10 条过早，S，northstar 弱中，无直接信号但影响所有深度探讨）、E232（关联弹窗 filteredQuotes 不搜 tags/reflection，S，northstar 弱中，searchable-fields 系列）。提拔 OPT-141（E230，all_books_summary 补 tags，S，Theme 2，7/03 signal）、OPT-142（E232，关联弹窗 filteredQuotes 补 tags，S，Theme 2）。所有断言均基于实际代码读取，已标注 file:line。

---

## 2026-07-29

### E233 — HTTP `ActionExecutor.link_thought` 无重复关联守卫：approve+execute 路径可写入重复 connection — `app_server.py:3438-3465` (S)

**What (verified):**

```python
# app_server.py:3438-3465 — link_thought 执行路径（ActionExecutor.execute_action）
elif action["type"] == "link_thought":
    VALID_KINDS = {"异曲同工", "引用", "对比", "影响", "延伸"}
    kind = data.get("kind", "")
    if kind not in VALID_KINDS:
        raise ValueError(f"invalid connection kind: {kind}")
    source_type = data.get("sourceType", "")
    target_type = data.get("targetType", "")
    if source_type not in {"book", "quote"} or target_type not in {"book", "quote"}:
        raise ValueError("sourceType and targetType must be 'book' or 'quote'")
    if source_type == "book" and not any(b.get("id") == data.get("sourceId") for b in state["books"]):
        raise ValueError(f"source book not found: {data.get('sourceId')}")
    # ... entity existence checks only, no duplicate check ...
    state.setdefault("connections", []).insert(0, {
        "id": new_id("conn"),
        ...
    })
```

`app_server.py:3438-3465`：`ActionExecutor.execute_action()` 的 `link_thought` 分支验证实体存在性（sourceId/targetId 在 books/quotes 中存在），但**不检查 `state["connections"]` 是否已有相同 `(sourceId, targetId)` 组合**，每次调用均无条件 `insert(0, connection)`。

对比：`reading_mcp_server.py:513-519`（OPT-138 已修复）：
```python
connections = state.get("connections", [])
if any(
    c.get("sourceType") == source_type and c.get("sourceId") == source_id
    and c.get("targetType") == target_type and c.get("targetId") == target_id
    for c in connections
):
    return _ok(state, {"skipped": True, "reason": "connection already exists"})
```

MCP 路径有守卫，HTTP Agent approve+execute 路径无守卫——两条写入路径行为不对称。

**Why it matters:** 用户在 AI 聊天中多轮要求「建立关联」时，每次 approve 都会新增一条 connection，即使完全相同的 (sourceId, targetId) 组合已存在。OPT-137 通过系统指令要求 AI 在建议 link_thought 前检查 existing_connections，但指令层守卫不如代码层守卫可靠——AI 可能忽略、用户也可能连续 approve 同一 action 两次（误触「确认」按钮）。与 OPT-138 同属双重防线设计：指令层（OPT-137）+ MCP 代码层（OPT-138）+ HTTP 代码层（本项缺失）。

**Complexity:** S（`app_server.py:3454`，entity 存在性检查之后、`state.setdefault(...).insert(...)` 之前，插入约 5 行 dedup 检查；参照 `reading_mcp_server.py:513-519` 的模式，直接复制并适配 HTTP executor 数据访问方式）

**Files:** `app_server.py:3438-3465`（link_thought 执行分支）；`tests/agent/action_executor_atomic_test.py` 或新建测试（补 link_thought 重复 approve 无重复 connection 的回归测试）

**northstar:** 中——Theme 2「建立关联」；关联列表是「思想碰撞」的主要回顾视图，重复关联污染列表数据、破坏回顾体验；S 修复，与 OPT-138（MCP 路径去重）对称；无 schema/接口/前端变更。

---

### E234 — `_COMPRESS_THRESHOLD = 10` 对深度探讨过早触发：约 5 轮 Q&A 后早期上下文即被压缩为 200 字摘要 — `app_server.py:2524-2525` (S)

**What (verified):**

```python
_COMPRESS_THRESHOLD = 10   # messages before triggering compression  # app_server.py:2524
_COMPRESS_KEEP_RECENT = 6  # recent messages to keep verbatim         # app_server.py:2525
```

`app_server.py:2524-2525`：10 条消息（约 5 轮用户提问）即触发压缩（`compress_chat_history_if_needed`，`app_server.py:2536`），将前 4 条消息压缩为 200 字 LLM 摘要（`app_server.py:2543`：`"将以下对话压缩为200字内摘要，保留书名、核心观点和已执行的操作"`），仅保留最近 6 条原文。

**Why it matters:** owner 2026-07-05 北极星：探讨 47 次（AI 对话是第二高频操作，仅次于查看），2026-07-19 探讨 29 次（仍是主要回顾活动）；2026-07-26 signal：「阅读时往往想一口气读下去，等一小节读完后才会集中记录摘抄」——批量记录场景下，单次 AI 会话可能涉及同一本书的多条摘抄连续讨论（5+ 轮），10 条阈值不够，第 6 轮开始的提问会失去第 1-2 轮建立的具体细节（虽保留 200 字摘要，但摘要丢失句子级细粒度）。阈值提高到 20 对 token 预算冲击极小（单条消息约 50-200 token，增量 10 条约 1-2k token），但将「不丢失」的有效对话轮次从 5 轮扩展到 10 轮，覆盖一次典型批量记录 + 讨论的完整会话。

**Complexity:** S（`_COMPRESS_THRESHOLD = 10` → 20；`_COMPRESS_KEEP_RECENT = 6` → 8；约 2 行改动）

**Files:** `app_server.py:2524-2525`

**northstar:** 弱中——AI 探讨是 owner 最高频的回顾操作（北极星第三数的主要来源）；阈值过低是所有深度对话会话的系统性上下文衰退，无直接 signal 明确抱怨，但 S 改动、零副作用、2026-07-26 批量记录 signal 间接相关。

---

### E235 — `book.notes`（内容简介）不在 `all_books_summary`：AI 无法基于书内容简介回答跨书内容匹配查询 — `app_server.py:2626-2634` (S)

**What (verified):**

```python
# app_server.py:2626-2634 — all_books_summary dict comprehension
"all_books_summary": [
    {"id": b.get("id"), "title": b.get("title"), "author": b.get("author", ""),
     "status": b.get("status", ""), "rating": b.get("rating", 0),
     "startedAt": (b.get("startedAt") or "")[:10],
     "finishedAt": (b.get("finishedAt") or "")[:10],
     "doubanComment": (b.get("doubanComment") or "")[:60],
     "review": (b.get("review") or "")[:120],
     "tags": b.get("tags", [])}   # OPT-141 加
    for b in sorted(...)[:120]
],
```

`app_server.py:2626-2634`：`all_books_summary` 包含 10 个字段，包含用户主观评价（doubanComment、review）和分类信息（tags、status、rating），但**不含 `book.notes`（书籍内容简介/内容描述，由用户或 AI summary 动作写入）**。

对比：`matchBooks()` (`app.js:1365`) 已搜索 `book.notes`——前端关键词搜索可命中简介，AI 跨书查询不能。`book.notes` 通过 `summary` action（`app_server.py:3402-3404`）由 AI 自动积累，也可在编辑弹窗手动填入。

**Why it matters:** 用户询问「有没有什么书讲的是…」（按内容主题查询）时，AI 只能依赖 `tags`、`doubanComment`（60字）、`review`（120字）。若某本书有详细内容简介（notes）但 doubanComment/review/tags 均为空，AI 无法从内容维度匹配。`summary` action 落库到 `notes` 后 AI 无法直接读取自己写的内容，回顾闭环断裂。添加截断 `notes` 约 80-100 字符可低成本补上这一盲区。

**Complexity:** S（`app_server.py:2632` 末尾加 `"notes": (b.get("notes") or "")[:100]`；可选 `app_server.py:2661` 补一句 notes 字段说明，约 2 行改动）

**Files:** `app_server.py:2626-2634`（all_books_summary 构造）、`app_server.py:2661`（common_rules 可选补 notes 说明）

**northstar:** 弱中——Theme 2「回顾有价值」；AI 按内容主题跨书查询是 Theme 2 的长尾场景；`summary` action 写入 `notes` 后 AI 立即可读提升 AI 工具的回顾闭合度；但有 doubanComment/review/tags 三条信息已部分覆盖，此项是补全，非修复断点；S 改动，无 schema/接口/前端变更。

---

> 本次 run（2026-07-29）扫描焦点：HTTP executor 与 MCP 的对称性缺口、AI 上下文完整性（all_books_summary 剩余字段）、聊天压缩策略再评估。新发现 3 条：E233（HTTP ActionExecutor.link_thought 无重复关联守卫，S，northstar 中，OPT-138 MCP 修复的 HTTP 对称缺口，2-路径不对称）、E234（压缩阈值重评估，S，northstar 弱中，2026-07-26 批量记录 signal 间接相关）、E235（all_books_summary 缺 notes 字段，S，northstar 弱中，summary action 写入后 AI 无法读取形成闭环）。提拔 OPT-143（E233，HTTP link_thought 去重，S，northstar 中，最强对称缺口）、OPT-144（E234，压缩阈值 10→20，S，northstar 弱中，探讨是 owner 最高频回顾操作）。所有断言均基于实际代码读取，已标注 file:line。

## 2026-08-06

> 扫描焦点：2026-07-31 显式长期记忆 signal、聊天数据删除失败语义、复用书籍 combobox 的检索一致性与可访问性。基于最新 `feature/agent`，核对 backlog、triage、roadmap、signals、当前源码与 open PR（当前无目标为 `feature/agent` 的 open PR）。旧条目已覆盖并排除：E220（quote prompt 长度）、E228（限流重试）、E234/OPT-144（压缩阈值）、E235（all_books_summary 缺 notes），本次不重复登记。

### E236 — 产品 Agent 没有用户可控的显式长期记忆，跨会话稳定偏好只能困在分片聊天与有损摘要中 (M)

**What (verified):** `optimization/signals.md:38` 明确要求把用户确认的阅读偏好、稳定观点、持续目标与待办保存为可查看、可编辑、可删除的长期记忆。当前后端 `INITIAL_STATE`（`app_server.py:206-213`）和 `sanitize_state()` 返回白名单（`app_server.py:712-770`）都没有 memories 字段；前端 `initialState` / `normalizeStateShape()`（`app.js:6-14,389-402`）也没有对应集合。PromptBuilder 只发送当前聊天的 `chat_history[-40:]`（`app_server.py:2668-2681`），且超过 10 条会把旧消息压成 200 字摘要（`app_server.py:2555-2587`）。

**Why it matters:** 现有机制只解决“当前上下文续聊”，不解决“跨书、跨会话的稳定认识”。偏好与观点会被 context key 分片、40 条裁剪或摘要压缩；用户无法知道系统记住了什么，也无法纠错或删除。这是 7/31 明确信号，不是从代码臆测出的功能。

**Complexity:** M。先做用户确认式 MVP：新增 `memories[]` 数据模型；记忆候选必须由用户确认后落库；提供查看/编辑/删除；PromptBuilder 按全局稳定偏好与当前 book/quote 相关性选择少量注入。补 sanitize、导入导出、删除和 prompt 测试。

**Files:** `app_server.py:206-213,712-770,2555-2587,2623-2681`；`app.js:6-14,389-402`；`index.html`；相关 tests。

**northstar:** 高——直接增强 Theme 2 的长期探讨连续性与用户控制。→ promoted to OPT-148

---

### E237 — 清空探讨 DELETE 失败被吞掉，调用方仍清空本地 UI，刷新后历史重新出现 (S)

**What (verified):** `app.js:5357-5380` 的 `clearChatHistory()` 在 catch 中只显示 toast，没有 throw 或失败返回值。`chat.js:801-814` 的确认回调 await 之后无条件执行 `history = []` 和 `resetMessages()`。只要 DELETE 因网络、鉴权或服务端错误失败，界面仍表现为成功。

**Why it matters:** 用户刚明确执行删除，却看到记录在刷新后“复活”，这是数据控制路径的 false-success。修复应使 UI 只在服务端确认后变更，并在失败时保留当前消息供重试。

**Complexity:** S。`clearChatHistory()` 失败后重新抛出或返回 boolean；调用方仅在成功时 reset；补失败/成功两条前端回归测试。

**Files:** `app.js:5357-5380`；`chat.js:801-814`；`tests/frontend/`。

**northstar:** 中——保护探讨数据控制的可信度。→ promoted to OPT-149

---

### E238 — 复用书籍 combobox 只搜书名/作者，与书单搜索的 tags/notes/review/短评口径分叉 (S)

**What (verified):** 书单 `matchBooks()` 已检索 title、author、tags、notes、review、doubanComment（`app.js:1491-1500`）；但用于新增记录、摘抄和建立关联的 `filteredBooks()` 仍只做 title/author 的小写 substring 匹配（`app.js:5432-5441`）。`index.html:535-539,560-564,758-766,788-796` 显示这一 combobox 被多个核心表单复用。

**Why it matters:** 用户已通过标签/简介按主题找书，但进入“给某本成长主题书补摘抄/建立关联”时，同一个主题词又找不到，检索能力在浏览与操作入口之间不一致。当前无直接任务失败 signal，因此先留探索池，不提拔。

**Complexity:** S。抽取统一 `bookMatchesQuery()`，让 matchBooks 与 combobox 共用字段口径；同时保留 wishlist 过滤和“在读优先”排序。

**Files:** `app.js:1491-1500,5418-5441`；相关 combobox 前端测试。

**northstar:** 弱中——减少为书绑定记录/摘抄/关联时的检索摩擦，但缺直接 signal。

---

### E239 — 自制 book/quote combobox 只有鼠标/触摸选择，无 combobox 语义与键盘导航 (S-M)

**What (verified):** 六个输入框均为普通 text input + ul，未设置 `role=combobox`、`aria-expanded`、`aria-controls` 或 listbox/option 语义（`index.html:535-539,560-564,758-766,788-796`）。初始化逻辑只监听 focus、input、blur，以及 mousedown/touchstart 选项（`app.js:5418-5505,5533-5621`）；没有 ArrowDown、ArrowUp、Enter、Escape 或 active descendant 管理。

**Why it matters:** 键盘和屏幕阅读器用户无法得知下拉状态，也不能用方向键选择。项目已有 a11y 基线，但 roadmap 当前对无真实 a11y signal 的项统一 parked，因此记录为 P3 方向，不挤占产品信号项。

**Complexity:** S-M。为 input/list/options 加 WAI-ARIA combobox/listbox 语义，维护 highlighted index 与 aria-activedescendant，支持方向键、Enter、Escape；两套 book/quote combobox 共用 helper 与测试。

**Files:** `index.html:535-539,560-564,758-766,788-796`；`app.js:5418-5505,5533-5621`；`tests/frontend/a11y-baseline.test.js`。

**northstar:** 弱——无当前 a11y signal，保留为 P3 code/UX health。

---

> 本次 run 新发现 4 条：E236（显式长期记忆，M，强 signal）、E237（清空探讨 false-success，S，明确 correctness）、E238（书籍 combobox 检索字段分叉，S）、E239（combobox 键盘/ARIA 缺口，S-M）。提拔 OPT-148 与 OPT-149；其余留探索池。所有断言均核对当前 `feature/agent` 源码并标注 file:line。

## 2026-08-09

> 扫描焦点：OPT-148 合入后的长期记忆恢复完整性、召回截断策略、提示词契约与写入失败语义。基于最新 `feature/agent`，核对 backlog、triage、roadmap、signals、当前源码和目标为 `feature/agent` 的 open PR。PR #111 仅覆盖 OPT-150 书卡摘抄页码回退，与本轮方向无重叠；E236/OPT-148 已实现的“记忆 MVP”本身不重复登记，本轮只记录合入后新暴露的边界。

### E240 — 备份导入静默丢弃 `memories` 与 `customQuoteTags`，长期资产无法可靠恢复 (S)

**What (verified):** 轻量备份 `exportData()` 会完整执行 `JSON.stringify(state)`（`app.js:4440-4448`），完整账号导出也把 state 放在 `.state`。但恢复入口 `resolveImportedState()` 仅传递 books、sessions、quotes、chatHistories、chatContexts、connections（`app.js:4585-4604`），遗漏 `memories` 和 `customQuoteTags`；随后 `normalizeStateShape()` 对缺失字段回落为空数组（`app.js:392-405`）。`stateContentCount()` 与成功摘要也只统计书籍、记录、摘抄、关联和聊天（`app.js:4607-4637`），所以导入不会提示这两类长期资产被清空。

**Why it matters:** 这是可复现的数据恢复缺口：用户拿应用自己生成的有效备份恢复账号，书和摘抄仍在，却失去所有确认记忆与自定义标签词表。它直接违背 2026-07-31 “记忆可控且跨会话保留”的 signal，也削弱导入导出这条数据安全路径的可信度。

**Complexity:** S。恢复时显式保留两个数组，将它们纳入缩减确认和导入结果摘要；补轻量与完整账号导出两种格式的恢复测试。

**Files:** `app.js:392-405,4440-4448,4585-4637`；相关 frontend tests。

**northstar:** 高——保护长期回顾资产与备份可信度。→ promoted to OPT-151

---

### E241 — 记忆截断取“最早 8 条”，第 9 条起的最新确认记忆永久不进 prompt (S)

**What (verified):** `saveMemory()` 对新增和编辑都先过滤旧项，再用 `state.memories.push(memory)` 放到数组末尾（`app.js:416-427`）。PromptBuilder 按原数组顺序收集匹配记忆（`app_server.py:2655-2661`），然后直接使用 `context_memories[:8]`（`app_server.py:2690-2692`），没有按 `updatedAt` 或上下文相关性排序。

**Why it matters:** 当全局记忆达到 8 条，用户刚确认的第 9 条偏好、目标或待办不会出现在任何后续对话里；编辑已有记忆还会将它移到数组末尾并可能使其“消失”。这不是容量上限提示，而是 UI 显示已保存、Agent 实际永远收不到的 false-success。

**Complexity:** S。按 quote/book/global 相关性和 `updatedAt` 倒序排序后取 8 条；补 9+ 条、编辑重排和上下文优先级测试。

**Files:** `app.js:416-427`；`app_server.py:2655-2692`；相关 agent tests。

**northstar:** 高——保证用户最新确认的稳定认识真正被召回。→ promoted to OPT-152

---

### E242 — Prompt 注入了 `confirmed_memories`，系统规则却从未说明其权威性与使用方式 (S)

**What (verified):** Prompt payload 已包含 `confirmed_memories`（`app_server.py:2690-2705`），但 `build_system_instruction()` 的公共规则只逐项解释 `all_books_summary` 与 `existing_connections`（`app_server.py:2709-2718`），全文没有说明 confirmed_memories 的字段语义、何时引用、冲突时以最新用户消息为准，或不得把记忆当成系统指令。

**Why it matters:** 字段名能让模型猜到大意，却不能稳定兑现产品承诺：偏好可能被忽略，todo 可能被误当成已经完成的事实，旧记忆与当前消息冲突时也没有明确优先级。当前已有 XML 边界把整段标为 user_data，但缺少行为契约会让召回效果依赖模型偶然理解。

**Complexity:** S。在 common rules 中补 confirmed_memories 的数据语义、引用边界、冲突优先级与 todo 口径；补 prompt 文案契约测试。

**Files:** `app_server.py:2690-2718`；相关 agent prompt tests。

**northstar:** 中——提高长期记忆召回的可预测性；当前暂无具体误用 signal，先留探索池。

---

### E243 — 记忆保存/删除先改本地 state 再同步，失败会留下“界面未更新但下一次写入可能补做”的幽灵变更 (S-M)

**What (verified):** `saveMemory()` 在 `await syncState()` 前已替换并 push 记忆（`app.js:416-424`）；删除点击路径同样先 filter，再 await，且没有 try/catch（`app.js:6125-6139`）。普通网络失败时 `syncState()` 会抛错但不恢复调用前快照（`app.js:1108-1137`）。保存按钮包装器只负责禁用状态，删除路径的 rejected Promise 还会成为未处理异常。

**Why it matters:** 请求失败后列表可能暂时看起来未变，但内存 state 已被修改；用户随后保存书籍或摘抄时，下一次全量 `PUT /api/state` 会把此前“失败”的记忆新增/删除一起提交，造成延迟发生且无法解释的变更。删除是用户控制长期记忆的关键路径，语义必须原子化。

**Complexity:** S-M。记忆写操作保存旧数组快照，只有同步成功才刷新 UI；失败时回滚并 toast。更稳妥的长期方案是抽取统一 transactional state mutation helper，供其他先改 state 再 sync 的路径复用。

**Files:** `app.js:1108-1137,416-427,6125-6139`；相关 frontend tests。

**northstar:** 中——保障长期记忆控制的可信度；可与后续全局 state mutation 原子化一起处理，暂不提拔。

---

> 本次 run 新发现 4 条：E240（备份恢复丢失 memories/customQuoteTags，S，数据完整性）、E241（8 条截断让最新记忆永久不进 prompt，S，召回正确性）、E242（confirmed_memories 缺系统规则，S，Agent 可控性）、E243（记忆写失败留下幽灵本地变更，S-M，错误处理）。提拔 OPT-151 与 OPT-152；其余留探索池。所有断言均核对当前 `feature/agent` 源码并标注 file:line。

## 2026-08-10

> 扫描焦点：Agent action 确认卡的渲染安全与拒绝失败语义，以及最新 OCR 行核对组件的文本正确性和可访问性。基于最新 `feature/agent` 核对 backlog、triage、roadmap、signals、当前源码与 open PR。已排除：PR #112 / OPT-151（备份恢复）、OPT-152（记忆截断）、OPT-153（OCR 删除撤销）、OPT-154（双击缩放）及 E242/E243 的既有记忆边界，本次不重复登记。

### E244 — tag action 的标签未转义即进入确认卡 innerHTML，可触发 DOM 注入 (S)

**What (verified):** `_showNextAgentAction()` 将包含 `renderActionText(action)` 的模板赋给 `container.innerHTML`（`chat.js:955-971`）。`renderActionText()` 对 add_note、add_book、question 和 link_thought 都调用 `escapeHtml()`，但 tag 分支直接返回 `(d.tags || []).join("、")`（`chat.js:1034-1043`）。后端 `ActionValidator` 在 schema 校验后原样保留 data（`app_server.py:2984-3021`），模型生成的 action 随后被持久化并回传（`app_server.py:5600-5610`），没有 HTML 编码步骤。

**Why it matters:** 用户输入可影响模型建议的标签；若标签包含 `<img onerror=...>` 等 HTML，它会在“确认执行”卡片出现时立即被浏览器解析，甚至无需用户批准 action。相邻 action 类型均已转义，说明 tag 是单一漏网分支，不是既定信任边界。

**Complexity:** S。tag 分支对每个标签调用 `escapeHtml(String(tag))` 后 join；补恶意标签只显示文本、不创建 DOM 元素的回归测试。更彻底的后续方案是使用 DOM API 和 `textContent` 构造确认卡。

**Files:** `chat.js:955-971,1034-1043`；`app_server.py:2984-3021,5600-5610`；相关 frontend tests。

**northstar:** 中——保护 Agent 探讨入口的完整性和用户信任。→ promoted to OPT-155

---

### E245 — reject action 请求失败被吞掉，UI 仍声称“已忽略”并推进下一项 (S)

**What (verified):** 忽略按钮先调用 `POST /api/agent-actions/{id}/reject`（`chat.js:1008-1016`），catch 只输出 console（`chat.js:1017-1019`）。之后无条件执行 `container.remove()`、插入“⏭ 已忽略”系统消息并调用 `_showNextAgentAction(remaining)`（`chat.js:1020-1022`）。

**Why it matters:** 网络、鉴权或服务端异常时，服务端 action 仍未被拒绝，但页面永久移除唯一的处理入口并展示成功文案；用户无法在当前会话重试，也不知道服务端仍保留待处理状态。这与 OPT-149 已修复的“清空失败仍清空 UI”属于同类 false-success，但作用于独立的 Agent action 状态机，历史条目未覆盖。

**Complexity:** S。失败时恢复按钮、`handled=false`、显示重试文案并停止队列；只有 reject 成功才移除卡片和显示下一项。补成功/失败回归测试。

**Files:** `chat.js:1008-1022`；相关 frontend tests。

**northstar:** 中——保证用户拒绝 Agent 写操作的控制权真实生效。→ promoted to OPT-156

---

### E246 — OCR 行回写使用无分隔拼接，拉丁文字跨物理行时会把相邻单词粘连 (S)

**What (verified):** `renderOcrLineSelector()` 对每个物理行先执行 `rawLine.trim()`（`app.js:2689-2703`），去掉行尾空格；`rebuildQuoteContentFromOcrPanel()` 再用 `parts.join("")` 合并同段各行（`app.js:2664-2678`）。中文排版通常可以直接拼接，但英文文本如 `"This is"` 与 `"a book"` 会变成 `"This isa book"`；用户只要编辑或删除任一行触发重建，就会把原本可读的 OCR 文本写坏。

**Why it matters:** 当前应用以中文阅读为主，但书名、原文和 OCR 内容并不保证全是中文。无条件空串拼接把“去除 OCR 物理换行”的合理目标扩大成“删除所有词间边界”；这是文本正确性问题，不应依赖用户逐处补空格。

**Complexity:** S。合并相邻行时按边界字符决定是否补空格：中文/标点相接保持空串，两个拉丁字母或数字边界之间插入一个空格；补中英文混排、标点、跨页分段测试。

**Files:** `app.js:2664-2678,2689-2703`；相关 OCR frontend tests。

**northstar:** 弱中——保护 OCR 原文准确性，但暂无真实英文 OCR 失败 signal，先留探索池。

---

### E247 — OCR 删除按钮的 accessible name 全部相同，读屏用户无法判断将删除哪一行 (S)

**What (verified):** 行输入框使用“第 N 行内容”的编号标签，但每个相邻删除按钮都固定为 `aria-label="删除此行"`（`app.js:2711-2717`）。多行面板可一次生成数十个完全同名按钮；按钮自身只有视觉字符“✕”，accessible name 不包含行号或内容预览。

**Why it matters:** 屏幕阅读器的按钮列表会重复播报“删除此行”，用户无法区分目标，只能在 textarea 与按钮间反复导航并记忆位置。当前 roadmap 对无直接 a11y signal 的方向统一 parked，因此只记录，不提拔。

**Complexity:** S。生成按钮时使用 `aria-label="删除第 N 行：<短预览>"`，预览需安全截断；删除后若保留编号语义，应同步更新剩余按钮标签。补 accessible-name 测试。

**Files:** `app.js:2711-2717,2730-2738`；相关 frontend a11y tests。

**northstar:** 弱——无当前辅助技术使用 signal，保留为 accessibility health。

---

> 本次 run 新发现 4 条：E244（Agent tag 确认卡 DOM 注入，S，渲染安全）、E245（忽略 action false-success，S，错误处理）、E246（英文 OCR 行拼接丢空格，S，文本正确性）、E247（OCR 删除按钮无法被读屏区分，S，无障碍）。提拔 OPT-155 与 OPT-156；其余留探索池。所有断言均核对当前 `feature/agent` 源码并标注 file:line。

## 2026-08-13

> 扫描焦点：Theme 3「积累可信」下快速识别核对的已合入撤销实现，以及 OCR 临时卡取消后的持久化边界。已核对当前 backlog、triage、roadmap、signals、8/10 Explore 与本地最近历史：OPT-153/154 已分别由 `e7e108c`/`6ec326b` 合入，OPT-155/156 已分别由 `d2e3832`/`e14f0ac` 合入；本节不重复登记它们或 E246/E247。GitHub/open PR 数据按任务前提不可用；`git fetch origin feature/agent` 因隔离 clone 无法写 `.git/FETCH_HEAD` 失败，故不分配未经远端确认的下一个 OPT 编号。

### E248 — OCR 连续删除只保留最后一次的撤销句柄，前一次误删会立刻变成不可恢复 (S)

**What (verified):** `renderOcrLineSelector()` 只以单个局部变量 `lastDeletedLine` 保存删除记录（`app.js:2692`）。每次删除都直接覆盖它（`app.js:2749-2753`），撤销入口也只恢复该一个 row，随后立即清空变量（`app.js:2731-2740`）。因此用户连续删 A、B 后只能撤销 B；A 已从 DOM 移除且没有历史栈。现有回归测试只验证“最后一行删除后仍有撤销入口”（`tests/frontend/ocr-line-selector.test.js:274-281`），未覆盖连续误删的完整恢复。

**Why it matters:** 8/09 owner 的直接 signal 是核对 OCR 时误删一行后必须重跑识别；OPT-153 的目标正是让删除在最终保存前可恢复。逐行核对本身常会连续点删，单级撤销把这一直接反馈只修到第一步：第二次操作后第一次误删又不可逆，仍会迫使用户重新 OCR。

**Complexity:** S。将单条 `lastDeletedLine` 换成按删除顺序保存的栈，撤销按钮逐次恢复最近一行；维持原索引和分段，补“连续删除两行→连续撤销两次”“删至空→全部恢复”测试。

**Files:** `app.js:2692,2731-2761`; `tests/frontend/ocr-line-selector.test.js:254-281`。

**northstar:** 高——直接补齐当前 Theme 3 下 owner 已报告的 OCR 结果可恢复性。

---

### E249 — 少于 3 行的快速 OCR 结果被硬性隐藏行级核对面板，恰好两行时无法逐行删除或编辑 (S)

**What (verified):** 非空 OCR 行少于 3 时，`renderOcrLineSelector()` 直接隐藏并清空面板、解绑事件（`app.js:2705-2710`）；只有 3 行及以上才生成每行 textarea 与删除按钮（`app.js:2712-2729`）。测试明确把“两行应隐藏”固化为预期（`tests/frontend/ocr-line-selector.test.js:184-189`）。因此一张只识别到两物理行的照片，用户只能回到整段文本框，不能使用“点 ✕ 删除”这一快速核对方式。

**Why it matters:** 8/09 的 owner signal 要求 OCR 结果核对中的误删可恢复，6/16 的原始 signal 则是希望“逐行快速删除”。行数阈值不是由数据完整性约束决定；两行短摘抄同样需要逐行保留、编辑或删除，当前入口按识别行数产生不一致行为。

**Complexity:** S。将面板启用阈值降为至少 1 条非空行，同时保留零行隐藏、全部删除后的撤销；更新两行测试并覆盖一行编辑/删除/撤销。

**Files:** `app.js:2695-2729`; `tests/frontend/ocr-line-selector.test.js:184-211`。

**northstar:** 中——减少拍照摘抄后的核对摩擦，延续已验证的“采集顺滑/积累可信”路径。

---

### E250 — 取消 OCR 临时卡时删除同步失败被静默吞掉，本地与服务端会暂时分叉 (S-M)

**What (verified):** 关闭未保存的 OCR 对话框会调用 `discardProvisionalOcrQuote()`（`app.js:6078-6080`）。该函数先从内存 `state.quotes` 和 `state.connections` 移除临时卡（`app.js:2769-2773`），再执行 `syncState().catch(() => {})`（`app.js:2774-2776`）。普通网络失败时 `syncState()` 会抛出且只对 `state_conflict` 做恢复（`app.js:1115-1144`），所以这里既不回滚、也不提示用户；现有取消测试把 `syncState` 替换为空成功函数（`tests/frontend/ocr-cancel-cleanup.test.js:67-84`），未覆盖失败路径。

**Why it matters:** OCR 临时卡已经由服务端创建并保存，取消语义必须可靠。若删除请求失败，当前页看似已取消，刷新后卡片会重新出现；更糟的是随后任意全量 `PUT /api/state` 可能把这次未告知的本地删除补写到服务端。它与 E243 的长期记忆失败边界不同，发生在刚完成拍照识别、用户明确选择取消的 Theme 3 数据控制路径。

**Complexity:** S-M。取消前保留 quotes/connections 快照；同步失败时恢复快照、重渲染并提示“取消未保存，请重试”，或在成功后才提交本地删除；补网络失败与 state-conflict 两条回归测试。

**Files:** `app.js:2766-2776,1115-1144,6078-6080`; `tests/frontend/ocr-cancel-cleanup.test.js:67-84`。

**northstar:** 中——保证拍照摘抄的取消操作与真实持久化状态一致，保护积累可信度。

---

> 本次 run 新发现 3 条：E248（连续删除撤销栈，S，owner OCR 直接 signal）、E249（1-2 行 OCR 缺行级核对，S，OCR 交互一致性）、E250（取消临时 OCR 卡同步失败被吞，S-M，数据控制）。E248 证据最强但未提拔：隔离 clone 禁止写入 `.git/FETCH_HEAD`，无法确认远端 `feature/agent` 的当前最大 OPT 编号；为避免编号冲突，本轮只追加 explore。

## 2026-08-14

> 扫描焦点：最新 Theme 3 owner signals 的可执行边界，以及“我的”抽屉的可访问性。基线为 `origin/feature/agent` / `7997e0e`；当前任务前提明确 GitHub open PR 数据不可用，未臆造 PR 状态。已排除：OPT-157 已在本日 triage 中占用“我的”主页入口前置；E192/E198 的记录页替代方向、E243 的记忆同步失败、E248-E250 的 OCR 边界均为旧 explore 项，不重复登记。

### E251 — 摘抄卡把拍摄原图固定为顶部封面，3:1 裁切与 owner 的回顾视觉偏好冲突 (S-M)

**What (verified):** `renderQuotes()` 对每条有 `quote.imageUrl` 的卡片都无条件插入图片（`app.js:2091-2095`）；`.entry-card-cover` 固定 3:1，而图片统一 `object-fit: cover`（`styles.css:1271-1273,1289-1294`）。图片加载失败时才隐藏 `<img>`，没有正常加载时的纯色或轻量视觉分支。`optimization/signals.md:60-66` 记录 owner 已直接指出该拍摄照片封面“不好看”，希望改回纯色或其他更有趣的设计。

**Why it matters:** 摘抄页是回顾和浏览入口，原始拍摄图可在详情里承担溯源作用，却不必主导卡片墙的第一视觉层；目前实现使该直接 signal 持续出现。

**Complexity:** S-M。默认使用与类型/书籍信息协调的纯色或轻量图形，保留详情原图；或提供清晰的显示策略。需在 iPhone 12 验收有图、无图、失效图三类卡片。

**Files:** `app.js:2081-2106,3099-3145`；`styles.css:1260-1323`；相关 frontend tests。

**northstar:** 高——直接回应当前 owner signal，改善高频摘抄回顾入口。→ promoted to OPT-158

---

### E252 — 账号抽屉声明为 modal，但没有焦点进入、焦点约束或键盘关闭路径 (S)

**What (verified):** 抽屉以 `<div role="dialog" aria-modal="true">` 呈现（`index.html:252-255`），但 `openMeDrawer()` 只添加两个 `is-open` class（`app.js:1385-1390`），`closeMeDrawer()` 只移除 class（`app.js:1392-1396`）。现有事件仅绑定头像打开、遮罩点击关闭（`app.js:6172-6173,6194`）；当前 `app.js` 中没有针对该抽屉的 Escape、首次焦点或关闭后归还焦点处理。

**Why it matters:** `aria-modal` 不会自动移动或限制键盘焦点。键盘和读屏用户可继续落到被遮罩的页面控件，也不能用 Escape 关闭抽屉；OPT-157 将让此入口更常被打开，modal 基础行为需要与可发现性改造同步可靠。

**Complexity:** S。打开时保存触发元素并将焦点移至抽屉内首个可操作元素；处理 Escape 与 Tab 循环；关闭后恢复触发元素。补键盘回归测试。

**Files:** `index.html:252-355`；`app.js:1385-1396,6172-6199`；相关 frontend a11y tests。

**northstar:** 弱-中——不直接新增功能使用，但避免 Theme 3 高价值入口对键盘/读屏用户不可操作；不提拔。

---

### E253 — 长期记忆表单的类型与内容输入缺少可访问名称 (S)

**What (verified):** 长期记忆区把 `<select name="kind">`、`<input name="content">` 和保存按钮直接并列在一行（`index.html:295-301`）；二者均没有关联 `<label>`、`aria-label` 或 `aria-labelledby`。输入框只有 placeholder 示例。渲染列表虽会显示已有记忆类型和内容（`app.js:410-415`），但新建/编辑时读屏用户无法获知下拉框和输入框的语义。

**Why it matters:** 长期记忆是 Theme 3 的用户可控资产，OPT-157 正在提升其入口可见性；若表单本身不可清楚理解，前置入口无法兑现“可查看、可编辑、可删除”的承诺。

**Complexity:** S。为类型选择和内容输入补可见或仅读屏 label；编辑态同步说明当前正在修改哪条记忆；补 accessible-name 测试。

**Files:** `index.html:295-301`；`app.js:410-430,6174-6192`；相关 frontend a11y tests。

**northstar:** 弱-中——提升当前 Theme 3 核心资产的可操作性，但暂无辅助技术真实 signal；不提拔。

---

> 本次 run 新发现 3 条：E251（摘抄卡固定原图封面，owner 直接视觉 signal）、E252（账号抽屉 modal 键盘焦点缺口）、E253（长期记忆表单 accessible name 缺失）。OPT-157 已由本日 triage 指派，未重复；当前 `HEAD` 与 `origin/feature/agent` 同为 `7997e0e`，现有最大编号为 OPT-157，故仅将直接 signal 且边界明确的 E251 提拔为 OPT-158。

## 2026-08-15

> 扫描焦点：昨日合入的“我的”主页长期记忆管理边界。基线为 `HEAD` / `origin/feature/agent` 的 `63d4e09`；任务前提说明 GitHub open PR 数据不可用，因此不臆造 PR 状态。已排除：OPT-157 已完成主页入口前置，OPT-158 已覆盖摘抄卡封面；E243 的同步失败原子性、E252 的抽屉焦点、E253 的表单 accessible name 均为旧 Explore 项，本节不重复。

### E254 — 未登录状态可直接提交长期记忆表单，认证守卫只覆盖相邻的 Excel 入口 (S)

**What (verified):** “我的”主页始终渲染长期记忆表单（`index.html:255-267`）。相邻 Excel 按钮点击时先调用 `requireMeHomepageAuth()`（`app.js:6389-6393`），该守卫会在未登录时打开账号抽屉（`app.js:1423-1426`）；但记忆表单 submit 直接调用 `saveMemory()`，没有同一守卫（`app.js:6394-6397`）。`saveMemory()` 会先修改本地 `state.memories` 再请求同步（`app.js:432-444`），所以匿名用户填完内容后才从失败请求得知不能保存。

**Why it matters:** OPT-157 把入口前置是为了提高可发现性，但同一区域的两个需要账号的工具给出不同的未登录反馈。记忆内容可能是用户认真写下的偏好或目标；提交后才失败会浪费输入，也会落入 E243 已记录的本地幽灵变更风险。这里登记的是新主页的认证入口不一致，不重复 E243 的网络失败原子性。

**Complexity:** S。submit 前复用 `requireMeHomepageAuth()`；未登录时保留已输入内容并打开登录抽屉。补“匿名提交不调用 `saveMemory`、输入不清空、抽屉打开”的前端测试。

**Files:** `index.html:255-267`；`app.js:432-444,1423-1426,6389-6397`；`tests/frontend/me-homepage-entry.test.js:41-47`。

**northstar:** 弱-中——减少高价值长期记忆入口的首次使用失败，但暂无 owner 实际遇到该问题的 signal，暂不提拔。

---

### E255 — 长期记忆列表把内部 `kind` 枚举原样显示为英文代码 (S)

**What (verified):** 表单把四种类型以中文选项呈现，但提交值分别是 `preference`、`viewpoint`、`goal`、`todo`（`index.html:261-265`）。列表渲染时直接输出 `memory.kind`，没有中文映射（`app.js:424-429`）。因此成功保存后，用户看到的是 `preference 我希望……`，而不是刚刚选择的“偏好”。

**Why it matters:** 长期记忆是 Theme 3 的用户可查看、可编辑资产；把存储枚举暴露到中文界面会降低扫读效率，也让“保存前选中文、保存后变英文”的反馈不连续。问题来自当前实际模板和渲染函数，不是假设文案。

**Complexity:** S。增加受控的 kind→中文标签映射，未知值回退为“其他”或安全显示；列表和编辑态共用同一映射，并补四种类型及未知值测试。

**Files:** `index.html:261-265`；`app.js:424-429`；`tests/frontend/me-homepage-entry.test.js:11-39`。

**northstar:** 弱-中——提升长期记忆的可读性与资产感，但没有直接 signal，只留探索池。

---

### E256 — 删除长期记忆无确认且立即持久化，误触没有恢复路径 (S)

**What (verified):** 每条记忆都在行内渲染“删除”按钮（`app.js:424-429`）。点击后事件分支立即从 `state.memories` 过滤目标并调用 `syncState()`（`app.js:6398-6413`），没有 `showConfirmDialog()`、撤销栈或软删除。项目已有通用确认组件 `showConfirmDialog()`（`app.js:3844-3867`），书籍、记录、摘抄和关联删除均调用该组件（如关联删除 `app.js:6039-6053`），长期记忆是当前例外。

**Why it matters:** 已确认记忆会被后续探讨召回，是用户长期积累的偏好、观点、目标和待办；行内“编辑/删除”相邻，移动端误触会永久丢失且没有恢复入口。与 E243 的“同步失败后本地状态分叉”不同，本项关注同步成功时的误删保护。

**Complexity:** S。删除前调用现有确认组件，文案包含类型和截断后的内容预览；取消不改 state，确认后沿用现有同步路径。补取消/确认两条前端测试。

**Files:** `app.js:424-429,3844-3867,6039-6053,6398-6413`；相关 frontend tests。

**northstar:** 中——保护长期记忆这一 Theme 3 用户资产，但暂无误删 signal，证据不足以挤占已有直接 signal 的 OPT-158，本轮不提拔。

---

> 本次 run 新发现 3 条：E254（主页记忆入口缺未登录守卫，S，错误处理）、E255（内部 kind 英文码泄漏到中文列表，S，UX）、E256（长期记忆删除无确认或撤销，S，数据控制）。三项均核对当前代码并排除 backlog、最近合并历史和旧 Explore 重复；因缺少直接 owner signal，本轮不新增 OPT。

## 2026-08-16

> 扫描焦点：最新合入的“深度共读”工作台之任务生命周期与前端状态边界。基线为 `HEAD` / `origin/feature/agent` 的 `bccbbb2`；任务前提说明 GitHub open PR 数据不可用，因此不臆造 PR 状态。已核对 backlog、triage、roadmap、signals、旧 Explore 与最近提交：深度共读由 `55fb0c7` 首次合入，现有 OPT-001–158 和 E001–256 均未覆盖下列边界。

### E257 — 深度共读启动异常会遗留永久 `CREATED` 任务，历史列表持续显示“任务已创建” (S)

**What:** POST 端点先调用 `research_store().create()` 持久化任务，再启动 Gateway/runner；后两步任一抛错时只回 500，没有把已经创建的 run 标记失败或删除。历史查询没有排除这种任务，它会永久保留在列表中。

**Evidence:** `app_server.py:4985-4993` 明确按 create → `ensure_research_gateway()` → `research_runner().start()` 执行，通用 `except Exception` 只发送错误响应；`deep_reading.py:179-191` 在 create 内写入 status=`CREATED` 并 commit；`deep_reading.py:212-229` 的 list 直接返回这些记录。当前测试 `tests/agent/deep_reading_api_test.py:66-85` 覆盖成功创建、读取、列表与取消，未覆盖 create 后启动异常的状态收口。

**Why:** 这不是纯日志卫生。用户点击失败后会在“最近的深度共读”持续看到一个永不推进、也无法从 UI 删除的任务，无法区分仍在排队还是已经失败，削弱研究历史的可信度。

**Size:** S

**Files:** `app_server.py:4985-4993`; `deep_reading.py:149-193,298-313`; `tests/agent/deep_reading_api_test.py`

**Northstar:** 中——深度共读是“回顾有价值”的新入口；任务历史必须准确反映结果。启动失败时立即 `fail(run_id, error)`，可把一次基础设施错误收口为可解释、可重试的失败。→ **promoted to OPT-159**

### E258 — 取消只改数据库状态，运行中的 Harness 仍继续；结束时还能为已取消任务创建待确认 action (M)

**What:** cancel API 仅把 run 标成 `CANCELLED`，没有中断 runner。后台线程在长耗时 `harness.run()` 返回后，先执行 `on_complete` 持久化 proposals/action，最后才调用会检查取消状态的 `store.complete()`；因此已取消任务仍可能消耗完整模型调用，并留下不可见的待确认 action。

**Evidence:** `deep_reading.py:233-250` 的 `cancel()` 只更新 SQLite；`deep_reading.py:362-426` 启动 daemon thread，`harness.run()` 前后没有 cancel 检查，并在 line 424-425 先调用 `on_complete`；`deep_reading.py:281-296` 只有 `complete()` 在 status=`CANCELLED` 时 return。`app_server.py:3543-3581` 的 `persist_research_proposals()` 会创建 trace 与 `PENDING_APPROVAL` action，不检查 run 是否已取消。

**Why:** “取消任务”当前只取消界面结果，不取消成本和副作用。长任务取消后继续占用 DeepSeek tokens 已违背按钮语义；更严重的是 action 已写入通用状态机，却不会出现在取消任务的结果卡中，形成隐藏待处理数据。

**Size:** M

**Files:** `deep_reading.py:233-250,362-426`; `app_server.py:3510-3581`; `tests/agent/deep_reading_runtime_test.py`; `tests/agent/deep_reading_store_test.py`

**Northstar:** 强——直接保护深度回顾入口的用户控制权、成本与数据副作用边界。最低限度应在 `harness.run()` 后、`on_complete` 前再次检查取消；完整方案再向 Harness 传递可中断句柄。→ **promoted to OPT-160**

### E259 — capability 失败与通用错误处理互相覆盖，按钮可显示可点击但提交静默无响应 (S)

**What:** capability 判定不可用时会设置 `runtimeAvailable=false` 并禁用开始按钮；但任一后续请求错误进入通用 `handleError()` 后都会无条件重新启用按钮。此后 submit 因 `!runtimeAvailable` 直接 return，用户点击看不到任何新反馈。

**Evidence:** `chat.js:1170-1181` 保存不可用状态并 disabled；`chat.js:1235-1242` 的通用错误处理无条件 `startBtn.disabled=false`；`chat.js:1262-1271` 对不可用 runtime 静默 return。历史读取、轮询、取消和 action 审批均可能调用同一个 `handleError()`（`chat.js:1282-1315`）。

**Why:** 环境未部署是该功能的明确产品状态，不应被一次无关网络错误改成“看似能点、实际无动作”。这会把可解释的不可用降级为无反馈死按钮。

**Size:** S

**Files:** `chat.js:1170-1185,1235-1242,1262-1271`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 中——让新回顾入口在不可用时保持诚实、可理解；但属于 E257/E258 之后的前端收口，本轮不提拔。

### E260 — 切换账号不清理旧任务轮询，旧 timer 会以新账号查询并覆盖新会话状态 (S)

**What:** 用户变化事件会清空 `activeRun`，但没有 `clearTimeout(pollTimer)`。旧账号 RUNNING 任务已排定的轮询随后用新 token 请求旧 run，收到 404 后把新账号工作台写成失败状态，并重新启用开始按钮。

**Evidence:** `chat.js:1221-1232` 为运行中任务每 1.5 秒设置 `pollTimer`；`chat.js:1319-1327` 的 `paper-reading-user-changed` 处理未清 timer；失败会进入 `handleError()` 改写 status/button（`chat.js:1235-1242`）。服务端按当前 user_id 查询 run，旧任务对新账号必然不可见（`app_server.py:4391-4402`）。

**Why:** 多账号切换不是高频场景，但状态污染是确定性的：新账号会看到与自己无关的“Research run not found”，并可能与 capability 加载形成按钮竞态。

**Size:** S

**Files:** `chat.js:1221-1242,1319-1327`; `app_server.py:4391-4402`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 弱-中——改善账号切换后的错误隔离；没有真实 signal，保留探索池。

> 本次 run 新发现 4 条：E257（启动异常遗留永久 CREATED，S，任务历史 correctness）、E258（取消不停止执行且可生成隐藏 action，M，用户控制/成本）、E259（capability 与错误处理冲突，S，错误反馈）、E260（账号切换遗留旧轮询，S，状态隔离）。提拔 OPT-159 与 OPT-160；其余留探索池。所有断言均基于当前文件逐行核实，并已排除 backlog、旧 Explore 与最近合并代码中的重复方向。

## 2026-08-17

> 扫描焦点：当前 Theme 3「积累可信」与新合入深度共读的跨请求可靠性。远端 `feature/agent` 与本地 HEAD 均为 `229fa7b`；GitHub open PR 仅 #124（OPT-159）。已核对 backlog、triage、roadmap、signals、E001–260、最近提交及当前代码，以下方向不重复 OPT-159/160、open PR 或旧 Explore。

### E261 — 服务重启会把执行中的深度共读永久留在 `CREATED/RUNNING` (S)

**What:** 深度共读只在请求内启动 daemon thread，任务进度写入 SQLite；进程退出会直接终止线程，但下次启动没有扫描或收口非终态任务。此前已进入 `CREATED` 或 `RUNNING` 的记录因此会永久显示仍在执行。

**Evidence:** `deep_reading.py:362-364` 以 `daemon=True` 启动任务线程；`deep_reading.py:265-279` 把进度持久化为 `RUNNING`。`app_server.py:576-608` 持久化 run/events，但 `app_server.py:6520-6526` 启动流程仅初始化数据库、工具 schema 与 GC，没有恢复或失败化研究任务；全库搜索 `research_runs` 也没有其他启动恢复路径。

**Why:** 部署、崩溃或人工重启都可能发生在长耗时研究期间。用户回来后会看到永不结束且无法判断是否应重试的历史任务，与 Theme 3 的可信积累直接冲突。

**Size:** S

**Files:** `deep_reading.py:265-279,362-364`; `app_server.py:576-608,6520-6526`; `tests/agent/deep_reading_store_test.py`

**Northstar:** 强——深度共读属于回顾入口，持久化历史必须真实反映进程中断。启动时把遗留 `CREATED/RUNNING` 原子收口为 `FAILED`，并写明“服务重启，任务已中断”，即可让用户安全重试。→ **promoted to OPT-161**

### E262 — 创建成功后的首次状态查询未接错误处理，失败一次便停止全部后续轮询 (S)

**What:** POST 成功后直接调用 `loadRun(activeRun.id)`，既未 `await` 也未挂 `.catch(handleError)`；而下一次 timer 只有首次 GET 成功后才会注册。因此首次状态查询若遇到网络错误，Promise rejection 无人处理，界面会停在 POST 返回的 `CREATED` 状态且不再推进。

**Evidence:** `chat.js:1221-1232` 显示 timer 在成功取得 run 后才创建；`chat.js:1271-1284` 的 submit `try` 在 line 1281 裸调用 `loadRun`，异步拒绝不会进入该同步调用所在的 catch。对比历史点击明确使用 `loadRun(...).catch(handleError)`（`chat.js:1296-1299`）。当前 `tests/frontend/deep-reading-workbench.test.js:11-33` 只有静态结构契约，没有首次 GET 失败测试。

**Why:** POST 已成功意味着任务真实在后台运行；一次短暂 GET 失败却让页面永久停止跟踪，会让用户误以为任务卡死，并可能重复启动昂贵研究。

**Size:** S

**Files:** `chat.js:1221-1232,1271-1284`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 中-强——保护新回顾入口的可理解进度与重复成本；可用 `.catch(handleError)` 做最小收口，更完整方案应允许用户重试查询。

### E263 — 切回日常探讨后深度共读仍每 1.5 秒轮询隐藏工作台 (S)

**What:** 模式切换只隐藏 research workspace，没有清理 `pollTimer`；运行中任务会继续请求直到终态，即使用户已经回到日常探讨或离开该面板。

**Evidence:** `chat.js:1140-1168` 的 `setMode("daily")` 仅切换 class/hidden；`chat.js:1221-1232` 每次 RUNNING 响应都无条件续排 1.5 秒 timer。除终态分支与账号变化相关旧缺口外，没有按 mode 暂停轮询的逻辑。

**Why:** 隐藏面板持续轮询增加移动网络、服务端查询与电量消耗；长任务越久越明显。重新进入时按 run id 恢复一次查询即可，无需后台高频刷新不可见 DOM。

**Size:** S

**Files:** `chat.js:1140-1168,1221-1232`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 弱-中——属于性能与移动端资源卫生，没有真实 signal，暂不提拔。

### E264 — 深度共读历史请求缺少上下文版本守卫，慢响应可覆盖新书的历史 (S)

**What:** 每次进入工作台都会按当前 book/quote 发起历史请求，但响应回来时不验证上下文是否仍相同。快速从书 A 切到书 B 时，较慢的 A 响应可以最后写入 `historyList`，让 B 上下文展示 A 的任务。

**Evidence:** `chat.js:1244-1257` 在请求前读取 context 并在返回后直接覆盖 `historyList.innerHTML`；`chat.js:1318-1334` 数据/书摘上下文切换会重新渲染或进入研究模式，但没有 request id、AbortController 或返回时 context 比对。服务端确实按请求 query 过滤（`app_server.py:4367-4379`），因此问题在前端响应时序而非后端越权。

**Why:** 历史是用户判断研究属于哪本书的依据；跨书错位会造成错误选择与理解，尤其在连续从多张书卡进入深度共读时。

**Size:** S

**Files:** `chat.js:1244-1257,1318-1334`; `app_server.py:4367-4379`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 中——保证回顾上下文可信，但缺少真实复现 signal，先保留探索池。

### E265 — 研究列表的 `limit` 非数字会抛未捕获异常，接口无法返回结构化 4xx (S)

**What:** GET 端点把原始 query 字符串直接传入 store；store 立即执行 `int(limit)`，没有参数校验或异常转换。`?limit=abc` 会抛 `ValueError` 越出 handler，而不是返回可解释的 400。

**Evidence:** `app_server.py:4367-4379` 直接传 `query.get("limit", [30])[0]`；`deep_reading.py:212-229` 在 line 222 执行 `int(limit)`，外层无 try/except。`tests/agent/deep_reading_api_test.py:66-85` 只覆盖默认 limit 的成功列表。

**Why:** 当前前端固定传 10，正常路径不触发；但公开 API 的畸形参数不应变成断连和服务端 traceback。该项主要是错误处理与契约健康。

**Size:** S

**Files:** `app_server.py:4367-4379`; `deep_reading.py:212-229`; `tests/agent/deep_reading_api_test.py`

**Northstar:** 弱——没有当前用户影响或 signal，保留为 API health，不提拔。

> 本次 run 新发现 5 条：E261（重启遗留非终态任务，S，可靠性）、E262（首次查询失败后停止轮询，S，错误处理）、E263（隐藏工作台持续轮询，S，性能）、E264（历史响应跨上下文覆盖，S，correctness）、E265（非法 limit 未收口，S，API health）。仅 E261 与当前 Theme 3 的持久化可信直接一致，提拔为 OPT-161；其余证据明确但缺直接 signal，留探索池。

## 2026-08-18

> 扫描焦点：当前 Theme 3「积累可信」下的拍照摘抄裁剪、压缩与 OCR 恢复边界。远端 `feature/agent` 与本地 HEAD 均为 `0db3459`；用户明确提供的唯一 open PR 为 #126（OPT-161）。GitHub CLI 本次因网络不可达，未把无法刷新的 PR 清单伪装成完整证据。已核对 backlog、triage、roadmap、signals、E001–265、最近提交及当前代码；以下方向不重复 OPT-161、#126、已合并代码目标或旧 Explore。

### E266 — 裁剪框只有指针拖拽实现，键盘用户无法移动或缩放裁剪区域 (S-M)

**What:** 裁剪框和两个调整手柄使用普通 `div` / `span`，只有 `aria-label`，没有可聚焦语义；裁剪逻辑只监听指针坐标，没有键盘入口。因此键盘或开关控制用户能打开裁剪弹窗，却只能选择“恢复整张 / 取消 / 使用裁剪图片”，不能实际调整范围。

**Evidence:** `index.html:659-664` 的 `#quoteCropFrame` 是 `div`，两个 `.quote-crop-handle` 是无 `tabindex`、无 `role` 的 `span`；`app.js:5246-5286` 仅通过 `event.clientX/clientY` 处理 move/resize。`styles.css:1939-1969` 只定义鼠标 cursor、`:active` 和视觉手柄，没有 `:focus-visible` 或键盘状态。

**Why:** 裁剪是拍照摘抄进入 OCR 前的新关键步骤。界面已用 accessible name 暗示它可操作，但实际辅助技术无法进入控件，属于语义与行为不一致。可为裁剪框/手柄补可聚焦控件语义，用方向键小步移动、Shift+方向键调整尺寸，并通过 `aria-valuetext` 报告范围。

**Size:** S-M

**Files:** `index.html:656-670`; `app.js:5246-5290`; `styles.css:1939-1969`; `tests/frontend/quote-ocr-fast.test.js`

**Northstar:** 中——直接改善高频“拍照→裁剪→OCR”采集链路的可达性，但当前无辅助技术真实 signal，不提拔。

### E267 — 摘抄图片后台压缩失败被空 catch 吞掉，预览仍显示成功且无可恢复提示 (S)

**What:** 选图后先用 object URL 立即展示预览并提示“图片已载入”，随后后台压缩；两张图片的压缩 rejection 都被空 `catch` 吞掉。失败时 `dataUrl/originalDataUrl` 始终为空，用户仍看到正常预览和裁剪/OCR入口，直到后续裁剪或 OCR `await compressionPromise` 才收到脱离根因的失败反馈。

**Evidence:** `app.js:5359-5381` 与 `app.js:5384-5403` 在创建预览后保存 `compressionPromise`，末尾均为 `.catch(() => {})`；裁剪入口随后直接等待同一 promise（`app.js:5230-5231`），OCR 也直接等待它（`app.js:5438-5444`）。当前 `tests/frontend/quote-ocr-fast.test.js` 覆盖成功压缩/裁剪契约，但全库未找到压缩 rejection 的用户反馈测试。

**Why:** iOS 图片解码、canvas 分配或格式支持失败并非等同于“仍在处理中”。静默吞错会把确定失败伪装成等待态，用户可能反复点击 OCR。最小修复是在 image 对象记录 `compressionError`、更新状态/禁用依赖压缩的动作，并允许重新选图；测试锁定第一张和第二张失败不影响另一张。

**Size:** S

**Files:** `app.js:5230-5231,5359-5403,5438-5444`; `tests/frontend/quote-ocr-fast.test.js`

**Northstar:** 中——保护 Theme 3 的采集可信与错误可恢复性；没有真实压缩失败 signal，本轮不提拔。

### E268 — OCR 恢复 ID 的 localStorage 写入未保护，存储异常可在请求发出前中断识别 (S)

**What:** 读取 OCR request IDs 有 try/catch，但新增和删除 ID 直接调用 `localStorage.setItem()`。浏览器禁用存储、隐私模式或配额异常时，`rememberOcrRequest()` 会在网络请求前抛错，随后外层错误恢复又调用同样可能失败的存储路径；本应只是“无法跨刷新恢复”的降级，会升级成当次 OCR 无法提交或错误处理再次抛出。

**Evidence:** `app.js:1236-1242` 的读取已容错；`app.js:1245-1256` 的 `rememberOcrRequest()` / `forgetOcrRequest()` 写入没有 try/catch。快速/AI OCR 在发请求前调用 `rememberOcrRequest()`（`app.js:5446-5448`），catch 路径调用 `recoverOcrRequest()`，终态或 not-found 又可能进入 `forgetOcrRequest()`（`app.js:1259-1275`）。

**Why:** request ID 本地持久化是增强恢复能力，不应成为 OCR 的硬依赖。将写入封装为 best-effort 并返回是否持久化；当不可用时当次请求照常执行，只明确提示“离开页面后可能无法自动取回”，即可保持核心采集路径可用。

**Size:** S

**Files:** `app.js:1234-1275,5446-5448`; `tests/frontend/quote-ocr-fast.test.js` 或新增 OCR recovery test

**Northstar:** 中——避免浏览器存储限制阻断拍照摘抄核心路径；属于代码核实出的确定异常边界，但无实际发生 signal，不提拔。

> 本次 run 新发现 3 条：E266（裁剪框缺键盘操作，S-M，无障碍）、E267（图片压缩失败被吞，S，错误处理）、E268（OCR 恢复 ID 写入异常阻断识别，S，可靠性）。三项均有当前 `file:line` 证据且已排除 backlog、旧 Explore、最近合并目标与已知 open PR #126；因没有直接 owner signal，且 OPT-161 已是当前 Theme 3 的强证据任务，本轮不新增 OPT。

## 2026-08-19

> 扫描焦点：当前 Theme 3「积累可信」下，深度共读只读 Gateway 是否忠实传递已有摘抄、记录和书籍字段。隔离 clone 中 `HEAD` 与现存 `origin/feature/agent` 引用均为 `61f2e0a`；`git fetch origin feature/agent` 因 `.git/FETCH_HEAD` 只读失败，因此不宣称实时远端已刷新。用户提供的 open PR 证据为空或不可用，本轮不据此推断状态。已核对 backlog、triage、roadmap、signals、E001–268、最近提交及当前代码；以下方向不重复 OPT-001–161、已合并代码目标或旧 Explore。

### E269 — 深度共读阅读时间线导出不存在的 `pages` 字段，起止页与已读页数全部丢失 (S)

**What:** Gateway 的 `get_reading_timeline()` 为每条 session 只挑选 `id/bookId/date/minutes/pages/note/createdAt`，其中 `pages` 并不是当前 session 字段。真实数据使用 `startPage`、`endPage`、`pagesRead`，因此模型调用时间线工具时能看到日期和分钟，却看不到从第几页读到第几页及阅读量。

**Evidence:** `paper_reading_gateway.py:170-179` 的字段白名单包含 `pages`、不含 `startPage/endPage/pagesRead`；当前写入路径在 `app.js:3003-3040,3058-3060` 明确保存 `startPage`、`endPage`、`pagesRead`；后端示例 session 也使用同一结构（`app_server.py:298-301`）。现有 Gateway 测试只枚举工具并验证一个 `get_reading_context()` 鉴权成功例（`tests/agent/deep_reading_gateway_contract_test.py:13-63`），没有断言时间线字段。

**Why:** 深度共读被要求基于用户阅读记录取证。稳定丢失页码会让“我在哪一段读得最慢”“这次读了多少页”等研究只能猜测或声称证据不足；这也削弱 2026-08-13「手动记录负担高、希望已有记录产生价值」signal 的回流价值。

**Size:** S

**Files:** `paper_reading_gateway.py:170-179`; `app.js:3003-3040,3058-3060`; `app_server.py:298-301`; `tests/agent/deep_reading_gateway_contract_test.py:13-63`

**Northstar:** 强——现有阅读记录已保存正确字段，但新回顾入口稳定丢弃它们；修正白名单并加真实 session 契约测试即可恢复可信取证。→ **promoted to OPT-162**

### E270 — 深度共读摘抄工具把「我的理解」错读为不存在的 `note`，个人思考无法检索或返回 (S)

**What:** 摘抄的用户理解存储在 `reflection`，但 Gateway 的 `_compact_quote()` 返回 `note`，`search_quotes()` 的搜索文本也读取 `note`。结果是按个人理解中的关键词搜索无命中，即使因正文命中返回摘抄，返回对象仍不含该理解。

**Evidence:** 摘抄表单字段为 `reflection`（`index.html:647`），当前摘抄搜索把它纳入 haystack（`app.js:2088-2094`），新增和编辑也都写入该字段（`app.js:4476-4498`）；Gateway 却在 `paper_reading_gateway.py:82-94` 返回 `note`，并在 `paper_reading_gateway.py:114-124` 以 `content/ocrText/note/tags` 建检索文本。全库现有 `deep_reading_gateway_contract_test.py:13-63` 没有构造带 reflection 的 quote 或调用 `search_quotes()`。

**Why:** 「我的理解」是摘抄正文之外最直接的用户原声。深度共读若只看到原文、看不到用户为什么记录它，会把个人积累降级成通用摘抄库，且无法按用户自己的观点词汇回找证据。

**Size:** S

**Files:** `paper_reading_gateway.py:82-94,114-124`; `index.html:647`; `app.js:2088-2094,4476-4498`; `tests/agent/deep_reading_gateway_contract_test.py:13-63`

**Northstar:** 强——直接恢复 Theme 3 已有摘抄资产的完整语义，让深度回顾能引用用户自己的理解；字段替换与检索补全均为局部改动。→ **promoted to OPT-163**

### E271 — 深度共读 `list_books()` 只搜书名/作者，按标签、简介或读后感找书会漏结果 (S)

**What:** Gateway 已把 tags、notes、review 放进 `_compact_book()` 返回值，但 `list_books(query)` 的过滤条件只拼接 title 与 author。模型若用主题、标签或用户评价关键词检索书架，会在书确实含该信息时得到空列表。

**Evidence:** `paper_reading_gateway.py:70-79` 的返回白名单包含 `tags/notes/review`；`paper_reading_gateway.py:133-144` 的 haystack 仅为 title + author。前端书单检索已采用 title、author、tags、notes、review、doubanComment 的完整口径（`app.js:1491-1500`），说明这些字段当前真实存在且可检索。旧 E238 关注前端复用 combobox，本项是 8 月新增深度共读 Gateway 的独立后端工具路径。

**Why:** 主题检索是“回顾有价值”的既有核心场景；深度共读明明能返回这些字段，却在定位候选书之前先把它们过滤掉，造成同一账号在书单能找到、研究工具找不到的口径分叉。

**Size:** S

**Files:** `paper_reading_gateway.py:70-79,133-144`; `app.js:1491-1500`; `tests/agent/deep_reading_gateway_contract_test.py:13-63`

**Northstar:** 中——回顾入口的一致性缺口明确，但没有深度共读主题查询失败的直接 signal；保留探索池，不挤占两个确定丢字段项。

### E272 — Gateway 契约测试只验证工具数量和单个鉴权例，五个数据工具的字段映射没有回归保护 (S)

**What:** 当前测试确认暴露六个只读工具、签名不含身份参数，并只实际调用 `get_reading_context()`。`search_quotes()`、`list_books()`、`get_connections()`、`get_confirmed_memories()`、`get_reading_timeline()` 均没有输出字段与过滤行为测试；E269/E270 两个稳定字段错配因此可长期保持绿灯。

**Evidence:** `tests/agent/deep_reading_gateway_contract_test.py:13-28` 只检查工具集合和函数签名；`tests/agent/deep_reading_gateway_contract_test.py:30-63` 唯一行为测试只调用 `get_reading_context()`。生产工具实现集中在 `paper_reading_gateway.py:97-179`，其中时间线与摘抄字段错配已由 E269/E270 逐行坐实。

**Why:** Gateway 是用户状态到外部研究运行时之间的最窄数据边界。仅测试“工具存在、token 隔离”不能证明“返回的是正确用户字段”；补每个工具一个最小真实 state fixture，能在不启动 Harness 的情况下锁住数据口径。

**Size:** S

**Files:** `tests/agent/deep_reading_gateway_contract_test.py:13-63`; `paper_reading_gateway.py:97-179`

**Northstar:** 中——通过防止积累字段再次静默丢失来保护可信回顾；更适合作为 OPT-162/163 的同 PR 验收要求，不单独提拔。

> 本次 run 新发现 4 条：E269（时间线页码字段错配，S，correctness）、E270（摘抄 reflection 丢失，S，correctness）、E271（书籍工具检索口径过窄，S，回顾 UX）、E272（Gateway 五个数据工具缺字段契约测试，S，代码健康）。提拔 E269→OPT-162、E270→OPT-163；其余保留探索池。所有现有缺陷均基于当前文件逐行核实，并已排除 backlog、旧 Explore 与最近合并目标重复。

## 2026-08-21

> 扫描焦点：继续核对当前 Theme 3「积累可信」下深度共读 Gateway 的检索与呈现契约。远端只读查询确认 `feature/agent` 为 `11199cd`，已知 open PR #127 分支为 `b1da341`，只覆盖 OPT-163；当前 backlog 最大编号为 OPT-163。已核对 backlog、triage、roadmap、signals、E001–272、最近提交和现行代码；以下方向不重复 OPT-162/163、#127、已合并目标或旧 Explore。

### E273 — 深度共读摘抄检索不搜索所属书名与作者，跨书架按书找证据会漏结果 (S)

**What:** `search_quotes(query)` 只在摘抄自身的 `content/ocrText/note/tags` 中匹配关键词。虽然返回对象会补 `bookTitle`，但过滤发生在补书名之前，作者也从未进入检索文本；因此用书名或作者要求“找出某本书/某位作者的摘抄”时，只要正文没有重复该词，就会返回空列表。

**Evidence:** `paper_reading_gateway.py:82-94` 证明 `_compact_quote()` 能从 `bookId` 解析 `bookTitle`；实际过滤却仅拼接 quote 的四个字段（`paper_reading_gateway.py:114-124`）。当前设计文档明确要求 `search_quotes` 覆盖正文、OCR、标签、书名和作者（`docs/deepseek-harness-deep-reading-workbench.md:199-212`）。现有 Gateway 测试只检查工具存在与一次上下文鉴权（`tests/agent/deep_reading_gateway_contract_test.py:13-63`），没有按书名/作者检索摘抄的行为用例。

**Why:** 深度共读的核心是跨书架取证。模型自然会先用书名或作者缩小证据范围；当前工具会把确实存在的个人摘抄误报为不存在，使研究结论缺证或退化为猜测。它与 E271 的 `list_books()` 主题检索不同，本项发生在必须调用的摘抄证据工具中。

**Size:** S

**Files:** `paper_reading_gateway.py:82-94,114-124`; `docs/deepseek-harness-deep-reading-workbench.md:199-212`; `tests/agent/deep_reading_gateway_contract_test.py:13-63`

**Northstar:** 强——修复后深度共读才能按用户熟悉的书名/作者稳定召回已有摘抄，直接恢复跨书架回顾的证据命中率。→ **promoted to OPT-164**

### E274 — 深度共读关联工具只返回裸 ID，不返回两端实体摘要 (S)

**What:** `get_connections()` 直接返回 state 中的 connection 对象。真实 connection 只有两端类型/ID、关系、想法与标签，没有书名、作者或摘抄正文；模型得到“q1 → b2”之类的关联后，仍不知道两端具体内容，无法可靠解释既有思想连接或判断新建议是否重复。

**Evidence:** Gateway 直接对 `state.connections` 做过滤并原样返回（`paper_reading_gateway.py:147-156`）。当前连接写入结构只有 `sourceType/sourceId/targetType/targetId/kind/thought/tags/createdAt`（`app.js:6000-6029`）。设计文档则明确要求返回连接类型、`thought` 和“两端实体摘要”（`docs/deepseek-harness-deep-reading-workbench.md:218-220`）；现有测试未调用该工具（`tests/agent/deep_reading_gateway_contract_test.py:13-63`）。

**Why:** 关联是用户已经沉淀出的高价值阅读资产。只传数据库外键、不给实体内容，会让 Gateway 在技术上“返回了关联”、语义上却无法使用，直接削弱深度共读回答“我已经建立过哪些思想连接”的能力。

**Size:** S

**Files:** `paper_reading_gateway.py:147-156`; `app.js:6000-6029`; `docs/deepseek-harness-deep-reading-workbench.md:218-220`; `tests/agent/deep_reading_gateway_contract_test.py:13-63`

**Northstar:** 强——让既有思想连接真正成为可解释、可去重的个人证据，直接服务 Theme 3 的可信回顾。→ **promoted to OPT-165**

### E275 — 深度共读记忆工具忽略当前研究上下文，返回所有作用域的 confirmed 记忆 (S)

**What:** `get_confirmed_memories()` 返回所有 confirmed 记忆的固定前 30 条，虽然对象中保留 `sourceContext`，但不按当前 run 的 global/book/quote 上下文过滤。一本书的研究因此可能混入另一书或另一摘抄的局部观点，只能依赖模型自行识别并忽略无关作用域。

**Evidence:** Gateway 在 `paper_reading_gateway.py:159-167` 仅判断 `status == "confirmed"`，返回白名单确实包含 `sourceContext`，随后直接截取前 30 条；函数没有使用 run 的 `book_id/quote_id` 做筛选。状态 sanitizer 保留规范化后的 `sourceContext`（`app_server.py:840-854`），日常探讨已按 global、bookId、quoteId 做上下文匹配（`app_server.py:2754-2765`）；设计文档同样要求只返回当前作用域内已确认记忆（`docs/deepseek-harness-deep-reading-workbench.md:222-224`）。

**Why:** 长期记忆被当作用户事实注入研究时，作用域是事实含义的一部分。忽略它会把局部判断泛化到无关书籍，属于个性化正确性风险。不过当前手工新增记忆固定为 global（`app.js:438-445`），真实触发面尚弱于 E273/E274，本轮不提拔。

**Size:** S

**Files:** `paper_reading_gateway.py:159-167`; `app_server.py:840-854,2754-2765`; `app.js:438-445`; `docs/deepseek-harness-deep-reading-workbench.md:222-224`

**Northstar:** 中——保护个性化研究不把局部观点错误泛化；当前 UI 主要生成 global 记忆，先留探索池。

### E276 — 深度共读结果只显示证据 ID，用户无法回到原摘抄核验 (S-M)

**What:** 证据地图在每条判断后只渲染 `evidenceIds` 的字符串列表，没有显示对应摘抄正文、书名，也没有点击回到摘抄详情的入口。后端只验证 ID 是否存在；完成页虽声称“证据地图”，用户仍要手动记住内部 ID 并另行搜索，实际上无法从结果页核验来源。

**Evidence:** `chat.js:1209-1218` 把证据渲染为 `reason · evidenceIds.join("、")`，未解析 state 中的实体，也没有 `data-*` 导航按钮。后端 `persist_research_proposals()` 只校验 ID 属于 books/quotes/connections/sessions/memories 并保留原 evidenceMap（`app_server.py:3539-3556`）。现有前端测试只确认结果区域存在，不覆盖证据可回溯性（`tests/frontend/deep-reading-workbench.test.js:18-27`）。

**Why:** Theme 3 的“可信”不只要求模型引用真实 ID，还要求用户能看到并核验原记录。当前已有后端真实性守卫，但 UI 没把守卫转化成可理解的证据链；这是 UX 完整性方向，不是后端字段错配。

**Size:** S-M

**Files:** `chat.js:1209-1218`; `app_server.py:3539-3556`; `tests/frontend/deep-reading-workbench.test.js:18-27`

**Northstar:** 中——可回溯证据能增强深度共读信任，但交互形态需要产品判断，且暂无直接 signal；不提拔。

> 本次 run 新发现 4 条：E273（摘抄检索漏书名/作者，S，检索 correctness）、E274（关联工具缺两端实体摘要，S，个人积累语义）、E275（记忆作用域未进入工具过滤，S，个性化正确性）、E276（结果证据 ID 不可回溯，S-M，UX）。提拔 E273→OPT-164、E274→OPT-165；其余留探索池。所有现有缺口均基于当前文件逐行核实，并已排除 backlog、旧 Explore、远端 `feature/agent`、已知 open PR #127 与最近合并目标重复。

## 2026-08-22

> 扫描焦点：当前 Theme 3「积累可信」下，继续核对深度共读从取证、结果落库到历史回看的一致性与可达性。隔离 clone 中 `HEAD` 与现存 `origin/feature/agent` 引用均为 `08e676c`；`git fetch origin feature/agent` 因 `.git/FETCH_HEAD` 只读失败，未把本地引用伪装成实时刷新结果。用户提供的唯一 open PR 为 #129（OPT-164），只覆盖按书名/作者检索摘抄。已核对 backlog、triage、roadmap、signals、E001–276、最近提交及当前代码；以下方向不重复 OPT-001–165、#129、已合并目标或旧 Explore。

### E277 — 无效证据被剔除后，失去支撑的研究结论仍原样展示 (S)

**What:** 后端会删除引用不存在 ID 的 `evidenceMap` 项，却不联动处理顶层 `summary`。若模型返回一段实质性结论并附虚构证据 ID，持久化结果会变成“研究结论仍在、证据地图为空、附一条证据被移除警告”；前端仍把原结论放在结果首屏，提示词要求的“无证据不得下结论”没有形成服务端不变量。

**Evidence:** prompt 明确要求没有工具证据时只能说明证据不足（`deep_reading.py:374-381`）；`persist_research_proposals()` 只过滤 `evidenceMap` 并写 `evidenceWarning`，随后直接返回或继续持久化原 result（`app_server.py:3534-3558`）；完成页无条件渲染 `result.summary`，即使 evidence 为空也只在下一张卡显示“暂无可核验的证据”（`chat.js:1202-1218`）。现有回归仅断言虚构 evidenceMap 项被移除和 warning 存在，没有断言 summary 同步降级（`tests/agent/deep_reading_api_test.py:151-161`）。

**Why:** 这是 Theme 3 的直接可信性缺口。系统当前能识别证据不可定位，却仍把依赖该证据的结论当成正式研究结果保存和展示，用户最先看到的恰是未经支撑的 summary。最小修复是在最终有效 evidence 为空且原结果声称有证据时，将 summary 降级为统一的证据不足说明；补“全无效、部分有效、原本无证据”三类契约测试。

**Size:** S

**Files:** `deep_reading.py:374-381`; `app_server.py:3534-3558`; `chat.js:1202-1218`; `tests/agent/deep_reading_api_test.py:151-161`

**Northstar:** 强——阻止深度共读在已确认证据无效时继续展示实质性结论，直接保护个人积累回顾的可信度。→ **promoted to OPT-166**

### E278 — 深度共读不保存取证快照，运行期间编辑或删除记录会改变同一次研究的证据边界 (M)

**What:** 创建任务时只校验当前 `user_state` 中 book/quote 是否存在，`research_runs` 不保存状态版本或证据快照；Gateway 每次工具调用都重新读取最新 `state_json`。长任务运行期间若用户编辑、删除或导入阅读数据，同一 run 的前后两次工具调用可能看到不同内容；完成校验又以当时最新 state 的 ID 集合为准，刚被删除的已用证据会被剔除。

**Evidence:** `ResearchRunStore.create()` 读取 state 只用于存在性校验，插入列没有 state version/snapshot（`deep_reading.py:149-190`）；Gateway `_state()` 每次调用都按 run 的 user_id 重新查询当前 `user_state.state_json`（`paper_reading_gateway.py:44-50`）；完成校验再次调用 `load_state()` 建现时 ID 集合（`app_server.py:3534-3554`）；表结构也只有 context ID、question、结果和状态字段（`app_server.py:576-608`）。

**Why:** 长耗时研究与日常摘抄编辑可以并行。缺少固定证据边界会让同一问题不可复现，甚至让模型已经读过的真实摘抄在落库时变成“无法定位”。可在创建时记录 state version，并选择“小型只读快照”或在完成时明确报告期间发生的数据版本变化；具体策略涉及存储与隐私权衡，先不提拔。

**Size:** M

**Files:** `deep_reading.py:149-190`; `paper_reading_gateway.py:44-50`; `app_server.py:576-608,3534-3554`; `tests/agent/deep_reading_store_test.py`; `tests/agent/deep_reading_api_test.py`

**Northstar:** 中——可复现的证据边界能提升研究可信度，但当前没有“研究期间编辑”真实 signal，且快照策略需产品与存储取舍，不提拔。

### E279 — 深度共读完成后只播报状态，读屏焦点不会进入新生成的研究结果 (S)

**What:** 状态区域有 `aria-live="polite"`，因此能播报“已完成”；真正新增的结果 section 没有 live-region、`tabindex` 或聚焦逻辑。轮询进入终态后只是写入 innerHTML，键盘/读屏用户仍停留在启动按钮或状态附近，无法得知下方已出现“研究结论、证据地图、继续追问”等完整内容。

**Evidence:** HTML 仅 `#researchStatus` 带 `aria-live`，`#researchResult` 只有 `aria-label`（`index.html:229-243`）；`renderResult()` 只赋 `innerHTML`（`chat.js:1202-1218`），`loadRun()` 完成时只调用 render 并停止 timer（`chat.js:1221-1232`），没有 `focus()`、`tabindex` 或结果更新公告。现有前端测试只做源码/结构正则检查（`tests/frontend/deep-reading-workbench.test.js:18-33`）。

**Why:** 深度共读是异步长任务，完成时主动告知“结果已就绪”比普通同步表单更重要。可给结果标题可编程聚焦，完成时将焦点移动到标题，或在 live status 中增加“结果已显示在下方”并提供跳转按钮；应避免把整段长结果作为 live-region 一次性朗读。

**Size:** S

**Files:** `index.html:229-243`; `chat.js:1202-1232`; `tests/frontend/deep-reading-workbench.test.js:18-33`

**Northstar:** 中——让异步研究结果对读屏和键盘用户可达，但暂无真实辅助技术 signal，不提拔。

### E280 — 深度共读 run 与 event 无保留策略，完整导出会随历史无限增长 (S-M)

**What:** 每次研究至少写一条 run 和多条 event；账户完整导出会读取该用户全部 research run 及完整 `result_json`，但后台 GC 不处理 `research_runs/research_run_events`，界面也没有删除单条历史的入口。长期使用后数据库与合规导出包会单向增长。

**Evidence:** 两表只建索引、没有过期字段或清理约束（`app_server.py:576-608`）；完整导出对 `research_runs` 使用无 LIMIT 的 `ORDER BY created_at` 查询并包含完整 result（`app_server.py:4597-4607`）；`_run_gc()` 只清理 session、重置 token、server error 和 rate-limit 行（`app_server.py:6558-6576`）。当前历史 UI 只提供打开 run 的按钮（`chat.js:1244-1257`），没有删除路径。

**Why:** 这不是当前用户故障，但深度共读结果体和事件元数据明显大于普通状态字段。先定义保留口径，例如永久保留用户可见结果、只保留短期诊断 events，或提供显式删除；在没有体积 signal 前不应贸然自动删用户资产。

**Size:** S-M

**Files:** `app_server.py:576-608,4597-4607,6558-6576`; `chat.js:1244-1257`; `tests/agent/account_export_delete_test.py`

**Northstar:** 弱——当前只是可验证的长期容量与数据治理风险，没有磁盘或导出变慢 signal，不提拔。

> 本次 run 新发现 4 条：E277（无效证据被剔除但 summary 仍保留，S，correctness）、E278（研究无状态快照，M，可复现性）、E279（完成结果缺读屏聚焦/公告，S，无障碍）、E280（run/events 无保留策略，S-M，代码健康）。仅 E277 与当前 Theme 3 形成直接、确定且可局部修复的可信性缺口，提拔为 OPT-166；其余因缺真实 signal、需策略取舍或北极星较弱而留探索池。所有断言均基于当前 `file:line` 核实，并已排除 backlog、旧 Explore、最近合并代码与 open PR #129 重复。

## 2026-08-23

> 扫描焦点：当前 Theme 3「积累可信」下，继续核对深度共读结果从 Harness 返回、服务端落库到前端恢复与沉淀的失败边界。只读 `git ls-remote` 确认远端 `feature/agent` 与隔离 clone `HEAD` 同为 `67f5a28`；用户提供的唯一 open PR #130 只覆盖 OPT-166。已核对 backlog、triage、roadmap、signals、E001–280、最近提交及当前代码；以下方向不重复 OPT-001–166、#130、已合并目标或旧 Explore。

### E281 — 深度共读只验证顶层 JSON 对象，不校验结果内部结构，单个畸形建议可令整次任务失败 (S)

**What:** Harness 最终文本只要能解析成 JSON 对象就会进入落库流程；`summary/evidenceMap/openQuestions/proposals` 的成员类型没有统一校验。模型若返回 `proposals: [null]` 或非对象成员，服务端处理无效建议时会对该成员做字典展开并抛异常，使已经生成了 summary 的整次研究最终被标记为 FAILED。

**Evidence:** `_json_object()` 只检查解析结果是 dict（`deep_reading.py:99-111`）；runner 仅 `setdefault` 三个字段并确认 proposals 是 list，随后把成员原样交给回调（`deep_reading.py:501-510`）。`persist_research_proposals()` 虽对读取 `evidenceIds` 做了 `isinstance(proposal, dict)` 防守，但无证据分支立即执行 `{**proposal, ...}`（`app_server.py:3588-3595`），因此 `null`、字符串或数组成员都会触发 `TypeError`；外层捕获会把 run 标成 FAILED（`deep_reading.py:513-515`）。现有 API 回归只覆盖结构正确的 proposal（`tests/agent/deep_reading_api_test.py:129-161`）。

**Why:** 模型输出不是可信 schema。当前实现会因一个可丢弃的坏建议连带丢掉其余可展示结论，与 Theme 3「积累可信」相冲突。最小修复是在 runner 或落库边界规范化四个字段，逐项过滤非对象 evidence/proposal、非字符串问题，并保留明确 warning；补畸形成员不使 run 失败的契约测试。

**Size:** S

**Files:** `deep_reading.py:99-111,501-515`; `app_server.py:3527-3558,3588-3595`; `tests/agent/deep_reading_api_test.py:129-161`; `tests/agent/deep_reading_runtime_test.py`

**Northstar:** 强——让深度共读在模型局部格式漂移时保住可用结论，不把可降级的建议错误升级为整次研究失败，直接保护回顾结果的可靠性。→ **promoted to OPT-167**

### E282 — 页面刷新后不恢复正在执行的深度共读，用户可重复启动同一研究 (S)

**What:** `activeRun` 只存在当前页面内存中。刷新后进入深度共读只加载历史列表和能力状态，不会识别最近的 CREATED/RUNNING run、恢复状态轮询或禁用开始按钮；历史中的运行项也必须用户主动点击才会继续跟踪。因此同一后台任务仍在执行时，界面看起来可以再次启动。

**Evidence:** 初始化状态把 `activeRun` 设为 null、开始按钮默认可用（`chat.js:1115-1119`）；进入研究模式只调用 `loadHistory()`/`loadCapability()`（`chat.js:1160-1166`）。`loadHistory()` 只写按钮列表，不选择或恢复非终态 run（`chat.js:1244-1257`）；只有新建成功或点击某条历史才调用 `loadRun()`（`chat.js:1271-1281,1296-1299`）。后端创建端点也未拒绝同用户已有非终态任务（`app_server.py:5024-5048`）。

**Why:** 长任务天然跨越刷新、切后台和 Safari 回收页面。失去恢复入口会把真实运行中的任务伪装成可再次开始，增加重复模型成本并产生两份相近结果。进入工作台后可从历史中自动恢复最近非终态 run；是否限制跨上下文并发仍需产品取舍。

**Size:** S

**Files:** `chat.js:1115-1119,1160-1166,1244-1257,1271-1299`; `app_server.py:5024-5048`; `tests/frontend/deep-reading-workbench.test.js:18-33`

**Northstar:** 中——恢复长任务能减少重复研究并保持进度连续，但没有刷新后重复启动的直接 signal，且跨上下文并发语义尚未定义；不提拔。

### E283 — 深度共读创建端点没有并发或额度护栏，可为同一用户无限启动昂贵 runner (S-M)

**What:** `/api/research-runs` 通过鉴权和 capability 检查后直接创建 daemon runner；没有调用现有 AI rate-limit，也没有查询该用户当前 CREATED/RUNNING 数。客户端按钮禁用只能约束单页面，多个标签页或直接请求可以同时启动任意数量研究任务。

**Evidence:** 创建路径 `app_server.py:5024-5048` 没有 `_enforce_rate_limit()` 或非终态计数；对照聊天流端点会在调用模型前执行 `_enforce_rate_limit(..., "chat")`（`app_server.py:5861-5865`）。runner 每次 start 都新建 daemon thread（`deep_reading.py:362-364`），而 `ResearchRunStore.create()` 只校验上下文并无并发查询（`deep_reading.py:149-190`）。

**Why:** 深度共读比一次普通探讨耗时更长、工具调用更多。缺少服务端护栏既可能放大误触/刷新产生的重复成本，也允许单个账号耗尽线程和上游额度。应先决定“每用户最多一个全局 run”还是“每上下文一个”，并设置独立额度，不能仅复用前端 disabled。

**Size:** S-M

**Files:** `app_server.py:5024-5048,5861-5865`; `deep_reading.py:149-190,362-364`; `tests/agent/deep_reading_api_test.py:77-127`

**Northstar:** 中——保护服务可用性和模型成本，但当前无并发事故 signal，且额度与跨上下文策略需要产品选择；不提拔。

### E284 — 沉淀建议保存失败会把已完成研究的状态栏改成“失败” (S)

**What:** 用户在已完成结果中确认或忽略沉淀建议时，接口错误复用研究任务级 `handleError()`。该函数会把顶部 `researchStatus` 写成 FAILED；于是 run 实际仍为 COMPLETED、结论仍可见，界面却宣称整次深度共读失败，错误层级混淆。

**Evidence:** `renderStatus()` 依据 run 状态显示“已完成”（`chat.js:1187-1200`）；通用 `handleError()` 无条件把 statusBox 的 data-state 改为 FAILED（`chat.js:1235-1242`）。proposal approve/reject catch 直接调用它（`chat.js:1300-1316`），而成功/失败只涉及 `/api/agent-actions/...`，不会改变 research run 的终态。现有前端测试没有驱动 proposal 操作失败（`tests/frontend/deep-reading-workbench.test.js:18-33`）。

**Why:** 研究生成与后续沉淀是两层状态。保存建议失败应留在该建议卡片内、恢复按钮并允许重试，不能推翻已完成研究的状态；否则用户会误判结论丢失或任务需重跑。

**Size:** S

**Files:** `chat.js:1187-1242,1300-1316`; `tests/frontend/deep-reading-workbench.test.js:18-33`

**Northstar:** 中——避免把局部保存错误误报成研究失败，提升结果可信感；无直接 signal，且可与未来 proposal 交互测试一并处理，不提拔。

> 本次 run 新发现 4 条：E281（结果内部 schema 未校验，S，correctness/error handling）、E282（刷新后不恢复运行任务，S，UX）、E283（创建端点无并发/额度护栏，S-M，performance/reliability）、E284（建议保存失败污染研究终态，S，错误呈现）。仅 E281 是无需产品取舍、会把可降级模型格式错误升级为整次失败的强证据缺口，提拔为 OPT-167；其余留探索池。所有断言均基于当前文件逐行核实，并已排除 backlog、旧 Explore、远端 `feature/agent`、最近合并代码与 open PR #130 重复。

## 2026-08-24

> 扫描焦点：当前 Theme 3「积累可信」下，核对深度共读工作台在跨书切换、历史反序列化与键盘操作上的可信边界。只读 `git ls-remote` 确认远端 `feature/agent` 与隔离 clone `HEAD` 同为 `b3b71e6`；用户提供的唯一 open PR #131 只覆盖 OPT-167。已核对 backlog、triage、roadmap、signals、E001–284、最近提交及当前代码；以下方向不重复 OPT-001–167、#131、已合并目标或旧 Explore。

### E285 — 已在深度共读模式时切换书/摘抄，只更新上下文标题，旧结果与旧历史仍留在新上下文 (S)

**What:** 用户先查看书 A 的深度共读，再从书 B 详情点击「深度共读」时，内部模式仍是 `research`。`setMode("research")` 因模式未变化而提前返回，只重绘书 B 的上下文卡；它不会清空书 A 的 `activeRun`、状态与结果，也不会按书 B 重新加载历史。页面因此会同时显示“围绕书 B”和书 A 的研究结论/历史。

**Evidence:** 书籍与摘抄详情入口分别调用 `switchChatToDeepResearch()`（`app.js:6191-6197,6240-6245`）；该函数先切换 chat 上下文，再调用 `setMode("research", true)`（`chat.js:1329-1334`）。但 `setMode()` 在 `normalizedMode === mode` 时只执行 `renderContext()` 后返回（`chat.js:1140-1145`），清空/替换结果只发生于 `loadRun()` 的 `renderResult()`（`chat.js:1202-1232`），历史刷新也只在真正进入模式时调用（`chat.js:1162-1166`）。当前前端测试仅检查入口符号存在，没有驱动 A→B 切换（`tests/frontend/deep-reading-workbench.test.js:18-27`）。

**Why:** 上下文标题是用户判断研究证据属于哪本书的首要线索；标题与结果跨书错配会让旧结论被误认为新书结论，直接破坏 Theme 3 的可信性。最小修复是在同模式但 context key 变化时停止旧轮询、清空 active run/status/result，并重新加载对应历史；补书 A 已完成→书 B 入口的行为回归。

**Size:** S

**Files:** `app.js:6191-6197,6240-6245`; `chat.js:1140-1166,1202-1232,1329-1334`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 强——阻止旧书研究结果冒充当前书证据，直接保护深度回顾的上下文可信度，且修复边界局部明确。→ **promoted to OPT-168**

### E286 — 单条研究结果或事件 JSON 损坏会让整个历史列表/详情请求失败 (S)

**What:** `serialize_run()` 无保护地解析 `result_json`，详情路径还会无保护地解析每条 event 的 `metadata`。列表会序列化最多 100 条 run；其中任一旧行 JSON 截断或迁移异常，整次 `/api/research-runs` 都会抛错，其他完好历史也无法显示。详情中一条坏 event 同样会遮蔽完好的最终结果。

**Evidence:** `serialize_run()` 直接执行 `json.loads(row["result_json"] or "{}")`，并在事件列表推导式内直接 `json.loads(event["metadata"] or "{}")`（`deep_reading.py:114-140`）；`ResearchRunStore.list()` 对每行调用该函数且没有逐行隔离（`deep_reading.py:241-259`），GET 列表与详情端点也未捕获反序列化异常（`app_server.py:4424-4436,4448-4475`）。现有 store 测试只覆盖正常 JSON（`tests/agent/deep_reading_store_test.py:49-100`）。

**Why:** 当前写路径会生成合法 JSON，故这主要防御历史迁移、磁盘/手工修复后的坏行，不是已发生 signal。可让坏 `result_json` 降级为空结果并附解析警告、坏 event 跳过或标记损坏，同时保证其他 run 仍可列出；避免一条历史污染整个回顾入口。

**Size:** S

**Files:** `deep_reading.py:114-140,241-259`; `app_server.py:4424-4475`; `tests/agent/deep_reading_store_test.py`

**Northstar:** 中——保护研究历史的局部故障隔离，但当前没有坏行真实信号，不提拔。

### E287 — 「日常探讨 / 深度共读」声明为 ARIA Tab，却不支持方向键与 roving tabindex (S)

**What:** 二级模式切换已使用 `role="tablist"` / `role="tab"`，但两个 Tab 都留在顺序 Tab 键流中，且只绑定 click；没有 ArrowLeft/ArrowRight、Home/End 键盘切换，也不维护选中项 `tabindex=0`、未选中项 `tabindex=-1`。辅助技术获得的是 Tab 语义，实际键盘行为却仍是普通按钮组。

**Evidence:** 两个按钮具有完整 Tab 角色和 `aria-selected`（`index.html:182-185`），`setMode()` 只更新 class、`aria-selected` 与面板 hidden（`chat.js:1140-1166`）；事件绑定仅有两个 click listener（`chat.js:1260-1261`），该工作台代码中没有键盘监听。现有测试只断言 tablist 文案和移动点击尺寸（`tests/frontend/deep-reading-workbench.test.js:11-32`）。

**Why:** 项目主导航的 OPT-046 已建立 Tab 可访问性基线；新加入的二级 Tab 应遵守同一交互契约。实现可局限为两按钮键盘 helper 与焦点管理，但没有真实辅助技术 signal，优先级低于上下文错配。

**Size:** S

**Files:** `index.html:182-185`; `chat.js:1140-1166,1260-1261`; `tests/frontend/deep-reading-workbench.test.js`

**Northstar:** 弱中——让深度回顾入口对键盘/读屏用户行为一致；无直接 signal，不提拔。

> 本次 run 新发现 3 条：E285（跨书切换保留旧结果/历史，S，correctness/UX）、E286（坏 JSON 拖垮整段研究历史，S，错误隔离）、E287（二级 Tab 缺标准键盘行为，S，无障碍）。仅 E285 会把一书的研究结论稳定错配到另一书上下文，且无需产品取舍，提拔为 OPT-168；其余因无真实 signal 或北极星较弱留在探索池。

## 2026-08-25

> 扫描焦点：以 2026-08-24 owner「建立关联时无法有效选中当前/目标摘抄、关键词找不到、误选后难删除」的真实 signal 为主，核对关联创建、检索、删除及并发保存边界。隔离 clone 的 `HEAD` 与现存 `origin/feature/agent` 引用均为 `a1b7334`；实时 `git ls-remote` 因当前环境无法解析 github.com 未能刷新，因此编号依据该基线最大 OPT-168 分配。用户给出的唯一 open PR #133 只覆盖 OPT-168。已核对 backlog、triage、roadmap、signals、E001–287、最近提交、现行代码与关联测试；以下方向不重复已完成 OPT-088/111/140/142、旧 E187/E200/E239 或 #133。

### E288 — 关联新增/编辑/删除遇到 409 冲突时仍播报成功，实际变更已被服务器状态覆盖 (S)

**What:** 关联写操作先改本地 `state.connections` 再调用 `syncState()`。当其他标签页或设备抢先保存导致 409 时，`syncState()` 会采用服务器状态并正常返回；关联调用方随后仍关闭弹窗、切换页面并提示“关联已保存/已更新”，或提示“关联已删除”。实际新增/编辑已消失，删除项则重新出现，形成确定性的 false-success。

**Evidence:** `syncState()` 在 `state_conflict` 分支用服务器 state 覆盖本地并 `return`，不向调用方表达冲突（`app.js:1138-1167`）。`addConnection()` 在本地插入/改写后 await 它，随后无条件关闭弹窗并提示成功（`app.js:6018-6039`）；`deleteConnection()` 同样先过滤本地数组，随后无条件提示删除成功（`app.js:6043-6055`）。现有乐观锁测试只验证服务器状态被采用（`tests/frontend/state-optimistic-lock.test.js:102-127`），关联 CRUD 测试仅覆盖成功请求（`tests/frontend/connection-crud.test.js:107-173`）。

**Why:** 最新 owner signal 已坐实关联创建与误删都处于真实使用路径。并发冲突并非要保留本地数据覆盖服务器，而是调用方必须知道“本次变更未保存”：保留/恢复表单，或返回结构化 `{saved:false, reason:"conflict"}`，禁止后续成功 toast。删除也必须明确说明未删除，而不能一边恢复记录一边声称成功。

**Size:** S

**Files:** `app.js:1138-1167,6018-6055`; `tests/frontend/state-optimistic-lock.test.js:102-127`; `tests/frontend/connection-crud.test.js:107-173`

**Northstar:** 强——直接保护用户刚建立或删除的思想关联不被“成功”假象误导，服务 Theme 3「积累可信」，且由当前 owner 关联 signal 支撑。→ **promoted to OPT-169**

### E289 — 关联摘抄选择器只有字面子串检索，同主题但不共享词面的摘抄无法互相发现 (M)

**What:** 摘抄选择器把输入词与摘抄正文、所属书名、标签和“我的理解”逐字段做 `includes`；它不做分词、同义扩展或语义召回。用户知道两条摘抄谈的是同一主题，但目标原文恰好不用输入的关键词时，结果必为空，这与 2026-08-24“同主题摘抄关键词找不到”的 signal 一致。

**Evidence:** `filteredQuotes()` 将查询转小写后，只以 `String.includes()` 检查 `content/ocrText`、书名、tags、reflection（`app.js:5854-5863`）；通用 `fuzzyMatch()` 实际也只是 `includes`（`app.js:1559-1561`）。候选最多返回 30 条（`app.js:5855-5863`），没有相关度或语义排序。已完成 OPT-111/142 只补齐 OCR 与 tags/reflection 字段，没有改变字面匹配口径。

**Why:** 关联的价值恰在发现“文字不同、思想相通”。可先做低风险的本地 token/多词 AND-OR 与命中字段排序，也可评估复用深度共读只读检索生成候选；后者涉及成本、延迟与隐私边界，需先用 owner 这次失败查询复现并定义召回验收，不能直接当 S 级字符串修补。

**Size:** M

**Files:** `app.js:1559-1561,5842-5863,5870-5891`; `tests/frontend/quote-combobox-ocr-label.test.js:80-128`; `tests/frontend/search-field-bundle.test.js`

**Northstar:** 强但不确定——直接对应最新 owner “同主题摘抄找不到”并可能提升关联这一回顾操作；方案与验收仍需真实失败关键词，暂不提拔。

### E290 — 目标摘抄候选不排除已选来源，允许选择同一摘抄后到提交阶段才报错 (S)

**What:** 从当前摘抄发起关联时，来源已预填且目标默认也是摘抄，但目标候选仍包含来源本身。用户可以点中同一条摘抄、填写想法并提交，直到最后才收到“来源和目标不能相同”；选择器没有提前隐藏或禁用这条无效候选。

**Evidence:** `openConnectionDialog()` 会预填来源摘抄并让目标类型跟随为 quote（`app.js:5954-5975`）；四个 quote combobox 共用 `filteredQuotes()`，过滤条件只看查询文本，不接收或排除另一侧 hidden ID（`app.js:5831-5863`）。同源同目标只在 `addConnection()` 提交校验时拒绝（`app.js:6002-6016`），现有测试也只断言最终未写入（`tests/frontend/connection-crud.test.js:131-137`）。

**Why:** 最新 signal 明确出现“无法有效选中当前摘抄和目标摘抄、误选其他摘抄”。在候选层消除必然无效的 self-link，可减少两侧文本相似时的误选；实现时需在来源变更后动态刷新目标列表，并保留编辑既有连接的正确回显。

**Size:** S

**Files:** `app.js:5831-5863,5954-6016`; `tests/frontend/connection-target-default.test.js:87-112`; `tests/frontend/connection-crud.test.js:131-137`

**Northstar:** 中——减少建立关联时的无效选择，真实 signal 相关但只覆盖 self-link 一个子场景；不单独提拔，适合并入后续关联选择器改造。

### E291 — 每张关联卡的删除按钮都叫“删除关联”，读屏用户无法区分将删除哪一条 (S)

**What:** 关联列表每张卡都有删除按钮，但 accessible name 完全相同。读屏用户按按钮浏览时只能听到多个“删除关联”，无法知道按钮对应哪两个实体；而删除确认又只给通用问题，误选后缺少第二层可辨识信息。

**Evidence:** `buildConnectionCard()` 已解析两端 `src/tgt` 标签，却给每个删除按钮固定 `aria-label="删除关联"`（`app.js:1037-1053`）；点击后 `deleteConnection()` 的确认文案固定为“确定删除这条关联记录吗？”（`app.js:6043-6047`）。关联 CRUD 测试只检查确认框出现和数组删除，没有验证按钮名称或确认对象预览（`tests/frontend/connection-crud.test.js:153-173`）。旧 E187/E200 关注通用确认框不展示 `thought`，本项仅登记列表按钮 accessible name 的独立缺口，不重复提拔旧方向。

**Why:** 可将按钮名改为“删除关联：A 与 B”，复用已经解析出的两端短标签；这样在触发破坏性操作前即可识别目标。由于没有辅助技术 signal，确认框内容改造仍应回到旧 E187/E200，不在本项扩 scope。

**Size:** S

**Files:** `app.js:1037-1053,6043-6047`; `tests/frontend/connection-crud.test.js:153-173`

**Northstar:** 弱中——降低关联误删风险并改善无障碍，但缺直接读屏 signal，留探索池。

> 本次 run 新发现 4 条：E288（409 冲突后关联写入 false-success，S，correctness/error handling）、E289（字面检索无法发现同主题摘抄，M，UX/retrieval）、E290（目标候选不排除来源摘抄，S，UX）、E291（删除按钮 accessible name 不可区分，S，accessibility）。仅 E288 是确定性数据可信缺口、无需产品方案选择且有最新关联 signal 支撑，提拔为 OPT-169；E289 需真实失败查询定义召回口径，E290 适合并入选择器改造，E291 无直接辅助技术 signal，均暂留探索池。

## 2026-08-26

> 扫描焦点：沿 2026-08-24 owner 的关联创建/误选/删除 signal，复核 OPT-169 合入后的普通网络失败、持久化边界与交互可达性。隔离 clone 当前 `HEAD` 与现存 `origin/feature/agent` 引用均为 `56b414d`；`git fetch origin feature/agent` 因 `.git/FETCH_HEAD` 只读失败，故不宣称实时远端已刷新。用户提供的 open PR 数据为空或不可用，本轮不据此臆造状态。已核对 backlog、旧 E001–291、最近合并历史及当前代码；以下方向不重复已完成 OPT-169 或旧 E187/E200/E239/E245。

### E292 — 关联保存遇到普通网络错误后，未落库的本地变更仍留在 state，可能被后续保存意外带上 (S)

**What:** 新增、编辑、删除关联都先直接修改全局 `state.connections`，再调用 `syncState()`。409 冲突会以服务器 state 覆盖本地，但断网、超时或 5xx 会重新抛错；关联 catch 只提示错误，不恢复修改前快照。因此新增失败后未落库关联仍在内存，编辑失败的值也继续存在，删除失败的项则继续从内存消失；任一后续成功的全量 state 保存都可能把这次“失败”变更意外落库。

**Evidence:** `syncState()` 仅在 `state_conflict` 分支替换 state，其他错误直接 `throw`（`app.js:1138-1168`）。`addConnection()` 在请求前改写或插入 `state.connections`，catch 仅 toast（`app.js:6019-6045`）；`deleteConnection()` 同样先 filter，catch 不回滚（`app.js:6048-6064`）。现有关联测试只覆盖成功与 409，未构造普通 reject/500（`tests/frontend/connection-crud.test.js:107-240`）。旧 E245 是长期记忆 CRUD 的同类线索，本项发生在最新真实 signal 指向的关联链路，且 OPT-169 只修 409，没有覆盖此分支。

**Why:** 错误提示应意味着变更没有保存；当前实现却可能在用户下一次编辑书籍或摘抄时静默补写，造成“刚才明明失败，后来又出现/消失”的不可解释数据状态。可在每个关联操作前保存 connections 快照，普通错误时恢复并重绘；409 继续采用服务器权威状态。

**Size:** S

**Files:** `app.js:1138-1168,6019-6064`; `tests/frontend/connection-crud.test.js:107-240`

**Northstar:** 强——直接保护最新真实使用路径中的手写思想关联不被失败状态延迟篡改，服务 Theme 3「积累可信」。→ **promoted to OPT-170**

### E293 — `connections` 仅校验为数组，畸形 `tags` 可让关联页渲染整体抛错 (S)

**What:** 服务端与前端都只确认 `connections` 是数组，不校验数组成员或字段类型。若导入/旧客户端写入 `{tags:"哲学"}`，关联卡渲染会对字符串调用 `.map()` 并抛 `TypeError`；单条坏记录即可阻断整个关联列表，而不是局部降级。

**Evidence:** `sanitize_state()` 原样透传任意 list 的 connections（`app_server.py:794-865`，具体返回在 `:862`）；`normalizeStateShape()` 也只做 `Array.isArray`（`app.js:414-427`）。`buildConnectionCard()` 无条件执行 `(conn.tags || []).map(...)`（`app.js:1037-1042`），`renderConnections()` 再对所有项整体 `filtered.map(buildConnectionCard).join("")`（`app.js:1076-1116`）。当前 sanitizer 测试还明确锁定“不深度清洗数组条目”的现状（`tests/agent/sample_state_test.py:35-41`），没有畸形 connection 的隔离测试。

**Why:** Theme 3 不只要求正常写入不丢数据，也要求历史/导入数据局部异常时仍可回顾其余积累。最小修复可在 connection 专用 sanitizer 中保留合法 ID/type/thought/kind，统一 tags 为字符串数组，并过滤非对象；前端仍可做防御性回落。

**Size:** S

**Files:** `app_server.py:794-865`; `app.js:414-427,1037-1042,1076-1116`; `tests/agent/sample_state_test.py:35-41`; 相关 state/frontend tests

**Northstar:** 强——防止一条坏关联让整个思想连接资产不可回顾，直接服务 Theme 3「积累可信」。→ **promoted to OPT-171**

### E294 — 关联卡两端可点击跳转，但使用不可聚焦的 `div`，键盘无法打开对应书籍/摘抄 (S)

**What:** 每张关联卡的来源与目标区域都可点击导航到实体详情，但 DOM 仍是普通 `div`，没有 button/link 语义、`tabindex` 或键盘事件。鼠标/触摸用户能沿关联回到原文，键盘用户完全到不了这两个入口。

**Evidence:** 两端由 `.conn-nav-side` div 输出（`app.js:1037-1066`）；列表委托只监听 click 后调用 `navigateToConnectionSide()`（`app.js:6175-6184`）。样式只提供 `cursor:pointer` 和 hover（`styles.css:3376-3385`），没有 focus-visible。旧 E239 登记的是创建弹窗 combobox，本项是回顾列表实体导航，不重复。

**Why:** 关联的回顾价值依赖从“思想碰撞”回到原书/原摘抄核验。可改用语义 button，或补 role/tabindex 与 Enter/Space 委托，同时提供包含实体标签的 accessible name。

**Size:** S

**Files:** `app.js:1037-1066,6175-6184`; `styles.css:3376-3385`; `tests/frontend/connection-crud.test.js`

**Northstar:** 中——补齐关联回溯的键盘可达性，但没有辅助技术 signal，暂不提拔。

### E295 — 切换关联一侧的“书籍/摘抄”类型不会清空旧选择，切回后会静默恢复过期目标 (S)

**What:** 类型切换只隐藏一套 combobox、显示另一套，不清空任何 hidden ID 或输入文本。用户选中摘抄 A，切到书籍探索后再切回摘抄，A 会直接恢复为提交目标；界面没有提示这是旧选择，容易把试选残留当成当前确认。

**Evidence:** `toggleConnComboboxes()` 仅切换 `is-hidden` class（`app.js:5985-5996`）；source/target type 的 change listener 也只调用该函数（`app.js:6154-6159`）。四套 hidden input 同时存在（`index.html:823-831,853-861`），提交时按当前 type 读取对应旧值（`app.js:6001-6008`）。现有 connection 测试未覆盖类型往返后的选择状态。

**Why:** 最新 signal 已出现“误选其他摘抄”。类型试探本身应可逆，但恢复旧值需明确可见；更稳妥的默认是类型变化时清空新激活侧，要求重新确认，编辑已有连接则在首次打开时显式回填。

**Size:** S

**Files:** `index.html:823-831,853-861`; `app.js:5985-6008,6154-6159`; `tests/frontend/connection-crud.test.js`

**Northstar:** 中——降低关联对象误选，但只覆盖类型往返子场景，适合与 E290 的选择器收口一起评估，不单独提拔。

> 本次 run 新发现 4 条：E292（普通网络失败遗留未落库关联，S，correctness/error handling）、E293（畸形关联字段拖垮整页，S，数据兼容/错误隔离）、E294（关联两端不可键盘回溯，S，无障碍）、E295（类型往返恢复旧选择，S，UX）。提拔 E292→OPT-170、E293→OPT-171；其余因无直接辅助技术 signal 或只覆盖误选子场景留探索池。所有现有缺口均由当前文件逐行核实，并已排除 backlog、旧 Explore 与最近合并目标；open PR 状态不可用，未作推断。

## 2026-08-27

> 扫描焦点：在 2026-W35「深度共读上下文可信」主题下，继续核对同一书内的任务切换、取消竞态、历史恢复与沉淀建议状态同步。隔离 clone 当前 `HEAD` 与现存 `origin/feature/agent` 引用均为 `4fcda98`，已包含当日 triage；`git fetch origin feature/agent` 因 `.git/FETCH_HEAD` 只读失败，`git ls-remote` 与 `gh pr list` 又因 github.com 无法解析而失败，因此不宣称实时远端或 open PR 状态。已核对 backlog 最大 OPT-172、旧 E001–295、最近提交和当前实现；以下方向不重复 OPT-160/161/167/168 或旧 E262/E264/E282–284。由于无法刷新远端编号，且当日 triage 已记录夜间实现预算 8/8，本轮不提拔 backlog。

### E296 — 取消请求与完成竞态时，接口返回 COMPLETED 但前端不渲染最终结果 (S)

**What:** 用户在任务即将完成时点击取消，服务端若已先完成，会按终态保护原样返回 `COMPLETED` run；取消按钮处理器只更新状态栏，不调用结果渲染。页面会显示“已完成”，却仍看不到该任务已经落库的结论与证据，必须再点历史记录或刷新才能恢复。

**Evidence:** `ResearchRunStore.cancel()` 只在非终态时写 `CANCELLED`，否则直接返回现有 run（`deep_reading.py:262-281`）；取消端点把该 run 原样回包（`app_server.py:5061-5075`）。前端正常轮询路径同时调用 `renderStatus(activeRun)` 与 `renderResult(activeRun)`（`chat.js:1248-1253`），但取消成功路径只调用前者（`chat.js:1319-1327`）。现有深度共读前端测试仅用正则检查取消异常的上下文隔离，没有覆盖取消响应为 `COMPLETED` 的竞态（`tests/frontend/deep-reading-workbench.test.js:108-110`）。

**Why:** 后端为防止取消覆盖已完成结果而保留 COMPLETED 是正确的；前端漏渲染却把“数据已完成”表现成“只有状态没有结果”，直接削弱 Theme 3 的结果可信与可恢复性。最小修复是在取消回包后与 `loadRun()` 一样同时渲染 status/result，并按终态清理轮询、刷新历史。

**Size:** S

**Files:** `deep_reading.py:262-281`; `app_server.py:5061-5075`; `chat.js:1248-1260,1319-1327`; `tests/frontend/deep-reading-workbench.test.js:108-110`

**Northstar:** 强——避免已经生成并持久化的研究结果在最敏感的完成/取消边界上从界面消失，直接保护深度回顾的可信度；因远端编号无法安全刷新，本轮不提拔。

### E297 — 同一上下文切换历史任务时，较早请求的迟到响应可覆盖用户刚选中的任务 (S)

**What:** `researchContextRevision` 只在书/摘抄上下文改变时递增。同一本书内，运行中任务 A 的轮询请求尚未返回时，用户点击历史任务 B，两次 `loadRun()` 使用相同 revision；若 A 后返回，它会重新覆盖 B 的状态与结果，并可能继续为 A 安排轮询。用户明确选择的历史任务因此被旧请求抢回。

**Evidence:** `loadRun()` 只以 `revision !== researchContextRevision` 丢弃响应，随后无条件覆盖全局 `activeRun` 并渲染（`chat.js:1248-1260`）；历史点击只捕获同一个上下文 revision 后直接调用 `loadRun()`，没有 run-level request token 或 selection revision（`chat.js:1331-1336`）。OPT-168 的当前回归只模拟 A→B 书籍上下文切换，因此 revision 会变化；没有覆盖同一本书内 run A→run B 的响应乱序（`tests/frontend/deep-reading-workbench.test.js:37-106`）。

**Why:** 历史回顾的基本契约是最后一次选择生效。可增加 `activeRunRequestRevision`，每次显式选择、新建、取消或轮询时携带目标 run id，只允许仍为当前选择的响应写 UI；这与已完成的跨书 context revision 互补，不改变后端。

**Size:** S

**Files:** `chat.js:1248-1260,1331-1336`; `tests/frontend/deep-reading-workbench.test.js:37-106`

**Northstar:** 强——阻止同一书的旧研究结果覆盖用户正在核验的新选择，保护结论归属与历史回顾连续性；无真实触发 signal，暂留探索池。

### E298 — 深度共读历史首次读取失败后只有死胡同文案，没有原地重试 (S)

**What:** 历史列表请求遇到一次瞬断或 5xx 后，会把列表替换成“暂时无法读取历史任务。”，但页面没有重试按钮，也没有定时重试；用户必须切换模式或上下文才能再次触发 `loadHistory()`。

**Evidence:** `loadHistory()` 的 catch 只写固定错误文案（`chat.js:1273-1288`）；事件绑定只有模式切换、上下文变化和任务终态会再次调用它（`chat.js:1159-1190,1257-1260,1357-1362`），错误文案本身无按钮或事件。`#researchHistoryList` 只是普通容器（`index.html:241-244`），现有工作台测试也未覆盖历史失败后的恢复操作（`tests/frontend/deep-reading-workbench.test.js:12-110`）。

**Why:** 旧研究结果是 Theme 3 的积累资产，一次临时网络错误不应把本次页面会话变成无法恢复的历史入口。可在错误态渲染“重试”按钮并保留当前 context revision，点击只重跑当前上下文历史请求。

**Size:** S

**Files:** `chat.js:1159-1190,1257-1288,1357-1362`; `index.html:241-244`; `tests/frontend/deep-reading-workbench.test.js:12-110`

**Northstar:** 中——提高历史回顾在移动网络瞬断下的自恢复能力，但暂无真实失败 signal，不提拔。

### E299 — 每次研究建议审批都对用户全部 `research_runs.result_json` 做不可索引的 LIKE 扫描 (M)

**What:** 为把 action 新状态同步回研究结果卡，审批/忽略路径按 user_id 取出 `result_json LIKE '%action-id%'` 的所有候选 run，再逐条 JSON 解析和遍历 proposal。action 与 research run 没有结构化关联列；随着研究历史累积，每次保存建议的成本线性增长，JSON 文本匹配也无法利用现有索引。

**Evidence:** `sync_research_action_result()` 使用 `WHERE user_id = ? AND result_json LIKE ?`，随后逐行 `json.loads` 并遍历 proposals（`app_server.py:3656-3678`）。`research_runs` schema 只有 `(user_id, created_at DESC)` 索引，没有 action/run 关联表或 action id 列（`app_server.py:576-608`）。该同步函数会在 approve 与 reject 状态迁移后执行（`app_server.py:6322-6412`）。

**Why:** 当前历史量小，不是立即的用户故障；但深度共读若成为持续回顾入口，审批一次建议不应扫描全部历史 JSON。更稳妥的结构是 proposal/action 创建时保存 `research_run_id` 关联，状态迁移后按主键只更新一个 run；涉及 schema 迁移与兼容旧记录，故评为 M。

**Size:** M

**Files:** `app_server.py:576-608,3656-3678,6322-6412`; 相关 deep-reading/action tests

**Northstar:** 弱中——降低长期历史增长后的审批延迟与代码脆弱性，但当前无性能 signal，留作代码健康方向。

> 本次 run 新发现 4 条：E296（完成/取消竞态漏渲染结果，S，correctness）、E297（同上下文历史请求乱序覆盖，S，correctness）、E298（历史失败无原地重试，S，error handling/UX）、E299（建议状态同步线性扫描 JSON，M，performance/code health）。E296/E297 证据最强，但远端编号无法安全刷新且当日实现预算已满，本轮只追加探索，不修改 backlog。

## 2026-08-28

> 扫描焦点：沿 2026-08-27 owner“摘抄与笔记卡片不易区分”的真实 signal，核对摘抄页在类型辨认之外的筛选反馈、卡片可达性与规模化浏览边界。隔离 clone 当前 `HEAD` 与现存 `origin/feature/agent` 引用均为 `361a1e7`，已包含当日 triage；用户提供的 open PR 数据为空或不可用，本轮不据此臆造状态。已核对 backlog 最大 OPT-173、旧 E001–299、最近提交与当前实现；以下方向不重复 OPT-158/173、OPT-046/147 或旧 E70/E126/E202/E291/E294。

### E300 — 摘抄筛选零结果仍提示“还没有摘抄”，把搜索无命中误报成数据为空 (S)

**What:** 用户输入搜索词或切到“摘抄/笔记”类型后若没有匹配项，页面仍显示“还没有摘抄卡片，点左上角加号新增一张”。即使账号里已有另一类型或其他关键词的卡片，也会被描述为从未积累，且零结果区没有直接清除筛选的入口。

**Evidence:** `renderQuotes()` 已读取当前类型与搜索词并执行两层过滤（`app.js:2079-2097`），但 `quotes.length === 0` 时无条件写入同一新增提示（`app.js:2099-2102`）。页面虽有独立“清除全部筛选”按钮（`index.html:140-143`），空状态本身不像书单零结果那样提供恢复按钮；书单已按“完全无数据/筛选无命中”分支处理并在后者绑定清除入口（`app.js:1880-1891`）。现有 `search-field-bundle` 与 `clear-filters` 测试覆盖搜索字段和清除函数，没有锁定摘抄零结果文案的语义分支。

**Why:** 最新 signal 发生在摘抄页的卡片辨认与浏览过程；当用户用现有类型 chip 辅助辨认时，零结果不应反过来暗示积累丢失。最小修复是区分“state 中确实没有常规摘抄/笔记”和“当前筛选无匹配”，后者显示搜索/类型无命中并提供原地清除。

**Size:** S

**Files:** `app.js:1880-1891,2079-2102`; `index.html:135-143`; `tests/frontend/search-field-bundle.test.js`; `tests/frontend/clear-filters.test.js`

**Northstar:** 中——减少回顾已有卡片时的误解和恢复成本，贴近最新真实浏览 signal；但 owner 未直接反馈零结果，因此暂不提拔。

### E301 — 摘抄卡整卡只支持点击，键盘无法打开详情 (S)

**What:** 摘抄卡用 `<article>` 承担整卡打开详情的交互，但没有链接/按钮语义、`tabindex` 或 Enter/Space 处理。触摸和鼠标用户可点卡片正文进入详情，键盘用户只能到达卡内的“操作菜单”，无法使用主要的整卡入口。

**Evidence:** 每张卡输出为无可聚焦属性的 `<article class="quote-grid-card" data-quote-id>`（`app.js:2119-2140`）；列表委托只监听 `click`，命中卡片后调用 `openQuoteDetail()`（`app.js:6609-6627`），没有对应 `keydown` 委托。当前卡片测试只验证 quote/note 视觉 class 与装饰符号（`tests/frontend/quote-card-image-thumb.test.js:138-153`），未覆盖键盘打开详情。旧 E294 是关联页两端实体导航，本项是最新 signal 指向的摘抄卡片墙，不是同一交互面。

**Why:** 卡片详情承载完整原文、我的理解、标签及后续编辑/探讨动作；若主要入口不可键盘到达，视觉区分改善也无法让非指针用户完成同一回顾路径。可将正文入口改为语义 button/link，或为 article 补 role、tabindex、可辨识名称与 Enter/Space 委托，并保留菜单事件隔离。

**Size:** S

**Files:** `app.js:2119-2140,6609-6627`; `tests/frontend/quote-card-image-thumb.test.js`; 相关 accessibility tests

**Northstar:** 中——补齐摘抄回顾主入口的键盘可达性，但没有辅助技术用户 signal，暂留探索池。

### E302 — 摘抄类型筛选只切换视觉 class，辅助技术不知道当前选中项 (S)

**What:** “全部/摘抄/笔记”三个按钮以 `.active` 表示选择状态，点击和“清除全部筛选”都只改 class；DOM 没有 `aria-pressed`、`aria-current` 或单选组语义。读屏用户能听到三个普通按钮，却无法确认当前正在看全部、摘抄还是笔记。

**Evidence:** 三个筛选按钮只有 `class` 与 `data-quote-type`（`index.html:135-139`）。点击处理移除/添加 `.active` 后重渲染（`app.js:6587-6592`），清除函数同样只 toggle class（`app.js:1818-1826`）；两条路径都不更新任何可访问状态。旧 OPT-046/E70 针对全局 Tab 导航，本项是摘抄内容类型筛选，语义和作用域不同。

**Why:** 最新 owner signal 正是两种内容类型难区分；视觉样式只能服务看得见差异的用户，筛选控件本身也应以程序化状态明确当前类型。最小实现可为按钮维护互斥 `aria-pressed`，并让点击与清除共用一个状态同步 helper，避免视觉与语义分叉。

**Size:** S

**Files:** `index.html:135-139`; `app.js:1818-1826,6587-6592`; `tests/frontend/clear-filters.test.js`; 相关 accessibility tests

**Northstar:** 中——与类型辨认 signal 同源并补齐非视觉通道，但属于 OPT-173 视觉方案之外的无障碍收口，缺直接辅助技术 signal，不单独提拔。

### E303 — 摘抄墙一次渲染全部卡片，积累增长后首屏工作量无上限 (M)

**What:** 摘抄页会对所有匹配卡片一次性 `map().join()` 并替换整个列表；没有页大小、加载更多或增量渲染。每张卡渲染时还会计算关联数和探讨数，长期积累越多，任一搜索输入或类型切换触发的整页重建成本越高。

**Evidence:** 过滤和排序后的完整 `quotes` 数组直接进入 `quotes.map(...).join("")`（`app.js:2082-2106,2140-2142`），函数内没有 `slice`、display limit 或加载更多分支；搜索每次防抖后重跑 `renderQuotes()`（`app.js:6583-6585`），类型切换也立即整页重跑（`app.js:6587-6592`）。卡片模板分别调用 `getConnectionCount()` 与 `getQuoteChatCount()` 生成徽标（`app.js:2137`）。OPT-147 只为书单加入首屏 24 张分页；旧 E126/E202 只讨论计数遍历，本项聚焦摘抄墙 DOM 数量和整页替换边界。

**Why:** 产品北极星要求摘抄持续积累并回流，列表规模不应反过来惩罚长期使用。可复用书单的稳定分页模式，默认渲染固定批次并提供“加载更多”；搜索结果是否分页需单独定义，避免隐藏精确命中。

**Size:** M

**Files:** `app.js:2082-2142,6583-6592`; `tests/frontend/quote-content-display.test.js`; `tests/frontend/search-field-bundle.test.js`; 可参考 `app.js:1895-1923`

**Northstar:** 弱中——长期保护摘抄回顾性能，但当前没有性能或卡顿 signal，不提拔。

> 本次 run 新发现 4 条：E300（筛选零结果误报为无积累，S，UX/error feedback）、E301（摘抄卡详情入口不可键盘访问，S，accessibility）、E302（类型筛选状态不向辅助技术暴露，S，accessibility）、E303（摘抄墙无分页且整页重建，M，performance/code health）。四项均由当前文件逐行核实并排除 backlog、旧 Explore 与最近合并目标；open PR 状态不可用，未作推断。最新真实 signal 已由 OPT-173 完整登记，而本轮相邻缺口缺少同等强度的直接证据，因此不修改 backlog、不占用 OPT 编号。

## 2026-08-29

> 扫描焦点：核对 2026-08-28 新上线的“我的 / AI 阅读洞察”是否与同批移除独立记录页后的真实使用口径一致，并检查跨书主题、异步刷新与服务端数据边界。隔离 clone 当前 `HEAD` 与现存 `origin/feature/agent` 引用均为 `6a6268a`，最大编号为 OPT-173；`git fetch origin feature/agent` 因 `.git/FETCH_HEAD` 只读失败，`git ls-remote` / `gh pr list` 又因 github.com 无法解析而失败。按用户提供的 open PR #136 核对后，以下方向均不重复其 OPT-171 畸形关联隔离范围，也不重复 backlog、已合并代码或旧 E001–303。

### E304 — “阅读动力”只统计手工记录，移除记录页后持续摘抄仍会显示本周 0 分钟 (M)

**What:** “阅读动力”八周柱状图只遍历 `state.sessions` 并累计 `minutes`。同一批改动已经移除独立记录页，而 owner 也明确表示几乎不手工新增记录；因此用户本周即使持续拍照摘抄、留下带时间和页码的真实阅读痕迹，只要没有另行填写 session，洞察仍显示“0 分钟/本周”并判断阅读记录不足。

**Evidence:** `readingInsightMetrics()` 的周数据来源只有 `state.sessions`（`app.js:1382-1398`），卡片主数值直接展示 `metrics.thisWeekMinutes`（`app.js:1459-1462`）；默认解释又以八周分钟是否大于 0 判断活跃周（`app.js:1428-1437`）。独立记录页已从一级导航移除，当前“我的”主页面把该指标放在首张洞察卡（`index.html:248-260`）。真实 signal 已记录“记录功能几乎很少使用，因为手动新增记录太麻烦；考虑取消记录页面”（`optimization/signals.md:68-74`）。旧 E192 讨论以摘抄重建时间线，本项是已上线洞察在记录页下线后的确定性口径错配。

**Why:** 首张个人洞察若把“没有手工填分钟”说成“没有阅读动力”，会惩罚产品已经选择的低负担采集路径，也让可分享洞察失真。可先定义诚实口径：有 session 时展示分钟趋势；没有 session 但存在当周摘抄时改为“活跃阅读天数 / 新增摘抄”趋势，不能用摘抄时间臆造分钟。需要同步调整本地叙述、分享卡和测试，故评为 M。

**Size:** M

**Files:** `app.js:1376-1438,1458-1478,3892-3920`; `index.html:248-260`; `optimization/signals.md:68-74`; `tests/frontend/reading-insights-dashboard.test.js:11-47`

**Northstar:** 强——直接让最新洞察忠实反映 owner 实际采用的摘抄式阅读路径，避免回顾入口把真实使用误报为零。→ **promoted to OPT-174**

### E305 — “跨书主题”只把关联标签计入来源书，书与书的关联仍被算成单书主题 (S)

**What:** 兴趣图谱把书籍、摘抄和关联标签聚合成“跨书主题”，但处理 connection 时只解析来源端所属书，从不解析目标端。同一个标签若只存在于一条书 A→书 B 或摘抄 A→摘抄 B 的关联上，`bookCount` 仍为 1，无法成为真实的跨书主题。

**Evidence:** `addTheme()` 用 `Set` 统计 book id（`app.js:1400-1406`）；书籍与摘抄标签分别计入自身所属书，但 connection 分支只查 `connection.sourceId`，随后只添加来源书（`app.js:1407-1412`）。UI 将结果明确命名为“跨书主题 / 兴趣图谱”并展示“n 本”（`app.js:1469-1472`）。当前测试只以源码正则确认四类洞察、接口与布局，没有构造双端关联来断言主题计数（`tests/frontend/reading-insights-dashboard.test.js:11-36`）。

**Why:** 关联正是用户显式表达“两本书共享某个主题”的数据；只计来源端会系统性低估知识网络。可复用连接实体解析逻辑，把 source/target 两侧落到各自 bookId 后都加入 Set，同时过滤悬空实体。

**Size:** S

**Files:** `app.js:1400-1416,1469-1472`; `tests/frontend/reading-insights-dashboard.test.js:11-36`

**Northstar:** 中强——修正“兴趣图谱”对既有跨书关联资产的解释，服务 Theme 3「积累可信」；但暂无 owner 对该图计数的直接反馈，暂不提拔。

### E306 — 洞察请求期间数据变化时，旧响应会留下“AI 已结合当前数据”的假成功状态 (S)

**What:** 请求发出后若用户在另一入口新增/编辑阅读数据，回包仍保存旧指标签名并调用 `renderSummary()`；新状态因签名不同会正确回落本地叙述，但状态栏无条件宣称 AI 已结合“当前数据”。数值没有被旧响应覆盖，反馈文案却把未展示的旧解读报成当前成功。

**Evidence:** 请求前固定捕获 `metrics/cacheKey`（`app.js:1498-1502`）；回包后无论当前 state 是否仍匹配，都写全局 narrative/key、重绘，并写成功文案（`app.js:1519-1526`）。`renderSummary()` 只有 narrative key 等于重新计算的当前 key 才合并 AI 文案（`app.js:1441-1445`），证明数据变化时旧回包实际不会显示。现有测试仅检查“按数据签名缓存”和降级文案，没有覆盖请求中 state 变化（`tests/frontend/reading-insights-dashboard.test.js:26-31`）。

**Why:** 最小修复是在应用响应前重算 key；已过期则丢弃并按最新状态重新分析或明确提示数据已变化。这样状态栏、实际卡片与缓存三者保持同一版本。

**Size:** S

**Files:** `app.js:1441-1445,1491-1535`; `tests/frontend/reading-insights-dashboard.test.js:26-31`

**Northstar:** 中——避免最新回顾入口出现“状态说已分析、卡片实际未使用”的反馈错位，但触发窗口短且无真实 signal，不提拔。

### E307 — 阅读洞察服务端不核验指标结构，客户端可把任意聚合 JSON 送入模型并生成可分享解读 (M)

**What:** 接口只确认 `metrics` 是非空 dict 且序列化后不超过 8000 字符，不验证 weeks 长度/数值、结构计数、theme 字段或漏斗口径。已登录客户端可绕过本地确定性计算，直接提交任意 JSON；模型会把它当“聚合统计”解释，而前端分享图又以“数字来自阅读记录”标注，服务端无法证明该语义。

**Evidence:** `/api/reading-insights` 的唯一 payload 校验是 dict、非空和长度（`app_server.py:5151-5165`），之后原样拼进 prompt（`app_server.py:5168-5177`）。端点测试也只证明任意小型 `weeks/themes` dict 会被转发，并未锁定完整 schema（`tests/agent/reading_insights_test.py:58-79`）。前端正常路径确实由 `readingInsightMetrics()` 生成固定结构（`app.js:1376-1425`），分享图则写“数字来自阅读记录，AI 只解释趋势”（`app.js:3907-3917`）。

**Why:** 当前风险主要是口径与成本边界，不是越权读取，因为回包不落库且有限流。可选择服务端从用户 state 重算指标，或至少严格校验固定 schema、数值范围与数组长度；前者可信度更强但会重复计算逻辑，因此评为 M。

**Size:** M

**Files:** `app_server.py:5151-5181`; `app.js:1376-1425,3907-3917`; `tests/agent/reading_insights_test.py:58-79`

**Northstar:** 中——保护可分享个人洞察的来源声明与模型调用边界，但正常 UI 不会触发且无滥用 signal，暂不提拔。

> 本次 run 新发现 4 条：E304（阅读动力与已下线记录页口径冲突，M，correctness/UX）、E305（跨书主题漏算关联目标端，S，correctness）、E306（旧 AI 响应产生假成功状态，S，error feedback）、E307（服务端不校验聚合指标结构，M，trust boundary/code health）。仅 E304 同时具备当前新功能、owner 直接 signal 与强北极星贡献，提拔为 OPT-174；其余留探索池。受隔离环境限制未刷新远端，编号依据现存 `origin/feature/agent` 最大 OPT-173；若远端已前移，后续 triage 必须先重新编号。

## 2026-08-30

> 扫描焦点：核对账号数据生命周期（注销/删除）、阅读足迹是否仍可达（记录页下线后）、以及长期增长后的代码健康。隔离 clone 当前 `HEAD` 为 `29792ba`，本地 backlog 现存最大 OPT 编号为 **OPT-174**；`gh`/`git ls-remote` 因网络不可用失败，open PR 状态未知，未据此推断。以下方向均已用当前文件逐行核实，并排除 backlog、已合并代码、旧 E001–307 重复。

### E308 — 注销账号用原生 `window.prompt` 二次确认，iOS Safari 不支持 `prompt` → iPhone 上永远无法注销 (S)

**What:** 注销账号的二次确认用 `window.prompt(...)` 让用户输入用户名。iOS Safari 不实现 `window.prompt`，调用恒返回 `null`，于是 `typed !== expected` 恒为真，永远走「用户名不匹配，已取消」。iPhone（本项目主平台）上的用户**无法完成账号注销**。

**Evidence:** `deleteAccount()` 先弹自定义 `showConfirmDialog`（`app.js:4962-4967`），确认后再调用原生 `window.prompt`（`app.js:4968`），随后 `if (typed !== expected) { showToast("用户名不匹配，已取消"); return; }`（`app.js:4969-4972`）——没有 iOS fallback。入口在账号抽屉 `#deleteAccountBtn`（`app.js:109`、`app.js:6881`）可达。`/api/account` DELETE 端点要求 `confirmUsername`（`app.js:4977`），服务端校验也需要前端先拿到匹配的用户名。旧 OPT-062 只覆盖 6 处删除入口的 Escape 清理，未覆盖 `window.prompt` 的平台兼容；当前没有任何针对 `window.prompt` 的测试或分支。

**Why:** 完整账号导出/删除是商业化路线的 P0/GDPR/PIPL 要求（cerebrum 有明确约定）；数据权利在唯一主平台失效是确定性缺陷，且 `prompt` 属已知 WebKit 不支持 API。最小修复：把用户名输入改用项目内已有确认对话框样式（如给 `showConfirmDialog` 加一个可选文本输入槽），或提供输入框 + 校验，替换原生 prompt，并在 iOS 真机与测试中验证。

**Size:** S

**Files:** `app.js:4962-4990,109,6881`; `index.html`(账号抽屉 `#deleteAccountBtn`); `tests/frontend/regression-fixed-bugs.test.js`

**Northstar:** 强——修复主平台无法行使的数据权利（账号注销），属 Theme 3「积累可信」与合规基线的确定性缺口，无 owner 决策分歧。→ **promoted to OPT-175**

### E309 — `app.js`(7180 行)与 `app_server.py`(6807 行)双双超过 roadmap §3 的 6500 行拆分闸门 (M)

**What:** roadmap §3「架构守门人」规则写明 `app_server.py` **超 6500 行**或单函数超 150 行才拆；两个主文件当前都已越线，且无拆分计划跟进。

**Evidence:** `wc -l` 实测 `app.js` = 7180 行、`app_server.py` = 6807 行（均 > 6500）。`app.js` 含 ~289 个函数声明（`grep -c "^function"`），`app_server.py` 单文件承载 agent 管线、OCR、billing、auth、GC 等全部后端职责。triage/backlog 中与「拆分」相关的既有项（OPT-032/035/036/044/124 等）都指向 GC/时间戳/内部运营，没有一条是「按架构闸门拆文件」的跟进项。

**Why:** 两文件持续增长会让新功能改动冲突面与 review 成本上升；架构守门人规则既已写明闸门，越线后应至少登记一个显式的拆分候选（如先把 `app_server.py` 的 billing/auth 或 agent 管线拆出），避免闸门形同虚设。

**Size:** M（拆分本身 L，登记候选为 M）

**Files:** `app.js`; `app_server.py`; `optimization/roadmap.md:89`(闸门规则)

**Northstar:** 弱——纯代码健康，对北极星与 owner 真实使用无直接贡献，不提拔。

### E310 — 记录页下线后，跨书的整条阅读历史时间线不再可达，`renderTimeline` 沦为死代码 (M)

**What:** 「记录」页已从一级导航移除（信号 8/13「评估移除记录页面」），而移动端 Tab 现在只剩 书单/摘抄/探讨/关联/我的。曾作为「回顾」主面的整条阅读时间线（OPT-077 里程碑 + OPT-076 加载更多 + OPT-112 日期搜索）失去所有用户入口，仅每本书详情内仍可见单书 session。

**Evidence:** 移动 Tab 导航 `index.html:884-903` 只有 `books/quote/chat/connections/me`，无 timeline/records。`renderTimeline()` 以 `if (!els.timeline) return;` 早退（`app.js:2110-2112`），而 `#timeline` 元素在 `index.html` 已不存在（`grep timeline index.html` 零命中），`els.timeline = document.querySelector("#timeline")`（`app.js:113`）恒为 null——于是 4 处 `renderTimeline()` 调用（`app.js:1999,2252,2601,4207`）全部空转。OPT-174 只补了聚合洞察，未恢复逐条历史浏览。

**Why:** 这是「记录页移除」与「时间线曾深度投入」之间的产品张力：数据未丢（书详情、洞察仍在），但 110 本导入书的 `finishedAt` 里程碑不再有全局浏览入口，Theme 2「回顾有价值」的承接面收窄。需 owner 决策是否接受，或把时间线作为摘抄/书的嵌入式视图恢复；当前以死代码形式保留渲染器不划算。

**Size:** M

**Files:** `app.js:113,1999,2110-2197,2252,2601,4207`; `index.html:884-903`; `optimization/signals.md:68-74`(8/13 记录页信号)

**Northstar:** 中——涉及回顾主面是否保留，但本质是产品取舍且数据未丢，缺 owner 明确决策，不提拔。

### E311 — 书单主搜索框只搜书，无法按内容命中摘抄 (S)

**What:** 首页书单的搜索框（`#booksSearchInput`）触发 `globalSearch()`，后者只调 `matchBooks()` 渲染书结果，不搜摘抄正文/标签/我的理解。用户想按一句话找回摘抄，必须切到「摘抄」页再用那里的搜索，主搜索框给不出跨书内容命中。

**Evidence:** `#booksSearchInput` 的 `input` 事件 200ms 防抖后调 `globalSearch(event.target.value)`（`app.js:6947-6952`）；`globalSearch()` 只执行 `renderSearchResults(matchBooks(normalized))`（`app.js:2024-2042`），没有合并 quotes 结果。`app.js:1760` 注释明确「Intentionally NOT wired into globalSearch()」说明这是有意的克制，但这也意味着用户在主搜索框无法通过正文找到摘抄。旧 OPT-092/083/088/096/097 是摘抄/关联**页内**搜索，非主搜索框的跨类型召回。

**Why:** Theme 2「回顾有价值」核心是「按内容找回旧摘抄」；主搜索框只覆盖书，跨书按摘抄内容检索的唯一入口藏在摘抄页，发现成本高。可评估主搜索下拉合并书籍+摘抄两类结果，或至少在空书结果时提示「去摘抄页按正文搜索」。

**Size:** S

**Files:** `app.js:2024-2042,6947-6952,1760`; `tests/frontend/global-search.test.js`

**Northstar:** 中——提升回顾检索发现度，但「主搜索是否跨类型」属交互设计选择且当前各页已有独立搜索，缺直接 signal，不提拔。

### E312 — 关联弹窗的书籍 combobox 没有清除按钮，误选来源书后无法一键取消 (S)

**What:** 摘抄下拉（`initQuoteCombobox`）有显式的 `.quote-combobox-clear` 清除按钮（选中后出现、点击清空），而书籍下拉（`initBookCombobox`）没有对应的清除入口。用户误选来源/目标书后，只能重打关键字或接受错误选择，不能一键取消。

**Evidence:** `initQuoteCombobox` 查询并绑定 `clearButton = wrapperEl.querySelector(".quote-combobox-clear")`，`pick()` 时显示、点击清除（`app.js:6148,6276,6338-6342`）；`initBookCombobox`（`app.js:6029-6143`）只查询 `.book-combobox-input/.list`，无 `clearButton` 逻辑。8/24 signal「误选其他摘抄后又很难删除」同源的「误选后取消」摩擦，在书的一侧仍无显式出口（键入会清空 hiddenInput，但无可见清除控件）。旧 E290/E295 覆盖「候选排除已选来源」与「类型切换清空」，未覆盖书下拉的清除控件。

**Why:** 关联录入是 8/24/8/25 信号集中指向的摩擦面；书侧缺清除按钮让「改选/放弃」成本高于摘抄侧。最小修复是给 `initBookCombobox` 补与 quote 一致的可选 clear 按钮。

**Size:** S

**Files:** `app.js:6029-6143,6148,6276,6338-6342`; `index.html`(关联弹窗 combobox 模板); `tests/frontend/combobox-single-open.test.js`; `tests/frontend/connection-entry-ux.test.js`

**Northstar:** 弱中——改善关联录入误选恢复，但已有键入清空的隐式路径，缺 owner 对该具体控件的反馈，暂不提拔。

> 本次 run 新发现 5 条：E308（注销账号用原生 prompt，iOS Safari 不支持 → iPhone 上无法注销，S，platform/error handling）、E309（app.js/app_server.py 双双超 6500 行架构闸门，M，code health）、E310（记录页下线后整条阅读时间线不可达，renderTimeline 死代码，M，UX/product tension）、E311（主搜索框只搜书不搜摘抄正文，S，retrieval/UX）、E312（关联书下拉缺清除按钮，S，UX）。五项均由当前文件逐行核实并排除 backlog、旧 Explore 与最近合并目标；open PR 状态不可用，未作推断。仅 E308 具备主平台确定性缺陷 + GDPR/PIPL 数据权利 + 强北极星贡献，提拔为 OPT-175；其余留探索池。

## 2026-08-31

> 扫描焦点：沿 2026-08-24/08-25 owner 建立关联的两条真实 signal（目标/来源摘抄难选、目标结果全同一本书）与当前 Theme 3「积累可信」核对关联选择器、摘抄保存/删除与标签解析的一致性。隔离 clone 当前 `HEAD` 为 `2d96b09`，本地 backlog 现存最大 OPT 编号为 **OPT-175**；`gh`/`git ls-remote` 因网络不可用失败，open PR 状态未知，未据此推断。以下方向均由当前文件逐行核实，并排除 backlog（OPT-169/170/171/172/173/175）、旧 E001–312 与最近合并目标重复。

### E313 — 关联目标摘抄检索结果被单本书挤占，其他书匹配无法浮现 (M)

**What:** 目标选「摘抄」输入关键词后，结果按匹配强度与一个“非来源书”布尔值排序后截断前 30 条，不做按书分组或每书上限。若某本书恰好命中最多的关键词，30 个槽位可能全部来自这一本，用户想关联的另一本书的摘抄始终排不进来。

**Evidence:** `filteredQuotes()` 的排序键只有 `matchedTerms → exact → Number(sourceBookId && bookId!==sourceBookId)（0/1 布尔）→ index`，随后 `.slice(0,30)`（`app.js:6208-6212`）；没有按 `item.bookId` 聚类、每书上限或“本书记 N 条”提示，`buildList()` 平铺渲染（`app.js:6229-6253`），书名只是左侧小标签（`app.js:6236-6240`）。OPT-172（done 8/26）补的是跨书多词检索与目标书范围，未覆盖结果多样性。

**Why:** 这是 2026-08-25 signal「目标选摘抄，出来的全是同一本书的摘抄」在当前代码里的最直接复现：来源在书 A 且范围“其他书”时，只要书 B 命中数最高，30 条全来自书 B，其他匹配书永远不出现。跨书检索能力已落地，但“跨书可见”这一步仍缺失。

**Size:** M

**Files:** `app.js:6208-6212,6219-6253`; `tests/frontend/quote-combobox-ocr-label.test.js`; 可参考书单跨书排序

**Northstar:** 强——直接命中 8/25 真实 signal，修的是 OPT-172 已承诺但未兑现的“跨书”语义。→ **promoted to OPT-176**

### E314 — 关联来源摘抄下拉缺清除按钮，误选来源后只能重打关键词 (S)

**What:** 关联弹窗里只有**目标**摘抄下拉带显式「清除」按钮；**来源**摘抄下拉（到达关联页那一侧）没有对应控件。误选来源后无法一键取消，只能点进字段删字重打，重打又重开候选列表、重冒误选风险。

**Evidence:** 目标侧模板渲染 `.quote-combobox-clear` 清除按钮（`index.html:859-862`），来源侧镜像模板只有 input/`<ul>`/hidden input，无清除按钮（`index.html:821-825`）。`initQuoteCombobox` 抓 `wrapperEl.querySelector(".quote-combobox-clear")`（`app.js:6148`），来源 wrapper 命中 `null`，`pick()`/`_comboboxReset` 均用 `?.` 保护（`app.js:6273-6278,6325-6336`），即来源侧静默零清除能力。E312 只覆盖**书**下拉缺清除按钮，本项是来源**摘抄**下拉的同源缺口。

**Why:** 直接呼应 2026-08-24 signal「误选其他摘抄后又很难删除」。来源侧是用户进入关联页的起点，误选后的纠正成本与目标侧不对等。

**Size:** S

**Files:** `index.html:821-825,859-862`; `app.js:6148,6273-6278,6325-6336`; `tests/frontend/connection-entry-ux.test.js`

**Northstar:** 中——改善关联录入误选恢复，与 8/24 signal 同源，但 E312 已在探索池覆盖相邻的书下拉，来源摘抄一侧缺直接 owner 反馈，暂不提拔。

### E315 — 关联目标「其他书（推荐）」范围在来源为书时静默失效 (S)

**What:** 目标范围「其他书（推荐）」只会在**来源是摘抄**时排除来源书；当用户从**书**（而非摘抄）进入关联并选摘抄为目标时，该排除条件永不触发，“其他书”实际不过滤任何内容，来源书自己的摘抄仍留在列表，而 UI 仍把它标注为“推荐”。

**Evidence:** `sourceQuote()` 只在来源为摘抄时返回实体（`app.js:6185-6188`），来源为书时 `sourceBookId` 为空串（`app.js:6195`）；排除条件是 `scope === "other" && sourceBookId && String(item.bookId) === sourceBookId`（`app.js:6205`），`sourceBookId` 为空时恒不排除。`index.html:855` 将该选项标注为「其他书（推荐）」。

**Why:** 书进入关联（入口 `app.js:1895` 等）是常见路径，UI 承诺的“排除来源书”在书来源时落空，并与 E313 的单书挤占相互放大。

**Size:** S

**Files:** `app.js:6185-6206`; `index.html:855`; `tests/frontend/connection-entry-ux.test.js`

**Northstar:** 中——修正关联范围语义与标签不符的确定性错配，贴近 8/24/8/25 信号面，但缺 owner 对该控件的直接反馈，暂不提拔。

### E316 — 摘抄/OCR 保存失败仍关闭弹窗并清空草稿，OCR 修正文本静默丢失 (L)

**What:** `addQuote` 在真正落库成功**之前**就关闭弹窗、清空草稿（含已 OCR 修正的文字与两张待存图片的 objectURL），随后才 `syncState()`；若网络瞬时失败（非 409），卡片仍因先行 `renderQuotes()` 渲染在列表里，失败只弹底部 toast，草稿已无从恢复，刷新即消失。

**Evidence:** `closeDialog(els.quoteDialog)`（`app.js:4820`）+ `resetQuoteDraft()`（`app.js:4821`，`3057-3061` 清 `pendingQuoteImage`/`pendingQuoteImage2` 并 `revokeObjectURL`、`els.quoteForm.reset()`），随后 `renderQuotes()` + `showToast("保存中…")`（`app.js:4824-4828`）都在 `try { await syncState() }`（`app.js:4830-4843`）之前；`catch` 只 `showToast(error.message)`（`app.js:4850-4852`），无回滚、无重开弹窗、无草稿恢复。全库 grep 无 `navigator.onLine`/pending-write 队列。

**Why:** 当前 Theme 3「积累可信」要求 OCR 核对的修正内容可恢复；瞬时网络错误把用户手工校对过的整份草稿丢弃，是最贴近主题的数据安全缺口。后端 OCR 草稿落库逻辑（`app_server.py:5943-5950,6033-6037`）健壮，前端 review→save 路径不匹配。

**Size:** L

**Files:** `app.js:4768-4853,3056-3068`; `tests/frontend/quote-*` 相关

**Northstar:** 强——直接保护 Theme 3 下最重的积累资产（OCR 修正文本），但改动涉及保存时序/草稿恢复/失败重试，size L 需拆分，本轮不提拔。

### E317 — deleteQuote/deleteSession 失败不回滚，与 deleteConnection 语义不一致 (M)

**What:** `deleteQuote`/`deleteSession` 先在内存里把目标项 filter 出 `state`，再 `syncState()`；非冲突失败时只在 catch 里 toast，不回滚。此后任意一次成功的全量同步会把这次“用户被告知失败”的删除真正落库，结果与提示背离。`deleteConnection` 同场景却会回滚快照。

**Evidence:** `deleteSession` 先 `state.sessions = filter(...)`（`app.js:4202`）再 `syncState()`，catch 仅 `showToast(error.message)`（`app.js:4209-4211`）；`deleteQuote` 先 `state.quotes = filter(...)` 并连带过滤关联（`app.js:4222-4223`），catch 同样只 toast（`app.js:4228-4230`）。对照 `deleteConnection` 用 `connectionsBefore = structuredClone(...)` 并在 catch 里 `state.connections = connectionsBefore; renderConnections();`（`app.js:6442,6478-6479,6488-6491`）。确认对话框已存在（`app.js:4198-4221`，非缺确认问题）。

**Why:** 数据删除是不可逆操作，失败语义不应与“已删除”混同；OPT-170 已为关联建立回滚先例，摘抄/记录未对齐。属 Theme 3「积累可信」的一致性问题，无产品取舍分歧。

**Size:** M

**Files:** `app.js:4196-4233,6442,6478-6491`; `tests/frontend/connection-crud.test.js`; 摘抄删除相关测试

**Northstar:** 强——删除失败后果从“静默丢数据”修正为“保留原状并可重试”，与 OPT-170 先例一致，无 owner 决策分歧。→ **promoted to OPT-177**

### E318 — 标签解析分歧：normalizeTags 仅按逗号，addConnection 另按空格/中文逗号 (S)

**What:** 同一份用户输入在不同表单产生不同标签。书、摘抄、Excel 导入用 `normalizeTags` 只按 ASCII 逗号切分；建立关联用内联正则 `/[,，\s]+/`（逗号+中文逗号+空白）切分。同样写 `哲学 叙事`，摘抄/书表单得到**一个**标签，关联得到**两个**。

**Evidence:** `normalizeTags` 用 `.split(",")`（`app.js:657-662`，用于 `3145,4794,4806,5199,5765`）；`addConnection` 用 `tagsRaw.split(/[,，\s]+/)`（`app.js:6435`）。两者都落进同一 `state.tags` 结构（`app.js:6446,6451`），同一字段跨入口切分规则冲突，且无测试锁定任一行为。

**Why:** 用户在同一数据模型上得到不一致、不可预测的标签语义，属跨入口确定性分歧。最小修正是抽一个共享 `splitTags` 供 `normalizeTags` 与 `addConnection` 共用并定一条规范规则。

**Size:** S

**Files:** `app.js:657-662,6435`; `tests/frontend/`（无 normalizeTags 覆盖）

**Northstar:** 中——修正标签一致性与可预测性，无直接 owner signal，但属低成本的代码健康/正确性统一，暂不提拔。

> 本次 run 新发现 6 条：E313（关联目标摘抄检索被单书挤占，M，retrieval/UX）、E314（来源摘抄下拉缺清除按钮，S，UX）、E315（「其他书（推荐）」范围在书来源时静默失效，S，correctness）、E316（摘抄保存失败即清空 OCR 草稿，L，data-safety）、E317（deleteQuote/deleteSession 失败不回滚，M，data-safety/consistency）、E318（标签解析分歧，S，correctness）。六项均由当前文件逐行核实并排除 backlog、旧 Explore 与最近合并目标；open PR 状态不可用，未作推断。沿 8/24/8/25 关联信号，E313 命中「目标结果全同一本书」最直接复现、OPT-172 未兑现的跨书可见，提拔为 OPT-176；E317 与 OPT-170 删除回滚先例一致、Theme 3 数据安全无产品分歧，提拔为 OPT-177；其余（含 size L 的 E316）留探索池待 owner 或更直接证据。

## 2026-09-01

> 扫描焦点：沿当前 Theme 3「积累可信」（8/10–9/06）与 2026-08-24/08-25 建立关联的真实 signal，核对服务端写路径的数据完整性（乐观锁是否被绕过）、前端「保存/删除成功」提示与落库结果是否一致、移动端内存生命周期（objectURL 释放）与导入结果透明度。隔离 clone 当前 `HEAD` 为 `69542a4`（08-31 晚到 09-01 晨间 commit），本地 backlog 现存最大 OPT 编号为 **OPT-177**、最大 explore 编号为 **E318**；open PR 为 #138（OPT-175，注册窗内，未映射本批方向）。以下方向均由当前文件逐行核实，并排除 backlog（OPT-169/170/176/177、E48 孤立图片、OPT-133/E213 MCP 锁）、旧 E001–318 与最近合并目标重复。

### E319 — 服务端 OCR 写路径绕过乐观锁整表写 state，与用户并发编辑静默互踩 (L)

**What:** 异步 AI OCR 后台任务与同步快速 OCR 两条路径都以「整份 `state` 全量写回」方式落库，且不携带 `X-State-Version`、不做版本比对——前端 `/api/state` PUT 的 409 乐观锁（`do_PUT` `app_server.py:6645-6665`）在这两条写路径上被整体绕过。`_run_quote_ocr_job` 每次 `load_state(conn, user_id)` 重读当前 state 后 mutate 再无条件 `save_state`（`app_server.py:1824,1843`）；快速路径同样 `save_state`（`app_server.py:5980`）。一次 OCR LLM 调用耗时数十秒，若期间用户在另一标签页/设备编辑了任何摘抄/书，该次编辑会被任务读取到的旧快照整体覆盖，且不产生任何 409 或提示——纯静默丢编辑。

**Evidence:** `_run_quote_ocr_job` 内 `state = load_state(...)`（`app_server.py:1824`）→ 改 `quote["content"]/["tags"]/["ocrStatus"]`（`1827-1842`）→ `save_state(conn, user_id, state)`（`1843`），无版本参数；快速路径 `save_state(conn, user["id"], state)`（`5980`）同样无版本。对照 `do_PUT /api/state` 的 `X-State-Version` 校验（`6645-6665`），OCR 写路径完全不经它。同类的服务端全量写不带锁问题已有两条已知实例：ActionExecutor agent 动作（backlog OPT，`app_server.py:2956-3080` 附近）与 MCP `_save_state`（OPT-133/E213，`reading_mcp_server.py:75-80`），但这两条都不覆盖 OCR job/快速 OCR 路径，本项是新实例。

**Why:** 当前 Theme 3「积累可信」要求并发写不丢编辑；OCR 是高频、长耗时（数十秒）写路径，正是并发冲突的高发窗口，而它恰恰是唯一绕开乐观锁的后端写入口之一。把写路径统一收口到版本校验/冲突返回可消除这一类静默覆盖。

**Size:** L（涉 OCR job 并发语义与写路径统一，需拆分：先在 OCR 写前取版本、冲突时改为写入 `ocrText` 局部字段而非整表覆盖）。

**Files:** `app_server.py:1824-1843,5980`; 对照 `app_server.py:6645-6665`（do_PUT 版本校验）、backlog OPT-133/E213（同类先例）；`tests/agent/ocr_*` 相关

**Northstar:** 强——直接消除 Theme 3 下最贵的静默数据丢失（并发编辑被 OCR 写覆盖、无提示），确定性缺陷、无 owner 产品取舍。→ **promoted to OPT-178**

### E320 — 摘抄/书/记录保存与删除在 state_conflict 时仍播报成功，本地编辑被服务端状态覆盖且无提示（OPT-169 仅覆盖关联） (M)

**What:** `syncState()` 在 409 冲突时采用服务端最新 state、丢弃本地未同步编辑并 toast「数据已在其他设备更新」（`app.js:1184-1197`）。但摘抄/书/记录（session）的保存与删除调用方不看 `syncState()` 的 `{saved:false, reason:"state_conflict"}` 返回值，随后仍 toast 各自的操作成功——冲突提示被成功提示覆盖，用户以为已保存/已删除，实际编辑被静默丢弃。OPT-169 只对**关联**（connections）修了「冲突仍播报成功」；摘抄/书/记录三路未对齐。

**Evidence:** `addQuote` 里 `await syncState()`（`app.js:4843`）忽略返回值，随后 `showToast("摘抄卡片已保存")`（`4849`）；`addBook` 同样 `await syncState()`（`3157`）后 `showToast("书籍已保存")`（`3161`）；`deleteSession`/`deleteQuote` 也忽略返回并 toast 成功/删除完成（`4206,4209` / `4225,4228`）。对照 `addConnection`/`deleteConnection` 检查 `const result = await syncState()` 并据 `saved:false` 分支（`app.js:6458,6481`），即 OPT-169 已覆盖的连接侧会正确区分冲突。

**Why:** Theme 3「积累可信」要求「保存成功」与落库结果一致；冲突是跨设备（手机+桌面）常态，用户在提示「已保存」后刷新发现编辑消失是最伤信任的一类。修法一致、无产品取舍分歧，是 OPT-169 覆盖面的自然补齐。

**Size:** M（同一模式散落摘抄/书/记录多条写路径，需统一一个「检查 `syncState` 冲突返回值」的助手并在失败时不再播报成功）。

**Files:** `app.js:4843-4849,3157-3161,4206-4228`; 对照 `app.js:6458,6481`（OPT-169 已覆盖的 connection 分支）；`tests/frontend/`（状态冲突回归）

**Northstar:** 强——把「保存/删除成功」的误报修正为与真实落库一致，直接命中 Theme 3 数据可信，无 owner 决策分歧，且有 OPT-169 先例。→ **promoted to OPT-179**

### E321 — 书籍编辑封面 objectURL 从不 revoke，每次保存/取消泄漏 blob 内存 (S)

**What:** 「编辑书籍」对话框选择新封面时 `URL.createObjectURL(file)` 建 blob URL（`app.js:7039`），但唯一 revoke 只在「再选一张」时（`7038`）。`resetBookEditDraft()` 只置 `pendingBookEditImage = null`、不调 `URL.revokeObjectURL`（`app.js:4248-4255`），而它是保存（`4346`）/打开（`4261`）/取消关闭路径的清理入口。对照「新增书籍」的 `resetBookDraft` 会 revoke（`app.js:3070-3071`），编辑封面路径漏了对称释放。手机 Safari 上每次编辑封面（含取消）泄漏一份 blob URL，交互多次后累积。

**Evidence:** `els.bookEditImageInput` change 里先 `URL.revokeObjectURL(pendingBookEditImage.objectUrl)`（`app.js:7038`）再 `URL.createObjectURL(file)`（`7039`）；`resetBookEditDraft()` 仅 `pendingBookEditImage = null;`（`app.js:4249`）无 revoke；该函数在 `saveBookEdit`（`4346`）与 `openBookEditDialog`（`4261`）均被调用。

**Why:** 移动端内存泄漏会随编辑/取消累积，主题虽弱，但修法 S、有对称先例，属低成本内存卫生收口。

**Size:** S

**Files:** `app.js:7038-7041,4248-4255,4346,4261,3070-3071`（对照）；`tests/frontend/book-edit*` 相关

**Northstar:** 弱中——移动端内存卫生，无直接 owner signal，暂不提拔。

### E322 — 摘抄对话框取消/Esc 关闭时不 revoke 图片 objectURL，两张图泄漏 (S)

**What:** 摘抄对话框选择图片/第二张图时各建一个 blob URL（`app.js:5675,5699`），释放只在 `resetQuoteDraft()`（`app.js:3056-3060`）。但对话框的取消按钮/Esc 关闭经 `close` 监听只调 `discardProvisionalOcrQuote()`（`app.js:6766`），不调 `resetQuoteDraft`、不 revoke。于是「打开摘抄→选图→取消/Esc」两张 blob URL 一直滞留到下次打开/替换（或永不释放）。

**Evidence:** 图片载入建 `URL.createObjectURL`（`app.js:5675` 第一张、`5699` 第二张）；`els.quoteDialog.addEventListener("close", discardProvisionalOcrQuote)`（`app.js:6766`）；`discardProvisionalOcrQuote` 只清 OCR 临时卡，不含 revoke；`resetQuoteDraft` 才是唯一含 revoke 的清理（`3056-3060`）。保存路径会在 `addQuote` 里调 `resetQuoteDraft`（`4821`），故只有取消路径泄漏。

**Why:** 与 E321 同类的 blob 生命周期缺口；摘抄对话框是高频入口，取消即泄漏，移动端累积。修法与 E321 同族，可一并收口。

**Size:** S

**Files:** `app.js:5675,5699,6766,3056-3060`; `index.html`（摘抄对话框取消按钮 `data-close-dialog="quoteDialog"`）；`tests/frontend/ocr-cancel-cleanup.test.js`、`ocr-multi-image.test.js`

**Northstar:** 弱中——移动端内存卫生，暂不提拔。

### E323 — import 结果弹窗省略「聊天记录/深度共读上下文」，导入内容统计与恢复不一致 (S)

**What:** `importData` 会恢复 `chatHistories` 与 `chatContexts`（`resolveImportedState` `app.js:5011-5017`），但导入成功弹窗 `showImportResult` 的汇总行只列 书籍/摘抄/记录/关联/自定义摘抄标签/长期记忆 六类（`app.js:5041-5048`），既不显示聊天记录（chatHistories）也不显示深度共读上下文（chatContexts）。`stateContentCount` 计了 `chatHistories` 键数（`5031`）却没计 `chatContexts`。结果：导入含聊天历史的备份后，用户从结果弹窗看不到聊天是否恢复，且计数口径（count 含 chatHistory、弹窗不含）前后不一致。

**Evidence:** `showImportResult` 的 `rows` 数组（`app.js:5041-5048`）无 chatHistories/chatContexts 行；`resolveImportedState` 已恢复 `chatHistories`（`5011-5016`）与 `chatContexts`（`5017`）；`stateContentCount` 加 `Object.keys(s.chatHistories||{}).length`（`5031`）但不计 chatContexts。

**Why:** 导入是整体替换的高危操作，结果透明度应覆盖所有恢复的类别；聊天记录是用户在意的数据，弹窗静默不显示会造成「聊天是不是丢了」的不确定。属数据透明性收口，无产品取舍。

**Size:** S

**Files:** `app.js:5041-5048,5011-5017,5024-5035`; `tests/frontend/`（导入结果相关）

**Northstar:** 弱中——导入透明度/口径一致，无直接 owner signal，暂不提拔。

### E324 — 前端测试缺口：无 revokeObjectURL 断言 + 无账号设置/摘抄编辑持久化行为测试 (M)

**What:** 前端测试对 `URL.revokeObjectURL` 一律 stub 为 no-op（如 `ocr-multi-image.test.js:131`、`book-duplicate.test.js:61`、`ocr-cancel-cleanup.test.js:56`），全套件从不断言释放被调用，E321/E322 的泄漏可无限期通过 CI。同时缺少两类用户流的行为测试：摘抄编辑持久化（`addQuote` 编辑分支写回 `content/reflection/tags`，`app.js:4787-4796`，现有 `quote-tag-picker-persist.test.js` 只测标签选择器渲染、`quote-page-prefill.test.js` 只测预填），以及账号设置流（`updateProfile`/改邮箱/改密/`deleteAccount`/`exportAccount`，`app.js:4936,4959`，无前端行为测试，仅 `regression-fixed-bugs.test.js` 静态断言端点存在）。

**Evidence:** 图片测试 stub `revokeObjectURL(){}`（`tests/frontend/ocr-multi-image.test.js:131` 等）；`tests/frontend/quote-tag-picker-persist.test.js` 只断言标签渲染标题（96/112/131/148）；grep `tests/frontend/` 无针对账号设置流/`updateProfile`/`deleteAccount` 提交路径的测试。

**Why:** 与 E321/E322（泄漏）及 OPT-175（注销，正在被 #138 改）相关的回归缺少测试网；摘抄编辑是核心写路径却无持久化断言。属测试覆盖率收口，可随对应修复落地测试。

**Size:** M

**Files:** `tests/frontend/ocr-multi-image.test.js:131`、`book-duplicate.test.js:61`、`ocr-cancel-cleanup.test.js:56`、`quote-tag-picker-persist.test.js`; `app.js:4787-4796,4936,4959`

**Northstar:** 中——提升核心写路径与账号流回归网，间接支撑 Theme 3 与 OPT-175 验收，但本身不产出用户可见价值，暂不提拔。

> 本次 run 新发现 6 条：E319（服务端 OCR 写路径绕过乐观锁静默互踩，L，data-safety/server）、E320（摘抄/书/记录保存与删除在冲突时仍播报成功，M，data-safety/consistency）、E321（书籍编辑封面 objectURL 从不 revoke，S，memory）、E322（摘抄对话框取消不 revoke 图片 objectURL，S，memory）、E323（import 结果弹窗省略聊天记录/上下文统计，S，data-transparency）、E324（前端测试缺口：无 revoke 断言 + 无账号设置/摘抄编辑持久化测试，M，test-coverage）。六项均由当前文件逐行核实并排除 backlog（OPT-169/170/176/177、E48 孤立图片、OPT-133/E213 MCP 锁）、旧 E001–318 与最近合并目标。沿 Theme 3「积累可信」，E319 命中 OCR 长耗时写路径唯一绕开乐观锁、并发编辑静默丢失，提拔为 OPT-178；E320 是 OPT-169（仅关联）覆盖面的自然补齐、无产品分歧，提拔为 OPT-179；E321/E322/E323/E324（含 L 级 E319 已提、其余 S/M）留探索池待 owner 或更直接证据。

## 2026-09-02

> 扫描焦点：沿当前 Theme 3「积累可信」（8/10–9/06）与最近合入的 OPT-175（注销改用 showConfirmDialog 内嵌输入框），核对刚上线组件的键盘/无障碍收口、state_conflict 误报成功的覆盖面（OPT-179 已登记路径之外的遗漏）、以及新控件的测试网。隔离 clone 当前 `HEAD` 为 `d572828`（09-02 晨间 triage），本地 backlog 现存最大 OPT 编号为 **OPT-179**、最大 explore 编号为 **E324**；open PR 数据不可用，未据此推断。本批方向均已排除 backlog（OPT-169/170/176/177/178/179）、旧 E001–324 与最近合并目标；其中 E303（摘抄墙无分页）、E243（记忆写失败幽灵变更）、E48（孤儿图片 GC）、E308（OPT-175 的 prompt→输入框改造）、E324（前端测试缺口）已在探索池，本批刻意绕开。

### E325 — OPT-175 内嵌输入框缺 Enter 确认、无 aria 标签、焦点不还原 (S)

**What:** 注销/删除等走 `showConfirmDialog` 的 `inputConfig` 文本输入槽（`app.js:4173-4210`）。输入框（`index.html:741`）无 `<label>`/`aria-label` 关联；`showConfirmDialog` 不监听输入框 keydown → 键盘/辅助技术用户输完用户名按 Enter 不触发确认，必须 Tab 到按钮再点；对话框关闭后焦点回到 body 而非触发元素。

**Evidence:** `index.html:741` 的 `<input type="text" id="confirmDialogInput" ... autocomplete="off" />` 无任何 aria 属性；`showConfirmDialog`（`app.js:4173-4210`）只在 `input.focus()`（`4185`）设焦点，无 keydown/Enter handler（grep 确认 `confirmDialogInput` 相关 keydown 仅命中 `quoteTagInput`/combobox，非本框）；`handleConfirm` 仅经按钮 click 触发（`4191-4196`）。与旁边记忆表单（`index.html:277` `aria-label="记忆类型"`）的完整标签形成对比。

**Why:** OPT-175 刚把 iOS 不可用的 `window.prompt` 换成内嵌输入框，但新建控件的键盘/语义通道未同步收口；注销是不可逆操作，键盘用户无法用 Enter 走完。属刚合入功能的直接后续缺口。

**Size:** S

**Files:** `index.html:741`; `app.js:4173-4210`; `tests/frontend/regression-fixed-bugs.test.js`（OPT-175 段）

**Northstar:** 弱中——a11y 类别此前按「无当前 signal」parked（OPT-046/048），且主平台 iPhone 键盘 Enter 并非自然确认手势，暂不提拔。

### E326 — 书编辑与书删除在 state_conflict 时仍播报成功，超出 OPT-179 已登记路径 (S)

**What:** `saveBookEdit`（`app.js:4384-4389`）与 `deleteBook`（`app.js:3320-3325`）都在 `await syncState()` 后无条件 toast「书籍已更新/书籍已删除」，忽略返回值的 `{saved:false, reason:"state_conflict"}` 分支——冲突时服务端以最新 state 覆盖本地、本次编辑被静默丢弃，提示却仍报成功。OPT-179 登记的三条路径（addQuote `4843`、addBook `3157`、deleteSession/deleteQuote `4206/4225`）之外的这两条未被覆盖。

**Evidence:** `saveBookEdit` 的 `try { await syncState(); showToast(...) }`（`app.js:4384-4386`）只 catch 不查返回值；`deleteBook` 同构（`3320-3324`）。对照 `addConnection`/`deleteConnection` 检查 `saved:false` 分支（`app.js:6458,6481`）与 OPT-179 文档列出的路径，书编辑/删除确属遗漏。

**Why:** 手机+桌面跨设备冲突是常态，书编辑/删除是高频写路径，提示「已更新/已删除」后刷新发现没生效是最伤信任的一类；修法与 OPT-179 同族（统一检查 `syncState` 冲突返回）。故不作为独立新 OPT，而是 OPT-179 覆盖面的支撑证据。

**Size:** S

**Files:** `app.js:4384-4389,3320-3325`; 对照 `app.js:6458,6481`、OPT-179 文档；`tests/frontend/`（状态冲突回归）

**Northstar:** 强——直接命中 Theme 3 数据可信，与 OPT-179 无产品分歧；因属同一 fix 族不单独占号，建议并入 OPT-179 实施范围。

### E327 — OPT-175 的 confirmDialog inputConfig 缺键盘/校验行为测试 (S)

**What:** OPT-175 的回归测试只断言「不再用 window.prompt、输入值透传 `onConfirm`」（`tests/frontend/regression-fixed-bugs.test.js` 的 OPT-175 段），没有覆盖 inputConfig 的交互细节：输入框 Enter 确认、空值/不匹配用户名时的按钮行为、对话框关闭后焦点状态。E324 已覆盖账号流静态端点断言，但未覆盖该输入槽的交互。

**Evidence:** grep `tests/frontend/` 无针对 `confirmDialogInput` 的 keydown/Enter/校验断言；`regression-fixed-bugs.test.js` 的 OPT-175 段以「不再用 prompt + 值透传」为主。对照 `app.js:4984-4988`（`deleteAccount` 的 `typed !== expected` 校验在 `onConfirm` 内），无测试锁定该校验。

**Why:** 与 E325（键盘/a11y）对应，缺测试网会让该新控件的键盘路径在回归中静默漂移；属测试覆盖收口，可随 E325 修复落地。

**Size:** S

**Files:** `tests/frontend/regression-fixed-bugs.test.js`; `app.js:4173-4210,4984-4988`

**Northstar:** 弱中——回归网价值，本身不产出用户可见改观，暂不提拔。

### E328 — 摘抄网格卡不展示「我的理解」reflection，主界面捕获但不可见 (S)

**What:** 摘抄表单把「我的理解」作为一等字段录入（`index.html:640`），但摘抄墙网格卡（`app.js:2307-2328`）只显示封面/书名/页码/正文/标签+角标，不渲染 `reflection`。用户无法在摘抄墙上判断哪些摘抄带了「我的理解」，需逐张点开详情。reflection 仅在摘抄详情（`3397`）、书详情预览（`4501`）、分享图（`3645`）可见。

**Evidence:** 网格卡模板（`app.js:2307-2328`）无 `quote.reflection` 引用；对照详情（`app.js:3397-3398` `if (quote.reflection) reflEl.textContent = ...`）存在展示。`quoteContent` 取 `content/ocrText`（`2301`），不含 reflection。

**Why:** OPT-173（8/28）重设计卡片时聚焦「摘抄 vs 笔记」的封面区分，「我的理解」这一积累资产在主界面无可见入口，与 Theme 2/3「回顾有价值·积累可信」的回流目标有弱错位；但紧凑卡片不放次注释可能是刻意取舍，故判弱。

**Size:** S

**Files:** `app.js:2307-2328,3397-3398,4501,3645`; `index.html:640`; `tests/frontend/quote-content-display.test.js`

**Northstar:** 弱——可能是设计取舍（紧凑卡），缺 owner 对「网格卡是否要露我的理解」的意图确认，不提拔。

> 本次 run 新发现 4 条：E325（OPT-175 内嵌输入框缺 Enter/aria/焦点还原，S，UX/a11y）、E326（书编辑/删除在 state_conflict 仍误报成功，超出 OPT-179 路径，S，data-safety）、E327（OPT-175 inputConfig 缺键盘/校验测试，S，test-coverage）、E328（摘抄网格卡不展示 reflection，S，UX）。四项均由当前文件逐行核实，并刻意排除已覆盖的 E303（摘抄墙分页）、E243（记忆写失败）、E48（孤儿图片）、E308（prompt→输入框改造）、E324（测试缺口）与 backlog OPT-169/170/176/177/178/179。**本批不提拔新 OPT**：E325/E327 属 a11y/测试网、北极星弱（a11y 类别此前按无 signal parked）；E326 是 OPT-179 覆盖面遗漏的两条书路径，属同一 fix 族，作支撑证据并入 OPT-179 实施范围、不单独占号；E328 疑为紧凑卡设计取舍、缺 owner 意图。领域自 08-29 起对深读/关联/OCR/记忆/objectURL/导入/冲突/测试缺口高度饱和，本批无符合「新方向 + 强北极星 + 非重复」的提拔项。

## 2026-09-03

> 扫描焦点：领域在前几夜对深读/关联/OCR/记忆/objectURL/导入/state_conflict/测试缺口高度饱和，本批刻意绕开那些簇，改从「仍未被收口的写路径与生命周期边界」入手——后端长耗时写路径的乐观锁覆盖（OPT-178 只收口了 OCR，探索 chat 流式写是否同样裸奔）、会话过期/401 的生命周期 teardown、以及 agent 审批卡与深读跑批的前端竞态/错误处理。隔离 clone 当前 `HEAD` 为 `899c8e6`（09-03 晨间 triage），本地 backlog 现存最大 OPT 编号为 **OPT-179**、最大 explore 编号为 **E328**；open PR 数据不可用，未据此推断。本批六项均由当前文件逐行核实，并排除 backlog（OPT-159–168/169/170/176/177/178/179）、旧 E001–328 与最近合并目标（OPT-173/174/175）。刻意绕开 09-02 已探的 E325/326/327/328 与池内 E303（分页）/E243（记忆幽灵）/E48（孤儿图）/E308/E324。

### E329 — 探讨 `/api/chat/stream` 在长 LLM 流式期间持有整份 state 快照，结束后无条件整表写回，静默覆盖并发编辑 (M)

**What:** 探讨 SSE 端点 `/api/chat/stream` 在请求早期 `state = load_state(conn, user["id"])`（`app_server.py:6076`）取整份用户 state 快照，随后经历一次「对话历史压缩」二次 LLM 调用（`6123`，注释明言其会再调一次 LLM）与完整的流式 agent 回复（`6137+`，持续数秒到数十秒），最后把**同一份旧快照** `save_state(conn, user["id"], state)` 无条件写回（`app_server.py:6217`）。`save_state`（`app_server.py:986-995`）是盲写 last-writer-wins、不带任何版本参数。于是在这段长窗口内，任何并发写——第二个探讨标签页、后台 OCR job（`_run_quote_ocr_job` `1824,1843`）、或另一设备走带版本校验的 `/api/state` PUT（`do_PUT` `6645-6665`）——都会被这份陈旧快照整体覆盖，无 409、无提示。对照已修的先例：ActionExecutor 用 `BEGIN IMMEDIATE` 显式串行化读改写（`app_server.py:3804-3815`，OPT-029/OPT-160）；OPT-178 只登记了 OCR 写路径，`/api/chat/stream` 是仍裸奔的长耗时全量写实例。

**Evidence:** `state = load_state(...)` `app_server.py:6076` → `history = compress_chat_history_if_needed(conn, user["id"], ..., state)`（`6123`，内嵌一次 LLM 调用）→ 流式回写至 `save_state(conn, user["id"], state)`（`6217`），期间无任何 `BEGIN IMMEDIATE`/版本比对；`save_state` 定义（`986-995`）只 `UPDATE user_state SET state_json` 无条件提交。对照 ActionExecutor 注释明确这类「两并发批准都读同一 state，第二个 save 静默覆盖、丢书/丢笔记无报错」并以 `BEGIN IMMEDIATE` 串行化（`3804-3815`）；对照 OPT-178 文档（`app_server.py:1824,1843,5980`）——OCR 与 chat 流式是两条不同、彼此独立的整表写路径。

**Why:** 探讨是高频、长耗时（压缩二次 LLM + 流式回复常达数十秒）的写路径，正是并发冲突最高发窗口；而它把「读快照→长等待→盲写」整段放开，另一设备/标签页的任意编辑都在流式期间被静默覆盖——Theme 3「积累可信」下最贵的静默丢编辑，且与 OPT-178（OCR）同族但属新实例。

**Size:** M（需设计取舍：不在流式期间持有整份 state，改为结束前重读/仅合并写 `chatHistories`/`chatContexts` 两个字段的局部更新，或带版本校验冲突让出；同 OPT-178 的写路径收口族）。

**Files:** `app_server.py:6076,6123,6137-6217,986-995`；对照 `3804-3815`（ActionExecutor BEGIN IMMEDIATE 先例）、`6645-6665`（do_PUT 版本校验）、OPT-178（`1824,1843,5980` OCR 路径）；`tests/agent/` 探讨相关。

**Northstar:** 强——直接消除 Theme 3 下探讨高频长写路径的静默并发覆盖，确定性缺口、无 owner 产品取舍，与 OPT-178 同族但收口面不同。→ **promoted to OPT-180**

### E330 — 会话过期 401 只清 token 不清 UI，真实私有数据停在「已同步」假象上静默脱同步 (S)

**What:** `apiFetch` 的 401 分支（`app.js:535-542`）在会话过期时只做了一半 teardown：清空 `authToken`/`currentUser`/`stateVersion`、删 localStorage token、toast「登录已过期，请重新登录」、`dispatchUserChange()`——但**不**像显式 `logout()`（`app.js:2834-2842`）那样重置 `state` 为示例、`render()`、`activateTab("me")`、`loadDemoPreview()`。结果：token 已失效后，界面仍停留在用户真实的（非示例）书/摘抄 + userPanel「已同步」标识上，看似已登录；此后每次受保护写请求都 401 并逐次 toast，但书墙不会自动切到登录态、`state` 也不重置为 demo（`hasSampleData` 只认 `isSample` 项，真实数据仍在屏）。用户只有在手动刷新、或某次写命中 `requireAuth`→`activateTab("me")`（`app.js:1152-1156`）时才被动回到登录/演示态——在此之前对着已失效会话继续编辑且不明所以。

**Evidence:** 401 分支（`app.js:535-542`）无 `render()`/`activateTab`/`loadDemoPreview`/`state` 重置；对照 `logout()`（`app.js:2834-2842`）完整 teardown（reset state→`render()`→`activateTab("me")`→`loadDemoPreview()`，注释「退出后回到示例预览，与新访客一致」）。`dispatchUserChange`（`570`）只翻 is-admin 等 body 类、不重建书墙；`renderAuthPanels`（`app.js:1587-1601`）由 `render()` 调用，401 分支从未触发它。

**Why:** 会话过期是登录账号的正常生命周期（不是罕见路径）；Token 失效后 UI 仍显示真实私有数据并保持「已同步」外观、写请求静默 401，用户对着死会话继续编辑是最伤信任的脱同步场景，属 Theme 3 数据可信。修法是让 401 分支复用 `logout()` 同款 teardown，无产品取舍。

**Size:** S（把 401 分支补上 reset-state→render→导航 me→demo 预览；注意保留 429/409 分支不受影响）。

**Files:** `app.js:535-542`（401 分支）、`2834-2842`（logout teardown 对照）、`1587-1601`（renderAuthPanels）、`1152-1156`（requireAuth）；`tests/frontend/`（会话过期回归）。

**Northstar:** 强——修正会话过期时「看似已登录的假象 + 静默脱同步」，无 owner 分歧，S 级。→ **promoted to OPT-181**

### E331 — agent 审批卡确认成功后 600ms 延时卡片移除定时器不随书切换取消，向新上下文注入「已执行」气泡并可能重复弹下一张卡 (S)

**What:** `_showNextAgentAction` 的确认成功路径在 `tryExecute` 里用 `setTimeout(..., 600)`（`chat.js:989-993`）延时移除已批准卡片、追加「✅ 已执行」系统气泡并 `_showNextAgentAction(remaining)`。该定时器句柄从不登记/清除。若用户在点「确认执行」后的 600ms 窗口内切换书籍（书选择器 `change` → `restoreHistory` → `resetMessages()` 清空消息 DOM，`chat.js:478`/`271-284`），定时器仍会触发：向**新上下文**刚重建的消息列表追加一行「✅ 已执行」，并对多动作队列继续挂载下一张 PENDING 卡。而 `restoreHistory`→`findRecoveredActions`→`handleAgentActions`（`chat.js:484-486,507-514`）又会从远端日志把仍 PENDING 的兄弟动作重新呈现——同一 action 可能被渲染两次、出现两个「确认执行」。

**Evidence:** `setTimeout(() => { container.remove(); appendBubble("system", \`✅ 已执行：…\`); _showNextAgentAction(remaining); }, 600)` `chat.js:989-993`；grep `chat.js` 定时器仅 618/989/1284/1423 四处，989 无配套 clear。书切换清空：`restoreHistory` 调 `resetMessages()`（`478`）；恢复 PENDING 动作：`findRecoveredActions`/`handleAgentActions`（`484-486,507-514`）。

**Why:** 与 OPT-168（深读跨书残留）同族的前端竞态：审批确认到卡清理之间的延迟窗口未被切换取消。窗口窄（600ms）但可复现，造成跨书上下文气泡污染 + 潜在重复确认提示。

**Size:** S

**Files:** `chat.js:989-993,478,271-284,484-486,507-514`；对照 OPT-168 修复先例。

**Northstar:** 弱中——窄窗口竞态，主场景（确认后立即切书）较少见，北极星贡献一般，留探索池待直接证据。

### E332 — 深读启动提交不 await/catch 初始 `loadRun`，加载失败成未处理拒绝、面板卡死在「已创建/研究中」且开始按钮永久禁用 (S)

**What:** 深读「开始研究」提交处理器在创建 run 成功后 `renderStatus(activeRun)`/`renderResult(activeRun)` 接着 `loadRun(activeRun.id);`（`chat.js:1343-1345`）——`loadRun` 是 async 且**未被 await 也未被 .catch**。若其首次拉取拒绝（例如 `apiFetch` 返回 `null` 后在 `activeRun = payload.run` 处解引用抛错，`chat.js:1277`），该拒绝就逃出外层 try/catch（`1346-1348`）成为未处理 rejection。而 `renderStatus` 已对 CREATED 把 `startBtn.disabled = true`（`chat.js:1248-1250`），重新启用路径只有终态 renderStatus / handleError / user-changed，全都不触发，且本轮从未挂轮询 → 面板永久停在「已创建 · 研究中…」、开始按钮禁用、无任何错误提示。对照：历史点击的 `loadRun` 有 `.catch`（`chat.js:1366`）、自调度 `loadRun` 有 `.catch`（`1284`），唯独提交路径不一致。

**Evidence:** `renderStatus(activeRun); renderResult(activeRun); loadRun(activeRun.id);` `chat.js:1343-1345`（无 await/catch）；`async function loadRun` `1276`、内 `activeRun = payload.run;` `1279`、CREATED/RUNNING 续挂轮询 `1282+`；`renderStatus` 对 running 禁用 startBtn `1248-1250`；对照 `.catch` 路径 `1284`/`1366`。

**Why:** 深读启动失败（网络/服务端 5xx/返回异常）应报错并可重试；现状是未处理拒绝 + 永久禁用的假「运行中」，与同函数其他 .catch 路径不一致。属错误处理收口。

**Size:** S

**Files:** `chat.js:1343-1348,1276-1284,1248-1250`；对照 `1284,1366`；`tests/frontend/`（深读相关）。

**Northstar:** 弱中——失败态表现不佳但非高频且可刷新恢复，北极星一般，留探索池。

### E333 — 后端 `_read_json` 对畸形 JSON/非 UTF-8/数组体不做校验，客户端可控输入触发 500 并污染 server_errors (S)

**What:** `_read_json`（`app_server.py:4307-4313`）直接 `json.loads(raw.decode("utf-8"))`，无 try/except：畸形 JSON 抛 `JSONDecodeError`、非 UTF-8 字节抛 `UnicodeDecodeError`、合法 JSON 但为数组时后续 `payload.get(...)` 抛 `AttributeError`。所有 POST 端点都无守卫地调用它（如 `/api/login` `app_server.py:5343`）。这些异常都逃到调度层 catch-all（`handle_one_request`，返回 500 + 写一条 `server_errors`），客户端得到的是 500「internal server error」而非 4xx——触发源是客户端可控输入，等于把 4xx 级别的脏请求记成 500 级错误、污染错误摘要/P0 看板。`Content-Type` 也不做强制校验。

**Evidence:** `_read_json` 体（`app_server.py:4307-4313`）无校验、无 try；POST 调用点未包 try（如 `5343`）；调度层统一 500（`handle_one_request`）。已有 `MAX_REQUEST_BYTES` 尺寸护栏（`4309-4311`）只防超大 body，不防解析错。

**Why:** 客户端可控输入不应触发 500/错误日志污染；这是错误分类与日志卫生问题，非数据安全。修复极小（try/except 解析错误→400，或先校验 JSON 类型为 object）。

**Size:** S

**Files:** `app_server.py:4307-4313,5343`；调度层 catch-all（`handle_one_request`）。

**Northstar:** 弱——4xx/500 语义与日志卫生，无直接用户 signal，不提拔。

### E334 — 摘抄墙空态文案把「筛选/搜索无命中」误报成「还没有摘抄」，与书单的空态区分逻辑不一致 (S)

**What:** `renderQuotes` 在过滤/搜索/sort 后（`app.js:2275-2285`）统一落到单一空态分支：`els.quotesList.textContent = "还没有摘抄卡片，点左上角加号新增一张。"`（`app.js:2287-2290`）。当库里确有摘抄、只是当前类型/搜索筛选把可见卡片全部滤掉时，仍显示这句「还没有摘抄卡片」——把「筛选无命中」说成「从无数据」。对照 `renderBooks` 已区分真·空库与「筛选无结果」（`app.js:2066-2078`），摘抄/时间线空态未对齐该区分。

**Evidence:** 过滤链（`app.js:2281-2285` filter+sort）后 `if (!quotes.length) { ... "还没有摘抄卡片…" }`（`2287-2290`），无「是筛选所致」分支；对照 renderBooks 的两态区分（`app.js:2066-2078`）。

**Why:** 用户按标签/搜索过滤后看到「还没有摘抄卡片」会误以为卡片丢了（Theme 3 信任）；书单已做区分而摘抄未对齐，属 UX 文案一致性问题。

**Size:** S

**Files:** `app.js:2287-2290`；对照 `app.js:2066-2078`（renderBooks 空态两态）；`tests/frontend/`（摘抄空态）。

**Northstar:** 弱中——误导文案但非丢失，不影响数据本身，暂不提拔。

> 本次 run 新发现 6 条，刻意绕开 09-02 已探簇与旧 backlog：E329（`/api/chat/stream` 长 LLM 窗口持整份 state 快照后盲写，静默覆盖并发编辑，M，data-safety/server）、E330（401 过期只清 token 不清 UI，真实私有数据停「已同步」假象静默脱同步，S，frontend/session）、E331（审批卡 600ms 清除定时器不随书切换取消 → 跨上下文气泡 + 重复下一卡，S，chat/residue）、E332（深读启动未 await/catch 初始 loadRun，加载失败成未处理拒绝且开始按钮永久禁用，S，error-handling）、E333（后端 `_read_json` 畸形 body→500 污染 server_errors，S，backend robustness）、E334（摘抄墙空态把筛选无命中误报成无数据，S，UX copy）。六项均由当前文件逐行核实并排除 backlog（OPT-159–168/169/170/176/177/178/179）、旧 E001–328 与最近合并（OPT-173/174/175）。沿 Theme 3「积累可信」提拔 2 条证据最强、无 owner 分歧项：**E329 → OPT-180**（探讨长耗时写路径唯一仍裸奔的全量覆盖，与 OPT-178 OCR 同族但收口面不同）、**E330 → OPT-181**（会话过期假登录 + 静默脱同步，S 级 clean fix）。E331/E332 竞态/失败态真实但窗口窄/可刷新恢复，E333 是 4xx/500 日志卫生、E334 是误导文案，北极星弱中均不提拔。

## 2026-09-04

> 扫描焦点：Theme 3「积累可信」临近期末（8/10–9/06），且 09-02/09-03 两夜已把深读/关联/OCR/记忆/objectURL/导入/state_conflict/后端整表写路径高度收口。本批用 3 个并行只读审计（frontend-ux / backend-robustness / perf-memory）做扇形扫描，再由本人对每条候选重新打开当前文件逐行核实 + 关键词去重，刻意排除池内已覆盖簇：**E243**（记忆写失败幽灵变更）、**E303**（摘抄墙无分页）、**E48**（孤儿图片 GC）、**explore:129**（last_seen_at 每请求写）、**E66**（`_parse_iso_to_epoch` TZ 剥离），以及 backlog OPT-177/178/179/180/181 与最近合并 OPT-173/174/175/176。隔离 clone 当前 `HEAD` 为 `b7b2d9a`（09-04 晨间 triage，已将 OPT-181 指派夜间轨），本地 backlog 现存最大 OPT 编号为 **OPT-181**、最大 explore 编号为 **E334**；open PR 数据不可用，未据此推断。本批提拔 1 条证据最确凿、非重复、可干净独立修复的新机制：**E336 → OPT-182**（chat.js 流式回复期间逐 token 强制 `scrollToBottom()`，击溃应用自带的「回到底部」上翻逃生口，无法边流式边回看更早文本）。其余 4 条真实但北极星弱中或同族，留池。

### E335 — `addBook` 在 `syncState` 失败前已 `unshift` 进 `state.books`，非冲突失败留下幽灵书 + 卡死保存弹窗，重试被 `findDuplicateBook` 永久拦截 (S/M)

**What:** `addBook`（`app.js:3186-3232`）在 `try` 内先 `state.books.unshift({...})`（`3205`）构造新书，随后 `await syncState()`（`3224`）才落库；`closeDialog`/`render`/成功 toast 只在 try 成功路径。若 `syncState` 以**非 409**（网络/5xx）方式 reject，`catch`（`3229-3230`）只 `showToast(error.message)`，而新书已留在 `state.books`、弹窗保持打开。用户点「保存」重试时 `findDuplicateBook(title, author)`（`3191-3193`）此时已能匹配到这条幽灵书，toast「书单里已存在这本书」并 `return`——保存被永久拦截；点取消走 `resetBookDraft`（`3137`）只清表单/pending 图、不删已 push 的幽灵书，随后任意一次无关的成功的 `syncState` 会把这本用户可能以为「没加成」的书静默落库。

**Evidence:** `state.books.unshift` `app.js:3205` → `await syncState()` `3224` → catch `3229-3230`；`findDuplicateBook` 拦截 `3191-3194`；`resetBookDraft` `3137`。对照同族先例：OPT-170（关联普通保存失败已做快照回滚）、E243（记忆 saveMemory 同款先改 state 后 await，`app.js:482-484` 无回滚）——books 是新实例。

**Why:** 与 E243/OPT-170 同属「乐观改 state、失败不回滚」族但落在更核心的对象（书），并带书单特有的新后果：弹窗永久不可保存 + 幽灵书被后续 sync 静默持久化（用户以为失败，实际迟早入库）。Theme 3 数据可信（静默多出的、用户放弃的数据）。

**Size:** S/M（把 unshift 推迟到 `syncState` 成功之后，或在 catch 里按 id 从 `state.books` 移除；需前端回归覆盖「网络失败不残留幽灵书、弹窗可重试」）。

**Files:** `app.js:3186-3232,3191-3194,3137`；对照 E243（`476-489`）、OPT-170/179；`tests/frontend/`（保存失败回归）。

**Northstar:** 中——静默幻影落库削弱「积累可信」，但网络失败是次频路径、非主场景必现；与池内 E243 同族、项目此前对同族未单独立项，故不提拔、留池待直接证据。

### E336 — chat 流式回复每 token 无条件 `scrollToBottom()`，击溃上翻阅读与自带「回到底部」逃生口 (S)

**What:** SSE 流式在 `evt.delta` 分支逐 token 调 `thinking.textContent += evt.delta; scrollToBottom();`（`chat.js:668-673`）。`scrollToBottom`（`chat.js:447-450`）无条件 `els.messages.scrollTop = scrollHeight` 且把 `scrollBtnRow.hidden = true`。消息容器的滚动监听（`chat.js:919-922`）本会在用户滚离底部时显示悬浮「回到底部」按钮（`scrollBtnRow`）——但流式期间每个 token 都把滚动条钉回底部并把该按钮立刻隐藏。于是深读/探讨的长回复（数秒到数十秒）期间，用户**无法上翻回看早前文本**，越翻越被拽回底部；`scrollBtnRow` 这个为「离开底部阅读」而建的逃生口在整个流式期形同虚设。

**Evidence:** `scrollToBottom` 定义 `chat.js:447-450`（无条件，隐藏 scrollBtnRow）；delta 分支 `668-673`；滚动监听显示/隐藏 scrollBtnRow `919-922`（`scrollBtn` click `923+`）。同文件 447/465/597/671/684/924/974 多处调用，671 是流式热路径。

**Why:** 探讨/深读是北极星「回顾·检索」里最高频动作（signals 中回顾操作 ≈ 探讨次数），流式输出的**再阅读**正是回顾场景；现有「回到底部」按钮说明产品本意允许用户滚离底部，流式强制钉底是与其自建设计冲突的实现遗漏（非纯品味取舍）。修法清晰：仅当已在底部（或距底 < 阈值）时才自动跟随，离开底部则停 `scrollToBottom` 并允许 scrollBtnRow 出现。S 级前端纯改动，可夜间轨独立完成。

**Size:** S

**Files:** `chat.js:668-673,447-450,919-922`；`tests/frontend/`（流式期间滚离底部不被拽回 + 按钮可出现的回归）。→ **promoted to OPT-182**

**Northstar:** 中强——修正主回顾路径「流式中不可回看」的确定性体验缺陷，修复无 owner 产品分歧（保留既有逃生口语义），S 级可独立收口。

### E337 — chat 流式客户端 30s 空闲超时在服务端「首 token 前压缩二次 LLM」窗口内被误触发，长对话偶发假「请求超时」 (S)

**What:** 客户端在 `fetch` 前就武装 30s 空闲定时器（`chat.js:614-618`，`STREAM_IDLE_TIMEOUT_MS`），仅在收到响应头（`635`）与每个 delta（`672`）时重置。而 `/api/chat/stream` 服务端先 flush SSE 头、再同步跑一轮「对话历史压缩」二次 LLM 调用（`app_server.py:6123`/`6137`，见 E329/OPT-180 记录），首个 delta 要等压缩 + 系统提示构建 + 首 token 之后才到。于是当压缩这轮 LLM 慢（历史超阈值后每轮都全量重发 `to_compress` 片段、`2776-2785`）或网络毛刺，客户端在「头已到、首 token 未到」的空窗期空等，超 30s 即 `controller.abort()`，把一条本健康的请求误报成超时（`renderStreamTimeout`）。

**Evidence:** 定时器武装/重置 `chat.js:614-635`，delta 处 `672`；服务端首 token 前压缩见 E329 记录 `app_server.py:6123,6137`。此为 OPT-180（后端盲写）收口之外的一条**客户端**新症状，非重复。

**Why:** 探讨/深读是长流式主路径；对话一长、历史压缩必触发，压缩慢即偶发假超时打断流式、浪费已产生的 LLM 输出。与 OPT-180 同窗但属不同修复面（客户端超时策略 vs 后端写路径）。

**Size:** S（如首 token 前的空闲窗口放宽 / 服务端在压缩阶段也发心跳空行以重置客户端定时器）。

**Files:** `chat.js:614-635,668-672`；`app_server.py:6123,6137`；`tests/frontend/`（流式压缩期不误超时回归）。

**Northstar:** 弱中——偶发、可刷新重试恢复，非数据丢失；作为 OPT-180 探讨写路径收口的联带症状记录，不单独提拔。

### E338 — chat 消息 DOM 随会话单调增长，仅切书才 `resetMessages()` 清空，长对话移动端主线程节点持续累积 (S)

**What:** `appendBubble`（`chat.js:452-467`）与流式定稿路径每轮追加 user/assistant（+可选 action 行）气泡，无条数上限/修剪；唯一清空点是切书 `restoreHistory`→`resetMessages()`（`chat.js:469-487`）。而服务端存储侧把历史压缩截到约 `_COMPRESS_KEEP_RECENT`（7 条，`app_server.py:2763`）。于是同一本书内的一次长探讨，DOM 气泡可累积到远超服务端保留条数的若干倍，且到切书前零修剪。

**Evidence:** `appendBubble` `chat.js:452`；切书清空 `469-487`；服务端压缩保留阈值 `app_server.py:2763`。

**Why:** iPhone 主线程上 DOM 节点随会话无界增长，超长探讨最终拖慢滚动与回流。属移动端长会话卫生，非数据正确性。

**Size:** S（超阈值修剪最旧气泡，阈值与服务端压缩保留量对齐）。

**Files:** `chat.js:452-467,469-487`；`app_server.py:2763`。

**Northstar:** 弱——低频/仅超长会话才显现，无直接用户 signal，留池。

### E339 — 无 `storage` 事件监听：同浏览器另一标签登出后，本标签短暂停留私有数据 +「已同步」直至下次请求 (S)

**What:** `authToken` 在模块加载时一次性读入内存变量（`app.js:235`），`setAuthToken` 写/删 `localStorage[AUTH_TOKEN_KEY]`（`app.js:1170-1179`）；全前端 grep 无任何 `addEventListener("storage")`。同浏览器双标签：Tab B `logout()`（`app.js:2839-2853`）删掉共享 key 并**服务端 DELETE 该 session**（`app_server.py:5394-5398`），Tab A 无从感知，在下次发出受保护请求（命中 401→OPT-181 teardown）之前的窗口内，仍显示该账号私有数据 +「数据已同步至服务器」。核验后确认 logout() 会服务端吊销（`5394-5398`），故残留仅限「吊销后、下个请求前」的短暂窗口，且纯同浏览器多标签才触发——不同设备登出本就不影响彼此（各持 token）。

**Evidence:** token 单次读入 `app.js:235`；`setAuthToken` `1170-1179`；logout 调 `/api/logout` `2842`；服务端吊销 `app_server.py:5394-5398`；grep 全前端无 storage 监听。

**Why:** 与 OPT-181（401 假登录 teardown）紧邻但机制不同（storage 事件缺位 vs 401 分支半 teardown）；OPT-181 只覆盖「请求已 401」后，本项覆盖「吊销后未请求前」的同浏览器窗口。severity 因 logout 会服务端吊销而显著降低，双标签属少数场景。

**Size:** S（加 `storage` 事件监听 key 被删/变即触发 `logout()` 同款 teardown）。

**Files:** `app.js:235,1170-1179`；对照 `2839-2853`、OPT-181（`535-547`）；`app_server.py:5394-5398`。

**Northstar:** 弱——双标签少数场景 + 短窗口，且被 OPT-181 兜底大半；仅作记录留池，不提拔。

> 本次 run 从 3 个只读审计的候选池中，经本人重新打开文件逐行核实 + 关键词去重后，仅保留 5 条确属「尚未进入 backlog」的方向，并排除了 5 条实为池内/已覆盖的近似项（E243 记忆幽灵、E303 摘抄分页、E48 孤儿图片、explore:129 last_seen_at 每请求写、E66 TZ 剥离）。领域至 09-04 已高度饱和、且 OPT-177/178/179/180/181 五条 P1 数据可信项在案，本批只有 **E336**（chat 流式强制钉底击溃自带上翻逃生口）同时满足「新机制、非重复、S 级可独立收口、无 owner 分歧」→ **提拔为 OPT-182**；E335 与池内 E243 同族、E337/338/339 北极星弱中，均不提拔。

## 2026-09-05

> 扫描焦点：Theme 3「积累可信」临期末（8/10–9/06）。近四夜（09-01~09-04）已把深读/关联/OCR/记忆/objectURL/导入/state_conflict/后端整表写路径收口到 OPT-177~182 高度饱和；本批刻意转到一个近期未覆盖的**正交角**——前端「录入弹窗的键盘/隐式提交与 toast 真话性」+ 后端「非聊天路径的资源/DoS 硬化」+ 代码健康「读摘抄正文的 ocrText 回退漂移」——用 3 个并行只读审计（frontend-ux / backend-robustness / code-health-test）扇形扫描，再由本人重新打开当前文件逐行核实 + 关键词去重。刻意排除池内已覆盖簇：**OPT-177**（deleteQuote/deleteSession 失败不回滚）、**OPT-178/180**（后端整表盲写）、**OPT-179**（state_conflict 误报成功）、**OPT-181/182**（401 teardown / chat 流式滚动）、E243（记忆幽灵）、E321/322（objectURL 泄漏）、explore 明确排除的「matchQuotes 不接入 globalSearch」。隔离 clone 当前 `HEAD`=origin/feature/agent=`ca72e63`（09-05 晨间 triage），本地 backlog 现存最大 OPT=**OPT-182**、explore 最大 E=**E339**；open PR 数据不可用，未据此臆断。本批提拔 1 条证据最确凿、非重复、可干净独立修复的**主采集路径 toast 真话性缺口**：**E340 → OPT-183**（addQuote 图片上传失败后，随后的无条件成功 toast 把「图片上传失败」提示在同一次流转内覆盖，用户对照片实际没保存成功毫无感知）。其余 5 条真实但北极星弱中或涉取舍，留池待直接证据。

### E340 — addQuote 图片上传失败时，兜底 toast「图片上传失败，先保存文字」被同次流转尾部的无条件成功 toast 覆盖，用户对照片未保存成功毫不知情 (S)

**What:** `addQuote`（`app.js:4849-4934`）先 `showToast("保存中…")`（`4909`），随后在 `try` 内分两级：内层 `uploadQuoteImage(pendingImage)`（`4913`）抛错时 `catch` 弹 `"图片上传失败，先保存文字"`（`4921-4923`）——然后 `await syncState()`（`4924`）成功后，`4930` 无条件 `showToast(existingId ? "摘抄已更新" : "摘抄卡片已保存")`。图片上传失败但 syncState 成功（移动蜂窝网络的常态）时，`4923` 的失败提示在**同一次流转内**被 `4930` 的成功 toast 顶替——`showToast` 每次调用替换当前 toast，而 syncState 通常 < 2.2s toast 生命周期。于是用户最终看到的只有「摘抄卡片已保存」，卡片 `imageUrl` 恒 `""`（新卡 `4888`；编辑分支 `4914-4919` 未执行），照片被静默丢弃且无任何残留提示。

**Evidence:** `state.quotes.unshift` 见 `4880`（新卡 `imageUrl:""` `4888`）；图片上传 `4913`、内层 catch `4921-4923`、`syncState` `4924`、无条件成功 toast `4930`。`showToast` 语义为替换当前 toast（本项目 toast 是单例挂 body/顶层 dialog，见 cerebrum bug-log modal 一条）。

**Why:** 这是采集主路径（拍照摘抄=本 app 的核心录入）上的**真话性**缺口：产品在内层 catch 刻意想告知「图没存上、先存文字」（设计意图明确），但随后的成功 toast 把这条告知在同一次流转里吞掉——与 OPT-179（state_conflict 误报成功）不同机制（这是网络上传失败而非 409 冲突），不重复。照片是本 app 的采集本体，静默丢弃照片违反 Theme 3「积累可信」（用户以为照片已存、事后翻卡才发现空图）。

**Size:** S（在内层 catch 设 `imageFailed` 标记，`4930` 的成功文案据此改「摘抄已保存（图片上传失败，可编辑补图）」；或失败时跳过成功 toast 单独停留错误提示）。

**Files:** `app.js:4909-4930`；`tests/frontend/`（图片上传失败时最终 toast 含「图片上传失败」、`imageUrl` 未写且用户可见提示的回归）。→ **promoted to OPT-183**

**Northstar:** 中强——修正采集主路径上「照片实际没保存却被宣告成功」的确定性信息失真，属 Theme 3 数据可信面；修复无 owner 产品分歧（保留「先存文字」降级语义，仅改正 toast 真话性），S 级可独立收口。

### E341 — 书 combobox 无 Enter 守卫与键盘选项导航：摘抄/记录主录入表单里按回车触发隐式表单提交，可能以预填的上一本书提交或弹「先选择一本书」 (S/M)

**What:** 摘抄/记录(book)选择器由 `initBookCombobox`（`app.js:6120-6233`）构建，只挂 `focus/input/blur`，**无任何 `keydown` 守卫**；其兄弟 `initQuoteCombobox`（连接目标选择器）却在 `6397-6411` 显式拦截 Enter（注释：「iOS 键盘『完成』会提交所在 form。搜索框内按下时只收起键盘，既不提交关联…」）。`quoteBookCombobox`/`sessionBookCombobox` 位于含 `[type=submit]` 的 `<form>`（`index.html:570/595`），`addQuote`/`addSession` 在 submit 时读 `formData.get("bookId")`（`4853`）。后果：① 摘抄对话框打开时 `lastQuoteBookId` 预填进隐藏 `bookId`（字段上可见上一本书，`6685-6688`）——用户在书字段按回车/键盘「完成」即隐式提交，落在预填的上一本书（跨书记错/归错书风险）；② 用户想打字搜索换书时，`input` 事件把 `hiddenInput.value=""`（`6202`），此时按回车 `bookId` 为空 → `addQuote` 只在 `4855` toast「先选择一本书」——键盘用户**无法用回车从下拉选中候选项**，只能手点列表项（`6173-6175` mousedown/touchstart），下拉也无 Esc 关闭。

**Evidence:** `initBookCombobox` 全部监听见 `6200-6207`（focus/input/blur，无 keydown）；对照 `initQuoteCombobox` 的 Enter 守卫 `6397-6411`；`addQuote` 空 bookId 拦截 `4853-4855`；预填 `6685-6688`；下拉项只能 mouse/touch 选 `6173-6175`。确认：initBookCombobox 与 initQuoteCombobox 共享相同「iOS 键盘完成提交 form」前提，却不共享对应守卫——同族不一致。

**Why:** 采集表单是最高频路径；回车该「收起键盘/停在列表」却去提交表单，是产品已为兄弟控件明确定过的坑在本控件的复制遗漏。归错书=把内容挂到错误对象上（数据可信的轻度版）；键盘不可选中=录入可达性缺口。风险窗口较 E340 窄（非输入直接回车才落预填书、输入后回车为空被拦截），故 S/M、非纯 a11y（含隐式提交的数据路由面）。

**Size:** S/M（给 `initBookCombobox` 补 `keydown` Enter `preventDefault+stopPropagation` 并收起键盘/保留下拉，同 `initQuoteCombobox` 守卫）。

**Files:** `app.js:6120-6233,6397-6411,4853-4855,6685-6688,6173-6175`；`index.html:570,595`；`tests/frontend/`（书字段回车不提交表单、可保留下拉选中的回归）。

**Northstar:** 中——录入主路径的回车语义/可达性，但风险窗口部分条件化、且 lean 键盘/a11y（单人 owner 场景 a11y 历史上 P3 parked）；记录留池，不单独提拔。

### E342 — `goToConnection` 预填搜索只取 `quote?.content`，漏 `ocrText` 回退，OCR 摘抄正文检索词退化 (S)

**What:** `goToConnection` 内 `sideSearchText`（`app.js:4645-4652`）对 quote 端点返回 `[book.title, quote?.content].join(" ")`（`4651`）——只读 `content`。全库其它 quote 正文读取器已统一到规范 `quote.content || quote.ocrText || ""`（规范注释见 `app.js:6250-6254`，同文件 1075/1140/2290/2429/3454/4116/4225/4565 一致）。此处漏掉 `ocrText` 回退：当目标摘抄是「正文在 `ocrText`、`content` 为空」的 OCR 卡（OCR 录入路径的已知形态，见 cerebrum 摘抄混合集合与 content/ocrText 双字段），从该书详情/摘抄卡片跳「建立关联」时预填进连接搜索框的检索词只剩书名，正文关键词缺失——用户得手动重打才能搜到想关联的摘抄。

**Evidence:** `sideSearchText` `4645-4652`（quote 分支 `4651` 只拼 `content`）；规范 `content||ocrText` 见 `6250-6254`；调用点 `4660`。grep 确认该函数是全文件少数未带 ocrText 回退的 quote 正文读取点（同批还有 `matchQuotes` `1775` / `buildQuoteSearchCard` `1936`，但后两者是**刻意不接入 globalSearch** 的死代码，见 backlog 排除表，不在本次范围）。

**Why:** 关联建立是 Theme 2/3 的回顾核心；OCR 摘抄（采集主路径产物）占相当比例。预填检索词缺失=关联入口对被 OCR 卡半失效。真实影响依赖「content 空而 ocrText 有正文」的卡占比（需现场数据），故 S 级漂移、中等置信。

**Size:** S（`4651` 补 `|| quote.ocrText || ""`，或抽出与 `6250` 一致的 quoteBody helper 消除漂移）。

**Files:** `app.js:4645-4652`；规范 `6250-6254`；`tests/frontend/`（ocrText-only quote 的 goToConnection 预填断言）。

**Northstar:** 中弱——OCR 卡关联预填退化，非数据丢失、非必现；记录留池。

### E343 — OCR 图像路径无像素/解压尺寸上限，客户端压缩炸弹直灌 tesseract 致进程 OOM (M)

**What:** `_read_ocr_payload` 只按 `MAX_REQUEST_BYTES`（20MB）限请求体（`app_server.py:4333`），`run_fast_ocr`→`call_tesseract_ocr` 把 data-url `decode_data_url`（`1590`）后原样写临时文件再 `subprocess` 调 `tesseract`（`1595-1603`），全程无像素尺寸/解压后大小守卫（OCR 路径 grep 无 PIL/Image/resize/宽高检查）。一个体积小、解压后巨大的压缩炸弹图可让 tesseract C 库在进程内申请数 GB 内存 → OOM。

**Evidence:** 请求体读取 `4333`；decode→tesseract `1590-1603`；`decode_data_url` `2571-2576` 仅 base64 decode 无尺寸记账。

**Why:** 属后端资源/DoS 硬化面。本项目唯一真实用户=owner 本人（自摄自用），非公开可滥用面，北极星弱；但压缩炸弹成本极低、防不胜防，服务是 owner 自营基础设施，属成本低收益稳的健壮性储备。非 OPT-178/180（写路径）同族，是新机制。

**Size:** M（OCR 前解出尺寸：PNG/JPEG header 或懒解码，超限（如 >12000×12000 或 >某像素数）即 400/413，不落 tesseract）。

**Files:** `app_server.py:4333,1590-1603,2571-2576`；`tests/agent/`（超尺寸图返 4xx 不 OOM）。

**Northstar:** 弱——单人 owner 场景非公开攻击面；仅记录作健壮性储备，不提拔。

### E344 — `/api/research-runs` 的 `limit` 参数非数值时未捕获 `int()` 异常 → 500 而非 400 (S)

**What:** handler 把 `query.get("limit",[30])[0]` 原样传入 `research_store().list(...)`（`app_server.py:4600`），`deep_reading.py:274` 内 `max(1, min(int(limit), 100))` 对非整数字符串（如 `/api/research-runs?limit=abc`）抛 `ValueError`，穿透到 `handle_one_request` 的通用 500 分支并污染 `server_errors`，而不是返回 400。≤100 的钳制被任意非整数绕过。

**Evidence:** `app_server.py:4600`（裸传）→ `deep_reading.py:274`（`int(limit)` 无 try）。已核：handler 返回前 `conn.close(); _active_conn=None`（`4598-4599`），故异常落到外层通用 500。

**Why:** 客户端可控输入触发非 400 的 500，属低危错误处理清洁度；深读历史列表非高频，北极星弱，但修复一行、无取舍。与 E333（`_read_json` 畸形 JSON→500）同族但另一入口。

**Size:** S（`4600` 或 `deep_reading.py:274` 对 limit 做数值校验，非整数回退默认或返 400）。

**Files:** `app_server.py:4600`；`deep_reading.py:274`；`tests/agent/`（非数值 limit 不 500）。

**Northstar:** 弱——错误处理清洁度、非用户可见主路径；记录留池。

### E345 — 关联页搜索无防抖且每次 input 全量重算，与其兄弟搜索框防抖不一致 (M)

**What:** `els.connectionSearch?.addEventListener("input", renderConnections)`（`app.js:6718`）直接绑定、无防抖；`renderConnections` 内每条 connection 的 haystack 对两端调用 `state.books.find(...)`/`state.quotes.find(...)`（`1135-1151`），且每次调用连带重刷四个 combobox（`1121-1124`）。对照：摘抄/记录搜索防抖 250ms（`7002-7009`）、书单全局搜索防抖 200ms（`7066-7071`）。关联页是唯一未防抖的 tab 搜索，在大量 connection/quote 上每键 O(connections×(books+quotes)) 重扫。

**Evidence:** 绑定 `6718`（无 debounce）；haystack find `1135-1151`；combobox 联动 `1121-1124`；兄弟防抖 `7002-7009,7066-7071`。

**Why:** 性能一致性：手机主线程上逐键全量重扫造成输入卡顿。仅在连接/摘抄规模较大时显现，属代码健康面，非数据正确性。

**Size:** M（与兄弟一致的防抖，或复用 buildRenderCache 式的一次性端点名→label 映射）。

**Files:** `app.js:6718,1135-1151,7002-7009`；`tests/frontend/`（快速连续 input 只触发一次渲染的回归）。

**Northstar:** 弱中——低规模不可见、无用户 signal；记录留池。

> 本次 run 从 3 个并行只读审计候选池中，经本人重新打开文件逐行核实 + 关键词去重后，仅保留 6 条确属「尚未进入 backlog」的方向，并排除若干实为池内/已覆盖或北极星过弱的近似项（OPT-177/178/179/180/181/182、E243/E321/322、deleteQuote 乐观删除无回滚=OPT-177、后端 export 无界/慢读无超时等单人场景健壮性、matchQuotes 死代码=backlog 排除表刻意决策、deleteQuote/memory 无行为测试=测试健康面暂以注记留档）。本批唯一满足「新机制、非重复、S 级可独立收口、采集主路径数据可信、无 owner 分歧」的是 **E340**（addQuote 图片上传失败的告知被成功 toast 覆盖）→ **提拔为 OPT-183**；E341 回车语义部分条件化且 lean a11y、E342 依赖 ocrText-only 卡占比、E343/344/345 北极星弱中，均不提拔，留池待直接证据。
