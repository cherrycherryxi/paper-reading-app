// OPT-002: runBookOcr() POSTs the pending cover image to /api/books/ocr and
// fills the bookForm title/author/tags inputs from the response — but only when
// each input is empty (never overwrites what the user already typed).
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
  els, runBookOcr,
  enqueueResponse(r) { globalThis.__rq.push(r); },
  getRequests() { return globalThis.__reqs; },
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingBookImage(v) { pendingBookImage = v; },
};
`;
  context.__rq = responseQueue;
  context.__reqs = requests;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__testHooks;
}

function setupForm(hooks, initial = {}) {
  const fields = {
    '[name="title"]': { value: initial.title || "" },
    '[name="author"]': { value: initial.author || "" },
    '[name="tags"]': { value: initial.tags || "" },
  };
  hooks.els.bookForm.querySelector = (sel) => fields[sel] || { value: "" };
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [], sessions: [], quotes: [], chatHistories: {} });
  hooks.setPendingBookImage({ name: "cover.jpg", dataUrl: "data:image/png;base64,aGVsbG8=", objectUrl: "", compressionPromise: null });
  return fields;
}

test("fills title/author/tags from /api/books/ocr response when inputs empty", async () => {
  const hooks = createHarness();
  const fields = setupForm(hooks);
  hooks.enqueueResponse({
    status: 200,
    body: { title: "悉达多", author: "黑塞", tags: ["成长", "哲学"] },
  });

  await hooks.runBookOcr();

  const req = hooks.getRequests().find((r) => String(r.url).includes("/api/books/ocr"));
  assert.ok(req, "book OCR request was made");
  const sent = JSON.parse(req.options.body);
  assert.equal(sent.imageDataUrl, "data:image/png;base64,aGVsbG8=");
  assert.equal(fields['[name="title"]'].value, "悉达多");
  assert.equal(fields['[name="author"]'].value, "黑塞");
  assert.equal(fields['[name="tags"]'].value, "成长, 哲学");
});

test("does not overwrite fields the user already filled", async () => {
  const hooks = createHarness();
  const fields = setupForm(hooks, { title: "我的书名", tags: "我的标签" });
  hooks.enqueueResponse({
    status: 200,
    body: { title: "悉达多", author: "黑塞", tags: ["成长"] },
  });

  await hooks.runBookOcr();

  // pre-filled title/tags preserved; empty author gets filled
  assert.equal(fields['[name="title"]'].value, "我的书名");
  assert.equal(fields['[name="tags"]'].value, "我的标签");
  assert.equal(fields['[name="author"]'].value, "黑塞");
});

test("no image: shows toast and makes no request", async () => {
  const hooks = createHarness();
  setupForm(hooks);
  hooks.setPendingBookImage(null);

  await hooks.runBookOcr();

  const req = hooks.getRequests().find((r) => String(r.url).includes("/api/books/ocr"));
  assert.equal(req, undefined, "no OCR request when there is no image");
});
