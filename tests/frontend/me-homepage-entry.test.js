const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("OPT-157: 我的主页直接展示可编辑记忆、Excel 与拍书架入口", () => {
  const panel = indexHtml.match(/<section class="panel me-panel"[\s\S]*?<\/main>/m);
  assert.ok(panel, "应能定位我的主页");
  assert.match(panel[0], /id="memoryForm"/);
  assert.match(panel[0], /id="memoriesList"/);
  assert.match(panel[0], /id="meMemoryCount"/);
  assert.match(panel[0], /id="meMemoryPreview"/);
  assert.match(panel[0], /id="meImportExcelBtn"/);
  assert.match(panel[0], /id="shelfOcrInput"/);
  assert.doesNotMatch(panel[0], /豆瓣 CSV/);
});

test("OPT-157: 主页展示记忆数量和最近更新摘要", () => {
  const fn = appJs.match(/function renderSummary\(\)[\s\S]*?\n\}/m);
  assert.ok(fn, "renderSummary 应存在");
  assert.match(fn[0], /meMemoryCount\.textContent = `\$\{memories\.length\} 条记忆`/);
  assert.match(fn[0], /item\.updatedAt \|\| item\.createdAt/);
  assert.match(fn[0], /meMemoryPreview\.textContent = latest\?\.content/);
});

test("OPT-157: 保存或删除长期记忆后同步刷新主页摘要", () => {
  const saveMemory = appJs.match(/async function saveMemory\([\s\S]*?\n\}/m);
  assert.ok(saveMemory, "saveMemory 应存在");
  assert.match(saveMemory[0], /renderMemories\(\);\s*renderSummary\(\);/);

  const deleteMemory = appJs.match(/if \(event\.target\.dataset\.deleteMemory\) \{[\s\S]*?\n    \}/m);
  assert.ok(deleteMemory, "删除长期记忆分支应存在");
  assert.match(deleteMemory[0], /await syncState\(\);\s*renderMemories\(\);\s*renderSummary\(\);/);
});

test("OPT-157: 导入入口未登录时统一降级到账号抽屉", () => {
  const guard = appJs.match(/function requireMeHomepageAuth\(\)[\s\S]*?\n\}/m);
  assert.ok(guard, "主页入口应有登录守卫");
  assert.match(guard[0], /if \(currentUser\?\.id\) return true/);
  assert.match(guard[0], /openMeDrawer\(\)/);

});

test("OPT-157: Excel 入口复用既有导入控件，抽屉不再承载记忆与书架入口", () => {
  const excel = appJs.match(/meImportExcelBtn\?\.addEventListener\("click",[\s\S]*?\n  \}\);/m);
  assert.ok(excel);
  assert.match(excel[0], /requireMeHomepageAuth/);
  assert.match(excel[0], /importExcelDialog\.showModal\(\)/);
  assert.match(excel[0], /importExcelInput\?\.click\(\)/);

  const drawerStart = indexHtml.indexOf('<div id="meDrawer"');
  const drawerEnd = indexHtml.indexOf("<!-- Custom delete-book confirmation dialog");
  assert.ok(drawerStart >= 0 && drawerEnd > drawerStart);
  const drawer = indexHtml.slice(drawerStart, drawerEnd);
  assert.doesNotMatch(drawer, /id="memoryForm"/);
  assert.doesNotMatch(drawer, /id="shelfOcrInput"/);
});

test("OPT-157: 移动端聚焦长期记忆输入框不会触发 iOS 页面缩放", () => {
  assert.match(
    stylesCss,
    /@media \(max-width: 768px\) \{[\s\S]*?\.me-memory-form select,\s*\.me-memory-form input\s*\{\s*font-size: 16px;/,
  );
});
