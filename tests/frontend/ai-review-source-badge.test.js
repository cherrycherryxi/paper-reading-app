// OPT-101: AI 起草的读后感要标注来源（「AI 根据笔记整理」），与手写读后感区分。
// 2026-07-06 signal 原话：「展示时明确标注 AI 根据笔记整理，与手写读后感区分」。
// 判定规则：本次 AI 起草的原文一字未改 → book.reviewIsAi=true；用户改过 → 算手写。
// 本测试真跑 app.js 的 generateBookReview / saveBookEdit / openBookDetailDialog /
// renderBookShareCard，不做源码级正则断言。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const classes = new Set();
  const listeners = {};
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, scrollTop: 0,
    style: {}, dataset: {}, children: [], _listeners: listeners,
    classList: {
      add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
      toggle() {}, contains(c) { return classes.has(c); },
    },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {}, dispatchEvent() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    showModal() { this.open = true; }, close() { this.open = false; },
    reset() {}, setAttribute() {}, removeAttribute() {}, closest() { return null; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, width: 0 }; },
  };
}

// 只把测试关心的字段塞进 FormData 语义的 stub。
function formDataOf(fields) {
  return { get: (k) => (k in fields ? fields[k] : null) };
}

function createHarness({ aiReply = "" } = {}) {
  const draws = { texts: [] };
  const elements = new Map();
  const getElement = (s) => { if (!elements.has(s)) elements.set(s, createElementStub()); return elements.get(s); };

  const sharedCtx = {
    fillStyle: "", strokeStyle: "", font: "", lineWidth: 0, textBaseline: "",
    fillRect() {}, strokeRect() {}, fillText(t) { draws.texts.push(String(t)); },
    beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {},
    stroke() {}, fill() {}, save() {}, restore() {}, clip() {}, drawImage() {},
    measureText(t) { return { width: String(t).length * 22 }; },
  };
  const document = {
    body: createElementStub("body"),
    querySelector(s) { return getElement(s); },
    querySelectorAll() { return []; },
    getElementById(id) { return getElement(`#${id}`); },
    createElement(t) {
      const el = createElementStub(t);
      if (t === "canvas") {
        el.getContext = () => sharedCtx;
        el.toDataURL = () => "data:image/png;base64,FAKE";
      }
      return el;
    },
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    clearTimeout() {}, setTimeout(fn) { return fn(); }, innerHeight: 800,
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    // /api/chat 返回 AI 草稿；/api/state 等一律成功。
    fetch: async (url) => ({
      ok: true, status: 200,
      headers: { get() { return "application/json"; } },
      json: async () => (String(url).includes("/api/chat") ? { reply: aiReply } : {}),
    }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    Event: function Event(type) { this.type = type; },
    Image: function Image() { setTimeout(() => this.onerror && this.onerror(), 0); },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Set,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
    __draws: draws,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
showToast = function () {};
closeDialog = function () {};
restoreEditedBookPosition = function () {};
syncState = async function () {};
globalThis.__hooks = {
  generateBookReview, saveBookEdit, openBookDetailDialog, renderBookShareCard,
  REVIEW_AI_LABEL, els,
  setState(v) { state = v; },
  setUser(v) { currentUser = v; authToken = "test-token"; },
  getBook(id) { return state.books.find((b) => b.id === id); },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return { hooks: context.__hooks, draws };
}

const AI_DRAFT = "作者把县城的账本摊开来讲，读完才明白土地财政不是口号而是账。";

// 装一本书 + 一个「AI 起草」用的 textarea（generateBookReview 只需要它的 value）。
function mountBook(hooks, book = {}) {
  hooks.setUser({ id: "u1", username: "me" });
  hooks.setState({
    books: [{
      id: "b1", title: "置身事内", author: "兰小欢", status: "reading",
      totalPages: 0, currentPage: 10, tags: [], notes: "内容简介：中国政府与经济发展。",
      review: "", rating: 0, createdAt: "2026-01-01T00:00:00.000Z", ...book,
    }],
    sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {},
  });
  return { textarea: createElementStub("textarea") };
}

const editForm = (over = {}) => formDataOf({
  bookId: "b1", currentPage: "10", status: "reading",
  startedAt: "", finishedAt: "", notes: "内容简介：中国政府与经济发展。",
  review: "", rating: "0", ...over,
});

// ─── 保存时的来源判定 ────────────────────────────────────────────────────────

test("OPT-101: AI 起草原文未改动 → 保存后 book.reviewIsAi === true", async () => {
  const { hooks } = createHarness({ aiReply: AI_DRAFT });
  const { textarea } = mountBook(hooks);

  await hooks.generateBookReview("b1", textarea);
  assert.equal(textarea.value, AI_DRAFT, "AI 草稿应填进 textarea");

  await hooks.saveBookEdit(editForm({ review: textarea.value }));

  const book = hooks.getBook("b1");
  assert.equal(book.review, AI_DRAFT);
  assert.equal(book.reviewIsAi, true, "未改动的 AI 草稿应标记为 AI 来源");
});

test("OPT-101: AI 起草后用户改过正文 → 算手写，reviewIsAi === false", async () => {
  const { hooks } = createHarness({ aiReply: AI_DRAFT });
  const { textarea } = mountBook(hooks);

  await hooks.generateBookReview("b1", textarea);
  await hooks.saveBookEdit(editForm({ review: AI_DRAFT + "——但我更在意其中的县域样本。" }));

  assert.equal(hooks.getBook("b1").reviewIsAi, false, "用户改过就不该再标 AI");
});

test("OPT-101: 从未点过 AI 起草的手写读后感 → reviewIsAi === false", async () => {
  const { hooks } = createHarness();
  mountBook(hooks);

  await hooks.saveBookEdit(editForm({ review: "读完像把一笔糊涂账算清了。" }));

  assert.equal(hooks.getBook("b1").reviewIsAi, false);
});

test("OPT-101: 已标记 AI 的书，重开只改页码、读后感未动 → 标记保留", async () => {
  const { hooks } = createHarness();
  mountBook(hooks, { review: AI_DRAFT, reviewIsAi: true });

  // 没有点「AI 起草」，只是把页码从 10 改到 88，读后感原样带回表单
  await hooks.saveBookEdit(editForm({ currentPage: "88", review: AI_DRAFT }));

  const book = hooks.getBook("b1");
  assert.equal(book.currentPage, 88);
  assert.equal(book.reviewIsAi, true, "正文没动，AI 标记不应被洗掉");
});

test("OPT-101: 已标记 AI 的书，用户改写读后感 → 标记转为手写", async () => {
  const { hooks } = createHarness();
  mountBook(hooks, { review: AI_DRAFT, reviewIsAi: true });

  await hooks.saveBookEdit(editForm({ review: "我自己重写的一句话。" }));

  assert.equal(hooks.getBook("b1").reviewIsAi, false);
});

test("OPT-101: 清空读后感 → 标记归零（不留孤儿标记）", async () => {
  const { hooks } = createHarness();
  mountBook(hooks, { review: AI_DRAFT, reviewIsAi: true });

  await hooks.saveBookEdit(editForm({ review: "" }));

  const book = hooks.getBook("b1");
  assert.equal(book.review, "");
  assert.equal(book.reviewIsAi, false);
});

test("OPT-101: A 书的 AI 草稿不会污染 B 书的保存", async () => {
  const { hooks } = createHarness({ aiReply: AI_DRAFT });
  mountBook(hooks);
  const state = hooks.getBook("b1");
  assert.ok(state);
  // 再加一本 b2，并把 b1 的 AI 草稿原文粘到 b2 的读后感里保存
  hooks.setState({
    books: [
      { id: "b1", title: "置身事内", tags: [], status: "reading", currentPage: 0, notes: "", review: "" },
      { id: "b2", title: "别的书", tags: [], status: "reading", currentPage: 0, notes: "", review: "" },
    ],
    sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {},
  });
  const textarea = createElementStub("textarea");
  await hooks.generateBookReview("b1", textarea); // pendingAiReview 记的是 b1

  await hooks.saveBookEdit(formDataOf({
    bookId: "b2", currentPage: "0", status: "reading", startedAt: "", finishedAt: "",
    notes: "", review: AI_DRAFT, rating: "0",
  }));

  assert.equal(hooks.getBook("b2").reviewIsAi, false,
    "草稿是给 b1 生成的，同样的文字出现在 b2 不应算 b2 的 AI 来源");
});

// ─── 展示：书详情页 ──────────────────────────────────────────────────────────

test("OPT-101: 书详情页——AI 读后感打「AI 根据笔记整理」标签，手写打「我的读后」", () => {
  {
    const { hooks } = createHarness();
    mountBook(hooks, { review: AI_DRAFT, reviewIsAi: true });
    hooks.openBookDetailDialog("b1");

    const html = hooks.els.bookDetailIntro.innerHTML;
    assert.ok(html.includes(hooks.REVIEW_AI_LABEL), "应打 AI 来源标签");
    assert.ok(html.includes("book-detail-sub-label--ai"), "应带 AI 标签样式类");
    assert.ok(!html.includes("我的读后"), "AI 读后感不应再标「我的读后」");
    assert.ok(html.includes(AI_DRAFT), "正文照常展示");
  }
  {
    const { hooks } = createHarness();
    mountBook(hooks, { review: "读完像把一笔糊涂账算清了。", reviewIsAi: false });
    hooks.openBookDetailDialog("b1");

    const html = hooks.els.bookDetailIntro.innerHTML;
    assert.ok(html.includes("我的读后"), "手写读后感仍标「我的读后」");
    assert.ok(!html.includes(hooks.REVIEW_AI_LABEL), "手写不应被标成 AI");
    assert.ok(!html.includes("book-detail-sub-label--ai"));
  }
});

// ─── 展示：分享卡 ────────────────────────────────────────────────────────────

test("OPT-101: 分享卡——AI 读后感画「AI 根据笔记整理」，手写画「我的读后」", async () => {
  {
    const { hooks, draws } = createHarness();
    await hooks.renderBookShareCard({
      id: "b1", title: "置身事内", author: "兰小欢", status: "finished",
      review: AI_DRAFT, reviewIsAi: true, notes: "内容简介。", tags: [],
    });
    const j = draws.texts.join("|");
    assert.ok(j.includes(hooks.REVIEW_AI_LABEL), "分享卡应画 AI 来源标签");
    assert.ok(!j.includes("我的读后"));
  }
  {
    const { hooks, draws } = createHarness();
    await hooks.renderBookShareCard({
      id: "b1", title: "置身事内", author: "兰小欢", status: "finished",
      review: "读完像把一笔糊涂账算清了。", notes: "内容简介。", tags: [],
    });
    const j = draws.texts.join("|");
    assert.ok(j.includes("我的读后"), "手写读后感分享卡仍画「我的读后」");
    assert.ok(!j.includes(hooks.REVIEW_AI_LABEL));
  }
});

// ─── 历史数据 / 导入数据 ─────────────────────────────────────────────────────

test("OPT-101: 没有 reviewIsAi 字段的旧书/导入书按手写展示（不误标 AI）", () => {
  const { hooks } = createHarness();
  // 豆瓣/Excel 导入与本次改动之前保存的书都没有这个字段
  mountBook(hooks, { review: "从豆瓣导入的人写读后感。" });
  delete hooks.getBook("b1").reviewIsAi;

  hooks.openBookDetailDialog("b1");
  const html = hooks.els.bookDetailIntro.innerHTML;
  assert.ok(html.includes("我的读后"), "字段缺失应回落手写");
  assert.ok(!html.includes(hooks.REVIEW_AI_LABEL));
});
