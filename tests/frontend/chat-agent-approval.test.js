const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const chatJsPath = path.join(__dirname, "..", "..", "chat.js");
const chatSource = fs.readFileSync(chatJsPath, "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const children = [];
  const listeners = new Map();
  const classSet = new Set();

  const element = {
    tagName: tagName.toUpperCase(),
    value: "",
    disabled: false,
    textContent: "",
    scrollTop: 0,
    scrollHeight: 0,
    children,
    style: {},
    parentNode: null,
    _removed: false,
    classList: {
      add(...names) {
        names.forEach((name) => classSet.add(name));
      },
      remove(...names) {
        names.forEach((name) => classSet.delete(name));
      },
      contains(name) {
        return classSet.has(name);
      },
    },
    get innerHTML() {
      return innerHTML;
    },
    set innerHTML(value) {
      innerHTML = String(value);
      children.length = 0;
      if (innerHTML.includes("agent-confirm-btn")) {
        const confirmBtn = createElementStub("button");
        confirmBtn.className = "agent-confirm-btn button button-primary button-small";
        confirmBtn.textContent = "确认执行";
        confirmBtn.parentNode = element;
        children.push(confirmBtn);
      }
      if (innerHTML.includes("agent-cancel-btn")) {
        const cancelBtn = createElementStub("button");
        cancelBtn.className = "agent-cancel-btn button button-ghost button-small";
        cancelBtn.textContent = "忽略";
        cancelBtn.parentNode = element;
        children.push(cancelBtn);
      }
      if (innerHTML.includes("chat-welcome")) {
        const welcome = createElementStub("div");
        welcome.className = "chat-welcome";
        welcome.parentNode = element;
        children.push(welcome);
      }
    },
    appendChild(child) {
      child.parentNode = element;
      children.push(child);
      element.scrollHeight += 1;
      return child;
    },
    remove() {
      element._removed = true;
      if (element.parentNode) {
        const index = element.parentNode.children.indexOf(element);
        if (index >= 0) {
          element.parentNode.children.splice(index, 1);
        }
      }
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      if (handler) {
        return handler(event);
      }
      return undefined;
    },
    querySelector(selector) {
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        return children.find((child) => (child.className || "").split(/\s+/).includes(className)) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        return children.filter((child) => (child.className || "").split(/\s+/).includes(className));
      }
      return [];
    },
  };

  return element;
}

function createHarness(overrides = {}) {
  const elements = new Map();
  const toasts = [];
  const apiCalls = [];
  const dispatchedEvents = [];
  let remoteLogLoads = 0;

  function getElement(selector) {
    if (!elements.has(selector)) {
      const element = createElementStub("div");
      if (selector === "#chatMessages") {
        element.innerHTML = '<div class="chat-welcome">选择一本书，开始探讨。</div>';
      }
      elements.set(selector, element);
    }
    return elements.get(selector);
  }

  const document = {
    querySelector(selector) {
      return getElement(selector);
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return createElementStub(tagName);
    },
  };

  const appState = {
    books: [{ id: "book-1", title: "Test Book", author: "Author", tags: [], notes: "" }],
    quotes: [],
    sessions: [],
    chatHistories: {},
  };

  const defaultApiFetch = async (url, options) => {
    apiCalls.push({ url, options });
    if (url === "/api/chat") {
      return {
        reply: "assistant reply",
        history: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "assistant reply" },
        ],
        actions: [
          {
            id: "action-1",
            type: "tag",
            data: { tags: ["哲学"] },
            status: "PENDING_APPROVAL",
          },
        ],
      };
    }
    if (url === "/api/agent-actions/action-1/approve") {
      return {
        ok: true,
        action: { id: "action-1", status: "EXECUTED" },
        state: {
          ...appState,
          books: [{ ...appState.books[0], tags: ["哲学"] }],
        },
      };
    }
    if (url === "/api/agent-actions/action-1/reject") {
      return { ok: true, action: { id: "action-1", status: "REJECTED" } };
    }
    throw new Error(`Unhandled apiFetch: ${url}`);
  };

  const apiFetch = overrides.apiFetch || defaultApiFetch;
  const windowListeners = new Map();

  const window = {
    paperReadingApp: {
      requireAuth() {
        return true;
      },
      apiFetch,
      getState() {
        return appState;
      },
      setChatHistoryForBook(bookId, history) {
        appState.chatHistories[bookId || "__general__"] = history;
      },
      getChatHistoryForBook(bookId) {
        return appState.chatHistories[bookId || "__general__"] || [];
      },
      loadRemoteLogs: async () => {
        remoteLogLoads += 1;
      },
      getActiveChatBookId: () => "book-1",
      showToast(message) {
        toasts.push(message);
      },
      clearChatHistory: async () => {},
      getStateForTest: () => appState,
      ...overrides.paperReadingApp,
    },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) {
        windowListeners.set(type, []);
      }
      windowListeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event.type);
      for (const handler of windowListeners.get(event.type) || []) {
        handler(event);
      }
    },
    CustomEvent: function CustomEvent(type) {
      this.type = type;
    },
    confirm() {
      return true;
    },
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {},
  };

  const context = {
    console: overrides.console || console,
    document,
    window,
    CustomEvent: window.CustomEvent,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
  };

  vm.runInNewContext(chatSource, context, { filename: "chat.js" });

  const input = getElement("#chatInput");
  const sendBtn = getElement("#chatSendBtn");
  const messages = getElement("#chatMessages");
  const bookSelect = getElement("#chatBookSelect");
  bookSelect.value = "book-1";

  return {
    input,
    sendBtn,
    messages,
    bookSelect,
    apiCalls,
    toasts,
    dispatchedEvents,
    getRemoteLogLoads() {
      return remoteLogLoads;
    },
    getConfirmContainer() {
      return messages.children.find((child) => child.className === "agent-confirm") || null;
    },
    getAppState() {
      return appState;
    },
  };
}

