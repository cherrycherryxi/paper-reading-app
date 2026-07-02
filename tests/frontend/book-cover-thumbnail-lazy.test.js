// 书单封面「缩略图 + 懒加载」优化：书单原来一次性拉 28MB 原图封面，改为用
// sips 预生成的 .thumb.jpg（~30KB/张）+ loading="lazy"，只加载可见封面。
// 缩略图缺失时 onerror 先退回原图、再退默认封面。
//
// 本测试：① 真实执行 app.js 的 thumbPath 断言路径映射；② 源码级断言书卡/摘抄图的 wiring。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function elStub() {
  let innerHTML = "";
  return {
    value: "",
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
  };
}

function loadThumbPath() {
  const document = {
    querySelector: () => elStub(),
    querySelectorAll: () => [],
    createElement: () => elStub(),
    getElementById: () => elStub(),
    body: elStub(),
    addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };
  const src = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  vm.runInNewContext(`${src}\nglobalThis.__hooks = { thumbPath };\n`, context, { filename: "app.js" });
  return context.__hooks.thumbPath;
}

test("thumbPath: /media|/uploads 图片映射到同目录 .thumb.jpg", () => {
  const thumbPath = loadThumbPath();
  assert.equal(thumbPath("/media/user-x/abc.jpeg"), "/media/user-x/abc.thumb.jpg");
  assert.equal(thumbPath("/uploads/u/p.png"), "/uploads/u/p.thumb.jpg");
});

test("thumbPath: 非上传图（默认封面 / data URI / 空）原样返回", () => {
  const thumbPath = loadThumbPath();
  assert.equal(thumbPath("./assets/default-book-cover.jpeg?v=20260519g"), "./assets/default-book-cover.jpeg?v=20260519g");
  assert.equal(thumbPath("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(thumbPath(""), "");
  assert.equal(thumbPath(null), null);
});

test("thumbPath: 已是缩略图不重复加后缀；保留 query 串", () => {
  const thumbPath = loadThumbPath();
  assert.equal(thumbPath("/media/u/x.thumb.jpg"), "/media/u/x.thumb.jpg");
  assert.equal(thumbPath("/media/u/x.jpeg?v=2"), "/media/u/x.thumb.jpg?v=2");
});

test("书卡源码：封面走缩略图 + loading=lazy + data-full 兜底", () => {
  assert.ok(appSource.includes("const coverThumb = resolveImageUrl(thumbPath(rawCover))"),
    "书卡应计算 coverThumb");
  assert.ok(appSource.includes('src="${coverThumb}"'), "书卡 <img> 应用缩略图作 src");
  assert.ok(appSource.includes('loading="lazy" decoding="async"'), "书卡 <img> 应懒加载");
  assert.ok(appSource.includes('data-full="${coverImage}"'), "书卡 <img> 应带 data-full 原图兜底");
});

test("封面兜底：先退原图(triedFull)，再退默认封面", () => {
  assert.ok(appSource.includes('img.dataset.triedFull !== "true"'), "应先尝试原图");
  assert.ok(appSource.includes("img.src = full;"), "应把 src 换成 data-full 原图");
  assert.ok(appSource.includes("img.src = DEFAULT_BOOK_COVER_URL;"), "最终退默认封面");
});

test("摘抄图也懒加载", () => {
  assert.ok(appSource.includes('resolveImageUrl(quote.imageUrl)}" loading="lazy" decoding="async"'),
    "摘抄卡片 <img> 应懒加载");
});
