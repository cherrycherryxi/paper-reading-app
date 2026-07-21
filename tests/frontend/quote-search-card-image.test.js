// OPT-070: buildQuoteSearchCard() must fill quote.imageUrl in the cover like the
// list card (OPT-052) instead of always rendering a gray entry-cover-fallback.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

function createElementStub() {
  let innerHTML = "";
  return {
    tagName: "DIV",
    className: "",
    textContent: "",
    style: {},
    dataset: {},
    value: "",
    disabled: false,
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    showModal() {},
    close() {},
    reset() {},
    setAttribute() {},
    removeAttribute() {},
    closest() { return null; },
  };
}

function createHarness(backendBaseUrl = "") {
  const elements = new Map();
  const getEl = (sel) => { if (!elements.has(sel)) elements.set(sel, createElementStub()); return elements.get(sel); };

  const document = {
    querySelector: (s) => getEl(s),
    querySelectorAll: () => [],
    createElement: () => createElementStub(),
    getElementById: (id) => getEl(`#${id}`),
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function(t) { this.type = t; },
    FormData, structuredClone, Date, Math, JSON,
    Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(
    /\nbindEvents\(\);\nrender\(\);[\s\S]*$/,
    "\n"
  );
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  buildQuoteSearchCard,
  setState(v) { state = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__testHooks;
}

const BASE_BOOK = {
  id: "b1", title: "测试书", author: "作者", tags: [], status: "reading",
  currentPage: 0, totalPages: 100, notes: "", coverImageUrl: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const BASE_STATE = { books: [BASE_BOOK], sessions: [], quotes: [], chatHistories: {}, connections: [] };

test("OPT-070: search card renders <img> when quote.imageUrl is set", () => {
  const h = createHarness();
  h.setState(BASE_STATE);
  const card = h.buildQuoteSearchCard({
    id: "q1", bookId: "b1", content: "摘抄内容", kind: "photo",
    page: 1, tags: [], imageUrl: "/media/u1/photo.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(
    card.innerHTML.includes('<img src="/media/u1/photo.jpg"'),
    "有 imageUrl 的搜索卡面应渲染 <img> 缩略图"
  );
  assert.ok(
    !card.innerHTML.includes("entry-cover-fallback"),
    "有 imageUrl 时不应再渲染灰色占位 entry-cover-fallback"
  );
});

test("OPT-070: search card falls back to placeholder when imageUrl absent", () => {
  const h = createHarness();
  h.setState(BASE_STATE);
  const card = h.buildQuoteSearchCard({
    id: "q2", bookId: "b1", content: "纯文字摘抄", kind: "quote",
    page: 5, tags: [], imageUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(
    card.innerHTML.includes("entry-cover-fallback"),
    "无 imageUrl 的搜索卡面应渲染 entry-cover-fallback"
  );
  assert.ok(
    !card.innerHTML.includes("<img src="),
    "无 imageUrl 时不应渲染 <img>"
  );
});

test("OPT-070: search card prefixes backendBaseUrl for relative image paths", () => {
  const h = createHarness("http://192.168.1.5:8787");
  h.setState(BASE_STATE);
  const card = h.buildQuoteSearchCard({
    id: "q3", bookId: "b1", content: "摘抄", kind: "photo",
    page: 2, tags: [], imageUrl: "/media/u1/shot.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(
    card.innerHTML.includes('src="http://192.168.1.5:8787/media/u1/shot.jpg"'),
    "backendBaseUrl 应被正确拼接到搜索卡图片 src"
  );
});
