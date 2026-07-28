// OPT-140: 建立关联弹窗，来源为摘抄时目标类型应默认「摘抄」而非「书籍」。
// 从摘抄发起 quote-to-quote 关联是主场景，旧代码 targetType 恒默认 "book"，
// 每次都得手动切下拉（2026-06-29 owner 信号）。
//
// 真跑 openConnectionDialog（顶层函数，经 __hooks 直达），断言隐藏的
// #connTargetType 的 value —— 它就是目标类型下拉的初始选中值。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const stub = {
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
    // openConnectionDialog does `form.querySelector('[name="thought"]').value = ""`,
    // so querySelector must return a settable stub, not null.
    querySelector() { return createElementStub(); },
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
showToast = function () {};
globalThis.__hooks = {
  openConnectionDialog,
  getElementById(id) { return document.getElementById(id); },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

function authedHarness() {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  return h;
}

test("OPT-140: 来源为摘抄时，目标类型默认「摘抄」", () => {
  const h = authedHarness();
  h.openConnectionDialog({ sourceType: "quote", sourceId: "q1" });
  assert.equal(h.getElementById("connSourceType").value, "quote");
  assert.equal(h.getElementById("connTargetType").value, "quote",
    "从摘抄发起关联时，目标类型应默认摘抄（quote-to-quote 主场景）");
});

test("OPT-140: 来源为书籍时，目标类型仍默认「书籍」（未回归）", () => {
  const h = authedHarness();
  h.openConnectionDialog({ sourceType: "book", sourceId: "b1" });
  assert.equal(h.getElementById("connTargetType").value, "book");
});

test("OPT-140: 无来源的手动入口，目标类型回落「书籍」", () => {
  const h = authedHarness();
  h.openConnectionDialog();
  assert.equal(h.getElementById("connSourceType").value, "book");
  assert.equal(h.getElementById("connTargetType").value, "book");
});

test("OPT-140: 显式传入的 targetType 优先于来源推导", () => {
  const h = authedHarness();
  h.openConnectionDialog({ sourceType: "quote", sourceId: "q1", targetType: "book", targetId: "b1" });
  assert.equal(h.getElementById("connTargetType").value, "book",
    "显式 targetType 必须覆盖来源默认");
});
