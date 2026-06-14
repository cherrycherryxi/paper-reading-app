// OPT-049: book-detail dialog UX fixes from real-usage signals (2026-06-13):
//  ① opening the dialog left the scroll mid-card (showModal autofocuses a
//     mid-content 摘抄 button) — must reset scroll to top.
//  ② the dialog body was wider than the dialog (min-width 720 > 560) → could be
//     swiped left/right — must not scroll horizontally.
//  ③ "相关摘抄" actually includes 笔记 (isRegularQuote only excludes question) —
//     labels must say 摘抄 / 笔记.
// Executes the REAL app.js / styles.css / index.html (project convention).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

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
  setAuth(v) { authToken = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

// --- ① scroll reset (behavioral) ---

test("OPT-049 ①: opening the book detail dialog resets the scroll container to the top", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({ books: [{ id: "b1", title: "三体", status: "reading" }], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });
  // Simulate a previously scrolled dialog body; openBookDetailDialog must zero it.
  const scrollEl = createElementStub();
  scrollEl.scrollTop = 999;
  h.els.bookDetailDialog.querySelector = () => scrollEl;
  h.openBookDetailDialog("b1");
  assert.equal(h.els.bookDetailDialog.open, true, "dialog should open");
  assert.equal(scrollEl.scrollTop, 0, "scroll container must be reset to top on open");
});

// --- ③ notes appear in the 相关摘抄/笔记 section (behavioral) ---

test("OPT-049 ③: a note (kind=note) is listed in the related section with a 笔记 label", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({
    books: [{ id: "b1", title: "三体", status: "reading" }],
    sessions: [],
    quotes: [{ id: "q1", bookId: "b1", kind: "note", content: "这是一条笔记", page: 12, createdAt: "2026-06-13T00:00:00.000Z" }],
    connections: [], chatHistories: {}, chatContexts: {},
  });
  h.openBookDetailDialog("b1");
  const html = h.els.bookDetailQuotes.innerHTML;
  assert.match(html, /这是一条笔记/, "the note's content must render in the related section");
  assert.match(html, /笔记/, "the card meta must label it as 笔记 (justifying the 摘抄/笔记 heading)");
});

// --- ② / ③ source guards ---

test("OPT-049 ②: .dialog-form hides horizontal overflow and book-detail body is not over-wide", () => {
  const dialogForm = styles.match(/\.dialog-form\s*\{([\s\S]*?)\}/);
  assert.ok(dialogForm, ".dialog-form rule must exist");
  assert.match(dialogForm[1], /overflow-x:\s*hidden/, ".dialog-form must hide horizontal scroll");
  const body = styles.match(/\.book-detail-dialog-body\s*\{([\s\S]*?)\}/);
  assert.ok(body, ".book-detail-dialog-body rule must exist");
  assert.doesNotMatch(body[1], /min-width/, "book-detail body must not force a width wider than the dialog");
});

test("OPT-049 ③: related-section labels say 摘抄 / 笔记, not just 摘抄", () => {
  assert.match(indexHtml, /<h3>相关摘抄 \/ 笔记<\/h3>/, "heading must read 相关摘抄 / 笔记");
  assert.match(appSource, /查看全部 \$\{bookQuotes\.length\} 条摘抄 \/ 笔记/, "view-all button must say 摘抄 / 笔记");
  assert.match(appSource, /这本书还没有摘抄或笔记。/, "empty text must mention 笔记 too");
});
