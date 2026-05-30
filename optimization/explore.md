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
