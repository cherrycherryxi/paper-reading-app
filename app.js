const AUTH_TOKEN_KEY = "paper-reading-auth-token-v1";

const initialState = {
  books: [],
  sessions: [],
  quotes: [],
  chatHistories: {},
  connections: [],
};

const statusMap = {
  reading: "阅读中",
  wishlist: "想读",
  paused: "暂停",
  finished: "已读完",
};

const quoteKindMap = {
  quote: "摘抄",
  note: "笔记",
};

const els = {
  bookForm: document.querySelector("#bookForm"),
  sessionForm: document.querySelector("#sessionForm"),
  quoteForm: document.querySelector("#quoteForm"),
  registerForm: document.querySelector("#registerForm"),
  loginForm: document.querySelector("#loginForm"),
  quoteTypeChips: document.querySelector("#quoteTypeChips"),
  quoteSearch: document.querySelector("#quoteSearch"),
  statusFilterChips: document.querySelector("#statusFilterChips"),
  booksResultCount: document.querySelector("#booksResultCount"),
  importInput: document.querySelector("#importInput"),
  importExcelInput: document.querySelector("#importExcelInput"),
  exportButton: document.querySelector("#exportButton"),
  clearLogsBtn: document.querySelector("#clearLogsBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  booksList: document.querySelector("#booksList"),
  timeline: document.querySelector("#timeline"),
  sessionSearch: document.querySelector("#sessionSearch"),
  sessionStats: document.querySelector("#sessionStats"),
  quotesList: document.querySelector("#quotesList"),
  logsList: document.querySelector("#modelLogsList"),
  meSummary: document.querySelector("#meSummary"),
  meProfileCard: document.querySelector("#meProfileCard"),
  profileStatusPill: document.querySelector("#profileStatusPill"),
  readingCompletionRate: document.querySelector("#readingCompletionRate"),
  readingCompletionBar: document.querySelector("#readingCompletionBar"),
  authPanel: document.querySelector("#authPanel"),
  userPanel: document.querySelector("#userPanel"),
  currentUsername: document.querySelector("#currentUsername"),
  currentUserMeta: document.querySelector("#currentUserMeta"),
  sessionBookSelect: document.querySelector("#sessionBookSelect"),
  quoteBookSelect: document.querySelector("#quoteBookSelect"),
  quoteContent: document.querySelector("#quoteContent"),
  bookImageInput: document.querySelector("#bookImageInput"),
  bookImageStatus: document.querySelector("#bookImageStatus"),
  bookImagePreview: document.querySelector("#bookImagePreview"),
  bookPreviewImg: document.querySelector("#bookPreviewImg"),
  bookEditDialog: document.querySelector("#bookEditDialog"),
  bookEditForm: document.querySelector("#bookEditForm"),
  bookEditDialogTitle: document.querySelector("#bookEditDialogTitle"),
  bookEditImageInput: document.querySelector("#bookEditImageInput"),
  bookEditImageStatus: document.querySelector("#bookEditImageStatus"),
  bookEditImagePreview: document.querySelector("#bookEditImagePreview"),
  bookEditPreviewImg: document.querySelector("#bookEditPreviewImg"),
  bookDetailDialog: document.querySelector("#bookDetailDialog"),
  bookDetailTitle: document.querySelector("#bookDetailTitle"),
  bookDetailMeta: document.querySelector("#bookDetailMeta"),
  bookDetailIntro: document.querySelector("#bookDetailIntro"),
  bookDetailQuotes: document.querySelector("#bookDetailQuotes"),
  quoteImageInput: document.querySelector("#quoteImageInput"),
  quoteImagePreview: document.querySelector("#quoteImagePreview"),
  quotePreviewImg: document.querySelector("#quotePreviewImg"),
  ocrButton: document.querySelector("#ocrButton"),
  ocrStatus: document.querySelector("#ocrStatus"),
  heroBooks: document.querySelector("#heroBooks"),
  heroMinutes: document.querySelector("#heroMinutes"),
  heroQuotes: document.querySelector("#heroQuotes"),
  toast: document.querySelector("#toast"),
  deleteBookDialog: document.querySelector("#deleteBookDialog"),
  deleteBookMessage: document.querySelector("#deleteBookMessage"),
  deleteBookConfirmBtn: document.querySelector("#deleteBookConfirmBtn"),
  deleteBookCancelBtn: document.querySelector("#deleteBookCancelBtn"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmDialogMessage: document.querySelector("#confirmDialogMessage"),
  confirmDialogConfirmBtn: document.querySelector("#confirmDialogConfirmBtn"),
  confirmDialogCancelBtn: document.querySelector("#confirmDialogCancelBtn"),
  bookDialog: document.querySelector("#bookDialog"),
  sessionDialog: document.querySelector("#sessionDialog"),
  quoteDialog: document.querySelector("#quoteDialog"),
  openBookDialogBtn: document.querySelector("#openBookDialogBtn"),
  openSessionDialogBtn: document.querySelector("#openSessionDialogBtn"),
  openQuoteDialogBtn: document.querySelector("#openQuoteDialogBtn"),
  openConnectionDialogBtn: document.querySelector("#openConnectionDialogBtn"),
  connectionDialog: document.querySelector("#connectionDialog"),
  connectionForm: document.querySelector("#connectionForm"),
  connectionsList: document.querySelector("#connectionsList"),
  connectionSearch: document.querySelector("#connectionSearch"),
  connectionKindChips: document.querySelector("#connectionKindChips"),
  quoteDetailConnectBtn: document.querySelector("#quoteDetailConnectBtn"),
  mobileTabs: document.querySelectorAll(".mobile-tab"),
};

let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let currentUser = null;
let state = structuredClone(initialState);
let pendingBookImage = null;
let pendingBookEditImage = null;
let pendingQuoteImage = null;
let toastTimer = null;
let selectedStatusFilter = "all";
let selectedTagFilter = "";
let searchQuery = "";
let searchDebounceTimer = null;
let remoteLogs = [];

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getBackendBaseUrl() {
  return String(window.PAPER_READING_APP_CONFIG?.backendBaseUrl || "").replace(/\/$/, "");
}

function buildApiUrl(path) {
  return `${getBackendBaseUrl()}${path}`;
}

function resolveImageUrl(url) {
  if (!url) return "";
  // Relative path
  if (url.startsWith("/media/") || url.startsWith("/uploads/")) {
    return getBackendBaseUrl() + url;
  }
  // Absolute URL with possibly stale domain (e.g. old ngrok) — extract path from /media/ or /uploads/
  const pathMatch = url.match(/(\/(?:media|uploads)\/.+)$/);
  if (pathMatch) {
    return getBackendBaseUrl() + pathMatch[1];
  }
  return url;
}

async function apiFetch(path, options = {}, requiresAuth = true) {
  const headers = {
    ...(options.headers || {}),
  };

  if (requiresAuth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    // 401 means the session has expired — surface a clear message and reset auth state
    if (response.status === 401 && requiresAuth) {
      authToken = "";
      currentUser = null;
      localStorage.removeItem(AUTH_TOKEN_KEY);
      showToast("登录已过期，请重新登录");
      dispatchUserChange();
    }
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

function dispatchUserChange() {
  window.dispatchEvent(new CustomEvent("paper-reading-user-changed"));
}

/**
 * Run an async save operation while disabling the submit button and showing a
 * "保存中…" label. Restores the button text on completion regardless of outcome.
 * @param {HTMLButtonElement|null} btn - The submit button to disable
 * @param {string} savingLabel - Text shown while saving (default "保存中…")
 * @param {() => Promise<void>} fn  - The async operation
 */
async function withSavingState(btn, savingLabel = "保存中…", fn) {
  if (!btn) return fn();
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = savingLabel;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("visible");
  }, 2200);
}

function formatDate(dateString) {
  if (!dateString) return "未记录";
  return new Date(dateString).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeTags(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseExcelDateToIso(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getRowField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return "";
}

function normalizeBookStatus(raw, startedAt, finishedAt) {
  const value = String(raw || "").trim().toLowerCase();
  if (value.includes("finished") || value.includes("已读完")) return "finished";
  if (value.includes("reading") || value.includes("阅读中")) return "reading";
  if (value.includes("paused") || value.includes("暂停")) return "paused";
  if (value.includes("wishlist") || value.includes("想读")) return "wishlist";
  if (finishedAt) return "finished";
  if (startedAt) return "reading";
  return "wishlist";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Strip leading/trailing 《》 so storage is always bare title
function normalizeBookTitle(raw) {
  return String(raw).trim().replace(/^《+|》+$/g, "").trim();
}

// Wrap with book-title marks for display; strip any existing marks first
function formatBookTitle(title) {
  const bare = String(title || "").replace(/^《+|》+$/g, "").trim();
  return escapeHtml(bare);
}

function getProgress(book) {
  if (!book.totalPages) return null;
  return Math.max(0, Math.min(100, Math.round(((book.currentPage || 0) / book.totalPages) * 100)));
}

function getBookSessions(bookId) {
  return state.sessions.filter((item) => item.bookId === bookId);
}

function getBookMetrics(bookId) {
  const sessions = getBookSessions(bookId);
  return {
    count: sessions.length,
    minutes: sessions.reduce((sum, item) => sum + Number(item.minutes || 0), 0),
    pages: sessions.reduce((sum, item) => sum + Number(item.pagesRead || 0), 0),
  };
}

function getQuoteCount(bookId) {
  return state.quotes.filter((item) => item.bookId === bookId).length;
}

function getConnectionCount(itemId) {
  return (state.connections || []).filter((c) => c.sourceId === itemId || c.targetId === itemId).length;
}

function resolveConnectionSide(type, id) {
  if (type === "book") {
    const book = state.books.find((b) => b.id === id);
    return book ? { label: formatBookTitle(book.title), sub: book.author || "" } : { label: "（已删除）", sub: "" };
  }
  const quote = state.quotes.find((q) => q.id === id);
  if (!quote) return { label: "（已删除）", sub: "" };
  const book = state.books.find((b) => b.id === quote.bookId);
  return { label: `"${(quote.content || "").slice(0, 36)}${quote.content?.length > 36 ? "…" : ""}"`, sub: book ? formatBookTitle(book.title) : "" };
}

const KIND_LABELS = { "异曲同工": "异曲同工", "引用": "引用", "对比": "对比", "影响": "影响", "延伸": "延伸" };

function buildConnectionCard(conn) {
  const src = resolveConnectionSide(conn.sourceType, conn.sourceId);
  const tgt = resolveConnectionSide(conn.targetType, conn.targetId);
  const kindLabel = KIND_LABELS[conn.kind] || conn.kind;
  const tagsHtml = (conn.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
  return `<div class="connection-card" data-conn-id="${escapeHtml(conn.id)}">
    <div class="connection-card-header">
      <span class="connection-kind-badge" data-kind="${escapeHtml(conn.kind)}">${escapeHtml(kindLabel)}</span>
      <button class="conn-delete-btn button-icon" type="button" aria-label="删除关联" data-conn-id="${escapeHtml(conn.id)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="connection-sides">
      <div class="connection-side">
        <div class="connection-side-label">${escapeHtml(src.label)}</div>
        ${src.sub ? `<div class="connection-side-sub">${escapeHtml(src.sub)}</div>` : ""}
      </div>
      <div class="connection-arrow">↔</div>
      <div class="connection-side">
        <div class="connection-side-label">${escapeHtml(tgt.label)}</div>
        ${tgt.sub ? `<div class="connection-side-sub">${escapeHtml(tgt.sub)}</div>` : ""}
      </div>
    </div>
    ${conn.thought ? `<div class="connection-thought">${escapeHtml(conn.thought)}</div>` : ""}
    ${tagsHtml ? `<div class="connection-tags">${tagsHtml}</div>` : ""}
    <div class="connection-meta">${formatDate(conn.createdAt)}</div>
  </div>`;
}

let selectedConnectionKindFilter = "all";

function renderConnections() {
  connSourceBookComboWrap?._comboboxUpdate?.(state.books);
  connTargetBookComboWrap?._comboboxUpdate?.(state.books);
  connSourceQuoteComboWrap?._comboboxUpdate?.(state.quotes);
  connTargetQuoteComboWrap?._comboboxUpdate?.(state.quotes);
  if (!els.connectionsList) return;
  const conns = state.connections || [];
  const searchRaw = (els.connectionSearch?.value || "").trim().toLowerCase();
  let filtered = conns;
  if (selectedConnectionKindFilter && selectedConnectionKindFilter !== "all") {
    filtered = filtered.filter((c) => c.kind === selectedConnectionKindFilter);
  }
  if (searchRaw) {
    filtered = filtered.filter((c) => {
      const getBookTitle = (type, id) => {
        if (type === "book") return state.books.find((b) => b.id === id)?.title || "";
        if (type === "quote") {
          const q = state.quotes.find((q) => q.id === id);
          return state.books.find((b) => b.id === q?.bookId)?.title || "";
        }
        return "";
      };
      const haystack = [
        getBookTitle(c.sourceType, c.sourceId),
        getBookTitle(c.targetType, c.targetId),
        c.thought || "",
      ].join(" ").toLowerCase();
      return haystack.includes(searchRaw);
    });
  }
  if (!filtered.length) {
    els.connectionsList.className = "connections-list empty-state";
    els.connectionsList.innerHTML = conns.length ? "当前筛选条件下没有关联。" : "还没有记录思想碰撞，点右上角 + 开始建立联系。";
    return;
  }
  els.connectionsList.className = "connections-list";
  els.connectionsList.innerHTML = filtered.map(buildConnectionCard).join("");
}

function requireAuth(actionText = "执行此操作") {
  if (currentUser?.id && authToken) return true;
  showToast(`请先登录后再${actionText}`);
  activateTab("me");
  return false;
}

function setAuthToken(token) {
  authToken = token || "";
  if (authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

async function syncState() {
  if (!currentUser?.id) return;
  const data = await apiFetch(
    "/api/state",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    },
    true
  );
  state = data.state || structuredClone(initialState);
  if (!state.chatHistories) {
    state.chatHistories = {};
  }
  if (!Array.isArray(state.connections)) {
    state.connections = [];
  }
}

async function loadSession() {
  if (!authToken) {
    currentUser = null;
    state = structuredClone(initialState);
    remoteLogs = [];
    render();
    return;
  }

  try {
    const data = await apiFetch("/api/session");
    currentUser = data.user || null;
    state = data.state || structuredClone(initialState);
    if (!state.chatHistories) {
      state.chatHistories = {};
    }
    if (!Array.isArray(state.connections)) {
      state.connections = [];
    }
    await loadRemoteLogs();
  } catch {
    setAuthToken("");
    currentUser = null;
    state = structuredClone(initialState);
    remoteLogs = [];
  }
  render();
  dispatchUserChange();
}

async function loadRemoteLogs() {
  if (!currentUser?.id) {
    remoteLogs = [];
    renderModelLogs();
    return;
  }
  try {
    const data = await apiFetch("/api/model-logs");
    remoteLogs = Array.isArray(data.logs) ? data.logs : [];
  } catch (error) {
    remoteLogs = [];
    showToast(`日志读取失败：${error.message}`);
  }
  renderModelLogs();
}

function renderHero() {
  const minutes = state.sessions.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  els.heroBooks.textContent = state.books.length;
  els.heroMinutes.textContent = minutes;
  els.heroQuotes.textContent = state.quotes.length;
}

function renderSummary() {
  const finishedBooks = state.books.filter((item) => item.status === "finished").length;
  const readingBooks = state.books.filter((item) => item.status === "reading").length;
  const completionRate = state.books.length ? Math.round((finishedBooks / state.books.length) * 100) : 0;
  const stats = [
    { label: "阅读中", value: readingBooks, icon: "📖" },
    { label: "书单总数", value: state.books.length, icon: "📚" },
    { label: "阅读记录", value: state.sessions.length, icon: "🕐" },
    { label: "摘抄卡片", value: state.quotes.length, icon: "✍️" },
  ];

  els.meSummary.innerHTML = stats
    .map(
      (item) => `
        <div class="stat-card profile-stat-card">
          <div class="profile-stat-icon">${item.icon}</div>
          <strong>${item.value}</strong>
          <span>${item.label}</span>
        </div>
      `
    )
    .join("");
  els.readingCompletionRate.textContent = `${completionRate}%`;
  els.readingCompletionBar.style.width = `${completionRate}%`;
}

function renderAuthPanels() {
  const isLoggedIn = Boolean(currentUser?.id);
  els.authPanel.classList.toggle("is-hidden", isLoggedIn);
  els.userPanel.classList.toggle("is-hidden", !isLoggedIn);

  if (!isLoggedIn) {
    els.currentUsername.textContent = "未登录";
    els.currentUserMeta.textContent = "登录后，账号、书单、记录、摘抄、图片、聊天历史和日志都走后端。";
    els.meProfileCard.querySelector(".profile-title").textContent = "未登录";
    els.meProfileCard.querySelector(".profile-subtitle").textContent = "登录后按账号保存你的阅读数据，并从服务器恢复。";
    els.profileStatusPill.textContent = "未连接";
    return;
  }

  els.currentUsername.textContent = currentUser.username;
  els.currentUserMeta.textContent = `阅读数据、图片、聊天历史与模型日志都保存在部署服务器。`;
  els.meProfileCard.querySelector(".profile-title").textContent = currentUser.username;
  els.meProfileCard.querySelector(".profile-subtitle").textContent = `已连接 ${getBackendBaseUrl() || "未配置后端"}`;
  els.profileStatusPill.textContent = "服务器模式";
}

function renderBookSelect(hiddenInput) {
  if (!hiddenInput) return;
  const wrap = hiddenInput.closest?.(".book-combobox");
  wrap?._comboboxUpdate?.(state.books);
}

function renderTagFilterChips() {
  const container = document.querySelector("#tagFilterStrip");
  if (!container) return;

  // 收集所有 tag
  const allTags = [...new Set(
    state.books.flatMap(b => Array.isArray(b.tags) ? b.tags : []).filter(Boolean)
  )].sort();

  if (!allTags.length) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  container.innerHTML = "";

  // "全部 tag" 重置按钮
  const allBtn = document.createElement("button");
  allBtn.className = "filter-chip tag-chip" + (selectedTagFilter === "" ? " active" : "");
  allBtn.type = "button";
  allBtn.textContent = "全部标签";
  allBtn.addEventListener("click", () => {
    selectedTagFilter = "";
    renderTagFilterChips();
    renderBooks();
  });
  container.appendChild(allBtn);

  allTags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-chip tag-chip" + (selectedTagFilter === tag ? " active" : "");
    btn.type = "button";
    btn.textContent = `🏷 ${tag}`;
    btn.addEventListener("click", () => {
      selectedTagFilter = selectedTagFilter === tag ? "" : tag;
      renderTagFilterChips();
      renderBooks();
    });
    container.appendChild(btn);
  });
}

function fuzzyMatch(haystack, needle) {
  return String(haystack).toLowerCase().includes(needle);
}

function matchBooks(query) {
  return state.books.filter(
    (book) => fuzzyMatch(book.title, query) || fuzzyMatch(book.author || "", query)
  );
}

function matchQuotes(query) {
  return state.quotes.filter((quote) => fuzzyMatch(quote.content || "", query));
}

function buildBookSearchCard(book) {
  const progress = getProgress(book);
  const metrics = getBookMetrics(book.id);
  const coverImage = resolveImageUrl(book.coverImageUrl || state.quotes.find((item) => item.bookId === book.id && item.imageUrl)?.imageUrl || "");
  const progressText =
    progress === null
      ? `已读到第 ${book.currentPage || 0} 页`
      : `${progress}% · ${book.currentPage || 0}/${book.totalPages} 页`;

  const MAX_TAGS = 3;
  const tags = Array.isArray(book.tags) && book.tags.length
    ? book.tags.slice(0, MAX_TAGS).map(t => `<span class="book-tag-chip">${escapeHtml(t)}</span>`).join("") +
      (book.tags.length > MAX_TAGS ? `<span class="book-tag-chip book-tag-more">+${book.tags.length - MAX_TAGS}</span>` : "")
    : "";

  const card = document.createElement("article");
  card.className = "book-grid-card";
  card.innerHTML = `
    <div class="book-card-cover ${coverImage ? "has-image" : ""}">
      ${
        coverImage
          ? `<img src="${coverImage}" alt="${escapeHtml(book.title)}" />`
          : `<div class="book-cover-fallback"></div>`
      }
      <span class="book-status-chip" data-status="${book.status}"><span class="chip-dot chip-dot--${book.status}"></span>${escapeHtml(statusMap[book.status] || book.status)}</span>
      <button class="book-delete-corner" type="button" title="删除书籍" aria-label="删除书籍">✖️</button>
    </div>
    <div class="book-grid-body">
      <h3>${formatBookTitle(book.title)}</h3>
      <p class="book-grid-author">${escapeHtml(book.author || "作者未填写")}</p>
      <div class="book-grid-meta">🕐 ${metrics.count} 次 · ✍️ ${getQuoteCount(book.id)} 张${getConnectionCount(book.id) ? ` · 🔗 ${getConnectionCount(book.id)} 关联` : ""}</div>
      <div class="book-grid-meta">📖 ${escapeHtml(progressText)}</div>
      ${tags ? `<div class="book-tag-row">${tags}</div>` : ""}
      <div class="book-grid-actions">
        <button class="card-action-btn edit-book-button" type="button">编辑</button>
        <button class="card-action-btn card-action-chat chat-book-button" type="button">去聊</button>
        <button class="card-action-btn connect-book-button" type="button">关联</button>
      </div>
    </div>
  `;
  card.querySelector(".edit-book-button").addEventListener("click", () => openBookEditDialog(book.id));
  card.querySelector(".chat-book-button").addEventListener("click", () => {
    activateTab("chat");
    window.paperReadingApp?.switchChatToBook?.(book.id);
  });
  card.querySelector(".connect-book-button").addEventListener("click", () => openConnectionDialog({ sourceType: "book", sourceId: book.id }));
  card.querySelector(".book-delete-corner").addEventListener("click", () => deleteBook(book.id));
  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openBookDetailDialog(book.id);
  });
  return card;
}

function buildQuoteSearchCard(quote) {
  const book = state.books.find((item) => item.id === quote.bookId);
  const tagsText = quote.tags?.length ? escapeHtml(quote.tags.join(" / ")) : "无标签";
  const card = document.createElement("article");
  card.className = "quote-grid-card";
  card.innerHTML = `
    <div class="entry-card-cover ${quote.imageUrl ? "has-image" : ""}">
      ${
        quote.imageUrl
          ? `<img src="${resolveImageUrl(quote.imageUrl)}" alt="摘抄照片" />`
          : `<div class="entry-cover-fallback"></div>`
      }
      <span class="entry-type-chip">${escapeHtml(quoteKindMap[quote.kind] || "卡片")}</span>
    </div>
    <div class="entry-card-body">
      <h3>${book ? formatBookTitle(book.title) : "未知书籍"}</h3>
      <p class="entry-card-meta">第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}</p>
      <p class="entry-card-note entry-card-note-clamp">${escapeHtml(quote.content || "")}</p>
      <p class="entry-card-tags">${tagsText}</p>
    </div>
  `;
  card.addEventListener("click", () => {
    if (book?.id) {
      openBookDetailDialog(book.id);
    }
  });
  return card;
}

function renderSearchResults(matchedBooks, matchedQuotes) {
  const totalCount = matchedBooks.length + matchedQuotes.length;
  els.booksResultCount.textContent = `找到 ${matchedBooks.length} 本书籍、${matchedQuotes.length} 条摘抄`;

  if (totalCount === 0) {
    els.booksList.className = "book-list empty-state";
    els.booksList.innerHTML = '<p class="search-empty-combined">没有找到匹配的结果，试试其他关键词</p>';
    return;
  }

  els.booksList.className = "book-list search-results";
  els.booksList.innerHTML = "";

  const booksSection = document.createElement("section");
  booksSection.className = "search-results-section";
  booksSection.innerHTML = '<h3 class="search-section-header">书籍</h3>';

  if (!matchedBooks.length) {
    booksSection.insertAdjacentHTML("beforeend", '<p class="search-empty-section">没有匹配的书籍</p>');
  } else {
    const booksList = document.createElement("div");
    booksList.className = "search-book-list";
    matchedBooks.forEach((book) => {
      booksList.appendChild(buildBookSearchCard(book));
    });
    booksSection.appendChild(booksList);
  }

  const quotesSection = document.createElement("section");
  quotesSection.className = "search-results-section";
  quotesSection.innerHTML = '<h3 class="search-section-header">摘抄</h3>';

  if (!matchedQuotes.length) {
    quotesSection.insertAdjacentHTML("beforeend", '<p class="search-empty-section">没有匹配的摘抄</p>');
  } else {
    const quotesList = document.createElement("div");
    quotesList.className = "search-quote-list";
    matchedQuotes.forEach((quote) => {
      quotesList.appendChild(buildQuoteSearchCard(quote));
    });
    quotesSection.appendChild(quotesList);
  }

  els.booksList.appendChild(booksSection);
  els.booksList.appendChild(quotesSection);
}

function restoreDefaultView() {
  searchQuery = "";
  if (els.statusFilterChips) {
    els.statusFilterChips.style.display = "";
  }
  const tagStrip = document.querySelector("#tagFilterStrip");
  if (tagStrip) {
    tagStrip.style.display = "";
  }
  renderBooks();
}

function globalSearch(query) {
  const normalized = String(query || "").trim().toLowerCase();
  searchQuery = normalized;

  if (!normalized) {
    restoreDefaultView();
    return;
  }

  if (els.statusFilterChips) {
    els.statusFilterChips.style.display = "none";
  }
  const tagStrip = document.querySelector("#tagFilterStrip");
  if (tagStrip) {
    tagStrip.style.display = "none";
  }

  renderSearchResults(matchBooks(normalized), matchQuotes(normalized));
}

function renderBooks() {
  if (!currentUser?.id) {
    els.booksList.className = "book-list empty-state";
    els.booksList.textContent = "登录后开始建立你的书单。";
    els.booksResultCount.textContent = "共 0 本";
    return;
  }

  renderTagFilterChips();

  const books = [...state.books]
    .filter((book) => selectedStatusFilter === "all" || book.status === selectedStatusFilter)
    .filter((book) => {
      if (!selectedTagFilter) return true;
      return Array.isArray(book.tags) && book.tags.includes(selectedTagFilter);
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  els.booksResultCount.textContent = `共 ${books.length} 本`;
  if (!books.length) {
    els.booksList.className = "book-list empty-state";
    els.booksList.textContent = selectedTagFilter
      ? "没有匹配的书籍，试试清除搜索条件。"
      : "还没有匹配的书籍，点右上角加号新增一本。";
    return;
  }

  els.booksList.className = "book-list";
  els.booksList.innerHTML = "";

  for (const book of books) {
    els.booksList.appendChild(buildBookSearchCard(book));
  }
}

function renderTimeline() {
  if (!currentUser?.id) {
    els.timeline.className = "timeline empty-state";
    els.timeline.textContent = "登录后，这里会显示最近阅读情况。";
    if (els.sessionStats) els.sessionStats.classList.add("is-hidden");
    return;
  }

  const searchRaw = (els.sessionSearch?.value || "").trim().toLowerCase();
  const allSorted = [...state.sessions].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const sessions = searchRaw
    ? allSorted.filter((s) => {
        const book = state.books.find((b) => b.id === s.bookId);
        const haystack = [book?.title || "", book?.author || "", s.notes || ""].join(" ").toLowerCase();
        return haystack.includes(searchRaw);
      })
    : allSorted.slice(0, 10);

  // Stats bar
  if (els.sessionStats) {
    if (searchRaw && sessions.length) {
      const totalMin = sessions.reduce((sum, s) => sum + Number(s.minutes || 0), 0);
      const totalPages = sessions.reduce((sum, s) => sum + Math.max(0, Number(s.endPage || 0) - Number(s.startPage || 0)), 0);
      els.sessionStats.textContent = `${sessions.length} 次记录 · 共 ${totalMin} 分钟 · 约 ${totalPages} 页`;
      els.sessionStats.classList.remove("is-hidden");
    } else {
      els.sessionStats.classList.add("is-hidden");
    }
  }

  if (!sessions.length) {
    els.timeline.className = "timeline empty-state";
    els.timeline.textContent = searchRaw ? "没有匹配的阅读记录。" : "还没有阅读会话，点右上角加号记录一次。";
    return;
  }

  els.timeline.className = "timeline";
  els.timeline.innerHTML = sessions
    .map((session) => {
      const book = state.books.find((item) => item.id === session.bookId);
      return `
        <article class="session-grid-card" data-session-id="${escapeHtml(session.id)}">
          <div class="entry-card-cover">
            <div class="entry-cover-fallback"></div>
          </div>
          <div class="entry-card-body">
            <h3>${book ? formatBookTitle(book.title) : "未知书籍"}</h3>
            <p class="entry-card-meta">📖 ${session.startPage}–${session.endPage} 页</p>
            <p class="entry-card-meta">⏱ ${session.minutes} 分钟 · ${formatDate(session.date)}</p>
            <p class="entry-card-note">${escapeHtml(session.note || "无笔记")}</p>
            <div class="entry-card-actions">
              <button class="card-action-btn" data-edit-session="${escapeHtml(session.id)}" type="button">编辑</button>
              <button class="card-action-btn card-action-danger" data-delete-session="${escapeHtml(session.id)}" type="button">删除</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderQuotes() {
  if (!currentUser?.id) {
    els.quotesList.className = "quote-list empty-state";
    els.quotesList.textContent = "登录后，这里会显示你的摘抄卡片墙。";
    return;
  }

  const filter = els.quoteTypeChips?.querySelector('.filter-chip.active')?.dataset.quoteType || 'all';
  const searchRaw = (els.quoteSearch?.value || "").trim().toLowerCase();
  const quotes = [...state.quotes]
    .filter((item) => filter === "all" || item.kind === filter)
    .filter((item) => {
      if (!searchRaw) return true;
      const book = state.books.find((b) => b.id === item.bookId);
      const haystack = [
        book?.title || "",
        book?.author || "",
        item.content || "",
        (item.tags || []).join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(searchRaw);
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  if (!quotes.length) {
    els.quotesList.className = "quote-list empty-state";
    els.quotesList.textContent = "还没有摘抄卡片，点右上角加号新增一张。";
    return;
  }

  els.quotesList.className = "quote-list";
  els.quotesList.innerHTML = quotes
    .map((quote) => {
      const book = state.books.find((item) => item.id === quote.bookId);
      return `
        <article class="quote-grid-card" data-quote-id="${escapeHtml(quote.id)}">
          <div class="entry-card-cover ${quote.imageUrl ? "has-image" : ""}">
            ${
              quote.imageUrl
                ? `<img src="${resolveImageUrl(quote.imageUrl)}" alt="摘抄照片" />`
                : `<div class="entry-cover-fallback"></div>`
            }
            <span class="entry-type-chip">${escapeHtml(quoteKindMap[quote.kind] || "卡片")}</span>
          </div>
          <div class="entry-card-body">
            <h3>${book ? formatBookTitle(book.title) : "未知书籍"}</h3>
            <p class="entry-card-meta">第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}</p>
            <p class="entry-card-note entry-card-note-clamp">${escapeHtml(quote.content)}</p>
            <p class="entry-card-tags">${quote.tags?.length ? escapeHtml(quote.tags.join(" / ")) : "无标签"}</p>
            <div class="entry-card-actions">
              <button class="card-action-btn" data-edit-quote="${escapeHtml(quote.id)}" type="button">编辑</button>
              <button class="card-action-btn card-action-danger" data-delete-quote="${escapeHtml(quote.id)}" type="button">删除</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderModelLogs() {
  if (!currentUser?.id) {
    els.logsList.className = "logs-list empty-state";
    els.logsList.textContent = "登录后可以在这里查看模型调用日志。";
    return;
  }

  if (!remoteLogs.length) {
    els.logsList.className = "logs-list empty-state";
    els.logsList.textContent = "服务器上还没有当前账号的模型调用日志。";
    return;
  }

  els.logsList.className = "logs-list";
  els.logsList.innerHTML = remoteLogs
    .map((log) => {
      const actions = Array.isArray(log.actions) ? log.actions : [];
      const actionsHtml = actions.length
        ? `
            <p><b>Actions</b></p>
            <pre>${escapeHtml(
              actions
                .map((action) => `${action.type} [${action.status}]\n${JSON.stringify(action.data || {}, null, 2)}`)
                .join("\n\n")
            )}</pre>
          `
        : '<p><b>Actions</b></p><pre>无</pre>';
      const traceMeta = [
        log.traceId ? `trace=${log.traceId}` : "",
        Number.isFinite(log.latencyMs) ? `latency=${log.latencyMs}ms` : "",
        log.parseStatus ? `parse=${log.parseStatus}` : "",
        log.validationStatus ? `validate=${log.validationStatus}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `
        <details class="log-card">
          <summary>
            <div>
              <strong>${escapeHtml(log.type)} · ${escapeHtml(log.model || "unknown")}</strong>
              <span>${formatDate(log.createdAt)}</span>
            </div>
            <span class="${log.error ? "log-state-error" : "log-state-ok"}">${log.error ? "失败" : "成功"}</span>
          </summary>
          <div class="log-body">
            ${traceMeta ? `<p><b>Trace</b> ${escapeHtml(traceMeta)}</p>` : ""}
            <p><b>Prompt</b></p>
            <pre>${escapeHtml(log.prompt || "无")}</pre>
            <p><b>输入</b></p>
            <pre>${escapeHtml(log.input || "无")}</pre>
            <p><b>输出</b></p>
            <pre>${escapeHtml(log.output || "无")}</pre>
            ${actionsHtml}
            ${log.traceErrorMessage ? `<p><b>Trace Error</b></p><pre>${escapeHtml(log.traceErrorMessage)}</pre>` : ""}
            ${log.error ? `<p><b>错误</b></p><pre>${escapeHtml(log.error)}</pre>` : ""}
          </div>
        </details>
      `
    })
    .join("");
}

function renderOcrStatus() {
  els.ocrStatus.textContent = currentUser?.id
    ? "图片、OCR 和日志都将走后端代理。"
    : "请先登录后再使用 OCR。";
}

function renderImagePreview() {
  const src = pendingQuoteImage?.objectUrl || pendingQuoteImage?.dataUrl;
  if (!src) {
    els.quoteImagePreview.classList.add("is-hidden");
    els.quotePreviewImg.removeAttribute("src");
    return;
  }
  els.quotePreviewImg.onload = () =>
    els.quoteImagePreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.quotePreviewImg.src = src;
  els.quoteImagePreview.classList.remove("is-hidden");
}

function renderBookImagePreview() {
  const src = pendingBookImage?.objectUrl || pendingBookImage?.dataUrl;
  if (!src) {
    els.bookImagePreview?.classList.add("is-hidden");
    els.bookPreviewImg?.removeAttribute("src");
    return;
  }
  els.bookPreviewImg.onload = () =>
    els.bookImagePreview?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.bookPreviewImg.src = src;
  els.bookImagePreview.classList.remove("is-hidden");
}

function render() {
  renderHero();
  renderSummary();
  renderAuthPanels();
  if (searchQuery) {
    globalSearch(searchQuery);
  } else {
    renderBooks();
  }
  renderTimeline();
  renderQuotes();
  renderModelLogs();
  renderConnections();
  renderBookSelect(els.sessionBookSelect);
  renderBookSelect(els.quoteBookSelect);
  renderOcrStatus();
  renderImagePreview();
  renderBookImagePreview();
}

function closeDialog(dialog) {
  dialog?.close();
}

function openDialog(dialog, actionText) {
  if (!requireAuth(actionText)) return;
  dialog?.showModal();
}

function activateTab(tabName) {
  els.mobileTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  document.querySelectorAll(".layout [data-tab-section]").forEach((section) => {
    section.classList.toggle("tab-active", section.dataset.tabSection === tabName);
  });
  if (tabName === "chat" && typeof window.populateChatBookSelect === "function") {
    window.populateChatBookSelect();
    // Scroll to latest message after panel becomes visible
    requestAnimationFrame(() => {
      const msgs = document.querySelector("#chatMessages");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    });
  }
}

async function loginSuccess(payload) {
  setAuthToken(payload.token);
  currentUser = payload.user || null;
  state = payload.state || structuredClone(initialState);
  await loadRemoteLogs();
  render();
  dispatchUserChange();
}

async function handleRegister(formData) {
  const username = String(formData.get("username")).trim();
  const password = String(formData.get("password")).trim();
  if (username.length < 2) {
    showToast("用户名至少 2 位");
    return;
  }
  if (password.length < 4) {
    showToast("密码至少 4 位");
    return;
  }
  try {
    const payload = await apiFetch(
      "/api/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
      false
    );
    els.registerForm.reset();
    await loginSuccess(payload);
    showToast("注册成功，已自动登录");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogin(formData) {
  const username = String(formData.get("username")).trim();
  const password = String(formData.get("password")).trim();
  try {
    const payload = await apiFetch(
      "/api/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
      false
    );
    els.loginForm.reset();
    await loginSuccess(payload);
    showToast("登录成功");
  } catch (error) {
    showToast(error.message);
  }
}

async function logout() {
  try {
    if (authToken) {
      await apiFetch("/api/logout", { method: "POST" }, true);
    }
  } catch {}
  setAuthToken("");
  currentUser = null;
  state = structuredClone(initialState);
  remoteLogs = [];
  render();
  dispatchUserChange();
  activateTab("me");
}

async function uploadImageIfNeeded() {
  if (!pendingQuoteImage || !pendingQuoteImage.dataUrl) return "";
  const payload = await apiFetch(
    "/api/upload-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl: pendingQuoteImage.dataUrl,
        filename: pendingQuoteImage.name,
      }),
    },
    true
  );
  return payload.url || "";
}

async function uploadBookImageIfNeeded() {
  if (!pendingBookImage || !pendingBookImage.dataUrl) return "";
  const payload = await apiFetch(
    "/api/upload-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl: pendingBookImage.dataUrl,
        filename: pendingBookImage.name,
      }),
    },
    true
  );
  return payload.url || "";
}

function resetQuoteDraft() {
  if (pendingQuoteImage?.objectUrl) URL.revokeObjectURL(pendingQuoteImage.objectUrl);
  pendingQuoteImage = null;
  els.quoteForm.reset();
  document.querySelector("#quoteBookCombobox")?._comboboxReset?.();
  renderImagePreview();
}

function resetBookDraft() {
  if (pendingBookImage?.objectUrl) URL.revokeObjectURL(pendingBookImage.objectUrl);
  pendingBookImage = null;
  els.bookForm.reset();
  renderBookImagePreview();
  if (els.bookImageStatus) {
    els.bookImageStatus.textContent = "可选。上传后将作为书籍封面显示。";
  }
}

async function addBook(formData) {
  if (!requireAuth("新增书籍")) return;

  const totalPages = Number(formData.get("totalPages")) || 0;
  const currentPage = Number(formData.get("currentPage")) || 0;
  if (totalPages && currentPage > totalPages) {
    showToast("当前页码不能大于总页数");
    return;
  }

  try {
    const coverImageUrl = await uploadBookImageIfNeeded();
    state.books.unshift({
      id: createId("book"),
      title: normalizeBookTitle(formData.get("title")),
      author: String(formData.get("author")).trim(),
      totalPages,
      currentPage,
      status: String(formData.get("status")),
      tags: normalizeTags(formData.get("tags")),
      notes: String(formData.get("notes")).trim(),
      coverImageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      lastReadAt: null,
    });
    await syncState();
    closeDialog(els.bookDialog);
    resetBookDraft();
    render();
    showToast("书籍已保存");
  } catch (error) {
    showToast(error.message);
  }
}

async function addSession(formData) {
  if (!requireAuth("记录阅读")) return;

  const existingId = String(formData.get("id") || "").trim();
  const bookId = String(formData.get("bookId"));
  const startPage = Number(formData.get("startPage"));
  const endPage = Number(formData.get("endPage"));
  const minutes = Number(formData.get("minutes"));
  const dateValue = String(formData.get("date"));
  const date = dateValue ? new Date(`${dateValue}T12:00:00`).toISOString() : new Date().toISOString();
  const book = state.books.find((item) => item.id === bookId);

  if (!book) {
    showToast("先选择一本书");
    return;
  }
  if (endPage < startPage) {
    showToast("结束页不能小于开始页");
    return;
  }
  if (minutes <= 0) {
    showToast("阅读分钟必须大于 0");
    return;
  }
  if (book.totalPages && endPage > book.totalPages) {
    showToast("结束页不能超过总页数");
    return;
  }

  const note = String(formData.get("note")).trim();

  if (existingId) {
    const idx = state.sessions.findIndex((s) => s.id === existingId);
    if (idx < 0) { showToast("找不到该记录"); return; }
    state.sessions[idx] = {
      ...state.sessions[idx],
      bookId, startPage, endPage,
      pagesRead: endPage - startPage,
      minutes, note, date,
    };
  } else {
    state.sessions.unshift({
      id: createId("session"),
      bookId, startPage, endPage,
      pagesRead: endPage - startPage,
      minutes, note, date,
      createdAt: new Date().toISOString(),
    });
    book.currentPage = Math.max(book.currentPage || 0, endPage);
    book.lastReadAt = date;
    book.updatedAt = new Date().toISOString();
    if (!book.startedAt) book.startedAt = date;
    if (book.totalPages && endPage >= book.totalPages) {
      book.status = "finished";
      if (!book.finishedAt) book.finishedAt = date;
    } else if (book.status !== "finished") {
      book.status = "reading";
    }
  }

  try {
    await syncState();
    closeDialog(els.sessionDialog);
    els.sessionForm.reset();
    render();
    activateTab("session");
    showToast(existingId ? "阅读记录已更新" : "阅读会话已记录");
  } catch (error) {
    showToast(error.message);
  }
}

function deleteBook(bookId) {
  if (!requireAuth("删除书籍")) return;
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;

  // Show custom confirmation dialog instead of native window.confirm
  els.deleteBookMessage.textContent = book.title;
  els.deleteBookDialog.showModal();

  // Use one-shot listeners to avoid stacking up handlers
  const onConfirm = async () => {
    cleanup();
    els.deleteBookDialog.close();

    const deletedQuoteIds = new Set(state.quotes.filter((q) => q.bookId === bookId).map((q) => q.id));
    state.books = state.books.filter((item) => item.id !== bookId);
    state.sessions = state.sessions.filter((item) => item.bookId !== bookId);
    state.quotes = state.quotes.filter((item) => item.bookId !== bookId);
    if (state.chatHistories && typeof state.chatHistories === "object") {
      delete state.chatHistories[bookId];
    }
    state.connections = (state.connections || []).filter((c) =>
      c.sourceId !== bookId && c.targetId !== bookId &&
      !deletedQuoteIds.has(c.sourceId) && !deletedQuoteIds.has(c.targetId)
    );
    try {
      await syncState();
      render();
      showToast("书籍已删除");
    } catch (error) {
      showToast(error.message);
    }
  };

  const onCancel = () => {
    cleanup();
    els.deleteBookDialog.close();
  };

  function cleanup() {
    els.deleteBookConfirmBtn.removeEventListener("click", onConfirm);
    els.deleteBookCancelBtn.removeEventListener("click", onCancel);
  }

  els.deleteBookConfirmBtn.addEventListener("click", onConfirm, { once: true });
  els.deleteBookCancelBtn.addEventListener("click", onCancel, { once: true });
}

function editSession(sessionId) {
  if (!requireAuth("编辑记录")) return;
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  document.getElementById("sessionId").value = session.id;
  els.sessionForm.querySelector('[name="bookId"]').value = session.bookId;
  document.querySelector("#sessionBookCombobox")?._comboboxSetValue?.(session.bookId);
  els.sessionForm.querySelector('[name="startPage"]').value = session.startPage;
  els.sessionForm.querySelector('[name="endPage"]').value = session.endPage;
  els.sessionForm.querySelector('[name="minutes"]').value = session.minutes;
  els.sessionForm.querySelector('[name="note"]').value = session.note || "";
  const dateStr = session.date ? new Date(session.date).toISOString().split("T")[0] : "";
  els.sessionForm.querySelector('[name="date"]').value = dateStr;
  els.sessionDialog.showModal();
}

function openQuoteDetail(quoteId) {
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  const book = state.books.find((b) => b.id === quote.bookId);

  document.getElementById("quoteDetailBook").textContent =
    book ? `${formatBookTitle(book.title)} · ${book.author || ""}`.trim().replace(/·\s*$/, "") : "未知书籍";
  document.getElementById("quoteDetailMeta").textContent =
    `${quoteKindMap[quote.kind] || "摘抄"} · 第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}`;

  const imgWrap = document.getElementById("quoteDetailImage");
  const img = document.getElementById("quoteDetailImg");
  if (quote.imageUrl) {
    img.src = resolveImageUrl(quote.imageUrl);
    imgWrap.classList.remove("is-hidden");
  } else {
    imgWrap.classList.add("is-hidden");
    img.removeAttribute("src");
  }

  document.getElementById("quoteDetailContent").textContent = quote.content || "";

  const reflEl = document.getElementById("quoteDetailReflection");
  if (quote.reflection) {
    reflEl.textContent = quote.reflection;
    reflEl.classList.remove("is-hidden");
  } else {
    reflEl.classList.add("is-hidden");
  }

  const tagsEl = document.getElementById("quoteDetailTags");
  tagsEl.textContent = quote.tags?.length ? quote.tags.join(" / ") : "";

  document.getElementById("quoteDetailEditBtn").onclick = () => {
    document.getElementById("quoteDetailDialog").close();
    editQuote(quoteId);
  };

  const quoteDetailDlg = document.getElementById("quoteDetailDialog");
  quoteDetailDlg.dataset.openQuoteId = quoteId;

  const connsForQuote = (state.connections || []).filter((c) => c.sourceId === quoteId || c.targetId === quoteId);
  const connWrap = document.getElementById("quoteDetailConnectionsWrap");
  const connList = document.getElementById("quoteDetailConnections");
  if (connsForQuote.length && connWrap && connList) {
    connList.innerHTML = connsForQuote.map((c) => {
      const otherId = c.sourceId === quoteId ? c.targetId : c.sourceId;
      const otherType = c.sourceId === quoteId ? c.targetType : c.sourceType;
      const other = resolveConnectionSide(otherType, otherId);
      return `<div class="conn-mini-card">
        <span class="conn-mini-kind" data-kind="${escapeHtml(c.kind)}">${escapeHtml(c.kind)}</span>
        <div class="conn-mini-text">↔ ${escapeHtml(other.label)}</div>
        ${other.sub ? `<div class="connection-side-sub">${escapeHtml(other.sub)}</div>` : ""}
      </div>`;
    }).join("");
    connWrap.classList.remove("is-hidden");
  } else if (connWrap) {
    connWrap.classList.add("is-hidden");
  }

  quoteDetailDlg.showModal();
}

function editQuote(quoteId) {
  if (!requireAuth("编辑摘抄")) return;
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  document.getElementById("quoteId").value = quote.id;
  els.quoteForm.querySelector('[name="bookId"]').value = quote.bookId;
  document.querySelector("#quoteBookCombobox")?._comboboxSetValue?.(quote.bookId);
  els.quoteForm.querySelector('[name="page"]').value = quote.page || "";
  els.quoteForm.querySelector('[name="kind"]').value = quote.kind || "quote";
  els.quoteForm.querySelector('[name="tags"]').value = (quote.tags || []).join(", ");
  document.getElementById("quoteContent").value = quote.content || "";
  els.quoteForm.querySelector('[name="reflection"]').value = quote.reflection || "";
  els.quoteDialog.showModal();
}

function showConfirmDialog({ message, confirmLabel = "确认删除", onConfirm }) {
  els.confirmDialogMessage.textContent = message;
  els.confirmDialogConfirmBtn.textContent = confirmLabel;
  els.confirmDialog.showModal();
  els.confirmDialogConfirmBtn.addEventListener("click", () => {
    els.confirmDialog.close();
    onConfirm();
  }, { once: true });
  els.confirmDialogCancelBtn.addEventListener("click", () => {
    els.confirmDialog.close();
  }, { once: true });
}

async function deleteSession(sessionId) {
  if (!requireAuth("删除阅读记录")) return;
  showConfirmDialog({
    message: "确定删除这条阅读记录吗？",
    onConfirm: async () => {
      state.sessions = state.sessions.filter((item) => item.id !== sessionId);
      try {
        await syncState();
        renderTimeline();
        showToast("阅读记录已删除");
      } catch (error) {
        showToast(error.message);
      }
    },
  });
}

async function deleteQuote(quoteId) {
  if (!requireAuth("删除摘抄")) return;
  showConfirmDialog({
    message: "确定删除这张摘抄卡片吗？",
    onConfirm: async () => {
      state.quotes = state.quotes.filter((item) => item.id !== quoteId);
      state.connections = (state.connections || []).filter((c) => c.sourceId !== quoteId && c.targetId !== quoteId);
      try {
        await syncState();
        renderQuotes();
        showToast("摘抄已删除");
      } catch (error) {
        showToast(error.message);
      }
    },
  });
}

function renderBookEditImagePreview() {
  const src = pendingBookEditImage?.objectUrl || pendingBookEditImage?.dataUrl;
  if (!src) {
    els.bookEditImagePreview?.classList.add("is-hidden");
    els.bookEditPreviewImg?.removeAttribute("src");
    return;
  }
  els.bookEditPreviewImg.onload = () =>
    els.bookEditImagePreview?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.bookEditPreviewImg.src = src;
  els.bookEditImagePreview.classList.remove("is-hidden");
}

function resetBookEditDraft() {
  pendingBookEditImage = null;
  renderBookEditImagePreview();
  if (els.bookEditImageStatus) {
    els.bookEditImageStatus.textContent = "可选。不上传则保持原封面。";
  }
}

function openBookEditDialog(bookId) {
  if (!requireAuth("编辑书籍")) return;
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;
  resetBookEditDraft();
  els.bookEditForm.elements.bookId.value = book.id;
  els.bookEditForm.elements.currentPage.value = book.currentPage || 0;
  els.bookEditForm.elements.status.value = book.status || "wishlist";
  els.bookEditForm.elements.notes.value = book.notes || "";
  els.bookEditDialogTitle.textContent = `${book.title}${book.author ? ` · ${book.author}` : ""}`;
  if (book.coverImageUrl) {
    pendingBookEditImage = { name: "existing-cover", dataUrl: book.coverImageUrl };
    renderBookEditImagePreview();
    pendingBookEditImage = null;
  }
  els.bookEditDialog.showModal();
}

async function saveBookEdit(formData) {
  if (!requireAuth("编辑书籍")) return;
  const book = state.books.find((item) => item.id === String(formData.get("bookId")));
  if (!book) return;

  const currentPage = Number(formData.get("currentPage")) || 0;
  if (book.totalPages && currentPage > book.totalPages) {
    showToast("当前页码不能超过总页数");
    return;
  }

  // Update in-memory state immediately
  book.currentPage = currentPage;
  book.status = String(formData.get("status"));
  book.notes = String(formData.get("notes")).trim();
  book.tags = Array.isArray(book.tags) ? book.tags : [];
  book.updatedAt = new Date().toISOString();
  if (book.status === "reading" || book.status === "finished") {
    book.lastReadAt = new Date().toISOString();
    if (!book.startedAt) {
      book.startedAt = book.lastReadAt;
    }
  }
  if (book.totalPages && currentPage >= book.totalPages) {
    book.status = "finished";
    if (!book.finishedAt) {
      book.finishedAt = new Date().toISOString();
    }
  }

  // Capture pending image then close dialog right away
  const pendingImage = pendingBookEditImage;
  closeDialog(els.bookEditDialog);
  resetBookEditDraft();
  render();
  showToast("保存中…");

  // Upload image + sync in background
  try {
    if (pendingImage && !pendingImage.fromExisting && pendingImage.dataUrl) {
      const payload = await apiFetch(
        "/api/upload-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: pendingImage.dataUrl, filename: pendingImage.name }),
        },
        true
      );
      book.coverImageUrl = payload.url || book.coverImageUrl || "";
      render();
    }
    await syncState();
    showToast("书籍已更新");
  } catch (error) {
    showToast(error.message || "保存失败");
  }
}

function openBookDetailDialog(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;
  const bookQuotes = [...state.quotes]
    .filter((item) => item.bookId === bookId)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  els.bookDetailTitle.textContent = book.title || "书籍详情";
  els.bookDetailMeta.textContent = `${book.author || "作者未填写"} · ${statusMap[book.status] || book.status || "未标记"}`;
  els.bookDetailIntro.textContent = (book.notes || "").trim() || "暂无内容简介。";

  if (!bookQuotes.length) {
    els.bookDetailQuotes.className = "book-detail-quotes empty-state";
    els.bookDetailQuotes.textContent = "暂无摘抄。";
  } else {
    els.bookDetailQuotes.className = "book-detail-quotes";
    els.bookDetailQuotes.innerHTML = bookQuotes
      .map(
        (item) => `
          <article class="book-detail-quote">
            <div class="book-detail-quote-meta">第 ${item.page || "-"} 页 · ${formatDate(item.createdAt)}</div>
            <div class="book-detail-quote-content">${escapeHtml(item.content || "")}</div>
            ${item.reflection ? `<div class="book-detail-quote-reflection">我的理解：${escapeHtml(item.reflection)}</div>` : ""}
          </article>
        `
      )
      .join("");
  }
  const bookConns = (state.connections || []).filter((c) =>
    c.sourceId === bookId || c.targetId === bookId ||
    (c.sourceType === "quote" && state.quotes.find((q) => q.id === c.sourceId)?.bookId === bookId) ||
    (c.targetType === "quote" && state.quotes.find((q) => q.id === c.targetId)?.bookId === bookId)
  );
  const connWrap = document.getElementById("bookDetailConnectionsWrap");
  const connList = document.getElementById("bookDetailConnections");
  if (bookConns.length && connWrap && connList) {
    connList.innerHTML = bookConns.map((c) => {
      const srcSide = resolveConnectionSide(c.sourceType, c.sourceId);
      const tgtSide = resolveConnectionSide(c.targetType, c.targetId);
      return `<div class="conn-mini-card">
        <span class="conn-mini-kind" data-kind="${escapeHtml(c.kind)}">${escapeHtml(c.kind)}</span>
        <div class="conn-mini-text">${escapeHtml(srcSide.label)} ↔ ${escapeHtml(tgtSide.label)}</div>
        ${c.thought ? `<div class="connection-side-sub">${escapeHtml(c.thought.slice(0, 60))}${c.thought.length > 60 ? "…" : ""}</div>` : ""}
      </div>`;
    }).join("");
    connWrap.classList.remove("is-hidden");
  } else if (connWrap) {
    connWrap.classList.add("is-hidden");
  }

  els.bookDetailDialog.showModal();
}

async function changeBookCover(bookId) {
  if (!requireAuth("更换封面")) return;
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";

  picker.addEventListener("change", async () => {
    const [file] = picker.files || [];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const payload = await apiFetch(
        "/api/upload-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, filename: file.name }),
        },
        true
      );
      const coverImageUrl = payload.url || "";
      if (!coverImageUrl) {
        showToast("封面上传失败，请重试");
        return;
      }
      book.coverImageUrl = coverImageUrl;
      book.updatedAt = new Date().toISOString();
      await syncState();
      render();
      showToast("封面已更新");
    } catch (error) {
      showToast(error.message || "封面更新失败");
    }
  });

  picker.click();
}

async function addQuote(formData) {
  if (!requireAuth("保存摘抄")) return;

  const existingId = String(formData.get("id") || "").trim();
  const bookId = String(formData.get("bookId"));
  const content = String(formData.get("content")).trim();
  if (!bookId) { showToast("先选择一本书"); return; }
  if (!content) { showToast("卡片内容不能为空"); return; }

  try {
    const uploadedUrl = await uploadImageIfNeeded();

    if (existingId) {
      const idx = state.quotes.findIndex((q) => q.id === existingId);
      if (idx < 0) { showToast("找不到该摘抄"); return; }
      state.quotes[idx] = {
        ...state.quotes[idx],
        bookId,
        page: Number(formData.get("page")) || 0,
        kind: String(formData.get("kind")),
        content,
        reflection: String(formData.get("reflection")).trim(),
        tags: normalizeTags(formData.get("tags")),
        // keep existing image unless user uploaded a new one
        imageUrl: uploadedUrl || state.quotes[idx].imageUrl,
      };
    } else {
      state.quotes.unshift({
        id: createId("quote"),
        bookId,
        page: Number(formData.get("page")) || 0,
        kind: String(formData.get("kind")),
        content,
        reflection: String(formData.get("reflection")).trim(),
        tags: normalizeTags(formData.get("tags")),
        imageUrl: uploadedUrl,
        ocrSource: pendingQuoteImage?.ocrSource || "",
        createdAt: new Date().toISOString(),
      });
    }

    await syncState();
    closeDialog(els.quoteDialog);
    resetQuoteDraft();
    render();
    activateTab("quote");
    showToast(existingId ? "摘抄已更新" : "摘抄卡片已保存");
  } catch (error) {
    showToast(error.message);
  }
}

function exportData() {
  if (!requireAuth("导出数据")) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `paper-reading-backup-${currentUser.username}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  if (!requireAuth("导入数据")) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      state = {
        books: Array.isArray(parsed.books) ? parsed.books : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
        chatHistories:
          typeof parsed.chatHistories === "object" && parsed.chatHistories
            ? parsed.chatHistories
            : Array.isArray(parsed.chatHistory)
              ? { "__general__": parsed.chatHistory }
              : {},
        connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      };
      await syncState();
      render();
      showToast("数据已导入");
    } catch (error) {
      showToast(error.message || "导入失败");
    }
  };
  reader.readAsText(file);
}

async function importExcel(file) {
  if (!requireAuth("导入 Excel")) return;
  if (!window.XLSX) {
    showToast("Excel 解析库未加载，请刷新后重试");
    return;
  }
  try {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      showToast("Excel 里没有可读取的工作表");
      return;
    }
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "" });
    if (!rows.length) {
      showToast("Excel 没有数据行");
      return;
    }

    const existingTitles = new Set(state.books.map((book) => `${book.title}::${book.author || ""}`.toLowerCase()));
    let imported = 0;

    for (const row of rows) {
      const title = String(getRowField(row, ["书名", "图书名称", "title", "Title"])).trim();
      if (!title) continue;
      const author = String(getRowField(row, ["作者", "author", "Author"])).trim();
      const signature = `${title}::${author}`.toLowerCase();
      if (existingTitles.has(signature)) continue;

      const startedAt = parseExcelDateToIso(getRowField(row, ["开始阅读时间", "开始时间", "startedAt", "startDate"]));
      const finishedAt = parseExcelDateToIso(getRowField(row, ["阅读完时间", "完成时间", "finishedAt", "endDate"]));
      const status = normalizeBookStatus(getRowField(row, ["状态", "status", "Status"]), startedAt, finishedAt);

      const notesParts = [];
      const intro = String(getRowField(row, ["内容简介", "简介", "notes", "备注"])).trim();
      const translator = String(getRowField(row, ["译者", "translator"])).trim();
      const rating = String(getRowField(row, ["喜欢程度", "评分", "rating"])).trim();
      if (translator) notesParts.push(`译者：${translator}`);
      if (intro) notesParts.push(`简介：${intro}`);
      if (rating) notesParts.push(`喜欢程度：${rating}`);

      const now = new Date().toISOString();
      state.books.unshift({
        id: createId("book"),
        title,
        author,
        totalPages: Number(getRowField(row, ["总页数", "页数", "totalPages"])) || 0,
        currentPage: 0,
        status,
        tags: normalizeTags(getRowField(row, ["类别", "标签", "tags"])),
        notes: notesParts.join("\n"),
        coverImageUrl: "",
        createdAt: now,
        updatedAt: now,
        startedAt,
        finishedAt,
        lastReadAt: startedAt,
      });
      existingTitles.add(signature);
      imported += 1;
    }

    if (!imported) {
      showToast("未导入新书（可能都已存在或表格缺少书名列）");
      return;
    }
    await syncState();
    render();
    showToast(`Excel 导入成功：新增 ${imported} 本`);
  } catch (error) {
    showToast(`Excel 导入失败：${error.message || "未知错误"}`);
  }
}

async function clearLogs() {
  if (!requireAuth("清空日志")) return;
  try {
    await apiFetch("/api/model-logs", { method: "DELETE" }, true);
    remoteLogs = [];
    renderModelLogs();
    showToast("模型日志已清空");
  } catch (error) {
    showToast(error.message);
  }
}

async function resizeImageToDataUrl(file, maxPx = 1200, quality = 0.85) {
  // Step 1: FileReader gives us a data URL the browser can always decode (works on iOS Safari)
  const rawDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
  // Step 2: Load into offscreen Image to get dimensions (memory decode, not DOM display)
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Image decode failed"));
    el.src = rawDataUrl;
  });
  // Step 3: Draw at reduced size on canvas and export as small JPEG (~100-300 KB)
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || maxPx, img.naturalHeight || maxPx));
  const w = Math.max(1, Math.round((img.naturalWidth || maxPx) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || maxPx) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

async function handleQuoteImageChange(file) {
  if (pendingQuoteImage?.objectUrl) URL.revokeObjectURL(pendingQuoteImage.objectUrl);
  if (!file) {
    pendingQuoteImage = null;
    renderImagePreview();
    return;
  }
  // Show preview immediately via objectUrl (blob URLs render reliably on iOS Safari)
  const objectUrl = URL.createObjectURL(file);
  pendingQuoteImage = { name: file.name, objectUrl, dataUrl: null, ocrSource: "" };
  renderImagePreview();
  showToast("图片已载入，可以直接保存，也可以先做 OCR");
  // Compress in background — needed for OCR/upload
  resizeImageToDataUrl(file).then((dataUrl) => {
    if (pendingQuoteImage) pendingQuoteImage.dataUrl = dataUrl;
  }).catch(() => {});
}

async function runOcrFromImage() {
  if (!requireAuth("执行 OCR")) return;
  if (!pendingQuoteImage) {
    showToast("先拍照或选择一张图片");
    return;
  }
  if (!pendingQuoteImage.dataUrl) {
    showToast("图片还在处理中，请稍候…");
    return;
  }

  els.ocrButton.disabled = true;
  els.ocrStatus.textContent = "正在通过后端识别图片文字…";
  try {
    const data = await apiFetch(
      "/api/ocr",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: pendingQuoteImage.dataUrl }),
      },
      true
    );
    const text = String(data.text || "").trim();
    if (!text || text === "未发现划线文字") {
      els.ocrStatus.textContent = "未发现划线内容，建议重拍或手动输入。";
      showToast("未发现划线文字");
      return;
    }
    els.quoteContent.value = els.quoteContent.value.trim()
      ? `${els.quoteContent.value.trim()}\n\n${text}`
      : text;
    pendingQuoteImage.ocrSource = "后端 OCR";
    await loadRemoteLogs();
    els.ocrStatus.textContent = "识别完成，结果已填入内容框。";
    showToast("OCR 识别完成");
  } catch (error) {
    els.ocrStatus.textContent = `识别失败：${error.message}`;
    showToast(error.message);
    await loadRemoteLogs();
  } finally {
    els.ocrButton.disabled = false;
  }
}

