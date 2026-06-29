// OPT-055: 快速 OCR 行级编辑/删除面板
// When OCR finishes with ≥3 non-empty lines, show a per-line panel. Each line is
// an editable input (trim partial content within a line) with a ✕ to delete the
// whole line. The recognized text is reflowed into the content textarea as a
// CONTINUOUS paragraph (physical line breaks removed) — both on initial render
// and after any edit/delete. The panel auto-hides only when every row is removed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function unescapeHtml(s) {
  return String(s)
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

// Minimal element stub used for most els entries.
function elStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", disabled: false,
    hidden: false, dataset: {}, children: [], files: [],
    style: { display: "" },
    onclick: null, oninput: null,
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

// Richer stub for #ocrLineSelector modelling input-based, editable rows.
function createOcrLineSelectorStub() {
  const state = { hidden: true, onclick: null, oninput: null };
  let _innerHTML = "";
  const _rows = []; // { value, removed }

  const hintStub = { textContent: "" };

  const makeInputStub = (entry) => ({
    classList: { contains: (c) => c === "ocr-line-selector__input" },
    style: {},
    scrollHeight: 24,
    get value() { return entry.value; },
    set value(v) { entry.value = String(v); },
  });
  const makeRowStub = (entry) => ({
    remove() { entry.removed = true; },
    querySelector() { return null; },
  });

  const stub = {
    get hidden() { return state.hidden; },
    set hidden(v) { state.hidden = v; },
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) {
      _innerHTML = String(v);
      _rows.length = 0;
      if (v) {
        const re = /class="ocr-line-selector__input"[^>]*>(.*?)<\/textarea>/g;
        let m;
        while ((m = re.exec(v)) !== null) {
          _rows.push({ value: unescapeHtml(m[1]), removed: false });
        }
      }
    },
    get onclick() { return state.onclick; },
    set onclick(v) { state.onclick = v; },
    get oninput() { return state.oninput; },
    set oninput(v) { state.oninput = v; },
    querySelector(sel) {
      if (sel === ".ocr-line-selector__hint") return hintStub;
      return null;
    },
    querySelectorAll(sel) {
      const live = _rows.filter((r) => !r.removed);
      if (sel === ".ocr-line-selector__row") return live.map((r) => makeRowStub(r));
      if (sel === ".ocr-line-selector__input") return live.map((r) => makeInputStub(r));
      return [];
    },
    _rows,
    _hint: hintStub,
  };
  return stub;
}

// Build a delete-click event whose target resolves the Nth live row.
function deleteClickEvent(sel, idx) {
  const rowEls = sel.querySelectorAll(".ocr-line-selector__row");
  const fakeBtn = {
    closest(s) {
      if (s === ".ocr-line-selector__del") return fakeBtn;
      if (s === ".ocr-line-selector__row") return rowEls[idx];
      return null;
    },
  };
  return { target: { closest: (s) => (s === ".ocr-line-selector__del" ? fakeBtn : null) } };
}

const inputEvent = { target: { classList: { contains: (c) => c === "ocr-line-selector__input" }, style: {}, scrollHeight: 24 } };

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

test("renderOcrLineSelector: shown with editable input rows for 3+ lines", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三\n行四");
  assert.equal(ocrLineSelectorEl.hidden, false, "selector visible for 4-line text");
  assert.equal(ocrLineSelectorEl._rows.length, 4, "4 editable rows");
  assert.ok(ocrLineSelectorEl.innerHTML.includes("ocr-line-selector__input"), "rows are inputs (editable)");
  assert.ok(ocrLineSelectorEl.innerHTML.includes("4 行"), "hint shows line count");
});

test("renderOcrLineSelector: empty lines are filtered out", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n\n行二\n\n\n行三");
  assert.equal(ocrLineSelectorEl._rows.length, 3, "blank lines not counted");
});

test("renderOcrLineSelector: click and input handlers set", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  assert.ok(typeof ocrLineSelectorEl.onclick === "function", "onclick is a function");
  assert.ok(typeof ocrLineSelectorEl.oninput === "function", "oninput is a function");
});

