// OPT-029 Layer B / E35: syncState() must echo the loaded state version on PUT
// and, on a 409 conflict, adopt the server's state instead of clobbering it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(), className: "", textContent: "", style: { display: "" },
    dataset: {}, value: "", disabled: false, children: [], files: [], hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    setAttribute() {}, removeAttribute() {}, focus() {}, closest() { return null; },
    showModal() {}, close() {},
  };
}

function createHarness(fetchImpl) {
  const elements = new Map();
  const getElement = (sel) => {
    if (!elements.has(sel)) elements.set(sel, createElementStub());
    return elements.get(sel);
  };
  const document = {
    querySelector: getElement,
    querySelectorAll: () => [],
    createElement: (t) => createElementStub(t),
    getElementById: (id) => getElement(`#${id}`),
    body: createElementStub("body"),
  };
  const toasts = [];
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn && fn(); }, confirm() { return true; },
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => "", setItem() {}, removeItem() {} },
    fetch: (...args) => fetchImpl(...args),
    CustomEvent: function (t) { this.type = t; },
    FormData: function () {}, structuredClone, Date, Math, JSON, Array, Object,
    String, Number, Boolean, RegExp, setTimeout, clearTimeout,
    __captureToast: (msg) => toasts.push(msg),
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  syncState,
  getState: () => state,
  setState: (v) => { state = v; },
  setCurrentUser: (v) => { currentUser = v; },
  setAuthToken: (v) => { authToken = v; },
  getStateVersion: () => stateVersion,
  setStateVersion: (v) => { stateVersion = v; },
  toasts: __testToasts,
};
`;
  // Route showToast output into our capture array by shadowing it after load.
  const withToastSpy = instrumented.replace(
    "globalThis.__testHooks = {",
    "const __testToasts = [];\nshowToast = function (m) { __testToasts.push(m); };\nglobalThis.__testHooks = {"
  );
  vm.runInNewContext(withToastSpy, context, { filename: "app.js" });
  return context.__testHooks;
}

test("syncState sends X-State-Version and stores the new version on success", async () => {
  const calls = [];
  const hooks = createHarness(async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ state: { books: [], sessions: [], quotes: [], chatHistories: {} }, stateVersion: "v-new" }),
    };
  });
  hooks.setCurrentUser({ id: "u1" });
  hooks.setAuthToken("tok");
  hooks.setStateVersion("v-old");
  hooks.setState({ books: [], sessions: [], quotes: [], chatHistories: {} });

  await hooks.syncState();

  const put = calls.find((c) => c.opts && c.opts.method === "PUT");
  assert.ok(put, "a PUT was issued");
  assert.equal(put.opts.headers["X-State-Version"], "v-old", "echoes the loaded version");
  assert.equal(hooks.getStateVersion(), "v-new", "stores the version from the response");
});

test("syncState on 409 adopts server state and surfaces a toast (no silent clobber)", async () => {
  const hooks = createHarness(async () => ({
    ok: false,
    status: 409,
    headers: { get: () => "application/json" },
    json: async () => ({
      error: "state_conflict",
      message: "数据已在其他设备更新，已为你加载最新版本。",
      state: { books: [{ id: "server-book", title: "Server" }], sessions: [], quotes: [], chatHistories: {} },
      stateVersion: "v-server",
    }),
  }));
  hooks.setCurrentUser({ id: "u1" });
  hooks.setAuthToken("tok");
  hooks.setStateVersion("v-stale");
  // Local edit that would have clobbered the server if last-write-wins.
  hooks.setState({ books: [{ id: "local-book", title: "Local" }], sessions: [], quotes: [], chatHistories: {} });

  await hooks.syncState();

  const books = hooks.getState().books;
  assert.equal(books.length, 1);
  assert.equal(books[0].id, "server-book", "server state adopted, local clobber prevented");
  assert.equal(hooks.getStateVersion(), "v-server", "version updated to server's");
  assert.ok(hooks.toasts.some((t) => t.includes("其他设备")), "conflict surfaced to user");
});

test("syncState rethrows non-conflict errors", async () => {
  const hooks = createHarness(async () => ({
    ok: false,
    status: 500,
    headers: { get: () => "application/json" },
    json: async () => ({ error: "boom" }),
  }));
  hooks.setCurrentUser({ id: "u1" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [], sessions: [], quotes: [], chatHistories: {} });
  await assert.rejects(() => hooks.syncState(), /boom|HTTP 500/);
});
