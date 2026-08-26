// OPT-111: 关联对话框的摘抄下拉里，OCR 摘抄正文只存在 quote.ocrText（content 为空），
// 旧的 quoteLabel()/filteredQuotes() 只读 content —— 标签退化成「书名 · 」，搜索也搜不到。
// 本测试真跑 app.js 的 initQuoteCombobox：focus 打开下拉、input 过滤，断言渲染出的 <li>。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const classes = new Set();
  const listeners = {};
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", scrollHeight: 0,
    style: { cssText: "" }, dataset: {}, children: [], _listeners: listeners,
    classList: {
      add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
      toggle() {}, contains(c) { return classes.has(c); },
    },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    dispatch(type, e = {}) { (listeners[type] || []).forEach((fn) => fn(e)); },
    getBoundingClientRect() { return { top: 100, bottom: 140, left: 20, width: 300 }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    showModal() {}, close() {}, setAttribute() {}, closest() { return null; }, focus() {},
    blur() { this.dispatch("blur"); },
  };
}

function createHarness() {
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };
  const document = {
    body: createElementStub("body"),
    addEventListener() {},
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
globalThis.__hooks = {
  initQuoteCombobox,
  setState(v) { state = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

// 装一个摘抄 combobox，返回驱动它所需的把手。
function mountQuoteCombobox(quotes, { books, scope = "all", sourceQuoteId = "" } = {}) {
  const hooks = createHarness();
  hooks.setState({
    books: books || [{ id: "b1", title: "置身事内", author: "兰小欢" }],
    quotes, sessions: [], connections: [], chatHistories: {}, chatContexts: {},
  });

  const textInput = createElementStub("input");
  const list = createElementStub("ul");
  const clearButton = createElementStub("button");
  const wrapper = createElementStub("div");
  wrapper.querySelector = (sel) => {
    if (sel === ".book-combobox-input") return textInput;
    if (sel === ".book-combobox-list") return list;
    if (sel === ".quote-combobox-clear") return clearButton;
    return null;
  };
  const hiddenInput = createElementStub("input");
  const scopeSelect = createElementStub("select");
  scopeSelect.value = scope;

  hooks.initQuoteCombobox(wrapper, hiddenInput, { scopeSelect, sourceQuoteId: () => sourceQuoteId });
  wrapper._comboboxUpdate(quotes);

  return {
    wrapper, textInput, list, hiddenInput, scopeSelect, clearButton,
    // focus 打开下拉；labels() 读渲染出的 <li> 文本
    open() { textInput.dispatch("focus"); },
    type(q) { textInput.value = q; textInput.dispatch("input"); },
    labels() { return list.children.map((li) => li.dataset.label || li.textContent); },
  };
}

const OCR_QUOTE = { id: "q-ocr", bookId: "b1", kind: "quote", content: "", ocrText: "政府的土地财政依赖于城市扩张。" };
const TYPED_QUOTE = { id: "q-typed", bookId: "b1", kind: "quote", content: "手打的摘抄正文。", ocrText: "" };

test("OPT-111: OCR 摘抄（content 空、只有 ocrText）在下拉里显示正文，而不是「书名 · 」空标签", () => {
  const c = mountQuoteCombobox([OCR_QUOTE]);
  c.open();

  const labels = c.labels();
  assert.equal(labels.length, 1, "应渲染出 1 条摘抄");
  assert.equal(labels[0], "置身事内 · 政府的土地财政依赖于城市扩张。",
    "OCR 摘抄标签应回落 ocrText");
  assert.notEqual(labels[0], "置身事内 · ", "不应退化为空标签");
});

test("OPT-111: 搜索 OCR 摘抄的正文能命中（filteredQuotes 回落 ocrText）", () => {
  const c = mountQuoteCombobox([OCR_QUOTE, TYPED_QUOTE]);
  c.open();
  c.type("土地财政");

  assert.deepEqual(c.labels(), ["置身事内 · 政府的土地财政依赖于城市扩张。"],
    "只应命中 OCR 摘抄，且标签带正文");
});

test("OPT-111: 手打摘抄与书名搜索不受影响", () => {
  const c = mountQuoteCombobox([OCR_QUOTE, TYPED_QUOTE]);
  c.open();

  c.type("手打的摘抄");
  assert.deepEqual(c.labels(), ["置身事内 · 手打的摘抄正文。"], "content 搜索仍命中");

  c.type("置身事内");
  assert.equal(c.labels().length, 2, "按书名搜索仍返回该书全部摘抄");

  c.type("不存在的词");
  assert.deepEqual(c.labels(), ["没有匹配的摘抄"], "无命中时仍显示空态");
});

test("OPT-142: 按摘抄标签和我的理解都能找到关联目标", () => {
  const c = mountQuoteCombobox([
    { ...TYPED_QUOTE, id: "q-tagged", tags: ["哲学", "成长"], reflection: "把自由理解成承担后果。" },
    { id: "q-other", bookId: "b1", kind: "quote", content: "没有关联的文字。", tags: [], reflection: "" },
  ]);
  c.open();

  c.type("成长");
  assert.deepEqual(c.labels(), ["置身事内 · 手打的摘抄正文。"], "标签应作为关联弹窗的检索字段");

  c.type("承担后果");
  assert.deepEqual(c.labels(), ["置身事内 · 手打的摘抄正文。"], "我的理解应与摘抄页检索口径一致");
});

test("E289: 连续中文查询按词片召回并优先跨书摘抄", () => {
  const books = [{ id: "b1", title: "见树又见林" }, { id: "b2", title: "你的脚比头年轻" }];
  const quotes = [
    { id: "source", bookId: "b1", kind: "quote", content: "在地球存在的大部分时间里没有生命。", tags: [] },
    { id: "same", bookId: "b1", kind: "quote", content: "地球上的其他讨论。", tags: [] },
    { id: "target", bookId: "b2", kind: "quote", content: "把地球45.4亿年的历史浓缩成一天。", tags: [] },
  ];
  const c = mountQuoteCombobox(quotes, { books, scope: "all", sourceQuoteId: "source" });
  c.open();
  c.type("地球存在时间");

  assert.equal(c.labels()[0], "你的脚比头年轻 · 把地球45.4亿年的历史浓缩成一天。");
  assert.ok(!c.labels().some((label) => label.includes("在地球存在的大部分时间")), "source quote must be excluded");
});

test("E289: 其他书与指定书范围不会被当前书前 30 条挤占", () => {
  const books = [{ id: "b1", title: "当前书" }, { id: "b2", title: "目标书" }, { id: "b3", title: "第三本" }];
  const quotes = [
    { id: "source", bookId: "b1", kind: "quote", content: "来源", tags: [] },
    ...Array.from({ length: 35 }, (_, i) => ({ id: `same-${i}`, bookId: "b1", kind: "quote", content: `当前书摘抄${i}`, tags: [] })),
    { id: "target", bookId: "b2", kind: "quote", content: "跨书目标", tags: [] },
    { id: "third", bookId: "b3", kind: "quote", content: "第三本目标", tags: [] },
  ];
  const c = mountQuoteCombobox(quotes, { books, scope: "other", sourceQuoteId: "source" });
  c.open();
  assert.deepEqual(c.labels(), ["目标书 · 跨书目标", "第三本 · 第三本目标"]);

  c.scopeSelect.value = "book:b2";
  c.scopeSelect.dispatch("change");
  assert.deepEqual(c.labels(), ["目标书 · 跨书目标"]);
});

test("E289: 清除按钮同时移除可见标签和隐藏的目标 ID", () => {
  const c = mountQuoteCombobox([TYPED_QUOTE]);
  c.wrapper._comboboxSetValue("q-typed");
  assert.equal(c.hiddenInput.value, "q-typed");

  c.clearButton.dispatch("click");

  assert.equal(c.hiddenInput.value, "");
  assert.equal(c.textInput.value, "");
});

test("移动端滑动从 touchstart 开始时不误选，完整点击才选择", () => {
  const c = mountQuoteCombobox([TYPED_QUOTE]);
  c.open();
  const option = c.list.children[0];

  option.dispatch("touchstart", { preventDefault() { throw new Error("不应取消原生滚动"); } });
  assert.equal(c.hiddenInput.value, "", "手指落下只是滚动起点，不应选中摘抄");

  option.dispatch("click", { stopPropagation() {} });
  assert.equal(c.hiddenInput.value, "q-typed", "完整点击后才应选中摘抄");
});

test("键盘完成键只收起键盘，不提交或自动选择候选", () => {
  const c = mountQuoteCombobox([TYPED_QUOTE]);
  c.open();
  let prevented = false;
  let stopped = false;

  c.textInput.dispatch("keydown", {
    key: "Enter",
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  });

  assert.equal(prevented, true, "必须阻止 Enter 提交关联表单");
  assert.equal(stopped, true, "必须阻止 Enter 冒泡到外层表单");
  assert.equal(c.hiddenInput.value, "", "不能猜测并自动选择第一条候选");
  assert.equal(c.list.classList.contains("is-open"), true, "收起键盘后应保留列表供滑动选择");
});

test("输入框失焦不会关闭候选列表，避免 iOS 完成键收起键盘时列表消失", () => {
  const c = mountQuoteCombobox([TYPED_QUOTE]);
  c.open();

  c.textInput.dispatch("blur");

  assert.equal(c.list.classList.contains("is-open"), true, "blur 后列表必须继续可选");
  assert.equal(c.hiddenInput.value, "", "失焦本身不能改变选中项");
});

test("候选项分层呈现书名与三行摘抄正文", () => {
  const c = mountQuoteCombobox([TYPED_QUOTE]);
  c.open();
  const option = c.list.children[0];

  assert.equal(option.children[0].className, "quote-combobox-book");
  assert.equal(option.children[0].textContent, "《置身事内》");
  assert.equal(option.children[1].className, "quote-combobox-excerpt");
  assert.equal(option.children[1].textContent, "手打的摘抄正文。");
});

test("历史书名已带书名号时，候选项仍只显示一层书名号", () => {
  const c = mountQuoteCombobox([TYPED_QUOTE], {
    books: [{ id: "b1", title: "《置身事内》", author: "兰小欢" }],
  });
  c.open();

  assert.equal(c.list.children[0].children[0].textContent, "《置身事内》");
  assert.notEqual(c.list.children[0].children[0].textContent, "《《置身事内》》");
});

test("OPT-111: 选中 OCR 摘抄后，输入框回填的也是带正文的标签", () => {
  const c = mountQuoteCombobox([OCR_QUOTE]);
  c.wrapper._comboboxSetValue("q-ocr");

  assert.equal(c.hiddenInput.value, "q-ocr");
  assert.equal(c.textInput.value, "置身事内 · 政府的土地财政依赖于城市扩张。",
    "回填标签应含 ocrText 正文");
});

test("OPT-111: 超长 ocrText 与 content 一样按 70 字截断加省略号（OPT-080 阈值）", () => {
  const long = "一".repeat(80);
  const c = mountQuoteCombobox([
    { id: "q-long-ocr", bookId: "b1", kind: "quote", content: "", ocrText: long },
    { id: "q-long-typed", bookId: "b1", kind: "quote", content: long, ocrText: "" },
  ]);
  c.open();

  const expected = `置身事内 · ${"一".repeat(70)}…`;
  assert.equal(c.labels()[0], expected, "ocrText 也应走 70 字截断");
  assert.equal(c.labels()[1], expected, "content 的 70 字截断不受回落改动影响");
});

test("OPT-111: 恰好 70 字不加省略号（边界）", () => {
  const exact = "一".repeat(70);
  const c = mountQuoteCombobox([{ id: "q70", bookId: "b1", kind: "quote", content: "", ocrText: exact }]);
  c.open();

  assert.equal(c.labels()[0], `置身事内 · ${exact}`, "70 字整不应加「…」");
});
