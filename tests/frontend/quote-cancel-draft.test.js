// 防误触：新增摘抄已拍照/识别/填内容后点取消或按 Esc，先弹「保存卡片 / 继续编辑 / 放弃」
// 确认，不再静默丢掉整张卡。空表单保持一键取消；编辑已有卡片不拦（卡本身还在）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function fieldStub(value = "") {
  return { value, dataset: {} };
}

// 记录 showModal/close/事件监听的 dialog stub。
function dialogStub() {
  const state = { showCalls: 0, closeCalls: 0, listeners: new Map() };
  const el = {
    get showCalls() { return state.showCalls; },
    get closeCalls() { return state.closeCalls; },
    showModal() { state.showCalls += 1; },
    close() { state.closeCalls += 1; },
    addEventListener(type, fn) {
      if (!state.listeners.has(type)) state.listeners.set(type, new Set());
      state.listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { state.listeners.get(type)?.delete(fn); },
    listenerCount(type) { return state.listeners.get(type)?.size || 0; },
    fire(type) {
      [...(state.listeners.get(type) || [])].forEach((fn) => fn({ type, preventDefault() {} }));
    },
    value: "", dataset: {},
    querySelector: () => fieldStub(""),
    querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {}, textContent: "",
  };
  return el;
}

function buttonStub() {
  const listeners = new Map();
  const el = {
    textContent: "", disabled: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    click() { [...(listeners.get("click") || [])].forEach((fn) => fn({ type: "click" })); },
    listenerCount(type) { return listeners.get(type)?.size || 0; },
  };
  return el;
}

function createHarness() {
  const docEls = new Map();
  const getEl = (sel) => { if (!docEls.has(sel)) docEls.set(sel, { value: "", querySelector: () => fieldStub(""), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} }); return docEls.get(sel); };

  const document = {
    querySelector: getEl,
    querySelectorAll: () => [],
    createElement: () => getEl("created"),
    getElementById: (id) => getEl(`#${id}`),
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => "tok", setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__hooks = {
  els,
  quoteDraftHasContent,
  requestCloseQuoteDialog,
  showQuoteDiscardDialog,
  setDialogIsNew(v) { quoteDialogIsNew = v; },
  setProvisional(v) { ocrProvisionalQuoteId = v; },
  getProvisional() { return ocrProvisionalQuoteId; },
  setPendingImage(v) { pendingQuoteImage = v; },
  setPendingImage2(v) { pendingQuoteImage2 = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;

  // 装配真实结构：dialog / 按钮 / 表单字段覆盖到 els 上。
  const quoteDialog = dialogStub();
  const discardDialog = dialogStub();
  const saveBtn = buttonStub();
  const continueBtn = buttonStub();
  const exitBtn = buttonStub();
  const formFields = {
    '[name="bookId"]': fieldStub(""),
    '[name="page"]': fieldStub(""),
    '[name="kind"]': fieldStub("quote"),
    '[name="reflection"]': fieldStub(""),
    '[name="tags"]': fieldStub(""),
    '[name="content"]': fieldStub(""),
  };
  let submitCalls = 0;
  const quoteForm = {
    dataset: {},
    querySelector: (sel) => formFields[sel] || fieldStub(""),
    querySelectorAll: () => [],
    requestSubmit() { submitCalls += 1; },
    reset() {},
  };
  const quoteContent = fieldStub("");
  const quoteContentEl = {
    ...quoteContent,
    style: {}, dataset: {}, value: "", textContent: "", hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
  };
  quoteContentEl.value = quoteContent.value;
  Object.assign(hooks.els, {
    quoteDialog,
    quoteDiscardDialog: discardDialog,
    quoteDiscardSaveBtn: saveBtn,
    quoteDiscardContinueBtn: continueBtn,
    quoteDiscardExitBtn: exitBtn,
    quoteForm,
    quoteContent: quoteContentEl,
  });

  hooks.setCurrentUser({ id: "u1", username: "t" });
  hooks.setAuthToken("tok");
  hooks.setProvisional("");
  hooks.setPendingImage(null);
  hooks.setPendingImage2(null);
  hooks.setDialogIsNew(true);

  const form = {
    set(name, value) { formFields[`[name="${name}"]`].value = value; },
    setContent(value) { quoteContentEl.value = value; },
  };
  return { hooks, quoteDialog, discardDialog, saveBtn, continueBtn, exitBtn, submit: () => submitCalls, form };
}

test("空表单点取消：直接关对话框，不弹确认", () => {
  const { hooks, quoteDialog, discardDialog } = createHarness();
  hooks.requestCloseQuoteDialog();
  assert.equal(quoteDialog.closeCalls, 1, "empty draft closes immediately");
  assert.equal(discardDialog.showCalls, 0, "no confirm for empty draft");
});

test("已拍照（本地照片未上传）→ 弹确认，不直接关", () => {
  const { hooks, quoteDialog, discardDialog } = createHarness();
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", objectUrl: "blob:1", ocrSource: "" });
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 1, "photo work triggers confirm");
  assert.equal(quoteDialog.closeCalls, 0, "quote dialog stays open");
});

test("OCR 已建临时卡（ocrProvisionalQuoteId）→ 弹确认", () => {
  const { hooks, discardDialog } = createHarness();
  hooks.setProvisional("q-ocr1");
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 1, "OCR card must not be silently discarded");
});

test("仅手填了正文 → 弹确认", () => {
  const { hooks, discardDialog, form } = createHarness();
  form.setContent("读了半天的想法……");
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 1);
});

