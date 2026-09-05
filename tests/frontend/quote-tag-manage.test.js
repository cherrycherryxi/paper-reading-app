// 自定义标签「管理」入口（2026-09-05 用户反馈后补）：
//  - 「管理」按钮只在自定义标签库非空时可见（renderQuoteTagPicker 负责显隐）；
//  - 管理对话框列出库里全部词，删除 = 移出推荐库（state.customQuoteTags + localStorage 镜像
//    双写，syncState 由 saveCustomQuoteTags 统一负责，见 custom-quote-tags-sync.test.js）；
//  - 删除不碰任何已保存卡片上的标签——卡上残留词以 selected-only 形态继续可编辑；
//  - 删除后打开的摘抄表单 chips 同步收窄、「管理」按钮随库清空而隐藏。
// 本测试执行真实 app.js 的 renderQuoteTagPicker / renderManageTagsList 与删除数据流。
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
    // syncState 成功后会用服务器回显覆盖本地 state——回显发送的 body（含 customQuoteTags），
    // 避免空回显把登录态下的 state 覆盖成空骨架。
    fetch: async (url, options = {}) => {
      let body = {};
      try { body = JSON.parse(options.body); } catch (_) {}
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ state: body, stateVersion: "v-test" }) };
    },
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
  getCustomQuoteTags,
  saveCustomQuoteTags,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  getState() { return state; },
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

// 模拟 bindEvents 里删除按钮的完整数据流：删库 → 重渲染列表 → 重渲染当前表单 chips。
// （bindEvents 在测试里被截断，真实浏览器走同一串调用。）
function deleteTag(h, tag) {
  h.hooks.saveCustomQuoteTags(h.hooks.getCustomQuoteTags().filter((t) => t !== tag));
  h.hooks.renderManageTagsList();
  h.hooks.renderQuoteTagPicker([]);
}

// customQuoteTags 必须存在：登录态下它是权威来源（真实启动时 normalizeStateShape 补默认值，
// 测试直接替换 state 所以要自带）。未登录测试走 localStorage 镜像，此字段无碍。
const STATE = {
  books: [], sessions: [], connections: [], customQuoteTags: ["意识流", "别书的词"],
  quotes: [
    // bookA 用过「意识流」「旧库词」；bookB 用过「别书的词」
    { id: "q1", bookId: "bookA", kind: "quote", tags: ["意识流", "旧库词"] },
    { id: "q2", bookId: "bookB", kind: "quote", tags: ["别书的词"] },
  ],
};

test("库非空时「管理」按钮可见；renderManageTagsList 列出全部自定义标签", () => {
  const h = createHarness({
    localStorageStore: { "quote-custom-tags": JSON.stringify(["意识流", "别书的词"]) },
  });
  h.hooks.setState(STATE);
  h.setFormBookId("bookA");

  h.hooks.renderQuoteTagPicker([]);
  assert.equal(h.manageBtn.hidden, false, "有自定义标签就要有管理入口");

  h.hooks.renderManageTagsList();
  assert.ok(h.manageList.innerHTML.includes('data-delete-custom-tag="意识流"'), "列表含词1");
  assert.ok(h.manageList.innerHTML.includes('data-delete-custom-tag="别书的词"'), "列表含词2（全局库全列）");
  assert.equal(h.manageEmpty.hidden, true, "有词时不显示空态");
});

test("库为空时「管理」按钮隐藏、对话框显示空态", () => {
  const h = createHarness({ localStorageStore: {} });
  h.hooks.setState(STATE);
  h.setFormBookId("bookA");

  h.hooks.renderQuoteTagPicker([]);
  assert.equal(h.manageBtn.hidden, true, "没自定义标签不显示管理入口");
  h.hooks.renderManageTagsList();
  assert.equal(h.manageList.innerHTML, "", "列表为空");
  assert.equal(h.manageEmpty.hidden, false, "显示空态提示");
});

