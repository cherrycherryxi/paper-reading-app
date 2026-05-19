(function () {
  const els = {
    messages: document.querySelector("#chatMessages"),
    input: document.querySelector("#chatInput"),
    sendBtn: document.querySelector("#chatSendBtn"),
    clearBtn: document.querySelector("#chatClearBtn"),
    bookSelect: document.querySelector("#chatBookSelect"),
    bookInput: document.querySelector("#chatBookInput"),
    bookDropdown: document.querySelector("#chatBookDropdown"),
    bookClearPick: document.querySelector("#chatBookClearPick"),
    bookContext: document.querySelector("#chatBookContext"),
    promptChips: document.querySelector("#chatPromptChips"),
  };

  let history = [];
  let currentBookId = "";

  function normalizePreferredBookValue(preferredValue) {
    return typeof preferredValue === "string" ? preferredValue : "";
  }

  function activeBookId() {
    return currentBookId || els.bookSelect?.value || "";
  }

  function bookLabel(book) {
    if (!book) return "";
    return `${book.title}${book.author ? ` — ${book.author}` : ""}`;
  }

  function displayBookTitle(title) {
    const clean = String(title || "这本书").replace(/^《+|》+$/g, "").trim() || "这本书";
    return `《${clean}》`;
  }

  function getBooks() {
    return window.paperReadingApp?.getState?.()?.books || [];
  }

  function findBook(bookId) {
    return getBooks().find((book) => book.id === bookId);
  }

  function getBookStats(bookId) {
    const state = window.paperReadingApp?.getState?.() || {};
    const sessions = (state.sessions || []).filter((item) => item.bookId === bookId);
    const quotes = (state.quotes || []).filter((item) => item.bookId === bookId);
    const connections = (state.connections || []).filter((conn) => {
      const quoteBookId = (quoteId) => (state.quotes || []).find((quote) => quote.id === quoteId)?.bookId || "";
      return conn.sourceId === bookId || conn.targetId === bookId ||
        (conn.sourceType === "quote" && quoteBookId(conn.sourceId) === bookId) ||
        (conn.targetType === "quote" && quoteBookId(conn.targetId) === bookId);
    });
    const minutes = sessions.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    return { sessions: sessions.length, quotes: quotes.length, connections: connections.length, minutes };
  }

  function renderBookContext() {
    if (!els.bookContext) return;
    const book = findBook(currentBookId);
    if (!book) {
      els.bookContext.hidden = true;
      els.bookContext.innerHTML = "";
      return;
    }
    const stats = getBookStats(book.id);
    const authorText = book.author ? ` · ${book.author}` : "";
    els.bookContext.innerHTML = `
      <span class="chat-context-label">当前</span>
      <strong>${escapeHtml(displayBookTitle(book.title || "未命名书籍"))}</strong>
      <span class="chat-context-meta">${escapeHtml(`${stats.quotes} 摘抄 · ${stats.connections} 关联${authorText}`)}</span>
    `;
    els.bookContext.hidden = false;
  }

  function syncPickerDisplay() {
    const book = findBook(currentBookId);
    if (els.bookInput) {
      els.bookInput.value = book ? bookLabel(book) : "";
    }
    if (els.bookClearPick) {
      els.bookClearPick.hidden = !currentBookId;
    }
    renderBookContext();
  }

  function hideBookDropdown() {
    if (els.bookDropdown) {
      els.bookDropdown.hidden = true;
    }
  }

  function renderBookDropdown(query = "") {
    if (!els.bookDropdown) return;
    const books = getBooks();
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? books.filter((book) => {
          const haystack = [book.title, book.author, ...(book.tags || [])].join(" ").toLowerCase();
          return haystack.includes(normalized);
        })
      : books;

    els.bookDropdown.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("li");
      empty.className = "book-picker-empty";
      empty.textContent = normalized ? "没有匹配的书籍" : "还没有书籍";
      els.bookDropdown.appendChild(empty);
      els.bookDropdown.hidden = false;
      return;
    }

    matches.forEach((book) => {
      const item = document.createElement("li");
      item.dataset.bookId = book.id;
      item.setAttribute("role", "option");
      item.innerHTML = `
        <span class="picker-book-spine"></span>
        <span class="picker-book-info">
          <span class="picker-book-title">${escapeHtml(book.title)}</span>
          <span class="picker-book-author">${escapeHtml(book.author || "未知作者")}</span>
        </span>
      `;
      els.bookDropdown.appendChild(item);
    });
    els.bookDropdown.hidden = false;
  }

  function selectChatBook(bookId) {
    currentBookId = bookId || "";
    if (els.bookSelect) {
      els.bookSelect.value = currentBookId;
    }
    syncPickerDisplay();
    hideBookDropdown();
    restoreHistory();
  }

  function resetMessages() {
    if (!els.messages) return;
    const book = findBook(activeBookId());
    const title = book ? `围绕${displayBookTitle(book.title)}继续想` : "选择一本书，开始探讨";
    const subtitle = book
      ? "可以直接提问，也可以用下方快捷入口整理主题、问题和关联。"
      : "从上方选择书籍后，我会结合阅读记录、摘抄和关联来回答。";
    els.messages.innerHTML = `<div class="chat-welcome">
      <span class="chat-deco chat-deco--1"></span>
      <span class="chat-deco chat-deco--2"></span>
      <span class="chat-deco chat-deco--3"></span>
      <span class="chat-deco chat-deco--4"></span>
      <span class="chat-deco chat-deco--5"></span>
      <div class="chat-welcome-content">
        <span class="chat-welcome-title">${escapeHtml(title)}</span>
        <span class="chat-welcome-subtitle">${escapeHtml(subtitle)}</span>
      </div>
    </div>`;
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
    const bookId = activeBookId();
    history = window.paperReadingApp?.getChatHistoryForBook?.(bookId) || [];
    resetMessages();
    history.forEach((item) => appendBubble(item.role, item.content));
  }

  function populateChatBookSelect(preferredValue) {
    if (!els.bookSelect) return;
    const prevValue = normalizePreferredBookValue(preferredValue) || currentBookId || els.bookSelect.value;
    const books = getBooks();
    els.bookSelect.innerHTML = '<option value="">— 不关联书籍 —</option>';
    books.forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = bookLabel(book);
      els.bookSelect.appendChild(option);
    });
    if (prevValue && books.some((book) => book.id === prevValue)) {
      els.bookSelect.value = prevValue;
      currentBookId = prevValue;
      syncPickerDisplay();
      return;
    }
    currentBookId = els.bookSelect.value || "";
    syncPickerDisplay();
  }

  async function sendMessage() {
    const text = els.input?.value.trim();
    if (!text) return;

    if (!window.paperReadingApp?.requireAuth?.("使用探讨功能")) {
      return;
    }

    els.input.value = "";
    appendBubble("user", text);
    const thinking = appendBubble("assistant", "");
    thinking.classList.add("chat-bubble-loading");
    els.sendBtn.disabled = true;

    try {
      const url = window.paperReadingApp.buildApiUrl("/api/chat/stream");
      const token = window.paperReadingApp.getAuthToken();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          bookId: currentBookId,
          message: text,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPayload = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          let evt;
          try {
            evt = JSON.parse(line.trim().slice(6));
          } catch {
            continue;
          }
          if (evt.error) throw new Error(evt.error);
          if (evt.delta) {
            thinking.classList.remove("chat-bubble-loading");
            thinking.textContent += evt.delta;
            els.messages.scrollTop = els.messages.scrollHeight;
          }
          if (evt.done) {
            finalPayload = evt;
          }
        }
      }

      if (finalPayload) {
        const bookId = activeBookId();
        history = Array.isArray(finalPayload.history) ? finalPayload.history : [];
        const actions = Array.isArray(finalPayload.actions) ? finalPayload.actions : [];
        window.paperReadingApp.setChatHistoryForBook(bookId, history);
        await window.paperReadingApp.loadRemoteLogs?.();
        if (actions.length > 0) {
          handleAgentActions(actions);
        }
      }
    } catch (error) {
      thinking.textContent = `出错了：${error.message}`;
      thinking.classList.add("chat-error");
      await window.paperReadingApp.loadRemoteLogs?.();
    } finally {
      els.sendBtn.disabled = false;
    }
  }

  function clearHistory() {
    const bookId = activeBookId();
    const books = window.paperReadingApp?.getState?.()?.books || [];
    const book = books.find((b) => b.id === bookId);
    const scope = book ? book.title : "当前书籍";
    window.paperReadingApp?.showConfirmDialog?.({
      message: `清空 ${scope} 的探讨记录？`,
      confirmLabel: "确认清空",
      onConfirm: async () => {
        await window.paperReadingApp?.clearChatHistory?.();
        history = [];
        resetMessages();
      },
    });
  }

  function bindEvents() {
    els.sendBtn?.addEventListener("click", sendMessage);
    els.clearBtn?.addEventListener("click", clearHistory);
    els.bookSelect?.addEventListener("change", () => {
      currentBookId = els.bookSelect?.value || "";
      syncPickerDisplay();
      restoreHistory();
    });
    els.bookInput?.addEventListener("focus", () => {
      const selectedBook = findBook(currentBookId);
      const value = selectedBook && els.bookInput.value === bookLabel(selectedBook) ? "" : els.bookInput.value;
      renderBookDropdown(value);
    });
    els.bookInput?.addEventListener("input", () => {
      const selectedBook = findBook(currentBookId);
      if (selectedBook && els.bookInput.value !== bookLabel(selectedBook)) {
        currentBookId = "";
        if (els.bookSelect) els.bookSelect.value = "";
        if (els.bookClearPick) els.bookClearPick.hidden = true;
      }
      renderBookDropdown(els.bookInput.value);
    });
    els.bookInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideBookDropdown();
        syncPickerDisplay();
      }
    });
    els.bookDropdown?.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    els.bookDropdown?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    els.bookDropdown?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-book-id]");
      if (!item) return;
      selectChatBook(item.dataset.bookId);
    });
    els.bookClearPick?.addEventListener("click", () => {
      selectChatBook("");
      els.bookInput?.focus();
      renderBookDropdown("");
    });
    document.addEventListener?.("click", (event) => {
      if (!event.target.closest(".book-picker")) {
        hideBookDropdown();
        syncPickerDisplay();
      }
    });
    els.promptChips?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chat-prompt]");
      if (!button || !els.input) return;
      els.input.value = button.dataset.chatPrompt || "";
      els.input.focus();
    });
    els.messages?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chat-suggestion]");
      if (!button || !els.input) return;
      els.input.value = button.dataset.chatSuggestion || "";
      els.input.focus();
    });
    els.input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        // Guard: do not submit while a response is in-flight (sendBtn is disabled)
        if (!els.sendBtn?.disabled) {
          sendMessage();
        }
      }
    });

    window.addEventListener("paper-reading-data-changed", () => {
      populateChatBookSelect(activeBookId());
    });
    window.addEventListener("paper-reading-user-changed", () => {
      currentBookId = activeBookId();
      populateChatBookSelect();
      restoreHistory();
    });
  }

  function handleAgentActions(actions) {
    if (!actions || !actions.length) return;
    const actionable = [];
    actions.forEach((action) => {
      if (action?.type === "question" && action.data?.content) {
        appendBubble("assistant", "❓ " + action.data.content);
      } else {
        actionable.push(action);
      }
    });
    showAgentConfirm(actionable);
  }

  // 依次展示 actions 数组中的每一个操作卡片，前一张处理完才显示下一张
  function showAgentConfirm(actions) {
    if (!actions || !actions.length) return;
    _showNextAgentAction([...actions]);
  }

  function _showNextAgentAction(remaining) {
    const action = remaining.shift();
    if (!action) return;

    // remaining.length is the count of items left AFTER this one (shift already happened)
    const totalLabel = remaining.length > 0 ? ` (还有 ${remaining.length} 条)` : "";

    const container = document.createElement('div');
    container.className = 'agent-confirm';

    container.innerHTML = `
      <div class="agent-confirm-text">💡 AI 建议：${renderActionText(action)}${escapeHtml(totalLabel)}</div>
      <div class="agent-confirm-actions">
        <button class="agent-confirm-btn button button-primary button-small">确认执行</button>
        <button class="agent-cancel-btn button button-ghost button-small">忽略</button>
      </div>
    `;

    els.messages.appendChild(container);
    els.messages.scrollTop = els.messages.scrollHeight;

    const confirmBtn = container.querySelector('.agent-confirm-btn');
    const cancelBtn = container.querySelector('.agent-cancel-btn');

    let handled = false;

    confirmBtn.onclick = async () => {
      if (handled) return;
      handled = true;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      confirmBtn.textContent = "执行中...";
      let succeeded = true;
      try {
        await approveAction(action);
        confirmBtn.textContent = "已完成 ✅";
      } catch (e) {
        confirmBtn.textContent = "失败 ❌";
        succeeded = false;
        console.error("approveAction error:", e);
      }
      setTimeout(() => {
        container.remove();
        appendBubble("system", succeeded ? `✅ 已执行：${renderActionText(action)}` : `❌ 执行失败：${renderActionText(action)}`);
        _showNextAgentAction(remaining);
      }, 600);
    };

    cancelBtn.onclick = async () => {
      if (handled) return;
      handled = true;
      cancelBtn.disabled = true;
      confirmBtn.disabled = true;
      try {
        if (action.id) {
          await window.paperReadingApp.apiFetch(`/api/agent-actions/${action.id}/reject`, { method: "POST" }, true);
        }
      } catch (e) {
        console.error("rejectAction error:", e);
      }
      container.remove();
      appendBubble("system", `⏭ 已忽略：${renderActionText(action)}`);
      _showNextAgentAction(remaining);
    };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderActionText(action) {
    const d = action.data || {};
    switch (action.type) {
      case 'add_note':    return `📝 新增笔记：${escapeHtml(String(d.content || ''))}`;
      case 'add_book':    return `📚 加入书单：${escapeHtml(String(d.title || '').replace(/^《+|》+$/g, '').trim())}`;
      case 'summary':     return `📌 生成阶段总结`;
      case 'question':    return `❓ 提出问题：${escapeHtml(String(d.content || ''))}`;
      case 'tag':         return `🏷 添加标签：${(d.tags || []).join('、')}`;
      case 'link_thought': return `🔗 建立关联（${escapeHtml(String(d.kind || ''))}）：${escapeHtml(String(d.thought || '').slice(0, 40))}${String(d.thought || '').length > 40 ? '…' : ''}`;
      default:            return '未知操作';
    }
  }

  // 问题2修复：state/createId/syncState/render/showToast 都通过 window.paperReadingApp 访问
  async function approveAction(action) {
    if (!action?.id) {
      throw new Error("缺少 action id");
    }
    const app = window.paperReadingApp;
    const selectedBookId = activeBookId();
    const result = await app.apiFetch(`/api/agent-actions/${action.id}/approve`, { method: "POST" }, true);
    if (result?.state) {
      const currentState = app.getState();
      Object.assign(currentState, result.state);
    }
    // Only refresh the book select — do NOT call restoreHistory() here,
    // because that calls resetMessages() which destroys all pending action cards.
    populateChatBookSelect(selectedBookId);
    app.showToast("操作已执行");

    await app.loadRemoteLogs?.();
    window.dispatchEvent(new CustomEvent("paper-reading-data-changed"));
  }

  window.populateChatBookSelect = populateChatBookSelect;
  window.paperReadingApp.getActiveChatBookId = activeBookId;
  window.paperReadingApp.switchChatToBook = (bookId) => {
    populateChatBookSelect(bookId);
    restoreHistory();
  };

  populateChatBookSelect();
  restoreHistory();
  bindEvents();
})();
