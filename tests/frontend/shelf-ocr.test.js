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
  runShelfOcr, confirmShelfOcr, renderShelfOcrList, els, isSameBook, titlesAreSame,
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
  // 确认步骤是必需项：置信度只能决定默认勾选，不能决定是否入列表。
  // 锚定意图而非字面写法——已有/可能重复/低置信 都不得默认勾选。
  assert.match(appSource, /checked: !duplicate && !nearMiss && confidence >= SHELF_OCR_AUTO_CHECK_CONFIDENCE/);
});

// —— isSameBook 归一化（2026-07-17 真机实测暴露：本功能给 owner 库里造了 4 本重复书）——
function matchHarness() {
  const h = createHarness();
  return h;
}

test("isSameBook：书名的主副标题分隔符（·/空格/冒号）不影响匹配", () => {
  const h = matchHarness();
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  // 真实事故：书架 OCR 给「羊道 深山夏牧场」，库里是「羊道·深山夏牧场」→ 造了重复
  assert.equal(h.isSameBook("羊道 深山夏牧场", "李娟", "羊道·深山夏牧场", "李娟"), true);
  assert.equal(h.isSameBook("羊道:春牧场", "李娟", "羊道·春牧场", "李娟"), true);
});

test("isSameBook：译名作者的简写视为同一人", () => {
  const h = matchHarness();
  const full = "[英] 弗里德里希·奥古斯特·冯·哈耶克";
  assert.equal(h.isSameBook("通往奴役之路", "[英] 哈耶克", "《通往奴役之路》", full), true);
  assert.equal(h.isSameBook("通往奴役之路", "[英] 弗里德里希·哈耶克", "《通往奴役之路》", full), true);
});

test("isSameBook：仅共享部分名字的不同人仍然区分", () => {
  const h = matchHarness();
  assert.equal(h.isSameBook("到灯塔去", "[英] 弗吉尼亚·伍尔夫", "到灯塔去", "[英] 伦纳德·伍尔夫"), false);
  assert.equal(h.isSameBook("活着", "余华", "活着", "泰戈尔"), false);
  assert.equal(h.isSameBook("某书", "金", "某书", "金庸"), false, "姓氏前缀不是简写");
});

test("runShelfOcr：分隔符/简写差异的书应被认出「书单已有」而不是重复加入", async () => {
  const h = createHarness({
    shelfResponse: { books: [
      { title: "羊道 深山夏牧场", author: "李娟", confidence: 0.9 },
      { title: "通往奴役之路", author: "[英] 弗里德里希·哈耶克", confidence: 0.9 },
    ] },
  });
  h.setState({
    books: [
      { id: "b1", title: "羊道·深山夏牧场", author: "李娟", tags: [] },
      { id: "b2", title: "《通往奴役之路》", author: "[英] 弗里德里希·奥古斯特·冯·哈耶克", tags: [] },
    ],
    quotes: [], sessions: [], connections: [],
  });
  h.stubResize(async () => "data:image/jpeg;base64,xxx");

  await h.runShelfOcr(FAKE_FILE);
  const c = h.getCandidates();

  assert.equal(c[0].duplicate, true, "羊道：分隔符不同也应认出已有");
  assert.equal(c[0].checked, false, "已有的书不该默认勾选");
  assert.equal(c[1].duplicate, true, "哈耶克：作者简写也应认出已有");
  assert.equal(c[1].checked, false);
});

test("isSameBook：封面全称（带副标题）与库里的主标题视为同一本", () => {
  const h = matchHarness();
  // 真实事故：OCR 读到封面《重走：在公路、河流和驿道上寻找西南联大》，
  // 库里是《重走》（已读完·四星）→ 造了重复。
  assert.equal(h.isSameBook("重走：在公路、河流和驿道上寻找西南联大", "杨潇", "重走", "杨潇"), true);
  assert.equal(h.isSameBook("重走", "杨潇", "重走：在公路、河流和驿道上寻找西南联大", "杨潇"), true);
});

test("isSameBook：副标题规则不能吞掉系列书", () => {
  const h = matchHarness();
  assert.equal(h.isSameBook("明朝那些事儿：第一部", "", "明朝那些事儿：第二部", ""), false);
  assert.equal(h.isSameBook("羊道·春牧场", "李娟", "羊道·深山夏牧场", "李娟"), false);
  assert.equal(h.isSameBook("第二性 I", "", "第二性 II", ""), false);
  assert.equal(h.isSameBook("羊道", "李娟", "羊道·春牧场", "李娟"), false, "· 是系列分隔符不是副标题标记");
  assert.equal(h.isSameBook("活着", "", "活着为了讲述", ""), false, "边界处无分隔符=不同的书");
});

