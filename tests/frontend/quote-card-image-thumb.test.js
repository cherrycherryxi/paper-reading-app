// OPT-158: quote cards use a calm, type-specific art cover in the review grid.
// The source image remains available in quote detail as OCR evidence.

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
  renderQuotes,
  els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  getQuotesListMarkup() { return els.quotesList.innerHTML; },
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
const BASE_STATE = { books: [BASE_BOOK], sessions: [], chatHistories: {}, connections: [] };

test("OPT-158: photographed quote uses art cover instead of source image", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState({
    ...BASE_STATE,
    quotes: [{
      id: "q1", bookId: "b1", content: "摘抄内容", kind: "photo",
      page: 1, tags: [], reflection: "",
      imageUrl: "/media/u1/photo.jpg",
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
  });
  h.renderQuotes();
  const html = h.getQuotesListMarkup();
  assert.ok(
    html.includes('quote-cover-art quote-cover-art--quote'),
    "有原图的摘抄卡也应使用统一的轻量封面"
  );
  assert.ok(
    !html.includes('/media/u1/photo.jpg'),
    "拍摄原图不应继续占据回顾页卡面"
  );
});

test("OPT-158: text quote uses the same stable art cover", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState({
    ...BASE_STATE,
    quotes: [{
      id: "q2", bookId: "b1", content: "纯文字摘抄", kind: "quote",
      page: 5, tags: [], reflection: "",
      imageUrl: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
  });
  h.renderQuotes();
  const html = h.getQuotesListMarkup();
  assert.ok(
    html.includes('quote-cover-art quote-cover-art--quote'),
    "无图摘抄与有图摘抄应保持一致的回顾视觉"
  );
  assert.ok(
    !html.includes('<img src='),
    "轻量封面不应渲染图片"
  );
});

test("OPT-158: note cover remains visually distinguishable from a quote", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState({
    ...BASE_STATE,
    quotes: [{
      id: "q3", bookId: "b1", content: "笔记", kind: "note",
      page: 2, tags: [], reflection: "", imageUrl: "",
      createdAt: "2026-01-02T00:00:00.000Z",
    }],
  });
  h.renderQuotes();
  const html = h.getQuotesListMarkup();
  assert.ok(html.includes('quote-cover-art--note'), "笔记卡应使用 note 视觉变体");
  assert.ok(html.includes('aria-hidden="true">✎</span>'), "笔记符号应只作装饰");
});

test("OPT-158: cards with and without source images share one cover language", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState({
    ...BASE_STATE,
    quotes: [
      {
        id: "q4", bookId: "b1", content: "有图", kind: "photo",
        page: 1, tags: [], reflection: "",
        imageUrl: "/media/u1/img.jpg",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "q5", bookId: "b1", content: "无图", kind: "quote",
        page: 2, tags: [], reflection: "",
        imageUrl: "",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  h.renderQuotes();
  const html = h.getQuotesListMarkup();
  assert.equal((html.match(/quote-cover-art--quote/g) || []).length, 2, "两张卡都应使用摘抄封面");
  assert.ok(!html.includes('/media/u1/img.jpg'), "列表中不应泄露原图 URL");
});
