const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";

  return {
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    disabled: false,
    children: [],
    files: [],
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    get innerHTML() {
      return innerHTML;
    },
    set innerHTML(value) {
      innerHTML = String(value);
      this.children = [];
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    insertAdjacentHTML(position, value) {
      innerHTML = position === "beforeend" ? `${innerHTML}${value}` : `${value}${innerHTML}`;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return createElementStub("button");
    },
    querySelectorAll() {
      return [];
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    reset() {},
    setAttribute() {},
    closest() {
      return null;
    },
  };
}

function createHarness() {
  const elements = new Map();

  function getElement(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, createElementStub());
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
    getElementById(id) {
      return getElement(`#${id}`);
    },
  };

  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
    confirm() {
      return true;
    },
  };

  const context = {
    console,
    document,
    window,
    localStorage: {
      getItem() {
        return "";
      },
      setItem() {},
      removeItem() {},
    },
    fetch: async () => ({
      ok: true,
      headers: { get() { return "application/json"; } },
      json: async () => ({}),
    }),
    CustomEvent: function CustomEvent(type) {
      this.type = type;
    },
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
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
  };

  const sourceWithoutBoot = appSource.replace(
    /\nbindEvents\(\);\nrender\(\);[\s\S]*$/,
    "\n"
  );

  const instrumentedSource = `${sourceWithoutBoot}
globalThis.__testHooks = {
  renderBooks,
  globalSearch,
  saveBookEdit,
  els,
  setState(value) {
    state = value;
  },
  getState() {
    return state;
  },
  setCurrentUser(value) {
    currentUser = value;
  },
  setAuthToken(value) {
    authToken = value;
  },
  setStatusFilter(value) {
    selectedStatusFilter = value;
  },
  setTagFilter(value) {
    selectedTagFilter = value;
  },
  setBookSearchQuery(value) {
    searchQuery = value;
  },
  setSearchQuery(value) {
    searchQuery = value;
  },
  setPendingBookEditImage(value) {
    pendingBookEditImage = value;
  },
  setSyncState(fn) {
    syncState = fn;
  },
  setRender(fn) {
    render = fn;
  },
  setCloseDialog(fn) {
    closeDialog = fn;
  },
  setResetBookEditDraft(fn) {
    resetBookEditDraft = fn;
  },
  setShowToast(fn) {
    showToast = fn;
  },
  getRenderedTitles() {
    const collect = (node) => [
      ...(node.innerHTML.match(/<h3>(.*?)<\\/h3>/g) || []).map((text) => text.replace(/<\\/?h3>/g, "")),
      ...node.children.flatMap(collect),
    ];
    return collect(els.booksList).filter(Boolean);
  },
};
`;

  vm.runInNewContext(instrumentedSource, context, { filename: "app.js" });
  return context.__testHooks;
}

function createBook(overrides) {
  return {
    id: "book-1",
    title: "默认标题",
    author: "默认作者",
    tags: [],
    status: "wishlist",
    currentPage: 0,
    totalPages: 300,
    notes: "",
    coverImageUrl: "",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    lastReadAt: null,
    ...overrides,
  };
}

function createFormData(entries) {
  return {
    get(key) {
      return entries[key];
    },
  };
}

test("bug exploration: renderBooks should keep newest created books first even if an older book was edited later", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      createBook({
        id: "newer",
        title: "新书",
        createdAt: "2026-04-23T00:00:00.000Z",
        updatedAt: "2026-04-23T00:00:00.000Z",
      }),
      createBook({
        id: "older",
        title: "旧书",
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:00.000Z",
      }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.renderBooks();

  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["新书", "旧书"]);
});

test("renderBooks should group books by reading status before creation date", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      createBook({ id: "wishlist", title: "想读新书", status: "wishlist", createdAt: "2026-04-24T00:00:00.000Z" }),
      createBook({ id: "finished", title: "读完旧书", status: "finished", createdAt: "2026-04-22T00:00:00.000Z" }),
      createBook({ id: "reading", title: "在读旧书", status: "reading", createdAt: "2026-04-21T00:00:00.000Z" }),
      createBook({ id: "reading-new", title: "在读新书", status: "reading", createdAt: "2026-04-23T00:00:00.000Z" }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.renderBooks();

  assert.deepEqual(Array.from(hooks.getRenderedTitles()), [
    "在读新书",
    "在读旧书",
    "读完旧书",
    "想读新书",
  ]);
});