async function clearChatHistory() {
  try {
    const activeBookId = window.paperReadingApp?.getActiveChatBookId?.() || "";
    await apiFetch(
      "/api/chat-history",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: activeBookId }),
      },
      true
    );
    state.chatHistories[activeBookId || "__general__"] = [];
  } catch (error) {
    showToast(error.message);
  }
}

function initBookCombobox(wrapperEl, hiddenInput, includeWishlist = false) {
  if (!wrapperEl || !hiddenInput) return;
  const textInput = wrapperEl.querySelector(".book-combobox-input");
  const list = wrapperEl.querySelector(".book-combobox-list");
  if (!textInput || !list) return;

  let allBooks = [];
  let isOpen = false;

  function bookLabel(b) {
    return b.title + (b.author ? ` · ${b.author}` : "");
  }

  function filteredBooks(q) {
    const src = includeWishlist ? allBooks : allBooks.filter((b) => b.status !== "wishlist");
    if (!q) {
      return [...src.filter((b) => b.status === "reading"), ...src.filter((b) => b.status !== "reading")];
    }
    const lower = q.toLowerCase();
    return src.filter(
      (b) => (b.title || "").toLowerCase().includes(lower) || (b.author || "").toLowerCase().includes(lower)
    );
  }

  function positionList() {
    const rect = textInput.getBoundingClientRect();
    list.style.top = `${rect.bottom + 2}px`;
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
  }

  function buildList(q = "") {
    const books = filteredBooks(q);
    list.innerHTML = "";
    if (!books.length) {
      const li = document.createElement("li");
      li.className = "book-combobox-empty";
      li.textContent = q ? "没有匹配的书籍" : "暂无书籍";
      list.appendChild(li);
      return;
    }
    books.forEach((book) => {
      const li = document.createElement("li");
      li.className = "book-combobox-item" + (book.id === hiddenInput.value ? " is-selected" : "");
      const nameEl = document.createElement("span");
      nameEl.textContent = bookLabel(book);
      li.appendChild(nameEl);
      if (book.status === "reading") {
        const badge = document.createElement("span");
        badge.className = "book-combobox-badge";
        badge.textContent = "阅读中";
        li.appendChild(badge);
      }
      function doPick(e) { e.preventDefault(); pick(book); }
      li.addEventListener("mousedown", doPick);
      li.addEventListener("touchstart", doPick, { passive: false });
      list.appendChild(li);
    });
  }

  function openList() {
    buildList(textInput.value);
    positionList();
    list.classList.add("is-open");
    isOpen = true;
  }

  function closeList() {
    list.classList.remove("is-open");
    isOpen = false;
  }

  function pick(book) {
    hiddenInput.value = book.id;
    textInput.value = bookLabel(book);
    closeList();
  }

  textInput.addEventListener("focus", openList);
  textInput.addEventListener("input", () => {
    hiddenInput.value = "";
    buildList(textInput.value);
    if (!isOpen) openList();
    else positionList();
  });
  textInput.addEventListener("blur", () => setTimeout(closeList, 200));

  wrapperEl.closest(".dialog-form")?.addEventListener("scroll", () => {
    if (isOpen) positionList();
  }, { passive: true });

  wrapperEl._comboboxUpdate = (books) => {
    allBooks = books;
    if (isOpen) buildList(textInput.value);
  };
  wrapperEl._comboboxReset = () => {
    textInput.value = "";
    hiddenInput.value = "";
    closeList();
  };
  wrapperEl._comboboxSetValue = (bookId) => {
    const book = allBooks.find((b) => b.id === bookId);
    hiddenInput.value = bookId || "";
    textInput.value = book ? bookLabel(book) : "";
  };
}

