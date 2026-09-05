// 摘抄标签 picker 的来源与范围。语义演进（两次用户澄清，务必一起看）：
//  - 2026-06 第一版：反推 state.quotes「这本书用过的标签」→ 把 note 卡标签、AI OCR 自动
//    生成的标签全拖进来，几十个堆在一起特别杂乱。结论：候选**只用用户亲手敲过的词**
//    （DEFAULT + localStorage/state 的 quote-custom-tags），绝不直接拿书内标签当来源。
//  - 2026-09-05 用户反馈《见树又见林》里敲的词在下一本书的推荐里冒出来 → 候选集在「手敲词库」
//    之上**按当前书再收窄**：推荐区只展示这本书实际用过的手敲词（书内标签反推后 ∩ 库）。
//    未选书（表单 bookId 空）时给全量库兜底，选定书后收窄。默认 7 个通用词不过滤。
// 两条教训都守住：库外杂标签（AI 自动/从未手敲过）永远进不了推荐；推荐随所选的书走。
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
    hidden: false,
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}

function createHarness({ localStorageStore = {} } = {}) {
  const elements = new Map();
  // #quoteForm 的 [name="bookId"] 字段：测试可设值，驱动「按书过滤」语义。
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
  renderManageTagsList,
  quoteTagsUsedByBook,
  getCustomQuoteTags,
  saveCustomQuoteTags,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return {
    hooks: context.__testHooks,
    chips: getElement("#quoteTagChips"),
    manageBtn: getElement("#quoteManageTagsBtn"),
    manageList: getElement("#manageTagsList"),
    manageEmpty: getElement("#manageTagsEmpty"),
    setFormBookId: (id) => { bookIdField.value = id; },
    localStorageStore,
  };
}

// 自定义词库 = 用户亲手敲过的词（全局，跨书累计）；库外的词（AI 自动标签等）没有资格被推荐。
const LIB = ["意识流", "历史叙事", "哀伤", "我手敲的"];
// 书内卡片：A 书 quote 用过 意识流/历史叙事 + 一个库外 AI 噪音；A 书 note 用过 哀伤（手敲库内）；
// B 书 quote 用过 我手敲的。
const STATE = {
  books: [], sessions: [], connections: [],
  quotes: [
    { id: "q1", bookId: "bookA", kind: "quote", tags: ["意识流", "历史叙事", "AI自动标签"] },
    { id: "n1", bookId: "bookA", kind: "note", tags: ["哀伤"] },
    { id: "q2", bookId: "bookB", kind: "quote", tags: ["我手敲的"] },
  ],
};

test("按书过滤：A 书只推荐 A 书实际用过的手敲词（含 note 卡），别的书的词不出现", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(LIB) },
  });
  hooks.setState(STATE);
  setFormBookId("bookA");
  hooks.renderQuoteTagPicker([]);

  for (const t of ["金句", "意识流", "历史叙事", "哀伤"]) {
    assert.ok(chips.innerHTML.includes(`data-pick-tag="${t}"`), `应推荐: ${t}`);
  }
  // 库外噪音 + 别的书的词，一个都不许出现。
  for (const noise of ["AI自动标签", "我手敲的"]) {
    assert.ok(!chips.innerHTML.includes(noise), `不得出现: ${noise}`);
  }
});

test("B 书只见 B 书用过的词，A 书的手敲词不过去", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(LIB) },
  });
  hooks.setState(STATE);
  setFormBookId("bookB");
  hooks.renderQuoteTagPicker([]);

  assert.ok(chips.innerHTML.includes('data-pick-tag="我手敲的"'), "B 书用过的手敲词在");
  for (const noise of ["意识流", "历史叙事", "哀伤", "AI自动标签"]) {
    assert.ok(!chips.innerHTML.includes(noise), `B 书推荐不得出现: ${noise}`);
  }
});

test("未选书（bookId 空）给全量库兜底；选定书后收窄——不再忽多忽少", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(LIB) },
  });
  hooks.setState(STATE);

  // 打开瞬间还没选定书 → 全量库（此时不能把任何手敲词藏起来）
  setFormBookId("");
  hooks.renderQuoteTagPicker([]);
  for (const t of LIB) {
    assert.ok(chips.innerHTML.includes(`data-pick-tag="${t}"`), `未选书时应给全量: ${t}`);
  }

  // 选定 bookA 后收窄到 A 书用过的
  setFormBookId("bookA");
  hooks.renderQuoteTagPicker([]);
  assert.ok(chips.innerHTML.includes('data-pick-tag="意识流"'), "A 书词保留");
  assert.ok(!chips.innerHTML.includes("我手敲的"), "B 书词被收窄掉");
});

