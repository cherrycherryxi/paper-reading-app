// OPT-145：标签筛选首屏只展示常用项，并提供可搜索的完整标签面板。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

function elementStub(tagName = "div") {
  const classes = new Set();
  const listeners = {};
  let html = "";
  return {
    tagName: tagName.toUpperCase(), textContent: "", style: {}, dataset: {}, children: [], hidden: false,
    open: false, value: "", focused: false,
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) { const on = force === undefined ? !classes.has(name) : Boolean(force); on ? classes.add(name) : classes.delete(name); return on; },
    },
    get className() { return [...classes].join(" "); },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    get innerHTML() { return html; },
    set innerHTML(value) { html = String(value); this.children = []; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { listeners[type] = fn; },
    dispatch(type, event = {}) { listeners[type]?.({ target: this, ...event }); },
    setAttribute(name, value) { this[name] = String(value); },
    querySelector() { return elementStub(); }, querySelectorAll() { return []; }, closest() { return null; },
    showModal() { this.open = true; }, close() { this.open = false; }, focus() { this.focused = true; },
  };
}

function harness() {
  const elements = new Map();
  const get = (selector) => {
    if (!elements.has(selector)) elements.set(selector, elementStub());
    return elements.get(selector);
  };
  const document = {
    querySelector: get, querySelectorAll() { return []; },
    getElementById(id) { return get(`#${id}`); }, createElement: elementStub,
  };
  const context = {
    console, document,
    window: { PAPER_READING_APP_CONFIG: {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout(fn) { fn(); }, clearTimeout() {} },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function CustomEvent() {}, FormData, structuredClone, requestAnimationFrame() {},
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Set, Map, Promise, setTimeout, clearTimeout,
  };
  const source = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  vm.runInNewContext(`${source}
renderBooks = function () {};
globalThis.hooks = {
  els, getBookTagStats, renderTagFilterChips, renderTagFilterDialog, openTagFilterDialog,
  setState(value) { state = value; }, setTag(value) { selectedTagFilter = value; },
  getTag() { return selectedTagFilter; }
};`, context);
  return context.hooks;
}

const books = [
  { id: "1", tags: ["文学", "女性", "文学"] },
  { id: "2", tags: ["文学", "历史"] },
  { id: "3", tags: ["文学", "哲学"] },
  { id: "4", tags: ["历史", "科幻"] },
  { id: "5", tags: ["随笔"] },
];

test("标签按覆盖书籍数排序，同一本书的重复标签只计一次", () => {
  const h = harness(); h.setState({ books });
  const stats = h.getBookTagStats();
  assert.equal(stats[0].tag, "文学");
  assert.equal(stats[0].count, 3);
  assert.equal(stats.find((item) => item.tag === "历史").count, 2);
});

test("首屏只放三个常用标签，更多入口显示剩余数量", () => {
  const h = harness(); h.setState({ books });
  h.renderTagFilterChips();
  const strip = h.els.tagFilterStrip;
  assert.equal(strip.children[0].children.length, 4, "全部标签 + 三个常用标签");
  assert.equal(strip.children[1].textContent, "更多标签（3）");
});

test("不常用的当前选中标签仍保留在首屏", () => {
  const h = harness(); h.setState({ books }); h.setTag("随笔");
  h.renderTagFilterChips();
  const visible = h.els.tagFilterStrip.children[0].children.map((node) => node.dataset.tagFilter || "");
  assert.ok(visible.includes("随笔"));
});

test("更多标签面板可搜索并从结果中切换筛选", () => {
  const h = harness(); h.setState({ books });
  h.openTagFilterDialog();
  assert.equal(h.els.tagFilterDialog.open, true);
  assert.equal(h.els.tagFilterSearchInput.focused, true);
  h.renderTagFilterDialog("科");
  assert.equal(h.els.tagFilterDialogList.children.length, 1);
  assert.match(h.els.tagFilterDialogList.children[0].textContent, /科幻 · 1 本/);
  h.els.tagFilterDialogList.children[0].dispatch("click");
  assert.equal(h.getTag(), "科幻");
  assert.equal(h.els.tagFilterDialog.open, false);
});

test("标签面板使用具名原生 dialog，搜索结果具备 44px 触控目标", () => {
  assert.match(htmlSource, /<dialog id="tagFilterDialog" aria-labelledby="tag-filter-dialog-label">/);
  assert.match(htmlSource, /id="tagFilterSearchInput" type="search"/);
  const css = fs.readFileSync(path.join(__dirname, "..", "..", "styles.css"), "utf8");
  assert.match(css, /\.tag-filter-dialog-item \{[^}]*min-height: 44px;/);
});