function initQuoteCombobox(wrapperEl, hiddenInput) {
  if (!wrapperEl || !hiddenInput) return;
  const textInput = wrapperEl.querySelector(".book-combobox-input");
  const list = wrapperEl.querySelector(".book-combobox-list");
  if (!textInput || !list) return;

  let allQuotes = [];
  let isOpen = false;

  function quoteLabel(q) {
    const book = state.books.find((b) => b.id === q.bookId);
    const bookName = book ? book.title : "未知书籍";
    const content = (q.content || "").slice(0, 32) + (q.content?.length > 32 ? "…" : "");
    return `${bookName} · ${content}`;
  }

  function filteredQuotes(q) {
    if (!q) return allQuotes.slice(0, 30);
    const lower = q.toLowerCase();
    return allQuotes.filter((item) => {
      const book = state.books.find((b) => b.id === item.bookId);
      return (item.content || "").toLowerCase().includes(lower) ||
        (book?.title || "").toLowerCase().includes(lower);
    }).slice(0, 30);
  }

  function positionList() {
    const rect = textInput.getBoundingClientRect();
    list.style.top = `${rect.bottom + 2}px`;
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
  }

  function buildList(q = "") {
    const quotes = filteredQuotes(q);
    list.innerHTML = "";
    if (!quotes.length) {
      const li = document.createElement("li");
      li.className = "book-combobox-empty";
      li.textContent = q ? "没有匹配的摘抄" : "暂无摘抄";
      list.appendChild(li);
      return;
    }
    quotes.forEach((quote) => {
      const li = document.createElement("li");
      li.className = "book-combobox-item" + (quote.id === hiddenInput.value ? " is-selected" : "");
      li.style.cssText = "overflow:hidden;white-space:nowrap;text-overflow:ellipsis;";
      li.textContent = quoteLabel(quote);
      function doPick(e) { e.preventDefault(); pick(quote); }
      li.addEventListener("mousedown", doPick);
      li.addEventListener("touchstart", doPick, { passive: false });
      list.appendChild(li);
    });
  }

  function openList() {
    buildList(textInput.value);
    positionList();
    list.classList.add("is-open");
    isOpen = true;
  }

  function closeList() {
    list.classList.remove("is-open");
    isOpen = false;
  }

  function pick(quote) {
    hiddenInput.value = quote.id;
    textInput.value = quoteLabel(quote);
    closeList();
  }

  textInput.addEventListener("focus", openList);
  textInput.addEventListener("input", () => {
    hiddenInput.value = "";
    buildList(textInput.value);
    if (!isOpen) openList();
    else positionList();
  });
  textInput.addEventListener("blur", () => setTimeout(closeList, 200));

  wrapperEl.closest(".dialog-form")?.addEventListener("scroll", () => {
    if (isOpen) positionList();
  }, { passive: true });

  wrapperEl._comboboxUpdate = (quotes) => {
    allQuotes = quotes;
    if (isOpen) buildList(textInput.value);
  };
  wrapperEl._comboboxReset = () => {
    textInput.value = "";
    hiddenInput.value = "";
    closeList();
  };
  wrapperEl._comboboxSetValue = (quoteId) => {
    const quote = allQuotes.find((q) => q.id === quoteId);
    hiddenInput.value = quoteId || "";
    textInput.value = quote ? quoteLabel(quote) : "";
  };
}

