const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("OPT-157: 我的主页直接展示长期记忆与两类导入入口", () => {
  const panel = indexHtml.match(/<section class="panel me-panel"[\s\S]*?<\/section>\s*<\/main>/m);
  assert.ok(panel, "应能定位我的主页");
  assert.match(panel[0], /id="manageMemoriesBtn"/);
  assert.match(panel[0], /id="meMemoryCount"/);
  assert.match(panel[0], /id="meMemoryPreview"/);
  assert.match(panel[0], /id="meImportExcelBtn"/);
  assert.match(panel[0], /id="meImportDoubanBtn"/);
});

test("OPT-157: 主页展示记忆数量和最近更新摘要", () => {
  const fn = appJs.match(/function renderSummary\(\)[\s\S]*?\n\}/m);
  assert.ok(fn, "renderSummary 应存在");
  assert.match(fn[0], /meMemoryCount\.textContent = `\$\{memories\.length\} 条记忆`/);
  assert.match(fn[0], /item\.updatedAt \|\| item\.createdAt/);
  assert.match(fn[0], /meMemoryPreview\.textContent = latest\?\.content/);
});

test("OPT-157: 未登录入口统一降级到账号抽屉", () => {
  const guard = appJs.match(/function requireMeHomepageAuth\(\)[\s\S]*?\n\}/m);
  assert.ok(guard, "主页入口应有登录守卫");
  assert.match(guard[0], /if \(currentUser\?\.id\) return true/);
  assert.match(guard[0], /openMeDrawer\(\)/);

  const memory = appJs.match(/function openMemoryManager\(\)[\s\S]*?\n\}/m);
  assert.ok(memory);
  assert.match(memory[0], /if \(!requireMeHomepageAuth\(\)\) return/);
  assert.match(memory[0], /scrollIntoView/);
  assert.match(memory[0], /focus/);
});

test("OPT-157: Excel 与豆瓣入口复用既有导入控件", () => {
  const excel = appJs.match(/meImportExcelBtn\?\.addEventListener\("click",[\s\S]*?\n  \}\);/m);
  assert.ok(excel);
  assert.match(excel[0], /requireMeHomepageAuth/);
  assert.match(excel[0], /importExcelDialog\.showModal\(\)/);
  assert.match(excel[0], /importExcelInput\?\.click\(\)/);

  const douban = appJs.match(/meImportDoubanBtn\?\.addEventListener\("click",[\s\S]*?\n  \}\);/m);
  assert.ok(douban);
  assert.match(douban[0], /requireMeHomepageAuth/);
  assert.match(douban[0], /importDoubanInput\?\.click\(\)/);
});
