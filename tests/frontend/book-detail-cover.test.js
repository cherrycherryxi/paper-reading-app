// 书籍详情封面原图入口：书单卡片只渲染 .thumb.jpg 缩略图，原图 URL 此前
// 没有任何 UI 入口 —— 手机上「看得到封面却拿不到照片」。详情弹窗必须：
//  ① 有封面时显示封面，缩略图加载失败回退原图；
//  ② 点击封面在新标签打开【原图】（iOS Safari 长按可「存储到照片」）；
//  ③ 没有封面时整块隐藏，不留下空壳。
// Executes the REAL app.js (project convention).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

function createElementStub(tagName = "div") {
  const classes = new Set();
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, hidden: false, scrollTop: 0,
    style: {}, dataset: {}, parentNode: null, children: [], _attrs: {},
    src: "", alt: "", href: "", onerror: null,
    classList: {
      add(...c) { c.forEach((x) => classes.add(x)); },
      remove(...c) { c.forEach((x) => classes.delete(x)); },
      contains(c) { return classes.has(c); },
      toggle(c, on) { if (on === false) classes.delete(c); else if (on === true) classes.add(c); },
    },
    get innerHTML() { return ""; },
    set innerHTML(_v) { this.children = []; },
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; }, close() { this.open = false; },
    focus() {}, reset() {},
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; if (k in this) this[k] = ""; },
    closest() { return null; },
  };
}

function createHarness() {
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };
  const document = {
    body: createElementStub("body"),
    querySelector(s) { return getElement(s); },
    querySelectorAll() { return []; },
    createElement(t) { return createElementStub(t); },
    getElementById(id) { return getElement(`#${id}`); },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, confirm() { return true; },
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  openBookDetailDialog,
  setState(v) { state = v; },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
  el: (id) => document.getElementById(id),
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

function openWithBook(book) {
  const h = createHarness();
  h.setCurrentUser({ id: "u1" });
  h.setState({ books: [book], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {} });
  h.openBookDetailDialog(book.id);
  return h;
}

// --- 静态结构：详情弹窗里必须有封面容器 ---

test("bookDetailDialog 的 HTML 包含封面容器与提示文案", () => {
  assert.match(indexHtml, /id="bookDetailCoverWrap"/);
  assert.match(indexHtml, /id="bookDetailCoverLink"[^>]*target="_blank"/);
  assert.match(indexHtml, /id="bookDetailCoverImg"/);
  assert.match(indexHtml, /点击查看原图/);
});

// --- ① 有封面：显示缩略图，链接指向原图 ---

test("有封面时详情页显示封面，链接指向原图而非缩略图", () => {
  const h = openWithBook({
    id: "b1", title: "钟形罩", status: "reading",
    coverImageUrl: "/media/u1/c34af5c7b4d146d2.jpeg",
  });

  const wrap = h.el("bookDetailCoverWrap");
  const link = h.el("bookDetailCoverLink");
  const img = h.el("bookDetailCoverImg");

  assert.equal(wrap.classList.contains("is-hidden"), false, "封面容器必须显示");
  assert.match(img.src, /\.thumb\.jpg$/, "详情页展示用缩略图，避免拉原图");
  assert.equal(link.href, "/media/u1/c34af5c7b4d146d2.jpeg", "链接必须指向原图");
  assert.match(img.alt, /钟形罩/, "图片 alt 应包含书名");
});

// --- ② 缩略图丢失时回退原图 ---

test("缩略图加载失败时回退到原图，重复失败则停止", () => {
  const h = openWithBook({
    id: "b1", title: "钟形罩", status: "reading",
    coverImageUrl: "/media/u1/c34af5c7b4d146d2.jpeg",
  });
  const img = h.el("bookDetailCoverImg");
  assert.match(img.src, /\.thumb\.jpg$/);

  img.onerror();
  assert.equal(img.src, "/media/u1/c34af5c7b4d146d2.jpeg", "第一次失败回到原图");

  // 原图也 404 时不能无限重试
  img.onerror();
  assert.equal(img.src, "/media/u1/c34af5c7b4d146d2.jpeg", "重复失败保持原图，不再循环");
  assert.equal(img.onerror, null, "回退后清除 onerror");
});

// --- ③ 没有封面：整块隐藏 ---

test("没有封面时封面区隐藏且不残留上一次的 src/href", () => {
  const h = openWithBook({
    id: "b1", title: "钟形罩", status: "reading",
    coverImageUrl: "/media/u1/c34af5c7b4d146d2.jpeg",
  });
  // 先打开有封面的书，再打开没封面的书，验证状态被清理
  h.setState({
    books: [
      { id: "b1", title: "有封面", coverImageUrl: "/media/u1/c34af5c7b4d146d2.jpeg" },
      { id: "b2", title: "无封面" },
    ],
    sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {},
  });
  h.openBookDetailDialog("b2");

  const wrap = h.el("bookDetailCoverWrap");
  const link = h.el("bookDetailCoverLink");
  const img = h.el("bookDetailCoverImg");

  assert.equal(wrap.classList.contains("is-hidden"), true, "无封面必须隐藏");
  assert.equal(img.src, "", "不能残留上一本书的缩略图");
  assert.equal(link.href, "", "不能残留上一本书的原图链接");
});
