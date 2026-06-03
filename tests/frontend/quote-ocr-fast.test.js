// OPT-016: runOcrFromImage(engine) — fast path sends engine:"fast" and fills the
// content textarea synchronously from the 200 response (no polling); ai path
// sends engine:"ai" and leaves the field for the async/poll flow.
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
    hidden: false, dataset: {}, children: [], files: [],
    style: { display: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return elStub("button"); },
    querySelectorAll() { return []; },
    showModal() {}, close() {}, reset() {}, setAttribute() {}, closest() { return null; },
  };
}

function createHarness() {
  const elements = new Map();
  function getElement(sel) {
    if (!elements.has(sel)) elements.set(sel, elStub());
    return elements.get(sel);
  }
  const document = {
    querySelector: getElement,
    querySelectorAll: () => [],
    createElement: (t) => elStub(t),
    getElementById: (id) => getElement(`#${id}`),
    body: elStub(),
    addEventListener() {},
  };
  const requests = [];
  const responseQueue = [];
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => "", setItem() {}, removeItem() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const next = responseQueue.shift() || { status: 200, body: {} };
      return {
        ok: next.status < 400,
        status: next.status,
        headers: { get: () => "application/json" },
        json: async () => next.body,
      };
    },
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  els, runOcrFromImage,
  enqueueResponse(r) { globalThis.__rq.push(r); },
  getRequests() { return globalThis.__reqs; },
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingImage(v) { pendingQuoteImage = v; },
};
`;
  context.__rq = responseQueue;
  context.__reqs = requests;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__testHooks;
}

function setupForm(hooks) {
  const fields = {
    '[name="bookId"]': { value: "book-1" },
    '[name="id"]': { value: "" },
    '[name="page"]': { value: "1" },
    '[name="kind"]': { value: "quote" },
    '[name="reflection"]': { value: "" },
    '[name="tags"]': { value: "" },
  };
  hooks.els.quoteForm.querySelector = (sel) => fields[sel] || { value: "" };
  hooks.els.quoteForm.dataset = {};
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [], sessions: [], quotes: [], chatHistories: {} });
  hooks.setPendingImage({ name: "p.jpg", dataUrl: "data:image/png;base64,aGVsbG8=", objectUrl: "", ocrSource: "" });
}

test("fast path: sends engine=fast and fills content synchronously from 200", async () => {
  const hooks = createHarness();
  setupForm(hooks);
  hooks.els.quoteContent.value = "";
  hooks.enqueueResponse({
    status: 200,
    body: {
      status: "done",
      quoteId: "q1",
      recognizedText: "识别出的正文",
      ocrSource: "本地 OCR (Tesseract)",
      state: { books: [], sessions: [], quotes: [{ id: "q1", bookId: "book-1", content: "识别出的正文" }], chatHistories: {} },
    },
  });
  // loadRemoteLogs() second fetch
  hooks.enqueueResponse({ status: 200, body: { logs: [] } });

  await hooks.runOcrFromImage("fast");

  const ocrReq = hooks.getRequests().find((r) => String(r.url).includes("/api/quotes/ocr"));
  assert.ok(ocrReq, "OCR request was made");
  const sentBody = JSON.parse(ocrReq.options.body);
  assert.equal(sentBody.engine, "fast");
  assert.equal(hooks.els.quoteContent.value, "识别出的正文", "content filled synchronously");
});

test("ai path: sends engine=ai and does not auto-fill content", async () => {
  const hooks = createHarness();
  setupForm(hooks);
  hooks.els.quoteContent.value = "";
  hooks.enqueueResponse({
    status: 202,
    body: {
      status: "pending",
      quoteId: "q2",
      state: { books: [], sessions: [], quotes: [{ id: "q2", bookId: "book-1", content: "" }], chatHistories: {} },
    },
  });
  hooks.enqueueResponse({ status: 200, body: { logs: [] } });

  await hooks.runOcrFromImage("ai");

  const ocrReq = hooks.getRequests().find((r) => String(r.url).includes("/api/quotes/ocr"));
  assert.ok(ocrReq, "OCR request was made");
  assert.equal(JSON.parse(ocrReq.options.body).engine, "ai");
  assert.equal(hooks.els.quoteContent.value, "", "ai path leaves content for async fill");
});
