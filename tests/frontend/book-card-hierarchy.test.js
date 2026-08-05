// OPT-146：书单卡片只保留扫读所需的信息；完整元信息仍在详情页可达。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "..", "styles.css"), "utf8");

function elementStub(tagName = "div") {
  let html = "";
  const classes = new Set();
  return {
    tagName: tagName.toUpperCase(), textContent: "", dataset: {}, children: [], style: {}, hidden: false,
    classList: {
      add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) { const on = force === undefined ? !classes.has(name) : Boolean(force); on ? classes.add(name) : classes.delete(name); return on; },
    },
    get className() { return [...classes].join(" "); },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    get innerHTML() { return html; }, set innerHTML(value) { html = String(value); this.children = []; },
    appendChild(child) { this.children.push(child); return child; }, addEventListener() {}, setAttribute() {},
    querySelector() { return elementStub(); }, querySelectorAll() { return []; }, closest() { return null; },
    showModal() {}, focus() {},
  };
}

function harness() {
  const elements = new Map();
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, elementStub());
    return elements.get(selector);
  };
  const context = {
    console,
    document: { querySelector: get, querySelectorAll() { return []; }, getElementById(id) { return get(`#${id}`); }, createElement: elementStub },
    window: { PAPER_READING_APP_CONFIG: {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout() {}, clearTimeout() {} },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function CustomEvent() {}, FormData, structuredClone, requestAnimationFrame() {},
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Set, Map, Promise, setTimeout, clearTimeout,
  };
  const source = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  vm.runInNewContext(`${source}
globalThis.hooks = {
  els, buildRenderCache, buildBookSearchCard, openBookDetailDialog,
  setState(value) { state = value; }
};`, context);
  return context.hooks;
}

function sampleBook(overrides = {}) {
  return {
    id: "b1", title: "冬牧场", author: "李娟", status: "reading",
    currentPage: 80, totalPages: 200, rating: 5, tags: ["自然", "女性", "散文"],
    ...overrides,
  };
}

test("书卡正文只保留作者、进度和一个摘抄指标", () => {
  const h = harness();
  const book = sampleBook();
  h.setState({
    books: [book], sessions: [{ id: "s1", bookId: "b1" }],
    quotes: [{ id: "q1", bookId: "b1", kind: "quote" }, { id: "q2", bookId: "b1", kind: "question" }],
    connections: [{ id: "c1", sourceId: "b1", targetId: "q1" }], chatHistories: {}, chatContexts: {},
  });
  const card = h.buildBookSearchCard(book, h.buildRenderCache());
  const body = card.innerHTML.match(/<div class="book-grid-body">([\s\S]*?)<\/div>\s*$/)?.[1] || "";
  assert.match(body, /book-grid-summary/);
  assert.match(body, /40% · 80\/200 页/);
  assert.match(body, /aria-label="1 条摘抄">✍️ 1</);
  assert.doesNotMatch(body, /book-rating|book-tag-row|book-grid-meta/);
  assert.doesNotMatch(body, /阅读记录|关联/);
});

test("完整评分和标签从卡面降级到书籍详情，不丢失信息", () => {
  const h = harness();
  const book = sampleBook();
  h.setState({ books: [book], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });
  h.openBookDetailDialog("b1");
  assert.match(h.els.bookDetailMeta.textContent, /★★★★★/);
  assert.match(h.els.bookDetailTags.innerHTML, /自然/);
  assert.match(h.els.bookDetailTags.innerHTML, /女性/);
  assert.equal(h.els.bookDetailTags.classList.contains("is-hidden"), false);
});

test("无标签书籍打开详情时不会残留上一张书的标签", () => {
  const h = harness();
  const tagged = sampleBook();
  const plain = sampleBook({ id: "b2", title: "无标签", tags: [] });
  h.setState({ books: [tagged, plain], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });
  h.openBookDetailDialog("b1");
  h.openBookDetailDialog("b2");
  assert.equal(h.els.bookDetailTags.innerHTML, "");
  assert.equal(h.els.bookDetailTags.classList.contains("is-hidden"), true);
});

test("卡片扫描线与详情标签有明确视觉层级", () => {
  assert.match(htmlSource, /id="bookDetailTags"[^>]*aria-label="书籍标签"/);
  assert.match(cssSource, /\.book-grid-summary \{[^}]*border-top: 1px solid var\(--color-border\);[^}]*font-size: 12px;/);
  assert.match(cssSource, /\.book-detail-tag \{[^}]*background: var\(--color-tag-bg\);/);
});
