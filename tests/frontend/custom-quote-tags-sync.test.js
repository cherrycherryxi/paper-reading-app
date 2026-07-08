// OPT-078: 自定义摘抄标签跨设备同步回归覆盖。
// 标签此前只存 localStorage（换设备/清缓存即丢、不进导出包）。现纳入 state.customQuoteTags：
//  - 已登录：state 为权威，写入触发 syncState（PUT /api/state 全量持久化）+ localStorage 镜像；
//  - 未登录：回退 localStorage（本机也能记住敲过的标签）；
//  - 加载时把老 localStorage 标签一次性 union 进 state（幂等）。
// 通过 vm.runInNewContext 执行真实 app.js。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createElementStub(tagName = "div") {
  let innerHTML = "";
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, hidden: false,
    style: {}, dataset: {}, parentNode: null, children: [], files: [], _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    showModal() { this.open = true; }, close() { this.open = false; },
    reset() {}, setAttribute() {}, closest() { return null; },
  };
}

function createHarness({ localStorageStore = {} } = {}) {
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
  const fetchCalls = [];
  const context = {
    console, document, window,
    localStorage: {
      getItem: (k) => (k in localStorageStore ? localStorageStore[k] : null),
      setItem: (k, v) => { localStorageStore[k] = String(v); },
      removeItem: (k) => { delete localStorageStore[k]; },
    },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      let body = {};
      try { body = JSON.parse(options.body); } catch (_) {}
      // 回显发送的 state（模拟后端透传 customQuoteTags），带新版本号
      return {
        ok: true, status: 200,
        headers: { get(h) { return h === "content-type" ? "application/json" : null; } },
        json: async () => ({ state: body, stateVersion: "v-test" }),
      };
    },
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Set,
    Promise, setTimeout, clearTimeout,
    requestAnimationFrame(cb) { cb(); return 1; },
  };
  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
render = function () {};
activateTab = function () {};
globalThis.__hooks = {
  getCustomQuoteTags, saveCustomQuoteTags, migrateLocalCustomTagsIntoState, normalizeStateShape,
  setState(v) { state = v; },
  getState() { return state; },
  setCurrentUser(v) { currentUser = v; },
  setAuth(v) { authToken = v; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  hooks.fetchCalls = fetchCalls;
  hooks.localStorageStore = localStorageStore;
  return hooks;
}

const emptyState = () => ({ books: [], sessions: [], quotes: [], connections: [], chatHistories: {}, chatContexts: {}, customQuoteTags: [] });
const login = (h, tags = []) => {
  h.setState({ ...emptyState(), customQuoteTags: tags });
  h.setCurrentUser({ id: "u1" });
  h.setAuth("tok");
};
const stateSyncCalls = (h) => h.fetchCalls.filter((c) => c.url.includes("/api/state"));

// ─── normalizeStateShape ───

test("OPT-078: normalizeStateShape 默认补 customQuoteTags: []，并保留已有数组", () => {
  const h = createHarness();
  // normalizeStateShape 在 vm realm 内构造数组，spread 到测试 realm 再比较（避免跨 realm 原型不等）。
  assert.deepEqual([...h.normalizeStateShape({ books: [] }).customQuoteTags], [], "缺字段应补 []");
  assert.deepEqual(
    [...h.normalizeStateShape({ customQuoteTags: ["金句", "隐喻"] }).customQuoteTags],
    ["金句", "隐喻"], "已有数组应保留"
  );
  assert.deepEqual([...h.normalizeStateShape({ customQuoteTags: "bad" }).customQuoteTags], [], "非数组清成 []");
});

// ─── getCustomQuoteTags 来源分流 ───

test("OPT-078: 已登录时 getCustomQuoteTags 读 state（权威来源）", () => {
  const h = createHarness({ localStorageStore: { "quote-custom-tags": JSON.stringify(["旧本机"]) } });
  login(h, ["云端A", "云端B"]);
  assert.deepEqual(h.getCustomQuoteTags(), ["云端A", "云端B"], "登录后以 state 为准，不读本机镜像");
});

test("OPT-078: 未登录时 getCustomQuoteTags 回退 localStorage 镜像", () => {
  const h = createHarness({ localStorageStore: { "quote-custom-tags": JSON.stringify(["本机X", "本机Y"]) } });
  // 不登录
  assert.deepEqual(h.getCustomQuoteTags(), ["本机X", "本机Y"]);
});

// ─── saveCustomQuoteTags 双写 + 同步 ───

test("OPT-078: 已登录时 saveCustomQuoteTags 写 state + 触发 PUT /api/state + 镜像 localStorage", async () => {
  const h = createHarness();
  login(h, []);
  h.saveCustomQuoteTags(["  金句 ", "金句", "隐喻", "", 123]);
  await flush();
  assert.deepEqual(h.getState().customQuoteTags, ["金句", "隐喻"], "state 去重/去空白/去非字符串");
  assert.equal(stateSyncCalls(h).length, 1, "必须触发一次全量同步 PUT /api/state");
  assert.deepEqual(JSON.parse(h.localStorageStore["quote-custom-tags"]), ["金句", "隐喻"], "localStorage 镜像同步");
});

test("OPT-078: 未登录时 saveCustomQuoteTags 只写 localStorage，不发请求", async () => {
  const h = createHarness();
  // 不登录
  h.saveCustomQuoteTags(["离线标签"]);
  await flush();
  assert.deepEqual(JSON.parse(h.localStorageStore["quote-custom-tags"]), ["离线标签"]);
  assert.equal(stateSyncCalls(h).length, 0, "未登录不应发起同步");
});

// ─── 迁移：老 localStorage 标签并入 state ───

test("OPT-078: migrateLocalCustomTagsIntoState 把本机老标签 union 进 state 并同步（幂等）", async () => {
  const h = createHarness({ localStorageStore: { "quote-custom-tags": JSON.stringify(["老标签1", "老标签2"]) } });
  login(h, ["云端已有"]);
  h.migrateLocalCustomTagsIntoState();
  await flush();
  assert.deepEqual(
    h.getState().customQuoteTags, ["云端已有", "老标签1", "老标签2"], "union，保留顺序"
  );
  assert.equal(stateSyncCalls(h).length, 1, "有新增 → 同步一次");
  // 幂等：再调用一次，state 已含全部，不应再触发同步
  h.migrateLocalCustomTagsIntoState();
  await flush();
  assert.equal(stateSyncCalls(h).length, 1, "无新增 → 不再同步（幂等）");
});

test("OPT-078: 本机无老标签时迁移是 no-op", async () => {
  const h = createHarness();
  login(h, ["云端"]);
  h.migrateLocalCustomTagsIntoState();
  await flush();
  assert.deepEqual(h.getState().customQuoteTags, ["云端"]);
  assert.equal(stateSyncCalls(h).length, 0);
});