test("e2e: approving an agent action calls backend execute endpoint and updates state", async () => {
  const harness = createHarness();
  harness.input.value = "hello";

  await harness.sendBtn.dispatch("click");

  const confirmContainer = harness.getConfirmContainer();
  assert.ok(confirmContainer, "expected confirm container");
  const confirmBtn = confirmContainer.querySelector(".agent-confirm-btn");
  assert.ok(confirmBtn);

  await confirmBtn.onclick();

  assert.deepEqual(
    harness.apiCalls.map((call) => call.url),
    ["/api/chat", "/api/agent-actions/action-1/approve"]
  );
  assert.deepEqual(harness.getAppState().books[0].tags, ["哲学"]);
  assert.ok(harness.toasts.includes("操作已执行"));
  assert.ok(harness.dispatchedEvents.includes("paper-reading-data-changed"));
  assert.equal(harness.getRemoteLogLoads(), 2);
});

test("e2e: approving add_book action preserves current associated book selection", async () => {
  const harness = createHarness({
    apiFetch: async (url, options) => {
      harness.apiCalls.push({ url, options });
      if (url === "/api/chat") {
        return {
          reply: "assistant reply",
          history: [],
          actions: [
            {
              id: "action-1",
              type: "add_book",
              data: { title: "New Book", author: "Writer" },
              status: "PENDING_APPROVAL",
            },
          ],
        };
      }
      if (url === "/api/agent-actions/action-1/approve") {
        return {
          ok: true,
          action: { id: "action-1", status: "EXECUTED" },
          state: {
            ...harness.getAppState(),
            books: [
              ...harness.getAppState().books,
              { id: "book-2", title: "New Book", author: "Writer", tags: [], notes: "" },
            ],
          },
        };
      }
      throw new Error(`Unhandled apiFetch: ${url}`);
    },
  });
  harness.input.value = "hello";

  await harness.sendBtn.dispatch("click");
  const confirmContainer = harness.getConfirmContainer();
  const confirmBtn = confirmContainer.querySelector(".agent-confirm-btn");
  await confirmBtn.onclick();

  assert.equal(harness.bookSelect.value, "book-1");
  assert.equal(harness.getAppState().books.length, 2);
});

test("e2e: paper-reading-data-changed event does not reset current associated book selection", async () => {
  const harness = createHarness({
    apiFetch: async (url, options) => {
      harness.apiCalls.push({ url, options });
      if (url === "/api/chat") {
        return {
          reply: "assistant reply",
          history: [],
          actions: [
            {
              id: "action-1",
              type: "add_book",
              data: { title: "New Book", author: "Writer" },
              status: "PENDING_APPROVAL",
            },
          ],
        };
      }
      if (url === "/api/agent-actions/action-1/approve") {
        return {
          ok: true,
          action: { id: "action-1", status: "EXECUTED" },
          state: {
            ...harness.getAppState(),
            books: [
              ...harness.getAppState().books,
              { id: "book-2", title: "New Book", author: "Writer", tags: [], notes: "" },
            ],
          },
        };
      }
      throw new Error(`Unhandled apiFetch: ${url}`);
    },
  });
  harness.input.value = "hello";

  await harness.sendBtn.dispatch("click");
  const confirmContainer = harness.getConfirmContainer();
  const confirmBtn = confirmContainer.querySelector(".agent-confirm-btn");
  await confirmBtn.onclick();

  assert.ok(harness.dispatchedEvents.includes("paper-reading-data-changed"));
  assert.equal(harness.bookSelect.value, "book-1");
});

test("e2e: rejecting an agent action calls backend reject endpoint and removes confirmation UI", async () => {
  const harness = createHarness();
  harness.input.value = "hello";

  await harness.sendBtn.dispatch("click");

  const confirmContainer = harness.getConfirmContainer();
  assert.ok(confirmContainer, "expected confirm container");
  const cancelBtn = confirmContainer.querySelector(".agent-cancel-btn");
  assert.ok(cancelBtn);

  await cancelBtn.onclick();

  assert.deepEqual(
    harness.apiCalls.map((call) => call.url),
    ["/api/chat", "/api/agent-actions/action-1/reject"]
  );
  assert.equal(harness.getConfirmContainer(), null);
});

test("e2e: execution failure is surfaced in the confirmation button state", async () => {
  const errors = [];
  const harness = createHarness({
    console: {
      ...console,
      error(...args) {
        errors.push(args.join(" "));
      },
    },
    apiFetch: async (url, options) => {
      harness?.apiCalls?.push?.({ url, options });
      if (url === "/api/chat") {
        return {
          reply: "assistant reply",
          history: [],
          actions: [{ id: "action-1", type: "tag", data: { tags: ["哲学"] }, status: "PENDING_APPROVAL" }],
        };
      }
      if (url === "/api/agent-actions/action-1/approve") {
        throw new Error("backend failed");
      }
      throw new Error(`Unhandled apiFetch: ${url}`);
    },
  });
  harness.input.value = "hello";

  await harness.sendBtn.dispatch("click");
  const confirmContainer = harness.getConfirmContainer();
  const confirmBtn = confirmContainer.querySelector(".agent-confirm-btn");

  await confirmBtn.onclick();

  // After P0 retry support, failures show "重试" instead of a terminal error.
  assert.equal(confirmBtn.textContent, "重试");
  assert.equal(confirmBtn.disabled, false);
  assert.ok(errors.some((line) => line.includes("approveAction error:")));
});
