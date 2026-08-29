const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function calculateMetrics(state) {
  const functionSource = app.match(/function readingInsightMetrics\(\) \{[\s\S]*?\n\}\n\nfunction defaultReadingInsightNarratives/);
  assert.ok(functionSource, "应能提取 readingInsightMetrics");
  const context = { state, isRegularQuote: (item) => item?.kind !== "question" };
  vm.createContext(context);
  vm.runInContext(`${functionSource[0].replace(/\n\nfunction defaultReadingInsightNarratives$/, "")}\nthis.result = readingInsightMetrics();`, context);
  return context.result;
}

test("我的页面用四类阅读洞察替代四张计数卡", () => {
  assert.match(html, /AI 阅读洞察/);
  assert.match(html, /id="refreshReadingInsightsBtn"/);
  for (const title of ["阅读动力", "阅读结构", "兴趣图谱", "知识沉淀"]) assert.match(app, new RegExp(title));
  assert.doesNotMatch(app, /class="stat-card profile-stat-card"/);
});

test("图表数字由本地确定性计算且包含文字可访问名称", () => {
  assert.match(app, /function readingInsightMetrics\(\)/);
  assert.match(app, /最近八周阅读分钟数/);
  assert.match(app, /最近八周新增摘抄数/);
  assert.match(app, /天活跃\/本周/);
  assert.match(app, /weeks\[7\]\.minutes === 0 && weeks\[7\]\.quoteCount > 0/);
  assert.match(app, /在读 \$\{structure\.readingBooks\} 本/);
  assert.match(app, /摘抄 \$\{metrics\.funnel\.quoteCount\}/);
  assert.match(app, /role="img"/);
});

test("阅读动力只统计摘抄，不把笔记伪装成新增摘抄", () => {
  const metrics = calculateMetrics({
    books: [], sessions: [], connections: [], memories: [],
    quotes: [{ id: "note-1", kind: "note", createdAt: new Date().toISOString() }],
  });
  assert.equal(metrics.momentum.thisWeekQuotes, 0);
  assert.equal(metrics.momentum.thisWeekValue, 0);
  assert.equal(metrics.funnel.noteCount, 1);
  assert.equal(metrics.funnel.quoteCount, 0);
});

test("稀疏摘抄趋势保留小数周均值后再计算百分比", () => {
  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setHours(0, 0, 0, 0);
  currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7));
  const previousQuote = new Date(currentWeekStart.getTime() - 8 * 86400000);
  const currentQuote = new Date(currentWeekStart.getTime() + 12 * 3600000);
  const metrics = calculateMetrics({
    books: [], sessions: [], connections: [], memories: [],
    quotes: [
      { id: "quote-previous", kind: "quote", createdAt: previousQuote.toISOString() },
      { id: "quote-current", kind: "quote", createdAt: currentQuote.toISOString() },
    ],
  });
  assert.equal(metrics.momentum.previousAverage, 0.25);
  assert.equal(metrics.momentum.trend, 300);
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
