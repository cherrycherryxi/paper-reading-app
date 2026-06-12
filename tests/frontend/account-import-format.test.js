// OPT-040: importData() must (1) unwrap both export formats — the lightweight
// "导出书单备份" (top-level state fields) and the full "完整账号导出（GDPR）"
// (state nested under `.state` + `exportFormat`) — and (2) guard against a
// file that resolves to empty content silently wiping a non-empty account.
//
// Per project convention these tests execute the REAL app.js via
// vm.runInNewContext (not a re-simulation of the logic).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createElementStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    open: false,
    hidden: false,
    parentNode: null,
    children: [],
    files: [],
    _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {},
    setAttribute() {},
    closest() { return null; },
    // Test helper: invoke the most recently registered click handler.
    _click() { const l = this._listeners.click || []; if (l.length) l[l.length - 1](); },
  };
}

function createHarness() {
  const elements = new Map();
  function getElement(selector) {
    if (!elements.has(selector)) elements.set(selector, createElementStub());
    return elements.get(selector);
  }
  const body = createElementStub("body");
  const document = {
    body,
    querySelector(s) { return getElement(s); },
    querySelectorAll() { return []; },
    createElement(t) { return createElementStub(t); },
    getElementById(id) { return getElement(`#${id}`); },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout(fn) { return fn(); },
    confirm() { return true; },
  };

  // fetch echoes the PUT body back as the new server state, mirroring
  // PUT /api/state's response so syncState() keeps the imported content.
  const fetchCalls = [];
  const context = {
    console,
    document,
    window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      let bodyObj = {};
      try { bodyObj = JSON.parse(options.body); } catch (_) {}
      return {
        ok: true,
        status: 200,
        headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
        json: async () => ({ state: bodyObj, stateVersion: "v-test" }),
      };
    },
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData,
    structuredClone,
    FileReader: function FileReader() {},
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
  };
  context.FileReader.prototype.readAsText = function readAsText(file) {
    this.result = file && typeof file.__text === "string" ? file.__text : "";
    const ret = this.onload ? this.onload() : undefined;
    context.__lastReaderPromise = Promise.resolve(ret);
  };

  // Strip the boot block, then neuter render() (heavy DOM walk, irrelevant here)
  // and expose internals for assertions.
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  importData,
  resolveImportedState,
  stateContentCount,
  els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
  getState() { return state; },
  getReaderPromise() { return globalThis.__lastReaderPromise; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.fetchCalls = fetchCalls;
  return hooks;
}

function emptyState() {
  return { books: [], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} };
}

// --- resolveImportedState: format unwrapping ---

test("OPT-040: lightweight backup (top-level fields) is read as-is", () => {
  const h = createHarness();
  const resolved = h.resolveImportedState({ books: [{ id: "b1" }], sessions: [], quotes: [{ id: "q1" }] });
  assert.equal(resolved.books.length, 1);
  assert.equal(resolved.quotes.length, 1);
});

test("OPT-040: full GDPR export (exportFormat + nested .state) is unwrapped", () => {
  const h = createHarness();
  const gdpr = { exportFormat: 1, exportedAt: "x", state: { books: [{ id: "b1" }, { id: "b2" }], quotes: [{ id: "q1" }] } };
  const resolved = h.resolveImportedState(gdpr);
  assert.equal(resolved.books.length, 2, "should read books from .state, not top level");
  assert.equal(resolved.quotes.length, 1);
});

test("OPT-040: nested .state without exportFormat still unwraps (no top-level books)", () => {
  const h = createHarness();
  const resolved = h.resolveImportedState({ state: { books: [{ id: "b1" }] } });
  assert.equal(resolved.books.length, 1);
});

test("OPT-040: unrecognized object resolves to empty content", () => {
  const h = createHarness();
  assert.equal(h.stateContentCount(h.resolveImportedState({ foo: 1 })), 0);
});

// --- importData: happy path + footgun guard ---

test("OPT-040: importing a GDPR file restores its nested content (no wipe)", async () => {
  const h = createHarness();
  h.setState(emptyState());
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  const file = { __text: JSON.stringify({ exportFormat: 1, state: { books: [{ id: "b1" }], quotes: [{ id: "q1" }] } }) };
  h.importData(file);
  await h.getReaderPromise();
  await flush();
  assert.equal(h.getState().books.length, 1, "GDPR import must restore books, not import empty");
  assert.equal(h.getState().quotes.length, 1);
  // OPT-041: success opens a prominent result dialog with a per-type summary.
  assert.equal(h.els.importResultDialog.open, true, "success must show the import-result dialog");
  assert.match(h.els.importResultList.innerHTML, /书籍/, "result dialog lists per-type counts");
  assert.equal(h.els.confirmDialog.open, false, "valid non-empty import must not prompt");
});

