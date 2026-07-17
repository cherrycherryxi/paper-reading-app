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
  els, addBook, bookAuthorTokens, normalizeBookAuthorForMatch,
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

test("addBook keeps the given name in translated names whose first token matches a nationality abbrev (丹·布朗)", async () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1", username: "tester" });
  hooks.setAuthToken("tok");
  // The guard here is the nationality stripper: "丹" is also the abbreviation for
  // 丹麦, so it must not be eaten off the front of 丹·布朗 — the name must stay two
  // parts (丹 + 布朗), not collapse to the surname alone.
  //
  // 2026-07-17: this test used to assert that 布朗 and 丹·布朗 are therefore two
  // distinct books. That was a side effect of the guard, not a deliberate call,
  // and it is wrong on its face — 达芬奇密码 has one author. Owner decided an
  // abbreviated author names the same person (OPT-118: a shelf photo said
  // 「[英] 哈耶克」while the library held 「弗里德里希·奥古斯特·冯·哈耶克」and a
  // duplicate was created). So the merge below is the wanted behaviour; what we
  // still assert is that 丹 survives normalization.
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

  assert.equal(hooks.getState().books.length, 1, "abbreviated author names the same person");
  // .join(): the array comes from the vm realm, so deepEqual would fail on
  // realm identity even when the contents match.
  assert.equal(
    hooks.bookAuthorTokens("[美] 丹·布朗").join("|"),
    "丹|布朗",
    "丹 must survive: it is a given name here, not the 丹麦 nationality marker"
  );
  // The real regression guard, unchanged: 丹·布朗 must not normalize to 布朗.
  assert.notEqual(
    hooks.normalizeBookAuthorForMatch("[美] 丹·布朗"),
    hooks.normalizeBookAuthorForMatch("布朗"),
  );
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
