// 新用户 onboarding：注册即种入示例内容（isSample 标记），前端顶部「一键清除」横幅，
// 空状态提供「载入示例」。本测试执行真实 app.js 验证 hasSampleData/clearSampleData/
// loadSampleData 行为，并做结构性源码断言。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "app_server.py"), "utf8");

function elStub(tag = "div") {
  let html = "";
  const el = {
    tagName: String(tag).toUpperCase(),
    hidden: false, value: "", textContent: "", className: "", disabled: false,
    dataset: {}, children: [], style: {}, files: [],
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); el.children = []; },
    appendChild(c) { el.children.push(c); return c; },
    append(...cs) { el.children.push(...cs); },
    prepend(c) { el.children.unshift(c); },
    insertAdjacentHTML(pos, v) { html = pos === "afterbegin" ? v + html : html + v; },
    removeChild() {}, remove() {},
    querySelector() { return elStub("div"); },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    closest() { return null; }, focus() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
  };
  return el;
}

function createHarness() {
  const elements = new Map();
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, elStub()); return elements.get(id); };
  const document = {
    querySelector: getEl, querySelectorAll: () => [],
    createElement: (tag) => elStub(tag), getElementById: (id) => getEl(`#${id}`),
    body: elStub(), addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  // fetch 桩：GET /api/sample-state 返回示例；PUT /api/state 回显发送的 body 作为新 state。
  const SAMPLE = {
    books: [{ id: "sample-book-marquez", title: "百年孤独", isSample: true }],
    quotes: [{ id: "sample-quote-marquez", bookId: "sample-book-marquez", content: "…", isSample: true }],
    connections: [], sessions: [],
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (url, options = {}) => {
      let body = {};
      if (String(url).includes("/api/sample-state")) body = { sample: SAMPLE };
      else if (String(url).includes("/api/state")) {
        const sent = options.body ? JSON.parse(options.body) : {};
        body = { state: sent, stateVersion: "v1" };
      }
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
    },
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };
  const src = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${src}
globalThis.__hooks = {
  hasSampleData, clearSampleData, loadSampleData,
  setState(v){ state = v; }, getState(){ return state; },
  setUser(u){ currentUser = u; }, setAuthToken,
};`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

test("hasSampleData：state 含 isSample 条目时为真，全清后为假", () => {
  const h = createHarness();
  h.setState({ books: [{ id: "b", isSample: true }], quotes: [], connections: [], sessions: [] });
  assert.equal(h.hasSampleData(), true);
  h.setState({ books: [{ id: "b" }], quotes: [], connections: [], sessions: [] });
  assert.equal(h.hasSampleData(), false);
});

test("clearSampleData：只删 isSample 条目，用户自己的内容保留", async () => {
  const h = createHarness();
  h.setUser({ id: "u1" });
  h.setState({
    books: [{ id: "mine", title: "我的书" }, { id: "s1", isSample: true }],
    quotes: [{ id: "sq", isSample: true }],
    connections: [], sessions: [{ id: "ss", isSample: true }],
  });
  await h.clearSampleData();
  const st = h.getState();
  assert.deepEqual(st.books.map((b) => b.id), ["mine"], "示例书删除、我的书保留");
  assert.equal(st.quotes.length, 0);
  assert.equal(st.sessions.length, 0);
  assert.equal(h.hasSampleData(), false);
});

test("loadSampleData：从后端拉取示例并按 id 去重合并", async () => {
  const h = createHarness();
  h.setUser({ id: "u1" });
  h.setAuthToken("tok"); // loadSampleData 走 requireAuth，需要 token
  h.setState({ books: [], quotes: [], connections: [], sessions: [] });
  await h.loadSampleData();
  const st = h.getState();
  assert.ok(st.books.some((b) => b.id === "sample-book-marquez"), "载入了示例书");
  // 再载一次不应重复
  await h.loadSampleData();
  const dup = h.getState().books.filter((b) => b.id === "sample-book-marquez").length;
  assert.equal(dup, 1, "重复载入应按 id 去重");
});

test("结构：横幅/清除按钮/CSS/注册种入 都到位", () => {
  assert.ok(indexHtml.includes('id="sampleBanner"'), "index.html 应有示例横幅");
  assert.ok(indexHtml.includes('id="clearSampleBtn"'), "应有清除按钮");
  assert.match(cssSource, /\.sample-banner\s*\{/, "应有 .sample-banner 样式");
  assert.ok(appSource.includes("renderSampleBanner()"), "render() 应渲染横幅");
  assert.ok(/INSERT INTO user_state[\s\S]{0,120}build_sample_state\(\)/.test(serverSource),
    "注册须种入 build_sample_state()");
  assert.match(serverSource, /\/api\/sample-state/, "应有 /api/sample-state 端点");
});

test("横幅 [hidden] 必须生效(display:flex 会压过 hidden，否则空账号也永远显示)", () => {
  assert.match(cssSource, /\.sample-banner\[hidden\]\s*\{[^}]*display:\s*none/,
    ".sample-banner[hidden] 须显式 display:none");
});

test("探讨(chat)tab 不显示横幅(固定高度布局会被横幅顶掉输入框)", () => {
  assert.match(appSource, /renderSampleBanner[\s\S]{0,200}data-tab-section="chat"[\s\S]{0,120}tab-active/,
    "renderSampleBanner 须在 chat tab 激活时隐藏横幅");
  assert.match(appSource, /tab-active[\s\S]{0,200}renderSampleBanner\(\)/,
    "activateTab 切换后须调用 renderSampleBanner 更新可见性");
});