test("渲染：书名独占整行，作者与提示在下一行（手机上不截断）", () => {
  const h = matchHarness();
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  h.setCandidates([{ title: "重走：在公路、河流和驿道上寻找西南联大", author: "杨潇", confidence: 0.9, duplicate: false, checked: true }]);
  h.renderShelfOcrList();
  const html = h.els.shelfOcrList.innerHTML;
  assert.match(html, /class="shelf-ocr-title"[^>]*value="重走：在公路、河流和驿道上寻找西南联大"/, "书名应完整进入输入框");
  assert.match(html, /shelf-ocr-sub/, "作者与提示应在独立的次行容器里");
});

test("runShelfOcr：书名相同但作者对不上 → 标「可能重复」且默认不勾", async () => {
  // 真实事故（2026-07-17 第三轮）：库里「[英] 本吉·沃特豪斯」，书架 OCR 读成
  // 「[英] 本吉·沃特斯豪斯」（译名用字差一个「斯」）。规则判不出来，模糊匹配又会
  // 把「余华/余桦」这类误合 —— 所以把疑点摆到台面上让人判断。
  const h = createHarness({
    shelfResponse: { books: [
      { title: "也不知道谁更疯：一名精神科医生的精神之旅", author: "[英] 本吉·沃特斯豪斯", confidence: 0.9 },
    ] },
  });
  h.setState({
    books: [{ id: "b1", title: "《也不知道谁更疯》", author: "[英] 本吉·沃特豪斯", tags: [] }],
    quotes: [], sessions: [], connections: [],
  });
  h.stubResize(async () => "data:image/jpeg;base64,xxx");

  await h.runShelfOcr(FAKE_FILE);
  const c = h.getCandidates()[0];

  assert.equal(c.duplicate, false, "规则判不出精确重复");
  assert.ok(c.possibleDuplicateOf, "但书名相同 → 必须标为可能重复");
  assert.match(c.possibleDuplicateOf.title, /也不知道谁更疯/);
  assert.equal(c.checked, false, "可能重复的默认不勾，绝不能因高置信而自动加入");
});

test("renderShelfOcrList：「可能重复」要指名道姓是哪一本", () => {
  const h = matchHarness();
  h.setCandidates([{
    title: "也不知道谁更疯", author: "[英] 本吉·沃特斯豪斯", confidence: 0.9,
    duplicate: false, possibleDuplicateOf: { title: "《也不知道谁更疯》", author: "[英] 本吉·沃特豪斯" }, checked: false,
  }]);
  h.renderShelfOcrList();
  const html = h.els.shelfOcrList.innerHTML;
  assert.match(html, /可能重复：也不知道谁更疯/, "要显示库里那本的书名，否则用户无从判断");
  assert.match(html, /本吉·沃特豪斯/, "也要显示库里那本的作者，差异才看得出来");
  assert.match(h.els.shelfOcrSummary.textContent, /1 本可能重复/);
});

test("runShelfOcr：真正的新书不受可能重复逻辑影响", async () => {
  const h = createHarness({
    shelfResponse: { books: [{ title: "夜晚的潜水艇", author: "陈春成", confidence: 0.95 }] },
  });
  h.setState({ books: [{ id: "b1", title: "蛙", author: "莫言", tags: [] }], quotes: [], sessions: [], connections: [] });
  h.stubResize(async () => "data:image/jpeg;base64,xxx");

  await h.runShelfOcr(FAKE_FILE);
  const c = h.getCandidates()[0];

  assert.equal(c.possibleDuplicateOf, null);
  assert.equal(c.checked, true, "书单里没有的高置信新书仍应默认勾选");
});

test("isSameBook：版次后缀不影响匹配，但绝不能吞掉卷次", () => {
  const h = matchHarness();
  // 真实事故：库里《神经科学——探索脑（第4版）》(在读)，书架读成《神经科学——探索脑》
  assert.equal(h.isSameBook("神经科学——探索脑（第4版）", "", "神经科学——探索脑", ""), true);
  assert.equal(h.isSameBook("人类简史(第2版)", "", "人类简史", ""), true);
  // 卷次是不同的书 —— 这条线不能越
  assert.equal(h.isSameBook("花朵与探险", "", "花朵与探险2", ""), false);
  assert.equal(h.isSameBook("第二性 I", "", "第二性 II", ""), false);
  assert.equal(h.isSameBook("巴黎评论·诺奖作家访谈（上）", "", "巴黎评论·诺奖作家访谈（下）", ""), false);
});
