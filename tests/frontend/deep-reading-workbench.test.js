const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const chat = fs.readFileSync(path.join(root, "chat.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("深度共读是探讨内双模式，不新增底部导航", () => {
  assert.match(html, /role="tablist" aria-label="探讨模式"/);
  assert.match(html, />日常探讨</);
  assert.match(html, />深度共读</);
  assert.equal((html.match(/data-tab="/g) || []).length, 6);
});

test("研究工作台提供上下文、后台进度、结果和历史入口", () => {
  for (const id of ["researchContextCard", "researchQuestion", "researchStatus", "researchResult", "researchHistoryList"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /aria-live="polite"/);
  assert.match(chat, /\/api\/research-runs/);
  assert.match(chat, /switchChatToDeepResearch/);
  assert.match(chat, /link_thought:\s*"建立关联"/);
  assert.match(chat, /add_note:\s*"保存笔记"/);
});

test("研究交互满足移动点击和减弱动画边界", () => {
  assert.match(styles, /chat-mode-switch button[\s\S]*min-height:\s*44px/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.research-workspace[\s\S]*min-width:\s*0/);
});
