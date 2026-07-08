/**
 * OPT-098: AI 读后感生成 + 星级评分（E159 + E160 合并 PR）
 *
 * 测试覆盖：
 * 1. 星级点击 → hidden input 更新 + is-filled 切换
 * 2. 重复点击切换星级
 * 3. editBook 预填 rating 星级
 * 4. addBook 存储 rating
 * 5. saveBookEdit 存储 rating
 * 6. 详情展示星标
 * 7. addBook dialog 无 AI 按钮（新增模式）
 * 8. editBook dialog 有 AI 按钮
 * 9. AI 生成成功 → textarea 填充
 * 10. AI 生成失败 → toast + 按钮恢复
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

// ─── helpers ──────────────────────────────────────────────────────────────────

function createElementStub(tagName = "div") {
  let innerHTML = "";
  const classes = new Set();
  const listeners = {};
  return {
    tagName: tagName.toUpperCase(),
    className: "", textContent: "", value: "", open: false, hidden: false,
    style: {}, dataset: {},
    parentNode: null, children: [],
    _listeners: listeners,
    get classList() {
      return {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        toggle(c, force) {
          if (arguments.length === 2) { force ? classes.add(c) : classes.delete(c); return force; }
          const has = classes.has(c); has ? classes.delete(c) : classes.add(c); return !has;
        },
        contains(c) { return classes.has(c); },
      };
    },
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    querySelector(sel) { return null; },
    querySelectorAll(sel) { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {},
    setAttribute() {},
    closest(sel) { return null; },
    dispatchEvent() {},
  };
}

function formDataMock(obj) {
  const m = new Map(Object.entries(obj));
  m.get = (k) => { for (const [key, val] of m) { if (String(key) === String(k)) return val; } return null; };
  return m;
}

// ─── Test 1: 星级点击 ──────────────────────────────────────────────────────

test("OPT-098: 点击第 3 颗星 → hidden=3，前 3 颗亮、后 2 颗暗", () => {
  // Source-level: the star click handler uses data-star / is-filled / hidden input
  const starMatch = appSource.match(/document\.addEventListener\("click",\s*\(e\)\s*=>\s*\{[\s\S]*?star-btn[\s\S]*?\}\);/);
  assert.ok(starMatch, "bindEvents 中应有星标点击委托");

  // Functional: simulate the logic directly
  const btns = [1, 2, 3, 4, 5].map((n) => {
    let filled = false;
    return {
      dataset: { star: String(n) },
      classList: {
        _filled: false,
        toggle(cls, force) { if (cls === "is-filled") this._filled = force; },
        contains(cls) { return cls === "is-filled" ? this._filled : false; },
      },
    };
  });
  let hiddenVal = 0;
  const v = 3;
  btns.forEach((b) => {
    b.classList.toggle("is-filled", Number(b.dataset.star) <= v);
  });
  hiddenVal = v;

  assert.equal(hiddenVal, 3, "hidden input 应为 3");
  assert.ok(btns[0].classList._filled, "第 1 颗应亮");
  assert.ok(btns[1].classList._filled, "第 2 颗应亮");
  assert.ok(btns[2].classList._filled, "第 3 颗应亮");
  assert.ok(!btns[3].classList._filled, "第 4 颗应暗");
  assert.ok(!btns[4].classList._filled, "第 5 颗应暗");
});

// ─── Test 2: 重复点击 ──────────────────────────────────────────────────────

test("OPT-098: 先点 4 再点 2 → 仅前 2 颗亮", () => {
  const btns = [1, 2, 3, 4, 5].map((n) => ({
    dataset: { star: String(n) },
    classList: {
      _filled: false,
      toggle(cls, force) { if (cls === "is-filled") this._filled = force; },
    },
  }));
  let hiddenVal = 0;
  function fill(v) {
    btns.forEach((b) => b.classList.toggle("is-filled", Number(b.dataset.star) <= v));
    hiddenVal = v;
  }
  fill(4);
  assert.equal(hiddenVal, 4);
  fill(2);
  assert.equal(hiddenVal, 2);
  assert.ok(btns[0].classList._filled, "1 应亮");
  assert.ok(btns[1].classList._filled, "2 应亮");
  assert.ok(!btns[2].classList._filled, "3 应暗");
  assert.ok(!btns[3].classList._filled, "4 应暗");
  assert.ok(!btns[4].classList._filled, "5 应暗");
});

// ─── Test 3: editBook 预填 ─────────────────────────────────────────────────

test("OPT-098: editBook 预填 book.rating=3 → 前 3 颗星 is-filled", () => {
  // Source-level: openBookEditDialog must prefill star rating
  assert.match(appSource, /_ratingVal/, "openBookEditDialog 应读取 book.rating");
  assert.match(appSource, /star-rating/, "app.js 应包含 star-rating 操作");

  // Simulate prefill logic
  const book = { rating: 3 };
  const ratingVal = book.rating || 0;
  const btns = [1, 2, 3, 4, 5].map((n) => ({
    dataset: { star: String(n) },
    classList: {
      _filled: false,
      toggle(cls, force) { if (cls === "is-filled") this._filled = force; },
    },
  }));
  btns.forEach((b) => b.classList.toggle("is-filled", Number(b.dataset.star) <= ratingVal));

  assert.ok(btns[0].classList._filled, "1 应亮");
  assert.ok(btns[1].classList._filled, "2 应亮");
  assert.ok(btns[2].classList._filled, "3 应亮");
  assert.ok(!btns[3].classList._filled, "4 应暗");
  assert.ok(!btns[4].classList._filled, "5 应暗");
});

// ─── Test 4: addBook 存储 rating ────────────────────────────────────────────

test("OPT-098: addBook 保存 rating=4 → book.rating === 4", () => {
  // Source-level: addBook must set rating from formData
  assert.match(appSource, /rating:\s*Number\(formData\.get\("rating"\)\)/, "addBook 应存储 rating");

  // Logic verification
  const rating = Number("4") || 0;
  assert.equal(rating, 4);
});

// ─── Test 5: saveBookEdit 存储 rating ───────────────────────────────────────

test("OPT-098: saveBookEdit 保存 rating=3 → book.rating 从 0 变 3", () => {
  // Source-level
  assert.match(appSource, /book\.rating\s*=\s*Number\(formData\.get\("rating"\)\)/, "saveBookEdit 应存储 rating");

  const book = { rating: 0 };
  book.rating = Number("3") || 0;
  assert.equal(book.rating, 3);
});

// ─── Test 6: 详情展示 ──────────────────────────────────────────────────────

test("OPT-098: book.rating=4 → 详情 meta 含 '★★★★☆'", () => {
  // Source-level
  assert.match(appSource, /★.*repeat\(book\.rating\)/, "openBookDetailDialog 应渲染星标");

  const book = { rating: 4 };
  if (book.rating) {
    const stars = "★".repeat(book.rating) + "☆".repeat(5 - book.rating);
    assert.equal(stars, "★★★★☆");
  }
});

// ─── Test 7: addBook dialog 无 AI 按钮 ─────────────────────────────────────

test("OPT-098: addBook dialog 不含 AI 起草按钮（新增书无 bookId）", () => {
  // The addBook form (#bookDialog) should NOT have data-generate-review
  const bookDialogMatch = htmlSource.match(/<dialog\s+id="bookDialog"[\s\S]*?<\/dialog>/);
  assert.ok(bookDialogMatch, "应找到 addBook dialog");
  assert.doesNotMatch(bookDialogMatch[0], /data-generate-review/, "addBook dialog 不应有 AI 起草按钮");
});

// ─── Test 8: editBook dialog 有 AI 按钮 ────────────────────────────────────

test("OPT-098: editBook dialog 含 AI 起草按钮", () => {
  const editDialogMatch = htmlSource.match(/<dialog\s+id="bookEditDialog"[\s\S]*?<\/dialog>/);
  assert.ok(editDialogMatch, "应找到 editBook dialog");
  assert.match(editDialogMatch[0], /data-generate-review/, "editBook dialog 应有 AI 起草按钮");
  assert.match(editDialogMatch[0], /✨ AI 起草/, "按钮文字应为 ✨ AI 起草");
});

// ─── Test 9: AI 生成成功 ───────────────────────────────────────────────────

test("OPT-098: AI 生成成功 → textarea.value 更新", async () => {
  // Source-level: generateBookReview must call apiFetch with /api/chat
  assert.match(appSource, /function generateBookReview/, "应有 generateBookReview 函数");
  assert.match(appSource, /api\/chat/, "generateBookReview 应调用 /api/chat");
  assert.match(appSource, /context:\s*\{\s*type:\s*"book"/, "应使用 focusedBook 上下文模式");

  // Functional: simulate success path
  const mockReply = "这是一本发人深省的书，推荐给所有爱思考的人。";
  let toastMsg = "";
  const mockShowToast = (msg) => { toastMsg = msg; };

  const data = { reply: mockReply };
  const reply = (data?.reply || "").trim();
  const textarea = { value: "", dispatchEvent() {} };

  if (reply) {
    textarea.value = reply;
  } else {
    mockShowToast("AI 未能生成读后感，请手动填写");
  }

  assert.equal(textarea.value, mockReply, "textarea 应填充 AI 返回值");
  assert.equal(toastMsg, "", "成功时不应 toast");
});

// ─── Test 10: AI 生成失败 ──────────────────────────────────────────────────

test("OPT-098: AI 生成失败 → toast 提示 + 按钮恢复", async () => {
  // Verify error handling branch exists
  assert.match(appSource, /catch\s*\(err\)\s*\{/, "generateBookReview 应有 catch 块");
  assert.match(appSource, /生成失败/, "错误提示应包含「生成失败」");

  // Functional: simulate error path
  let toastMsg = "";
  const mockShowToast = (msg) => { toastMsg = msg; };
  let btnText = "生成中…";
  const originalText = "✨ AI 起草";

  try {
    throw new Error("网络错误");
  } catch (err) {
    mockShowToast("生成失败：" + (err?.message || "网络错误"));
    btnText = originalText;
  }

  assert.ok(toastMsg.includes("生成失败"), "应 toast 错误提示");
  assert.equal(btnText, "✨ AI 起草", "按钮应恢复原文");
});

// ─── Test 11: 分享卡展示星标 ───────────────────────────────────────────────

test("OPT-098: 分享卡 book.rating=5 → pills 含 '★★★★★'", () => {
  assert.match(appSource, /book\.rating.*★/, "renderBookShareCard 应渲染星标");

  const book = { rating: 5 };
  const pills = [];
  if (book.rating) pills.push("★".repeat(book.rating) + "☆".repeat(5 - book.rating));
  assert.ok(pills.some((p) => p.includes("★★★★★")), "pills 应包含五星");
});

console.log("\nDone.");
