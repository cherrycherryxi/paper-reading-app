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
    setTimeout(fn) {
      return fn();
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
  fuzzyMatch,
  matchBooks,
  matchQuotes,
  renderBooks,
  renderSearchResults,
  globalSearch,
  restoreDefaultView,
  els,
  setState(value) {
    state = value;
  },
  setCurrentUser(value) {
    currentUser = value;
  },
  setStatusFilter(value) {
    selectedStatusFilter = value;
  },
  setTagFilter(value) {
    selectedTagFilter = value;
  },
  setSearchQuery(value) {
    searchQuery = value;
  },
  getBooksResultCount() {
    return els.booksResultCount.textContent;
  },
  getBooksListMarkup() {
    return els.booksList.innerHTML;
  },
  getAllBooksListMarkup() {
    const collect = (node) => [node.innerHTML, ...node.children.flatMap(collect)].join("");
    return collect(els.booksList);
  },
  getSectionHeaders() {
    return els.booksList.children.map((child) => child.innerHTML.match(/<h3 class="search-section-header">(.*?)<\\/h3>/)?.[1] || "");
  },
  getRenderedTitles() {
    const collect = (node) => [
      ...(node.innerHTML.match(/<h3>(.*?)<\\/h3>/g) || []).map((text) => text.replace(/<\\/?h3>/g, "")),
      ...node.children.flatMap(collect),
    ];
    return collect(els.booksList);
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

function createQuote(overrides) {
  return {
    id: "quote-1",
    bookId: "book-1",
    content: "默认摘抄",
    kind: "quote",
    page: 1,
    tags: [],
    reflection: "",
    imageUrl: "",
    createdAt: "2026-04-20T00:00:00.000Z",
    ...overrides,
  };
}

function createRng(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sample(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function randomString(rng, length = 6) {
  const alphabet = "abcxyz三体沙丘史记刘慈欣司马迁012345";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return result;
}

function generateBooks(seed, count = 8) {
  const rng = createRng(seed);
  const statuses = ["reading", "wishlist", "finished", "paused"];
  const tagsPool = ["科幻", "历史", "哲学", "经济"];
  return Array.from({ length: count }, (_, index) => createBook({
    id: `book-${seed}-${index}`,
    title: `${randomString(rng, 5)}${sample(rng, ["三体", "沙丘", "史记", "置身事内"])}`,
    author: `${sample(rng, ["刘慈欣", "司马迁", "兰小欢", "Frank"])}`,
    status: sample(rng, statuses),
    tags: [sample(rng, tagsPool)],
    createdAt: `2026-04-${String((index % 9) + 10).padStart(2, "0")}T00:00:00.000Z`,
  }));
}

function generateQuotes(seed, books, count = 8) {
  const rng = createRng(seed);
  const tagsPool = ["科幻", "历史", "思想", "结构"];
  return Array.from({ length: count }, (_, index) => createQuote({
    id: `quote-${seed}-${index}`,
    bookId: books[index % books.length]?.id || "book-1",
    content: `${randomString(rng, 8)} ${sample(rng, ["黑暗森林", "不要返航", "究天人之际", "长期主义"])}`,
    tags: [sample(rng, tagsPool)],
    createdAt: `2026-04-${String((index % 9) + 10).padStart(2, "0")}T00:00:00.000Z`,
  }));
}

test("global search uses the correct DOM selectors", () => {
  assert.match(appSource, /document\.querySelector\("#booksSearchInput"\)\?\.addEventListener\("input"/);
  assert.match(appSource, /document\.querySelector\("#tagFilterStrip"\)/);
});

test("fuzzyMatch is case-insensitive and query normalization works", () => {
  const hooks = createHarness();
  assert.equal(hooks.fuzzyMatch("The Three-Body Problem", "three-body"), true);
  assert.equal(hooks.fuzzyMatch("刘慈欣", "刘"), true);
  assert.equal(hooks.fuzzyMatch("History", " sci "), false);
});

test("property: fuzzyMatch normalization is idempotent across varied strings", () => {
  const hooks = createHarness();
  for (let seed = 1; seed <= 120; seed += 1) {
    const rng = createRng(seed);
    const haystack = randomString(rng, 12);
    const raw = `  ${randomString(rng, 4).toUpperCase()}  `;
    const normalized = raw.trim().toLowerCase();
    assert.equal(
      hooks.fuzzyMatch(haystack, normalized),
      hooks.fuzzyMatch(haystack, raw.trim().toLowerCase())
    );
  }
});

test("property: matchBooks returns exactly books whose title or author contains the query", () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    const hooks = createHarness();
    const books = generateBooks(seed);
    const query = seed % 2 === 0 ? "三体" : "刘";
    hooks.setState({ books, quotes: [], sessions: [], chatHistories: {} });

    const actual = Array.from(hooks.matchBooks(query), (book) => book.id).sort();
    const expected = books
      .filter((book) =>
        String(book.title).toLowerCase().includes(query) ||
        String(book.author || "").toLowerCase().includes(query)
      )
      .map((book) => book.id)
      .sort();

    assert.deepEqual(actual, expected);
  }
});

test("property: matchBooks ignores active status and tag filters", () => {
  const books = generateBooks(999);
  const query = "三体";
  const filterPairs = [
    ["all", ""],
    ["reading", "科幻"],
    ["finished", "历史"],
    ["paused", "哲学"],
  ];

  let baseline = null;
  for (const [status, tag] of filterPairs) {
    const hooks = createHarness();
    hooks.setState({ books, quotes: [], sessions: [], chatHistories: {} });
    hooks.setStatusFilter(status);
    hooks.setTagFilter(tag);
    const result = Array.from(hooks.matchBooks(query), (book) => book.id).sort();
    baseline ??= result;
    assert.deepEqual(result, baseline);
  }
});

test("property: matchQuotes returns exactly quotes whose content contains the query", () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    const hooks = createHarness();
    const books = generateBooks(seed);
    const quotes = generateQuotes(seed + 100, books);
    const query = seed % 2 === 0 ? "黑暗森林" : "长期主义";
    hooks.setState({ books, quotes, sessions: [], chatHistories: {} });

    const actual = Array.from(hooks.matchQuotes(query), (quote) => quote.id).sort();
    const expected = quotes
      .filter((quote) => String(quote.content || "").toLowerCase().includes(query))
      .map((quote) => quote.id)
      .sort();

    assert.deepEqual(actual, expected);
  }
});

test("globalSearch renders books first and quotes second, ignoring active filters", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setStatusFilter("finished");
  hooks.setTagFilter("历史");
  hooks.setState({
    books: [
      createBook({ id: "b1", title: "三体", author: "刘慈欣", status: "reading", tags: ["科幻"] }),
      createBook({ id: "b2", title: "史记", author: "司马迁", status: "finished", tags: ["历史"] }),
    ],
    quotes: [
      createQuote({ id: "q1", bookId: "b1", content: "不要返航，这里不是家。", tags: ["科幻"] }),
      createQuote({ id: "q2", bookId: "b2", content: "究天人之际，通古今之变。", tags: ["历史"] }),
    ],
    sessions: [],
    chatHistories: {},
  });

  hooks.globalSearch("三体");

  assert.deepEqual(hooks.getSectionHeaders(), ["书籍", "摘抄"]);
  assert.equal(hooks.getBooksResultCount(), "找到 1 本书籍、0 条摘抄");
  assert.equal(hooks.els.statusFilterChips.style.display, "none");
  assert.equal(hooks.els.booksList.className, "book-list search-results");
  assert.deepEqual(hooks.matchBooks("三体").map((book) => book.id), ["b1"]);
});

