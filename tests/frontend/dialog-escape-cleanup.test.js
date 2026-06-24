// OPT-062: confirm dialogs must clean up event listeners when the Escape key
// closes them (the browser fires a "cancel" event on <dialog> for this).
//
// Bug: showConfirmDialog() and deleteBook() registered { once: true } click
// handlers on the confirm/cancel buttons but had no "cancel" event listener on
// the dialog itself. When Escape dismissed the dialog the click handlers were
// left attached. On the NEXT dialog opening those stale closures fired alongside
// the new ones, causing the previous onConfirm operation (e.g. deleting a
// different book) to execute erroneously.
//
// Fix: each dialog now adds an `addEventListener("cancel", cleanup, { once: true })`
// so Escape removes the stale click handlers before the dialog reopens.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const stub = {
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    open: false,
    hidden: false,
    parentNode: null,
    children: [],
    files: [],
    _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
      }
    },
    // Fire all registered listeners of the given type (simulates browser event dispatch).
    _trigger(type) {
      const fns = (this._listeners[type] || []).slice();
      fns.forEach((fn) => fn());
    },
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {},
    setAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
  };
  return stub;
}

function createHarness() {
  const elements = new Map();
  function getElement(selector) {
    if (!elements.has(selector)) elements.set(selector, createElementStub());
    return elements.get(selector);
  }
  const body = createElementStub("body");
  const document = {
    body,
    querySelector(s) { return getElement(s); },
    querySelectorAll() { return []; },
    createElement(t) { return createElementStub(t); },
    getElementById(id) { return getElement(`#${id}`); },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout(fn) { return 0; },
    confirm() { return true; },
  };

  const context = {
    console,
    document,
    window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
      json: async () => ({ state: {}, stateVersion: "v1" }),
    }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData,
    structuredClone,
    FileReader: function FileReader() {},
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    Promise, setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
showToast = function () {};
renderTimeline = function () {};
syncState = async function () {};
globalThis.__hooks = {
  showConfirmDialog,
  deleteBook,
  els,
  setState(v) { state = v; },
  getState() { return state; },
  setAuth(v) { authToken = v; },
  setCurrentUser(v) { currentUser = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.elements = elements;
  hooks.getElement = getElement;
  return hooks;
}

// ---------------------------------------------------------------------------
// showConfirmDialog — Escape cleanup
// ---------------------------------------------------------------------------

test("OPT-062: showConfirmDialog — Escape (cancel event) removes stale click handlers", () => {
  const h = createHarness();
  const dialog = h.els.confirmDialog;
  const confirmBtn = h.els.confirmDialogConfirmBtn;

  const firstCalled = [];
  const secondCalled = [];

  // Open dialog once.
  h.showConfirmDialog({ message: "Delete A?", onConfirm: () => firstCalled.push("A") });
  assert.equal(dialog.open, true, "dialog should be open");

  // Simulate Escape: browser fires "cancel" event and closes the dialog.
  dialog._trigger("cancel");
  dialog.open = false;

  // Open dialog again for a different operation.
  h.showConfirmDialog({ message: "Delete B?", onConfirm: () => secondCalled.push("B") });

  // Click confirm on the second dialog.
  confirmBtn._trigger("click");

  assert.deepEqual(firstCalled, [], "first onConfirm must NOT fire (stale listener removed)");
  assert.deepEqual(secondCalled, ["B"], "second onConfirm MUST fire exactly once");
});

test("OPT-062: showConfirmDialog — cancel button cleans up dialog cancel listener", () => {
  const h = createHarness();
  const dialog = h.els.confirmDialog;

  let calls = 0;
  h.showConfirmDialog({ message: "Delete?", onConfirm: () => calls++ });

  // Click cancel.
  h.els.confirmDialogCancelBtn._trigger("click");

  // After cancel, the dialog's "cancel" listener should be gone.
  // Triggering it must not throw and must not call onConfirm.
  dialog._trigger("cancel");
  assert.equal(calls, 0, "onConfirm must not fire after cancel button click");

  // The dialog cancel listener list should now be empty (or contain only stubs from other code).
  const cancelListeners = dialog._listeners["cancel"] || [];
  assert.equal(cancelListeners.length, 0, "no stale cancel listeners should remain");
});

test("OPT-062: showConfirmDialog — confirm button cleans up dialog cancel listener", () => {
  const h = createHarness();
  const dialog = h.els.confirmDialog;
  const confirmBtn = h.els.confirmDialogConfirmBtn;

  let calls = 0;
  h.showConfirmDialog({ message: "Delete?", onConfirm: () => calls++ });

  confirmBtn._trigger("click");
  assert.equal(calls, 1, "onConfirm fires once on confirm click");

  // After confirm, triggering the dialog cancel event must not call onConfirm again.
  dialog._trigger("cancel");
  assert.equal(calls, 1, "onConfirm must not fire again after dialog cancel trigger");
});

// ---------------------------------------------------------------------------
// deleteBook — Escape cleanup
// ---------------------------------------------------------------------------

test("OPT-062: deleteBook — Escape removes stale handlers so next deleteBook is clean", () => {
  const h = createHarness();
  h.setAuth("tok");
  h.setCurrentUser({ id: "u1" });
  h.setState({
    books: [
      { id: "bA", title: "Book A" },
      { id: "bB", title: "Book B" },
    ],
    sessions: [],
    quotes: [],
    connections: [],
    chatHistories: {},
    chatContexts: {},
  });

  const dialog = h.els.deleteBookDialog;

  // First deleteBook call — simulate Escape dismissal.
  h.deleteBook("bA");
  assert.equal(dialog.open, true, "deleteBookDialog should be open after first call");

  dialog._trigger("cancel");
  dialog.open = false;

  // State unchanged — book A still present.
  assert.equal(h.getState().books.length, 2);

  // Second deleteBook call — user now deletes book B.
  h.deleteBook("bB");
  assert.equal(dialog.open, true, "deleteBookDialog should be open for second call");

  // Click confirm — should only delete book B.
  h.els.deleteBookConfirmBtn._trigger("click");

  const remaining = h.getState().books.map((b) => b.id);
  // Book A must still be there; only book B removed.
  assert.ok(remaining.includes("bA"), "book A must NOT be deleted (stale handler removed)");
  assert.ok(!remaining.includes("bB"), "book B must be deleted (confirmed)");
});

test("OPT-062: deleteBook — Escape fires cleanup that unregisters cancel listener itself", () => {
  const h = createHarness();
  h.setAuth("tok");
  h.setCurrentUser({ id: "u1" });
  h.setState({
    books: [{ id: "b1", title: "B1" }],
    sessions: [], quotes: [], connections: [],
    chatHistories: {}, chatContexts: {},
  });

  const dialog = h.els.deleteBookDialog;
  h.deleteBook("b1");

  // There should be exactly 1 cancel listener registered.
  assert.equal((dialog._listeners["cancel"] || []).length, 1, "one cancel listener registered");

  // Escape fires it.
  dialog._trigger("cancel");

  // After Escape the cancel listener removes itself ({once:true} semantics plus cleanup).
  // At minimum: triggering cancel again must not throw.
  dialog._trigger("cancel");
  // And the confirm button should have 0 stale click listeners.
  assert.equal((h.els.deleteBookConfirmBtn._listeners["click"] || []).length, 0);
});
