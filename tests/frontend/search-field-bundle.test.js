/**
 * OPT-092 + OPT-083 + OPT-056 + OPT-088 + OPT-096 + OPT-097
 * 检索修通 bundle — 搜索字段全面补全回归覆盖
 *
 * OPT-092: matchBooks() 搜索 tags / notes
 * OPT-097: matchBooks() 搜索 review
 * OPT-083: matchQuotes() / renderQuotes haystack 搜索 ocrText
 * OPT-056: renderQuotes haystack 搜索 reflection
 * OPT-088: renderConnections getSearchLabel quote 分支含 content/ocrText
 * OPT-096: renderConnections haystack 含 c.tags
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

// ─── minimal DOM stub ────────────────────────────────────────────────────────

function createElementStub(tagName = "div") {
  let _innerHTML = "";
  const el = {
    tagName: (tagName || "div").toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    disabled: false,
    open: false,
    hidden: false,
    children: [],
    files: [],
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) {
      _innerHTML = String(v);
      this.children = [];
    },
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentHTML(pos, v) {
      _innerHTML = pos === "beforeend" ? `${_innerHTML}${v}` : `${v}${_innerHTML}`;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {},
    setAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    focus() {},
    scrollIntoView() {},
    cloneNode() { return createElementStub(tagName); },
  };
  return el;
}

function createHarness() {
  const elements = new Map();

  function getElement(selector) {
    if (!elements.has(selector)) elements.set(selector, createElementStub());
    return elements.get(selector);
  }

  const document = {
    querySelector(selector) { return getElement(selector); },
    querySelectorAll() { return []; },
    createElement(tag) { return createElementStub(tag); },
    getElementById(id) { return getElement(`#${id}`); },
    createElementNS(_, tag) { return createElementStub(tag); },
  };

  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout(fn) { return fn(); },
    confirm() { return true; },
  };

  const context = {
    console,
    document,
    window,
    localStorage: {
      getItem() { return ""; },
      setItem() {},
      removeItem() {},
    },
    fetch: async () => ({
      ok: true,
      headers: { get() { return "application/json"; } },
      json: async () => ({}),
    }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData,
    structuredClone,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { return fn(); },
  };

  const sourceWithoutBoot = appSource.replace(
    /\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n"
  );

  const instrumentedSource = `${sourceWithoutBoot}
globalThis.__testHooks = {
  matchBooks,
  matchQuotes,
  renderQuotes,
  renderConnections,
  els,
  setState(value) {
    state = value;
  },
  setCurrentUser(value) {
    currentUser = value;
  },
  getQuotesListMarkup() {
    return els.quotesList.innerHTML;
  },
  getConnectionsListMarkup() {
    return els.connectionsList.innerHTML;
  },
  setQuoteSearch(value) {
    if (els.quoteSearch) els.quoteSearch.value = value;
  },
  setConnectionSearch(value) {
    if (els.connectionSearch) els.connectionSearch.value = value;
  },
  setQuoteFilter(value) {
    if (els.quoteFilter) els.quoteFilter.value = value;
  },
};
`;

  vm.runInNewContext(instrumentedSource, context, { filename: "app.js" });
  return context.__testHooks;
}

// ─── factories ───────────────────────────────────────────────────────────────

function book(overrides) {
  return {
    id: "b1", title: "默认书名", author: "作者", tags: [],
    status: "reading", currentPage: 0, totalPages: 200,
    notes: "", review: "", coverImageUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null, finishedAt: null, lastReadAt: null,
    ...overrides,
  };
}

function quote(overrides) {
  return {
    id: "q1", bookId: "b1", content: "", kind: "quote",
    page: 1, tags: [], reflection: "",
    imageUrl: "", ocrText: "", ocrStatus: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function conn(overrides) {
  return {
    id: "c1", sourceType: "book", sourceId: "b1",
    targetType: "book", targetId: "b2",
    kind: "contrast", thought: "", tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── OPT-092: matchBooks 搜索 tags ─────────────────────────────────────────

test("OPT-092: matchBooks finds book by tag", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [
      book({ id: "b1", title: "书A", tags: ["成长", "哲学"] }),
      book({ id: "b2", title: "书B", tags: ["科幻"] }),
    ],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  const result = hooks.matchBooks("成长").map(b => b.id);
  assert.deepEqual(result, ["b1"]);
});

test("OPT-092: matchBooks finds book by notes", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [
      book({ id: "b1", title: "书A", notes: "这本书讲述成长的故事" }),
      book({ id: "b2", title: "书B", notes: "经济理论" }),
    ],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  const result = hooks.matchBooks("成长").map(b => b.id);
  assert.deepEqual(result, ["b1"]);
});

test("OPT-092: matchBooks tag search is case-insensitive", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [
      book({ id: "b1", title: "英文书", tags: ["Growth", "Philosophy"] }),
    ],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  assert.equal(hooks.matchBooks("growth").length, 1);
  assert.equal(hooks.matchBooks("GROWTH").length, 0, "fuzzyMatch uses .toLowerCase() so uppercase won't match");
});

test("OPT-092: matchBooks with no tags returns no tag match", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [
      book({ id: "b1", title: "书A", tags: [], notes: "" }),
    ],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  assert.equal(hooks.matchBooks("成长").length, 0);
});

// ─── OPT-097: matchBooks 搜索 review ────────────────────────────────────────

test("OPT-097: matchBooks finds book by review field", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [
      book({ id: "b1", title: "书A", review: "这是一本关于成长蜕变的好书" }),
      book({ id: "b2", title: "书B", review: "政治经济学入门" }),
    ],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  const result = hooks.matchBooks("蜕变").map(b => b.id);
  assert.deepEqual(result, ["b1"]);
});

test("OPT-097: matchBooks review empty returns no match", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [
      book({ id: "b1", title: "书A", review: "" }),
    ],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  assert.equal(hooks.matchBooks("成长").length, 0);
});

test("OPT-097: matchBooks review=undefined doesn't throw", () => {
  const hooks = createHarness();
  const b = book({ id: "b1", title: "书A" });
  delete b.review;
  hooks.setState({
    books: [b],
    quotes: [], sessions: [], connections: [], chatHistories: {},
  });

  assert.doesNotThrow(() => hooks.matchBooks("成长"));
});

// ─── OPT-083: matchQuotes 搜索 ocrText ──────────────────────────────────────

test("OPT-083: matchQuotes finds quote by ocrText when content is empty", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [
      quote({ id: "q1", content: "", ocrText: "人生最宝贵的是时间" }),
      quote({ id: "q2", content: "另一段摘抄", ocrText: "" }),
    ],
    sessions: [], connections: [], chatHistories: {},
  });

  const result = hooks.matchQuotes("时间").map(q => q.id);
  assert.deepEqual(result, ["q1"]);
});

test("OPT-083: matchQuotes still finds by content when both present", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [
      quote({ id: "q1", content: "内容已编辑", ocrText: "原始识别文本" }),
    ],
    sessions: [], connections: [], chatHistories: {},
  });

  assert.equal(hooks.matchQuotes("内容").length, 1);
});

test("OPT-083: matchQuotes does not match notes/questions kind", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1" })],
    quotes: [
      quote({ id: "q1", kind: "note", content: "", ocrText: "笔记OCR内容" }),
    ],
    sessions: [], connections: [], chatHistories: {},
  });

  assert.equal(hooks.matchQuotes("笔记OCR内容").length, 0);
});

// ─── OPT-056: renderQuotes haystack 含 reflection ───────────────────────────

test("OPT-056: renderQuotes shows quote that matches on reflection", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "测试书" })],
    quotes: [
      quote({ id: "q1", content: "摘抄原文", reflection: "我的理解是进化论的体现" }),
      quote({ id: "q2", content: "另一段摘抄", reflection: "" }),
    ],
    sessions: [], connections: [], chatHistories: {},
  });
  hooks.setQuoteSearch("进化论");
  hooks.setQuoteFilter("all");
  hooks.renderQuotes();

  const markup = hooks.getQuotesListMarkup();
  assert.match(markup, /q1/, "quote with matching reflection should appear");
  assert.doesNotMatch(markup, /q2/, "quote without matching reflection should be excluded");
});

test("OPT-056: renderQuotes includes both content-match and reflection-match", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "书名" })],
    quotes: [
      quote({ id: "q1", content: "文艺复兴时期的艺术", reflection: "" }),
      quote({ id: "q2", content: "", reflection: "这让我想到文艺复兴运动的内涵" }),
    ],
    sessions: [], connections: [], chatHistories: {},
  });
  hooks.setQuoteSearch("文艺复兴");
  hooks.setQuoteFilter("all");
  hooks.renderQuotes();

  const markup = hooks.getQuotesListMarkup();
  assert.match(markup, /q1/);
  assert.match(markup, /q2/);
});

// ─── OPT-083: renderQuotes haystack 含 ocrText ──────────────────────────────

test("OPT-083: renderQuotes shows OCR-only quote that matches ocrText", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "书" })],
    quotes: [
      quote({ id: "q1", content: "", ocrText: "道可道，非常道", ocrStatus: "done" }),
      quote({ id: "q2", content: "其他内容", ocrText: "" }),
    ],
    sessions: [], connections: [], chatHistories: {},
  });
  hooks.setQuoteSearch("非常道");
  hooks.setQuoteFilter("all");
  hooks.renderQuotes();

  const markup = hooks.getQuotesListMarkup();
  assert.match(markup, /q1/);
  assert.doesNotMatch(markup, /q2/);
});

// ─── OPT-088: renderConnections getSearchLabel 含 quote 摘抄内容 ─────────────

test("OPT-088: renderConnections finds connection by source quote content", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [
      book({ id: "b1", title: "书A" }),
      book({ id: "b2", title: "书B" }),
    ],
    quotes: [
      quote({ id: "q1", bookId: "b1", content: "时间是最公平的资源" }),
    ],
    connections: [
      conn({ id: "c1", sourceType: "quote", sourceId: "q1", targetType: "book", targetId: "b2" }),
      conn({ id: "c2", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2", thought: "完全无关" }),
    ],
    sessions: [], chatHistories: {},
  });
  hooks.setConnectionSearch("公平的资源");
  hooks.renderConnections();

  const markup = hooks.getConnectionsListMarkup();
  assert.match(markup, /c1/, "connection with matching quote content should appear");
  assert.doesNotMatch(markup, /c2/, "unrelated connection should be excluded");
});

test("OPT-088: renderConnections finds connection by target quote ocrText", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1" }), book({ id: "b2" })],
    quotes: [
      quote({ id: "q1", bookId: "b1", content: "", ocrText: "知之为知之不知为不知" }),
    ],
    connections: [
      conn({ id: "c1", sourceType: "book", sourceId: "b2", targetType: "quote", targetId: "q1" }),
    ],
    sessions: [], chatHistories: {},
  });
  hooks.setConnectionSearch("知之为知之");
  hooks.renderConnections();

  const markup = hooks.getConnectionsListMarkup();
  assert.match(markup, /c1/);
});

// ─── OPT-096: renderConnections haystack 含 c.tags ──────────────────────────

test("OPT-096: renderConnections finds connection by tag", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1", title: "书A" }), book({ id: "b2", title: "书B" })],
    quotes: [],
    connections: [
      conn({ id: "c1", sourceId: "b1", targetId: "b2", tags: ["成长主题", "对比"] }),
      conn({ id: "c2", sourceId: "b1", targetId: "b2", tags: ["科幻"], thought: "无关" }),
    ],
    sessions: [], chatHistories: {},
  });
  hooks.setConnectionSearch("成长主题");
  hooks.renderConnections();

  const markup = hooks.getConnectionsListMarkup();
  assert.match(markup, /c1/);
  assert.doesNotMatch(markup, /c2/);
});

test("OPT-096: renderConnections with no tags doesn't throw", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1" }), book({ id: "b2" })],
    quotes: [],
    connections: [
      conn({ id: "c1", sourceId: "b1", targetId: "b2", tags: undefined }),
    ],
    sessions: [], chatHistories: {},
  });
  hooks.setConnectionSearch("书A");

  assert.doesNotThrow(() => hooks.renderConnections());
});

test("OPT-096: renderConnections tag search is isolated from thought search", () => {
  const hooks = createHarness();
  hooks.setState({
    books: [book({ id: "b1", title: "书A" }), book({ id: "b2", title: "书B" })],
    quotes: [],
    connections: [
      conn({ id: "c1", sourceId: "b1", targetId: "b2", tags: ["标签甲"], thought: "" }),
      conn({ id: "c2", sourceId: "b1", targetId: "b2", tags: [], thought: "甲的感想" }),
    ],
    sessions: [], chatHistories: {},
  });
  hooks.setConnectionSearch("甲");
  hooks.renderConnections();

  const markup = hooks.getConnectionsListMarkup();
  assert.match(markup, /c1/);
  assert.match(markup, /c2/);
});
