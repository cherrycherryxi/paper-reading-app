// OPT-079 + OPT-080: 关联体验双修回归覆盖。
// OPT-079 — 摘抄卡 ⋯ 菜单新增「关联」直达入口（来源自动预填当前摘抄）。
// OPT-080 — 关联对话框目标摘抄下拉不再双重截断（32 字 + CSS 单行省略），
//           同书多段摘抄可辨识。
// 通过 vm.runInNewContext 执行真实 app.js：renderQuotes 输出为真跑断言，
// quoteLabel/combobox 样式为源码级断言（嵌套函数无法经 hook 直达）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, hidden: false,
    style: {}, dataset: {}, parentNode: null, children: [], files: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
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
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  renderQuotes, els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

const baseState = () => ({ books: [], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });

// ─── OPT-079: 摘抄卡菜单含「关联」入口（真跑 renderQuotes） ───

test("OPT-079: 摘抄卡 ⋯ 菜单渲染出「关联」直达入口", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  h.setState({
    ...baseState(),
    books: [{ id: "b1", title: "三体" }],
    quotes: [{ id: "q1", bookId: "b1", content: "给时光以生命", createdAt: "2026-01-01T00:00:00Z", kind: "quote" }],
  });
  h.renderQuotes();
  const html = h.els.quotesList.innerHTML;
  assert.match(html, /data-quote-menu="connect"/, "菜单必须含关联入口");
  // 与既有 chat/edit/delete 项共存，未破坏原菜单
  assert.match(html, /data-quote-menu="chat"/);
  assert.match(html, /data-quote-menu="edit"/);
});

// ─── OPT-079: handler 分支从摘抄发起关联并预填来源（源码级） ───

test("OPT-079: connect 分支以 sourceType:quote 打开关联对话框（来源预填）", () => {
  // handler 位于 bindEvents 内（被 boot 剥离），断言源码含正确分支。
  assert.match(
    appSource,
    /action === "connect"\)\s*openConnectionDialog\(\{\s*sourceType:\s*"quote",\s*sourceId:\s*id\s*\}\)/,
    "connect 分支必须以 quote 来源调用 openConnectionDialog（预填当前摘抄）"
  );
});

// ─── OPT-080: 目标摘抄下拉不再双重截断 ───

test("OPT-080: quoteLabel 截断阈值放宽（32 → 70 字）", () => {
  // quoteLabel 是 combobox init 内的嵌套函数，源码级断言其阈值已放宽。
  assert.doesNotMatch(appSource, /\.slice\(0,\s*32\)\s*\+\s*\(q\.content\?\.length\s*>\s*32/,
    "旧的 32 字截断必须已移除");
  assert.match(appSource, /\.slice\(0,\s*70\)\s*\+\s*\(q\.content\?\.length\s*>\s*70/,
    "quoteLabel 应截断至 70 字（两行封顶下更贴合）");
});

test("OPT-080: 目标下拉行改为两行封顶，不再单行强省略", () => {
  // 旧样式 white-space:nowrap;text-overflow:ellipsis 会与 slice 叠加双重截断。
  assert.doesNotMatch(appSource, /li\.style\.cssText = "overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"/,
    "旧的单行强省略样式必须已移除");
  assert.match(appSource, /-webkit-line-clamp:2/, "目标下拉行应两行封顶（line-clamp:2）");
});
