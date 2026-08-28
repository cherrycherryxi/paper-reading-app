const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("我的页面用四类阅读洞察替代四张计数卡", () => {
  assert.match(html, /AI 阅读洞察/);
  assert.match(html, /id="refreshReadingInsightsBtn"/);
  for (const title of ["阅读动力", "阅读结构", "兴趣图谱", "知识沉淀"]) assert.match(app, new RegExp(title));
  assert.doesNotMatch(app, /class="stat-card profile-stat-card"/);
});

test("图表数字由本地确定性计算且包含文字可访问名称", () => {
  assert.match(app, /function readingInsightMetrics\(\)/);
  assert.match(app, /最近八周阅读分钟数/);
  assert.match(app, /在读 \$\{structure\.readingBooks\} 本/);
  assert.match(app, /摘抄 \$\{metrics\.funnel\.quoteCount\}/);
  assert.match(app, /role="img"/);
});

test("AI 解读按数据签名缓存，失败时降级为本地分析", () => {
  assert.match(app, /paper-reading-insights:/);
  assert.match(app, /\/api\/reading-insights/);
  assert.match(app, /AI 解读暂不可用，当前展示可核验的本地分析/);
  assert.match(app, /loadReadingInsights\(\{ force: true \}\)/);
});

test("洞察卡桌面双列、手机单列并保留触控目标", () => {
  assert.match(styles, /\.reading-insights-grid[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.reading-insights-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.reading-insights-head \.button \{ min-height: 44px; \}/);
});

test("AI 阅读洞察可生成与现有分享卡同源风格的图片", () => {
  assert.match(html, /id="shareReadingInsightsBtn"[^>]*>分享</);
  assert.match(app, /async function renderReadingInsightsShareCard\(\)/);
  assert.match(app, /const C = activeShareCard\(\)/);
  assert.match(app, /loadShareAssets\(\)/);
  assert.match(app, /drawShareHeader\(ctx, C, logo\)/);
  assert.match(app, /drawShareFooter\(ctx, C, qr,[^]*看见阅读留下的轨迹/);
  assert.match(app, /openShareCardDialog\(await renderReadingInsightsShareCard\(\), "AI阅读洞察"\)/);
  assert.match(app, /img\.alt = `\$\{filename \|\| "内容"\}分享图`/);
});
