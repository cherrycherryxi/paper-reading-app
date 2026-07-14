// OPT-087 摘抄分享图回归锁：驱动 app.js 真实的 renderQuoteShareCard / shareQuoteCard，
// 用 canvas + Image stub 断言：正文/出处/品牌/slogan 都画进画布；生成 dataURL；
// 打开分享 dialog 并设置下载链接；空内容摘抄被拒绝。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

function buildContext() {
  const draws = { texts: [], images: 0, canvases: 0 };
  const toasts = [];

  function makeCtx() {
    return {
      fillStyle: "", strokeStyle: "", font: "", lineWidth: 0, textBaseline: "",
      fillRect() {}, strokeRect() {},
      fillText(t) { draws.texts.push(String(t)); },
      beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {},
      stroke() {}, fill() {}, save() {}, restore() {}, clip() {},
      drawImage() { draws.images++; },
      measureText(t) { return { width: String(t).length * 22 }; },
    };
  }
  const sharedCtx = makeCtx();

  function makeCanvas() {
    draws.canvases++;
    return {
      width: 0, height: 0,
      getContext() { return sharedCtx; },
      toDataURL() { return "data:image/png;base64,FAKECARD"; },
    };
  }

  function ImageStub() {
    this.onload = null;
    this.onerror = null;
    let _src = "";
    Object.defineProperty(this, "src", {
      get() { return _src; },
      set(v) { _src = v; if (this.onload) this.onload(); }, // 同步"加载完成"
    });
  }

  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const shareImg = { src: "" };
  const shareDl = { href: "", download: "" };
  const genericEl = () => ({
    className: "", textContent: "", style: {}, dataset: {}, value: "", classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    }, addEventListener() {}, setAttribute() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, closest() { return null; },
  });

  const byId = {
    shareCardDialog: dialog,
    shareCardImg: shareImg,
    shareCardDownload: shareDl,
  };

  const document = {
    querySelector() { return genericEl(); },
    querySelectorAll() { return []; },
    createElement(tag) { return String(tag).toLowerCase() === "canvas" ? makeCanvas() : genericEl(); },
    getElementById(id) { return byId[id] || genericEl(); },
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
    Image: ImageStub,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Promise,
    setTimeout, clearTimeout,
    __draws: draws,
    __toasts: toasts,
    __dialog: dialog,
    __shareImg: shareImg,
    __shareDl: shareDl,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
showToast = function (m) { __toasts.push(String(m)); };
globalThis.__hooks = {
  renderQuoteShareCard, renderConnectionShareCard, renderBookShareCard,
  shareQuoteCard, shareConnectionCard, shareBookCard, wrapCanvasText, truncateForShare,
  BOOK_REVIEW_MAX_CHARS,
  setState(v) { state = v; },
  setUser(v) { currentUser = v; authToken = "test-token"; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return { hooks: context.__hooks, ctx: context };
}

test("renderQuoteShareCard 把正文/出处/品牌/slogan 都画进画布并产出 dataURL", async () => {
  const { hooks, ctx } = buildContext();
  const quote = { id: "q1", bookId: "b1", content: "时间是一条没有归途的路。", reflection: "很喜欢这句" };
  const book = { id: "b1", title: "百年孤独" };
  const dataUrl = await hooks.renderQuoteShareCard(quote, book);

  assert.match(dataUrl, /^data:image\/png/);
  const joined = ctx.__draws.texts.join("|");
  assert.ok(joined.includes("时间是一条没有归途的路。"), "正文应画入");
  assert.ok(joined.includes("《百年孤独》"), "出处书名应画入");
  assert.ok(joined.includes("又买了一本书"), "品牌名应画入");
  assert.ok(joined.includes("买书容易，读完才算。"), "slogan 应画入");
  assert.ok(joined.includes("批注 · 很喜欢这句"), "批注应画入");
  assert.ok(ctx.__draws.images >= 2, "应绘制 logo 与二维码两张图");
});

test("长正文按宽度折行（wrapCanvasText）", () => {
  const { hooks } = buildContext();
  const measure = { measureText: (t) => ({ width: t.length * 22 }) };
  const lines = hooks.wrapCanvasText(measure, "一".repeat(60), 220); // 220/22=10 字每行
  assert.ok(lines.length > 1, "超宽文本应折成多行");
  assert.ok(lines.every((l) => l.length <= 11), "每行不超过测得宽度（+悬挂标点容差）");
});

test("避头尾：标点不出现在行首，且折行不丢字", () => {
  const { hooks } = buildContext();
  const measure = { measureText: (t) => ({ width: t.length * 22 }) };
  // 9 字/行；在多个边界刻意放逗号/句号/引号，naive 折行会把标点推到行首
  const text = "克劳迪娅在书中说争辩才是历史的要义，坚决反对辉格史观，认为历史必然走向自由。对胜利叙事都要保持警觉。";
  const lines = hooks.wrapCanvasText(measure, text, 198);
  const noStart = "，。、；：？！）》」』…”’·";
  for (const ln of lines) {
    assert.ok(!noStart.includes(ln[0]), `行不应以标点开头：「${ln}」`);
  }
  assert.equal(lines.join(""), text, "折行不得增删任何字符");
});

test("shareQuoteCard 打开 dialog 并设置图片与下载链接", async () => {
  const { hooks, ctx } = buildContext();
  hooks.setUser({ id: "u1", username: "me" });
  hooks.setState({
    quotes: [{ id: "q1", bookId: "b1", content: "读完才算。" }],
    books: [{ id: "b1", title: "活着" }],
    connections: [], sessions: [], chatHistories: {},
  });
  await hooks.shareQuoteCard("q1");

  assert.equal(ctx.__dialog.open, true, "分享 dialog 应打开");
  assert.match(ctx.__shareImg.src, /^data:image\/png/, "预览图 src 应为生成的 dataURL");
  assert.match(ctx.__shareDl.href, /^data:image\/png/, "下载链接 href 应为 dataURL");
  assert.ok(ctx.__shareDl.download.includes("活着"), "下载文件名应含书名");
});

test("renderConnectionShareCard 画出双书/kind/thought/品牌/关联 slogan", async () => {
  const { hooks, ctx } = buildContext();
  hooks.setUser({ id: "u1", username: "me" });
  const conn = { id: "c1", sourceType: "book", sourceId: "b1", targetType: "book", targetId: "b2",
    kind: "异曲同工", thought: "两人殊途同归。", tags: ["自由", "历史"] };
  hooks.setState({
    books: [{ id: "b1", title: "月亮虎", author: "[英]莱夫利" }, { id: "b2", title: "通往奴役之路", author: "[英]哈耶克" }],
    quotes: [], sessions: [], chatHistories: {}, connections: [conn],
  });
  const dataUrl = await hooks.renderConnectionShareCard(conn);
  assert.match(dataUrl, /^data:image\/png/);
  const j = ctx.__draws.texts.join("|");
  assert.ok(j.includes("月亮虎"), "源书名应画入");
  assert.ok(j.includes("通往奴役之路"), "目标书名应画入");
  assert.ok(j.includes("思想碰撞 · 异曲同工"), "kind 胶囊应画入");
  assert.ok(j.includes("两人殊途同归。"), "thought 应画入");
  assert.ok(j.includes("# 自由"), "标签应画入");
  assert.ok(j.includes("发现你书架上的暗线"), "关联卡 slogan 应画入");
});

test("renderBookShareCard 画出书名/作者/读后/书卡 slogan", async () => {
  const { hooks, ctx } = buildContext();
  const book = { id: "b1", title: "活着", author: "余华", status: "finished",
    totalPages: 200, startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-04T00:00:00Z",
    notes: "薄薄一本，却装下一整个时代。", tags: ["家族", "苦难"], coverImageUrl: "/media/u1/cover.jpg" };
  const dataUrl = await hooks.renderBookShareCard(book);
  assert.match(dataUrl, /^data:image\/png/);
  const j = ctx.__draws.texts.join("|");
  assert.ok(j.includes("《活着》"), "书名应画入");
  assert.ok(j.includes("余华"), "作者应画入");
  assert.ok(j.includes("内容简介"), "简介标题应画入");
  assert.ok(j.includes("薄薄一本，却装下一整个时代。"), "简介正文应画入");
  assert.ok(j.includes("3 天读完"), "读完天数应画入");
  assert.ok(j.includes("买书容易，读完才算。"), "书卡 slogan 应画入");
  assert.ok(ctx.__draws.images >= 3, "应绘制 logo/二维码/封面三张图");
});

test("书卡有评分时画出金色星标行（实心星按评分数、空心星补满 5 颗），无评分则不画", async () => {
  // 有 rating=4：画 ★★★★ 与 ☆
  {
    const { hooks, ctx } = buildContext();
    await hooks.renderBookShareCard({ id: "b1", title: "活着", author: "余华",
      status: "finished", rating: 4, tags: [] });
    const j = ctx.__draws.texts.join("|");
    assert.ok(j.includes("★★★★"), "4 星应画出 4 颗实心星");
    assert.ok(j.includes("☆"), "未满 5 星应补空心星");
    // 星标不再混进 meta 胶囊（旧实现把 ★★★★☆ 当胶囊塞进状态排）
    assert.ok(!j.includes("★★★★☆"), "实心/空心星应分两次画（分色），不是单串胶囊");
  }
  // rating=5：只画 5 颗实心，无空心
  {
    const { hooks, ctx } = buildContext();
    await hooks.renderBookShareCard({ id: "b1", title: "活着", status: "finished", rating: 5, tags: [] });
    const j = ctx.__draws.texts.join("|");
    assert.ok(j.includes("★★★★★"), "5 星应画满实心星");
    assert.ok(!j.includes("☆"), "满星不应有空心星");
  }
  // 无 rating：不画任何星
  {
    const { hooks, ctx } = buildContext();
    await hooks.renderBookShareCard({ id: "b1", title: "活着", status: "reading", tags: [] });
    const j = ctx.__draws.texts.join("|");
    assert.ok(!j.includes("★") && !j.includes("☆"), "无评分不应画星标");
  }
});

test("书卡有读后感时优先展示读后感（标签「我的读后」），无则回落内容简介", async () => {
  // 有 review：展示 review + 「我的读后」，不展示简介
  {
    const { hooks, ctx } = buildContext();
    await hooks.renderBookShareCard({ id: "b1", title: "活着", author: "余华", status: "finished",
      notes: "这里是内容简介，长长的介绍。", review: "苦难里活着本身就是意义。", tags: [] });
    const j = ctx.__draws.texts.join("");
    assert.ok(j.includes("我的读后"), "有读后感应显示「我的读后」标签");
    assert.ok(j.includes("苦难里活着本身就是意义。"), "应展示读后感正文");
    assert.ok(!j.includes("这里是内容简介，长长的介绍。"), "有读后感时不展示内容简介");
  }
  // 无 review：回落 notes + 「内容简介」
  {
    const { hooks, ctx } = buildContext();
    await hooks.renderBookShareCard({ id: "b1", title: "活着", author: "余华", status: "finished",
      notes: "福贵的一生。", review: "", tags: [] });
    const j = ctx.__draws.texts.join("");
    assert.ok(j.includes("内容简介"), "无读后感回落「内容简介」标签");
    assert.ok(j.includes("福贵的一生。"), "应展示内容简介正文");
  }
});

test("读后感字段：新增书与编辑书两个表单都能录入，且各自保存到 book.review", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
  // 两个书表单（新增 bookDialog + 编辑 bookEditDialog）各有一个 name="review"
  assert.equal((html.match(/name="review"/g) || []).length, 2, "新增与编辑两个书表单都应有读后感字段");
  // addBook 与 saveBookEdit 都把 review 写入 book
  assert.ok(/review: String\(formData\.get\("review"\)/.test(appSource), "addBook 应保存 review");
  assert.ok(/book\.review = String\(formData\.get\("review"\)/.test(appSource), "saveBookEdit 应保存 review");
});

test("超长文本截断为海报友好长度（truncateForShare + 书卡长简介不生成巨图）", async () => {
  const { hooks, ctx } = buildContext();
  // 纯函数：超过上限截断并加省略号；未超则原样
  assert.equal(hooks.truncateForShare("一".repeat(10), 5), "一一一一一…");
  assert.equal(hooks.truncateForShare("短", 5), "短");
  // 书卡：150 字上限，超长简介只画出前 150 字 + …，全文不出现
  const longNotes = "简".repeat(400);
  await hooks.renderBookShareCard({ id: "b1", title: "大部头", author: "某", status: "reading",
    notes: longNotes, tags: [] });
  const j = ctx.__draws.texts.join("");
  assert.ok(j.includes("…"), "超长简介应带省略号");
  assert.ok(!j.includes("简".repeat(200)), "不应画出完整超长简介（否则生成巨图）");
});

// OPT-108：AI 读后感的提示词字数上限与书卡截断门槛必须是同一个数，
// 否则模型「写满」的读后感一进分享图就被切尾。
test("AI 读后感提示词上限与书卡截断门槛同源（BOOK_REVIEW_MAX_CHARS）", async () => {
  const { hooks, ctx } = buildContext();
  const max = hooks.BOOK_REVIEW_MAX_CHARS;
  assert.equal(typeof max, "number");

  // 提示词里的上限来自同一个常量，而不是另写一个字面量
  assert.ok(
    /写一段简短的读后感（100-\$\{BOOK_REVIEW_MAX_CHARS\}字）/.test(appSource),
    "generateBookReview 的提示词应引用 BOOK_REVIEW_MAX_CHARS"
  );

  // 写满上限的读后感应完整画出，不被截断
  const fullReview = "感".repeat(max);
  await hooks.renderBookShareCard({ id: "b1", title: "活着", author: "余华", status: "finished",
    review: fullReview, notes: "", tags: [] });
  const drawn = ctx.__draws.texts.join("");
  assert.ok(drawn.includes(fullReview), "写满字数上限的读后感应完整出现在书卡上");
  assert.ok(!drawn.includes(`${fullReview}…`), "未超上限不应加省略号");
});

test("超出上限的读后感仍被截断，避免生成巨图", async () => {
  const { hooks, ctx } = buildContext();
  const max = hooks.BOOK_REVIEW_MAX_CHARS;
  await hooks.renderBookShareCard({ id: "b1", title: "大部头", author: "某", status: "reading",
    review: "感".repeat(max * 3), notes: "", tags: [] });
  const drawn = ctx.__draws.texts.join("");
  assert.ok(drawn.includes("…"), "超长读后感应带省略号");
  assert.ok(!drawn.includes("感".repeat(max + 1)), "不应画出超过上限的字数");
});

test("分享入口接线：三版式各自的菜单/详情/卡片按钮都能触达对应 shareXxxCard", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
  // 摘抄：⋯ 菜单 + 详情弹窗
  assert.ok(/id="quoteDetailShareBtn"[^>]*>生成分享图</.test(html), "摘抄详情应有分享按钮");
  assert.ok(/data-quote-menu="share"/.test(appSource) && /action === "share"\) shareQuoteCard\(id\)/.test(appSource), "摘抄 ⋯ 菜单接线");
  assert.ok(/quoteDetailShareBtn[\s\S]{0,200}shareQuoteCard\(quoteId\)/.test(appSource), "摘抄详情接线");
  // 书：⋯ 菜单 + 详情弹窗
  assert.ok(/id="bookDetailShareBtn"[^>]*>生成分享图</.test(html), "书详情应有分享按钮");
  assert.ok(/data-menu="share"/.test(appSource) && /action === "share"\) shareBookCard\(book\.id\)/.test(appSource), "书 ⋯ 菜单接线");
  assert.ok(/bookDetailShareBtn[\s\S]{0,200}shareBookCard\(id\)/.test(appSource), "书详情接线");
  // 关联：卡片 action 按钮
  assert.ok(/conn-share-btn/.test(appSource), "关联卡应有分享按钮");
  assert.ok(/conn-share-btn[\s\S]{0,120}shareConnectionCard\(shareBtn\.dataset\.connId\)/.test(appSource), "关联卡接线");
});

test("空内容摘抄被拒绝生成，不打开 dialog", async () => {
  const { hooks, ctx } = buildContext();
  hooks.setUser({ id: "u1", username: "me" });
  hooks.setState({
    quotes: [{ id: "q1", bookId: "b1", content: "", ocrText: "" }],
    books: [{ id: "b1", title: "活着" }],
    connections: [], sessions: [], chatHistories: {},
  });
  await hooks.shareQuoteCard("q1");

  assert.equal(ctx.__dialog.open, false, "空摘抄不应打开 dialog");
  assert.ok(ctx.__toasts.some((t) => t.includes("还没有文字内容")), "应提示补全内容");
});
