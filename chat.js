(function () {
  const els = {
    messages: document.querySelector("#chatMessages"),
    input: document.querySelector("#chatInput"),
    sendBtn: document.querySelector("#chatSendBtn"),
    clearBtn: document.querySelector("#chatClearBtn"),
    bookSelect: document.querySelector("#chatBookSelect"),
  };

  let history = [];

  function activeBookId() {
    return els.bookSelect?.value || "";
  }

  function resetMessages() {
    if (!els.messages) return;
    els.messages.innerHTML = '<div class="chat-welcome">选择一本书，开始探讨。</div>';
  }

  function appendBubble(role, text) {
    if (!els.messages) return null;
    const welcome = els.messages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble-${role}`;
    bubble.textContent = text;
    els.messages.appendChild(bubble);
    els.messages.scrollTop = els.messages.scrollHeight;
    return bubble;
  }

  function restoreHistory() {
    history = window.paperReadingApp?.getChatHistoryForBook?.(activeBookId()) || [];
    resetMessages();
    history.forEach((item) => appendBubble(item.role, item.content));
  }

  function populateChatBookSelect() {
    if (!els.bookSelect) return;
    const prevValue = els.bookSelect.value;
    const books = window.paperReadingApp?.getState?.()?.books || [];
    els.bookSelect.innerHTML = '<option value="">— 不关联书籍 —</option>';
    books.forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title}${book.author ? ` — ${book.author}` : ""}`;
      els.bookSelect.appendChild(option);
    });
    if (prevValue) els.bookSelect.value = prevValue;
  }

  async function sendMessage() {
    const text = els.input?.value.trim();
    if (!text) return;

    if (!window.paperReadingApp?.requireAuth?.("使用探讨功能")) {
      return;
    }

    els.input.value = "";
    appendBubble("user", text);
    const thinking = appendBubble("assistant", "…");
    els.sendBtn.disabled = true;

    try {
      const payload = await window.paperReadingApp.apiFetch(
        "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookId: els.bookSelect?.value || "",
            message: text,
          }),
        },
        true
      );

      history = Array.isArray(payload.history) ? payload.history : [];
      const actions = Array.isArray(payload.actions) ? payload.actions : [];
      window.paperReadingApp.setChatHistoryForBook(activeBookId(), history);
      thinking.textContent = payload.reply || "";

      // 问题3修复：发完消息后立即刷新日志
      await window.paperReadingApp.loadRemoteLogs?.();

      // 有 action 才弹确认卡片
      if (actions.length > 0) {
        handleAgentActions(actions);
      }
    } catch (error) {
      thinking.textContent = `出错了：${error.message}`;
      thinking.classList.add("chat-error");
      await window.paperReadingApp.loadRemoteLogs?.();
    } finally {
      els.sendBtn.disabled = false;
    }
  }

  async function clearHistory() {
    if (!confirm("清空当前账号下的探讨记录？")) return;
    await window.paperReadingApp?.clearChatHistory?.();
    history = [];
    resetMessages();
  }

  function bindEvents() {
    els.sendBtn?.addEventListener("click", sendMessage);
    els.clearBtn?.addEventListener("click", clearHistory);
    els.bookSelect?.addEventListener("change", restoreHistory);
    els.input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    window.addEventListener("paper-reading-data-changed", populateChatBookSelect);
    window.addEventListener("paper-reading-user-changed", () => {
      populateChatBookSelect();
      restoreHistory();
    });
  }

  function handleAgentActions(actions) {
    if (!actions || !actions.length) return;
    showAgentConfirm(actions);
  }

  // 问题1修复：函数参数是 actions 数组，内部用 actions[0] 取第一个
  // 问题2修复：不用 getElementById 查全局，改用 container.querySelector
  function showAgentConfirm(actions) {
    const action = actions[0];
    if (!action) return;

    const container = document.createElement('div');
    container.className = 'agent-confirm';

    container.innerHTML = `
      <div class="agent-confirm-text">💡 AI 建议：${renderActionText(action)}</div>
      <div class="agent-confirm-actions">
        <button class="agent-confirm-btn button button-primary button-small">确认执行</button>
        <button class="agent-cancel-btn button button-ghost button-small">忽略</button>
      </div>
    `;

    els.messages.appendChild(container);
    els.messages.scrollTop = els.messages.scrollHeight;

    // 用 container 内部查找，避免 getElementById 命中旧元素
    const confirmBtn = container.querySelector('.agent-confirm-btn');
    const cancelBtn = container.querySelector('.agent-cancel-btn');

    let executed = false;

    confirmBtn.onclick = async () => {
      if (executed) return;
      executed = true;

      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      confirmBtn.textContent = "执行中...";

      try {
        await applyActions(actions);
        confirmBtn.textContent = "已完成 ✅";
      } catch (e) {
        confirmBtn.textContent = "失败 ❌";
        console.error("applyActions error:", e);
      }

      setTimeout(() => container.remove(), 1500);
    };

    cancelBtn.onclick = () => container.remove();
  }

  function renderActionText(action) {
    const d = action.data || {};
    switch (action.type) {
      case 'add_note':    return `📝 新增笔记：${String(d.content || '').slice(0, 30)}…`;
      case 'add_book':    return `📚 加入书单：《${d.title}》`;
      case 'summary':     return `📌 生成阶段总结`;
      case 'question':    return `❓ 提出问题：${String(d.content || '').slice(0, 30)}…`;
      case 'tag':         return `🏷 添加标签：${(d.tags || []).join('、')}`;
      default:            return '未知操作';
    }
  }

  // 问题2修复：state/createId/syncState/render/showToast 都通过 window.paperReadingApp 访问
  async function applyActions(actions) {
    const action = actions[0];
    if (!action) return;

    const app = window.paperReadingApp;
    const appState = app.getState();
    const d = action.data || {};

    switch (action.type) {
      case 'add_note':
        appState.quotes.unshift({
          id: `quote-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          bookId: d.bookId || activeBookId(),
          content: d.content || '',
          tags: Array.isArray(d.tags) ? d.tags : [],
          kind: 'note',
          createdAt: new Date().toISOString(),
        });
        app.showToast("笔记已添加");
        break;

      case 'add_book': {
        const exists = appState.books.some(
          b => b.title === d.title && b.author === d.author
        );
        if (!exists) {
          appState.books.unshift({
            id: `book-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            title: d.title || '未命名',
            author: d.author || '',
            status: 'wishlist',
            notes: d.reason || '',
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          app.showToast(`《${d.title}》已加入书单`);
        } else {
          app.showToast(`《${d.title}》已在书单中`);
        }
        break;
      }

      case 'summary': {
        const book = appState.books.find(b => b.id === activeBookId());
        if (book && d.content) {
          book.notes = ((book.notes || '') + '\n\n' + d.content).trim();
          app.showToast("总结已追加到书籍备注");
        }
        break;
      }

      case 'tag': {
        const book = appState.books.find(b => b.id === activeBookId());
        if (book && Array.isArray(d.tags)) {
          const existing = new Set(book.tags || []);
          d.tags.forEach(t => existing.add(t));
          book.tags = Array.from(existing);
          app.showToast("标签已更新");
        }
        break;
      }

      case 'question':
        appendBubble("assistant", "❓ " + (d.content || ''));
        break;

      default:
        break;
    }

    // 同步到后端，用返回的 state 覆盖前端（确保 tag 等更新立即可见）
    try {
      const result = await app.apiFetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appState),
      }, true);
      // 用后端返回的权威 state 更新前端引用
      if (result?.state) {
        const s = app.getState();
        Object.assign(s, result.state);
      }
    } catch (e) {
      console.error("syncState in applyActions failed:", e);
    }

    // 问题3修复：执行 action 后也刷新日志
    await app.loadRemoteLogs?.();

    // 触发全局重渲染
    window.dispatchEvent(new CustomEvent("paper-reading-data-changed"));
  }

  window.populateChatBookSelect = populateChatBookSelect;
  window.paperReadingApp.getActiveChatBookId = activeBookId;

  populateChatBookSelect();
  restoreHistory();
  bindEvents();
})();
