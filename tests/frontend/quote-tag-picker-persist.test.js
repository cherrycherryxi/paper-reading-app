// 摘抄标签 picker 的来源 = 默认标签 + 用户经输入框「手动敲过」的自定义标签(localStorage)。
//
// 反复迭代后的最终结论(用户多次澄清):
//  - 不要从 state.quotes 反推「这本书用过的标签」。state.quotes 混装了 摘抄(quote)/笔记(note)/
//    提问(question) 三类卡片，且标签里还混着 AI OCR 自动生成的，几十个堆在一起特别杂乱。
//  - 用户只要：默认标签 + 自己在摘抄表单里手动加过的标签。后者正好就是 localStorage 的
//    quote-custom-tags（只在标签输入框按 Enter 时写入）。
//  - 因此 picker 必须与「当前选了哪本书」无关——不再有 bookId 时机导致的忽多忽少。
//
// 本测试执行真实 app.js 的 renderQuoteTagPicker 并断言上述行为。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function elStub() {
  let innerHTML = "";
  return {
    value: "",
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}

function createHarness({ localStorageStore = {} } = {}) {
  const elements = new Map();
  // #quoteForm 的 [name="bookId"] 字段:测试可设值，用来证明 picker 内容与当前书无关。
  const bookIdField = { value: "" };
  const quoteFormEl = Object.assign(elStub(), {
    querySelector: (sel) => (sel === '[name="bookId"]' ? bookIdField : null),
  });
  function getElement(id) {
    if (id === "#quoteForm") return quoteFormEl;
    if (!elements.has(id)) elements.set(id, elStub());
    return elements.get(id);
  }
  const document = {
    querySelector: getElement,
    querySelectorAll: () => [],
    createElement: () => elStub(),
    getElementById: (id) => getElement(`#${id}`),
    body: elStub(),
    addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  const context = {
    console, document, window,
    localStorage: {
      getItem: (k) => (k in localStorageStore ? localStorageStore[k] : null),
      setItem: (k, v) => { localStorageStore[k] = String(v); },
      removeItem: (k) => { delete localStorageStore[k]; },
    },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    CustomEvent: function(t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  renderQuoteTagPicker,
  getCustomQuoteTags,
  saveCustomQuoteTags,
  setState(v) { state = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return {
    hooks: context.__testHooks,
    chips: getElement("#quoteTagChips"),
    setFormBookId: (id) => { bookIdField.value = id; },
    localStorageStore,
  };
}

// 这本书的摘抄/笔记上用过一堆标签（含 AI 自动标签、笔记标签）——picker 绝不能把它们拖进来。
const NOISY_STATE = {
  books: [], sessions: [], connections: [],
  quotes: [
    { id: "q1", bookId: "bookA", kind: "quote", tags: ["AI自动标签", "意识流", "历史叙事"] },
    { id: "n1", bookId: "bookA", kind: "note", tags: ["笔记标签", "宏大叙事", "哀伤"] },
  ],
};

test("picker = 默认标签 + localStorage 手动自定义标签，不含书里用过的笔记/AI 标签", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(["我手敲的"]) },
  });
  hooks.setState(NOISY_STATE);
  setFormBookId("bookA"); // 即使选了这本嘈杂的书
  hooks.renderQuoteTagPicker([]);

  assert.match(chips.innerHTML, /data-pick-tag="金句"/, "默认标签在");
  assert.match(chips.innerHTML, /data-pick-tag="我手敲的"/, "手动自定义标签在");
  // 关键:书里用过的笔记标签、AI 自动标签一个都不许出现。
  for (const noise of ["笔记标签", "宏大叙事", "哀伤", "AI自动标签", "意识流", "历史叙事"]) {
    assert.ok(!chips.innerHTML.includes(noise), `不得出现书里用过的杂乱标签: ${noise}`);
  }
});

test("regression(本次 bug): picker 内容与当前选了哪本书无关——选书前后渲染结果一致，不再忽多忽少", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(["战争", "语言", "历史"]) },
  });
  hooks.setState(NOISY_STATE);

  // 打开瞬间还没选定书（bookId 为空）—— 旧 bug 里这是「干净」态
  setFormBookId("");
  hooks.renderQuoteTagPicker([]);
  const htmlNoBook = chips.innerHTML;

  // 选定书后再渲染（旧 bug 里这一步会突然爆出这本书的几十个标签）
  setFormBookId("bookA");
  hooks.renderQuoteTagPicker([]);
  const htmlWithBook = chips.innerHTML;

  assert.equal(htmlWithBook, htmlNoBook, "选书前后 picker 必须完全一致（修复忽多忽少的核心）");
});

test("手敲新标签后立即重渲染，picker 只多出这一个，不会蹦出书里的其它标签", () => {
  const store = { "quote-custom-tags": JSON.stringify(["战争"]) };
  const { hooks, chips, setFormBookId } = createHarness({ localStorageStore: store });
  hooks.setState(NOISY_STATE);
  setFormBookId("bookA");

  // 模拟 Enter 新增「历史」：写入 localStorage 后重渲染（真实 Enter 处理器就是这么做的）
  hooks.saveCustomQuoteTags([...hooks.getCustomQuoteTags(), "历史"]);
  hooks.renderQuoteTagPicker(["历史"]);

  assert.match(chips.innerHTML, /data-pick-tag="战争"/, "原有手动标签在");
  assert.match(chips.innerHTML, /data-pick-tag="历史"/, "新加的手动标签在");
  for (const noise of ["笔记标签", "AI自动标签", "意识流"]) {
    assert.ok(!chips.innerHTML.includes(noise), `新增后不得蹦出书里的杂乱标签: ${noise}`);
  }
});

test("默认标签与手动标签去重：同名只渲染一次", () => {
  const { hooks, chips } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(["金句"]) }, // 与默认重名
  });
  hooks.setState({ books: [], sessions: [], quotes: [], connections: [] });
  hooks.renderQuoteTagPicker([]);
  const count = (chips.innerHTML.match(/data-pick-tag="金句"/g) || []).length;
  assert.equal(count, 1, "默认标签『金句』即便也在 localStorage，也只渲染一次");
});
