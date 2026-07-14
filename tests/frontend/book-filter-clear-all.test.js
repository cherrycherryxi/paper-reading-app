// OPT-107 书单三个筛选维度（搜索词 / 状态 chip / 标签 chip）的「清除全部筛选」入口。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "..", "styles.css"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const classes = new Set();

  const node = {
    tagName: tagName.toUpperCase(),
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    children: [],
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      contains(name) {
        return classes.has(name);
      },
    },
    get className() {
      return [...classes].join(" ");
    },
    set className(value) {
      classes.clear();
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classes.add(name));
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
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return createElementStub("button");
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    setAttribute() {},
  };
  return node;
}

function createStatusChipStrip() {
  const strip = createElementStub();
  const chips = ["all", "reading", "wishlist", "finished"].map((value) => {
    const chip = createElementStub("button");
    chip.dataset.statusFilter = value;
    if (value === "all") chip.classList.add("active");
    return chip;
  });
  strip.querySelectorAll = () => chips;
  strip.chips = chips;
  return strip;
}

function createHarness() {
  const elements = new Map();
  const statusChipStrip = createStatusChipStrip();
  elements.set("#statusFilterChips", statusChipStrip);

  function getElement(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, createElementStub());
    }
    return elements.get(selector);
  }

  const document = {
    querySelector: getElement,
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
    Set,
    setTimeout,
    clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");

  vm.runInNewContext(
    `${sourceWithoutBoot}
globalThis.__testHooks = {
  els,
  renderBooks,
  globalSearch,
  restoreDefaultView,
  clearAllBookFilters,
  hasActiveBookFilters,
  statusChipStrip: els.statusFilterChips,
  setState(value) { state = value; },
  setCurrentUser(value) { currentUser = value; },
  setStatusFilter(value) { selectedStatusFilter = value; },
  setTagFilter(value) { selectedTagFilter = value; },
  getStatusFilter() { return selectedStatusFilter; },
  getTagFilter() { return selectedTagFilter; },
  getSearchQuery() { return searchQuery; },
};
`,
    context,
    { filename: "app.js" }
  );
  return context.__testHooks;
}

function createBook(overrides) {
  return {
    id: "book-1",
    title: "三体",
    author: "刘慈欣",
    tags: ["科幻"],
    status: "reading",
    currentPage: 0,
    totalPages: 300,
    notes: "",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    ...overrides,
  };
}

function bootstrap() {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "user-1" });
  hooks.setState({
    books: [
      createBook({ id: "book-1", title: "三体", status: "reading", tags: ["科幻"] }),
      createBook({ id: "book-2", title: "史记", author: "司马迁", status: "finished", tags: ["历史"] }),
    ],
    quotes: [],
    sessions: [],
    connections: [],
    chatHistories: {},
    chatContexts: {},
  });
  return hooks;
}

test("三个维度都为默认时没有活跃筛选，任一维度被设置就有", () => {
  const hooks = bootstrap();
  assert.equal(hooks.hasActiveBookFilters(), false);

  hooks.setStatusFilter("finished");
  assert.equal(hooks.hasActiveBookFilters(), true);

  hooks.setStatusFilter("all");
  hooks.setTagFilter("科幻");
  assert.equal(hooks.hasActiveBookFilters(), true);

  hooks.setTagFilter("");
  hooks.globalSearch("三体");
  assert.equal(hooks.hasActiveBookFilters(), true);
});

test("clearAllBookFilters 同时清掉搜索词、状态筛选和标签筛选", () => {
  const hooks = bootstrap();
  hooks.setStatusFilter("finished");
  hooks.setTagFilter("历史");
  hooks.globalSearch("史记");
  hooks.els.booksSearchInput.value = "史记";

  hooks.clearAllBookFilters();

  assert.equal(hooks.getSearchQuery(), "");
  assert.equal(hooks.getStatusFilter(), "all");
  assert.equal(hooks.getTagFilter(), "");
  assert.equal(hooks.els.booksSearchInput.value, "", "搜索框文本也要清空");
  assert.equal(hooks.hasActiveBookFilters(), false);
  // 清完后回到完整书单
  assert.equal(hooks.els.booksResultCount.textContent, "共 2 本");
});

test("clearAllBookFilters 把状态 chip 的 active 高亮同步回「全部」", () => {
  const hooks = bootstrap();
  const chips = hooks.statusChipStrip.querySelectorAll();
  const chipOf = (value) => chips.find((chip) => chip.dataset.statusFilter === value);

  hooks.setStatusFilter("finished");
  chipOf("all").classList.remove("active");
  chipOf("finished").classList.add("active");

  hooks.clearAllBookFilters();

  assert.equal(chipOf("all").classList.contains("active"), true, "「全部」chip 应重新高亮");
  assert.equal(chipOf("finished").classList.contains("active"), false, "旧的状态 chip 应取消高亮");
});

test("清除按钮仅在有活跃筛选时显示（renderBooks / 搜索两条路径都同步）", () => {
  const hooks = bootstrap();
  const btn = hooks.els.clearBookFiltersBtn;

  hooks.renderBooks();
  assert.equal(btn.classList.contains("is-hidden"), true, "无筛选时隐藏");

  hooks.setStatusFilter("finished");
  hooks.renderBooks();
  assert.equal(btn.classList.contains("is-hidden"), false, "状态筛选生效时显示");

  hooks.setStatusFilter("all");
  hooks.globalSearch("三体");
  assert.equal(btn.classList.contains("is-hidden"), false, "搜索结果页也显示");

  hooks.clearAllBookFilters();
  assert.equal(btn.classList.contains("is-hidden"), true, "清除后重新隐藏");
});

test("只清搜索词（restoreDefaultView）仍保留状态/标签筛选", () => {
  const hooks = bootstrap();
  hooks.setStatusFilter("finished");
  hooks.setTagFilter("历史");
  hooks.globalSearch("史记");

  hooks.restoreDefaultView();

  assert.equal(hooks.getSearchQuery(), "");
  assert.equal(hooks.getStatusFilter(), "finished");
  assert.equal(hooks.getTagFilter(), "历史");
  assert.equal(hooks.els.booksResultCount.textContent, "共 1 本");
});

test("筛选后无结果的空状态给出「清除全部筛选」入口", () => {
  const hooks = bootstrap();
  hooks.setStatusFilter("finished");
  hooks.setTagFilter("科幻"); // 没有「已读完 + 科幻」的书

  hooks.renderBooks();

  assert.equal(hooks.els.booksResultCount.textContent, "共 0 本");
  assert.match(hooks.els.booksList.innerHTML, /id="clearFiltersEmptyBtn"[^>]*>清除全部筛选</);
});

test("清除按钮挂在书单 meta 行上，默认隐藏并与结果数同排", () => {
  assert.match(
    htmlSource,
    /<div class="books-meta-row">[\s\S]*?id="clearBookFiltersBtn"[\s\S]*?<\/div>/,
    "按钮应在 books-meta-row 内"
  );
  assert.match(htmlSource, /id="clearBookFiltersBtn"[^>]*>/);
  assert.match(htmlSource, /class="link-btn is-hidden"[^>]*id="clearBookFiltersBtn"/, "初始应带 is-hidden");
  assert.match(cssSource, /\.books-meta-row \{[^}]*justify-content: space-between;/);
});