test("OPT-040: a file resolving to empty does NOT silently wipe a non-empty account", async () => {
  const h = createHarness();
  h.setState({ ...emptyState(), books: [{ id: "keep" }] });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  h.importData({ __text: JSON.stringify({ foo: 1 }) }); // unrecognized -> empty
  await h.getReaderPromise();
  await flush();
  // Guard must fire: confirm shown, account untouched.
  assert.equal(h.els.confirmDialog.open, true, "should prompt before wiping");
  assert.equal(h.getState().books.length, 1, "account must be untouched until confirmed");
  assert.notEqual(h.els.toast.textContent, "数据已导入");

  // Confirming proceeds with the (destructive) import.
  h.els.confirmDialogConfirmBtn._click();
  await flush();
  await flush();
  assert.equal(h.getState().books.length, 0, "after explicit confirm the wipe applies");
  assert.equal(h.els.importResultDialog.open, true, "confirmed import shows the result dialog");
});

test("OPT-040: invalid JSON shows a parse error and leaves state untouched", async () => {
  const h = createHarness();
  h.setState({ ...emptyState(), books: [{ id: "keep" }] });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  h.importData({ __text: "}{ not json" });
  await h.getReaderPromise();
  await flush();
  assert.equal(h.getState().books.length, 1, "parse failure must not change state");
  assert.equal(h.els.toast.textContent, "文件解析失败，请选择有效的备份 JSON");
});

// --- OPT-043: decrease guard ---

test("OPT-043: importing fewer books than current prompts a high-danger confirm", async () => {
  const h = createHarness();
  // Current account has 3 books and 5 quotes; backup only has 1 book and 5 quotes.
  h.setState({ ...emptyState(), books: [{ id: "b1" }, { id: "b2" }, { id: "b3" }], quotes: [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }, { id: "q5" }] });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  const backup = { books: [{ id: "b1" }], sessions: [], quotes: [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }, { id: "q5" }] };
  h.importData({ __text: JSON.stringify(backup) });
  await h.getReaderPromise();
  await flush();
  assert.equal(h.els.confirmDialog.open, true, "must prompt when any category shrinks");
  assert.match(h.els.confirmDialogMessage.textContent, /书籍/, "message must mention the shrinking category");
  assert.match(h.els.confirmDialogMessage.textContent, /2 条/, "message must state the count lost");
  assert.equal(h.getState().books.length, 3, "account untouched until confirmed");
});

test("OPT-043: cancelling the decrease-guard prompt leaves state untouched", async () => {
  const h = createHarness();
  h.setState({ ...emptyState(), books: [{ id: "b1" }, { id: "b2" }] });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  const backup = { books: [{ id: "b1" }], sessions: [], quotes: [] };
  h.importData({ __text: JSON.stringify(backup) });
  await h.getReaderPromise();
  await flush();
  assert.equal(h.els.confirmDialog.open, true);
  // Cancel: do NOT click confirmBtn — only cancel
  h.els.confirmDialogCancelBtn._click();
  await flush();
  assert.equal(h.getState().books.length, 2, "cancel must leave state unchanged");
  assert.equal(h.els.importResultDialog.open, false, "result dialog must not appear on cancel");
});

test("OPT-043: confirming the decrease-guard prompt applies the import", async () => {
  const h = createHarness();
  h.setState({ ...emptyState(), books: [{ id: "b1" }, { id: "b2" }], quotes: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  const backup = { books: [{ id: "b1" }], sessions: [], quotes: [] };
  h.importData({ __text: JSON.stringify(backup) });
  await h.getReaderPromise();
  await flush();
  assert.equal(h.els.confirmDialog.open, true);
  h.els.confirmDialogConfirmBtn._click();
  await flush();
  await flush();
  assert.equal(h.getState().books.length, 1, "after confirm the backup is applied");
  assert.equal(h.getState().quotes.length, 0);
  assert.equal(h.els.importResultDialog.open, true, "result dialog shown after confirmed import");
});

test("OPT-043: importing same or more items in all categories skips the guard", async () => {
  const h = createHarness();
  h.setState({ ...emptyState(), books: [{ id: "b1" }], quotes: [{ id: "q1" }] });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  const backup = { books: [{ id: "b1" }, { id: "b2" }], sessions: [], quotes: [{ id: "q1" }, { id: "q2" }] };
  h.importData({ __text: JSON.stringify(backup) });
  await h.getReaderPromise();
  await flush();
  assert.equal(h.els.confirmDialog.open, false, "no prompt when all categories are same or larger");
  assert.equal(h.getState().books.length, 2, "import applied directly");
});
