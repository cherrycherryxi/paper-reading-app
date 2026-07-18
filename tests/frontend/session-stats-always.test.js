/**
 * OPT-053: renderTimeline session stats bar shows during normal browsing
 *
 * Before: the "N 次记录 · 共 X 分钟 · 约 Y 页" stats bar was only rendered
 * while a search was active; the default browsing view hid it, so users never
 * saw their cumulative reading totals.
 * After: the stats bar is always shown when there is at least one session.
 * When searching it reflects the filtered results; otherwise it covers every
 * session (not just the paged slice).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

// ─── minimal DOM stub with class tracking ────────────────────────────────────

function createElementStub(tagName = "div") {
  let _innerHTML = "";
  const _classes = new Set();
  const el = {
    tagName: (tagName || "div").toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    disabled: false,
    hidden: false,
    children: [],
    classList: {
      add(c) { _classes.add(c); },
      remove(c) { _classes.delete(c); },
      toggle(c, force) {
        const want = force === undefined ? !_classes.has(c) : !!force;
        if (want) _classes.add(c); else _classes.delete(c);
        return want;
      },
      contains(c) { return _classes.has(c); },
    },
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) { _innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentHTML(pos, v) {
      _innerHTML = pos === "beforeend" ? `${_innerHTML}${v}` : `${v}${_innerHTML}`;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() {},
    close() {},
    reset() {},
    setAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    focus() {},
    scrollIntoView() {},
    cloneNode() { return createElementStub(tagName); },
  };
  return el;
}

function createHarness() {
  const elements = new Map();
  function getElement(selector) {
    if (!elements.has(selector)) elements.set(selector, createElementStub());
    return elements.get(selector);
  }

  const document = {
    querySelector(selector) { return getElement(selector); },
    querySelectorAll() { return []; },
    createElement(tag) { return createElementStub(tag); },
    getElementById(id) { return getElement(`#${id}`); },
    createElementNS(_, tag) { return createElementStub(tag); },
  };

  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout(fn) { return fn(); },
    confirm() { return true; },
  };

  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
    requestAnimationFrame(fn) { return fn(); },
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");

  const instrumentedSource = `${sourceWithoutBoot}
globalThis.__testHooks = {
  renderTimeline,
  els,
  setState(value) { state = value; },
  setCurrentUser(value) { currentUser = value; },
  setSessionSearch(value) { if (els.sessionSearch) els.sessionSearch.value = value; },
  getStats() {
    return {
      text: els.sessionStats.textContent,
      hidden: els.sessionStats.classList.contains("is-hidden"),
    };
  },
};
`;

  vm.runInNewContext(instrumentedSource, context, { filename: "app.js" });
  return context.__testHooks;
}

// ─── factories ───────────────────────────────────────────────────────────────

function book(overrides) {
  return { id: "b1", title: "书", author: "作者", status: "reading", ...overrides };
}

function session(overrides) {
  return {
    id: "s1", bookId: "b1", startPage: 1, endPage: 11, minutes: 30, note: "",
    date: "2026-07-10T04:00:00.000Z",
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

test("OPT-053: stats bar is visible while browsing (no search)", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [],
    sessions: [
      session({ id: "s1", startPage: 1, endPage: 21, minutes: 30 }),
      session({ id: "s2", startPage: 21, endPage: 41, minutes: 40 }),
    ],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const stats = hooks.getStats();
  assert.equal(stats.hidden, false, "stats bar should be shown while browsing");
  assert.match(stats.text, /2 次记录/, "counts all sessions");
  assert.match(stats.text, /共 70 分钟/, "sums minutes across all sessions");
  assert.match(stats.text, /约 40 页/, "sums pages across all sessions");
});

test("OPT-053: browsing stats cover ALL sessions, not just the paged slice", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  // 40 sessions of 10 minutes / 10 pages each; page size default caps the list
  // but the stats bar should still total every session.
  const sessions = [];
  for (let i = 0; i < 40; i++) {
    sessions.push(session({ id: `s${i}`, startPage: 1, endPage: 11, minutes: 10, date: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T04:00:00.000Z` }));
  }
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [], sessions, connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const stats = hooks.getStats();
  assert.equal(stats.hidden, false);
  assert.match(stats.text, /40 次记录/, "totals every session regardless of pagination");
  assert.match(stats.text, /共 400 分钟/);
  assert.match(stats.text, /约 400 页/);
});

test("OPT-053: searching still narrows the stats to filtered results", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "深度工作" }), book({ id: "b2", title: "原则" })],
    quotes: [],
    sessions: [
      session({ id: "s1", bookId: "b1", startPage: 1, endPage: 11, minutes: 30 }),
      session({ id: "s2", bookId: "b2", startPage: 1, endPage: 6, minutes: 20 }),
    ],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("深度工作");
  hooks.renderTimeline();

  const stats = hooks.getStats();
  assert.equal(stats.hidden, false);
  assert.match(stats.text, /1 次记录/, "only the matching session is counted");
  assert.match(stats.text, /共 30 分钟/);
});

test("OPT-053: stats bar hides when there are no sessions at all", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  assert.equal(hooks.getStats().hidden, true, "no sessions → stats bar stays hidden");
});
