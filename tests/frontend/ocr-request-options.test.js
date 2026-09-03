// 回归锁：buildOcrRequestOptions 在「无新图、仅复用已有 imageUrl」的编辑态重识别时，
// 绝不能把空 dataUrl 包装成 0 字节 blob 上传——那会让后端把它当空的新图，
// 覆盖 quote 的 imageUrl 并导致 OCR「empty image」失败（照片消失 bug）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function buildContext(extraGlobals = {}) {
  const genericEl = () => ({
    className: "", textContent: "", style: {}, dataset: {}, value: "", hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    appendChild() {}, replaceWith() {}, focus() {},
  });
  const document = {
    querySelector() { return genericEl(); },
    querySelectorAll() { return []; },
    getElementById() { return genericEl(); },
    createElement() { return genericEl(); },
    addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout(fn) { return fn && fn(); }, clearTimeout() {},
    paperReadingApp: {},
  };
  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Promise,
    setTimeout, clearTimeout,
    ...extraGlobals,
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__hooks = { buildOcrRequestOptions };
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

test("空 dataUrl（编辑态复用 imageUrl）→ JSON 请求，imageDataUrl 为空、imageUrl 保留", () => {
  const hooks = buildContext();
  const options = hooks.buildOcrRequestOptions("", {
    quoteId: "q-1", bookId: "b-1", engine: "fast", imageUrl: "/media/u/img.png",
  });
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.ok(options.body instanceof String || typeof options.body === "string");
  const parsed = JSON.parse(options.body);
  assert.equal(parsed.imageDataUrl, "");
  assert.equal(parsed.imageUrl, "/media/u/img.png");
  assert.equal(parsed.quoteId, "q-1");
});

test("有效 dataUrl → JSON fallback 形态携带 imageDataUrl", () => {
  const hooks = buildContext();
  const options = hooks.buildOcrRequestOptions("data:image/jpeg;base64,AAAA", {
    imageUrl: "", engine: "fast",
  });
  assert.equal(options.headers["Content-Type"], "application/json");
  const parsed = JSON.parse(options.body);
  assert.equal(parsed.imageDataUrl, "data:image/jpeg;base64,AAAA");
});

test("空 dataUrl 即使 Blob 可用也绝不走 0 字节 blob 上传", () => {
  // Node 提供全局 Blob/atob：让 vm 环境走 octet-stream 分支（真实 iOS 行为）。
  const hooks = buildContext({ Blob, atob });
  const options = hooks.buildOcrRequestOptions("", {
    quoteId: "q-1", imageUrl: "/media/u/img.png",
  });
  // 空 dataUrl → 必须 JSON 兜底；Blob 分支只在有真实 data 时启用。
  assert.equal(options.headers["Content-Type"], "application/json");
  const parsed = JSON.parse(options.body);
  assert.equal(parsed.imageDataUrl, "");
  assert.equal(parsed.imageUrl, "/media/u/img.png");
});

test("有 dataUrl 且 Blob 可用 → octet-stream 直传（行为不回退）", () => {
  const hooks = buildContext({ Blob, atob });
  const options = hooks.buildOcrRequestOptions("data:image/png;base64,QUJD", {
    quoteId: "q-1",
  });
  assert.equal(options.headers["Content-Type"], "application/octet-stream");
  assert.ok(options.body instanceof Blob);
  const meta = JSON.parse(decodeURIComponent(options.headers["X-OCR-Metadata"]));
  assert.equal(meta.quoteId, "q-1");
});

test("非 data: 前缀的畸形 dataUrl 也视为无图（不产生空 blob）", () => {
  const hooks = buildContext({ Blob, atob });
  const options = hooks.buildOcrRequestOptions("not-a-data-url", { imageUrl: "/media/u/x.png" });
  assert.equal(options.headers["Content-Type"], "application/json");
  const parsed = JSON.parse(options.body);
  assert.equal(parsed.imageDataUrl, "");
});
