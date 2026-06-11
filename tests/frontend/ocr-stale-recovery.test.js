// OPT-042 (Fix B): recoverStalePendingOcr() flips quotes orphaned at
// ocrStatus:"pending" (past the staleness window — their OCR job died, e.g. a
// server restart) to "failed", so they surface the recoverable failed UI
// instead of an eternal "识别中" badge. Fresh pendings (a genuinely in-flight
// job) must be left alone.
//
// Executes the REAL app.js via vm.runInNewContext (project convention).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function elStub(tag = "div") {
  let innerHTML = "";
  return {
    tagName: tag.toUpperCase(), className: "", textContent: "", style: {}, dataset: {},
    value: "", open: false, children: [], files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; }, set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; }, insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {}, querySelector() { return elStub("button"); },
    querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
  };
}

function createHarness() {
  const elements = new Map();
  const getEl = (s) => { if (!elements.has(s)) elements.set(s, elStub()); return elements.get(s); };
  const document = {
    body: elStub("body"),
    querySelector: getEl, querySelectorAll: () => [],
    createElement: (t) => elStub(t), getElementById: (id) => getEl(`#${id}`),
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const putBodies = [];
  const context = {
    console, document, window,
    localStorage: { getItem: () => "", setItem() {}, removeItem() {} },
    fetch: async (url, options = {}) => {
      let body = {};
      try { body = JSON.parse(options.body); } catch (_) {}
      if (options.method === "PUT") putBodies.push(body);
      return {
        ok: true, status: 200,
        headers: { get: (h) => (h === "content-type" ? "application/json" : null) },
        json: async () => ({ state: body, stateVersion: "v-test" }),
      };
    },
    CustomEvent: function (t) { this.type = t; },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
  };
  const src = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  vm.runInNewContext(`${src}
render = function () {};
globalThis.__h = {
  recoverStalePendingOcr, isStalePendingOcr,
  setState(v) { state = v; }, getState() { return state; },
  setCurrentUser(v) { currentUser = v; }, setAuth(v) { authToken = v; },
};
`, context, { filename: "app.js" });
  const h = context.__h;
  h.putBodies = putBodies;
  return h;
}

function quote(over) {
  return { id: "q", bookId: "b", content: "", ocrStatus: "pending", ...over };
}

function isoAgo(min) {
  return new Date(Date.now() - min * 60 * 1000).toISOString();
}

function baseState(quotes) {
  return { books: [], sessions: [], quotes, connections: [], chatHistories: {}, chatContexts: {} };
}

test("OPT-042: a stale pending quote is flipped to failed and persisted", async () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  h.setState(baseState([quote({ ocrUpdatedAt: isoAgo(11) })]));
  const changed = await h.recoverStalePendingOcr();
  await flush();
  assert.equal(changed, true);
  const q = h.getState().quotes[0];
  assert.equal(q.ocrStatus, "failed", "stale pending must become failed");
  assert.ok(q.ocrError, "should carry a recoverable error message");
  assert.equal(h.putBodies.length, 1, "the flip must be persisted via PUT /api/state");
});

test("OPT-042: a fresh pending quote (job may still be running) is left alone", async () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  h.setState(baseState([quote({ ocrUpdatedAt: isoAgo(1) })]));
  const changed = await h.recoverStalePendingOcr();
  await flush();
  assert.equal(changed, false, "fresh pending must not be touched");
  assert.equal(h.getState().quotes[0].ocrStatus, "pending");
  assert.equal(h.putBodies.length, 0, "no write when nothing changed");
});

test("OPT-042: done quotes are never altered", async () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
  h.setState(baseState([quote({ ocrStatus: "done", content: "x", ocrUpdatedAt: isoAgo(99) })]));
  const changed = await h.recoverStalePendingOcr();
  await flush();
  assert.equal(changed, false);
  assert.equal(h.getState().quotes[0].ocrStatus, "done");
});
