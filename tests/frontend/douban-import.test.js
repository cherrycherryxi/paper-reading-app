// OPT-105 豆瓣导入：从豆瓣「读过」CSV 回填已有书的空缺字段（评分/读完日期/读后感），
// 匹配不到则新增。本测试执行真实 app.js 的 parseCsv / importDoubanCsv，验证行为。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

function elStub() {
  const el = {
    hidden: false, value: "", textContent: "", className: "", dataset: {}, children: [], style: {},
    get innerHTML() { return ""; }, set innerHTML(_v) {},
    appendChild() {}, append() {}, prepend() {}, insertAdjacentHTML() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    closest() { return null; }, focus() {}, scrollIntoView() {},
  };
  return el;
}

function createHarness() {
  const elements = new Map();
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, elStub()); return elements.get(id); };
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
    // PUT /api/state 回显；其它 GET 返回空
    fetch: async (url, options = {}) => {
      let body = {};
      if (String(url).includes("/api/state") && options.method === "PUT") {
        body = { state: JSON.parse(options.body || "{}"), stateVersion: "v1" };
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
  parseCsv, importDoubanCsv, els,
  setState(v){ state = v; }, getState(){ return state; },
  setUser(u){ currentUser = u; }, setAuthToken,
};`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return context.__hooks;
}

test("parseCsv：处理引号包裹的字段内逗号、\"\" 转义、BOM", () => {
  const h = createHarness();
  const BOM = String.fromCharCode(0xfeff);
  const rows = h.parseCsv(BOM + '书名,我的短评\n活着,"很好,很催泪"\n三体,"含""引号"""\n');
  assert.equal(rows[0].join("|"), "书名|我的短评"); // BOM 被剥离
  assert.equal(rows[1].join("|"), "活着|很好,很催泪"); // 字段内逗号不被当分隔
  assert.equal(rows[2].join("|"), '三体|含"引号"'); // "" -> "
});

function loggedInHarness() {
  const h = createHarness();
  h.setUser({ id: "u1" });
  h.setAuthToken("tok");
  return h;
}

const CSV =
  '书名,作者,我的评分,读过日期,我的短评,豆瓣链接\n' +
  '空缺书,作者A,5,2026-01-01,"短评,含逗号",https://book.douban.com/subject/1/\n' +
  '已填书,作者B,4,2026-02-02,豆瓣短评,https://book.douban.com/subject/2/\n' +
  '全新书,作者C,3,2025-03-03,新书短评,https://book.douban.com/subject/3/\n';

test("importDoubanCsv：回填空缺书、不覆盖已填书、新增全新书", async () => {
  const h = loggedInHarness();
  h.setState({
    books: [
      { id: "a", title: "空缺书", author: "作者A", rating: 0, finishedAt: "", review: "", reviewIsAi: false },
      { id: "b", title: "已填书", author: "作者B", rating: 5, finishedAt: "2020-09-09T00:00:00.000Z", review: "我手写的", reviewIsAi: false },
    ],
    quotes: [], sessions: [], connections: [],
  });

  await h.importDoubanCsv({ text: async () => CSV });
  const st = h.getState();

  const a = st.books.find((x) => x.id === "a");
  assert.equal(a.rating, 5, "空缺书评分被回填");
  assert.ok(a.finishedAt.startsWith("2026-01-01"), "空缺书读完日期被回填");
  assert.equal(a.doubanComment, "短评,含逗号", "空缺书豆瓣短评被回填(含逗号)");
  assert.equal(a.review, "", "review 不被豆瓣导入触碰");

  const b = st.books.find((x) => x.id === "b");
  assert.equal(b.rating, 5, "已填书评分不被覆盖");
  assert.ok(b.finishedAt.startsWith("2020-09-09"), "已填书日期不被覆盖");
  assert.equal(b.review, "我手写的", "已填书读后感(review)保留");
  assert.equal(b.doubanComment, "豆瓣短评", "豆瓣短评并存写入——读后感+短评两者都保留");

  const c = st.books.find((x) => x.title === "全新书");
  assert.ok(c, "全新书被创建");
  assert.equal(c.status, "finished", "新书状态为已读完");
  assert.equal(c.rating, 3);
  assert.equal(c.doubanComment, "新书短评");
  assert.equal(c.review, "", "新书 review 为空(仅豆瓣短评)");
  assert.ok(c.finishedAt.startsWith("2025-03-03"));
});

test("importDoubanCsv：缺「书名」列时报错不导入", async () => {
  const h = loggedInHarness();
  h.setState({ books: [], quotes: [], sessions: [], connections: [] });
  await h.importDoubanCsv({ text: async () => "作者,评分\n某人,5\n" });
  assert.equal(h.getState().books.length, 0, "缺书名列不应导入任何书");
});

test("结构：我的抽屉有豆瓣导入入口 + 绑定 + 只填空缺策略", () => {
  assert.ok(indexHtml.includes('id="importDoubanInput"'), "index.html 应有豆瓣导入 file input");
  assert.match(appSource, /els\.importDoubanInput\?\.addEventListener\("change"/, "应绑定豆瓣导入");
  // 只填空缺：评分/日期/豆瓣短评都带「已有非空则跳过」的守卫
  assert.match(appSource, /!\(existing\.rating > 0\)/);
  assert.match(appSource, /!existing\.finishedAt/);
  assert.match(appSource, /!String\(existing\.doubanComment \|\| ""\)\.trim\(\)/);
});

test("结构：豆瓣短评与读后感分开——详情页有独立区、分享图取值链含短评", () => {
  assert.match(appSource, /我的短评 · 豆瓣/, "详情页应有独立豆瓣短评区");
  assert.match(appSource, /const doubanComment = \(book\.doubanComment \|\| ""\)\.trim\(\)/, "分享图取值链含 doubanComment");
});
