// OPT-045: regression coverage for the 记录 (Session) Tab, which had no
// dedicated frontend test despite OPT-027 refactoring its card surface.
// Executes the REAL app.js via vm.runInNewContext (project convention) and
// asserts renderTimeline / addSession / deleteSession behaviour.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createElementStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, hidden: false,
    style: {}, dataset: {}, parentNode: null, children: [], files: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
    _click() { const l = this._listeners.click || []; if (l.length) l[l.length - 1](); },
  };
}

function createHarness() {
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };
  const document = {
    body: createElementStub("body"),
    querySelector(s) { return getElement(s); },
    querySelectorAll() { return []; },
    createElement(t) { return createElementStub(t); },
    getElementById(id) { return getElement(`#${id}`); },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const fetchCalls = [];
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    // Echo the PUT body back as the new server state (mirrors PUT /api/state),
    // so syncState() keeps the optimistic local change.
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      let body = {};
      try { body = JSON.parse(options.body); } catch (_) {}
      return {
        ok: true, status: 200,
        headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
        json: async () => ({ state: body, stateVersion: "v-test" }),
      };
    },
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  addSession, deleteSession, renderTimeline, els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
  getState() { return state; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.fetchCalls = fetchCalls;
  return hooks;
}

const emptyState = () => ({ books: [], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });
const form = (entries) => ({ get(k) { return entries[k] !== undefined ? entries[k] : ""; } });

function loggedIn(h, state) {
  h.setState(state);
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
}

// --- addSession ---

test("OPT-045: addSession appends a session and advances the book's page/status", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: [{ id: "b1", title: "三体", currentPage: 0, totalPages: 300, status: "wishlist" }] });
  await h.addSession(form({ bookId: "b1", startPage: "1", endPage: "40", minutes: "30", date: "2026-06-13", note: "开篇" }));
  await flush();
  const st = h.getState();
  assert.equal(st.sessions.length, 1, "session must be recorded");
  assert.equal(st.sessions[0].pagesRead, 39);
  const book = st.books.find((b) => b.id === "b1");
  assert.equal(book.currentPage, 40, "currentPage advances to endPage");
  assert.equal(book.status, "reading", "wishlist→reading on first session");
  assert.ok(h.fetchCalls.some((c) => c.url.includes("/api/state")), "must persist via syncState");
});

test("OPT-045: addSession marks the book finished when reaching the last page", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: [{ id: "b1", title: "三体", currentPage: 0, totalPages: 100, status: "reading" }] });
  await h.addSession(form({ bookId: "b1", startPage: "90", endPage: "100", minutes: "20", date: "2026-06-13", note: "" }));
  await flush();
  assert.equal(h.getState().books.find((b) => b.id === "b1").status, "finished");
});

test("OPT-045: addSession rejects an end page below the start page", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: [{ id: "b1", title: "三体", currentPage: 10, totalPages: 300, status: "reading" }] });
  await h.addSession(form({ bookId: "b1", startPage: "50", endPage: "20", minutes: "30", date: "2026-06-13", note: "" }));
  await flush();
  assert.equal(h.getState().sessions.length, 0, "invalid range must not create a session");
});

test("OPT-045: addSession with an id edits the existing session in place", async () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(),
    books: [{ id: "b1", title: "三体", currentPage: 40, totalPages: 300, status: "reading" }],
    sessions: [{ id: "s1", bookId: "b1", startPage: "1", endPage: "40", pagesRead: 39, minutes: 30, note: "旧", date: "2026-06-10T12:00:00.000Z" }],
  });
  await h.addSession(form({ id: "s1", bookId: "b1", startPage: "1", endPage: "55", minutes: "45", date: "2026-06-11", note: "改" }));
  await flush();
  const st = h.getState();
  assert.equal(st.sessions.length, 1, "edit must not create a new session");
  assert.equal(st.sessions[0].endPage, 55);
  assert.equal(st.sessions[0].note, "改");
});

// --- deleteSession ---

