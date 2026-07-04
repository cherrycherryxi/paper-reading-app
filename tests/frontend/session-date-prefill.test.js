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

// `overrides.fixedNowMs` + `overrides.tzOffsetHours` let a test simulate "the browser's
// local timezone" independently of the host running the test (see test #3 below), by
// replacing Date/Intl inside the vm context rather than touching the real globals.
function createHarness(overrides = {}) {
  const { fixedNowMs, tzOffsetHours } = overrides;
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

  let ContextDate = Date;
  if (fixedNowMs !== undefined) {
    ContextDate = class extends Date {
      constructor(...args) {
        if (args.length === 0) super(fixedNowMs);
        else super(...args);
      }
      static now() { return fixedNowMs; }
    };
  }

  let ContextIntl = Intl;
  if (tzOffsetHours !== undefined) {
    // Stand in for a device whose local timezone is UTC+tzOffsetHours, so the mechanism
    // under test (Intl.DateTimeFormat("sv")) actually branches away from UTC.
    // NB: app.js calls `new Intl.DateTimeFormat(...)`, so this stand-in must be a real
    // constructor — a method-shorthand `DateTimeFormat() {}` is not newable and throws
    // "Intl.DateTimeFormat is not a constructor".
    ContextIntl = {
      DateTimeFormat: function DateTimeFormat(_locale, _opts) {
        return {
          format(d) {
            const shifted = new Date(d.getTime() + tzOffsetHours * 3600 * 1000);
            const pad = (n) => String(n).padStart(2, "0");
            return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
          },
        };
      },
    };
  }

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
    Date: ContextDate, Intl: ContextIntl, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
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

test("OPT-059: openNewSessionForBook() pre-fills local date, not UTC date, in the UTC+8 midnight window", () => {
  // 2026-07-03T16:30:00Z is 2026-07-04T00:30 in UTC+8 — exactly the "after local midnight,
  // still previous day in UTC" window that caused the original bug. Drive the real source
  // through a vm context whose Date/Intl are pinned to this instant/offset, so the assertion
  // actually exercises openNewSessionForBook() rather than recomputing the fix's own formula.
  const fixedNowMs = Date.parse("2026-07-03T16:30:00Z");
  const h = createHarness({ fixedNowMs, tzOffsetHours: 8 });
  h.openNewSessionForBook("b1");

  // The old, buggy `toISOString().split("T")[0]` would have produced "2026-07-03".
  assert.equal(h.dateInput.value, "2026-07-04", "must use the local-timezone date, not the UTC date");
});
