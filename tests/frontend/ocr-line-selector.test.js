// OPT-055: 快速 OCR 行级删除 UI
// When OCR finishes with ≥3 non-empty lines, show a per-line delete panel so
// the user can prune the full-page text before saving. Clicking ✕ on a row
// removes it and updates the content textarea. When fewer than 3 rows remain,
// the panel auto-hides.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

// Minimal element stub used for most els entries.
function elStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", disabled: false,
    hidden: false, dataset: {}, children: [], files: [],
    style: { display: "" },
    onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return elStub("button"); },
    querySelectorAll() { return []; },
    showModal() {}, close() {}, reset() {}, setAttribute() {}, removeAttribute() {}, closest() { return null; },
    remove() {},
  };
}

// A richer stub for #ocrLineSelector that supports the querySelectorAll interaction
// inside renderOcrLineSelector and its click handler.
function createOcrLineSelectorStub() {
  const state = { hidden: true, onclick: null };
  let _innerHTML = "";
  // Rows stored as { text, removed }
  const _rows = [];

  const hintStub = { textContent: "" };

  const makeRowStub = (entry) => ({
    remove() { entry.removed = true; },
    querySelector(sel) {
      if (sel === ".ocr-line-selector__text") return { get textContent() { return entry.text; } };
      return null;
    },
  });

  const stub = {
    get hidden() { return state.hidden; },
    set hidden(v) { state.hidden = v; },
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) {
      _innerHTML = String(v);
      _rows.length = 0;
      if (v) {
        // Extract lines from rendered HTML by matching text spans (un-escaped simple text)
        const re = /<span class="ocr-line-selector__text">(.*?)<\/span>/g;
        let m;
        while ((m = re.exec(v)) !== null) {
          _rows.push({ text: m[1], removed: false });
        }
      }
    },
    get onclick() { return state.onclick; },
    set onclick(v) { state.onclick = v; },
    querySelector(sel) {
      if (sel === ".ocr-line-selector__hint") return hintStub;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === ".ocr-line-selector__row") {
        return _rows.filter((r) => !r.removed).map((r) => makeRowStub(r));
      }
      return [];
    },
    // Test helpers
    _rows,
    _hint: hintStub,
  };
  return stub;
}

function createHarness() {
  const elements = new Map();
  const ocrLineSelectorEl = createOcrLineSelectorStub();
  const quoteContentEl = elStub("textarea");
  quoteContentEl.value = "";

  function getElement(sel) {
    if (sel === "#ocrLineSelector") return ocrLineSelectorEl;
    if (sel === "#quoteContent") return quoteContentEl;
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

  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };

  const context = {
    console, document, window,
    localStorage: { getItem: () => "", setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    CustomEvent: function(t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  els,
  renderOcrLineSelector,
  hideOcrLineSelector,
  resetQuoteDraft,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingImage(v) { pendingQuoteImage = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return { hooks: context.__testHooks, ocrLineSelectorEl, quoteContentEl };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("renderOcrLineSelector: hidden when fewer than 3 lines", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("第一行\n第二行");
  assert.equal(ocrLineSelectorEl.hidden, true, "selector hidden for 2-line text");
  assert.equal(ocrLineSelectorEl.innerHTML, "", "innerHTML cleared");
});

test("renderOcrLineSelector: hidden for empty string", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("");
  assert.equal(ocrLineSelectorEl.hidden, true);
});

test("renderOcrLineSelector: shown and populated for 3+ lines", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  const text = "行一\n行二\n行三\n行四";
  hooks.renderOcrLineSelector(text);
  assert.equal(ocrLineSelectorEl.hidden, false, "selector visible for 4-line text");
  assert.ok(ocrLineSelectorEl._rows.length === 4, `expected 4 rows, got ${ocrLineSelectorEl._rows.length}`);
  assert.ok(ocrLineSelectorEl._rows.every((r) => !r.removed), "all rows initially present");
  // hint text mentions line count
  assert.ok(ocrLineSelectorEl.innerHTML.includes("4 行"), "hint shows line count");
});

test("renderOcrLineSelector: empty lines are filtered out", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n\n行二\n\n\n行三");
  assert.equal(ocrLineSelectorEl._rows.length, 3, "blank lines not counted");
});

test("renderOcrLineSelector: onclick handler set", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  assert.ok(typeof ocrLineSelectorEl.onclick === "function", "onclick is a function");
});

