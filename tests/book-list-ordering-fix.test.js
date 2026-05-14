const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "app.js");
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
  };

  const sourceWithoutBoot = appSource.replace(
    /\nbindEvents\(\);\nrender\(\);\nactivateTab\("books"\);\nloadSession\(\);\s*$/,
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

  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["《新书》", "《旧书》"]);
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
  assert.deepEqual(new Set(hooks.getRenderedTitles()), new Set(["《三体》", "《沙丘》"]));

  hooks.setStatusFilter("all");
  hooks.setTagFilter("科幻");
  hooks.renderBooks();
  assert.deepEqual(new Set(hooks.getRenderedTitles()), new Set(["《三体》", "《沙丘》"]));
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
  assert.deepEqual(new Set(hooks.getRenderedTitles()), new Set(["《三体》", "《球状闪电》"]));

  hooks.globalSearch("球状闪电");
  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["《球状闪电》"]);
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
