// 真机事故（2026-07-17）：拍完书架切到别的 App，回来显示「无法连接后端服务，
// 请确认已启动 ./scripts/dev_backend.sh」。实情是 iOS 挂起了标签页、断了 socket，
// 后端那次 OCR 其实跑成功了（16s，1373 字节结果）。把一切网络失败都归因成
// 「后端没启动」并叫用户去跑 dev 脚本，对手机用户是纯误导。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function elStub() {
  return {
    hidden: false, value: "", textContent: "", dataset: {}, children: [], style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    get innerHTML() { return ""; }, set innerHTML(_v) {},
    appendChild() {}, insertAdjacentHTML() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    showModal() {}, close() {}, reset() {}, setAttribute() {}, closest: () => null,
  };
}

function createHarness({ fetchImpl } = {}) {
  const listeners = {};
  const document = {
    visibilityState: "visible",
    querySelector: () => elStub(),
    querySelectorAll: () => [],
    createElement: () => elStub(),
    getElementById: () => elStub(),
    body: elStub(),
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const context = {
    console, document,
    window: {
      PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
      dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
      setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: fetchImpl,
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };
  const src = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  vm.runInNewContext(`${src}
globalThis.__hooks = { apiFetch, setAuthToken };`, context, { filename: "app.js" });
  return {
    hooks: context.__hooks,
    // 模拟 iOS：把页面切到后台（此时 JS 也被挂起，回来才继续跑）
    goHidden() {
      document.visibilityState = "hidden";
      (listeners.visibilitychange || []).forEach((fn) => fn());
      document.visibilityState = "visible"; // 用户切回来了
    },
  };
}

test("切走导致请求中断时，提示中断而不是「后端没启动」", async () => {
  let hide;
  const h = createHarness({
    fetchImpl: async () => {
      hide(); // 请求进行中，用户切到别的 App
      throw new TypeError("Load failed"); // iOS 断掉 socket 后 fetch 的真实报错
    },
  });
  hide = h.goHidden;
  h.hooks.setAuthToken("tok");

  await assert.rejects(
    () => h.hooks.apiFetch("/api/books/shelf-ocr", { method: "POST" }, true),
    (err) => {
      assert.match(err.message, /中断|暂停/, "应说明是被系统暂停打断");
      assert.doesNotMatch(err.message, /dev_backend|app_server\.py/, "不该叫手机用户去跑开发脚本");
      return true;
    }
  );
});

test("页面全程可见时的网络失败，提示网络问题", async () => {
  const h = createHarness({
    fetchImpl: async () => { throw new TypeError("Load failed"); },
  });
  h.hooks.setAuthToken("tok");

  await assert.rejects(
    () => h.hooks.apiFetch("/api/state", {}, true),
    (err) => {
      assert.match(err.message, /网络/, "应提示网络问题");
      assert.doesNotMatch(err.message, /中断|暂停/, "没切走就不该说是被中断");
      assert.doesNotMatch(err.message, /dev_backend|app_server\.py/);
      return true;
    }
  );
});

test("请求开始前切走过、但请求本身没跨越后台，不应误报中断", async () => {
  const h = createHarness({
    fetchImpl: async () => { throw new TypeError("Load failed"); },
  });
  h.hooks.setAuthToken("tok");
  h.goHidden();                       // 很久以前切走过又回来了
  await new Promise((r) => setTimeout(r, 5));

  await assert.rejects(
    () => h.hooks.apiFetch("/api/state", {}, true),
    (err) => {
      assert.match(err.message, /网络/, "旧的切走记录不该影响之后的请求");
      return true;
    }
  );
});

test("源码：不再把网络失败一律归因为「后端未启动」", () => {
  assert.doesNotMatch(appSource, /无法连接后端服务/, "该文案对手机用户是误导");
  assert.match(appSource, /lastHiddenAt/, "应记录隐藏时刻来区分中断与网络故障");
});
