// OPT-074: a book's startedAt/finishedAt are auto-filled by saveSession() but were
// never shown in the UI, and could not be set without recording a full session.
// This adds: (1) a date line in the book detail dialog, (2) editable date inputs in
// the book edit dialog. These tests load the real app.js via vm.runInNewContext and
// exercise the helpers + dialog functions directly.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const classes = new Set();
  const stub = {
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    open: false,
    hidden: false,
    scrollTop: 0,
    parentNode: null,
    children: [],
    files: [],
    _listeners: {},
    _elements: null,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c),
    },
    // Forms reference `els.bookEditForm.elements.<name>.value` — lazily mint a field
    // stub per name so the dialog populate/save code can read & write values.
    get elements() {
      if (!this._elements) {
        const cache = {};
        this._elements = new Proxy({}, {
          get: (_t, name) => {
            if (typeof name !== "string") return undefined;
            if (!cache[name]) cache[name] = createElementStub("input");
            return cache[name];
          },
        });
      }
      return this._elements;
    },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; },
    insertAdjacentHTML() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return createElementStub("div"); },
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
showToast = function (m) { globalThis.__lastToast = m; };
renderTimeline = function () {};
syncState = async function () {};
closeDialog = function () {};
resetBookEditDraft = function () {};
restoreEditedBookPosition = function () {};
globalThis.__hooks = {
  isoToDateInput,
  dateInputToIso,
  parseExcelDateToIso,
  excelSerialToIso,
  repairBogusExcelDate,
  normalizeStateShape,
  openBookDetailDialog,
  openBookEditDialog,
  saveBookEdit,
  els,
  setState(v) { state = v; },
  getState() { return state; },
  setAuth(v) { authToken = v; },
  setCurrentUser(v) { currentUser = v; },
  getLastToast() { return globalThis.__lastToast; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.elements = elements;
  hooks.getElement = getElement;
  hooks.makeFormData = (obj) => {
    const fd = new context.FormData();
    Object.entries(obj).forEach(([k, v]) => fd.append(k, v));
    return fd;
  };
  return hooks;
}

function authed(h) {
  h.setAuth("tok");
  h.setCurrentUser({ id: "u1" });
}

// ---------------------------------------------------------------------------
// Excel date parsing (bug: serials like 46055 were mis-read as the YEAR 46055)
// ---------------------------------------------------------------------------

test("parseExcelDateToIso: an Excel serial is converted to the real date, not year 460xx", () => {
  const h = createHarness();
  const iso = h.parseExcelDateToIso("46055");
  assert.ok(iso, "should parse");
  const y = new Date(iso).getFullYear();
  assert.ok(y > 2000 && y < 2100, `serial 46055 should be a ~2026 date, got year ${y}`);
});

test("parseExcelDateToIso: still parses normal date strings", () => {
  const h = createHarness();
  assert.equal(h.isoToDateInput(h.parseExcelDateToIso("2026-05-01")), "2026-05-01");
});

test("parseExcelDateToIso: rejects values that would mis-parse to a 5-digit year", () => {
  const h = createHarness();
  // A non-serial token that new Date() would read as a far-future year must be rejected.
  assert.equal(h.parseExcelDateToIso("46055-01-01"), null);
});

test("parseExcelDateToIso: empty / junk returns null", () => {
  const h = createHarness();
  assert.equal(h.parseExcelDateToIso(""), null);
  assert.equal(h.parseExcelDateToIso("not a date"), null);
});

test("repairBogusExcelDate: a stored year-460xx date is converted back to the real date", () => {
  const h = createHarness();
  // Reproduce how the bad value was created: new Date(String(serial)).toISOString().
  const bogus = new Date("46055").toISOString();
  assert.ok(new Date(bogus).getFullYear() > 9999, "precondition: bogus year");
  const fixed = h.repairBogusExcelDate(bogus);
  const y = new Date(fixed).getFullYear();
  assert.ok(y > 2000 && y < 2100, `repaired to a ~2026 date, got year ${y}`);
});

test("repairBogusExcelDate: leaves a normal date untouched", () => {
  const h = createHarness();
  const good = new Date("2026-05-01T12:00:00").toISOString();
  assert.equal(h.repairBogusExcelDate(good), good);
});

test("repairBogusExcelDate: passes through null/empty", () => {
  const h = createHarness();
  assert.equal(h.repairBogusExcelDate(null), null);
  assert.equal(h.repairBogusExcelDate(""), "");
});

test("normalizeStateShape: repairs bogus book dates on load", () => {
  const h = createHarness();
  const bogus = new Date("46055").toISOString();
  const normalized = h.normalizeStateShape({
    books: [
      { id: "b1", title: "Excel 导入的书", startedAt: bogus, finishedAt: null },
      { id: "b2", title: "正常的书", startedAt: new Date("2026-05-01T12:00:00").toISOString(), finishedAt: null },
    ],
    sessions: [], quotes: [], connections: [],
  });
  const b1 = normalized.books.find((b) => b.id === "b1");
  const b2 = normalized.books.find((b) => b.id === "b2");
  assert.ok(new Date(b1.startedAt).getFullYear() < 2100, "b1 repaired");
  assert.equal(h.isoToDateInput(b2.startedAt), "2026-05-01", "b2 untouched");
});

// ---------------------------------------------------------------------------
// helpers: isoToDateInput / dateInputToIso
// ---------------------------------------------------------------------------

test("OPT-074: isoToDateInput converts an ISO string to YYYY-MM-DD (local day preserved)", () => {
  const h = createHarness();
  // Stored the way saveSession does: noon-anchored to avoid TZ day rollover.
  const iso = new Date("2026-05-01T12:00:00").toISOString();
  assert.equal(h.isoToDateInput(iso), "2026-05-01");
});

test("OPT-074: isoToDateInput returns '' for empty/invalid input", () => {
  const h = createHarness();
  assert.equal(h.isoToDateInput(null), "");
  assert.equal(h.isoToDateInput(""), "");
  assert.equal(h.isoToDateInput("not-a-date"), "");
});

test("OPT-074: dateInputToIso round-trips with isoToDateInput", () => {
  const h = createHarness();
  const iso = h.dateInputToIso("2026-06-26");
  assert.ok(iso, "should produce an ISO string");
  assert.equal(h.isoToDateInput(iso), "2026-06-26", "round-trips back to the same day");
});

test("OPT-074: dateInputToIso returns null for empty input", () => {
  const h = createHarness();
  assert.equal(h.dateInputToIso(""), null);
  assert.equal(h.dateInputToIso(null), null);
});

// ---------------------------------------------------------------------------
// openBookDetailDialog — date line
// ---------------------------------------------------------------------------

test("OPT-074: book detail shows both dates when present", () => {
  const h = createHarness();
  h.setState({
    books: [{ id: "b1", title: "激情耗尽", startedAt: new Date("2026-05-01T12:00:00").toISOString(), finishedAt: new Date("2026-06-26T12:00:00").toISOString() }],
    sessions: [], quotes: [], connections: [],
  });
  h.openBookDetailDialog("b1");
  const datesEl = h.getElement("#bookDetailDates");
  assert.match(datesEl.textContent, /开始/, "shows 开始");
  assert.match(datesEl.textContent, /读完/, "shows 读完");
  assert.equal(datesEl.classList.contains("is-hidden"), false, "dates line visible");
});

test("OPT-074: book detail shows only the date that exists", () => {
  const h = createHarness();
  h.setState({
    books: [{ id: "b1", title: "在读的书", startedAt: new Date("2026-05-01T12:00:00").toISOString(), finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  h.openBookDetailDialog("b1");
  const datesEl = h.getElement("#bookDetailDates");
  assert.match(datesEl.textContent, /开始/);
  assert.doesNotMatch(datesEl.textContent, /读完/, "no 读完 when finishedAt is null");
});

test("OPT-074: book detail hides the date line when no dates set", () => {
  const h = createHarness();
  h.setState({
    books: [{ id: "b1", title: "想读的书", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  h.openBookDetailDialog("b1");
  const datesEl = h.getElement("#bookDetailDates");
  assert.equal(datesEl.textContent, "");
  assert.equal(datesEl.classList.contains("is-hidden"), true, "dates line hidden");
});

// ---------------------------------------------------------------------------
// openBookEditDialog — populate date inputs
// ---------------------------------------------------------------------------

test("OPT-074: edit dialog populates date inputs from book ISO dates", () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "X", currentPage: 10, status: "reading", startedAt: new Date("2026-05-01T12:00:00").toISOString(), finishedAt: new Date("2026-06-26T12:00:00").toISOString() }],
    sessions: [], quotes: [], connections: [],
  });
  h.openBookEditDialog("b1");
  assert.equal(h.els.bookEditForm.elements.startedAt.value, "2026-05-01");
  assert.equal(h.els.bookEditForm.elements.finishedAt.value, "2026-06-26");
});

test("OPT-074: edit dialog leaves date inputs blank when book has no dates", () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "X", currentPage: 0, status: "wishlist", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  h.openBookEditDialog("b1");
  assert.equal(h.els.bookEditForm.elements.startedAt.value, "");
  assert.equal(h.els.bookEditForm.elements.finishedAt.value, "");
});

// ---------------------------------------------------------------------------
// saveBookEdit — write dates back, validation
// ---------------------------------------------------------------------------

test("OPT-074: saveBookEdit writes manually entered dates back to the book", async () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "激情耗尽", currentPage: 0, status: "finished", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "0", status: "finished", notes: "",
    startedAt: "2026-05-01", finishedAt: "2026-06-26",
  }));
  const book = h.getState().books[0];
  assert.equal(h.isoToDateInput(book.startedAt), "2026-05-01");
  assert.equal(h.isoToDateInput(book.finishedAt), "2026-06-26");
});