test("OPT-037: same-second books with mixed timestamp precision sort newest-first", () => {
  // The real bug: createdAt is mixed format — utc_now_iso() emits millisecond
  // precision ("...20.500Z") while legacy now_iso() emits second precision
  // ("...20Z"). String localeCompare orders "." (46) before "Z" (90), so the
  // newer ".500Z" book would wrongly sort AFTER the ".000"/second one. Date.parse
  // normalizes both to epoch, restoring correct newest-first order.
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      // second-precision (no ms), created at :20.000
      createBook({ id: "older", title: "整秒书", status: "reading", createdAt: "2026-04-22T08:00:20Z" }),
      // millisecond-precision, created 500ms LATER in the same second
      createBook({ id: "newer", title: "毫秒书", status: "reading", createdAt: "2026-04-22T08:00:20.500Z" }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.renderBooks();

  // newest (毫秒书, :20.500) must come first; localeCompare would invert this.
  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["毫秒书", "整秒书"]);
});

test("OPT-037: compareBooksForList uses numeric Date.parse comparison, not localeCompare on timestamps", () => {
  // Guard the fix in source: no localeCompare on createdAt/updatedAt remains.
  assert.doesNotMatch(
    appSource,
    /createdAt[^\n]*\)\.localeCompare\(/,
    "createdAt comparisons must use Date.parse numeric diff, not localeCompare"
  );
  assert.doesNotMatch(
    appSource,
    /updatedAt[^\n]*\)\.localeCompare\(/,
    "updatedAt comparisons must use Date.parse numeric diff, not localeCompare"
  );
});

test("OPT-114: finished books sharing one createdAt (batch Douban import) order by finishedAt desc", () => {
  // Reproduce the OPT-105 batch-import defect: a Douban CSV import stamps every
  // book with the same createdAt. Under the old createdAt-only secondary sort the
  // "已读完" group degraded into CSV row order. Now finished books sort by finishedAt.
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  const sameCreatedAt = "2026-05-01T00:00:00.000Z";
  hooks.setState({
    books: [
      createBook({ id: "f-old", title: "早读完", status: "finished", createdAt: sameCreatedAt, finishedAt: "2024-01-10T00:00:00.000Z" }),
      createBook({ id: "f-new", title: "晚读完", status: "finished", createdAt: sameCreatedAt, finishedAt: "2026-03-20T00:00:00.000Z" }),
      createBook({ id: "f-mid", title: "中读完", status: "finished", createdAt: sameCreatedAt, finishedAt: "2025-06-15T00:00:00.000Z" }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.renderBooks();

  // Most-recently-finished first, independent of the identical createdAt.
  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["晚读完", "中读完", "早读完"]);
});

test("OPT-114: finished book missing finishedAt falls back to createdAt (no crash, stable order)", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      // finishedAt empty → falls back to createdAt; the dated one still leads.
      createBook({ id: "f-dated", title: "有日期", status: "finished", createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-04-01T00:00:00.000Z" }),
      createBook({ id: "f-nodate", title: "无日期", status: "finished", createdAt: "2026-02-01T00:00:00.000Z", finishedAt: "" }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.renderBooks();

  // 有日期(finishedAt 2026-04) 应在 无日期(fallback createdAt 2026-02) 之前。
  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["有日期", "无日期"]);
});

test("bug exploration: saveBookEdit should explicitly preserve and normalize tags in source", () => {
  assert.match(
    appSource,
    /book\.tags\s*=\s*Array\.isArray\(book\.tags\)\s*\?\s*book\.tags\s*:\s*\[\];/
  );
});

test("preservation: status and tag filters keep returning the correct matching set", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      createBook({ id: "1", title: "三体", status: "reading", tags: ["科幻"] }),
      createBook({ id: "2", title: "史记", status: "finished", tags: ["历史"] }),
      createBook({ id: "3", title: "沙丘", status: "reading", tags: ["科幻", "经典"] }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.setStatusFilter("reading");
  hooks.setTagFilter("");
  hooks.setBookSearchQuery("");
  hooks.renderBooks();
  assert.deepEqual(new Set(hooks.getRenderedTitles()), new Set(["三体", "沙丘"]));

  hooks.setStatusFilter("all");
  hooks.setTagFilter("科幻");
  hooks.renderBooks();
  assert.deepEqual(new Set(hooks.getRenderedTitles()), new Set(["三体", "沙丘"]));
});

test("preservation: search keeps returning the correct matching set", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      createBook({ id: "1", title: "三体", author: "刘慈欣", tags: ["科幻"] }),
      createBook({ id: "2", title: "置身事内", author: "兰小欢", tags: ["经济"] }),
      createBook({ id: "3", title: "球状闪电", author: "刘慈欣", tags: ["科幻", "物理"] }),
    ],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });

  hooks.setStatusFilter("all");
  hooks.setTagFilter("");
  hooks.globalSearch("刘慈欣");
  assert.deepEqual(new Set(hooks.getRenderedTitles()), new Set(["三体", "球状闪电"]));

  hooks.globalSearch("球状闪电");
  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["球状闪电"]);
});

