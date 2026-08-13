// OPT-147: 大书单不能在一次 renderBooks() 中创建全部 DOM；按页展开应保持顺序和总数。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "..", "styles.css"), "utf8");

function elementStub() {
  const listeners = {};
  let html = "";
  return {
    className: "", textContent: "", dataset: {}, style: {}, children: [], type: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return html; },
    set innerHTML(value) { html = String(value); this.children = []; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    addEventListener(type, fn) { listeners[type] = fn; },
    click() { listeners.click?.(); },
    remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); this.removed = true; },
    querySelector() { return elementStub(); }, querySelectorAll() { return []; }, setAttribute() {}, closest() { return null; },
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
    window: { PAPER_READING_APP_CONFIG: {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function CustomEvent() {}, FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Set, Map, Promise, setTimeout, clearTimeout,
  };
  const source = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  vm.runInNewContext(`${source}
globalThis.hooks = { els, renderBooks, setState(value) { state = value; }, setUser(value) { currentUser = value; } };`, context);
  return context.hooks;
}

function books(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `b${index}`, title: `书${index}`, author: "作者", status: "reading",
    createdAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`, tags: [],
  }));
}

for (const size of [146, 500, 1000]) {
  test(`OPT-147: ${size} 本书首屏最多创建 24 张卡，按需可继续加载`, () => {
    const h = harness();
    h.setUser({ id: "u1" });
    h.setState({ books: books(size), quotes: [], sessions: [], connections: [], chatHistories: {}, chatContexts: {} });
    h.renderBooks();

    const list = h.els.booksList;
    assert.equal(list.children.length, 25, "首屏只应有 24 张卡和 1 个加载更多入口");
    const loadMore = list.children.at(-1);
    assert.equal(loadMore.className, "book-list-load-more");
    assert.equal(loadMore.textContent, `加载更多（已显示 24/${size}）`);

    loadMore.click();
    assert.equal(list.children.length, 49, "加载下一页后应有 48 张卡和 1 个下一页入口");
    assert.equal(list.children.at(-1).textContent, `加载更多（已显示 48/${size}）`);
  });
}

test("OPT-147: 加载入口跨越书单网格整行，避免在多列布局中挤入卡片", () => {
  assert.match(cssSource, /\.book-list-load-more \{[^}]*grid-column: 1 \/ -1;/);
});