test("click ✕ removes a row and updates textarea", () => {
  const { hooks, ocrLineSelectorEl, quoteContentEl } = createHarness();
  // Use 4 lines so that removing 1 leaves 3, which does NOT trigger auto-hide.
  // This lets us inspect the row state after the click.
  quoteContentEl.value = "行一\n行二\n行三\n行四";
  hooks.renderOcrLineSelector("行一\n行二\n行三\n行四");
  assert.equal(ocrLineSelectorEl._rows.length, 4);

  // Simulate clicking the ✕ button on the first row.
  // The handler uses e.target.closest(".ocr-line-selector__del"), then
  // btn.closest(".ocr-line-selector__row") to get the row element.
  const rowEls = ocrLineSelectorEl.querySelectorAll(".ocr-line-selector__row");
  const fakeBtn = {
    closest(sel) {
      if (sel === ".ocr-line-selector__del") return fakeBtn;
      if (sel === ".ocr-line-selector__row") return rowEls[0];
      return null;
    },
  };
  const fakeEvent = {
    target: {
      closest(sel) {
        if (sel === ".ocr-line-selector__del") return fakeBtn;
        return null;
      },
    },
  };
  ocrLineSelectorEl.onclick(fakeEvent);

  assert.ok(ocrLineSelectorEl._rows[0].removed, "first row marked removed");
  // textarea should now have only rows 1-3 (行二, 行三, 行四)
  const lines = quoteContentEl.value.split("\n");
  assert.equal(lines.length, 3, "textarea has 3 remaining lines");
  assert.ok(!lines.includes("行一"), "deleted line not in textarea");
});

test("panel auto-hides when remaining rows drop below 3", () => {
  const { hooks, ocrLineSelectorEl, quoteContentEl } = createHarness();
  quoteContentEl.value = "行一\n行二\n行三";
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  // selector is visible
  assert.equal(ocrLineSelectorEl.hidden, false);

  // Remove one row (leaves 2 → should auto-hide)
  const rowEls = ocrLineSelectorEl.querySelectorAll(".ocr-line-selector__row");
  const fakeBtn = {
    closest(sel) {
      if (sel === ".ocr-line-selector__del") return fakeBtn;
      if (sel === ".ocr-line-selector__row") return rowEls[0];
      return null;
    },
  };
  ocrLineSelectorEl.onclick({ target: { closest(sel) { return sel === ".ocr-line-selector__del" ? fakeBtn : null; } } });

  assert.equal(ocrLineSelectorEl.hidden, true, "auto-hidden when < 3 rows remain");
  assert.equal(ocrLineSelectorEl.onclick, null, "onclick cleared after hide");
});

test("hideOcrLineSelector resets state", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三\n行四");
  assert.equal(ocrLineSelectorEl.hidden, false);

  hooks.hideOcrLineSelector();
  assert.equal(ocrLineSelectorEl.hidden, true);
  assert.equal(ocrLineSelectorEl.innerHTML, "");
  assert.equal(ocrLineSelectorEl.onclick, null);
});

test("resetQuoteDraft hides the line selector", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  // populate selector
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  assert.equal(ocrLineSelectorEl.hidden, false);

  // resetQuoteDraft calls hideOcrLineSelector
  hooks.resetQuoteDraft();
  assert.equal(ocrLineSelectorEl.hidden, true, "selector hidden after resetQuoteDraft");
});

test("repeated renderOcrLineSelector calls overwrite (no handler accumulation)", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  const handler1 = ocrLineSelectorEl.onclick;
  hooks.renderOcrLineSelector("甲\n乙\n丙\n丁");
  const handler2 = ocrLineSelectorEl.onclick;
  // Both are functions but they are different closures — the important thing is
  // that there's only ONE handler assigned, not accumulated via addEventListener.
  assert.ok(typeof handler2 === "function");
  // New innerHTML reflects the new text
  assert.ok(ocrLineSelectorEl.innerHTML.includes("4 行"));
});
