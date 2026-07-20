// OPT-095: 新建摘抄对话框的页码字段应预填 book.currentPage（正在读的这一页），
// 而不是永远留空。与「记录阅读」的 startPage=currentPage+1 不同，摘抄记的是当前页，
// 所以不 +1；currentPage 为 0（尚未开读）时留空。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let _value = "";
  const stub = {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", open: false, hidden: false,
    style: {}, dataset: {}, parentNode: null, children: [], files: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get value() { return _value; },
    set value(v) { _value = String(v); },
    get innerHTML() { return ""; },
    set innerHTML(v) { this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return createElementStub("input"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
  };
  return stub;
}

function createHarness() {
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };

  // Trackable inputs the quote form hands out for the fields under test.
  const pageInputStub = createElementStub("input");
  const bookIdInputStub = createElementStub("input");
  const quoteFormStub = Object.assign(createElementStub("form"), {
    querySelector(selector) {
      if (selector === '[name="page"]') return pageInputStub;
      if (selector === '[name="bookId"]') return bookIdInputStub;
      return createElementStub("input");
    },
  });

  const document = {
    body: createElementStub("body"),
    querySelector(s) {
      if (s === "#quoteBookCombobox") return createElementStub("div");
      return getElement(s);
    },
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
    fetch: async () => ({
      ok: true, status: 200,
      headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
      json: async () => ({ state: {}, stateVersion: "v-test" }),
    }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Intl, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
showToast = function () {};
renderImagePreview = function () {};
renderQuoteTagPicker = function () {};
globalThis.__hooks = {
  openNewQuoteForBook,
  quotePagePrefill,
  setBooks(books) { state.books = books; },
  els,
  pageInput: null,
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;

  hooks.els.quoteForm = quoteFormStub;
  hooks.els.quoteDialog = getElement("#quoteDialog");
  hooks.pageInput = pageInputStub;

  vm.runInNewContext(`
    currentUser = { id: "u1" };
    authToken = "tok";
  `, context);

  return hooks;
}

test("OPT-095: openNewQuoteForBook() pre-fills page with book.currentPage", () => {
  const h = createHarness();
  h.setBooks([{ id: "b1", title: "T", author: "A", currentPage: 42, totalPages: 300 }]);

  h.openNewQuoteForBook("b1");

  assert.equal(h.pageInput.value, "42", "page must be pre-filled with the book's currentPage");
});

test("OPT-095: openNewQuoteForBook() leaves page blank when the book has not been started", () => {
  const h = createHarness();
  h.setBooks([{ id: "b1", title: "T", author: "A", currentPage: 0, totalPages: 300 }]);

  h.openNewQuoteForBook("b1");

  assert.equal(h.pageInput.value, "", "page must stay blank when currentPage is 0");
});

test("OPT-095: quotePagePrefill() does not add +1 (records the current page, not the next)", () => {
  const h = createHarness();
  h.setBooks([{ id: "b1", title: "T", author: "A", currentPage: 42, totalPages: 300 }]);

  assert.equal(h.quotePagePrefill("b1"), 42, "quote page equals currentPage, unlike session startPage");
  assert.equal(h.quotePagePrefill("missing"), "", "unknown book yields a blank page");
});
