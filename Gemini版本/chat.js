(function () {
  const STORAGE_KEY = 'paper-reading-app-v2';
  const APIKEY_KEY = 'paper-reading-chat-apikey';
  const HISTORY_KEY = 'paper-reading-chat-history';

  const isMobile = () => window.innerWidth <= 768;

  let history = [];
  let apiKey = localStorage.getItem(APIKEY_KEY) || '';

  // ── 填充手机端书籍下拉（tab 切换时由外部调用） ───────────────────────
  window.populateChatBookSelect = function () {
    const el = document.getElementById('chatBookSelect');
    if (!el) return;
    while (el.options.length > 1) el.remove(1);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { books = [] } = JSON.parse(raw);
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title + (b.author ? ` — ${b.author}` : '');
      el.appendChild(opt);
    });
  };

  // ── 填充桌面端书籍下拉 ────────────────────────────────────────────────
  function populateDesktopSelect() {
    const el = document.getElementById('chatBookSelectDesktop');
    if (!el) return;
    while (el.options.length > 1) el.remove(1);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { books = [] } = JSON.parse(raw);
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title + (b.author ? ` — ${b.author}` : '');
      el.appendChild(opt);
    });
  }

  // ── 恢复历史 ──────────────────────────────────────────────────────────
  function restoreHistory() {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return;
    try {
      history = JSON.parse(saved);
      const containerId = isMobile() ? 'chatMessages' : 'chatMessagesDesktop';
      const container = document.getElementById(containerId);
      history.forEach(m => appendBubble(m.role, m.content, container));
    } catch {}
  }

  // ── 发送消息 ──────────────────────────────────────────────────────────
  async function sendMessage(inputId, messagesId, bookSelectId, apiKeyBarId, sendBtnId) {
    const input = document.getElementById(inputId);
    const messages = document.getElementById(messagesId);
    const bookSelect = document.getElementById(bookSelectId);
    const apiKeyBar = document.getElementById(apiKeyBarId);
    const sendBtn = document.getElementById(sendBtnId);

    const text = input?.value.trim();
    if (!text) return;
    if (!apiKey) { apiKeyBar?.classList.remove('is-hidden'); return; }

    input.value = '';
    appendBubble('user', text, messages);
    history.push({ role: 'user', content: text });

    const thinkingEl = appendBubble('assistant', '…', messages);
    if (sendBtn) sendBtn.disabled = true;

    try {
      const reply = await callDeepSeek([
        { role: 'system', content: buildSystemPrompt(bookSelect?.value) },
        ...history.slice(0, -1)  // history already has the new user msg
      ]);
      thinkingEl.textContent = reply;
      history.push({ role: 'assistant', content: reply });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      thinkingEl.textContent = '出错了：' + err.message;
      thinkingEl.classList.add('chat-error');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // ── 手机端初始化 ──────────────────────────────────────────────────────
  function initMobile() {
    const apiKeyBar = document.getElementById('chatApiKeyBar');
    const apiKeyInput = document.getElementById('chatApiKeyInput');
    const apiKeySave = document.getElementById('chatApiKeySave');

    if (apiKey && apiKeyBar) apiKeyBar.classList.add('is-hidden');

    apiKeySave?.addEventListener('click', () => {
      const val = apiKeyInput?.value.trim();
      if (!val) return;
      apiKey = val;
      localStorage.setItem(APIKEY_KEY, apiKey);
      apiKeyBar?.classList.add('is-hidden');
    });

    document.getElementById('chatSendBtn')?.addEventListener('click', () =>
      sendMessage('chatInput', 'chatMessages', 'chatBookSelect', 'chatApiKeyBar', 'chatSendBtn')
    );

    document.getElementById('chatInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('chatSendBtn')?.click(); }
    });

    document.getElementById('chatClearBtn')?.addEventListener('click', () => {
      if (!confirm('清空本次对话记录？')) return;
      history = [];
      localStorage.removeItem(HISTORY_KEY);
      const m = document.getElementById('chatMessages');
      if (m) m.innerHTML = '<div class="chat-welcome">选择一本书，开始探讨。</div>';
    });
  }

  // ── 桌面端初始化 ──────────────────────────────────────────────────────
  function initDesktop() {
    const fab = document.getElementById('chatFab');
    const overlay = document.getElementById('chatOverlay');
    const closeBtn = document.getElementById('chatCloseBtn');
    const apiKeyBarD = document.getElementById('chatApiKeyBarDesktop');
    const apiKeyInputD = document.getElementById('chatApiKeyInputDesktop');
    const apiKeySaveD = document.getElementById('chatApiKeySaveDesktop');

    if (apiKey && apiKeyBarD) apiKeyBarD.classList.add('is-hidden');

    fab?.addEventListener('click', () => {
      populateDesktopSelect();
      overlay?.classList.remove('is-hidden');
      document.getElementById('chatInputDesktop')?.focus();
    });
    closeBtn?.addEventListener('click', () => overlay?.classList.add('is-hidden'));
    overlay?.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('is-hidden'); });

    apiKeySaveD?.addEventListener('click', () => {
      const val = apiKeyInputD?.value.trim();
      if (!val) return;
      apiKey = val;
      localStorage.setItem(APIKEY_KEY, apiKey);
      apiKeyBarD?.classList.add('is-hidden');
    });

    document.getElementById('chatSendBtnDesktop')?.addEventListener('click', () =>
      sendMessage('chatInputDesktop', 'chatMessagesDesktop', 'chatBookSelectDesktop', 'chatApiKeyBarDesktop', 'chatSendBtnDesktop')
    );

    document.getElementById('chatInputDesktop')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('chatSendBtnDesktop')?.click(); }
    });

    document.getElementById('chatClearBtnDesktop')?.addEventListener('click', () => {
      if (!confirm('清空本次对话记录？')) return;
      history = [];
      localStorage.removeItem(HISTORY_KEY);
      const m = document.getElementById('chatMessagesDesktop');
      if (m) m.innerHTML = '<div class="chat-welcome">选择一本书，开始探讨。</div>';
    });
  }

  // ── System Prompt ─────────────────────────────────────────────────────
  function buildSystemPrompt(bookId) {
    if (!bookId) return '你是一个阅读助手，帮助用户理解书籍内容、发散思考、深入探讨。回答简洁有深度，中文回复。';
    const raw = localStorage.getItem(STORAGE_KEY);
    const { books = [], quotes = [] } = JSON.parse(raw);
    const book = books.find(b => b.id === bookId);
    if (!book) return '你是一个阅读助手。';

    const progress = book.totalPages
      ? `当前读到第 ${book.currentPage || 0} 页，共 ${book.totalPages} 页（${Math.round((book.currentPage || 0) / book.totalPages * 100)}%）`
      : `当前页码：${book.currentPage || 0}`;

    const bookQuotes = quotes.filter(q => q.bookId === bookId);
    const quotesText = bookQuotes.length
      ? bookQuotes.map(q => `[第${q.page || '?'}页] ${q.content}${q.reflection ? `\n我的理解：${q.reflection}` : ''}`).join('\n\n')
      : '（暂无摘抄）';

    return `你是一个阅读助手，正在帮助用户深入理解和探讨以下书籍：

书名：${book.title}
作者：${book.author || '未填写'}
阅读进度：${progress}
标签：${book.tags || '无'}
备注：${book.notes || '无'}

用户的摘抄与笔记：
${quotesText}

请基于以上上下文，帮助用户理解内容、发散思考、建立联系。回答简洁有深度，中文回复。不要复述书籍信息，直接进入讨论。`;
  }

  // ── DeepSeek API ──────────────────────────────────────────────────────
  async function callDeepSeek(msgs) {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: msgs, max_tokens: 1000 })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // ── Render bubble ─────────────────────────────────────────────────────
  function appendBubble(role, text, container) {
    if (!container) return null;
    const welcome = container.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    const wrap = document.createElement('div');
    wrap.className = `chat-bubble chat-bubble-${role}`;
    wrap.textContent = text;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap;
  }

  // ── 启动 ──────────────────────────────────────────────────────────────
  restoreHistory();
  if (isMobile()) {
    initMobile();
  } else {
    initDesktop();
  }
})();
