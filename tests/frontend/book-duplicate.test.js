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
    querySelectorAll: (sel) => (sel === "dialog[open]" ? context.__openDialogs || [] : []),
    createElement: (t) => elStub(t),
    getElementById: (id) => getElement(`#${id}`),
    body: elStub(),
    addEventListener() {},
  };
  const requests = [];
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
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ state: context.__state || {} }),
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
  els, addBook,
  getState() { return state; },
  getRequests() { return globalThis.__reqs; },
  setState(v) { state = v; globalThis.__state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setOpenDialogs(list) { globalThis.__openDialogs = list; },
};
`;
  context.__reqs = requests;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__testHooks;
}

test("addBook skips duplicate when OCR author only differs by nationality marker", async () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  hooks.setState({
    books: [{ id: "book-1", title: "悉达多", author: "黑塞" }],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  const form = new FormData();
  form.set("title", "《悉达多》");
  form.set("author", "[德] 黑塞");
  form.set("status", "wishlist");

  await hooks.addBook(form);

  assert.equal(hooks.getState().books.length, 1);
  assert.equal(hooks.els.toast.textContent, "书单里已存在这本书");
  assert.equal(hooks.getRequests().length, 0, "duplicate save should not sync state");
});

test("addBook keeps translated names whose first token matches a nationality abbrev (丹·布朗)", async () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  // Same title, but "布朗" and "丹·布朗" are genuinely different authors.
  // "丹·布朗" must NOT be reduced to "布朗" by treating "丹" as a nationality marker.
  hooks.setState({
    books: [{ id: "book-1", title: "达芬奇密码", author: "布朗" }],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  const form = new FormData();
  form.set("title", "达芬奇密码");
  form.set("author", "[美] 丹·布朗");
  form.set("status", "wishlist");

  await hooks.addBook(form);

  assert.equal(hooks.getState().books.length, 2, "丹·布朗 must not collapse to 布朗");
  assert.equal(hooks.getState().books[0].author, "[美] 丹·布朗");
});

test("addBook treats a title-only entry as duplicate of an existing titled book", async () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  hooks.setState({
    books: [{ id: "book-1", title: "悉达多", author: "黑塞" }],
    sessions: [], quotes: [], chatHistories: {},
  });

  const form = new FormData();
  form.set("title", "悉达多");
  form.set("author", ""); // user only filled the title
  form.set("status", "wishlist");

  await hooks.addBook(form);

  assert.equal(hooks.getState().books.length, 1, "title-only entry should match existing titled book");
  assert.equal(hooks.els.toast.textContent, "书单里已存在这本书");
  assert.equal(hooks.getRequests().length, 0);
});

test("duplicate toast is hosted inside the open dialog so it shows above the top layer", async () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  hooks.setState({
    books: [{ id: "book-1", title: "悉达多", author: "黑塞" }],
    sessions: [], quotes: [], chatHistories: {},
  });

  // Simulate the add-book modal being open (top layer).
  const openDialog = elStub("dialog");
  hooks.setOpenDialogs([openDialog]);

  const form = new FormData();
  form.set("title", "悉达多");
  form.set("author", "[德] 黑塞");
  form.set("status", "wishlist");

  await hooks.addBook(form);

  // A body-level toast would be painted behind the modal; it must be moved
  // into the open dialog so the feedback is visible without closing the card.
  assert.equal(hooks.els.toast.textContent, "书单里已存在这本书");
  assert.ok(openDialog.children.includes(hooks.els.toast), "toast should be appended into the open dialog");
});
