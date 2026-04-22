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
    const books = window.paperReadingApp?.getState?.()?.books || [];
    els.bookSelect.innerHTML = '<option value="">— 不关联书籍 —</option>';
    books.forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title}${book.author ? ` — ${book.author}` : ""}`;
      els.bookSelect.appendChild(option);
    });
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
      window.paperReadingApp.setChatHistoryForBook(activeBookId(), history);
      thinking.textContent = payload.reply || "";
      await window.paperReadingApp.loadRemoteLogs?.();
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

  window.populateChatBookSelect = populateChatBookSelect;
  window.paperReadingApp.getActiveChatBookId = activeBookId;

  populateChatBookSelect();
  restoreHistory();
  bindEvents();
})();