test("initial render reflows to a CONTINUOUS paragraph (no newlines) in the textarea", () => {
  const { hooks, quoteContentEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  assert.equal(quoteContentEl.value, "行一行二行三", "lines joined with no separator");
  assert.ok(!quoteContentEl.value.includes("\n"), "no physical line breaks remain");
});

test("editing a line input updates the textarea (continuous join)", () => {
  const { hooks, ocrLineSelectorEl, quoteContentEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  // Simulate the user trimming the middle line to partial content.
  const inputs = ocrLineSelectorEl.querySelectorAll(".ocr-line-selector__input");
  inputs[1].value = "二";
  ocrLineSelectorEl.oninput(inputEvent);
  assert.equal(quoteContentEl.value, "行一二行三", "edited line reflected, still continuous");
});

test("oninput ignores events not from a line input", () => {
  const { hooks, ocrLineSelectorEl, quoteContentEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  quoteContentEl.value = "SENTINEL";
  ocrLineSelectorEl.oninput({ target: { classList: { contains: () => false } } });
  assert.equal(quoteContentEl.value, "SENTINEL", "non-input event must not rebuild content");
});

test("click ✕ removes a row and rebuilds textarea continuously", () => {
  const { hooks, ocrLineSelectorEl, quoteContentEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三\n行四");
  ocrLineSelectorEl.onclick(deleteClickEvent(ocrLineSelectorEl, 0));
  assert.ok(ocrLineSelectorEl._rows[0].removed, "first row removed");
  assert.equal(quoteContentEl.value, "行二行三行四", "remaining lines joined continuously");
  assert.ok(!quoteContentEl.value.includes("\n"), "no newline after delete");
});

test("panel stays visible while ≥1 row remains (delete to 1)", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  ocrLineSelectorEl.onclick(deleteClickEvent(ocrLineSelectorEl, 0)); // 3 → 2
  assert.equal(ocrLineSelectorEl.hidden, false, "still visible at 2 rows");
  ocrLineSelectorEl.onclick(deleteClickEvent(ocrLineSelectorEl, 0)); // 2 → 1
  assert.equal(ocrLineSelectorEl.hidden, false, "still visible at 1 row (so it stays editable)");
});

test("panel auto-hides only when the last row is removed", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  ocrLineSelectorEl.onclick(deleteClickEvent(ocrLineSelectorEl, 0));
  ocrLineSelectorEl.onclick(deleteClickEvent(ocrLineSelectorEl, 0));
  ocrLineSelectorEl.onclick(deleteClickEvent(ocrLineSelectorEl, 0)); // last one
  assert.equal(ocrLineSelectorEl.hidden, true, "hidden when 0 rows remain");
  assert.equal(ocrLineSelectorEl.onclick, null, "onclick cleared");
  assert.equal(ocrLineSelectorEl.oninput, null, "oninput cleared");
});

test("hideOcrLineSelector resets state including oninput", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三\n行四");
  assert.equal(ocrLineSelectorEl.hidden, false);
  hooks.hideOcrLineSelector();
  assert.equal(ocrLineSelectorEl.hidden, true);
  assert.equal(ocrLineSelectorEl.innerHTML, "");
  assert.equal(ocrLineSelectorEl.onclick, null);
  assert.equal(ocrLineSelectorEl.oninput, null);
});

test("resetQuoteDraft hides the line selector", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  assert.equal(ocrLineSelectorEl.hidden, false);
  hooks.resetQuoteDraft();
  assert.equal(ocrLineSelectorEl.hidden, true, "selector hidden after resetQuoteDraft");
});

test("repeated renderOcrLineSelector calls overwrite (no handler accumulation)", () => {
  const { hooks, ocrLineSelectorEl } = createHarness();
  hooks.renderOcrLineSelector("行一\n行二\n行三");
  hooks.renderOcrLineSelector("甲\n乙\n丙\n丁");
  assert.equal(ocrLineSelectorEl._rows.length, 4, "rows reflect the latest text");
  assert.ok(ocrLineSelectorEl.innerHTML.includes("4 行"));
});

// Regression guard (bug found 2026-06-24): the panel never showed after 快速识别
// because renderOcrLineSelector was only wired into syncOpenQuoteFormFromState
// (the async AI poll path). The fast OCR path fills the textarea synchronously
// inside runOcrFromImage and must trigger the panel there too.
test("renderOcrLineSelector is wired into the fast OCR path (runOcrFromImage), not only the AI sync path", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
  const fnStart = src.indexOf("async function runOcrFromImage");
  assert.ok(fnStart !== -1, "runOcrFromImage must exist");
  const fnEnd = src.indexOf("\nasync function ", fnStart + 1);
  const body = src.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
  assert.ok(
    body.includes("renderOcrLineSelector("),
    "runOcrFromImage (fast OCR path) must call renderOcrLineSelector so the panel shows after 快速识别"
  );
  const occurrences = (src.match(/renderOcrLineSelector\(/g) || []).length;
  assert.ok(occurrences >= 3, `expected renderOcrLineSelector called in both paths (>=3 total incl. def), got ${occurrences}`);
});

// CSS regression guard (bug 2026-06-24): .ocr-line-selector is a grid item of
// .dialog-form (display:grid). Giving it `overflow` + `max-height` collapsed it
// to ~0 visible height (offsetHeight 14 while scrollHeight 383) — the panel
// looked like it "disappeared". The dialog-form scrolls itself, so the panel
// must NOT carry its own overflow/max-height.
test("[CSS] .ocr-line-selector has no overflow/max-height (it is a grid child of .dialog-form)", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const css = fs.readFileSync(path.join(__dirname, "..", "..", "styles.css"), "utf8");
  const m = css.match(/\.ocr-line-selector\s*\{([^}]*)\}/);
  assert.ok(m, ".ocr-line-selector rule must exist");
  // Strip /* ... */ comments so the explanatory note (which names these props)
  // doesn't trip the guard — we only care about actual declarations.
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/overflow\s*:/i.test(body), "must not set overflow (collapses as a grid item)");
  assert.ok(!/max-height\s*:/i.test(body), "must not set max-height (collapses as a grid item)");
});