test("OPT-074: saveBookEdit can clear a date by submitting it empty", async () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "X", totalPages: 0, currentPage: 5, status: "reading", startedAt: new Date("2026-05-01T12:00:00").toISOString(), finishedAt: new Date("2026-06-26T12:00:00").toISOString() }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "5", status: "reading", notes: "",
    startedAt: "2026-05-01", finishedAt: "",
  }));
  const book = h.getState().books[0];
  assert.equal(book.finishedAt, null, "finishedAt cleared when submitted empty");
  assert.equal(h.isoToDateInput(book.startedAt), "2026-05-01", "startedAt kept");
});

test("OPT-074: setting status 已读完 with a blank finish date auto-fills it (no totalPages needed)", async () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "激情耗尽", totalPages: 0, currentPage: 0, status: "reading", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "0", status: "finished", notes: "",
    startedAt: "", finishedAt: "",
  }));
  const book = h.getState().books[0];
  assert.ok(book.finishedAt, "finishedAt auto-filled when status set to 已读完");
});

test("OPT-074: setting status 阅读中 with a blank start date auto-fills it", async () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "X", totalPages: 0, currentPage: 0, status: "wishlist", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "0", status: "reading", notes: "",
    startedAt: "", finishedAt: "",
  }));
  const book = h.getState().books[0];
  assert.ok(book.startedAt, "startedAt auto-filled when status set to 阅读中");
  assert.equal(book.finishedAt, null, "finishedAt stays empty for 阅读中");
});

