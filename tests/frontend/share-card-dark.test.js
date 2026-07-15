// OPT-104 深色模式分享卡回归锁：驱动 app.js 真实的 activeShareCard / renderQuoteShareCard，
// 断言 (1) matchMedia 报深色偏好时选中 SHARE_CARD_DARK；(2) canvas 铺底用深色 bg；
// (3) matchMedia 缺失或报亮色时回落 SHARE_CARD（亮色 bg），保证测试沙箱/旧环境不炸。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

// prefersDark: true=深色, false=亮色, null=matchMedia 缺失
function buildContext(prefersDark) {
  const bgFills = []; // 每次 fillRect 时的 fillStyle（首个即铺底色）

  function makeCtx() {
    const ctx = {
      fillStyle: "", strokeStyle: "", font: "", lineWidth: 0, textBaseline: "",
      fillRect() { bgFills.push(ctx.fillStyle); }, strokeRect() {},
      fillText() {},
      beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {},
      stroke() {}, fill() {}, save() {}, restore() {}, clip() {},
      drawImage() {},
      measureText(t) { return { width: String(t).length * 22 }; },
    };
    return ctx;
  }
  const sharedCtx = makeCtx();

  function makeCanvas() {
    return {
      width: 0, height: 0,
      getContext() { return sharedCtx; },
      toDataURL() { return "data:image/png;base64,FAKECARD"; },
    };
  }

  function ImageStub() {
    this.onload = null; this.onerror = null;
    let _src = "";
    Object.defineProperty(this, "src", {
      get() { return _src; },
      set(v) { _src = v; if (this.onload) this.onload(); },
    });
  }

  const genericEl = () => ({
    className: "", textContent: "", style: {}, dataset: {}, value: "", classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    }, addEventListener() {}, setAttribute() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, closest() { return null; },
  });

  const document = {
    querySelector() { return genericEl(); },
    querySelectorAll() { return []; },
    createElement(tag) { return String(tag).toLowerCase() === "canvas" ? makeCanvas() : genericEl(); },
    getElementById() { return genericEl(); },
    addEventListener() {},
  };

  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout(fn) { return fn && fn(); }, clearTimeout() {},
    paperReadingApp: {},
  };
  if (prefersDark !== null) {
    window.matchMedia = (q) => ({ matches: /dark/.test(q) ? prefersDark : false });
  }

  const context = {
    console, document, window,
    Image: ImageStub,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function (t) { this.type = t; },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Promise,
    setTimeout, clearTimeout,
    __bgFills: bgFills,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
globalThis.__hooks = {
  activeShareCard, SHARE_CARD, SHARE_CARD_DARK, renderQuoteShareCard,
  setState(v) { state = v; },
  setUser(v) { currentUser = v; authToken = "test-token"; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  return { hooks: context.__hooks, bgFills };
}

test("深色偏好 → activeShareCard 选中 SHARE_CARD_DARK，铺底用深色 bg", async () => {
  const { hooks, bgFills } = buildContext(true);
  assert.equal(hooks.activeShareCard(), hooks.SHARE_CARD_DARK);
  assert.equal(hooks.SHARE_CARD_DARK.bg, "#1c1a17");

  const dataUrl = await hooks.renderQuoteShareCard(
    { id: "q1", bookId: "b1", content: "夜色温柔。" },
    { id: "b1", title: "夜色温柔" },
  );
  assert.match(dataUrl, /^data:image\/png/);
  // 首个 fillRect 即整幅铺底，深色模式下必须是深色 bg 而非亮色米白
  assert.equal(bgFills[0], hooks.SHARE_CARD_DARK.bg);
  assert.notEqual(bgFills[0], hooks.SHARE_CARD.bg);
});

test("亮色偏好 → activeShareCard 回落 SHARE_CARD，铺底用亮色 bg", async () => {
  const { hooks, bgFills } = buildContext(false);
  assert.equal(hooks.activeShareCard(), hooks.SHARE_CARD);
  await hooks.renderQuoteShareCard({ id: "q1", bookId: "b1", content: "白日梦。" }, { id: "b1", title: "书" });
  assert.equal(bgFills[0], hooks.SHARE_CARD.bg);
});

test("matchMedia 缺失（旧环境/沙箱）→ 不抛错，回落亮色", async () => {
  const { hooks } = buildContext(null);
  assert.equal(hooks.activeShareCard(), hooks.SHARE_CARD);
});

test("深浅两套调色板：ink 派生淡色（hair/tint/tintStrong）各自成对，深色用暖白 rgba", () => {
  const { hooks } = buildContext(true);
  for (const key of ["bg", "ink", "inkSoft", "inkMuted", "accent", "pillBg", "hair", "tint", "tintStrong"]) {
    assert.ok(hooks.SHARE_CARD[key], `SHARE_CARD.${key} 应存在`);
    assert.ok(hooks.SHARE_CARD_DARK[key], `SHARE_CARD_DARK.${key} 应存在`);
    assert.notEqual(hooks.SHARE_CARD_DARK[key], hooks.SHARE_CARD[key], `${key} 深浅应不同`);
  }
  // 深色 ink 派生淡色用暖白（232,224,208），而非亮色的墨绿（61,74,63）
  assert.match(hooks.SHARE_CARD_DARK.hair, /232,224,208/);
  assert.match(hooks.SHARE_CARD.hair, /61,74,63/);
});