test("preservation: saveBookEdit leaves unrelated fields unchanged for a normal tagged book", async () => {
  const hooks = createHarness();
  const originalBook = createBook({
    id: "book-1",
    title: "人类简史",
    author: "尤瓦尔",
    tags: [],
    status: "wishlist",
    currentPage: 12,
    totalPages: 500,
    notes: "旧笔记",
    coverImageUrl: "https://example.com/cover.jpg",
    createdAt: "2026-04-10T00:00:00.000Z",
  });

  hooks.setCurrentUser({ id: "user-1" });
  hooks.setAuthToken("token");
  hooks.setState({
    books: [originalBook],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });
  hooks.setPendingBookEditImage(null);
  hooks.setSyncState(async () => {});
  hooks.setRender(() => {});
  hooks.setCloseDialog(() => {});
  hooks.setResetBookEditDraft(() => {});
  hooks.setShowToast(() => {});

  await hooks.saveBookEdit(
    createFormData({
      bookId: "book-1",
      currentPage: "30",
      status: "reading",
      notes: "新笔记",
    })
  );

  const savedBook = hooks.getState().books[0];
  assert.equal(savedBook.title, "人类简史");
  assert.equal(savedBook.author, "尤瓦尔");
  assert.equal(savedBook.totalPages, 500);
  assert.equal(savedBook.coverImageUrl, "https://example.com/cover.jpg");
  assert.equal(savedBook.createdAt, "2026-04-10T00:00:00.000Z");
  assert.deepEqual(savedBook.tags, []);
  assert.equal(savedBook.currentPage, 30);
  assert.equal(savedBook.status, "reading");
  assert.equal(savedBook.notes, "新笔记");
});

test("regression: saveBookEdit scrolls back to the edited book card after rerender", async () => {
  const hooks = createHarness();
  const originalBook = createBook({
    id: "book-target",
    title: "目标书",
    status: "reading",
    currentPage: 20,
    totalPages: 300,
  });
  let queriedSelector = "";
  let scrollIntoViewOptions = null;
  const targetCard = {
    scrollIntoView(options) {
      scrollIntoViewOptions = options;
    },
  };

  hooks.setCurrentUser({ id: "user-1" });
  hooks.setAuthToken("token");
  hooks.setState({
    books: [originalBook],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });
  hooks.els.booksList.scrollTop = 420;
  hooks.els.booksList.querySelector = (selector) => {
    queriedSelector = selector;
    return targetCard;
  };
  hooks.setPendingBookEditImage(null);
  hooks.setSyncState(async () => {});
  hooks.setRender(() => {});
  hooks.setCloseDialog(() => {});
  hooks.setResetBookEditDraft(() => {});
  hooks.setShowToast(() => {});

  await hooks.saveBookEdit(
    createFormData({
      bookId: "book-target",
      currentPage: "30",
      status: "finished",
      notes: "新笔记",
    })
  );

  assert.equal(queriedSelector, '[data-book-card-id="book-target"]');
  assert.equal(scrollIntoViewOptions?.block, "nearest");
});

test("regression: saveBookEdit persists non-image edits when cover upload fails", async () => {
  const hooks = createHarness();
  const originalBook = createBook({
    id: "book-cover-fail",
    title: "封面失败书",
    status: "wishlist",
    currentPage: 10,
    notes: "旧笔记",
    coverImageUrl: "https://example.com/old-cover.jpg",
  });
  let syncCount = 0;
  const toastMessages = [];

  hooks.setCurrentUser({ id: "user-1" });
  hooks.setAuthToken("token");
  hooks.setState({
    books: [originalBook],
    sessions: [],
    quotes: [],
    chatHistories: {},
  });
  hooks.setPendingBookEditImage({
    name: "new-cover.jpg",
    dataUrl: "",
    compressionPromise: Promise.reject(new Error("decode failed")),
  });
  hooks.setSyncState(async () => {
    syncCount += 1;
  });
  hooks.setRender(() => {});
  hooks.setCloseDialog(() => {});
  hooks.setResetBookEditDraft(() => {});
  hooks.setShowToast((message) => {
    toastMessages.push(message);
  });

  await hooks.saveBookEdit(
    createFormData({
      bookId: "book-cover-fail",
      currentPage: "88",
      status: "reading",
      notes: "新笔记",
    })
  );

  const savedBook = hooks.getState().books[0];
  assert.equal(syncCount, 1);
  assert.equal(savedBook.currentPage, 88);
  assert.equal(savedBook.status, "reading");
  assert.equal(savedBook.notes, "新笔记");
  assert.equal(savedBook.coverImageUrl, "https://example.com/old-cover.jpg");
  assert.ok(toastMessages.includes("书籍已更新，封面上传失败"));
});
