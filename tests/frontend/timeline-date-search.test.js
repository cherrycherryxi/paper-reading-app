/**
 * OPT-112: renderTimeline search haystack includes the session date
 *
 * Before: the timeline search haystack was [title, author, note] only, so a
 * user could not narrow the reading timeline by time period.
 * After: the haystack also carries the raw ISO date (matches "2026-07") and
 * the zh-CN formatted date (matches "6月" / "2026年"), symmetric with the
 * book/quote search fields.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

// ─── minimal DOM stub ────────────────────────────────────────────────────────

function createElementStub(tagName = "div") {
  let _innerHTML = "";
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
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
  getRenderedSessionIds() {
    return els.timeline.children
      .map((c) => c.dataset && c.dataset.sessionId)
      .filter(Boolean);
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
    date: "2026-07-15T04:00:00.000Z",
    ...overrides,
  };
}

// mid-month dates so no timezone can roll the day into an adjacent month
const JUNE = "2026-06-15T04:00:00.000Z";
const JULY = "2026-07-15T04:00:00.000Z";

function seed(hooks) {
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "深度工作" })],
    quotes: [],
    sessions: [
      session({ id: "sJun", date: JUNE, note: "" }),
      session({ id: "sJul", date: JULY, note: "" }),
    ],
    connections: [], chatHistories: {},
  });
}

// ─── tests ───────────────────────────────────────────────────────────────────

test("OPT-112: search by ISO year-month (2026-07) matches that month's sessions", () => {
  const hooks = createHarness();
  seed(hooks);
  hooks.setSessionSearch("2026-07");
  hooks.renderTimeline();

  const ids = hooks.getRenderedSessionIds();
  assert.deepEqual([...ids], ["sJul"], "only the July session matches 2026-07");
});

test("OPT-112: search by zh-CN month (6月) matches that month's sessions", () => {
  const hooks = createHarness();
  seed(hooks);
  hooks.setSessionSearch("6月");
  hooks.renderTimeline();

  const ids = hooks.getRenderedSessionIds();
  assert.deepEqual([...ids], ["sJun"], "only the June session matches 6月");
});

test("OPT-112: search by year (2026) matches all sessions in that year", () => {
  const hooks = createHarness();
  seed(hooks);
  hooks.setSessionSearch("2026");
  hooks.renderTimeline();

  const ids = hooks.getRenderedSessionIds().slice().sort();
  assert.deepEqual([...ids], ["sJul", "sJun"], "both sessions are in 2026");
});

test("OPT-112: existing title/note search still works", () => {
  const hooks = createHarness();
  seed(hooks);
  hooks.setSessionSearch("深度工作");
  hooks.renderTimeline();

  const ids = hooks.getRenderedSessionIds().slice().sort();
  assert.deepEqual([...ids], ["sJul", "sJun"], "title search unaffected by the date addition");
});

test("OPT-112: non-matching date query renders nothing", () => {
  const hooks = createHarness();
  seed(hooks);
  hooks.setSessionSearch("2025-01");
  hooks.renderTimeline();

  assert.equal(hooks.getRenderedSessionIds().length, 0);
});

test("OPT-112: session with no date doesn't throw and is excluded from date search", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  const s = session({ id: "sNoDate" });
  delete s.date;
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [],
    sessions: [s, session({ id: "sJul", date: JULY })],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("2026-07");
  assert.doesNotThrow(() => hooks.renderTimeline());
  assert.deepEqual([...hooks.getRenderedSessionIds()], ["sJul"]);
});
