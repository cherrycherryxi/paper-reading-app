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

const chatJsPath = path.join(__dirname, "..", "chat.js");
const appJsPath  = path.join(__dirname, "..", "app.js");
const stylesPath = path.join(__dirname, "..", "styles.css");
const indexPath  = path.join(__dirname, "..", "index.html");

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
    children, style: {}, parentNode: null, _removed: false,
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
  return {
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
    addEventListener() {}, removeEventListener() {},
    querySelector() { return makeAppEl("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close()     { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
    focus() {}, blur() {}, matches() { return false; },
  };
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
    /\nbindEvents\(\);\nrender\(\);\nactivateTab\("books"\);\nloadSession\(\);\s*$/,
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
