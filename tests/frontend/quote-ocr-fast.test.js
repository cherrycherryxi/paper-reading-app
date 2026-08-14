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
  els, runOcrFromImage, quoteImageDataUrl, quoteImagePreviewSources, canCropQuoteImage, uploadQuoteImage, quoteCropFromRenderedRects, resizeQuoteCropFromTopLeft,
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

test("cropped image is preferred for OCR over the full-page data URL", async () => {
  const hooks = createHarness();
  setupForm(hooks);
  hooks.setPendingImage({
    name: "p.jpg",
    dataUrl: "data:image/jpeg;base64,ZnVsbA==",
    cropDataUrl: "data:image/jpeg;base64,Y3JvcA==",
    objectUrl: "blob:full",
    ocrSource: "",
  });
  hooks.enqueueResponse({
    status: 200,
    body: { status: "done", quoteId: "q1", recognizedText: "裁剪识别", state: { books: [], sessions: [], quotes: [{ id: "q1", bookId: "book-1", content: "裁剪识别" }], chatHistories: {} } },
  });
  hooks.enqueueResponse({ status: 200, body: { logs: [] } });

  await hooks.runOcrFromImage("fast");

  const ocrReq = hooks.getRequests().find((r) => String(r.url).includes("/api/quotes/ocr"));
  assert.equal(JSON.parse(ocrReq.options.body).imageDataUrl, "data:image/jpeg;base64,Y3JvcA==");
  assert.equal(hooks.quoteImageDataUrl({ dataUrl: "full", cropDataUrl: "crop" }), "crop");
});

test("cropped image is also preferred when saving the quote image", async () => {
  const hooks = createHarness();
  hooks.enqueueResponse({ status: 200, body: { url: "/uploads/cropped.jpg" } });

  const savedUrl = await hooks.uploadQuoteImage({
    name: "p.jpg",
    dataUrl: "data:image/jpeg;base64,ZnVsbA==",
    cropDataUrl: "data:image/jpeg;base64,Y3JvcA==",
  });

  assert.equal(savedUrl, "/uploads/cropped.jpg");
  const uploadReq = hooks.getRequests().find((r) => String(r.url).includes("/api/upload-image"));
  assert.equal(JSON.parse(uploadReq.options.body).dataUrl, "data:image/jpeg;base64,Y3JvcA==");
});

test("saved quote images remain previewable and crop-enabled after OCR", () => {
  const hooks = createHarness();
  const image = { savedUrl: "/media/u/saved.jpeg", objectUrl: "blob:stale" };
  assert.equal(hooks.canCropQuoteImage(image), true);
  assert.deepEqual(
    [...hooks.quoteImagePreviewSources(image)],
    ["/media/u/saved.jpeg", "blob:stale"]
  );
});

test("crop uses the rendered image bounds rather than its containing dialog", () => {
  const hooks = createHarness();
  const crop = hooks.quoteCropFromRenderedRects(
    { left: 130, top: 280, width: 360, height: 240 },
    { left: 100, top: 200, width: 600, height: 800 },
    { x: 0, y: 0, width: 1, height: 1 }
  );
  assert.equal(crop.x, 0.05);
  assert.equal(crop.y, 0.1);
  assert.equal(crop.width, 0.6);
  assert.equal(crop.height, 0.3);
});

test("top-left crop handle keeps the opposite corner fixed and enforces the minimum size", () => {
  const hooks = createHarness();
  const resized = hooks.resizeQuoteCropFromTopLeft(
    { x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
    0.15,
    -0.1
  );
  assert.equal(Number(resized.x.toFixed(6)), 0.35);
  assert.equal(Number(resized.y.toFixed(6)), 0.2);
  assert.equal(Number(resized.width.toFixed(6)), 0.35);
  assert.equal(Number(resized.height.toFixed(6)), 0.5);

  const minSize = hooks.resizeQuoteCropFromTopLeft(
    { x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
    1,
    1
  );
  assert.equal(Number(minSize.width.toFixed(6)), 0.1);
  assert.equal(Number(minSize.height.toFixed(6)), 0.1);
  assert.equal(Number((minSize.x + minSize.width).toFixed(6)), 0.7);
  assert.equal(Number((minSize.y + minSize.height).toFixed(6)), 0.7);
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
