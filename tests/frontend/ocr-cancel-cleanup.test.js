// Bug (2026-06-24): photo → 快速识别 creates+persists a quote server-side
// immediately, so clicking 取消 left an orphan card. Fix: track the
// OCR-created-for-a-new-card quote id (ocrProvisionalQuoteId) and silently
// discard it when the quote dialog closes without saving.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function elStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", disabled: false,
    hidden: false, dataset: {}, children: [], files: [], open: false,
    style: { display: "" }, onclick: null, oninput: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return elStub("button"); },
    querySelectorAll() { return []; },
    showModal() {}, close() {}, reset() {}, setAttribute() {}, removeAttribute() {}, closest() { return null; },
    remove() {},
  };
}

function createHarness() {
  const elements = new Map();
  const getElement = (sel) => { if (!elements.has(sel)) elements.set(sel, elStub()); return elements.get(sel); };
  let syncCalls = 0;

  const document = {
    querySelector: getElement,
    querySelectorAll: () => [],
    createElement: (t) => elStub(t),
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
    localStorage: { getItem: () => "tok", setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ state: {} }) }),
    CustomEvent: function(t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__hooks = {
  discardProvisionalOcrQuote,
  setState(v) { state = v; },
  getState() { return state; },
  setProvisional(v) { ocrProvisionalQuoteId = v; },
  getProvisional() { return ocrProvisionalQuoteId; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  // Replace syncState with a no-op so the test doesn't depend on network/version logic.
  stubSyncState() { syncState = async () => { globalThis.__syncCalls = (globalThis.__syncCalls || 0) + 1; }; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.setCurrentUser({ id: "u1", username: "t" });
  hooks.setAuthToken("tok");
  hooks.stubSyncState();
  context.__syncCalls = 0;
  return { hooks, context };
}

const baseState = () => ({
  books: [], sessions: [], quotes: [], chatHistories: {}, chatContexts: {}, connections: [],
});

test("cancel after OCR discards the provisional quote", () => {
  const { hooks, context } = createHarness();
  hooks.setState({ ...baseState(), quotes: [{ id: "q-ocr", bookId: "b1", content: "识别文字" }] });
  hooks.setProvisional("q-ocr");

  hooks.discardProvisionalOcrQuote(); // simulates dialog `close` without save

  assert.equal(hooks.getState().quotes.length, 0, "orphan OCR quote removed on cancel");
  assert.equal(hooks.getProvisional(), "", "provisional id cleared");
  assert.equal(context.__syncCalls, 1, "change persisted via syncState");
});

test("saved quote is NOT discarded (provisional already cleared)", () => {
  const { hooks, context } = createHarness();
  hooks.setState({ ...baseState(), quotes: [{ id: "q-saved", bookId: "b1", content: "已保存" }] });
  hooks.setProvisional(""); // addQuote clears it before closeDialog on save

  hooks.discardProvisionalOcrQuote();

  assert.equal(hooks.getState().quotes.length, 1, "saved quote kept");
  assert.equal(hooks.getState().quotes[0].id, "q-saved");
  assert.equal(context.__syncCalls, 0, "no delete sync when nothing provisional");
});

test("editing an existing quote then cancel keeps it (never marked provisional)", () => {
  const { hooks } = createHarness();
  hooks.setState({ ...baseState(), quotes: [{ id: "q-existing", bookId: "b1", content: "原有" }] });
  // existingQuoteId was truthy at OCR time → ocrProvisionalQuoteId stays ""
  hooks.setProvisional("");
  hooks.discardProvisionalOcrQuote();
  assert.equal(hooks.getState().quotes.length, 1, "pre-existing edited quote not deleted on cancel");
});

test("connections referencing the discarded quote are cleaned up", () => {
  const { hooks } = createHarness();
  hooks.setState({
    ...baseState(),
    quotes: [{ id: "q-ocr", bookId: "b1", content: "x" }],
    connections: [
      { id: "c1", sourceId: "q-ocr", targetId: "b9" },
      { id: "c2", sourceId: "b8", targetId: "q-ocr" },
      { id: "c3", sourceId: "keep", targetId: "keep2" },
    ],
  });
  hooks.setProvisional("q-ocr");
  hooks.discardProvisionalOcrQuote();
  const conns = hooks.getState().connections;
  assert.deepEqual(conns.map((c) => c.id), ["c3"], "only unrelated connection survives");
});

test("provisional id pointing at an already-gone quote is a no-op (no throw)", () => {
  const { hooks, context } = createHarness();
  hooks.setState({ ...baseState(), quotes: [{ id: "other", bookId: "b1" }] });
  hooks.setProvisional("q-missing");
  hooks.discardProvisionalOcrQuote();
  assert.equal(hooks.getState().quotes.length, 1, "existing quotes untouched");
  assert.equal(hooks.getProvisional(), "", "stale provisional id cleared");
  assert.equal(context.__syncCalls, 0, "no sync when nothing to remove");
});
