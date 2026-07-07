// bug-406: 关联对话框「在目标摘抄框输入，却弹出并显示来源那一侧的下拉」。
// 根因：4 个 combobox（来源/目标 × 书/摘抄）各自维护 is-open，iOS 上切换输入框时
// blur→close 的 200ms 延时 + 软键盘下 position:fixed 重定位会让上一个下拉残留。
// 修复：单例注册——打开任一下拉前先关掉当前打开的那个。
// 本测试直接执行真实 app.js 里的 _registerOpenCombobox/_unregisterOpenCombobox，
// 并用源码级断言确认 openList/closeList 已接入注册表。
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
    className: "", textContent: "", value: "", open: false, style: {}, dataset: {},
    parentNode: null, children: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    showModal() {}, close() {}, setAttribute() {}, closest() { return null; },
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
    clearTimeout() {}, setTimeout(fn) { return fn(); },
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Set,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = { _registerOpenCombobox, _unregisterOpenCombobox };
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

test("bug-406: 打开一个下拉会关掉当前已打开的那个（单例）", () => {
  const h = createHarness();
  let closedA = 0, closedB = 0;
  const closeA = () => { closedA++; };
  const closeB = () => { closedB++; };

  h._registerOpenCombobox(closeA);        // A 打开
  assert.equal(closedA, 0, "首个打开不触发任何关闭");

  h._registerOpenCombobox(closeB);        // B 打开 → 应关掉 A
  assert.equal(closedA, 1, "打开 B 必须关掉 A");
  assert.equal(closedB, 0, "B 自己不被关");
});

test("bug-406: 重复注册同一个 closer 不会自我关闭", () => {
  const h = createHarness();
  let closed = 0;
  const close = () => { closed++; };
  h._registerOpenCombobox(close);
  h._registerOpenCombobox(close); // 同一个（如 input 事件里再次 openList）
  assert.equal(closed, 0, "同一 combobox 反复 open 不应触发自身 close");
});

test("bug-406: 注销当前 closer 后，新打开的不会误关已注销的", () => {
  const h = createHarness();
  let closedA = 0, closedB = 0;
  const closeA = () => { closedA++; };
  const closeB = () => { closedB++; };
  h._registerOpenCombobox(closeA);
  h._unregisterOpenCombobox(closeA);   // A 自行关闭（blur/pick）
  h._registerOpenCombobox(closeB);     // B 打开
  assert.equal(closedA, 0, "A 已注销，不应被再次关闭");
  assert.equal(closedB, 0);
});

test("bug-406: 注销非当前 closer 不影响当前活动项", () => {
  const h = createHarness();
  let closedA = 0;
  const closeA = () => { closedA++; };
  const closeB = () => {};
  h._registerOpenCombobox(closeA);
  h._unregisterOpenCombobox(closeB);   // 注销一个并非当前活动的 closer
  // A 仍是活动项：注册 C 时应仍关掉 A
  const closeC = () => {};
  h._registerOpenCombobox(closeC);
  assert.equal(closedA, 1, "A 仍是活动项，注册 C 时应关掉 A");
});

test("bug-406: openList/closeList 已接入单例注册表（源码级）", () => {
  // 两个工厂（书/摘抄 combobox）的 openList 都必须先注册（关掉其它），closeList 必须注销。
  const opens = appSource.match(/function openList\(\)\s*\{\s*_registerOpenCombobox\(closeList\);/g) || [];
  assert.equal(opens.length, 2, "两个 combobox 工厂的 openList 都应调用 _registerOpenCombobox(closeList)");
  const closes = appSource.match(/_unregisterOpenCombobox\(closeList\);/g) || [];
  assert.equal(closes.length, 2, "两个 closeList 都应调用 _unregisterOpenCombobox(closeList)");
});
