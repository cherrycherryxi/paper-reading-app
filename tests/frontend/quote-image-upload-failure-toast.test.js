// OPT-183：addQuote 图片上传失败时，内层「图片上传失败，先保存文字」提示会被紧随其后的
// 「摘抄卡片已保存/摘抄已更新」无条件覆盖，用户对照片未保存毫不知情。修复：记录上传失败
// 标志，最终 toast 改为反映「图片上传失败可补图」，不再播报单纯成功。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createHarness() {
  const toasts = [];
  const context = {
    console: { log() {}, error() {}, warn() {} },
    document: {
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, classList: { add() {}, remove() {} } }; },
      getElementById() { return null; },
      addEventListener() {}, removeEventListener() {},
    },
    window: {
      PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
      dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
      clearTimeout() {}, setTimeout() { return 1; },
      requestAnimationFrame() {},
    },
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON,
    Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  addQuote,
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingImage(v) { pendingQuoteImage = v; },
  setState(v) { state = v; },
  setUploadQuoteImage(fn) { uploadQuoteImage = fn; },
  setSyncState(fn) { syncState = fn; },
  setShowToast(fn) { showToast = fn; },
  setRenderHero(fn) { renderHero = fn; },
  setRenderSummary(fn) { renderSummary = fn; },
  setRenderQuotes(fn) { renderQuotes = fn; },
  setRenderConnections(fn) { renderConnections = fn; },
  setRenderBooks(fn) { renderBooks = fn; },
  setCloseDialog(fn) { closeDialog = fn; },
  setResetQuoteDraft(fn) { resetQuoteDraft = fn; },
  setActivateTab(fn) { activateTab = fn; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__testHooks;

  hooks.setCurrentUser({ id: "u1", username: "t" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [], quotes: [], sessions: [], chatHistories: {} });
  hooks.setPendingImage(null);
  const noop = () => {};
  hooks.setRenderHero(noop);
  hooks.setRenderSummary(noop);
  hooks.setRenderQuotes(noop);
  hooks.setRenderConnections(noop);
  hooks.setRenderBooks(noop);
  hooks.setCloseDialog(noop);
  hooks.setResetQuoteDraft(noop);
  hooks.setActivateTab(noop);
  hooks.setSyncState(async () => ({ saved: true }));
  hooks.setShowToast((msg) => toasts.push(msg));

  return {
    hooks,
    toasts,
    lastToast: () => toasts[toasts.length - 1],
  };
}

function newForm(entries = []) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

test("图片上传失败时最终 toast 反映照片未保存，而非单纯「已保存」", async () => {
  const { hooks, lastToast } = createHarness();
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", ocrSource: "" });
  hooks.setUploadQuoteImage(async () => { throw new Error("upload failed"); });
  await hooks.addQuote(newForm([["bookId", "b1"], ["content", "摘录内容"]]));

  const t = lastToast();
  assert.ok(t.includes("图片上传失败"), `最终 toast 应含「图片上传失败」，实际: ${t}`);
  assert.ok(!t.includes("摘抄卡片已保存"), `不应再播报单纯成功，实际: ${t}`);
});

test("图片上传成功路径 toast 不受影响", async () => {
  const { hooks, lastToast } = createHarness();
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", ocrSource: "" });
  hooks.setUploadQuoteImage(async () => "http://x/y.jpg");
  await hooks.addQuote(newForm([["bookId", "b1"], ["content", "摘录内容"]]));

  assert.equal(lastToast(), "摘抄卡片已保存");
});

test("编辑已有摘抄时图片上传失败，更新 toast 也反映照片未保存", async () => {
  const { hooks, lastToast } = createHarness();
  hooks.setState({
    books: [],
    quotes: [{ id: "q1", bookId: "b1", content: "old", imageUrl: "http://old.jpg" }],
    sessions: [],
    chatHistories: {},
  });
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", ocrSource: "" });
  hooks.setUploadQuoteImage(async () => { throw new Error("upload failed"); });
  await hooks.addQuote(newForm([["id", "q1"], ["bookId", "b1"], ["content", "new"]]));

  const t = lastToast();
  assert.ok(t.includes("图片上传失败"), `最终 toast 应含「图片上传失败」，实际: ${t}`);
  assert.ok(t.includes("摘抄已更新"), `编辑路径应含「摘抄已更新」，实际: ${t}`);
});