let connSourceBookComboWrap = null;
let connSourceQuoteComboWrap = null;
let connTargetBookComboWrap = null;
let connTargetQuoteComboWrap = null;

function openConnectionDialog({ sourceType, sourceId, targetType, targetId } = {}) {
  if (!requireAuth("记录思想碰撞")) return;
  document.getElementById("connectionId").value = "";
  document.getElementById("connSourceType").value = sourceType || "book";
  document.getElementById("connTargetType").value = targetType || "book";
  connSourceBookComboWrap?._comboboxReset?.();
  connSourceQuoteComboWrap?._comboboxReset?.();
  connTargetBookComboWrap?._comboboxReset?.();
  connTargetQuoteComboWrap?._comboboxReset?.();
  els.connectionForm.querySelector('[name="thought"]').value = "";
  els.connectionForm.querySelector('[name="tags"]').value = "";
  toggleConnComboboxes("source", sourceType || "book");
  toggleConnComboboxes("target", targetType || "book");
  if (sourceType === "book" && sourceId) {
    connSourceBookComboWrap?._comboboxSetValue?.(sourceId);
  } else if (sourceType === "quote" && sourceId) {
    connSourceQuoteComboWrap?._comboboxSetValue?.(sourceId);
  }
  if (targetType === "book" && targetId) {
    connTargetBookComboWrap?._comboboxSetValue?.(targetId);
  } else if (targetType === "quote" && targetId) {
    connTargetQuoteComboWrap?._comboboxSetValue?.(targetId);
  }
  els.connectionDialog.showModal();
}

