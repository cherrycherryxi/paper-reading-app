(function () {
  // E24: inactivity window for streaming chat. If no stream activity (response
  // headers or a delta) arrives within this window, abort the fetch so the
  // reader stops hanging on a silently half-closed connection.
  const STREAM_IDLE_TIMEOUT_MS = 30000;

  const els = {
    messages: document.querySelector("#chatMessages"),
    input: document.querySelector("#chatInput"),
    sendBtn: document.querySelector("#chatSendBtn"),
    clearBtn: document.querySelector("#chatClearBtn"),
    bookSelect: document.querySelector("#chatBookSelect"),
    bookInput: document.querySelector("#chatBookInput"),
    bookDropdown: document.querySelector("#chatBookDropdown"),
    bookRail: document.querySelector("#chatBookRail"),
    bookClearPick: document.querySelector("#chatBookClearPick"),
    bookContext: document.querySelector("#chatBookContext"),
    promptChips: document.querySelector("#chatPromptChips"),
    quotePin: document.querySelector("#chatQuotePin"),
    quotePinBook: document.querySelector("#chatQuotePinBook"),
    quotePinText: document.querySelector("#chatQuotePinText"),
    quotePinToggle: document.querySelector("#chatQuotePinToggle"),
    scrollBtnRow: document.querySelector("#chatScrollBtnRow"),
    scrollBtn: document.querySelector("#chatScrollBtn"),
  };

  let history = [];
  let currentBookId = "";
  let currentQuoteId = "";

  function normalizePreferredBookValue(preferredValue) {
    return typeof preferredValue === "string" ? preferredValue : "";
  }

  function activeBookId() {
    return currentBookId || els.bookSelect?.value || "";
  }

  function activeQuoteId() {
    return currentQuoteId || "";
  }

  function activeChatContext() {
    const bookId = activeBookId();
    const quoteId = currentQuoteId || "";
    const rawContext = quoteId ? { type: "quote", bookId, quoteId } : null;
    return window.paperReadingApp?.normalizeChatContext?.(rawContext, bookId) || (quoteId ? { type: "quote", bookId, quoteId } : (bookId ? { type: "book", bookId } : { type: "global" }));
  }

  function getChatHistory(context) {
    if (window.paperReadingApp?.getChatHistoryForContext) {
      return window.paperReadingApp.getChatHistoryForContext(context);
    }
    return window.paperReadingApp?.getChatHistoryForBook?.(context?.bookId || "") || [];
  }

  function setChatHistory(context, nextHistory) {
    if (window.paperReadingApp?.setChatHistoryForContext) {
      window.paperReadingApp.setChatHistoryForContext(context, nextHistory);
      return;
    }
    window.paperReadingApp?.setChatHistoryForBook?.(context?.bookId || "", nextHistory);
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

  function getQuotes() {
    return window.paperReadingApp?.getState?.()?.quotes || [];
  }

  function findQuote(quoteId) {
    return getQuotes().find((quote) => quote.id === quoteId);
  }

  function quotePreview(quote) {
    const text = String(quote?.content || "").replace(/\s+/g, " ").trim();
    return text.length > 36 ? `${text.slice(0, 36)}...` : text;
  }

  function getBookStats(bookId) {
    const state = window.paperReadingApp?.getState?.() || {};
    const sessions = (state.sessions || []).filter((item) => item.bookId === bookId);
    const quotes = (state.quotes || []).filter((item) => item.bookId === bookId && item.kind !== "question");
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
      if (els.quotePin) els.quotePin.hidden = true;
      return;
    }
    const quote = currentQuoteId ? findQuote(currentQuoteId) : null;
    if (quote) {
      const preview = quotePreview(quote);
      els.bookContext.innerHTML = `
        <span class="chat-context-label">摘抄</span>
        <strong>${escapeHtml(displayBookTitle(book.title || "未命名书籍"))}</strong>
        <span class="chat-context-meta">${escapeHtml(preview || "当前摘抄")}</span>
        <button class="chat-context-clear" type="button" data-clear-quote-context aria-label="回到整本书">回到整本书</button>
      `;
      els.bookContext.hidden = false;

      if (els.quotePin) {
        const content = String(quote.content || quote.ocrText || "").trim();
        if (content) {
          if (els.quotePinBook) els.quotePinBook.textContent = displayBookTitle(book.title);
          if (els.quotePinText) {
            // Preserve the expanded state when re-rendering the same quote content
            // (e.g., every document click calls syncPickerDisplay → renderBookContext).
            // Only collapse when switching to a different quote.
            const sameContent = els.quotePinText.textContent === content;
            const keepExpanded = sameContent && els.quotePinText.classList.contains("is-expanded");
            els.quotePinText.textContent = content;
            if (keepExpanded) {
              els.quotePinText.classList.add("is-expanded");
            } else {
              els.quotePinText.classList.remove("is-expanded");
            }
            if (els.quotePinToggle) {
              const isLong = content.length > 40;
              els.quotePinToggle.hidden = !isLong;
              els.quotePinToggle.textContent = keepExpanded ? "收起" : "展开全文";
            }
          }
          els.quotePin.hidden = false;
        } else {
          els.quotePin.hidden = true;
        }
      }
      return;
    }

    if (els.quotePin) els.quotePin.hidden = true;
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

  // Desktop master-detail: a persistent vertical book list beside the chat.
  // Mirrors the picker's selection; clicking a row drives the same flow.
  function renderChatBookRail() {
    if (!els.bookRail) return;
    const books = getBooks();
    const active = activeBookId();
    els.bookRail.innerHTML = "";

    const head = document.createElement("div");
    head.className = "chat-rail-head";
    head.textContent = "选择书籍";
    els.bookRail.appendChild(head);

    if (!books.length) {
      const empty = document.createElement("div");
      empty.className = "chat-rail-empty";
      empty.textContent = "还没有书籍";
      els.bookRail.appendChild(empty);
      return;
    }

    books.forEach((book) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chat-rail-item" + (book.id === active ? " active" : "");
      item.dataset.bookId = book.id;
      item.innerHTML = `
        <span class="chat-rail-title">${escapeHtml(displayBookTitle(book.title))}</span>
        <span class="chat-rail-author">${escapeHtml(book.author || "未知作者")}</span>
      `;
      els.bookRail.appendChild(item);
    });
  }

  function selectChatBook(bookId) {
    currentBookId = bookId || "";
    currentQuoteId = "";
    if (els.bookSelect) {
      els.bookSelect.value = currentBookId;
    }
    syncPickerDisplay();
    hideBookDropdown();
    renderChatBookRail();
    restoreHistory();
  }

  function resetMessages() {
    if (!els.messages) return;
    if (els.scrollBtnRow) els.scrollBtnRow.hidden = true;
    const book = findBook(activeBookId());
    const quote = findQuote(activeQuoteId());
    const title = quote && book
      ? `围绕这条摘抄继续想`
      : book ? `围绕${displayBookTitle(book.title)}继续想` : "选择一本书，开始探讨";
    const subtitle = quote && book
      ? `${displayBookTitle(book.title)} · ${quotePreview(quote)}`
      : book
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

  function applyMdInline(text) {
    return text
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  }

  function renderMiniMarkdown(raw) {
    const escaped = String(raw || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const lines = escaped.split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Fenced code block
      if (trimmed.startsWith("```")) {
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // consume closing ```
        out.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        continue;
      }

      // Headers (# ## ###)
      const hm = trimmed.match(/^(#{1,3}) (.+)/);
      if (hm) {
        out.push(`<h${hm[1].length}>${applyMdInline(hm[2])}</h${hm[1].length}>`);
        i++;
        continue;
      }

      // Bullet list (collect run)
      if (/^[-*] /.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
          items.push(`<li>${applyMdInline(lines[i].trim().slice(2))}</li>`);
          i++;
        }
        out.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      // Ordered list (collect run)
      if (/^\d+\. /.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
          items.push(`<li>${applyMdInline(lines[i].trim().replace(/^\d+\. /, ""))}</li>`);
          i++;
        }
        out.push(`<ol>${items.join("")}</ol>`);
        continue;
      }

      // Empty line → paragraph break (avoid duplicate <br>s)
      if (trimmed === "") {
        const last = out[out.length - 1];
        if (last && last !== "<br>") out.push("<br>");
        i++;
        continue;
      }

      // Regular line
      out.push(`<span>${applyMdInline(line)}</span><br>`);
      i++;
    }

    // Strip trailing <br>
    while (out.length && out[out.length - 1] === "<br>") out.pop();
    return out.join("");
  }

  const SVG_COPY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const SVG_RETRY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.52"/></svg>';

  function finalizeAssistantBubble(bubble, text, userText) {
    bubble.innerHTML = "";

    const contentEl = document.createElement("div");
    contentEl.className = "chat-bubble-content";
    contentEl.innerHTML = renderMiniMarkdown(text);
    bubble.appendChild(contentEl);

    const actionsBar = document.createElement("div");
    actionsBar.className = "chat-bubble-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "chat-action-btn";
    copyBtn.type = "button";
    copyBtn.title = "复制";
    copyBtn.innerHTML = SVG_COPY;
    copyBtn.addEventListener("click", () => {
      const app = window.paperReadingApp;
      navigator.clipboard.writeText(text).then(() => {
        app?.showToast?.("已复制");
      }).catch(() => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          app?.showToast?.("已复制");
        } catch {}
      });
    });
    actionsBar.appendChild(copyBtn);

    if (userText) {
      const retryBtn = document.createElement("button");
      retryBtn.className = "chat-action-btn";
      retryBtn.type = "button";
      retryBtn.title = "重试";
      retryBtn.innerHTML = SVG_RETRY;
      retryBtn.addEventListener("click", () => {
        bubble.remove();
        actionsBar.remove();
        if (history.length > 0 && history[history.length - 1]?.role === "assistant") {
          history.pop();
          setChatHistory(activeChatContext(), history);
        }
        retryMessage(userText);
      });
      actionsBar.appendChild(retryBtn);
    }

    bubble.parentNode?.appendChild(actionsBar);
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
    if (els.scrollBtnRow) els.scrollBtnRow.hidden = true;
  }

  function appendBubble(role, text, userText) {
    if (!els.messages) return null;
    const welcome = els.messages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble-${role}`;
    els.messages.appendChild(bubble);
    if (role === "assistant" && text) {
      finalizeAssistantBubble(bubble, text, userText || null);
    } else {
      bubble.textContent = text;
    }
    scrollToBottom();
    return bubble;
  }

  function restoreHistory() {
    const context = activeChatContext();
    history = getChatHistory(context);
    const lastUser = [...history].reverse().find((item) => item?.role === "user" && item.content);
    const recoveredActions = lastUser ? findRecoveredActions(lastUser.content) : [];
    if (lastUser && recoveredActions.length > 0) {
      history = completeRecoveredHistoryWithActions(history, lastUser.content, recoveredActions);
      setChatHistory(context, history);
    }
    resetMessages();
    let lastUserText = "";
    history.forEach((item) => {
      if (item.role === "user") lastUserText = item.content;
      appendBubble(item.role, item.content, item.role === "assistant" ? lastUserText : undefined);
    });
    if (recoveredActions.length > 0) {
      handleAgentActions(recoveredActions);
    }
  }

  function findRecoveredAssistantMessage(remoteHistory, userText) {
    if (!Array.isArray(remoteHistory)) return null;
    for (let index = remoteHistory.length - 2; index >= 0; index -= 1) {
      const userItem = remoteHistory[index];
      const assistantItem = remoteHistory[index + 1];
      if (
        userItem?.role === "user" &&
        userItem.content === userText &&
        assistantItem?.role === "assistant" &&
        typeof assistantItem.content === "string" &&
        assistantItem.content.trim()
      ) {
        return assistantItem.content;
      }
    }
    return null;
  }

  function findRecoveredActions(userText) {
    const logs = window.paperReadingApp?.getRemoteLogs?.() || [];
    const matched = logs.find((log) => {
      if (log?.type !== "chat" || log.input !== userText || !Array.isArray(log.actions)) return false;
      return log.actions.some((action) => action.status === "PENDING_APPROVAL");
    });
    return matched?.actions?.filter((action) => action.status === "PENDING_APPROVAL") || [];
  }

  function completeRecoveredHistoryWithActions(remoteHistory, userText, actions) {
    if (!Array.isArray(remoteHistory) || !Array.isArray(actions) || actions.length !== 1) {
      return remoteHistory;
    }
    const action = actions[0];
    const content = action?.type === "question" ? String(action.data?.content || "").trim() : "";
    if (!content) return remoteHistory;
    const nextHistory = remoteHistory.map((item) => ({ ...item }));
    for (let index = nextHistory.length - 2; index >= 0; index -= 1) {
      const userItem = nextHistory[index];
      const assistantItem = nextHistory[index + 1];
      if (userItem?.role !== "user" || userItem.content !== userText || assistantItem?.role !== "assistant") {
        continue;
      }
      const current = String(assistantItem.content || "").trim();
      if (!current.includes(content)) {
        assistantItem.content = current ? `${current}\n\n${content}` : content;
      }
      break;
    }
    return nextHistory;
  }

  async function recoverCompletedChatAfterLoadError(userText) {
    try {
      await window.paperReadingApp?.refreshSessionState?.();
      await window.paperReadingApp?.loadRemoteLogs?.();
      const context = activeChatContext();
      const remoteHistory = getChatHistory(context);
      const recoveredReply = findRecoveredAssistantMessage(remoteHistory, userText);
      if (!recoveredReply) {
        return false;
      }
      const recoveredActions = findRecoveredActions(userText);
      history = completeRecoveredHistoryWithActions(remoteHistory, userText, recoveredActions);
      setChatHistory(context, history);
      restoreHistory();
      if (recoveredActions.length > 0) {
        handleAgentActions(recoveredActions);
      }
      return true;
    } catch {
      return false;
    }
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
      renderChatBookRail();
      return;
    }
    currentBookId = els.bookSelect.value || "";
    syncPickerDisplay();
    renderChatBookRail();
  }

  async function _doStreamAndFinalize(text, thinking) {
    try {
      const context = activeChatContext();
      if (typeof fetch !== "function") {
        const finalPayload = await window.paperReadingApp.apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, bookId: currentBookId, message: text }),
        });
        if (typeof finalPayload.reply === "string" && finalPayload.reply) {
          thinking.classList.remove("chat-bubble-loading");
          finalizeAssistantBubble(thinking, finalPayload.reply, text);
          scrollToBottom();
        }
        history = Array.isArray(finalPayload.history) ? finalPayload.history : [];
        const actions = Array.isArray(finalPayload.actions) ? finalPayload.actions : [];
        setChatHistory(finalPayload.context || context, history);
        await window.paperReadingApp.loadRemoteLogs?.();
        if (actions.length > 0) {
          handleAgentActions(actions);
        }
        return;
      }
      const url = window.paperReadingApp.buildApiUrl("/api/chat/stream");
      const token = window.paperReadingApp.getAuthToken();
      // E24: inactivity timeout — if the stream goes silent for 30s (e.g. iOS
      // network handoff half-closes the TCP connection without sending EOF),
      // abort the fetch so reader.read() rejects instead of hanging forever on
      // a spinning loading bubble.
      const controller = new AbortController();
      let idleTimer = null;
      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
      };
      try {
        // Arm the idle timer *before* awaiting fetch so the initial request /
        // response-header phase is covered too — an iOS network handoff can
        // half-close the connection before any headers arrive, which would
        // otherwise hang on `await fetch` with no timer scheduled.
        resetIdle();
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ context, bookId: currentBookId, message: text }),
          signal: controller.signal,
        });
        resetIdle();

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          if (response.status === 429 && err.message) {
            const rlErr = new Error(err.message);
            rlErr.code = "rate_limited";
            rlErr.retryAfter = Number(err.retry_after_seconds) || 0;
            throw rlErr;
          }
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
              scrollToBottom();
              resetIdle();
            }
            if (evt.done) {
              finalPayload = evt;
            }
          }
        }

        if (finalPayload) {
          if (typeof finalPayload.reply === "string" && finalPayload.reply) {
            thinking.classList.remove("chat-bubble-loading");
            finalizeAssistantBubble(thinking, finalPayload.reply, text);
            scrollToBottom();
          }
          const responseContext = finalPayload.context || context;
          history = Array.isArray(finalPayload.history) ? finalPayload.history : [];
          const actions = Array.isArray(finalPayload.actions) ? finalPayload.actions : [];
          setChatHistory(responseContext, history);
          await window.paperReadingApp.loadRemoteLogs?.();
          if (actions.length > 0) {
            handleAgentActions(actions);
          }
        }
      } finally {
        // Always clear the idle timer so it can never abort an already-finished
        // request on any exit path (success, done, throw).
        clearTimeout(idleTimer);
      }
    } catch (error) {
      // E24: an inactivity-triggered abort means the request never completed —
      // don't run recoverCompletedChatAfterLoadError (that's for "succeeded but
      // failed to load"). Render an explicit timeout state with a retry control.
      if (error?.name === "AbortError") {
        renderStreamTimeout(thinking, text);
        await window.paperReadingApp.loadRemoteLogs?.();
        return;
      }
      const recovered = await recoverCompletedChatAfterLoadError(text);
      if (!recovered) {
        if (error?.code === "rate_limited") {
          thinking.classList.remove("chat-bubble-loading");
          thinking.textContent = error.message;
          thinking.classList.add("chat-rate-limited");
        } else {
          thinking.textContent = `出错了：${error.message}`;
          thinking.classList.add("chat-error");
        }
        await window.paperReadingApp.loadRemoteLogs?.();
      }
    }
  }

  // E24: render the inactivity-timeout state inside the assistant bubble and
  // offer an inline retry control that re-sends the original message.
  function renderStreamTimeout(thinking, text) {
    thinking.classList.remove("chat-bubble-loading");
    thinking.textContent = "请求超时，请重试";
    thinking.classList.add("chat-error");

    const retryBtn = document.createElement("button");
    retryBtn.className = "chat-action-btn chat-retry-btn";
    retryBtn.type = "button";
    retryBtn.title = "重试";
    retryBtn.textContent = "重试";
    retryBtn.addEventListener("click", () => {
      thinking.classList.remove("chat-error");
      thinking.classList.add("chat-bubble-loading");
      thinking.textContent = "";
      if (els.sendBtn) els.sendBtn.disabled = true;
      Promise.resolve(_doStreamAndFinalize(text, thinking)).finally(() => {
        if (els.sendBtn) els.sendBtn.disabled = false;
      });
    });
    thinking.appendChild(retryBtn);
  }

  async function sendMessage() {
    const text = els.input?.value.trim();
    if (!text) return;
    if (!window.paperReadingApp?.requireAuth?.("使用探讨功能")) return;

    els.input.value = "";
    els.input.style.height = "auto";
    appendBubble("user", text);
    const thinking = appendBubble("assistant", "");
    thinking.classList.add("chat-bubble-loading");
    els.sendBtn.disabled = true;
    try {
      await _doStreamAndFinalize(text, thinking);
    } finally {
      els.sendBtn.disabled = false;
    }
  }

  async function retryMessage(userText) {
    const thinking = appendBubble("assistant", "");
    thinking.classList.add("chat-bubble-loading");
    els.sendBtn.disabled = true;
    try {
      await _doStreamAndFinalize(userText, thinking);
    } finally {
      els.sendBtn.disabled = false;
    }
  }

  function clearHistory() {
    const bookId = activeBookId();
    const quote = findQuote(activeQuoteId());
    const books = window.paperReadingApp?.getState?.()?.books || [];
    const book = books.find((b) => b.id === bookId);
    const scope = quote ? "当前摘抄" : (book ? book.title : "当前书籍");
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
      currentQuoteId = "";
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
        currentQuoteId = "";
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
    els.bookRail?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-book-id]");
      if (!item) return;
      selectChatBook(item.dataset.bookId);
    });
    els.bookContext?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-clear-quote-context]");
      if (!button) return;
      currentQuoteId = "";
      syncPickerDisplay();
      restoreHistory();
    });
    document.addEventListener?.("click", (event) => {
      if (!event.target.closest(".book-picker")) {
        hideBookDropdown();
        syncPickerDisplay();
      }
    });
    els.quotePinToggle?.addEventListener("click", () => {
      if (!els.quotePinText || !els.quotePinToggle) return;
      const expanded = els.quotePinText.classList.toggle("is-expanded");
      els.quotePinToggle.textContent = expanded ? "收起" : "展开全文";
    });
    els.promptChips?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chat-prompt]");
      if (!button || !els.input) return;
      els.input.value = currentQuoteId && (button.dataset.chatPrompt || "").includes("当前这本书")
        ? "只围绕当前这条摘抄，并结合它所属书籍的阅读记录，帮我提炼 1 个最值得继续追问的核心问题。不要关联其他书，不要列多个问题。"
        : button.dataset.chatPrompt || "";
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

    els.input?.addEventListener("input", () => {
      const ta = els.input;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    });

    els.messages?.addEventListener("scroll", () => {
      const m = els.messages;
      const atBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
      if (els.scrollBtnRow) els.scrollBtnRow.hidden = atBottom;
    });

    els.scrollBtn?.addEventListener("click", () => {
      scrollToBottom();
      if (els.scrollBtnRow) els.scrollBtnRow.hidden = true;
    });

    window.addEventListener("paper-reading-data-changed", () => {
      if (currentQuoteId && findQuote(currentQuoteId)?.bookId !== activeBookId()) {
        currentQuoteId = "";
      }
      populateChatBookSelect(activeBookId());
    });
    window.addEventListener("paper-reading-user-changed", () => {
      currentBookId = activeBookId();
      if (currentQuoteId && findQuote(currentQuoteId)?.bookId !== currentBookId) {
        currentQuoteId = "";
      }
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
    scrollToBottom();

    const confirmBtn = container.querySelector('.agent-confirm-btn');
    const cancelBtn = container.querySelector('.agent-cancel-btn');

    let handled = false;

    async function tryExecute() {
      handled = true;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      confirmBtn.textContent = "执行中...";
      try {
        await approveAction(action);
        confirmBtn.textContent = "已完成 ✅";
        setTimeout(() => {
          container.remove();
          appendBubble("system", `✅ 已执行：${renderActionText(action)}`);
          _showNextAgentAction(remaining);
        }, 600);
      } catch (e) {
        console.error("approveAction error:", e);
        confirmBtn.textContent = "重试";
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        handled = false;
      }
    }

    confirmBtn.onclick = async () => {
      if (handled) return;
      await tryExecute();
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
  window.paperReadingApp.getActiveChatContext = activeChatContext;
  window.paperReadingApp.switchChatToBook = (bookId) => {
    currentQuoteId = "";
    populateChatBookSelect(bookId);
    restoreHistory();
  };
  window.paperReadingApp.switchChatToQuote = (bookId, quoteId) => {
    currentBookId = bookId || "";
    currentQuoteId = quoteId || "";
    populateChatBookSelect(currentBookId);
    syncPickerDisplay();
    restoreHistory();
  };

  populateChatBookSelect();
  restoreHistory();
  bindEvents();
})();
