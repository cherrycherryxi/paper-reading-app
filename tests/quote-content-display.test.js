// Regression test for bug-098: quote card content truncation
// Verifies renderQuotes() shows full content without -webkit-line-clamp

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

function createElementStub() {
  let innerHTML = "";
  return {
    tagName: "DIV",
    className: "",
    textContent: "",
    style: {},
    dataset: {},
    value: "",
    disabled: false,
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    showModal() {},
    close() {},
    reset() {},
    setAttribute() {},
    closest() { return null; },
  };
}

function createHarness() {
  const elements = new Map();
  const getEl = (sel) => { if (!elements.has(sel)) elements.set(sel, createElementStub()); return elements.get(sel); };

  const document = {
    querySelector: (s) => getEl(s),
    querySelectorAll: () => [],
    createElement: () => createElementStub(),
    getElementById: (id) => getEl(`#${id}`),
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function(t) { this.type = t; },
    FormData, structuredClone, Date, Math, JSON,
    Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(
    /\nbindEvents\(\);\nrender\(\);\nactivateTab\("books"\);\nloadSession\(\);\s*$/,
    "\n"
  );
  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  renderQuotes,
  els,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  getQuotesListMarkup() { return els.quotesList.innerHTML; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__testHooks;
}

test("renderQuotes: card does NOT apply entry-card-note-clamp (bug-098)", () => {
  const h = createHarness();
  h.setCurrentUser({ id: "u1", username: "tester" });
  h.setState({
    books: [{ id: "b1", title: "测试书", author: "作者", tags: [], status: "reading",
               currentPage: 0, totalPages: 100, notes: "", coverImageUrl: "",
               createdAt: "2026-01-01T00:00:00.000Z" }],
    quotes: [{
      id: "q1", bookId: "b1",
      content: "这是一段很长的摘抄内容，应该完整显示在卡片上，不能被截断。".repeat(5),
      kind: "quote", page: 42, tags: ["测试"], reflection: "",
      imageUrl: "", createdAt: "2026-01-01T00:00:00.000Z",
    }],
    sessions: [], chatHistories: {}, connections: [],
  });
  h.renderQuotes();
  const html = h.getQuotesListMarkup();
  assert.ok(!html.includes("entry-card-note-clamp"), "摘抄卡片不应含 entry-card-note-clamp class（4行截断）");
  assert.ok(html.includes("这是一段很长的摘抄内容"), "摘抄内容应完整出现在卡片中");
});

test("renderQuotes: empty state shows login message when no user", () => {
  const h = createHarness();
  h.setCurrentUser(null);
  h.setState({ books: [], quotes: [], sessions: [], chatHistories: {}, connections: [] });
  h.renderQuotes();
  const el = h.els.quotesList;
  assert.ok(el.className.includes("empty-state"), "未登录时显示 empty-state");
});