test("删除一个词：localStorage 镜像与 state 同步移除，列表刷新", () => {
  const store = { "quote-custom-tags": JSON.stringify(["意识流", "别书的词"]) };
  const h = createHarness({ localStorageStore: store });
  h.hooks.setState(STATE);
  h.hooks.setCurrentUser({ id: "u1" }); // 登录：state 为权威
  h.setFormBookId("bookA");
  h.hooks.renderQuoteTagPicker([]);
  h.hooks.renderManageTagsList();

  deleteTag(h, "别书的词");

  assert.deepEqual(JSON.parse(store["quote-custom-tags"]), ["意识流"], "镜像少一个词");
  // vm realm 内构造的数组原型与测试 realm 不同，spread 后再比较
  assert.deepEqual([...h.hooks.getState().customQuoteTags], ["意识流"], "state 同步移除");
  assert.ok(!h.manageList.innerHTML.includes("别书的词"), "管理列表不再有该词");
  assert.ok(h.manageList.innerHTML.includes('data-delete-custom-tag="意识流"'), "其它词仍在列表");
  assert.equal(h.manageEmpty.hidden, true, "还有词，不显示空态");
});

test("删光所有词：管理列表空态出现，当前表单的「管理」按钮随之隐藏", () => {
  const store = { "quote-custom-tags": JSON.stringify(["意识流"]) };
  const h = createHarness({ localStorageStore: store });
  h.hooks.setState(STATE);
  h.setFormBookId("bookA");
  h.hooks.renderQuoteTagPicker([]);
  h.hooks.renderManageTagsList();
  assert.equal(h.manageBtn.hidden, false, "删除前可见");

  deleteTag(h, "意识流");

  assert.equal(h.manageBtn.hidden, true, "库清空 → 管理按钮隐藏");
  assert.equal(h.manageEmpty.hidden, false, "管理列表显示空态");
});

test("删除后当前表单 chips 收窄：A 书表单里不再推荐已删词", () => {
  const store = { "quote-custom-tags": JSON.stringify(["意识流", "旧库词", "别书的词"]) };
  const h = createHarness({ localStorageStore: store });
  h.hooks.setState(STATE);
  h.setFormBookId("bookA");
  h.hooks.renderQuoteTagPicker([]);
  assert.ok(h.chips.innerHTML.includes('data-pick-tag="意识流"'), "删除前 A 书推荐该词");

  deleteTag(h, "意识流");

  // A 书推荐 = 默认 + (库 ∩ A 书用过) = 旧库词 还在、意识流 没了
  assert.ok(!h.chips.innerHTML.includes("意识流"), "A 书 chips 不再推荐已删词");
  assert.ok(h.chips.innerHTML.includes('data-pick-tag="旧库词"'), "未删且在 A 书用过的词保留");
  assert.ok(!h.chips.innerHTML.includes("别书的词"), "B 书词本来就不在 A 书推荐里");
});

test("卡上已打的词删除后不消失：编辑那张卡时以 selected-only 保留，可取消也可继续用", () => {
  const store = { "quote-custom-tags": JSON.stringify(["意识流"]) };
  const h = createHarness({ localStorageStore: store });
  h.hooks.setState(STATE);
  h.setFormBookId("bookA");
  deleteTag(h, "意识流"); // 词已从库删掉，但 q1 卡上还挂着

  // 编辑 q1（tags=["意识流","旧库词"]，后者库外）：两个词都应作为已选词保留展示
  h.hooks.renderQuoteTagPicker(["意识流", "旧库词"]);
  assert.match(
    h.chips.innerHTML,
    /data-selected-only-tag="true" data-pick-tag="意识流"/,
    "已删库词在卡上仍保留（selected-only）"
  );
  assert.match(
    h.chips.innerHTML,
    /data-selected-only-tag="true" data-pick-tag="旧库词"/,
    "库外残留词同样保留"
  );
});
