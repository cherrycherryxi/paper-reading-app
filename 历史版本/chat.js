(function () {
    const STORAGE_KEY = 'paper-reading-app-v2';
    const APIKEY_KEY = 'paper-reading-chat-apikey';
    const HISTORY_KEY = 'paper-reading-chat-history';
  
    // ── DOM ──────────────────────────────────────────────────────────────
    const fab         = document.getElementById('chatFab');
    const overlay     = document.getElementById('chatOverlay');
    const closeBtn    = document.getElementById('chatCloseBtn');
    const clearBtn    = document.getElementById('chatClearBtn');
    const bookSelect  = document.getElementById('chatBookSelect');
    const apiKeyBar   = document.getElementById('chatApiKeyBar');
    const apiKeyInput = document.getElementById('chatApiKeyInput');
    const apiKeySave  = document.getElementById('chatApiKeySave');
    const messages    = document.getElementById('chatMessages');
    const input       = document.getElementById('chatInput');
    const sendBtn     = document.getElementById('chatSendBtn');
  
    // ── State ─────────────────────────────────────────────────────────────
    let history = [];   // [{role, content}]
    let apiKey  = localStorage.getItem(APIKEY_KEY) || '';
  
    // ── Init ──────────────────────────────────────────────────────────────
    function init() {
      // populateBookSelect();
      restoreHistory();
      if (apiKey) apiKeyBar.classList.add('is-hidden');
    }
  
    function populateBookSelect() {
    while (bookSelect.options.length > 1) bookSelect.remove(1); 
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { books = [] } = JSON.parse(raw);
      books.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.title + (b.author ? ` — ${b.author}` : '');
        bookSelect.appendChild(opt);
      });
    }
  
    function restoreHistory() {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (!saved) return;
      history = JSON.parse(saved);
      history.forEach(m => appendBubble(m.role, m.content));
    }
  
    // ── API Key ───────────────────────────────────────────────────────────
    apiKeySave.addEventListener('click', () => {
      const val = apiKeyInput.value.trim();
      if (!val) return;
      apiKey = val;
      localStorage.setItem(APIKEY_KEY, apiKey);
      apiKeyBar.classList.add('is-hidden');
    });
  
    // ── Open / Close ──────────────────────────────────────────────────────
    fab.addEventListener('click', () => {
        populateBookSelect();          // 每次打开时重新读
        overlay.classList.remove('is-hidden');
        input.focus();
      });
  
  
    closeBtn.addEventListener('click', () => overlay.classList.add('is-hidden'));
  
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('is-hidden');
    });
  
    // ── Clear ─────────────────────────────────────────────────────────────
    clearBtn.addEventListener('click', () => {
      if (!confirm('清空本次对话记录？')) return;
      history = [];
      localStorage.removeItem(HISTORY_KEY);
      messages.innerHTML = '<div class="chat-welcome">选择一本书，开始探讨。</div>';
    });
  
    // ── Send ──────────────────────────────────────────────────────────────
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  
    async function send() {
      const text = input.value.trim();
      if (!text) return;
      if (!apiKey) { apiKeyBar.classList.remove('is-hidden'); apiKeyInput.focus(); return; }
  
      input.value = '';
      appendBubble('user', text);
      history.push({ role: 'user', content: text });
  
      const thinkingEl = appendBubble('assistant', '…');
      sendBtn.disabled = true;
  
      try {
        const reply = await callDeepSeek(buildMessages());
        thinkingEl.textContent = reply;
        history.push({ role: 'assistant', content: reply });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch (err) {
        thinkingEl.textContent = '出错了：' + err.message;
        thinkingEl.classList.add('chat-error');
      } finally {
        sendBtn.disabled = false;
      }
    }
  
    // ── Build message list with optional book context ─────────────────────
    function buildMessages() {
      const systemPrompt = buildSystemPrompt();
      return [
        { role: 'system', content: systemPrompt },
        ...history
      ];
    }
  
    function buildSystemPrompt() {
      const bookId = bookSelect.value;
      if (!bookId) {
        return '你是一个阅读助手，帮助用户理解书籍内容、发散思考、深入探讨。回答简洁有深度，中文回复。';
      }
  
      const raw = localStorage.getItem(STORAGE_KEY);
      const { books = [], quotes = [] } = JSON.parse(raw);
      const book = books.find(b => b.id === bookId);
      if (!book) return '你是一个阅读助手。';
  
      const progress = book.totalPages
        ? `当前读到第 ${book.currentPage || 0} 页，共 ${book.totalPages} 页（${Math.round((book.currentPage || 0) / book.totalPages * 100)}%）`
        : `当前页码：${book.currentPage || 0}`;
  
      const bookQuotes = quotes.filter(q => q.bookId === bookId);
      const quotesText = bookQuotes.length
        ? bookQuotes.map(q =>
            `[第${q.page || '?'}页] ${q.content}${q.reflection ? `\n我的理解：${q.reflection}` : ''}`
          ).join('\n\n')
        : '（暂无摘抄）';
  
      return `你是一个阅读助手，正在帮助用户深入理解和探讨以下书籍：
  
  书名：${book.title}
  作者：${book.author || '未填写'}
  阅读进度：${progress}
  状态：${book.status}
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: msgs,
          max_tokens: 1000
        })
      });
  
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
  
      const data = await res.json();
      return data.choices[0].message.content;
    }
  
    // ── Render bubble ─────────────────────────────────────────────────────
    function appendBubble(role, text) {
      const welcome = messages.querySelector('.chat-welcome');
      if (welcome) welcome.remove();
  
      const wrap = document.createElement('div');
      wrap.className = `chat-bubble chat-bubble-${role}`;
      wrap.textContent = text;
      messages.appendChild(wrap);
      messages.scrollTop = messages.scrollHeight;
      return wrap;
    }
  
    init();
  })();