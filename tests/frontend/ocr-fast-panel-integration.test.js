// Integration test for the FAST OCR path (runOcrFromImage("fast")):
// after a successful 快速识别 returning multi-line text, the line panel must be
// visible and the content textarea reflowed to a continuous paragraph.
// This guards the actual end-to-end wiring (not just renderOcrLineSelector alone).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

const RECOGNIZED = "第一行内容\n第二行内容\n第三行内容\n第四行内容";

function fieldStub(value = "") {
  return { value, dataset: {} };
}

// #ocrLineSelector stub: tracks hidden + extracts input rows from innerHTML.
function createOcrSelectorStub() {
  const state = { hidden: true, onclick: null, oninput: null };
  let html = "";
  const rows = [];
  return {
    get hidden() { return state.hidden; },
    set hidden(v) { state.hidden = v; },
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = String(v);
      rows.length = 0;
      const re = /class="ocr-line-selector__input"[^>]*>(.*?)<\/textarea>/g;
      let m;
      while ((m = re.exec(v)) !== null) rows.push({ value: m[1] });
    },
    get onclick() { return state.onclick; },
    set onclick(v) { state.onclick = v; },
    get oninput() { return state.oninput; },
    set oninput(v) { state.oninput = v; },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel === ".ocr-line-selector__input") return rows.map((r) => ({ value: r.value, style: {}, scrollHeight: 24 }));
      if (sel === ".ocr-line-selector__row") return rows.map(() => ({}));
      return [];
    },
    _rows: rows,
  };
}

function createHarness() {
  const ocrSel = createOcrSelectorStub();
  const quoteContent = fieldStub("");
  const ocrStatus = { textContent: "" };
  const ocrButton = { disabled: false };
  const aiOcrButton = { disabled: false };

  // quoteForm: querySelector returns named field stubs; dataset is a plain object.
  const formFields = {
    '[name="bookId"]': fieldStub("b1"),
    '[name="id"]': fieldStub(""),
    '[name="page"]': fieldStub("12"),
    '[name="kind"]': fieldStub("quote"),
    '[name="reflection"]': fieldStub(""),
    '[name="tags"]': fieldStub(""),
  };
  const quoteForm = {
    dataset: {},
    querySelector: (sel) => formFields[sel] || fieldStub(""),
  };

  const elsOverrides = { ocrLineSelector: ocrSel, quoteContent, ocrStatus, ocrButton, aiOcrButton, quoteForm };

  const document = {
    querySelector: () => ({ value: "", dataset: {}, classList: { add() {}, remove() {} }, querySelector: () => null }),
    querySelectorAll: () => [],
    createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => "data:image/jpeg;base64,x" }),
    getElementById: () => ({ value: "" }),
    body: {},
    addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };

  const fetchCalls = [];
  const context = {
    console, document, window,
    localStorage: { getItem: () => "tok", setItem() {}, removeItem() {} },
    fetch: async (url, opts) => {
      fetchCalls.push(String(url));
      if (String(url).includes("/api/quotes/ocr")) {
        return {
          ok: true, status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            state: { books: [{ id: "b1", title: "B" }], sessions: [], quotes: [{ id: "q1", bookId: "b1", content: RECOGNIZED, imageUrl: "/media/u1/x.jpg", ocrStatus: "done" }], chatHistories: {}, connections: [] },
            stateVersion: "v1",
            quoteId: "q1",
            status: "done",
            recognizedText: RECOGNIZED,
            ocrSource: "云 OCR (百度)",
          }),
        };
      }
      // logs / other
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ logs: [] }) };
    },
    CustomEvent: function(t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
// Neutralise heavy renderers so the test isolates runOcrFromImage + renderOcrLineSelector.
renderHero = () => {};
renderSummary = () => {};
renderQuotes = () => {};
renderConnections = () => {};
renderBooks = () => {};
renderImagePreview = () => {};
renderModelLogs = () => {};
loadRemoteLogs = async () => {};
scheduleOcrStatusRefresh = () => {};
showToast = () => {};
isTabActive = () => false;
Object.assign(els, ${JSON.stringify({})});
globalThis.__hooks = {
  els,
  runOcrFromImage,
  setState(v) { state = v; },
  getState() { return state; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingImage(v) { pendingQuoteImage = v; },
  getProvisional() { return ocrProvisionalQuoteId; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  Object.assign(hooks.els, elsOverrides);
  hooks.setCurrentUser({ id: "u1", username: "t" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [{ id: "b1", title: "B" }], sessions: [], quotes: [], chatHistories: {}, connections: [] });
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/jpeg;base64,x", ocrSource: "" });
  return { hooks, ocrSel, quoteContent, fetchCalls };
}

test("fast OCR shows the line panel and reflows content to a continuous paragraph", async () => {
  const { hooks, ocrSel, quoteContent } = createHarness();
  await hooks.runOcrFromImage("fast");

  assert.equal(ocrSel.hidden, false, "panel must be VISIBLE after 快速识别 (regression: it disappeared)");
  assert.equal(ocrSel._rows.length, 4, "one editable row per recognized line");
  assert.equal(quoteContent.value, "第一行内容第二行内容第三行内容第四行内容", "content reflowed continuous, no newlines");
  assert.ok(!quoteContent.value.includes("\n"), "no physical line breaks");
});

test("fast OCR on a NEW card marks the quote provisional (for cancel-cleanup)", async () => {
  const { hooks } = createHarness();
  await hooks.runOcrFromImage("fast");
  assert.equal(hooks.getProvisional(), "q1", "new OCR card tracked so cancel can discard it");
});
