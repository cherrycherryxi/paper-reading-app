// OPT-118 拍书架批量加书：执行真实 app.js 的 runShelfOcr / confirmShelfOcr。
// 用例源自 2026-07-17 真实书架实测：模型给编造的书 0.70 高置信度 → 置信度只能
// 决定「默认勾不勾」，绝不能决定「显不显示」，用户才是过滤器。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

function elStub() {
  let innerHTML = "";
  return {
    hidden: false, value: "", textContent: "", className: "", dataset: {}, children: [], style: {},
    files: [], checked: false, open: false,
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); },
    appendChild() {}, append() {}, prepend() {}, insertAdjacentHTML() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    closest() { return null; }, focus() {}, scrollIntoView() {},
    showModal() { this.open = true; }, close() { this.open = false; }, reset() {},
  };
}

function createHarness({ shelfResponse } = {}) {
  const elements = new Map();
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, elStub()); return elements.get(id); };
  const toasts = [];
  const document = {
    querySelector: getEl, querySelectorAll: () => [],
    createElement: () => elStub(), getElementById: (id) => getEl(`#${id}`),
    body: elStub(), addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };
  const context = {
    console, document, window,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (url, options = {}) => {
      let body = {};
      const u = String(url);
      if (u.includes("/api/books/shelf-ocr")) body = shelfResponse ?? { books: [] };
      else if (u.includes("/api/state") && options.method === "PUT") {
        body = { state: JSON.parse(options.body || "{}"), stateVersion: "v1" };
      }
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
    },
    CustomEvent: function (t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout, requestAnimationFrame: (cb) => { cb(); return 1; },
  };
  const src = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${src}
globalThis.__hooks = {
  runShelfOcr, confirmShelfOcr, renderShelfOcrList, els,
  SHELF_OCR_MAX_PX, SHELF_OCR_AUTO_CHECK_CONFIDENCE,
  getCandidates(){ return shelfOcrCandidates; },
  setCandidates(v){ shelfOcrCandidates = v; },
  setState(v){ state = v; }, getState(){ return state; },
  setUser(u){ currentUser = u; }, setAuthToken, setShowToast(fn){ showToast = fn; },
  setRender(fn){ render = fn; }, setSyncState(fn){ syncState = fn; },
  // 真实 resizeImageToDataUrl 依赖浏览器 FileReader/Image，测试里替身并记录入参
  stubResize(fn){ resizeImageToDataUrl = fn; },
};`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const h = context.__hooks;
  h.setUser({ id: "u1" });
  h.setAuthToken("tok");
  h.setShowToast((m) => toasts.push(m));
  h.setRender(() => {});
  h.toasts = toasts;
  return h;
}

const FAKE_FILE = { name: "shelf.jpg" };

test("runShelfOcr：高置信默认勾选，低置信默认不勾但仍然显示", async () => {
  // 实测教训：编造的书也能拿到 0.70 —— 所以低置信必须「显示但不默认勾」。
  const h = createHarness({
    shelfResponse: { books: [
      { title: "一九八四", author: "[英] 乔治·奥威尔", confidence: 0.95 },
      { title: "当我们谈论爱情时我们在谈论什么", author: "[美] 雷蒙德·卡佛", confidence: 0.7 },
    ] },
  });
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  h.stubResize(async () => "data:image/jpeg;base64,xxx");

  await h.runShelfOcr(FAKE_FILE);
  const c = h.getCandidates();

  assert.equal(c.length, 2, "低置信的书也要显示出来让用户判断，不能被静默丢弃");
  assert.equal(c[0].checked, true, "0.95 高置信默认勾选");
  assert.equal(c[1].checked, false, "0.70 未达 0.8 阈值，默认不勾（它可能是编造的）");
  assert.equal(h.els.shelfOcrDialog.open, true, "应打开确认对话框");
});

test("runShelfOcr：书单里已有的书默认不勾选", async () => {
  const h = createHarness({
    shelfResponse: { books: [{ title: "蛙", author: "莫言", confidence: 0.95 }] },
  });
  h.setState({
    books: [{ id: "b1", title: "蛙", author: "莫言", tags: [] }],
    quotes: [], sessions: [], connections: [],
  });
  h.stubResize(async () => "data:image/jpeg;base64,xxx");

  await h.runShelfOcr(FAKE_FILE);
  const c = h.getCandidates();

  assert.equal(c[0].duplicate, true, "应识别为书单已有");
  assert.equal(c[0].checked, false, "已有的书默认不勾，重复扫描不会重复加入");
});

test("runShelfOcr：图片压到 2000px（1200 会糊掉书脊小字）", async () => {
  const h = createHarness({ shelfResponse: { books: [{ title: "X", confidence: 0.9 }] } });
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  let calledWith = null;
  h.stubResize(async (file, maxPx) => { calledWith = maxPx; return "data:image/jpeg;base64,xxx"; });

  await h.runShelfOcr(FAKE_FILE);

  assert.equal(calledWith, 2000);
  assert.equal(h.SHELF_OCR_MAX_PX, 2000);
});

test("runShelfOcr：零识别结果给出可操作提示，不开空对话框", async () => {
  const h = createHarness({ shelfResponse: { books: [] } });
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  h.stubResize(async () => "data:image/jpeg;base64,xxx");

  await h.runShelfOcr(FAKE_FILE);

  assert.equal(h.els.shelfOcrDialog.open, false, "没结果不该弹出空列表");
  assert.match(h.toasts.at(-1), /书脊/, "提示应告诉用户怎么改进拍摄");
});

test("confirmShelfOcr：只加入勾选的书，用选定的状态", async () => {
  const h = createHarness();
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  h.setSyncState(async () => {});
  h.setCandidates([
    { title: "谈美", author: "朱光潜", confidence: 0.9, duplicate: false, checked: true },
    { title: "不要这本", author: "", confidence: 0.4, duplicate: false, checked: false },
  ]);
  h.els.shelfOcrStatus.value = "reading";

  await h.confirmShelfOcr();
  const books = h.getState().books;

  assert.equal(books.length, 1, "只加勾选的那本");
  assert.equal(books[0].title, "谈美");
  assert.equal(books[0].status, "reading");
  assert.ok(books[0].startedAt, "阅读中应有开始日期");
  assert.equal(books[0].finishedAt, "", "阅读中不应有读完日期");
  assert.equal(h.els.shelfOcrDialog.open, false, "完成后关闭对话框");
});

test("confirmShelfOcr：用户改过的书名会被采用", async () => {
  const h = createHarness();
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  h.setSyncState(async () => {});
  // 模拟用户把模型拆错的副标题改成正确书名
  h.setCandidates([{ title: "重走", author: "杨潇", confidence: 0.6, duplicate: false, checked: true }]);

  await h.confirmShelfOcr();

  assert.equal(h.getState().books[0].title, "重走");
  assert.equal(h.getState().books[0].author, "杨潇");
});

test("confirmShelfOcr：勾选项与已有书重名时跳过，不产生重复", async () => {
  const h = createHarness();
  h.setState({
    books: [{ id: "b1", title: "蛙", author: "莫言", tags: [] }],
    quotes: [], sessions: [], connections: [],
  });
  h.setSyncState(async () => {});
  // 用户手动勾上了一本已存在的书
  h.setCandidates([
    { title: "蛙", author: "莫言", confidence: 0.9, duplicate: true, checked: true },
    { title: "夜晚的潜水艇", author: "陈春成", confidence: 0.95, duplicate: false, checked: true },
  ]);

  await h.confirmShelfOcr();
  const titles = h.getState().books.map((b) => b.title);

  assert.equal(titles.filter((t) => t === "蛙").length, 1, "已有的书不重复加入");
  assert.ok(titles.includes("夜晚的潜水艇"));
  assert.match(h.toasts.at(-1), /跳过/, "应告知用户跳过了已有的书");
});

test("confirmShelfOcr：一本都没勾时不写库", async () => {
  const h = createHarness();
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  let synced = false;
  h.setSyncState(async () => { synced = true; });
  h.setCandidates([{ title: "A", author: "", confidence: 0.9, duplicate: false, checked: false }]);

  await h.confirmShelfOcr();

  assert.equal(h.getState().books.length, 0);
  assert.equal(synced, false, "没勾选不应触发同步");
});

test("结构：入口 / 确认对话框 / 绑定 都在", () => {
  assert.ok(indexHtml.includes('id="shelfOcrInput"'), "应有拍书架入口");
  assert.ok(indexHtml.includes('id="shelfOcrDialog"'), "应有确认对话框");
  assert.ok(indexHtml.includes('id="shelfOcrConfirmBtn"'), "应有确认按钮");
  assert.match(appSource, /els\.shelfOcrInput\?\.addEventListener\("change"/, "应绑定入口");
  assert.match(appSource, /els\.shelfOcrConfirmBtn\?\.addEventListener\("click"/, "应绑定确认");
  // 确认步骤是必需项：置信度只能决定默认勾选，不能决定是否入列表
  assert.match(appSource, /checked: !duplicate && confidence >= SHELF_OCR_AUTO_CHECK_CONFIDENCE/);
});