test("选定书后重渲染与初次渲染一致（幂等），编辑卡重进不丢该书推荐", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(LIB) },
  });
  hooks.setState(STATE);
  setFormBookId("bookA");

  hooks.renderQuoteTagPicker([]);
  const once = chips.innerHTML;
  hooks.renderQuoteTagPicker([]);
  assert.equal(chips.innerHTML, once, "同书重复渲染必须完全一致");
});

test("编辑卡片：书用过的词成为普通推荐，卡上选中的库外词以 selected-only 保留", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(LIB) },
  });
  hooks.setState(STATE);
  setFormBookId("bookA");

  // 编辑一张 A 书卡片：tags 含 A 书推荐词「意识流」+ 一个历史残留的库外词「旧标签」
  hooks.renderQuoteTagPicker(["意识流", "旧标签"]);
  assert.match(
    chips.innerHTML,
    /class="tag-chip-pick tag-chip-pick--active"[^>]*data-pick-tag="意识流"/,
    "推荐区里的词以 active 常规 chip 出现"
  );
  assert.match(
    chips.innerHTML,
    /data-selected-only-tag="true" data-pick-tag="旧标签"/,
    "不在推荐里的已选词用 selected-only 形态保留（不丢标签）"
  );
});

test("手敲新词后立即重渲染：新词已是 active，但还没被该书用过 → 暂以 selected-only 展示", () => {
  const store = { "quote-custom-tags": JSON.stringify(["意识流"]) };
  const { hooks, chips, setFormBookId } = createHarness({ localStorageStore: store });
  hooks.setState(STATE);
  setFormBookId("bookA");

  // 模拟 Enter 新增「新词」：写入库后渲染（真实 keydown 处理器就是这两步）
  hooks.saveCustomQuoteTags([...hooks.getCustomQuoteTags(), "新词"]);
  hooks.renderQuoteTagPicker(["新词"]);

  assert.ok(chips.innerHTML.includes('data-pick-tag="意识流"'), "书内已用的手敲词仍在推荐");
  assert.match(chips.innerHTML, /data-selected-only-tag="true" data-pick-tag="新词"/, "新词未用过 → selected-only");
  assert.ok(!chips.innerHTML.includes("我手敲的"), "别的书的词仍不出现");
});

test("手敲词一旦被这本书的卡片用过，就从 selected-only 升级为普通推荐 chip", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(["意识流", "新词"]) },
  });
  // 新词现在挂在 bookA 的一张卡上
  hooks.setState({
    books: [], sessions: [], connections: [],
    quotes: [
      { id: "q1", bookId: "bookA", kind: "quote", tags: ["意识流", "新词"] },
    ],
  });
  setFormBookId("bookA");
  hooks.renderQuoteTagPicker([]);
  assert.match(
    chips.innerHTML,
    /class="tag-chip-pick"[^>]*data-pick-tag="新词"/,
    "用过之后是常规推荐 chip"
  );
  assert.ok(!chips.innerHTML.includes("selected-only"), "不再需要 selected-only 形态");
});

test("默认标签不过滤：每本书都保留 7 个通用词", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(LIB) },
  });
  hooks.setState(STATE);
  setFormBookId("bookB"); // 自定义词最少的书
  hooks.renderQuoteTagPicker([]);
  for (const t of ["金句", "人物", "结构", "哲学", "启发", "情节", "叙事"]) {
    assert.ok(chips.innerHTML.includes(`data-pick-tag="${t}"`), `默认词应在: ${t}`);
  }
});

test("库中手敲词无重复渲染；与默认词重名也只渲染一次", () => {
  const { hooks, chips, setFormBookId } = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(["金句", "意识流", "历史叙事"]) },
  });
  hooks.setState(STATE);
  setFormBookId("bookA");
  hooks.renderQuoteTagPicker([]);
  const count = (chips.innerHTML.match(/data-pick-tag="金句"/g) || []).length;
  assert.equal(count, 1, "『金句』只在默认区出现一次");
});
