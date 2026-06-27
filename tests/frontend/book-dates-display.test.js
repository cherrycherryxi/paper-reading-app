// OPT-074: startedAt / finishedAt are written to the book object via saveSession()
// but were never surfaced in the UI. This test verifies that openBookDetailDialog()
// now appends human-readable date information to the bookDetailMeta element.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, hidden: false, scrollTop: 0,
    style: {}, dataset: {}, parentNode: null, children: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; }, close() { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
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
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  openBookDetailDialog, els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

const BASE_STATE = {
  sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {},
};

test("OPT-074: no dates - meta shows author and status only", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({ ...BASE_STATE, books: [{ id: "b1", title: "三体", author: "刘慈欣", status: "wishlist" }] });
  h.openBookDetailDialog("b1");
  const meta = h.els.bookDetailMeta.textContent;
  assert.match(meta, /刘慈欣/, "should include author");
  assert.doesNotMatch(meta, /开始于/, "no startedAt means no [kai-shi-yu] text");
  assert.doesNotMatch(meta, /—/, "no finishedAt means no dash");
});

test("OPT-074: startedAt only (reading) shows [kai-shi-yu YYYY-MM-DD]", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({
    ...BASE_STATE,
    books: [{ id: "b1", title: "三体", author: "刘慈欣", status: "reading", startedAt: "2026-01-03T00:00:00.000Z" }],
  });
  h.openBookDetailDialog("b1");
  const meta = h.els.bookDetailMeta.textContent;
  assert.match(meta, /开始于/, "should include kai-shi-yu prefix");
  assert.match(meta, /2026/, "should include year 2026");
  assert.doesNotMatch(meta, / — /, "not finished: no start-to-end range");
});

test("OPT-074: both startedAt and finishedAt show date range with dash", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({
    ...BASE_STATE,
    books: [{
      id: "b1", title: "三体", author: "刘慈欣", status: "finished",
      startedAt: "2026-01-03T00:00:00.000Z",
      finishedAt: "2026-03-15T00:00:00.000Z",
    }],
  });
  h.openBookDetailDialog("b1");
  const meta = h.els.bookDetailMeta.textContent;
  assert.match(meta, / — /, "finished with both dates should show em-dash range");
  assert.doesNotMatch(meta, /开始于/, "range format should not repeat kai-shi-yu");
});

test("OPT-074: only finishedAt (edge case) renders without throwing", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({
    ...BASE_STATE,
    books: [{ id: "b1", title: "三体", author: "刘慈欣", status: "finished", finishedAt: "2026-03-15T00:00:00.000Z" }],
  });
  assert.doesNotThrow(() => h.openBookDetailDialog("b1"), "should not throw when only finishedAt is set");
  const meta = h.els.bookDetailMeta.textContent;
  assert.match(meta, /2026/, "should include year 2026");
});