test("OPT-074: an explicit finish date is not overwritten by the 已读完 auto-fill", async () => {
  const h = createHarness();
  authed(h);
  h.setState({
    books: [{ id: "b1", title: "X", totalPages: 0, currentPage: 0, status: "reading", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "0", status: "finished", notes: "",
    startedAt: "2026-05-01", finishedAt: "2026-06-26",
  }));
  const book = h.getState().books[0];
  assert.equal(h.isoToDateInput(book.finishedAt), "2026-06-26", "user's finish date kept");
});

test("OPT-074: auto-filled finish date never lands before the start date", async () => {
  const h = createHarness();
  authed(h);
  // Start date in the future, status finished, finish date blank -> auto-fill must
  // clamp to the start date rather than 'now' (which would be earlier).
  const future = "2099-01-01";
  h.setState({
    books: [{ id: "b1", title: "X", totalPages: 0, currentPage: 0, status: "reading", startedAt: null, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "0", status: "finished", notes: "",
    startedAt: future, finishedAt: "",
  }));
  const book = h.getState().books[0];
  assert.ok(book.finishedAt >= book.startedAt, "finishedAt not before startedAt");
});

test("OPT-074: saveBookEdit rejects finishedAt earlier than startedAt", async () => {
  const h = createHarness();
  authed(h);
  const origStarted = new Date("2026-05-01T12:00:00").toISOString();
  h.setState({
    books: [{ id: "b1", title: "X", currentPage: 0, status: "reading", startedAt: origStarted, finishedAt: null }],
    sessions: [], quotes: [], connections: [],
  });
  await h.saveBookEdit(h.makeFormData({
    bookId: "b1", currentPage: "0", status: "reading", notes: "",
    startedAt: "2026-06-26", finishedAt: "2026-05-01",
  }));
  const book = h.getState().books[0];
  // Rejected: book dates unchanged from before the invalid save.
  assert.equal(book.startedAt, origStarted, "book unchanged after rejected save");
  assert.equal(book.finishedAt, null);
  assert.match(h.getLastToast() || "", /读完日期不能早于开始/);
});