test("property: result count text matches rendered book and quote totals", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  const books = [
    createBook({ id: "b1", title: "三体" }),
    createBook({ id: "b2", title: "沙丘" }),
  ];
  const quotes = [
    createQuote({ id: "q1", bookId: "b1", content: "黑暗森林" }),
    createQuote({ id: "q2", bookId: "b2", content: "不要返航" }),
    createQuote({ id: "q3", bookId: "b2", content: "长期主义" }),
  ];
  hooks.setState({ books, quotes, sessions: [], chatHistories: {} });

  hooks.renderSearchResults(books, quotes);

  const matched = hooks.getBooksResultCount().match(/找到 (\d+) 本书籍、(\d+) 条摘抄/);
  assert.equal(Number(matched[1]), books.length);
  assert.equal(Number(matched[2]), quotes.length);
});

test("property: search sections always render in books-then-quotes order", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const hooks = createHarness();
    const books = generateBooks(seed, 3);
    const quotes = generateQuotes(seed + 100, books, 3);
    hooks.setCurrentUser({ id: "user-1" });
    hooks.setState({ books, quotes, sessions: [], chatHistories: {} });
    hooks.renderSearchResults(books, quotes);
    assert.deepEqual(Array.from(hooks.getSectionHeaders()), ["书籍", "摘抄"]);
  }
});

