/**
 * regression-fixed-bugs.test.js
 *
 * Each test loads and executes the real source file via vm.runInNewContext.
 * A test MUST fail if the corresponding fix is reverted.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const chatJsPath = path.join(__dirname, "..", "..", "chat.js");
const appJsPath  = path.join(__dirname, "..", "..", "app.js");
const stylesPath = path.join(__dirname, "..", "..", "styles.css");
const indexPath  = path.join(__dirname, "..", "..", "index.html");

const chatSource = fs.readFileSync(chatJsPath, "utf8");
const appSource  = fs.readFileSync(appJsPath, "utf8");
const styles     = fs.readFileSync(stylesPath, "utf8");
const indexHtml  = fs.readFileSync(indexPath, "utf8");

// ─── chat.js element stub (stores one listener per event type, supports dispatch) ───

function makeChatEl(tagName = "div") {
  let html = "";
  const children = [];
  const listeners = new Map();
  const classes = new Set();

  const el = {
    tagName: tagName.toUpperCase(),
    value: "", disabled: false, textContent: "",
    scrollTop: 0, scrollHeight: 0,
    children, style: {}, dataset: {}, parentNode: null, _removed: false,
    classList: {
      add(...ns) { ns.forEach((n) => classes.add(n)); },
      remove(...ns) { ns.forEach((n) => classes.delete(n)); },
      contains(n) { return classes.has(n); },
    },
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = String(v);
      children.length = 0;
      if (html.includes("agent-confirm-btn")) {
        const b = makeChatEl("button");
        b.className = "agent-confirm-btn button button-primary button-small";
        b.textContent = "确认执行"; b.parentNode = el; children.push(b);
      }
      if (html.includes("agent-cancel-btn")) {
        const b = makeChatEl("button");
        b.className = "agent-cancel-btn button button-ghost button-small";
        b.textContent = "忽略"; b.parentNode = el; children.push(b);
      }
    },
    appendChild(child) {
      child.parentNode = el; children.push(child); el.scrollHeight += 1; return child;
    },
    remove() {
      el._removed = true;
      if (el.parentNode) {
        const i = el.parentNode.children.indexOf(el);
        if (i >= 0) el.parentNode.children.splice(i, 1);
      }
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event = {}) {
      const h = listeners.get(type);
      return h ? h(event) : undefined;
    },
    querySelector(sel) {
      if (sel.startsWith(".")) {
        const cn = sel.slice(1);
        return children.find((c) => (c.className || "").split(/\s+/).includes(cn)) || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel.startsWith(".")) {
        const cn = sel.slice(1);
        return children.filter((c) => (c.className || "").split(/\s+/).includes(cn));
      }
      return [];
    },
  };
  return el;
}

function makeSseResponse(events) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return {
    ok: true,
    body: {
      getReader() {
        let done = false;
        return {
          async read() {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: encoder.encode(payload) };
          },
        };
      },
    },
  };
}

// ─── chat.js harness: runs real chat.js in a VM sandbox ──────────────────────

function createChatHarness(overrides = {}) {
  const elMap = new Map();
  const apiCalls = [];
  const fetchCalls = [];
  const toasts = [];
  const showConfirmDialogCalls = [];
  let confirmCalled = false;

  function getEl(sel) {
    if (!elMap.has(sel)) {
      const el = makeChatEl("div");
      if (sel === "#chatMessages")
        el.innerHTML = '<div class="chat-welcome">选择一本书，开始探讨。</div>';
      elMap.set(sel, el);
    }
    return elMap.get(sel);
  }

  const appState = {
    books: [{ id: "book-1", title: "Test Book", author: "A", tags: [], notes: "" }],
    quotes: [], sessions: [], chatHistories: {},
  };

  const defaultApiFetch = async (url, opts) => {
    apiCalls.push({ url, opts });
    if (url === "/api/chat")
      return { reply: "ok", history: [], actions: [] };
    throw new Error(`Unhandled apiFetch: ${url}`);
  };
  const defaultFetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    return makeSseResponse([{ done: true, reply: "ok", history: [], actions: [] }]);
  };

  const context = {
    console: { log() {}, error() {}, warn() {} },
    fetch: overrides.fetch || defaultFetch,
    TextDecoder,
    document: {
      querySelector(sel) { return getEl(sel); },
      querySelectorAll() { return []; },
      createElement(tag) { return makeChatEl(tag); },
    },
    window: {
      paperReadingApp: {
        requireAuth() { return true; },
        apiFetch: overrides.apiFetch || defaultApiFetch,
        buildApiUrl(path) { return path; },
        getAuthToken() { return "token"; },
        getState() { return appState; },
        normalizeChatContext(context = null, fallbackBookId = "") {
          if (context?.type === "quote" && context.bookId && context.quoteId) {
            return { type: "quote", bookId: context.bookId, quoteId: context.quoteId };
          }
          const bookId = context?.type === "book" ? context.bookId : fallbackBookId;
          return bookId ? { type: "book", bookId } : { type: "global" };
        },
        chatContextHistoryKey(context) {
          if (context?.type === "quote") return `quote:${context.quoteId}`;
          if (context?.type === "book") return `book:${context.bookId}`;
          return "global";
        },
        getChatHistoryForContext(context) {
          const key = this.chatContextHistoryKey(context);
          return appState.chatHistories[key] || [];
        },
        setChatHistoryForContext(context, history) {
          const key = this.chatContextHistoryKey(context);
          appState.chatHistories[key] = history;
        },
        setChatHistoryForBook(id, h) { appState.chatHistories[id || "__general__"] = h; },
        getChatHistoryForBook(id) { return appState.chatHistories[id || "__general__"] || []; },
        loadRemoteLogs: async () => {},
        getActiveChatBookId: () => "book-1",
        showToast(msg) { toasts.push(msg); },
        clearChatHistory: async () => {},
        showConfirmDialog(opts) { showConfirmDialogCalls.push(opts); },
        ...overrides.paperReadingApp,
      },
      addEventListener() {},
      dispatchEvent() {},
      CustomEvent: function CustomEvent(type) { this.type = type; },
      confirm() { confirmCalled = true; return overrides.confirmReturn ?? true; },
      setTimeout(fn) { fn(); return 1; },
      clearTimeout() {},
    },
    CustomEvent: function CustomEvent(type) { this.type = type; },
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
  };

  vm.runInNewContext(chatSource, context, { filename: "chat.js" });

  const input    = getEl("#chatInput");
  const sendBtn  = getEl("#chatSendBtn");
  const clearBtn = getEl("#chatClearBtn");
  const messages = getEl("#chatMessages");
  const bookSel  = getEl("#chatBookSelect");
  bookSel.value = "book-1";

  return {
    input, sendBtn, clearBtn, messages, bookSel,
    apiCalls, fetchCalls, toasts,
    isConfirmCalled()        { return confirmCalled; },
    getShowConfirmCalls()    { return showConfirmDialogCalls; },
    getConfirmContainer()    {
      return messages.children.find((c) => c.className === "agent-confirm") || null;
    },
    getEl,
    appState,
    paperReadingApp: context.window.paperReadingApp,
  };
}

// ─── app.js element stub (stateful dialog support) ───────────────────────────

function makeAppEl(tagName = "div") {
  let html = "";
  const classes = new Set();
  const listeners = new Map();
  const queryChildren = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "",
    style: { display: "" }, dataset: {},
    value: "", disabled: false, open: false,
    children: [], files: [],
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      },
      contains(name) { return classes.has(name); },
    },
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); this.children = []; },
    appendChild(c) {
      this.children.push(c);
      if (c?.innerHTML) html += c.innerHTML;
      return c;
    },
    insertAdjacentHTML(pos, v) {
      html = pos === "beforeend" ? `${html}${v}` : `${v}${html}`;
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      return handler ? handler(event) : undefined;
    },
    querySelector(sel) {
      if (!queryChildren.has(sel)) queryChildren.set(sel, makeAppEl("input"));
      return queryChildren.get(sel);
    },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close()     { this.open = false; },
    reset() {
      for (const child of queryChildren.values()) child.value = "";
    },
    setAttribute() {}, removeAttribute() {}, closest() { return null; },
    focus() {}, blur() {}, matches() { return false; },
  };
  return el;
}

// ─── app.js harness: runs real app.js in a VM sandbox ────────────────────────

function createAppHarness(overrides = {}) {
  const elMap = new Map();
  const dispatchedEvents = [];
  let confirmCalled = false;

  function getEl(sel) {
    if (!elMap.has(sel)) elMap.set(sel, makeAppEl());
    return elMap.get(sel);
  }

  const context = {
    console: { log() {}, error() {}, warn() {} },
    document: {
      querySelector(sel)   { return getEl(sel); },
      querySelectorAll()   { return []; },
      createElement(tag)   { return makeAppEl(tag); },
      getElementById(id)   { return getEl(`#${id}`); },
      addEventListener()   {},
      removeEventListener(){},
    },
    window: {
      PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
      dispatchEvent(ev) { dispatchedEvents.push(ev.type || String(ev)); },
      addEventListener() {}, removeEventListener() {},
      clearTimeout() {},
      setTimeout() { return 1; },
      confirm() { confirmCalled = true; return overrides.confirmReturn ?? true; },
      ...overrides.window,
    },
    localStorage: {
      storage: {},
      getItem(k)    { return this.storage[k] || ""; },
      setItem(k, v) { this.storage[k] = String(v); },
      removeItem(k) { delete this.storage[k]; },
    },
    fetch: overrides.fetch || (async () => ({
      ok: true,
      headers: { get() { return "application/json"; } },
      json: async () => ({}),
    })),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone, Date, Math, JSON,
    Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  // Strip the 4 boot calls so the module loads without side-effects
  const sourceWithoutBoot = appSource.replace(
    /\nbindEvents\(\);\nrender\(\);[\s\S]*$/,
    "\n"
  );

  const instrumented = `${sourceWithoutBoot}
globalThis.__testHooks = {
  els,
  deleteSession,
  deleteQuote,
  showConfirmDialog,
  withSavingState,
  apiFetch,
  renderTimeline,
  renderQuotes,
  renderBooks,
  globalSearch,
  saveBookEdit,
  openBookDetailDialog,
  openQuoteDetail,
  goToQuoteChat,
  setState(v)       { state = v; },
  getState()        { return state; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v)   { authToken = v; },
  setSyncState(fn)  { syncState = fn; },
  setRender(fn)     { render = fn; },
  setShowToast(fn)  { showToast = fn; },
  setSwitchChatToQuote(fn) { window.paperReadingApp.switchChatToQuote = fn; },
  bindEvents,
  setLastQuoteBookId(v) { lastQuoteBookId = v; },
};
`;

  vm.runInNewContext(instrumented, context, { filename: "app.js" });

  const hooks = context.__testHooks;
  return {
    ...hooks,
    getEl,
    isConfirmCalled()   { return confirmCalled; },
    dispatchedEvents,
    localStorage: context.localStorage,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// CSS / HTML source tests
// ════════════════════════════════════════════════════════════════════════════════

test("P0-001 regression: .toast bottom includes 64px nav-bar offset inside mobile media block", () => {
  const mobileMatch = styles.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*)/);
  assert.ok(mobileMatch, "@media (max-width:768px) block missing");
  const mobileBlock = mobileMatch[1];

  // Find a .toast rule inside the mobile block (stop at next unbalanced })
  const toastMatch = mobileBlock.match(/\.toast\s*\{([^}]*)\}/);
  assert.ok(toastMatch, ".toast rule missing inside mobile media block");
  assert.match(
    toastMatch[1],
    /bottom:\s*calc\([^)]*(64px|72px)[^)]*\)/,
    ".toast bottom should include the mobile nav-bar height (regression: was missing, toast appeared behind nav)"
  );
});

test("P0-002 regression: .book-delete-corner is at least 44×44px (Apple HIG minimum)", () => {
  const ruleMatch = styles.match(/\.book-delete-corner\s*\{([^}]*)\}/);
  assert.ok(ruleMatch, ".book-delete-corner CSS rule missing");
  const rule = ruleMatch[1];
  assert.match(rule, /width:\s*44px/, "width should be 44px (was 30px)");
  assert.match(rule, /height:\s*44px/, "height should be 44px (was 30px)");
});

test("bug-017 regression: <dialog id=deleteBookDialog> must not carry class=dialog-form directly", () => {
  // dialog-form sets display:grid which overrides <dialog> UA display:none on iOS Safari,
  // making the closed dialog permanently visible on every tab.
  const tagMatch = indexHtml.match(/<dialog[^>]+id="deleteBookDialog"[^>]*>/);
  assert.ok(tagMatch, "#deleteBookDialog <dialog> tag not found in index.html");
  assert.doesNotMatch(
    tagMatch[0],
    /\bdialog-form\b/,
    "dialog-form must be on an inner wrapper, not on the <dialog> element itself"
  );
});

test("quote form keeps default tag picker wiring", () => {
  assert.match(indexHtml, /id="quoteTagChips"/, "quote form should render default tag chip container");
  assert.match(indexHtml, /id="quoteTagInput"/, "quote form should render custom tag input");
  assert.match(indexHtml, /id="quoteTagsHidden"[^>]+name="tags"/, "quote form should submit selected tags through hidden tags input");
  assert.match(appSource, /const DEFAULT_QUOTE_TAGS = \[[^\]]*"金句"[^;]+;/, "default quote tag list should exist");
  assert.match(appSource, /renderQuoteTagPicker\(\[\]\)/, "new quote flow should render default quote tags");
  assert.match(appSource, /document\.getElementById\("quoteTagInput"\)\?\.addEventListener\("keydown"/, "custom quote tag input should auto-add tags on Enter");
});

test("new quote button clears previous draft while preserving last selected book", () => {
  const hooks = createAppHarness();
  hooks.setCurrentUser({ id: "user-1", username: "tester" });
  hooks.setAuthToken("token");
  hooks.setLastQuoteBookId("book-1");
  hooks.setState({
    books: [{ id: "book-1", title: "Test Book", author: "A", status: "reading", tags: [] }],
    quotes: [], sessions: [], chatHistories: {},
  });

  const pageField = hooks.els.quoteForm.querySelector('[name="page"]');
  const kindField = hooks.els.quoteForm.querySelector('[name="kind"]');
  const bookField = hooks.els.quoteForm.querySelector('[name="bookId"]');
  const reflectionField = hooks.els.quoteForm.querySelector('[name="reflection"]');
  const idField = hooks.getEl("#quoteId");
  const ocrBaseContent = "上一条手动输入的摘抄";
  hooks.els.quoteContent.value = ocrBaseContent;
  pageField.value = "88";
  kindField.value = "note";
  bookField.value = "book-1";
  reflectionField.value = "上一条理解";
  idField.value = "quote-old";
  hooks.els.quoteForm.dataset.ocrBaseContent = ocrBaseContent;
  hooks.els.quoteForm.dataset.ocrQuoteId = "quote-old";
  hooks.els.quoteForm.reset = () => {
    hooks.els.quoteContent.value = "";
    pageField.value = "";
    kindField.value = "";
    bookField.value = "";
    reflectionField.value = "";
    idField.value = "";
  };

  hooks.bindEvents();
  hooks.els.openQuoteDialogBtn.dispatch("click");

  assert.equal(hooks.els.quoteContent.value, "", "new quote should not carry over previous manual content");
  assert.equal(reflectionField.value, "", "new quote should not carry over previous reflection");
  assert.equal(pageField.value, "", "new quote should not carry over previous page");
  assert.equal(idField.value, "", "new quote should not edit the previous quote");
  assert.equal(hooks.els.quoteForm.dataset.ocrBaseContent, undefined, "new quote should clear stale OCR base content");
  assert.equal(hooks.els.quoteForm.dataset.ocrQuoteId, undefined, "new quote should clear stale OCR quote id");
  assert.equal(bookField.value, "book-1", "new quote should preserve the last selected book");
  assert.equal(hooks.els.quoteDialog.open, true, "new quote dialog should open");
});

// ════════════════════════════════════════════════════════════════════════════════
// chat.js VM tests
// ════════════════════════════════════════════════════════════════════════════════

test("P0-003 regression: keydown Enter while sendBtn is disabled does not trigger another send", async () => {
  let apiCallCount = 0;
  const harness = createChatHarness({
    apiFetch: async (url) => {
      apiCallCount++;
      if (url === "/api/chat") return { reply: "ok", history: [], actions: [] };
      throw new Error(`Unhandled: ${url}`);
    },
  });

  // Simulate being mid-send: manually disable the button
  harness.sendBtn.disabled = true;

  // Dispatch Enter key – the fixed handler guards on sendBtn.disabled
  harness.input.dispatch("keydown", {
    key: "Enter",
    shiftKey: false,
    preventDefault() {},
  });

  assert.equal(
    apiCallCount,
    0,
    "sendMessage should not fire when sendBtn is disabled (regression: was firing duplicate sends)"
  );
});

test("P1-001 regression: all agent actions are shown sequentially (not just the first)", async () => {
  // Three actions returned by the backend – each must be shown as a confirm card
  // and the user must be able to process them one by one.
  const actions = [
    { id: "a1", type: "add_note", data: { note: "note1" }, status: "PENDING_APPROVAL" },
    { id: "a2", type: "add_note", data: { note: "note2" }, status: "PENDING_APPROVAL" },
    { id: "a3", type: "tag",      data: { tags: ["科幻"] }, status: "PENDING_APPROVAL" },
  ];

  const harness = createChatHarness({
    fetch: async () => makeSseResponse([{ done: true, reply: "ok", history: [], actions }]),
    apiFetch: async (url) => {
      if (url === "/api/agent-actions/a1/approve")
        return { ok: true, action: { id: "a1", status: "EXECUTED" }, state: harness.appState };
      if (url === "/api/agent-actions/a2/reject")
        return { ok: true, action: { id: "a2", status: "REJECTED" } };
      if (url === "/api/agent-actions/a3/approve")
        return { ok: true, action: { id: "a3", status: "EXECUTED" }, state: harness.appState };
      throw new Error(`Unhandled: ${url}`);
    },
  });

  harness.input.value = "show me actions";
  await harness.sendBtn.dispatch("click");

  // --- Action 1 ---
  let card = harness.getConfirmContainer();
  assert.ok(card, "P1-001: action-1 confirm card should appear");
  const btn1 = card.querySelector(".agent-confirm-btn");
  assert.ok(btn1, "action-1 confirm button missing");
  await btn1.onclick();

  // --- Action 2 (P1-006: DOM must NOT have been reset after action-1 was confirmed) ---
  card = harness.getConfirmContainer();
  assert.ok(
    card,
    "P1-001/P1-006: action-2 confirm card should appear after confirming action-1 (regression: was cleared by resetMessages)"
  );
  const btn2 = card.querySelector(".agent-cancel-btn");
  assert.ok(btn2, "action-2 cancel button missing");
  await btn2.onclick();

  // --- Action 3 ---
  card = harness.getConfirmContainer();
  assert.ok(card, "P1-001: action-3 confirm card should appear after ignoring action-2");
  const btn3 = card.querySelector(".agent-confirm-btn");
  assert.ok(btn3, "action-3 confirm button missing");
  await btn3.onclick();
});

test("agent action retry: failed action shows retry button, retry succeeds on second attempt", async () => {
  let approveCallCount = 0;
  const harness = createChatHarness({
    fetch: async () => makeSseResponse([{
      done: true, reply: "ok", history: [], actions: [
        { id: "r1", type: "add_note", data: { note: "重试测试" }, status: "PENDING_APPROVAL" },
      ],
    }]),
    apiFetch: async (url) => {
      if (url === "/api/agent-actions/r1/approve") {
        approveCallCount++;
        if (approveCallCount === 1) throw new Error("网络错误");
        return { ok: true, action: { id: "r1", status: "EXECUTED" }, state: harness.appState };
      }
      throw new Error(`Unhandled: ${url}`);
    },
  });

  harness.input.value = "test retry";
  await harness.sendBtn.dispatch("click");

  const card = harness.getConfirmContainer();
  assert.ok(card, "confirm card should appear");
  const confirmBtn = card.querySelector(".agent-confirm-btn");
  const cancelBtn = card.querySelector(".agent-cancel-btn");

  // First attempt — fails
  await confirmBtn.onclick();
  assert.equal(approveCallCount, 1, "approve should have been called once");
  assert.equal(confirmBtn.textContent, "重试", "button should read 重试 after failure");
  assert.equal(confirmBtn.disabled, false, "retry button should be re-enabled");
  assert.equal(cancelBtn.disabled, false, "cancel button should be re-enabled after failure");

  // Second attempt — succeeds; card is removed via setTimeout (stubbed as fn())
  await confirmBtn.onclick();
  assert.equal(approveCallCount, 2, "approve should have been called again on retry");
  assert.equal(confirmBtn.textContent, "已完成 ✅", "button should show success after retry");
});

test("P1-003 regression: clearHistory uses showConfirmDialog, not window.confirm", () => {
  const harness = createChatHarness();

  harness.clearBtn.dispatch("click");

  assert.equal(
    harness.isConfirmCalled(),
    false,
    "window.confirm must not be called (regression: clearHistory used native confirm)"
  );
  assert.equal(
    harness.getShowConfirmCalls().length,
    1,
    "showConfirmDialog should have been called once"
  );
  assert.equal(
    harness.getShowConfirmCalls()[0].message,
    "清空 Test Book 的探讨记录？"
  );
});

test("quote-scoped chat sends structured quote context and stores quote history", async () => {
  const harness = createChatHarness();
  harness.appState.quotes = [
    { id: "quote-1", bookId: "book-1", content: "这是一条需要讨论的摘抄", kind: "quote" },
  ];

  harness.paperReadingApp.switchChatToQuote("book-1", "quote-1");
  harness.input.value = "围绕这条摘抄聊聊";
  await harness.sendBtn.dispatch("click");

  assert.equal(harness.fetchCalls.length, 1, "send should use the streaming chat endpoint once");
  const body = JSON.parse(harness.fetchCalls[0].opts.body);
  assert.deepEqual(
    body.context,
    { type: "quote", bookId: "book-1", quoteId: "quote-1" },
    "chat request should carry quote scope through structured context"
  );
  assert.ok(
    Array.isArray(harness.appState.chatHistories["quote:quote-1"]),
    "final payload history should be stored under the quote-scoped context key"
  );
  assert.equal(harness.appState.chatHistories["quote:quote-1"].length, 0);
});

test("quote-scoped clear history prompts for current quote and preserves active quote context", async () => {
  let clearedContext = null;
  const harness = createChatHarness({
    paperReadingApp: {
      clearChatHistory: async () => {
        clearedContext = harness.paperReadingApp.getActiveChatContext();
      },
    },
  });
  harness.appState.quotes = [
    { id: "quote-1", bookId: "book-1", content: "这是一条需要讨论的摘抄", kind: "quote" },
  ];

  harness.paperReadingApp.switchChatToQuote("book-1", "quote-1");
  harness.clearBtn.dispatch("click");

  assert.equal(harness.getShowConfirmCalls().length, 1);
  assert.equal(harness.getShowConfirmCalls()[0].message, "清空 当前摘抄 的探讨记录？");
  await harness.getShowConfirmCalls()[0].onConfirm();
  assert.deepEqual(
    clearedContext,
    { type: "quote", bookId: "book-1", quoteId: "quote-1" },
    "clear history should operate on the active quote context"
  );
});

test("quote context can return to whole-book context", () => {
  const harness = createChatHarness();
  harness.appState.quotes = [
    { id: "quote-1", bookId: "book-1", content: "这是一条需要讨论的摘抄", kind: "quote" },
  ];

  harness.paperReadingApp.switchChatToQuote("book-1", "quote-1");
  assert.deepEqual(harness.paperReadingApp.getActiveChatContext(), { type: "quote", bookId: "book-1", quoteId: "quote-1" });

  const clearButton = { closest: (selector) => (selector === "[data-clear-quote-context]" ? clearButton : null) };
  harness.getEl("#chatBookContext").dispatch("click", { target: clearButton });

  assert.deepEqual(
    harness.paperReadingApp.getActiveChatContext(),
    { type: "book", bookId: "book-1" },
    "switching back to a book should clear quote scope"
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// app.js VM tests
// ════════════════════════════════════════════════════════════════════════════════

test("P1-002 regression: renderTimeline and renderQuotes include delete buttons", () => {
  const hooks = createAppHarness();
  hooks.setCurrentUser({ id: "u1", name: "Test" });
  hooks.setState({
    books: [{ id: "b1", title: "书", author: "A", tags: [], status: "reading",
              currentPage: 10, totalPages: 200, notes: "", coverImageUrl: "",
              createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    sessions: [{ id: "s1", bookId: "b1", date: "2026-05-01",
                 startPage: 10, endPage: 50, minutes: 30, note: "" }],
    quotes: [{ id: "q1", bookId: "b1", content: "一段摘抄",
               kind: "quote", page: 42, tags: [], createdAt: "2026-05-01T00:00:00.000Z" }],
    chatHistories: {},
  });

  hooks.renderTimeline();
  assert.match(
    hooks.els.timeline.innerHTML,
    /data-delete-session/,
    "renderTimeline should include data-delete-session delete buttons (regression: cards had no delete button)"
  );

  hooks.els.quoteTypeChips.querySelector = () => ({ dataset: { quoteType: "all" } });
  hooks.renderQuotes();
  assert.match(
    hooks.els.quotesList.innerHTML,
    /data-delete-quote/,
    "renderQuotes should include data-delete-quote delete buttons (regression: cards had no delete button)"
  );
});

test("quote detail go-to-chat routes through switchChatToQuote", () => {
  const hooks = createAppHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setAuthToken("tok");
  hooks.setState({
    books: [{ id: "book-1", title: "书", author: "A", tags: [], status: "reading" }],
    sessions: [],
    quotes: [{ id: "quote-1", bookId: "book-1", content: "一段摘抄", kind: "quote", page: 42, tags: [] }],
    chatHistories: {},
    chatContexts: {},
    connections: [],
  });

  let routed = null;
  hooks.setSwitchChatToQuote((bookId, quoteId) => {
    routed = { bookId, quoteId };
  });
  hooks.getEl("#quoteDetailDialog").open = true;

  hooks.goToQuoteChat("quote-1");

  assert.deepEqual(
    routed,
    { bookId: "book-1", quoteId: "quote-1" },
    "quote detail chat entry should route with the quote's owning book and quote id"
  );
  assert.equal(hooks.getEl("#quoteDetailDialog").open, false, "quote detail dialog should close before entering chat");
});

test("P1-003 regression: deleteSession and deleteQuote use showConfirmDialog, not window.confirm", () => {
  const hooks = createAppHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setAuthToken("tok");
  hooks.setState({
    books: [],
    sessions: [{ id: "s1", bookId: "b1", date: "2026-05-01", minutes: 30, currentPage: 0, notes: "" }],
    quotes:   [{ id: "q1", bookId: "b1", text: "摘抄", chapter: "", createdAt: "2026-05-01T00:00:00.000Z" }],
    chatHistories: {},
  });

  hooks.deleteSession("s1");
  assert.equal(
    hooks.isConfirmCalled(),
    false,
    "deleteSession must not call window.confirm (regression: used native confirm)"
  );
  assert.equal(
    hooks.els.confirmDialog.open,
    true,
    "deleteSession should open #confirmDialog"
  );

  // Reset dialog state for next assertion
  hooks.els.confirmDialog.open = false;

  hooks.deleteQuote("q1");
  assert.equal(
    hooks.isConfirmCalled(),
    false,
    "deleteQuote must not call window.confirm (regression: used native confirm)"
  );
  assert.equal(
    hooks.els.confirmDialog.open,
    true,
    "deleteQuote should open #confirmDialog"
  );
});

test("P1-004 regression: withSavingState disables button and restores label after async operation", async () => {
  const hooks = createAppHarness();

  const btn = makeAppEl("button");
  btn.textContent = "保存";
  btn.disabled = false;

  let capturedDisabled;
  let capturedLabel;

  await hooks.withSavingState(btn, "保存中…", async () => {
    capturedDisabled = btn.disabled;
    capturedLabel    = btn.textContent;
  });

  assert.equal(capturedDisabled, true,    "button must be disabled during save (regression: no loading state)");
  assert.equal(capturedLabel,    "保存中…", "button must show loading label during save");
  assert.equal(btn.disabled,     false,   "button must be re-enabled after save");
  assert.equal(btn.textContent,  "保存",   "button label must be restored after save");
});

test("P1-005 regression: 401 response shows toast and clears auth state", async () => {
  const toasts = [];

  const hooks = createAppHarness({
    fetch: async () => ({
      ok: false,
      status: 401,
      headers: { get() { return "application/json"; } },
      json: async () => ({ error: "Unauthorized" }),
    }),
  });

  hooks.setCurrentUser({ id: "u1" });
  hooks.setAuthToken("valid-token");
  hooks.setShowToast((msg) => toasts.push(msg));

  try {
    await hooks.apiFetch("/api/user-state");
  } catch (_) {
    // Expected — apiFetch throws after 401
  }

  assert.ok(
    toasts.some((m) => m.includes("登录已过期")),
    "should show '登录已过期' toast on 401 (regression: 401 was silent, no user feedback)"
  );
});

test("P0 rate-limit: apiFetch surfaces the server's friendly message and tags err.code='rate_limited' on 429", async () => {
  const hooks = createAppHarness({
    fetch: async () => ({
      ok: false,
      status: 429,
      headers: { get() { return "application/json"; } },
      json: async () => ({
        error: "rate_limited",
        reason: "hour_limit",
        retry_after_seconds: 480,
        usage: { hour_count: 30, hour_limit: 30, day_count: 70, day_limit: 120 },
        message: "你已达到本小时的使用上限，稍后再试。",
      }),
    }),
  });
  hooks.setAuthToken("valid-token");

  let caught = null;
  try {
    await hooks.apiFetch("/api/chat", { method: "POST", body: "{}" });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "apiFetch should throw on 429");
  assert.equal(caught.message, "你已达到本小时的使用上限，稍后再试。",
    "should surface the friendly server message, not the raw 'rate_limited' code");
  assert.equal(caught.code, "rate_limited", "error must be tagged so UI can branch on it");
  assert.equal(caught.retryAfter, 480, "retry_after_seconds must propagate");
});

test("P0 rate-limit: styles.css defines .chat-rate-limited with warning amber palette", () => {
  assert.match(styles, /\.chat-rate-limited\s*\{[^}]*background:\s*#fef3c7/,
    "chat-rate-limited should use amber/warning background (#fef3c7), distinct from red error");
  assert.match(styles, /\.chat-rate-limited\s*\{[^}]*color:\s*#92400e/,
    "chat-rate-limited should use amber/warning text color");
});

test("P0 session-expiry: backend exposes SESSION_LIFETIME_DAYS, expiry check, and /api/logout-all", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /SESSION_LIFETIME_DAYS\s*=/, "must define SESSION_LIFETIME_DAYS constant");
  assert.match(src, /SESSION_LIFETIME_DAYS\s*\*\s*86400/,
    "resolve_user_from_token must check (now - last_seen_at) against SESSION_LIFETIME_DAYS*86400");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/logout-all"/,
    "must expose /api/logout-all endpoint");
  assert.match(src, /def gc_expired_sessions/,
    "must expose gc_expired_sessions helper");
});

test("P0 session-expiry: frontend wires #logoutAllBtn to logoutAllDevices via showConfirmDialog", () => {
  assert.match(indexHtml, /id="logoutAllBtn"/, "index.html must include #logoutAllBtn button");
  assert.match(appSource, /function logoutAllDevices/,
    "app.js must define logoutAllDevices");
  assert.match(appSource, /logoutAllDevices[\s\S]{0,400}showConfirmDialog/,
    "logoutAllDevices must require confirmation before revoking sessions");
  assert.match(appSource, /\/api\/logout-all/,
    "logoutAllDevices must call /api/logout-all");
});

test("P2 Stripe billing: backend defines payments table, 3 endpoints, idempotent webhook with HMAC verification", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /CREATE TABLE IF NOT EXISTS payments/,
    "init_db must create payments table");
  assert.match(src, /idx_payments_event_unique/,
    "payments must have unique event_id index for webhook idempotency");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/billing\/checkout"/,
    "must expose POST /api/billing/checkout");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/billing\/webhook"/,
    "must expose POST /api/billing/webhook");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/billing\/cancel"/,
    "must expose POST /api/billing/cancel");
  assert.match(src, /def verify_stripe_webhook_signature/,
    "must define HMAC signature verifier");
  assert.match(src, /hmac\.compare_digest/,
    "signature verification must use hmac.compare_digest (constant-time)");
  assert.match(src, /def apply_billing_event/,
    "must define event dispatcher");
  // Event types we handle
  for (const evt of [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ]) {
    assert.match(src, new RegExp(evt.replace(/\./g, "\\.")),
      `webhook must handle ${evt}`);
  }
});

test("P2 Stripe billing: frontend wires #planUpgradeBtn to startUpgradeFlow which fetches /api/billing/checkout", () => {
  assert.match(appSource, /async function startUpgradeFlow/,
    "app.js must define startUpgradeFlow");
  assert.match(appSource, /\/api\/billing\/checkout/,
    "startUpgradeFlow must call /api/billing/checkout");
  assert.match(appSource, /function maybeShowPlusReturnToast/,
    "must handle the post-checkout #plus-success / #plus-canceled redirect");
});

test("P2 plan tiers: backend defines PLAN_LIMITS dict with free/plus, plan-aware _rate_limit_for, and /api/account/plan endpoint", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /PLAN_LIMITS\s*=\s*\{/, "must define PLAN_LIMITS dict");
  assert.match(src, /"free"[\s\S]{0,300}"book_cap"/, "PLAN_LIMITS must include book_cap for free");
  assert.match(src, /"plus"[\s\S]{0,300}"endpoints"/, "PLAN_LIMITS must include plus endpoints config");
  assert.match(src, /def _rate_limit_for\(endpoint:[^,]+,\s*plan/,
    "_rate_limit_for must accept a plan parameter");
  assert.match(src, /def _resolve_user_plan/,
    "must define _resolve_user_plan helper");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/account\/plan"/,
    "must expose /api/account/plan endpoint");
  assert.match(src, /book_cap[\s\S]{0,500}免费版书架上限/,
    "agent add_book action must enforce book_cap with localized error");
});

test("P2 plan tiers: frontend has #planSummary container and loadPlanInfo() function wired to drawer open", () => {
  assert.match(indexHtml, /id="planSummary"/, "index.html must include #planSummary");
  assert.match(appSource, /async function loadPlanInfo/,
    "app.js must define loadPlanInfo");
  assert.match(appSource, /function openMeDrawer[\s\S]{0,150}loadPlanInfo\(\)/,
    "openMeDrawer must trigger loadPlanInfo");
  assert.match(styles, /\.plan-badge--free\s*\{/,
    "styles.css must define .plan-badge--free style");
  assert.match(styles, /\.plan-badge--plus\s*\{/,
    "styles.css must define .plan-badge--plus style");
  assert.match(appSource, /plan-badge plan-badge--\$\{info\.plan\}/,
    "loadPlanInfo must render the plan badge with the current plan modifier");
});

test("P1 password reset: backend defines password_reset_tokens table, endpoints, and SMTP fallback to console log", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /CREATE TABLE IF NOT EXISTS password_reset_tokens/,
    "init_db must create password_reset_tokens table");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/password\/reset-request"/,
    "must expose /api/password/reset-request endpoint");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/password\/reset"/,
    "must expose /api/password/reset endpoint");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/account\/email"/,
    "must expose /api/account/email endpoint");
  assert.match(src, /def send_email_via_smtp/,
    "must define SMTP helper");
  assert.match(src, /smtp_not_configured/,
    "SMTP helper must return graceful fallback when not configured");
  // Generic OK message must be returned even for unknown identifiers (no enumeration)
  assert.match(src, /generic_ok\s*=\s*\{/,
    "reset-request must use a generic_ok pattern to prevent enumeration");
  // Reset must invalidate all sessions for the user
  assert.match(src, /DELETE FROM sessions WHERE user_id\s*=\s*\?[\s\S]{0,200}\)\s*$/m,
    "reset endpoint must DELETE all sessions for the user (force re-login)");
});

test("P1 password reset: frontend has forgot/reset dialogs, hash deep-link, and email field in register form", () => {
  assert.match(indexHtml, /id="forgotPasswordDialog"/,
    "index.html must include #forgotPasswordDialog");
  assert.match(indexHtml, /id="resetPasswordDialog"/,
    "index.html must include #resetPasswordDialog");
  assert.match(indexHtml, /name="email"[^>]*type="email"/,
    "register form must include optional email field");
  assert.match(indexHtml, /id="forgotPasswordBtn"/,
    "login form must include #forgotPasswordBtn");
  assert.match(appSource, /function maybeOpenResetPasswordDialog/,
    "app.js must define maybeOpenResetPasswordDialog to handle #reset-password=<token> deep link");
  assert.match(appSource, /\/api\/password\/reset-request/,
    "app.js must call /api/password/reset-request");
  assert.match(appSource, /\/api\/password\/reset[^-]/,
    "app.js must call /api/password/reset");
});

test("P1 server-error monitoring: backend defines server_errors table, log_server_error helper, and /debug/errors viewer", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /CREATE TABLE IF NOT EXISTS server_errors/,
    "init_db must create server_errors table");
  assert.match(src, /def log_server_error\(/,
    "must expose log_server_error helper");
  assert.match(src, /def handle_one_request\(self\)/,
    "Handler must override handle_one_request to catch unhandled exceptions");
  assert.match(src, /parsed\.path\s*==\s*"\/debug\/errors"/,
    "must expose /debug/errors viewer page");
  assert.match(src, /_authorized_for_admin/,
    "/debug/errors must be admin-gated");
});

test("P1 ToS consent: register form has required termsAccepted checkbox linking to /terms.html and /privacy.html", () => {
  assert.match(indexHtml, /name="termsAccepted"[^>]*required/,
    "register form must include a required termsAccepted checkbox");
  assert.match(indexHtml, /href="\/terms\.html"/,
    "register form must link to /terms.html");
  assert.match(indexHtml, /href="\/privacy\.html"/,
    "register form must link to /privacy.html");
  assert.match(appSource, /termsAccepted/,
    "app.js handleRegister must validate and forward termsAccepted");
});

test("P1 ToS consent: terms checkbox must override global input width:100% so it renders as a checkbox not a text field", () => {
  // Regression for bug where the global `input { width: 100%; padding;
  // appearance: none }` rule turned the disclaimer checkbox into a full-width
  // empty box and forced the span to wrap one character per line.
  const block = styles.match(/\.terms-check input\[type="checkbox"\]\s*\{[^}]+\}/);
  assert.ok(block, "must define .terms-check input[type='checkbox'] override block");
  const decls = block[0];
  assert.match(decls, /width:\s*\d+px/,
    "checkbox must have a fixed pixel width to defeat the global input { width: 100% }");
  assert.match(decls, /padding:\s*0/,
    "checkbox must clear the global input padding so it doesn't render tall");
  assert.match(decls, /-webkit-appearance:\s*checkbox/,
    "checkbox must restore the native checkbox appearance after the global `appearance: none`");
  // The span next to it must not inherit the bold label-span styling.
  assert.match(styles, /\.terms-check span\s*\{[^}]*font-weight:\s*400/,
    ".terms-check span must override the global `label span { font-weight: 700 }` so the disclaimer reads like body copy");
});

test("P1 ToS consent: legal pages exist and reference the product", () => {
  const root = path.join(__dirname, "..", "..");
  for (const name of ["privacy.html", "terms.html"]) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    assert.match(html, /又买了一本书/, `${name} should mention the product name`);
    assert.match(html, /<h1/, `${name} should have an h1`);
  }
});

test("P2 landing: /landing.html has hero, 4 feature showcases, CTAs and legal links", () => {
  const root = path.join(__dirname, "..", "..");
  const html = fs.readFileSync(path.join(root, "landing.html"), "utf8");
  assert.match(html, /<h1[^>]*class="hero-title"/, "landing must have hero h1");
  assert.match(html, /免费开始/, "landing must include 免费开始 CTA");
  assert.match(html, /id="features"/, "landing must include features anchor");
  // Four showcase eyebrows must all appear in order (feature panels)
  for (const label of ["纸质书优先", "一拍即存的摘抄", "与 AI 共读", "跨书关联"]) {
    assert.match(html, new RegExp(`showcase-eyebrow[^>]*>${label}<`),
      `landing must include showcase for ${label}`);
  }
  // Real-content evidence (sourced from the Huangnanxi account)
  assert.match(html, /《月亮虎》/, "quote showcase must reference 《月亮虎》");
  assert.match(html, /《你的脚比头年轻》/,
    "connection showcase must reference 《你的脚比头年轻》");
  assert.match(html, /quote-moontiger\.jpeg/,
    "quote showcase must reference the real photo asset");
  assert.match(html, /href="\/terms\.html"/, "landing must link to /terms.html");
  assert.match(html, /href="\/privacy\.html"/, "landing must link to /privacy.html");
  assert.match(html, /href="\/app#signup"/,
    "免费开始 CTA must deep-link to /app#signup");
  assert.match(html, /<meta name="description"/, "landing must have meta description for SEO");
  // Already-logged-in visitors must be redirected away from marketing
  assert.match(html, /paper-reading-auth-token-v1/,
    "landing must contain auth-redirect script (checks localStorage)");
  assert.match(html, /location\.replace\("\/app"\)/,
    "landing must redirect signed-in visitors to /app via location.replace");
});

test("P2 landing: quote photo asset exists and is reasonably small for fast load", () => {
  const root = path.join(__dirname, "..", "..");
  const photoPath = path.join(root, "assets", "landing", "quote-moontiger.jpeg");
  const stat = fs.statSync(photoPath);
  assert.ok(stat.isFile(), "assets/landing/quote-moontiger.jpeg must exist");
  assert.ok(stat.size < 350_000,
    `quote photo should be < 350KB for fast landing load, got ${stat.size}`);
});

test("Landing routing: / serves landing, /app + /index.html serve the SPA shell", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /"\/":\s*\("landing\.html"/,
    "backend _STATIC must map / → landing.html");
  assert.match(src, /"\/app":\s*\("index\.html"/,
    "backend _STATIC must map /app → index.html");
  assert.match(src, /"\/index\.html":\s*\("index\.html"/,
    "backend _STATIC must keep /index.html → index.html for legacy PWA installs");
});

test("Landing auth deep-links: app.js opens drawer on #signup (register tab) AND #login (login tab)", () => {
  assert.match(appSource, /function maybeHandleSignupIntent/,
    "app.js must define maybeHandleSignupIntent");
  assert.match(appSource, /function switchAuthTab/,
    "app.js must define switchAuthTab");
  assert.match(appSource, /location\.hash\s*===?\s*"#signup"[\s\S]{0,80}targetTab\s*=\s*"register"/,
    "must map #signup → register tab");
  assert.match(appSource, /location\.hash\s*===?\s*"#login"[\s\S]{0,80}targetTab\s*=\s*"login"/,
    "must map #login → login tab");
  // loadSession must trigger the intent at the end of the unauthenticated branch
  assert.match(appSource, /async function loadSession[\s\S]{0,400}maybeHandleSignupIntent\(\)/,
    "loadSession must call maybeHandleSignupIntent after determining auth state");
});

test("Landing footer 「登录」 links must deep-link to /app#login (not /app)", () => {
  const root = path.join(__dirname, "..", "..");
  const html = fs.readFileSync(path.join(root, "landing.html"), "utf8");
  // /app#login must appear in both nav and footer
  const matches = html.match(/href="\/app#login"/g) || [];
  assert.ok(matches.length >= 2,
    `landing must have at least 2 /app#login links (nav + footer), found ${matches.length}`);
});

test("Me drawer actions list: each row has descriptive title + helper text", () => {
  // Regression for user feedback that the old flex-of-buttons didn't tell
  // users what each action does (导出数据 vs 完整账号导出, 导入数据 vs Excel).
  assert.match(indexHtml, /class="me-action-list"/,
    "me drawer must use the new descriptive list layout");
  for (const label of [
    "退出所有设备", "导出书单备份", "完整账号导出",
    "导入数据", "从 Excel 批量加书", "注销账号",
  ]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Title may carry a trailing qualifier in parens (e.g. "完整账号导出（GDPR/PIPL 合规）")
    assert.match(indexHtml, new RegExp(`me-action-title[^>]*>${escaped}`),
      `me drawer must have an action titled ${label}`);
  }
  // Helper text must appear for the 3 actions users specifically asked about
  for (const hint of [
    /撤销.*?所有.*?登录会话/,
    /JSON 文件[\s\S]{0,200}书单/,
    /AI 调用日志/,
    /\.json.*?恢复/,
    /\.xlsx.*?批量添加/,
  ]) {
    assert.match(indexHtml, hint,
      `helper text must explain action format/purpose: ${hint}`);
  }
});

test("Admin-only sections hidden until body.is-admin is set by dispatchUserChange", () => {
  // Regression: regular users seeing 模型日志 panel (developer-only telemetry).
  assert.match(indexHtml, /class="subpanel logs-collapsible admin-only"/,
    "model logs panel must be marked admin-only");
  assert.match(styles, /\.admin-only\s*\{\s*display:\s*none/,
    "styles.css must hide .admin-only by default");
  assert.match(styles, /body\.is-admin\s+\.admin-only/,
    "styles.css must reveal .admin-only when body.is-admin is set");
  assert.match(appSource, /classList\.toggle\("is-admin",\s*currentUser\?\.is_admin\s*===\s*true\)/,
    "dispatchUserChange must flip body.is-admin based on currentUser.is_admin");
});

test("Backend session/login/register responses include user.is_admin field", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /def is_admin_username/,
    "must define is_admin_username helper");
  assert.match(src, /ADMIN_USERNAMES\s*=\s*os\.getenv/,
    "must read ADMIN_USERNAMES from env");
  // All three user-returning endpoints must include is_admin
  assert.match(src, /user_dict\["is_admin"\]\s*=\s*is_admin_username/,
    "/api/session and /api/register must set is_admin via helper");
  assert.match(src, /"is_admin":\s*is_admin_username\(row\["username"\]\)/,
    "/api/login response must include is_admin");
});

test("Legal pages must scroll on mobile (override the SPA's overflow: hidden global rule)", () => {
  const root = path.join(__dirname, "..", "..");
  for (const name of ["privacy.html", "terms.html"]) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    // The override must use !important to win against styles.css's @media block.
    assert.match(html, /html,\s*body\s*\{\s*overflow:\s*auto\s*!important/,
      `${name} must explicitly override the SPA's overflow:hidden so users can scroll`);
    assert.match(html, /height:\s*auto\s*!important/,
      `${name} must reset the SPA's height:100vh so content can grow naturally`);
  }
});

test("P2 landing: auth panel includes 了解这是什么 link pointing to /landing.html", () => {
  assert.match(indexHtml, /href="\/landing\.html"/,
    "index.html must include link to /landing.html (auth panel CTA)");
  assert.match(indexHtml, /auth-landing-link/,
    "must use .auth-landing-link CSS class");
});

test("P0 account-export: backend exposes GET /api/account/export with full payload + Content-Disposition", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/account\/export"/,
    "must expose GET /api/account/export");
  assert.match(src, /Content-Disposition[\s\S]{0,80}attachment/,
    "export must set Content-Disposition: attachment header");
  assert.match(src, /"modelLogs"[\s\S]{0,40}logs/,
    "export must include modelLogs in payload");
  assert.match(src, /"uploadedFiles"/,
    "export must include uploadedFiles manifest");
});

test("P0 account-delete: backend DELETE /api/account requires confirmUsername and purges all user tables", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /parsed\.path\s*==\s*"\/api\/account"/,
    "must expose /api/account endpoint");
  assert.match(src, /confirmUsername[\s\S]{0,200}!=\s*user\["username"\]/,
    "must require confirmUsername to match current username");
  const tables = ["users", "sessions", "user_state", "model_logs",
                  "agent_traces", "agent_actions", "agent_trace_events",
                  "agent_metrics", "rate_limit_counters"];
  for (const tbl of tables) {
    const re = new RegExp(`DELETE FROM ${tbl}\\b`);
    assert.match(src, re, `account deletion must DELETE FROM ${tbl}`);
  }
  assert.match(src, /shutil\.rmtree\(user_uploads/,
    "must remove user's uploads directory");
});

test("P0 account-delete: frontend wires #deleteAccountBtn and requires double confirmation", () => {
  assert.match(indexHtml, /id="deleteAccountBtn"/,
    "must include #deleteAccountBtn button");
  assert.match(indexHtml, /id="exportAccountBtn"/,
    "must include #exportAccountBtn button");
  assert.match(appSource, /function deleteAccount/,
    "app.js must define deleteAccount");
  assert.match(appSource, /deleteAccount[\s\S]{0,800}window\.prompt/,
    "deleteAccount must require a second confirmation via prompt");
  assert.match(appSource, /\/api\/account[\s\S]{0,200}method:\s*"DELETE"/,
    "deleteAccount must hit DELETE /api/account");
});

test("P0 rate-limit: backend RATE_LIMITS config exists and chat/ocr endpoints are gated", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "app_server.py"), "utf8");
  assert.match(src, /RATE_LIMITS\s*=\s*\{/, "app_server.py must define RATE_LIMITS dict");
  assert.match(src, /"chat":\s*\{[^}]*"hour":/, "RATE_LIMITS must include chat config");
  assert.match(src, /"ocr":\s*\{[^}]*"hour":/, "RATE_LIMITS must include ocr config");
  // All four AI endpoints must invoke _enforce_rate_limit
  const chatGated = (src.match(/_enforce_rate_limit\(conn,\s*user\["id"\],\s*"chat"\)/g) || []).length;
  const ocrGated = (src.match(/_enforce_rate_limit\(conn,\s*user\["id"\],\s*"ocr"\)/g) || []).length;
  assert.ok(chatGated >= 2, `chat endpoints (chat + chat/stream) should both be gated; found ${chatGated}`);
  assert.ok(ocrGated >= 2, `ocr endpoints (ocr + quotes/ocr) should both be gated; found ${ocrGated}`);
});

test("book detail shows one core question while quote wall excludes questions", () => {
  const hooks = createAppHarness();
  hooks.setCurrentUser({ id: "u1", name: "Test" });
  hooks.setState({
    books: [{ id: "b1", title: "书", author: "A", tags: [], status: "reading",
              currentPage: 10, totalPages: 200, notes: "", coverImageUrl: "",
              createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    sessions: [],
    quotes: [
      { id: "q1", bookId: "b1", content: "普通摘抄", kind: "quote", page: 1, tags: [], createdAt: "2026-05-01T00:00:00.000Z" },
      { id: "question-1", bookId: "b1", content: "这本书最值得继续追问什么？", kind: "question", tags: ["问题"], createdAt: "2026-05-02T00:00:00.000Z" },
    ],
    chatHistories: {},
    connections: [],
  });

  hooks.openBookDetailDialog("b1");
  assert.equal(hooks.getEl("#bookDetailQuestion").textContent, "这本书最值得继续追问什么？");
  assert.equal(hooks.getEl("#bookDetailQuestionWrap").classList.contains("is-hidden"), false);

  hooks.els.quoteTypeChips.querySelector = () => ({ dataset: { quoteType: "all" } });
  hooks.renderQuotes();
  assert.match(hooks.els.quotesList.innerHTML, /普通摘抄/);
  assert.doesNotMatch(hooks.els.quotesList.innerHTML, /这本书最值得继续追问什么？/);
});

test("quote detail can enter quote-scoped chat context", () => {
  assert.match(indexHtml, /id="quoteDetailChatBtn"[^>]*>去聊</, "quote detail should expose a chat entry button");
  assert.match(appSource, /function goToQuoteChat\(quoteId\)/, "app should route quote detail to chat");
  assert.match(appSource, /switchChatToQuote\?\.\(quote\.bookId,\s*quote\.id\)/, "quote chat entry should pass both bookId and quoteId");
  assert.match(chatSource, /type:\s*"quote"/, "chat context should carry quote scope as structured context");
  assert.match(chatSource, /body:\s*JSON\.stringify\(\{\s*context,/, "chat request should send structured context");
  assert.match(appSource, /chatContextHistoryKey\(context\)/, "quote-scoped chat history should use context-derived keys");
});

// ── Feature: Markdown rendering + copy button ──────────────────────────────

test("feat: chat.js exposes renderMiniMarkdown, applyMdInline, finalizeAssistantBubble", () => {
  assert.match(chatSource, /function renderMiniMarkdown\(raw\)/, "renderMiniMarkdown should be defined");
  assert.match(chatSource, /function applyMdInline\(text\)/, "applyMdInline should be defined");
  assert.match(chatSource, /function finalizeAssistantBubble\(bubble, text, userText\)/, "finalizeAssistantBubble should be defined");
  assert.match(chatSource, /finalizeAssistantBubble\(thinking, finalPayload\.reply, text\)/, "stream completion should finalize with markdown and pass userText");
  assert.match(indexHtml, /id="chatQuotePin"/, "index.html should include quote pin element");
  assert.match(chatSource, /els\.quotePin/, "chat.js should reference quotePin element");
});

test("feat: assistant bubble after streaming has .chat-bubble-content and action buttons", async () => {
  const markdownReply = "**加粗文字**\n\n普通段落";
  const harness = createChatHarness({
    fetch: async () => makeSseResponse([{
      done: true,
      reply: markdownReply,
      history: [
        { role: "user", content: "问题" },
        { role: "assistant", content: markdownReply },
      ],
      actions: [],
      context: { type: "book", bookId: "book-1" },
    }]),
  });
  harness.bookSel.value = "book-1";
  harness.input.value = "问题";
  await harness.sendBtn.dispatch("click");

  const assistantBubble = harness.messages.children.find(
    (c) => (c.className || "").includes("chat-bubble-assistant")
  );
  assert.ok(assistantBubble, "assistant bubble should be appended");

  const contentEl = assistantBubble.querySelector(".chat-bubble-content");
  assert.ok(contentEl, "assistant bubble should have .chat-bubble-content child");
  assert.ok(contentEl.innerHTML.includes("<strong>"), ".chat-bubble-content should render **bold** as <strong>");
  assert.ok(!contentEl.innerHTML.includes("**"), "raw ** markers should not appear in rendered output");

  // Actions bar is a sibling after the bubble, not inside it
  const actionsBar = harness.messages.children.find(
    (c) => (c.className || "").includes("chat-bubble-actions")
  );
  assert.ok(actionsBar, "messages container should have a .chat-bubble-actions sibling after the bubble");

  const copyBtn = actionsBar.children.find((c) => (c.className || "").includes("chat-action-btn") && (c.title || "") === "复制");
  assert.ok(copyBtn, "actions bar should contain a copy button with title '复制'");

  const retryBtn = actionsBar.children.find((c) => (c.className || "").includes("chat-action-btn") && (c.title || "") === "重试");
  assert.ok(retryBtn, "actions bar should contain a retry button with title '重试'");
});

test("feat: appendBubble with existing assistant text (history restore) also uses markdown", async () => {
  const mdContent = "## 章节标题\n- 要点一\n- 要点二";
  const harness = createChatHarness({
    fetch: async () => makeSseResponse([{
      done: true,
      reply: "ok",
      history: [
        { role: "user", content: "回顾" },
        { role: "assistant", content: mdContent },
      ],
      actions: [],
      context: { type: "book", bookId: "book-1" },
    }]),
  });
  harness.appState.chatHistories["book:book-1"] = [
    { role: "user", content: "回顾" },
    { role: "assistant", content: mdContent },
  ];
  harness.bookSel.value = "book-1";
  // Trigger restoreHistory by changing book select
  harness.bookSel.dispatch("change");

  const assistantBubble = harness.messages.children.find(
    (c) => (c.className || "").includes("chat-bubble-assistant")
  );
  assert.ok(assistantBubble, "restored assistant bubble should exist");
  const contentEl = assistantBubble.querySelector(".chat-bubble-content");
  assert.ok(contentEl, "restored bubble should have .chat-bubble-content");
  assert.ok(contentEl.innerHTML.includes("<h2>"), "## header should render as <h2>");
  assert.ok(contentEl.innerHTML.includes("<ul>"), "bullet list should render as <ul>");
});

// ── Feature: Quote pin card ────────────────────────────────────────────────

test("feat: quote pin shows when in quote context and hides when in book context", () => {
  // content must be > 40 chars to trigger the expand toggle (36 × 2 = 72 chars)
  const quoteContent = "这是一条比较长的摘抄内容，用来测试引用卡片是否会在摘抄上下文中正确显示。".repeat(2);
  const harness = createChatHarness();
  harness.appState.books = [{ id: "book-1", title: "测试书", author: "A", tags: [], notes: "" }];
  harness.appState.quotes = [
    { id: "q-1", bookId: "book-1", content: quoteContent, kind: "quote", page: 5, tags: [] },
  ];

  const quotePin = harness.getEl("#chatQuotePin");
  const quotePinText = harness.getEl("#chatQuotePinText");
  const quotePinToggle = harness.getEl("#chatQuotePinToggle");

  // Switch to quote context
  harness.paperReadingApp.switchChatToQuote("book-1", "q-1");

  assert.equal(quotePin.hidden, false, "quote pin should be visible in quote context");
  assert.equal(quotePinText.textContent, quoteContent, "quote pin text should show full quote content");
  assert.equal(quotePinToggle.hidden, false, "toggle button should be visible for long quote");

  // Switch back to book context
  harness.paperReadingApp.switchChatToBook("book-1");

  assert.equal(quotePin.hidden, true, "quote pin should be hidden in book context");
});

test("feat: short quote hides the expand toggle on the pin card", () => {
  const shortContent = "短摘抄";
  const harness = createChatHarness();
  harness.appState.books = [{ id: "book-1", title: "书", author: "", tags: [], notes: "" }];
  harness.appState.quotes = [
    { id: "q-short", bookId: "book-1", content: shortContent, kind: "quote", page: 1, tags: [] },
  ];

  harness.paperReadingApp.switchChatToQuote("book-1", "q-short");

  const quotePinToggle = harness.getEl("#chatQuotePinToggle");
  assert.equal(quotePinToggle.hidden, true, "expand toggle should be hidden for short quotes (≤40 chars)");
});

test("scroll-to-bottom button row: CSS [hidden] override prevents display:flex from showing hidden element", () => {
  // .chat-scroll-btn-row sets display:flex which overrides the UA [hidden]{display:none} rule.
  // Without an explicit [hidden] override at higher specificity, the button shows permanently.
  assert.match(
    styles,
    /\.chat-scroll-btn-row\[hidden\]\s*\{[^}]*display\s*:\s*none/,
    ".chat-scroll-btn-row[hidden] must explicitly set display:none to override the display:flex rule"
  );
});

test("scroll-to-bottom button is hidden when resetMessages is called via clearHistory", async () => {
  const harness = createChatHarness();

  // Simulate the button being visible (user had scrolled up mid-conversation)
  const scrollBtnRow = harness.getEl("#chatScrollBtnRow");
  scrollBtnRow.hidden = false;

  // Trigger clearHistory — the confirm handler calls resetMessages()
  harness.clearBtn.dispatch("click");

  assert.equal(harness.getShowConfirmCalls().length, 1, "clear dialog should appear");
  await harness.getShowConfirmCalls()[0].onConfirm();

  assert.equal(
    scrollBtnRow.hidden,
    true,
    "scroll-to-bottom button row must be hidden after resetMessages (regression: button stayed visible after clearing chat)"
  );
});

test("PWA version check: index.html guard script matches BUILD_VERSION in app_server.py", () => {
  const appServerSource = fs.readFileSync(
    path.join(__dirname, "..", "..", "app_server.py"),
    "utf8"
  );

  assert.match(
    indexHtml,
    /CLIENT_VERSION\s*=/,
    "index.html should declare CLIENT_VERSION for PWA cache-busting"
  );
  assert.match(
    indexHtml,
    /\/api\/build-version/,
    "index.html version guard should fetch /api/build-version"
  );
  assert.match(
    indexHtml,
    /location\.reload\(true\)/,
    "index.html version guard should call location.reload(true) on version mismatch"
  );

  const clientVersionMatch = indexHtml.match(/CLIENT_VERSION\s*=\s*["']([^"']+)["']/);
  assert.ok(clientVersionMatch, "CLIENT_VERSION should be a string literal in index.html");

  const serverVersionMatch = appServerSource.match(/BUILD_VERSION\s*=\s*["']([^"']+)["']/);
  assert.ok(serverVersionMatch, "BUILD_VERSION should be declared in app_server.py");

  assert.equal(
    clientVersionMatch[1],
    serverVersionMatch[1],
    "CLIENT_VERSION in index.html must match BUILD_VERSION in app_server.py (mismatch causes infinite PWA reload loop)"
  );

  assert.match(
    appServerSource,
    /\/api\/build-version/,
    "app_server.py should handle /api/build-version GET route"
  );
});