function toggleConnComboboxes(side, type) {
  const bookWrap = document.getElementById(`conn${side.charAt(0).toUpperCase() + side.slice(1)}BookCombobox`);
  const quoteWrap = document.getElementById(`conn${side.charAt(0).toUpperCase() + side.slice(1)}QuoteCombobox`);
  if (!bookWrap || !quoteWrap) return;
  if (type === "quote") {
    bookWrap.classList.add("is-hidden");
    quoteWrap.classList.remove("is-hidden");
  } else {
    bookWrap.classList.remove("is-hidden");
    quoteWrap.classList.add("is-hidden");
  }
}

async function addConnection(formData) {
  if (!requireAuth("保存关联")) return;
  const sourceType = String(formData.get("sourceType") || "book");
  const targetType = String(formData.get("targetType") || "book");
  const sourceId = sourceType === "quote"
    ? String(formData.get("sourceQuoteId") || "").trim()
    : String(formData.get("sourceId") || "").trim();
  const targetId = targetType === "quote"
    ? String(formData.get("targetQuoteId") || "").trim()
    : String(formData.get("targetId") || "").trim();
  const kind = String(formData.get("kind") || "延伸");
  const thought = String(formData.get("thought") || "").trim();
  const tagsRaw = String(formData.get("tags") || "").trim();

  if (!sourceId) { showToast("请选择来源"); return; }
  if (!targetId) { showToast("请选择目标"); return; }
  if (sourceType === targetType && sourceId === targetId) { showToast("来源和目标不能相同"); return; }
  if (!thought) { showToast("请填写你的想法"); return; }

  const conn = {
    id: `conn-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`,
    sourceType,
    sourceId,
    targetType,
    targetId,
    kind,
    thought,
    tags: tagsRaw ? tagsRaw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean) : [],
    createdAt: new Date().toISOString(),
  };
  state.connections = [conn, ...(state.connections || [])];
  try {
    await syncState();
    closeDialog(els.connectionDialog);
    render();
    activateTab("connections");
    showToast("关联已保存");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteConnection(connId) {
  if (!requireAuth("删除关联")) return;
  showConfirmDialog({
    message: "确定删除这条关联记录吗？",
    onConfirm: async () => {
      state.connections = (state.connections || []).filter((c) => c.id !== connId);
      try {
        await syncState();
        renderConnections();
        showToast("关联已删除");
      } catch (error) {
        showToast(error.message);
      }
    },
  });
}

function bindEvents() {
  // Initialize book comboboxes for session and quote forms
  const sessionComboWrap = document.querySelector("#sessionBookCombobox");
  const quoteComboWrap = document.querySelector("#quoteBookCombobox");
  initBookCombobox(sessionComboWrap, els.sessionBookSelect, false);
  initBookCombobox(quoteComboWrap, els.quoteBookSelect, true);

  // Initialize connection dialog comboboxes
  connSourceBookComboWrap = document.querySelector("#connSourceBookCombobox");
  connSourceQuoteComboWrap = document.querySelector("#connSourceQuoteCombobox");
  connTargetBookComboWrap = document.querySelector("#connTargetBookCombobox");
  connTargetQuoteComboWrap = document.querySelector("#connTargetQuoteCombobox");
  initBookCombobox(connSourceBookComboWrap, document.getElementById("connSourceBookId"), true);
  initBookCombobox(connTargetBookComboWrap, document.getElementById("connTargetBookId"), true);
  initQuoteCombobox(connSourceQuoteComboWrap, document.getElementById("connSourceQuoteId"));
  initQuoteCombobox(connTargetQuoteComboWrap, document.getElementById("connTargetQuoteId"));

  els.openBookDialogBtn?.addEventListener("click", () => {
    resetBookDraft();
    openDialog(els.bookDialog, "新增书籍");
  });
  els.openSessionDialogBtn?.addEventListener("click", () => {
    if (!requireAuth("记录阅读")) return;
    document.getElementById("sessionId").value = "";
    sessionComboWrap?._comboboxReset?.();
    els.sessionDialog.showModal();
  });
  els.openQuoteDialogBtn?.addEventListener("click", () => {
    if (!requireAuth("新增摘抄")) return;
    document.getElementById("quoteId").value = "";
    quoteComboWrap?._comboboxReset?.();
    els.quoteDialog.showModal();
  });

  els.openConnectionDialogBtn?.addEventListener("click", () => openConnectionDialog());

  els.connectionForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.connectionForm.querySelector('[type="submit"]');
    withSavingState(btn, "保存中…", () => addConnection(new FormData(els.connectionForm)));
  });

  document.getElementById("connSourceType")?.addEventListener("change", (e) => {
    toggleConnComboboxes("source", e.target.value);
  });
  document.getElementById("connTargetType")?.addEventListener("change", (e) => {
    toggleConnComboboxes("target", e.target.value);
  });

  els.connectionKindChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind-filter]");
    if (!button) return;
    selectedConnectionKindFilter = button.dataset.kindFilter;
    els.connectionKindChips.querySelectorAll("[data-kind-filter]").forEach((item) => {
      item.classList.toggle("active", item.dataset.kindFilter === selectedConnectionKindFilter);
    });
    renderConnections();
  });

  els.connectionSearch?.addEventListener("input", renderConnections);

  els.connectionsList?.addEventListener("click", (event) => {
    const delBtn = event.target.closest(".conn-delete-btn");
    if (delBtn) { event.stopPropagation(); deleteConnection(delBtn.dataset.connId); }
  });

  els.quoteDetailConnectBtn?.addEventListener("click", () => {
    const quoteId = document.getElementById("quoteDetailDialog")?.dataset?.openQuoteId || "";
    document.getElementById("quoteDetailDialog").close();
    openConnectionDialog({ sourceType: "quote", sourceId: quoteId });
  });

  els.mobileTabs.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
  });

  els.bookForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.bookForm.querySelector('[type="submit"]');
    withSavingState(btn, "保存中…", () => addBook(new FormData(els.bookForm)));
  });
  els.sessionForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.sessionForm.querySelector('[type="submit"]');
    withSavingState(btn, "保存中…", () => addSession(new FormData(els.sessionForm)));
  });
  els.quoteForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.quoteForm.querySelector('[type="submit"]');
    withSavingState(btn, "保存中…", () => addQuote(new FormData(els.quoteForm)));
  });
  els.registerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.registerForm.querySelector('[type="submit"]');
    withSavingState(btn, "注册中…", () => handleRegister(new FormData(els.registerForm)));
  });
  els.loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.loginForm.querySelector('[type="submit"]');
    withSavingState(btn, "登录中…", () => handleLogin(new FormData(els.loginForm)));
  });
  els.bookEditForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.bookEditForm.querySelector('[type="submit"]');
    withSavingState(btn, "保存中…", () => saveBookEdit(new FormData(els.bookEditForm)));
  });

  els.logoutBtn?.addEventListener("click", logout);
  els.exportButton?.addEventListener("click", exportData);
  els.clearLogsBtn?.addEventListener("click", clearLogs);
  els.sessionSearch?.addEventListener("input", renderTimeline);
  els.quoteSearch?.addEventListener("input", renderQuotes);
  els.quoteTypeChips?.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      els.quoteTypeChips.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderQuotes();
    });
  });

  // Auth tab toggle (Fix 5)
  document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.authTab;
      document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.authTab === target));
      document.querySelectorAll(".auth-form-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `authTab${target.charAt(0).toUpperCase() + target.slice(1)}`);
      });
    });
  });
  els.ocrButton?.addEventListener("click", runOcrFromImage);

  // Delegated edit and delete for session and quote cards (cards are rebuilt on each render)
  els.timeline?.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit-session]");
    if (editBtn) { event.stopPropagation(); editSession(editBtn.dataset.editSession); return; }
    const delBtn = event.target.closest("[data-delete-session]");
    if (delBtn) { event.stopPropagation(); deleteSession(delBtn.dataset.deleteSession); }
  });
  els.quotesList?.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit-quote]");
    if (editBtn) { event.stopPropagation(); editQuote(editBtn.dataset.editQuote); return; }
    const delBtn = event.target.closest("[data-delete-quote]");
    if (delBtn) { event.stopPropagation(); deleteQuote(delBtn.dataset.deleteQuote); return; }
    const card = event.target.closest("[data-quote-id]");
    if (card) openQuoteDetail(card.dataset.quoteId);
  });

  els.statusFilterChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status-filter]");
    if (!button) return;
    selectedStatusFilter = button.dataset.statusFilter;
    els.statusFilterChips.querySelectorAll("[data-status-filter]").forEach((item) => {
      item.classList.toggle("active", item.dataset.statusFilter === selectedStatusFilter);
    });
    renderBooks();
  });

  document.querySelector("#booksSearchInput")?.addEventListener("input", (event) => {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      globalSearch(event.target.value);
    }, 200);
  });

  // chat.js 执行 action 后触发此事件，app.js 响应并重渲染
  window.addEventListener("paper-reading-data-changed", () => {
    render();
  });

  els.importInput?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      importData(file);
    }
    event.target.value = "";
  });

  els.importExcelInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    await importExcel(file);
    event.target.value = "";
  });

  els.bookEditImageInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (pendingBookEditImage?.objectUrl) URL.revokeObjectURL(pendingBookEditImage.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    pendingBookEditImage = { name: file.name, objectUrl, dataUrl: null };
    renderBookEditImagePreview();
    if (els.bookEditImageStatus) els.bookEditImageStatus.textContent = "新封面已选择，保存后生效。";
    resizeImageToDataUrl(file).then((dataUrl) => {
      if (pendingBookEditImage) pendingBookEditImage.dataUrl = dataUrl;
    }).catch(() => {});
  });

  els.bookImageInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (pendingBookImage?.objectUrl) URL.revokeObjectURL(pendingBookImage.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    pendingBookImage = { name: file.name, objectUrl, dataUrl: null };
    renderBookImagePreview();
    if (els.bookImageStatus) els.bookImageStatus.textContent = "封面已选择，保存书籍后会自动上传。";
    showToast("封面已载入");
    resizeImageToDataUrl(file).then((dataUrl) => {
      if (pendingBookImage) pendingBookImage.dataUrl = dataUrl;
    }).catch(() => {});
  });

  els.quoteImageInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      await handleQuoteImageChange(file);
    } catch {
      showToast("图片读取失败");
    }
  });
}

window.paperReadingApp = {
  getCurrentUser: () => currentUser,
  getState: () => state,
  showToast,
  activateTab,
  requireAuth,
  apiFetch,
  buildApiUrl,
  getAuthToken: () => authToken,
  loadRemoteLogs,
  clearChatHistory,
  showConfirmDialog,
  getChatHistoryForBook(bookId) {
    return state.chatHistories?.[bookId || "__general__"] || [];
  },
  setChatHistoryForBook(bookId, history) {
    state.chatHistories[bookId || "__general__"] = Array.isArray(history) ? history : [];
  },
};

bindEvents();
render();
activateTab("books");
loadSession();
