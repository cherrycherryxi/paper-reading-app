// OPT-127: resolveConnectionSide() 的 quote 分支仅读 content，OCR 摘抄（content 为空、
// ocrText 才是正文）作为关联节点时，节点标签退化成空引号 ""...""。
// 修复：text = quote.content || quote.ocrText || ""
// 本测试真跑 app.js 的 resolveConnectionSide + buildConnectionCard，
// 验证 OCR 摘抄作为关联来源/目标时节点标签含正文。
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
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    showModal() { this.open = true; }, close() { this.open = false; },
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
  resolveConnectionSide,
  buildConnectionCard,
  setState(v) { state = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

function makeState(overrides = {}) {
  return {
    books: [{ id: "b1", title: "置身事内", author: "兰小欢" }],
    quotes: [],
    sessions: [],
    connections: [],
    chatHistories: {},
    chatContexts: {},
    ...overrides,
  };
}

test("OPT-127: OCR 摘抄（content 空）作为关联节点时，标签含 ocrText 正文", () => {
  const h = createHarness();
  const ocrQuote = { id: "q-ocr", bookId: "b1", kind: "quote", content: "", ocrText: "政府的土地财政依赖于城市扩张。" };
  h.setState(makeState({ quotes: [ocrQuote] }));

  const result = h.resolveConnectionSide("quote", "q-ocr");
  assert.ok(result.label.includes("政府的土地财政"), `label 应含 ocrText 正文，实际得到: ${result.label}`);
  assert.ok(!result.label.includes('""'), `label 不应退化为空引号，实际得到: ${result.label}`);
});

test("OPT-127: 手打摘抄（content 有值）节点标签不受影响", () => {
  const h = createHarness();
  const typedQuote = { id: "q-typed", bookId: "b1", kind: "quote", content: "给时光以生命", ocrText: "" };
  h.setState(makeState({ quotes: [typedQuote] }));

  const result = h.resolveConnectionSide("quote", "q-typed");
  assert.ok(result.label.includes("给时光以生命"), `label 应含 content，实际得到: ${result.label}`);
});

test("OPT-127: 超长 ocrText 按 36 字截断并加省略号", () => {
  const h = createHarness();
  const long = "一".repeat(50);
  const q = { id: "q-long", bookId: "b1", kind: "quote", content: "", ocrText: long };
  h.setState(makeState({ quotes: [q] }));

  const result = h.resolveConnectionSide("quote", "q-long");
  assert.ok(result.label.includes("…"), `超长 ocrText 应含省略号，实际得到: ${result.label}`);
  assert.ok(result.label.includes("一".repeat(36)), `应截断到 36 字`);
});

test("OPT-127: 恰好 36 字不加省略号（边界）", () => {
  const h = createHarness();
  const exact = "二".repeat(36);
  const q = { id: "q-exact", bookId: "b1", kind: "quote", content: "", ocrText: exact };
  h.setState(makeState({ quotes: [q] }));

  const result = h.resolveConnectionSide("quote", "q-exact");
  assert.ok(!result.label.includes("…"), `恰好 36 字不应加省略号，实际得到: ${result.label}`);
});

test("OPT-127: OCR 摘抄作为关联来源节点时，buildConnectionCard 渲染出正文", () => {
  const h = createHarness();
  const ocrQuote = { id: "q-ocr", bookId: "b1", kind: "quote", content: "", ocrText: "知识的诅咒让专家难以沟通。" };
  const typedQuote = { id: "q-typed", bookId: "b1", kind: "quote", content: "凡事皆有代价", ocrText: "" };
  h.setState(makeState({ quotes: [ocrQuote, typedQuote] }));

  const conn = { id: "c1", sourceType: "quote", sourceId: "q-ocr", targetType: "quote", targetId: "q-typed", kind: "引用", tags: [], thought: "" };
  const card = h.buildConnectionCard(conn);

  assert.ok(card.includes("知识的诅咒"), `关联卡 source 侧应含 OCR 正文，实际得到: ${card}`);
  assert.ok(card.includes("凡事皆有代价"), `关联卡 target 侧应含手打正文，实际得到: ${card}`);
  assert.ok(!card.includes('""...""'), `关联卡不应出现空引号节点`);
});
