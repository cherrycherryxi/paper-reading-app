// OPT-045: regression coverage for the 关联 (Connection) Tab — the app's
// differentiating feature, which had no dedicated frontend test despite OPT-027
// refactoring its card surface. Executes the REAL app.js via vm.runInNewContext
// and asserts renderConnections / addConnection / deleteConnection behaviour.
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
    className: "", textContent: "", value: "", open: false, hidden: false,
    style: {}, dataset: {}, parentNode: null, children: [], files: [], _listeners: {},
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
    reset() {}, setAttribute() {}, closest() { return null; },
    _click() { const l = this._listeners.click || []; if (l.length) l[l.length - 1](); },
  };
}

function createHarness(fetchImpl) {
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };
  const document = {
    body: createElementStub("body"),
    querySelector(s) { return getElement(s); },
    querySelectorAll() { return []; },
    createElement(t) { return createElementStub(t); },
    getElementById(id) { return getElement(`#${id}`); },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const fetchCalls = [];
  const toasts = [];
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (fetchImpl) return fetchImpl(url, options);
      let body = {};
      try { body = JSON.parse(options.body); } catch (_) {}
      return {
        ok: true, status: 200,
        headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
        json: async () => ({ state: body, stateVersion: "v-test" }),
      };
    },
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
showToast = function (message) { __captureToast(message); };
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  addConnection, deleteConnection, renderConnections, els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
  setKindFilter(v) { selectedConnectionKindFilter = v; },
  getState() { return state; },
  toasts: __toasts,
};
`;
  context.__captureToast = (message) => toasts.push(message);
  context.__toasts = toasts;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.fetchCalls = fetchCalls;
  return hooks;
}

const emptyState = () => ({ books: [], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });
const form = (entries) => ({ get(k) { return entries[k] !== undefined ? entries[k] : ""; } });
// Each card root is `<div class="connection-card" ...>`; the closing quote
// avoids matching "connection-card-header". (data-conn-id appears 3×/card.)
const countCards = (html) => (html.match(/class="connection-card"/g) || []).length;

function loggedIn(h, state) {
  h.setState(state);
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
}

const twoBooks = () => [{ id: "b1", title: "三体" }, { id: "b2", title: "活着" }];

// --- addConnection ---

test("OPT-045: addConnection creates a book↔book link and persists it", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: twoBooks() });
  await h.addConnection(form({
    sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2",
    kind: "对比", thought: "两种面对苦难的方式", tags: "苦难,对比",
  }));
  await flush();
  const conns = h.getState().connections;
  assert.equal(conns.length, 1, "connection must be saved");
  assert.equal(conns[0].sourceId, "b1");
  assert.equal(conns[0].targetId, "b2");
  assert.deepEqual(conns[0].tags, ["苦难", "对比"], "tags split on comma");
  assert.ok(h.fetchCalls.some((c) => c.url.includes("/api/state")), "must persist via syncState");
});

test("OPT-045: addConnection requires a thought", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: twoBooks() });
  await h.addConnection(form({ sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "" }));
  await flush();
  assert.equal(h.getState().connections.length, 0, "no thought → no connection");
});

test("OPT-045: addConnection rejects a self-link (same source and target)", async () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: twoBooks() });
  await h.addConnection(form({ sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b1", kind: "对比", thought: "x" }));
  await flush();
  assert.equal(h.getState().connections.length, 0, "self-link must be rejected");
});

test("OPT-045: addConnection with an id edits the existing link in place", async () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(), books: twoBooks(),
    connections: [{ id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "延伸", thought: "旧", tags: [] }],
  });
  await h.addConnection(form({ id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "新想法", tags: "" }));
  await flush();
  const conns = h.getState().connections;
  assert.equal(conns.length, 1, "edit must not create a new connection");
  assert.equal(conns[0].thought, "新想法");
  assert.equal(conns[0].kind, "对比");
});

test("OPT-169: addConnection conflict keeps dialog open and does not report success", async () => {
  const serverState = { ...emptyState(), books: twoBooks() };
  const h = createHarness(async () => ({
    ok: false, status: 409,
    headers: { get: () => "application/json" },
    json: async () => ({ error: "state_conflict", state: structuredClone(serverState), stateVersion: "v-server" }),
  }));
  loggedIn(h, structuredClone(serverState));
  h.els.connectionDialog.open = true;

  await h.addConnection(form({
    sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2",
    kind: "对比", thought: "并发时不能假成功", tags: "",
  }));

  assert.equal(h.els.connectionDialog.open, true, "conflict must keep the form open for retry");
  assert.equal(h.getState().connections.length, 0, "server state remains authoritative");
  assert.ok(h.toasts.some((message) => message.includes("关联未保存")));
  assert.ok(!h.toasts.some((message) => message === "关联已保存"));
});

test("OPT-169: edit conflict keeps dialog open and does not report success", async () => {
  const original = { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "延伸", thought: "服务器版本", tags: [] };
  const serverState = { ...emptyState(), books: twoBooks(), connections: [original] };
  const h = createHarness(async () => ({
    ok: false, status: 409,
    headers: { get: () => "application/json" },
    json: async () => ({ error: "state_conflict", state: structuredClone(serverState), stateVersion: "v-server" }),
  }));
  loggedIn(h, structuredClone(serverState));
  h.els.connectionDialog.open = true;

  await h.addConnection(form({
    id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2",
    kind: "对比", thought: "本地修改", tags: "",
  }));

  assert.equal(h.els.connectionDialog.open, true, "conflict must keep edited form open for retry");
  assert.equal(h.getState().connections[0].thought, "服务器版本");
  assert.ok(h.toasts.some((message) => message.includes("关联未更新")));
  assert.ok(!h.toasts.some((message) => message === "关联已更新"));
});

test("OPT-170: ordinary add failure rolls back the optimistic connection", async () => {
  const h = createHarness(async () => { throw new Error("网络中断"); });
  loggedIn(h, { ...emptyState(), books: twoBooks() });
  h.els.connectionDialog.open = true;

  await h.addConnection(form({
    sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2",
    kind: "对比", thought: "不能延迟写入", tags: "",
  }));

  assert.equal(h.getState().connections.length, 0, "failed add must leave no local connection");
  assert.equal(h.els.connectionDialog.open, true, "form stays open for retry");
  assert.ok(h.toasts.length > 0, "ordinary failure must remain visible to the user");
  assert.ok(!h.toasts.includes("关联已保存"));
});

test("OPT-170: ordinary edit failure restores the previous connection", async () => {
  const original = { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "延伸", thought: "旧值", tags: [] };
  const h = createHarness(async () => { throw new Error("保存超时"); });
  loggedIn(h, { ...emptyState(), books: twoBooks(), connections: [original] });

  await h.addConnection(form({
    id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2",
    kind: "对比", thought: "未保存的新值", tags: "",
  }));

  assert.equal(h.getState().connections[0].thought, "旧值");
  assert.ok(h.toasts.length > 0, "ordinary failure must remain visible to the user");
  assert.ok(!h.toasts.includes("关联已更新"));
});

// --- deleteConnection ---

test("OPT-045: deleteConnection removes the link only after confirm", async () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(), books: twoBooks(),
    connections: [
      { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "a", tags: [] },
      { id: "c2", sourceType: "book", sourceId: "b2", targetType: "book", targetId: "b1", kind: "延伸", thought: "b", tags: [] },
    ],
  });
  await h.deleteConnection("c1");
  await flush();
  assert.equal(h.els.confirmDialog.open, true, "must prompt before deleting");
  assert.equal(h.getState().connections.length, 2, "nothing removed until confirmed");
  h.els.confirmDialogConfirmBtn._click();
  await flush();
  const conns = h.getState().connections;
  assert.equal(conns.length, 1);
  assert.equal(conns[0].id, "c2", "the other link survives");
});

test("OPT-169: deleteConnection conflict restores server state and does not report success", async () => {
  const connection = { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "保留", tags: [] };
  const serverState = { ...emptyState(), books: twoBooks(), connections: [connection] };
  const h = createHarness(async () => ({
    ok: false, status: 409,
    headers: { get: () => "application/json" },
    json: async () => ({ error: "state_conflict", state: structuredClone(serverState), stateVersion: "v-server" }),
  }));
  loggedIn(h, structuredClone(serverState));

  await h.deleteConnection("c1");
  h.els.confirmDialogConfirmBtn._click();
  await flush();

  assert.equal(h.getState().connections.length, 1, "server copy must remain visible after conflict");
  assert.ok(h.toasts.some((message) => message.includes("关联未删除")));
  assert.ok(!h.toasts.some((message) => message === "关联已删除"));
});

test("OPT-170: ordinary delete failure restores the removed connection", async () => {
  const connection = { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "保留", tags: [] };
  const h = createHarness(async () => { throw new Error("删除失败"); });
  loggedIn(h, { ...emptyState(), books: twoBooks(), connections: [connection] });

  await h.deleteConnection("c1");
  h.els.confirmDialogConfirmBtn._click();
  await flush();

  assert.equal(h.getState().connections.length, 1);
  assert.equal(h.getState().connections[0].id, "c1");
  assert.ok(h.toasts.length > 0, "ordinary failure must remain visible to the user");
  assert.ok(!h.toasts.includes("关联已删除"));
});

// --- renderConnections ---

test("OPT-045: renderConnections shows an empty state with no connections", () => {
  const h = createHarness();
  loggedIn(h, { ...emptyState(), books: twoBooks() });
  h.renderConnections();
  assert.match(h.els.connectionsList.className, /empty-state/);
  assert.match(h.els.connectionsList.innerHTML, /还没有记录思想碰撞/);
});

test("OPT-045: renderConnections renders one card per connection", () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(), books: twoBooks(),
    connections: [
      { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "想法一", tags: [] },
      { id: "c2", sourceType: "book", sourceId: "b2", targetType: "book", targetId: "b1", kind: "延伸", thought: "想法二", tags: [] },
    ],
  });
  h.renderConnections();
  assert.equal(h.els.connectionsList.className, "connections-list");
  assert.equal(countCards(h.els.connectionsList.innerHTML), 2);
});

test("OPT-045: renderConnections filters by search text", () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(), books: twoBooks(),
    connections: [
      { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "命运的重量", tags: [] },
      { id: "c2", sourceType: "book", sourceId: "b2", targetType: "book", targetId: "b1", kind: "延伸", thought: "无关内容", tags: [] },
    ],
  });
  h.els.connectionSearch.value = "命运";
  h.renderConnections();
  assert.equal(countCards(h.els.connectionsList.innerHTML), 1, "only the matching thought shows");
});

test("OPT-045: renderConnections filters by kind", () => {
  const h = createHarness();
  loggedIn(h, {
    ...emptyState(), books: twoBooks(),
    connections: [
      { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", kind: "对比", thought: "a", tags: [] },
      { id: "c2", sourceType: "book", sourceId: "b2", targetType: "book", targetId: "b1", kind: "延伸", thought: "b", tags: [] },
    ],
  });
  h.setKindFilter("对比");
  h.renderConnections();
  assert.equal(countCards(h.els.connectionsList.innerHTML), 1, "only 对比 connections show");
});