test("property: section empty states render the correct copy", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  const books = [createBook({ id: "b1", title: "三体" })];
  const quotes = [createQuote({ id: "q1", bookId: "b1", content: "黑暗森林" })];
  hooks.setState({ books, quotes, sessions: [], chatHistories: {} });

  hooks.renderSearchResults([], quotes);
  assert.match(hooks.getAllBooksListMarkup(), /没有匹配的书籍/);

  hooks.renderSearchResults(books, []);
  assert.match(hooks.getAllBooksListMarkup(), /没有匹配的摘抄/);
});

test("globalSearch shows combined empty state when nothing matches", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [createBook({ id: "b1", title: "三体", author: "刘慈欣" })],
    quotes: [createQuote({ id: "q1", bookId: "b1", content: "黑暗森林" })],
    sessions: [],
    chatHistories: {},
  });

  hooks.globalSearch("不存在");

  assert.equal(hooks.getBooksResultCount(), "找到 0 本书籍、0 条摘抄");
  assert.match(hooks.getBooksListMarkup(), /没有找到匹配的结果，试试其他关键词/);
});

test("restoreDefaultView reapplies the current filters after clearing search", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setStatusFilter("reading");
  hooks.setTagFilter("科幻");
  hooks.setState({
    books: [
      createBook({ id: "b1", title: "三体", author: "刘慈欣", status: "reading", tags: ["科幻"], createdAt: "2026-04-20T00:00:00.000Z" }),
      createBook({ id: "b2", title: "史记", author: "司马迁", status: "finished", tags: ["历史"] }),
      createBook({ id: "b3", title: "沙丘", author: "弗兰克", status: "reading", tags: ["科幻"], createdAt: "2026-04-21T00:00:00.000Z" }),
    ],
    quotes: [createQuote({ id: "q1", bookId: "b1", content: "黑暗森林" })],
    sessions: [],
    chatHistories: {},
  });

  hooks.globalSearch("黑暗");
  hooks.restoreDefaultView();

  assert.equal(hooks.els.statusFilterChips.style.display, "");
  assert.equal(hooks.els.booksResultCount.textContent, "共 2 本");
  assert.deepEqual(Array.from(hooks.getRenderedTitles()), ["《沙丘》", "《三体》"]);
});

test("property: restoreDefaultView matches renderBooks output under active filters", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const hooks = createHarness();
    const books = generateBooks(seed, 6).map((book, index) => ({
      ...book,
      status: index % 2 === 0 ? "reading" : "finished",
      tags: [index % 2 === 0 ? "科幻" : "历史"],
      createdAt: `2026-04-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`,
    }));
    hooks.setCurrentUser({ id: "user-1" });
    hooks.setState({ books, quotes: generateQuotes(seed + 200, books, 4), sessions: [], chatHistories: {} });
    hooks.setStatusFilter("reading");
    hooks.setTagFilter("科幻");

    hooks.renderBooks();
    const baselineTitles = Array.from(hooks.getRenderedTitles());

    hooks.globalSearch("黑暗森林");
    hooks.restoreDefaultView();
    const restoredTitles = Array.from(hooks.getRenderedTitles());

    assert.deepEqual(restoredTitles, baselineTitles);
  }
});
