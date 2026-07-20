// OPT-109: cross-page OCR — when two images are loaded, fast OCR runs serially on
// both and concatenates the recognised text with a blank line separator.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

const TEXT1 = "第一页内容，这是划线句子。";
const TEXT2 = "第二页内容，也是划线句子。";

function fieldStub(value = "") {
  return { value, dataset: {} };
}

function createOcrSelectorStub() {
  const state = { hidden: true, oninput: null, onclick: null };
  let html = "";
  return {
    get hidden() { return state.hidden; },
    set hidden(v) { state.hidden = v; },
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); },
    get oninput() { return state.oninput; },
    set oninput(v) { state.oninput = v; },
    get onclick() { return state.onclick; },
    set onclick(v) { state.onclick = v; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function createHarness(opts = {}) {
  const { secondImageDataUrl = "data:image/jpeg;base64,img2", fetchReturnsText2 = true, firstResponseStatus = "done" } = opts;

  const ocrSel = createOcrSelectorStub();
  const quoteContent = fieldStub("");
  const ocrStatus = { textContent: "" };
  const ocrButton = { disabled: false };
  const aiOcrButton = { disabled: false };

  const formFields = {
    '[name="bookId"]': fieldStub("b1"),
    '[name="id"]': fieldStub("q1"),
    '[name="page"]': fieldStub("10"),
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
  // First call returns TEXT1, subsequent calls return TEXT2.
  let callIndex = 0;
  const context = {
    console, document, window,
    localStorage: { getItem: () => "tok", setItem() {}, removeItem() {} },
    fetch: async (url, opts2) => {
      fetchCalls.push(String(url));
      if (String(url).includes("/api/quotes/ocr")) {
        const isFirstCall = callIndex === 0;
        const recognizedText = isFirstCall ? TEXT1 : (fetchReturnsText2 ? TEXT2 : "");
        const responseStatus = isFirstCall ? firstResponseStatus : "done";
        callIndex++;
        return {
          ok: true, status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            state: {
              books: [{ id: "b1", title: "B" }], sessions: [],
              quotes: [{ id: "q1", bookId: "b1", content: recognizedText, imageUrl: "/media/u/x.jpg", ocrStatus: responseStatus }],
              chatHistories: {}, connections: [],
            },
            stateVersion: "v1",
            quoteId: "q1",
            status: responseStatus,
            recognizedText: responseStatus === "pending" ? "" : recognizedText,
          }),
        };
      }
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ logs: [] }) };
    },
    CustomEvent: function(t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
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
globalThis.__hooks = {
  els,
  runOcrFromImage,
  setState(v) { state = v; },
  getState() { return state; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingImage(v) { pendingQuoteImage = v; },
  setPendingImage2(v) { pendingQuoteImage2 = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  Object.assign(hooks.els, elsOverrides);
  hooks.setCurrentUser({ id: "u1", username: "t" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [{ id: "b1", title: "B" }], sessions: [], quotes: [], chatHistories: {}, connections: [] });
  hooks.setPendingImage({ name: "p1.jpg", dataUrl: "data:image/jpeg;base64,img1", ocrSource: "" });
  if (secondImageDataUrl) {
    hooks.setPendingImage2({ name: "p2.jpg", dataUrl: secondImageDataUrl, ocrSource: "" });
  }
  return { hooks, ocrSel, quoteContent, ocrStatus, fetchCalls };
}

test("two images: fast OCR calls API twice and concatenates text with blank line", async () => {
  const { hooks, quoteContent, fetchCalls } = createHarness();
  await hooks.runOcrFromImage("fast");

  const ocrCalls = fetchCalls.filter((u) => u.includes("/api/quotes/ocr"));
  assert.equal(ocrCalls.length, 2, "must call OCR API twice — once per image");
  assert.equal(quoteContent.value, `${TEXT1}\n\n${TEXT2}`, "textarea must contain page1 + blank line + page2");
});

test("two images: status text reflects two-page completion", async () => {
  const { hooks, ocrStatus } = createHarness();
  await hooks.runOcrFromImage("fast");
  assert.ok(ocrStatus.textContent.includes("两页"), "status text must mention 两页 when second page succeeds");
});

test("single image: fast OCR calls API once, no concatenation", async () => {
  const { hooks, quoteContent, fetchCalls } = createHarness({ secondImageDataUrl: null });
  await hooks.runOcrFromImage("fast");

  const ocrCalls = fetchCalls.filter((u) => u.includes("/api/quotes/ocr"));
  assert.equal(ocrCalls.length, 1, "must call OCR API exactly once when only one image is loaded");
  assert.equal(quoteContent.value, TEXT1, "textarea contains only first-image text");
});

test("two images: second page returns no text — only first page text kept", async () => {
  const { hooks, quoteContent } = createHarness({ fetchReturnsText2: false });
  await hooks.runOcrFromImage("fast");
  assert.equal(quoteContent.value, TEXT1, "textarea keeps first page text when second page OCR returns nothing");
});

test("AI path ignores second image (second API call not made)", async () => {
  // AI path returns status "pending" — the second-page branch is in the fast-path
  // else block, so a "pending" response skips it entirely.
  const { hooks, fetchCalls } = createHarness({ firstResponseStatus: "pending" });
  await hooks.runOcrFromImage("ai");

  const ocrCalls = fetchCalls.filter((u) => u.includes("/api/quotes/ocr"));
  assert.equal(ocrCalls.length, 1, "AI path must not trigger second-page OCR (async path, out of Phase 1 scope)");
});
