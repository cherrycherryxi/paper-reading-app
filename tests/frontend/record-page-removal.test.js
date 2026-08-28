const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("独立记录页和一级导航已移除", () => {
  assert.doesNotMatch(html, /data-tab="session"/);
  assert.doesNotMatch(html, /data-tab-section="session"/);
  assert.equal((html.match(/data-tab="/g) || []).length, 5);
});

test("阅读记录数据与书籍详情能力继续保留", () => {
  assert.match(html, /id="bookDetailSessionsWrap"/);
  assert.match(html, /id="bookDetailAddSessionBtn"/);
  assert.match(html, /id="sessionDialog"/);
  assert.match(app, /state\.sessions/);
  assert.match(app, /const sessionCards = bookSessions\.map/);
  assert.doesNotMatch(app, /data-book-detail-action="sessions"/);
});

test("缺少独立时间线容器时渲染器安全退出", () => {
  assert.match(app, /function renderTimeline\(\) \{\s*\/\/[^]*?if \(!els\.timeline\) return;/);
});