test("填了页码或「我的理解」也算实质内容", () => {
  const { hooks, discardDialog, form } = createHarness();
  form.set("page", "88");
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 1, "page alone is worth protecting");
});

test("只选了书没做任何输入 → 直接关（不算劳动成果）", () => {
  const { hooks, quoteDialog, discardDialog, form } = createHarness();
  form.set("bookId", "b1");
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 0);
  assert.equal(quoteDialog.closeCalls, 1);
});

test("编辑已有卡片时有照片 → 不弹，直接关（卡本身还在，只丢本次改动）", () => {
  const { hooks, quoteDialog, discardDialog } = createHarness();
  hooks.setDialogIsNew(false);
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", objectUrl: "blob:1", ocrSource: "" });
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 0, "edit mode is not gated");
  assert.equal(quoteDialog.closeCalls, 1);
});

test("确认框点「保存卡片」→ 走正常表单提交，摘抄对话框保持可编辑", () => {
  const { hooks, discardDialog, quoteDialog, saveBtn, submit } = createHarness();
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", objectUrl: "blob:1", ocrSource: "" });
  hooks.requestCloseQuoteDialog();
  saveBtn.click();
  assert.equal(discardDialog.closeCalls, 1, "discard dialog closes");
  assert.equal(submit(), 1, "save goes through the real form submit (addQuote validates)");
  assert.equal(quoteDialog.closeCalls, 0, "quote dialog closes only if addQuote succeeds");
});

test("确认框点「继续编辑」→ 只关确认框，回到摘抄编辑", () => {
  const { hooks, discardDialog, quoteDialog, continueBtn, submit } = createHarness();
  hooks.setProvisional("q-ocr2");
  hooks.requestCloseQuoteDialog();
  continueBtn.click();
  assert.equal(discardDialog.closeCalls, 1);
  assert.equal(quoteDialog.closeCalls, 0, "back to editing, nothing discarded");
  assert.equal(submit(), 0);
});

test("确认框点「放弃」→ 关确认框并真正关闭摘抄对话框（close 监听负责清 OCR 临时卡）", () => {
  const { hooks, discardDialog, quoteDialog, exitBtn } = createHarness();
  hooks.setProvisional("q-ocr3");
  hooks.requestCloseQuoteDialog();
  exitBtn.click();
  assert.equal(discardDialog.closeCalls, 1);
  assert.equal(quoteDialog.closeCalls, 1, "discard confirmed closes the quote dialog");
});

test("确认框内按 Esc（cancel 事件）→ 解除按钮绑定，下次弹框重新绑定", () => {
  const { hooks, discardDialog, saveBtn } = createHarness();
  hooks.setPendingImage({ objectUrl: "blob:1" });
  hooks.requestCloseQuoteDialog();
  assert.equal(saveBtn.listenerCount("click"), 1);
  discardDialog.fire("cancel");
  assert.equal(saveBtn.listenerCount("click"), 0, "cancel on confirm unbinds one-shot handlers");
  hooks.requestCloseQuoteDialog();
  assert.equal(discardDialog.showCalls, 2);
  assert.equal(saveBtn.listenerCount("click"), 1, "next confirm rebinds fresh handlers");
});
