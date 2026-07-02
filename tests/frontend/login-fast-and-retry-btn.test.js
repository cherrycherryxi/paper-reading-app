// 两个移动端体验修复：
//  1) 登录不再 await 加载模型日志（那是「我的→调试日志」面板用的，与登录无关，
//     且要多一次隧道往返）——登录响应已内联返回 state，拿到即渲染进入 App，日志后台加载。
//  2) 超时/出错气泡里的「重试」按钮不再沿用 28×28 图标按钮尺寸（会把「重试」挤成竖排）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const chatSource = fs.readFileSync(path.join(root, "chat.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function fnBody(src, name) {
  const m = src.match(new RegExp(`async function ${name}\\(payload\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m, `未找到函数 ${name}`);
  return m[1];
}

function cssRule(src, selector) {
  const m = src.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `未找到 CSS 规则 ${selector}`);
  return m[1];
}

test("登录：拿到内联 state 立即 render，不 await 模型日志（后台加载）", () => {
  const body = fnBody(appSource, "loginSuccess");
  assert.ok(body.includes("render();"), "loginSuccess 应调用 render()");
  assert.ok(/loadRemoteLogs\(\)\.catch\(/.test(body), "模型日志应后台加载(.catch 兜底)");
  assert.ok(!/await\s+loadRemoteLogs\s*\(/.test(body), "loginSuccess 不得 await loadRemoteLogs（会阻塞登录）");
  // render 必须在 loadRemoteLogs 之前
  assert.ok(body.indexOf("render();") < body.indexOf("loadRemoteLogs()"),
    "应先 render 再后台拉日志");
});

test("重试按钮：.chat-retry-btn 覆盖固定图标尺寸为自适应文字按钮", () => {
  const rule = cssRule(cssSource, ".chat-retry-btn");
  assert.match(rule, /width:\s*auto/, "宽度应自适应，而非 28px");
  assert.match(rule, /white-space:\s*nowrap/, "「重试」两字不得换行竖排");
  assert.match(rule, /height:\s*auto/, "高度应自适应");
});

test("探讨：刷新模型日志不再阻塞聊天流程（chat.js 无 await loadRemoteLogs）", () => {
  // loadRemoteLogs 只刷新「我的→调试日志」面板，下游无依赖；每次聊天完/出错都
  // await 它会白等一次日志请求，拖慢探讨。全部改为后台加载（去掉 await）。
  assert.ok(!/await\s+[^;]*loadRemoteLogs\?\.\(\)/.test(chatSource),
    "chat.js 不应再 await loadRemoteLogs");
  const calls = (chatSource.match(/loadRemoteLogs\?\.\(\)/g) || []).length;
  assert.ok(calls >= 6, `应仍保留后台刷新日志的调用（当前 ${calls} 处）`);
});

test("超时气泡文案不与重试按钮重复（去掉『请重试』）", () => {
  assert.ok(chatSource.includes('thinking.textContent = "请求超时"'), "文案应为『请求超时』");
  assert.ok(!chatSource.includes("请求超时，请重试"), "不应再出现与按钮重复的『请重试』");
  assert.ok(chatSource.includes('"chat-action-btn chat-retry-btn"'), "重试按钮应带 chat-retry-btn 类");
});
