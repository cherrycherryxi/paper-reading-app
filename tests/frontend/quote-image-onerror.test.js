// OPT-071: 摘抄图片 URL 失效时优雅降级，而非暴露浏览器破图图标。
// - 卡面 <img>（列表卡 / 搜索卡）带 onerror，失败时加 is-hidden 收起破图。
// - 详情弹窗 img.onerror 失败时把整块图片区收起，弹窗退回纯文字。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

function createElementStub() {
  let innerHTML = "";
  const classes = new Set();
  return {
    tagName: "DIV",
    className: "",
    textContent: "",
    style: {},
    dataset: {},
    value: "",
    disabled: false,
    onerror: null,
    onclick: null,
    children: [],
    _classes: classes,
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      toggle() {},
      contains(c) { return classes.has(c); },
    },
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
    paperReadingApp: {},
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
  buildQuoteSearchCard,
  openQuoteDetail,
  getElById: (id) => document.getElementById(id),
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
const IMG_QUOTE = {
  id: "q1", bookId: "b1", content: "摘抄内容", kind: "photo",
  page: 1, tags: [], reflection: "", imageUrl: "/media/u1/photo.jpg",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const baseState = (quotes) => ({ books: [BASE_BOOK], sessions: [], quotes, chatHistories: {}, connections: [] });

test("OPT-071: 列表卡 <img> 带 onerror 回退", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState(baseState([IMG_QUOTE]));
  h.renderQuotes();
  const html = h.getQuotesListMarkup();
  assert.ok(html.includes("<img src="), "有图卡片应渲染 <img>");
  assert.ok(
    html.includes('onerror="this.classList.add(\'is-hidden\')"'),
    "列表卡 <img> 应带 onerror，失败时加 is-hidden 收起破图"
  );
});

test("OPT-071: 搜索卡 <img> 带 onerror 回退", () => {
  const h = createHarness();
  h.setState(baseState([IMG_QUOTE]));
  const card = h.buildQuoteSearchCard(IMG_QUOTE);
  assert.ok(card.innerHTML.includes("<img src="), "有图搜索卡应渲染 <img>");
  assert.ok(
    card.innerHTML.includes('onerror="this.classList.add(\'is-hidden\')"'),
    "搜索卡 <img> 应带 onerror 回退"
  );
});

test("OPT-071: 详情弹窗 img.onerror 触发时收起整块图片区", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState(baseState([IMG_QUOTE]));

  h.openQuoteDetail("q1");

  const imgWrap = h.getElById("quoteDetailImage");
  const img = h.getElById("quoteDetailImg");
  // 打开时图片区应展开（未加载失败）
  assert.ok(!imgWrap._classes.has("is-hidden"), "有 imageUrl 时图片区应展开");
  assert.equal(typeof img.onerror, "function", "应给详情弹窗 img 挂上 onerror");

  // 模拟 URL 失效触发 error
  img.onerror();
  assert.ok(imgWrap._classes.has("is-hidden"), "图片加载失败应把整块图片区收起");
});

test("OPT-071: 无图详情弹窗清掉 onerror，不残留上一张的失败处理", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState(baseState([
    IMG_QUOTE,
    { id: "q2", bookId: "b1", content: "纯文字", kind: "quote", page: 2, tags: [], reflection: "", imageUrl: "", createdAt: "2026-01-02T00:00:00.000Z" },
  ]));

  h.openQuoteDetail("q1");
  h.openQuoteDetail("q2"); // 切到无图摘抄
  const img = h.getElById("quoteDetailImg");
  assert.equal(img.onerror, null, "切到无图摘抄应清掉 onerror");
});
