(function () {
  const els = {
    messages: document.querySelector("#chatMessages"),
    input: document.querySelector("#chatInput"),
    sendBtn: document.querySelector("#chatSendBtn"),
    clearBtn: document.querySelector("#chatClearBtn"),
    bookSelect: document.querySelector("#chatBookSelect"),
  };

  let history = [];
  let currentBookId = "";

  function normalizePreferredBookValue(preferredValue) {
    return typeof preferredValue === "string" ? preferredValue : "";
  }

  function activeBookId() {
    return currentBookId || els.bookSelect?.value || "";
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
    const bookId = activeBookId();
    history = window.paperReadingApp?.getChatHistoryForBook?.(bookId) || [];
    resetMessages();
    history.forEach((item) => appendBubble(item.role, item.content));
  }

  function populateChatBookSelect(preferredValue) {
    if (!els.bookSelect) return;
    const prevValue = normalizePreferredBookValue(preferredValue) || currentBookId || els.bookSelect.value;
    const books = window.paperReadingApp?.getState?.()?.books || [];
    els.bookSelect.innerHTML = '<option value="">— 不关联书籍 —</option>';
    books.forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title}${book.author ? ` — ${book.author}` : ""}`;
      els.bookSelect.appendChild(option);
    });
    if (prevValue && books.some((book) => book.id === prevValue)) {
      els.bookSelect.value = prevValue;
      currentBookId = prevValue;
      return;
    }
    currentBookId = els.bookSelect.value || "";
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
          bookId: els.bookSelect?.value || "",
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
    const scope = book ? `《${book.title}》` : "当前书籍";
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
      restoreHistory();
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
    showAgentConfirm(actions);
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
      case 'add_book':    return `📚 加入书单：《${escapeHtml(String(d.title || ''))}》`;
      case 'summary':     return `📌 生成阶段总结`;
      case 'question':    return `❓ 提出问题：${escapeHtml(String(d.content || ''))}`;
      case 'tag':         return `🏷 添加标签：${(d.tags || []).join('、')}`;
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
    if (action.type === "question" && action.data?.content) {
      appendBubble("assistant", "❓ " + action.data.content);
    }
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