test("OPT-045: deleteSession removes the session only after confirm", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), sessions: [{ id: "s1", bookId: "b1" }, { id: "s2", bookId: "b1" }] });
  await h.deleteSession("s1");
  await flush();
  assert.equal(h.els.confirmDialog.open, true, "must prompt before deleting");
  assert.equal(h.getState().sessions.length, 2, "nothing removed until confirmed");
  h.els.confirmDialogConfirmBtn._click();
  await flush();
  const st = h.getState();
  assert.equal(st.sessions.length, 1);
  assert.equal(st.sessions[0].id, "s2", "the other session survives");
});

// --- renderTimeline ---

test("OPT-045: renderTimeline shows an empty state with no sessions", () => {
  const h = createHarness();
  loggedIn(h, emptyState());
  h.renderTimeline();
  assert.match(h.els.timeline.className, /empty-state/);
  assert.match(h.els.timeline.textContent, /还没有阅读会话/);
});

test("OPT-076: renderTimeline shows 10 cards + a 加载更多 button when more remain", () => {
  const h = createHarness();
  const sessions = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, bookId: "b1", startPage: i * 10, endPage: i * 10 + 5, minutes: 15,
    note: `n${i}`, date: `2026-06-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
  }));
  loggedIn(h, { ...emptyState(), books: [{ id: "b1", title: "三体" }], sessions });
  h.renderTimeline();
  assert.equal(h.els.timeline.className, "timeline");
  // 10 session cards + 1 load-more button (no longer silently truncated)
  assert.equal(h.els.timeline.children.length, 11, "10 cards plus a 加载更多 button");
  const moreBtn = h.els.timeline.children[10];
  assert.equal(moreBtn.className, "timeline-load-more");
  assert.match(moreBtn.textContent, /加载更多.*还有 2 条.*共 12 条/);
});

test("OPT-076: 加载更多 reveals the next page of earlier sessions", () => {
  const h = createHarness();
  const sessions = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, bookId: "b1", startPage: i * 10, endPage: i * 10 + 5, minutes: 15,
    note: `n${i}`, date: `2026-06-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
  }));
  loggedIn(h, { ...emptyState(), books: [{ id: "b1", title: "三体" }], sessions });
  h.renderTimeline();
  h.els.timeline.children[10]._click(); // click 加载更多
  // limit now 20 >= 12 total → all 12 cards, no more button
  assert.equal(h.els.timeline.children.length, 12, "all sessions shown after expanding");
  assert.ok(
    !h.els.timeline.children.some((c) => c.className === "timeline-load-more"),
    "load-more button disappears once everything is visible",
  );
});

test("OPT-076: no 加载更多 button when 10 or fewer sessions", () => {
  const h = createHarness();
  const sessions = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i}`, bookId: "b1", startPage: i, endPage: i + 1, minutes: 5,
    note: "", date: `2026-06-0${i + 1}T12:00:00.000Z`,
  }));
  loggedIn(h, { ...emptyState(), books: [{ id: "b1", title: "三体" }], sessions });
  h.renderTimeline();
  assert.equal(h.els.timeline.children.length, 8, "all cards, no load-more");
});

test("OPT-045: renderTimeline filters by search and shows a stats bar", () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(),
    books: [{ id: "b1", title: "三体", author: "刘慈欣" }, { id: "b2", title: "活着", author: "余华" }],
    sessions: [
      { id: "s1", bookId: "b1", startPage: 1, endPage: 20, minutes: 30, note: "", date: "2026-06-12T12:00:00.000Z" },
      { id: "s2", bookId: "b2", startPage: 1, endPage: 10, minutes: 15, note: "", date: "2026-06-11T12:00:00.000Z" },
    ],
  });
  h.els.sessionSearch.value = "三体";
  h.renderTimeline();
  assert.equal(h.els.timeline.children.length, 1, "only the matching book's session shows");
  assert.equal(h.els.sessionStats.className.includes("is-hidden"), false, "stats bar visible during search");
  assert.match(h.els.sessionStats.textContent, /1 次记录/);
});
