// 「一键清除全部筛选」从书单页扩展到 记录 / 摘抄 / 关联 三页（呼应 07-11 signal）。
// 本测试执行真实 app.js，验证 hasActive*Filters / clearAll*Filters 行为，并做结构断言。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

function elStub(tag = "div") {
  let html = "";
  const el = {
    tagName: String(tag).toUpperCase(), hidden: false, value: "", textContent: "",
    className: "", disabled: false, dataset: {}, children: [], style: {}, files: [],
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); el.children = []; },
    appendChild(c) { el.children.push(c); return c; },
    append(...cs) { el.children.push(...cs); }, prepend(c) { el.children.unshift(c); },
    insertAdjacentHTML() {}, removeChild() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    closest() { return null; }, focus() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
  };
  return el;
}

function createHarness() {
  const elements = new Map();
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, elStub()); return elements.get(id); };
  const document = {
    querySelector: getEl, querySelectorAll: () => [],
    createElement: (tag) => elStub(tag), getElementById: (id) => getEl(`#${id}`),
    body: elStub(), addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };
  const src = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${src}
globalThis.__hooks = {
  els,
  hasActiveSessionFilters, clearAllSessionFilters,
  hasActiveQuoteFilters, clearAllQuoteFilters,
  hasActiveConnectionFilters, clearAllConnectionFilters,
  setState(v){ state = v; }, setUser(u){ currentUser = u; },
};`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

const EMPTY_STATE = { books: [], quotes: [], sessions: [], connections: [] };

for (const page of [
  { name: "记录/sessions", search: "sessionSearch", has: "hasActiveSessionFilters", clear: "clearAllSessionFilters" },
  { name: "摘抄/quotes", search: "quoteSearch", has: "hasActiveQuoteFilters", clear: "clearAllQuoteFilters" },
  { name: "关联/connections", search: "connectionSearch", has: "hasActiveConnectionFilters", clear: "clearAllConnectionFilters" },
]) {
  test(`${page.name}：搜索有内容时 hasActive 为真，clearAll 清空后为假`, () => {
    const h = createHarness();
    h.setUser({ id: "u1" });
    h.setState({ ...EMPTY_STATE });
    assert.equal(h[page.has](), false, "初始无筛选");
    h.els[page.search].value = "关键词";
    assert.equal(h[page.has](), true, "搜索有内容 → 有筛选");
    h[page.clear]();
    assert.equal(h.els[page.search].value, "", "清除后搜索框应为空");
    assert.equal(h[page.has](), false, "清除后无筛选");
  });
}

test("结构：三页都有 ✕ 清除按钮、render 里切换其显隐、bindEvents 里绑定点击", () => {
  for (const id of ["clearSessionFiltersBtn", "clearQuoteFiltersBtn", "clearConnectionFiltersBtn"]) {
    assert.ok(indexHtml.includes(`id="${id}"`), `index.html 应有 #${id}`);
  }
  // 每个 render 函数把对应 ✕ 按钮按 hasActive*Filters 结果显隐
  assert.match(appSource, /els\.clearSessionFiltersBtn\?\.classList\.toggle\("is-hidden", !hasActiveSessionFilters\(\)\)/);
  assert.match(appSource, /els\.clearQuoteFiltersBtn\?\.classList\.toggle\("is-hidden", !hasActiveQuoteFilters\(\)\)/);
  assert.match(appSource, /els\.clearConnectionFiltersBtn\?\.classList\.toggle\("is-hidden", !hasActiveConnectionFilters\(\)\)/);
  // 点击绑定
  assert.match(appSource, /els\.clearSessionFiltersBtn\?\.addEventListener\("click", clearAllSessionFilters\)/);
  assert.match(appSource, /els\.clearQuoteFiltersBtn\?\.addEventListener\("click", clearAllQuoteFilters\)/);
  assert.match(appSource, /els\.clearConnectionFiltersBtn\?\.addEventListener\("click", clearAllConnectionFilters\)/);
});

test("摘抄/关联的 hasActive 也把 chip 维度算进去（不只搜索）", () => {
  // 摘抄：读 active chip 的 data-quote-type；关联：读 selectedConnectionKindFilter
  assert.match(appSource, /function hasActiveQuoteFilters\(\)[\s\S]{0,160}dataset\.quoteType[\s\S]{0,80}!==\s*"all"/);
  assert.match(appSource, /function hasActiveConnectionFilters\(\)[\s\S]{0,160}selectedConnectionKindFilter\s*!==\s*"all"/);
});
