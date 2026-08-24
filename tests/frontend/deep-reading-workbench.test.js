const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

test("切换深度共读上下文会清空旧结果，并忽略旧上下文的迟到响应", async () => {
  const listeners = new Map();
  const element = () => ({
    hidden: false,
    disabled: false,
    dataset: {},
    innerHTML: "",
    textContent: "",
    classList: { toggle() {} },
    setAttribute() {},
    focus() {},
    addEventListener(type, handler) { listeners.set(`${this.id}:${type}`, handler); },
  });
  const ids = [
    "chatDailyModeBtn", "chatResearchModeBtn", "chatResearchWorkspace", "chatClearBtn",
    "researchContextCard", "researchForm", "researchQuestion", "researchStartBtn",
    "researchCancelBtn", "researchStatus", "researchResult", "researchHistoryList",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, Object.assign(element(), { id })]));
  let currentBookId = "";
  let resolveOldRun;
  const oldRunResponse = new Promise((resolve) => { resolveOldRun = resolve; });
  const windowListeners = {};
  const sandbox = {
    console,
    URLSearchParams,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    document: {
      querySelector(selector) { return elements[selector.slice(1)] || null; },
      querySelectorAll() { return []; },
    },
    window: {
      addEventListener(type, handler) { windowListeners[type] = handler; },
      paperReadingApp: {
        getActiveChatContext: () => currentBookId ? { type: "book", bookId: currentBookId } : { type: "global" },
        getState: () => ({ books: [{ id: "book-a", title: "A" }, { id: "book-b", title: "B" }], quotes: [] }),
        getAuthToken: () => "token",
        switchChatToBook: (bookId) => { currentBookId = bookId; },
        apiFetch: async (url) => {
          if (url === "/api/research-capabilities") return { deepReading: { available: true } };
          if (url.startsWith("/api/research-runs?")) return { runs: [] };
          if (url === "/api/research-runs/run-a") return oldRunResponse;
          throw new Error(`unexpected request: ${url}`);
        },
      },
    },
  };
  const start = chat.indexOf("(function initDeepReadingWorkspace()");
  vm.runInNewContext(chat.slice(start), sandbox);

  sandbox.window.paperReadingApp.switchChatToDeepResearch({ bookId: "book-a" });
  listeners.get("researchHistoryList:click")({
    target: { closest: () => ({ dataset: { researchRunId: "run-a" } }) },
  });
  sandbox.window.paperReadingApp.switchChatToDeepResearch({ bookId: "book-b" });

  assert.equal(elements.researchStatus.textContent, "");
  assert.equal(elements.researchResult.innerHTML, "");
  resolveOldRun({ run: { id: "run-a", status: "COMPLETED", result: { summary: "A 的旧结论" } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.researchResult.innerHTML, "");
  assert.match(elements.researchContextCard.innerHTML, /《B》/);
});
