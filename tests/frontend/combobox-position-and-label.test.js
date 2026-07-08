// bug-415: 关联对话框书籍 combobox 两个问题
//  ① 下拉列表书名号《》格式不一致（bookLabel 直接用存储原文，未统一包《》）。
//  ② 下拉浮在输入框上方 / iOS 键盘弹出后停在旧坐标（positionList 只在 dialog-form
//     滚动时重定位，且从不向上翻转）。
// 本测试真跑 positionComboboxList（模块级），bookLabel 用源码级断言（嵌套函数）。
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

function createHarness(windowExtra = {}) {
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
    innerHeight: 800,
    ...windowExtra,
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
globalThis.__hooks = { positionComboboxList };
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

function fakeInput(rect) { return { getBoundingClientRect: () => rect }; }
function fakeList(scrollHeight) { return { scrollHeight, style: {} }; }

// ─── ② 定位：向下 / 向上翻转 ───

test("bug-415: 下方空间充足时下拉贴在输入框下方", () => {
  const h = createHarness(); // innerHeight 800, 无 visualViewport
  const input = fakeInput({ top: 100, bottom: 140, left: 20, width: 300 });
  const list = fakeList(220);
  h.positionComboboxList(input, list);
  assert.equal(list.style.top, "142px", "应贴在输入框下方（bottom+2）");
  assert.equal(list.style.left, "20px");
  assert.equal(list.style.width, "300px");
});

test("bug-415: 键盘挤压使下方放不下、上方更宽裕时向上翻转", () => {
  // 模拟软键盘：visualViewport 只剩 300 高
  const h = createHarness({ visualViewport: { offsetTop: 0, height: 300 } });
  const input = fakeInput({ top: 250, bottom: 290, left: 20, width: 300 });
  const list = fakeList(220);
  h.positionComboboxList(input, list);
  const top = parseFloat(list.style.top);
  assert.ok(top < 250, `应向上翻转到输入框上方（top=${top} 应 < input.top=250）`);
  // top = max(4, 250 - 220 - 2) = 28
  assert.equal(list.style.top, "28px");
});

test("bug-415: 翻转不会把下拉顶出视口顶部（不小于 viewTop+4）", () => {
  const h = createHarness({ visualViewport: { offsetTop: 0, height: 120 } });
  const input = fakeInput({ top: 90, bottom: 110, left: 0, width: 200 });
  const list = fakeList(220); // 列表比可用空间还高
  h.positionComboboxList(input, list);
  assert.ok(parseFloat(list.style.top) >= 4, "翻转后顶部不小于 viewTop+4");
});

// ─── ① 书名号统一 ───

test("bug-415: bookLabel 统一包《》（先去后包，格式一致）", () => {
  // bookLabel 是 initBookCombobox 内的嵌套函数，源码级断言其去后包逻辑。
  assert.match(
    appSource,
    /const bare = \(b\.title \|\| ""\)\.replace\(\/\[《》\]\/g, ""\)\.trim\(\);\s*return `《\$\{bare\}》`/,
    "bookLabel 必须先剥离已有《》再统一包上，保证下拉书名号格式一致"
  );
  // 旧实现（直接返回 b.title）必须已移除
  assert.doesNotMatch(appSource, /function bookLabel\(b\)\s*\{\s*return b\.title \+/,
    "旧的裸 b.title 返回必须已改掉");
});

// ─── positionList 已接入重定位监听（防 iOS 键盘旧坐标）───

test("bug-415: 两个 combobox 都监听 visualViewport 重定位", () => {
  const opens = appSource.match(/window\.visualViewport\?\.addEventListener\("resize", _reposition\)/g) || [];
  assert.equal(opens.length, 2, "书/摘抄两个 combobox 都应在 visualViewport resize 时重定位");
  const winScroll = appSource.match(/window\.addEventListener\("scroll", _reposition, true\)/g) || [];
  assert.equal(winScroll.length, 2, "都应在 window 捕获阶段 scroll 时重定位");
});
