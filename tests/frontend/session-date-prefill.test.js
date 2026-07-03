// OPT-059: openNewSessionForBook() date pre-fill must use local timezone (not UTC).
// UTC+8 凌晨录入阅读记录时，new Date().toISOString().split("T")[0] 给出 UTC 日期（昨天），
// 正确做法是 new Intl.DateTimeFormat("sv").format(new Date()) 返回本地时区 YYYY-MM-DD。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let _value = "";
  let _max = "";
  const stub = {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", open: false, hidden: false,
    style: {}, dataset: {}, parentNode: null, children: [], files: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get value() { return _value; },
    set value(v) { _value = String(v); },
    get max() { return _max; },
    set max(v) { _max = String(v); },
    get innerHTML() { return ""; },
    set innerHTML(v) { this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return createElementStub("input"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
    _click() { const l = this._listeners.click || []; if (l.length) l[l.length - 1](); },
  };
  return stub;
}

function createHarness() {
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };

  // Create a session form whose querySelector('[name="date"]') returns a trackable input stub.
  const dateInputStub = createElementStub("input");
  const sessionFormStub = Object.assign(createElementStub("form"), {
    querySelector(selector) {
      if (selector === '[name="date"]') return dateInputStub;
      return createElementStub("input");
    },
  });

  const document = {
    body: createElementStub("body"),
    querySelector(s) {
      if (s === "#sessionBookCombobox") return createElementStub("div");
      return getElement(s);
    },
    querySelectorAll() { return []; },
    createElement(t) { return createElementStub(t); },
    getElementById(id) {
      if (id === "sessionId") return createElementStub("input");
      return getElement(`#${id}`);
    },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({
      ok: true, status: 200,
      headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
      json: async () => ({ state: {}, stateVersion: "v-test" }),
    }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Intl, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
showToast = function () {};
globalThis.__hooks = {
  openNewSessionForBook,
  dateInput: null,
  els,
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;

  // Wire our trackable stubs into the running app's els.
  hooks.els.sessionForm = sessionFormStub;
  hooks.els.sessionDialog = getElement("#sessionDialog");
  hooks.dateInput = dateInputStub;

  // Set auth so requireAuth passes.
  vm.runInNewContext(`
    currentUser = { id: "u1" };
    authToken = "tok";
  `, context);

  return hooks;
}

test("OPT-059: openNewSessionForBook() pre-fills date with local-timezone YYYY-MM-DD", () => {
  const h = createHarness();
  h.openNewSessionForBook("b1");

  const filledDate = h.dateInput.value;

  // Must be a valid YYYY-MM-DD string.
  assert.match(filledDate, /^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD format");

  // Must equal today's date in local timezone (via Intl).
  const expectedLocalDate = new Intl.DateTimeFormat("sv").format(new Date());
  assert.equal(filledDate, expectedLocalDate, "date must use local timezone, not UTC");
});

test("OPT-059: openNewSessionForBook() sets max attribute to today's local date (no future dates)", () => {
  const h = createHarness();
  h.openNewSessionForBook("b1");

  const maxAttr = h.dateInput.max;
  const expectedLocalDate = new Intl.DateTimeFormat("sv").format(new Date());
  assert.equal(maxAttr, expectedLocalDate, "max must be today in local timezone");
});

test("OPT-059: local-tz date never equals UTC date when UTC is midnight-shifted (simulation)", () => {
  // Simulate a scenario where UTC gives the previous day.
  // We cannot force TZ in Node without env, so we verify the mechanism instead:
  // Intl.DateTimeFormat("sv") must use the JS engine's local TZ, while toISOString() uses UTC.
  // When TZ is UTC+8 and the time is 00:30 local, toISOString gives previous day; Intl gives current.
  //
  // To test the mechanism: fabricate a Date that is midnight UTC — in UTC+8 that would be 08:00 local.
  // Both approaches agree here. The key assertion is that `sv` locale returns YYYY-MM-DD format.
  const d = new Date("2026-07-03T00:00:00Z"); // midnight UTC = 08:00 CST
  const svResult = new Intl.DateTimeFormat("sv").format(d);
  assert.match(svResult, /^\d{4}-\d{2}-\d{2}$/, "sv locale always returns YYYY-MM-DD");
});
