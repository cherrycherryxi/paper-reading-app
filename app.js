const AUTH_TOKEN_KEY = "paper-reading-auth-token-v1";
const DEFAULT_BOOK_COVER_URL = "./assets/default-book-cover.jpeg?v=20260519g";
const QUOTE_IMAGE_MAX_PX = 1800;
const QUOTE_IMAGE_QUALITY = 0.92;

const initialState = {
  books: [],
  sessions: [],
  quotes: [],
  chatHistories: {},
  chatContexts: {},
  connections: [],
};

const statusMap = {
  reading: "阅读中",
  wishlist: "想读",
  paused: "暂停",
  finished: "已读完",
};

const ocrStatusMap = {
  pending: "识别中",
  done: "识别完成",
  failed: "识别失败",
};

const bookStatusOrder = {
  reading: 0,
  finished: 1,
  wishlist: 2,
  paused: 3,
};

const quoteKindMap = {
  quote: "摘抄",
  note: "笔记",
  question: "问题",
};

const els = {
  bookForm: document.querySelector("#bookForm"),
  sessionForm: document.querySelector("#sessionForm"),
  quoteForm: document.querySelector("#quoteForm"),
  registerForm: document.querySelector("#registerForm"),
  loginForm: document.querySelector("#loginForm"),
  forgotPasswordBtn: document.querySelector("#forgotPasswordBtn"),
  forgotPasswordDialog: document.querySelector("#forgotPasswordDialog"),
  forgotPasswordForm: document.querySelector("#forgotPasswordForm"),
  forgotPasswordCancelBtn: document.querySelector("#forgotPasswordCancelBtn"),
  resetPasswordDialog: document.querySelector("#resetPasswordDialog"),
  resetPasswordForm: document.querySelector("#resetPasswordForm"),
  resetPasswordToken: document.querySelector("#resetPasswordToken"),
  resetPasswordCancelBtn: document.querySelector("#resetPasswordCancelBtn"),
  quoteTypeChips: document.querySelector("#quoteTypeChips"),
  quoteSearch: document.querySelector("#quoteSearch"),
  statusFilterChips: document.querySelector("#statusFilterChips"),
  booksResultCount: document.querySelector("#booksResultCount"),
  importInput: document.querySelector("#importInput"),
  importResultDialog: document.querySelector("#importResultDialog"),
  importResultList: document.querySelector("#importResultList"),
  importResultOkBtn: document.querySelector("#importResultOkBtn"),
  importExcelInput: document.querySelector("#importExcelInput"),
  importExcelBooksBtn: document.querySelector("#importExcelBooksBtn"),
  importExcelDialog: document.querySelector("#importExcelDialog"),
  downloadExcelTemplateBtn: document.querySelector("#downloadExcelTemplateBtn"),
  chooseExcelFileBtn: document.querySelector("#chooseExcelFileBtn"),
  importExcelCancelBtn: document.querySelector("#importExcelCancelBtn"),
  exportButton: document.querySelector("#exportButton"),
  clearLogsBtn: document.querySelector("#clearLogsBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  logoutAllBtn: document.querySelector("#logoutAllBtn"),
  planSummary: document.querySelector("#planSummary"),
  exportAccountBtn: document.querySelector("#exportAccountBtn"),
  deleteAccountBtn: document.querySelector("#deleteAccountBtn"),
  booksList: document.querySelector("#booksList"),
  timeline: document.querySelector("#timeline"),
  sessionSearch: document.querySelector("#sessionSearch"),
  sessionStats: document.querySelector("#sessionStats"),
  quotesList: document.querySelector("#quotesList"),
  logsList: document.querySelector("#modelLogsList"),
  meSummary: document.querySelector("#meSummary"),
  meAvatarBtn: document.querySelector("#meAvatarBtn"),
  meAvatarDot: document.querySelector("#meAvatarDot"),
  meDrawer: document.querySelector("#meDrawer"),
  meDrawerOverlay: document.querySelector("#meDrawerOverlay"),
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
  bookOcrButton: document.querySelector("#bookOcrButton"),
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
  organizeDialog: document.querySelector("#organizeDialog"),
  organizeDialogMeta: document.querySelector("#organizeDialogMeta"),
  organizeRawText: document.querySelector("#organizeRawText"),
  organizeSubmitBtn: document.querySelector("#organizeSubmitBtn"),
  organizeTabPaste: document.querySelector("#organizeTabPaste"),
  organizeTabPhoto: document.querySelector("#organizeTabPhoto"),
  organizePastePane: document.querySelector("#organizePastePane"),
  organizePhotoPane: document.querySelector("#organizePhotoPane"),
  organizePhotoPreview: document.querySelector("#organizePhotoPreview"),
  organizePhotoImg: document.querySelector("#organizePhotoImg"),
  organizePickPhotoBtn: document.querySelector("#organizePickPhotoBtn"),
  candidatesDialog: document.querySelector("#candidatesDialog"),
  candidatesDialogMeta: document.querySelector("#candidatesDialogMeta"),
  candidatesList: document.querySelector("#candidatesList"),
  quoteImageInput: document.querySelector("#quoteImageInput"),
  quoteImagePreview: document.querySelector("#quoteImagePreview"),
  quotePreviewImg: document.querySelector("#quotePreviewImg"),
  ocrButton: document.querySelector("#ocrButton"),
  aiOcrButton: document.querySelector("#aiOcrButton"),
  ocrStatus: document.querySelector("#ocrStatus"),
  ocrLineSelector: document.querySelector("#ocrLineSelector"),
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
  sampleBanner: document.querySelector("#sampleBanner"),
  clearSampleBtn: document.querySelector("#clearSampleBtn"),
  openSessionDialogBtn: document.querySelector("#openSessionDialogBtn"),
  openQuoteDialogBtn: document.querySelector("#openQuoteDialogBtn"),
  openConnectionDialogBtn: document.querySelector("#openConnectionDialogBtn"),
  connectionDialog: document.querySelector("#connectionDialog"),
  connectionForm: document.querySelector("#connectionForm"),
  connectionsList: document.querySelector("#connectionsList"),
  connectionSearch: document.querySelector("#connectionSearch"),
  connectionKindChips: document.querySelector("#connectionKindChips"),
  quoteDetailChatBtn: document.querySelector("#quoteDetailChatBtn"),
  quoteDetailConnectBtn: document.querySelector("#quoteDetailConnectBtn"),
  mobileTabs: document.querySelectorAll(".mobile-tab"),
};

let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let currentUser = null;
let state = structuredClone(initialState);
// OPT-029 Layer B / E35: optimistic-locking token for the user's state. Set
// from every server response that carries `stateVersion` (see apiFetch) and
// echoed back on PUT /api/state so the server can reject a stale overwrite.
let stateVersion = "";
let pendingBookImage = null;
let pendingBookEditImage = null;
let pendingQuoteImage = null;
let lastQuoteBookId = "";
// Whether the open quote dialog is for a brand-new quote (vs editing an
// existing one). OCR assigns the draft a real id mid-session, so existingId
// alone can't tell "new" from "edit" — track it explicitly so we still
// remember the book for the next 新增 (see addQuote / lastQuoteBookId).
let quoteDialogIsNew = false;
// 快速/AI OCR 会在服务端立即创建并落库一张 quote（AI 路径靠它做异步轮询回填）。若用户
// 识别后直接「取消」，这张卡片不应残留——记下「本次为新建卡片由 OCR 临时创建的 id」，
// 对话框未保存就关闭时静默删除它（见 addQuote 清空 / quoteDialog close 监听）。
let ocrProvisionalQuoteId = "";
let selectedQuoteTags = [];
const DEFAULT_QUOTE_TAGS = ["金句", "人物", "结构", "哲学", "启发", "情节", "叙事"];
let toastTimer = null;
let selectedStatusFilter = "all";
let selectedTagFilter = "";
let searchQuery = "";
let _renderBooksId = 0;
let _bookDetailCurrentId = "";
let _organizeCurrentBookId = "";
let _candidatesCurrentBookId = "";
let searchDebounceTimer = null;
let ocrRefreshTimer = null;
let remoteLogs = [];

function isTabActive(tabName) {
  return document.querySelector(`.layout [data-tab-section="${tabName}"]`)?.classList.contains("tab-active") || false;
}

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

// 书单等列表用的封面缩略图路径：把 /media|/uploads 下的图片映射到同目录的 .thumb.jpg
// （由 scripts/generate_thumbnails.py 用 sips 预生成，~30KB，避免书单一次性拉几十 MB 原图）。
// 非上传图（默认封面、data URI、外链）或已是缩略图则原样返回；缩略图不存在时前端 onerror 退回原图。
function thumbPath(url) {
  if (typeof url !== "string" || !url) return url;
  if (!/\/(?:media|uploads)\//.test(url)) return url;
  if (/\.thumb\.jpg(\?|$)/i.test(url)) return url;
  const [path, query] = url.split("?");
  return path.replace(/\.[^./]+$/, "") + ".thumb.jpg" + (query ? "?" + query : "");
}

function bindBookCoverImageFallback(card) {
  const cover = card.querySelector(".book-card-cover");
  const img = cover?.querySelector("img");
  if (!cover || !img) return;

  img.addEventListener("load", () => {
    if (img.naturalWidth > img.naturalHeight * 1.2) {
      cover.classList.add("is-landscape-cover");
    } else {
      cover.classList.remove("is-landscape-cover");
    }
  });
  img.addEventListener("error", () => {
    // 1) 缩略图缺失/加载失败 → 先退回原图（data-full 仅在有真实缩略图时才写）
    const full = img.dataset.full || "";
    if (full && img.dataset.triedFull !== "true") {
      img.dataset.triedFull = "true";
      img.src = full;
      return;
    }
    // 2) 原图也失败 → 默认封面
    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    cover.classList.add("has-default-cover");
    cover.classList.remove("is-landscape-cover");
    img.src = DEFAULT_BOOK_COVER_URL;
  });
  if (img.complete && img.naturalWidth > 0) {
    img.dispatchEvent(new Event("load"));
  }
}

function normalizeChatContext(context = null, fallbackBookId = "") {
  if (context && typeof context === "object") {
    if (context.type === "book") {
      const bookId = String(context.bookId || "").trim();
      return bookId ? { type: "book", bookId } : { type: "global" };
    }
    if (context.type === "quote") {
      const bookId = String(context.bookId || "").trim();
      const quoteId = String(context.quoteId || "").trim();
      if (bookId && quoteId) return { type: "quote", bookId, quoteId };
      if (bookId) return { type: "book", bookId };
    }
    if (context.type === "global") {
      return { type: "global" };
    }
  }
  const bookId = String(fallbackBookId || "").trim();
  return bookId ? { type: "book", bookId } : { type: "global" };
}

function chatContextHistoryKey(context) {
  const normalized = normalizeChatContext(context);
  if (normalized.type === "book") return `book:${normalized.bookId}`;
  if (normalized.type === "quote") return `quote:${normalized.quoteId}`;
  return "global";
}

function contextFromHistoryKey(historyKey) {
  const key = String(historyKey || "").trim();
  if (!key || key === "__general__" || key === "global") return { type: "global" };
  if (key.startsWith("book:")) return normalizeChatContext({ type: "book", bookId: key.slice(5) });
  return normalizeChatContext({ type: "book", bookId: key });
}

function normalizeChatState(rawState = {}) {
  const sourceHistories = rawState.chatHistories && typeof rawState.chatHistories === "object"
    ? rawState.chatHistories
    : {};
  const rawContexts = rawState.chatContexts && typeof rawState.chatContexts === "object"
    ? rawState.chatContexts
    : {};
  const chatHistories = {};
  const chatContexts = {};
  Object.entries(sourceHistories).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    const context = rawContexts[key] && typeof rawContexts[key] === "object"
      ? normalizeChatContext(rawContexts[key])
      : contextFromHistoryKey(key);
    const historyKey = chatContextHistoryKey(context);
    if (!chatHistories[historyKey]) {
      chatHistories[historyKey] = value;
      chatContexts[historyKey] = context;
    }
  });
  Object.entries(rawContexts).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const context = normalizeChatContext(value);
    const historyKey = chatContextHistoryKey(context);
    if (chatHistories[historyKey]) chatContexts[historyKey] = context;
  });
  return { chatHistories, chatContexts };
}

function normalizeStateShape(rawState) {
  const base = rawState || structuredClone(initialState);
  const chat = normalizeChatState(base);
  return {
    ...base,
    books: Array.isArray(base.books) ? base.books.map(repairBookReadingDates) : [],
    sessions: Array.isArray(base.sessions) ? base.sessions : [],
    quotes: Array.isArray(base.quotes) ? base.quotes : [],
    connections: Array.isArray(base.connections) ? base.connections : [],
    chatHistories: chat.chatHistories,
    chatContexts: chat.chatContexts,
  };
}

async function apiFetch(path, options = {}, requiresAuth = true) {
  const headers = {
    ...(options.headers || {}),
  };

  if (requiresAuth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error("无法连接后端服务，请确认已启动 ./scripts/dev_backend.sh 或 app_server.py");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    // 401 means the session has expired — surface a clear message and reset auth state
    if (response.status === 401 && requiresAuth) {
      authToken = "";
      currentUser = null;
      stateVersion = "";
      localStorage.removeItem(AUTH_TOKEN_KEY);
      showToast("登录已过期，请重新登录");
      dispatchUserChange();
    }
    if (response.status === 429 && data?.message) {
      const err = new Error(data.message);
      err.code = "rate_limited";
      err.retryAfter = Number(data.retry_after_seconds) || 0;
      err.usage = data.usage || null;
      throw err;
    }
    // OPT-029 Layer B / E35: a 409 means another tab/device saved a newer
    // version. Carry the server's current state + version so the caller can
    // reconcile instead of silently clobbering it.
    if (response.status === 409 && data?.error === "state_conflict") {
      const err = new Error(data.message || "状态冲突");
      err.code = "state_conflict";
      err.state = data.state;
      err.stateVersion = typeof data.stateVersion === "string" ? data.stateVersion : "";
      throw err;
    }
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  // Central capture: any successful response carrying a fresh state version
  // keeps our optimistic-locking token current, so the next PUT won't 409.
  if (data && typeof data.stateVersion === "string") {
    stateVersion = data.stateVersion;
  }
  return data;
}

function dispatchUserChange() {
  // Flip `body.is-admin` so admin-only sections (model logs panel etc.)
  // appear for accounts listed in backend ADMIN_USERNAMES. Server-side
  // /debug/* endpoints are separately gated by ADMIN_TOKEN; /api/model-logs
  // already scopes results to the logged-in user, so CSS-only gating here
  // is for UX clarity, not data isolation.
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("is-admin", currentUser?.is_admin === true);
  }
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
  // Re-entrancy guard: a disabled button means a save is already in flight.
  // A disabled submit button does NOT block a second form submit via the Enter
  // key, so without this guard a double-submit can run two overlapping
  // withSavingState calls — the second captures the live "保存中…" text as its
  // "original" and restores to it, wedging the button permanently.
  if (btn.disabled) return;
  // Capture the true idle label once (from the HTML default) and reuse it, so
  // restore can never get stuck on a transient label.
  if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = savingLabel;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = btn.dataset.idleLabel;
  }
}

function showToast(message) {
  els.toast.textContent = message;
  // A modal <dialog> (showModal) renders in the browser top layer, above ALL
  // z-indexed content. A body-level toast would be painted behind it and only
  // become visible after the dialog closes. So host the toast inside the
  // topmost open dialog when one is open; otherwise keep it on <body>.
  const openDialogs = document.querySelectorAll("dialog[open]");
  const host = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
  if (els.toast.parentNode !== host) host.appendChild(els.toast);
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

// OPT-074: book startedAt/finishedAt are stored as ISO strings; <input type="date">
// works with "YYYY-MM-DD". These two helpers convert between the two, using local
// date components so the day the user picked is preserved across time zones.
function isoToDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function todayLocalDateInput() {
  return new Intl.DateTimeFormat("sv").format(new Date());
}

function normalizeTags(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// picker 的自定义标签来源**只用这一个**：localStorage 里用户经标签输入框亲手敲过的标签。
// 不要从 state.quotes 里反推「这本书用过的标签」——那会把笔记(note)卡片的标签、以及 AI OCR
// 自动生成的标签全拖进来，几十个堆在一起特别杂乱（用户明确：只要默认 + 自己手动加的摘抄标签）。
function getCustomQuoteTags() {
  try { return JSON.parse(localStorage.getItem("quote-custom-tags") || "[]"); } catch { return []; }
}
function saveCustomQuoteTags(tags) {
  localStorage.setItem("quote-custom-tags", JSON.stringify(tags));
}
function _syncQuoteTagsInput() {
  const hidden = document.getElementById("quoteTagsHidden");
  if (hidden) hidden.value = selectedQuoteTags.join(", ");
}
function renderQuoteTagPicker(initialTags) {
  selectedQuoteTags = [...(initialTags || [])];
  _syncQuoteTagsInput();
  const container = document.getElementById("quoteTagChips");
  if (!container) return;
  const pickerTags = [...new Set([...DEFAULT_QUOTE_TAGS, ...getCustomQuoteTags()])];
  const selectedOnlyTags = selectedQuoteTags.filter((tag) => !pickerTags.includes(tag));
  container.innerHTML = [
    ...pickerTags.map((t) =>
      `<button type="button" class="tag-chip-pick${selectedQuoteTags.includes(t) ? " tag-chip-pick--active" : ""}" data-pick-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    ),
    ...selectedOnlyTags.map((t) =>
      `<button type="button" class="tag-chip-pick tag-chip-pick--active tag-chip-pick--selected-only" data-selected-only-tag="true" data-pick-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    ),
  ].join("");
}

// Excel serial 25569 == 1970-01-01 (1900 date system, including the 1900 leap-year
// bug). A serial like 46055 is 2026-02-02. We re-anchor at local noon so the shown
// calendar day is stable across time zones (matches dateInputToIso).
function excelSerialToIso(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0 || n >= 100000) return null;
  const utc = new Date(Math.round((n - 25569) * 86400000));
  if (Number.isNaN(utc.getTime())) return null;
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  const anchored = new Date(`${y}-${m}-${day}T12:00:00`);
  return Number.isNaN(anchored.getTime()) ? null : anchored.toISOString();
}

function parseExcelDateToIso(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  // Excel often stores dates as serial day-numbers. These MUST be converted
  // explicitly — `new Date("46055")` would mis-read the serial as the YEAR 46055
  // and silently store a date ~44000 years in the future (bug-342).
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial < 80000) return excelSerialToIso(serial);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() > 9999) return null; // guard the year-only mis-parse
  return date.toISOString();
}

// Repair dates already corrupted by the old parseExcelDateToIso: an Excel serial
// mis-parsed as `new Date("46055")` became the literal (local) year 46055. The
// impossible year IS the original serial, so convert it back to the real date.
function repairBogusExcelDate(val) {
  if (!val) return val;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  const localYear = d.getFullYear();
  if (localYear <= 9999) return val;
  return excelSerialToIso(localYear) || val;
}

function repairBookReadingDates(book) {
  if (!book || typeof book !== "object") return book;
  let repaired = book;
  for (const field of ["startedAt", "finishedAt", "lastReadAt"]) {
    const fixed = repairBogusExcelDate(book[field]);
    if (fixed !== book[field]) {
      if (repaired === book) repaired = { ...book };
      repaired[field] = fixed;
    }
  }
  // bug-346: a start date later than the finish date is impossible. startedAt is
  // the auto-derived field (saveSession/saveBookEdit fill it from "now"/session
  // date), so when it lands after a known finishedAt it was fabricated wrongly —
  // clear it rather than show 开始 > 读完.
  if (repaired.startedAt && repaired.finishedAt && repaired.startedAt > repaired.finishedAt) {
    if (repaired === book) repaired = { ...book };
    repaired.startedAt = null;
  }
  return repaired;
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

function normalizeOcrText(text) {
  return String(text || "")
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/([\u4e00-\u9fff])[ \t]+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/\s+([，。！？；：、）】》」』])/g, "$1")
    .replace(/([（【《「『])\s+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function isStalePendingOcr(quote, now = Date.now()) {
  if (quote?.ocrStatus !== "pending") return false;
  const startedAt = Date.parse(quote.ocrUpdatedAt || quote.ocrRequestedAt || quote.createdAt || "");
  return Number.isFinite(startedAt) && now - startedAt > 10 * 60 * 1000;
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

const authorNationalityLabels = [
  "中国", "中", "美国", "美", "英国", "英", "法国", "法", "德国", "德", "日本", "日",
  "俄国", "俄罗斯", "俄", "意大利", "意", "西班牙", "西", "葡萄牙", "葡", "加拿大", "加",
  "澳大利亚", "澳", "奥地利", "奥", "瑞士", "瑞典", "瑞", "挪威", "挪", "丹麦", "丹",
  "芬兰", "芬", "荷兰", "荷", "比利时", "比", "爱尔兰", "爱", "希腊", "希", "印度", "印",
  "韩国", "韩", "German", "Germany", "American", "USA", "US", "U.S.", "British", "Britain",
  "English", "French", "France", "Japanese", "Russian", "Italian", "Spanish", "Canadian",
  "Australian", "Austrian", "Swiss", "Swedish", "Norwegian", "Danish", "Finnish", "Dutch",
  "Belgian", "Irish", "Greek", "Indian", "Korean",
];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const authorNationalityPattern = authorNationalityLabels
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

function stripAuthorNationality(raw) {
  let value = String(raw || "")
    .trim()
    .replace(/^作者\s*[:：]\s*/i, "");
  if (!value) return "";

  let previous = "";
  while (value && value !== previous) {
    previous = value;
    value = value
      .replace(new RegExp(`^[\\s\\[【(（]+\\s*(?:${authorNationalityPattern})\\s*[\\]】)）]+\\s*`, "i"), "")
      .replace(new RegExp(`^(?:${authorNationalityPattern})(?:籍|国)?[\\s,，.．:：\\-—]+`, "i"), "")
      .replace(new RegExp(`^(?:中国|美国|英国|法国|德国|日本|俄国|俄罗斯|意大利|西班牙|加拿大|澳大利亚|奥地利|瑞士|瑞典|挪威|丹麦|芬兰|荷兰|比利时|爱尔兰|希腊|印度|韩国)`, "i"), "")
      .trim();
  }
  return value;
}

function normalizeBookAuthorForMatch(raw) {
  return stripAuthorNationality(raw)
    .replace(/\s*(?:著|撰|编著|编|译)\s*$/g, "")
    .replace(/[\s·・.．,，、:：;；\-—_'"“”‘’`]/g, "")
    .toLowerCase();
}

function normalizeBookTitleForMatch(title) {
  return normalizeBookTitle(title).replace(/\s+/g, "").toLowerCase();
}

// Two books are the same when titles match and authors are compatible.
// An empty author means "unspecified" and acts as a wildcard, so adding a
// title-only book still matches an existing same-title book that has an author.
function isSameBook(titleA, authorA, titleB, authorB) {
  const ta = normalizeBookTitleForMatch(titleA);
  const tb = normalizeBookTitleForMatch(titleB);
  if (!ta || ta !== tb) return false;
  const aa = normalizeBookAuthorForMatch(authorA);
  const ab = normalizeBookAuthorForMatch(authorB);
  if (!aa || !ab) return true;
  return aa === ab;
}

function findDuplicateBook(title, author, books = state.books) {
  if (!normalizeBookTitleForMatch(title)) return null;
  return books.find((book) => isSameBook(title, author, book.title, book.author || "")) || null;
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

function buildRenderCache() {
  const metricsMap = new Map();
  const quoteCountMap = new Map();
  const connCountMap = new Map();
  const firstQuoteImageMap = new Map();

  for (const s of state.sessions) {
    const m = metricsMap.get(s.bookId) || { count: 0, minutes: 0, pages: 0 };
    m.count++;
    m.minutes += Number(s.minutes || 0);
    m.pages += Number(s.pagesRead || 0);
    metricsMap.set(s.bookId, m);
  }
  for (const q of state.quotes) {
    quoteCountMap.set(q.bookId, (quoteCountMap.get(q.bookId) || 0) + 1);
    if (q.imageUrl && !firstQuoteImageMap.has(q.bookId)) firstQuoteImageMap.set(q.bookId, q.imageUrl);
  }
  for (const c of state.connections || []) {
    connCountMap.set(c.sourceId, (connCountMap.get(c.sourceId) || 0) + 1);
    connCountMap.set(c.targetId, (connCountMap.get(c.targetId) || 0) + 1);
  }
  return { metricsMap, quoteCountMap, connCountMap, firstQuoteImageMap };
}

function getBookSessions(bookId) {
  return state.sessions.filter((item) => item.bookId === bookId);
}

function isRegularQuote(item) {
  return item?.kind !== "question";
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
  return state.quotes.filter((item) => item.bookId === bookId && isRegularQuote(item)).length;
}

function getConnectionCount(itemId) {
  return (state.connections || []).filter((c) => c.sourceId === itemId || c.targetId === itemId).length;
}

function getQuoteChatCount(quoteId) {
  const history = state.chatHistories?.[`quote:${quoteId}`] || [];
  return history.filter((m) => m.role === "user").length;
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
      <div class="conn-card-actions">
        <button class="conn-share-btn button-icon" type="button" aria-label="生成分享图" data-conn-id="${escapeHtml(conn.id)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
        </button>
        <button class="conn-edit-btn button-icon" type="button" aria-label="编辑关联" data-conn-id="${escapeHtml(conn.id)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="conn-delete-btn button-icon" type="button" aria-label="删除关联" data-conn-id="${escapeHtml(conn.id)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="connection-sides">
      <div class="connection-side conn-nav-side" data-nav-type="${escapeHtml(conn.sourceType)}" data-nav-id="${escapeHtml(conn.sourceId)}">
        <div class="connection-side-label">${escapeHtml(src.label)}</div>
        ${src.sub ? `<div class="connection-side-sub">${escapeHtml(src.sub)}</div>` : ""}
      </div>
      <div class="connection-arrow">↔</div>
      <div class="connection-side conn-nav-side" data-nav-type="${escapeHtml(conn.targetType)}" data-nav-id="${escapeHtml(conn.targetId)}">
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
    els.connectionsList.innerHTML = conns.length ? "当前筛选条件下没有关联。" : "还没有记录思想碰撞，点左上角 + 开始建立联系。";
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
    // Drop the optimistic-locking token so a later login starts fresh and the
    // first PUT isn't checked against a previous account's version.
    stateVersion = "";
  }
}

async function syncState() {
  if (!currentUser?.id) return;
  try {
    const data = await apiFetch(
      "/api/state",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-State-Version": stateVersion,
        },
        body: JSON.stringify(state),
      },
      true
    );
    state = normalizeStateShape(data.state);
  } catch (error) {
    if (error.code === "state_conflict") {
      // Another tab/device saved a newer version. Adopt the server's current
      // state rather than silently overwriting it; the unsynced local edit is
      // surfaced to the user instead of vanishing without a trace.
      state = normalizeStateShape(error.state);
      stateVersion = error.stateVersion;
      render();
      window.dispatchEvent(new CustomEvent("paper-reading-data-changed"));
      showToast("数据已在其他设备更新，已为你加载最新版本");
      return;
    }
    throw error;
  }
}

async function loadSession() {
  if (!authToken) {
    currentUser = null;
    state = normalizeStateShape(initialState);
    remoteLogs = [];
    render();
    maybeHandleSignupIntent();
    return;
  }

  try {
    const data = await apiFetch("/api/session");
    currentUser = data.user || null;
    state = normalizeStateShape(data.state);
    await recoverStalePendingOcr();
    await loadRemoteLogs();
  } catch {
    setAuthToken("");
    currentUser = null;
    state = normalizeStateShape(initialState);
    remoteLogs = [];
  }
  render();
  scheduleOcrStatusRefresh();
  dispatchUserChange();
  maybeHandleSignupIntent();
}

async function refreshSessionState({ renderPage = false } = {}) {
  if (!authToken) {
    return false;
  }
  const data = await apiFetch("/api/session");
  currentUser = data.user || null;
  state = normalizeStateShape(data.state);
  if (renderPage) {
    render();
    dispatchUserChange();
  }
  return true;
}

function hasPendingOcrQuotes() {
  return state.quotes.some((quote) => quote.ocrStatus === "pending" && !isStalePendingOcr(quote));
}

// OPT-042 (Fix B): a quote stuck at ocrStatus:"pending" past the staleness
// window is orphaned — its OCR job died (a server restart kills the background
// AI thread; a fast request can be interrupted before completing). Flip such
// cards to "failed" so they surface the recoverable failed UI (retry / delete)
// instead of an eternal "识别中" badge. No OCR engine takes minutes, so the
// staleness window makes false positives effectively impossible. Persists once
// (best-effort) if anything changed.
async function recoverStalePendingOcr() {
  const now = Date.now();
  let changed = false;
  for (const quote of state.quotes) {
    if (quote.ocrStatus === "pending" && isStalePendingOcr(quote, now)) {
      quote.ocrStatus = "failed";
      quote.ocrError = quote.ocrError || "识别中断（可能因服务重启），可重试或删除。";
      quote.ocrUpdatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    try {
      await syncState();
    } catch (error) {
      // Non-fatal: the flip still applies locally this session and is retried
      // on the next load. Don't block startup on it.
      console.debug?.("recoverStalePendingOcr sync failed:", error.message);
    }
  }
  return changed;
}

function scheduleOcrStatusRefresh(delayMs = 5000) {
  if (ocrRefreshTimer) {
    clearTimeout(ocrRefreshTimer);
  }
  if (!hasPendingOcrQuotes()) {
    ocrRefreshTimer = null;
    return;
  }
  ocrRefreshTimer = setTimeout(async () => {
    ocrRefreshTimer = null;
    try {
      await refreshSessionState({ renderPage: true });
      if (hasPendingOcrQuotes()) {
        scheduleOcrStatusRefresh(5000);
      } else {
        await loadRemoteLogs();
        showToast("图片文字识别已完成");
      }
    } catch {
      if (hasPendingOcrQuotes()) scheduleOcrStatusRefresh(8000);
    }
  }, delayMs);
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
  const quoteCount = state.quotes.filter(isRegularQuote).length;
  els.heroBooks.textContent = state.books.length;
  els.heroMinutes.textContent = minutes;
  els.heroQuotes.textContent = quoteCount;
}

function renderSummary() {
  const finishedBooks = state.books.filter((item) => item.status === "finished").length;
  const readingBooks = state.books.filter((item) => item.status === "reading").length;
  const completionRate = state.books.length ? Math.round((finishedBooks / state.books.length) * 100) : 0;
  const quoteCount = state.quotes.filter(isRegularQuote).length;
  const stats = [
    { label: "阅读中", value: readingBooks, icon: "📖" },
    { label: "书单总数", value: state.books.length, icon: "📚" },
    { label: "阅读记录", value: state.sessions.length, icon: "🕐" },
    { label: "摘抄卡片", value: quoteCount, icon: "✍️" },
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
  els.meAvatarDot?.classList.toggle("is-hidden", !isLoggedIn);

  if (!isLoggedIn) {
    if (els.currentUsername) els.currentUsername.textContent = "未登录";
    if (els.currentUserMeta) els.currentUserMeta.textContent = "登录后，数据保存到服务器。";
    return;
  }

  if (els.currentUsername) els.currentUsername.textContent = currentUser.username;
  if (els.currentUserMeta) els.currentUserMeta.textContent = "数据已同步至服务器";
}

function openMeDrawer() {
  if (!els.meDrawer) return;
  els.meDrawer.classList.add("is-open");
  els.meDrawerOverlay.classList.add("is-open");
  loadPlanInfo();
}

function closeMeDrawer() {
  if (!els.meDrawer) return;
  els.meDrawer.classList.remove("is-open");
  els.meDrawerOverlay.classList.remove("is-open");
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

// Used by book-detail and quote-tab filtering only. Intentionally NOT wired into globalSearch().
function matchQuotes(query) {
  return state.quotes.filter((quote) => isRegularQuote(quote) && fuzzyMatch(quote.content || "", query));
}

function compareBooksForList(a, b) {
  const statusDelta = (bookStatusOrder[a.status] ?? 99) - (bookStatusOrder[b.status] ?? 99);
  if (statusDelta !== 0) return statusDelta;
  // OPT-037: compare timestamps numerically, not as strings. createdAt is mixed
  // format (utc_now_iso ms+Z vs legacy now_iso second-precision), and
  // localeCompare orders "...20.500Z" before "...20Z" ('.'<'Z'), inverting
  // same-second order. Date.parse normalizes both. (Matches OPT-014 at line ~1415.)
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
}

function restoreEditedBookPosition(bookId, fallbackScrollTop = 0) {
  const restore = () => {
    const card = els.booksList?.querySelector?.(`[data-book-card-id="${String(bookId).replace(/"/g, '\\"')}"]`);
    if (card?.scrollIntoView) {
      card.scrollIntoView({ block: "nearest" });
      return;
    }
    if (els.booksList && fallbackScrollTop > 0) {
      els.booksList.scrollTop = fallbackScrollTop;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(restore));
}

// OPT-027: shared `⋯` overflow-menu helpers used by book / session / quote
// cards so all three behave identically (single open menu, click-outside close).
const CARD_SELECTOR = ".book-grid-card, .session-grid-card, .quote-grid-card";

function closeAllCardMenus() {
  document.querySelectorAll(".card-context-menu").forEach((m) => {
    if (!m.hidden) {
      m.hidden = true;
      m.closest(CARD_SELECTOR)?.querySelector(".card-menu-btn")?.setAttribute("aria-expanded", "false");
    }
  });
}

function toggleCardMenu(menuBtn) {
  const card = menuBtn.closest(CARD_SELECTOR);
  const menu = card?.querySelector(".card-context-menu");
  if (!menu) return;
  const willOpen = menu.hidden;
  closeAllCardMenus();
  if (willOpen) {
    menu.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
}

function buildBookSearchCard(book, cache) {
  const progress = getProgress(book);
  const metrics = cache ? (cache.metricsMap.get(book.id) || { count: 0, minutes: 0, pages: 0 }) : getBookMetrics(book.id);
  const qCount = cache ? (cache.quoteCountMap.get(book.id) || 0) : getQuoteCount(book.id);
  const cCount = cache ? (cache.connCountMap.get(book.id) || 0) : getConnectionCount(book.id);
  const fallbackImg = cache ? (cache.firstQuoteImageMap.get(book.id) || "") : (state.quotes.find((item) => item.bookId === book.id && item.imageUrl)?.imageUrl || "");
  const rawCover = book.coverImageUrl || fallbackImg || DEFAULT_BOOK_COVER_URL;
  const coverImage = resolveImageUrl(rawCover);            // 原图（onerror 兜底 / 详情用）
  const coverThumb = resolveImageUrl(thumbPath(rawCover)); // 书单显示用缩略图
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
  card.dataset.bookCardId = book.id;
  card.innerHTML = `
    <div class="book-card-cover has-image ${book.coverImageUrl || fallbackImg ? "" : "has-default-cover"}">
      <img src="${coverThumb}"${coverThumb !== coverImage ? ` data-full="${coverImage}"` : ""} loading="lazy" decoding="async" alt="${escapeHtml(book.title)}" />
      <span class="book-status-chip" data-status="${book.status}"><span class="chip-dot chip-dot--${book.status}"></span>${escapeHtml(statusMap[book.status] || book.status)}</span>
      <button class="card-menu-btn" type="button" aria-label="操作菜单" aria-expanded="false">⋯</button>
    </div>
    <ul class="card-context-menu" hidden>
      <li><button type="button" data-menu="add-quote">新增摘抄</button></li>
      <li><button type="button" data-menu="add-session">新增记录</button></li>
      <li><button type="button" data-menu="edit">编辑</button></li>
      <li><button type="button" data-menu="chat">去聊</button></li>
      <li><button type="button" data-menu="connect">关联</button></li>
      <li><button type="button" data-menu="share">生成分享图</button></li>
      <li class="menu-item-danger"><button type="button" data-menu="delete">删除</button></li>
    </ul>
    <div class="book-grid-body">
      <h3>${formatBookTitle(book.title)}</h3>
      <p class="book-grid-author">${escapeHtml(book.author || "作者未填写")}</p>
      <div class="book-grid-meta">🕐 ${metrics.count} 次 · ✍️ ${qCount} 张${cCount ? ` · 🔗 ${cCount} 关联` : ""}</div>
      <div class="book-grid-meta">📖 ${escapeHtml(progressText)}</div>
      ${tags ? `<div class="book-tag-row">${tags}</div>` : ""}
    </div>
  `;

  const menuBtn = card.querySelector(".card-menu-btn");
  const menu = card.querySelector(".card-context-menu");
  bindBookCoverImageFallback(card);

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCardMenu(menuBtn);
  });

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-menu]");
    if (!btn) return;
    e.stopPropagation();
    menu.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    const action = btn.dataset.menu;
    if (action === "add-quote") openNewQuoteForBook(book.id);
    else if (action === "add-session") openNewSessionForBook(book.id);
    else if (action === "edit") openBookEditDialog(book.id);
    else if (action === "chat") { activateTab("chat"); window.paperReadingApp?.switchChatToBook?.(book.id); }
    else if (action === "connect") openConnectionDialog({ sourceType: "book", sourceId: book.id });
    else if (action === "share") shareBookCard(book.id);
    else if (action === "delete") deleteBook(book.id);
  });

  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    menu.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
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
    <div class="entry-card-cover">
      <div class="entry-cover-fallback"></div>
    </div>
    <div class="entry-card-body">
      <h3>${book ? formatBookTitle(book.title) : "未知书籍"} <span class="entry-type-chip">${escapeHtml(quoteKindMap[quote.kind] || "卡片")}</span></h3>
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

function renderSearchResults(matchedBooks) {
  els.booksResultCount.textContent = `找到 ${matchedBooks.length} 本书籍`;

  if (!matchedBooks.length) {
    els.booksList.className = "book-list empty-state";
    els.booksList.innerHTML = '<p class="search-empty-combined">没有找到匹配的书籍，试试其他关键词</p>';
    return;
  }

  els.booksList.className = "book-list search-results";
  els.booksList.innerHTML = "";

  const booksList = document.createElement("div");
  booksList.className = "search-book-list";
  matchedBooks.forEach((book) => {
    booksList.appendChild(buildBookSearchCard(book));
  });
  els.booksList.appendChild(booksList);
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

  renderSearchResults(matchBooks(normalized));
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
    .sort(compareBooksForList);

  els.booksResultCount.textContent = `共 ${books.length} 本`;
  if (!books.length) {
    els.booksList.className = "book-list empty-state";
    if (state.books.length === 0 && selectedStatusFilter === "all" && !selectedTagFilter) {
      // 完全没有书:给主动作 + 载入示例(通常示例已随注册种入,此入口供清空后重来)
      els.booksList.innerHTML =
        '还没有书，点左上角 <b>+</b> 添加你在读的书，或 <button type="button" class="link-btn" id="loadSampleBtn">载入示例看看</button>。';
      els.booksList.querySelector("#loadSampleBtn")?.addEventListener("click", loadSampleData);
    } else {
      els.booksList.textContent = selectedTagFilter
        ? "没有匹配的书籍，试试清除搜索条件。"
        : "还没有匹配的书籍，点左上角加号新增一本。";
    }
    return;
  }

  els.booksList.className = "book-list";
  els.booksList.innerHTML = "";

  const cache = buildRenderCache();
  const myRender = ++_renderBooksId;
  const BATCH = 8;

  for (const book of books.slice(0, BATCH)) {
    els.booksList.appendChild(buildBookSearchCard(book, cache));
  }

  if (books.length > BATCH) {
    let offset = BATCH;
    const renderNext = () => {
      if (_renderBooksId !== myRender) return;
      for (const book of books.slice(offset, offset + BATCH)) {
        els.booksList.appendChild(buildBookSearchCard(book, cache));
      }
      offset += BATCH;
      if (offset < books.length) requestAnimationFrame(renderNext);
    };
    requestAnimationFrame(renderNext);
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
        const haystack = [book?.title || "", book?.author || "", s.note || ""].join(" ").toLowerCase();
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
    els.timeline.textContent = searchRaw ? "没有匹配的阅读记录。" : "还没有阅读会话，点左上角加号记录一次。";
    return;
  }

  els.timeline.className = "timeline";
  els.timeline.innerHTML = "";
  sessions.forEach((session) => {
    const book = state.books.find((item) => item.id === session.bookId);
    const article = document.createElement("article");
    article.className = "session-grid-card";
    article.dataset.sessionId = session.id;
    article.innerHTML = `
      <button class="card-menu-btn" type="button" aria-label="操作菜单" aria-expanded="false">⋯</button>
      <ul class="card-context-menu" hidden>
        <li><button type="button" data-session-menu="edit">编辑</button></li>
        <li class="menu-item-danger"><button type="button" data-session-menu="delete">删除</button></li>
      </ul>
      <div class="session-card-ribbon">
        <div>
          <span class="session-ribbon-label">本次阅读</span>
          <strong>${session.startPage}–${session.endPage} 页</strong>
        </div>
        <span class="session-ribbon-duration">${session.minutes} 分钟</span>
      </div>
      <div class="entry-card-body">
        <h3>${book ? formatBookTitle(book.title) : "未知书籍"}</h3>
        <p class="entry-card-meta">📅 ${formatDate(session.date)}</p>
        <p class="entry-card-note entry-card-note-clamp">${escapeHtml(session.note || "无笔记")}</p>
      </div>`;
    const menuBtn = article.querySelector(".card-menu-btn");
    menuBtn?.addEventListener("click", (e) => { e.stopPropagation(); toggleCardMenu(menuBtn); });
    article.querySelector(".card-context-menu")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-session-menu]");
      if (!btn) return;
      e.stopPropagation();
      closeAllCardMenus();
      if (btn.dataset.sessionMenu === "edit") editSession(session.id);
      else if (btn.dataset.sessionMenu === "delete") deleteSession(session.id);
    });
    article.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      closeAllCardMenus();
      openSessionDetail(session.id);
    });
    els.timeline.appendChild(article);
  });
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
    .filter(isRegularQuote)
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
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  if (!quotes.length) {
    els.quotesList.className = "quote-list empty-state";
    els.quotesList.textContent = "还没有摘抄卡片，点左上角加号新增一张。";
    return;
  }

  els.quotesList.className = "quote-list";
  els.quotesList.innerHTML = quotes
    .map((quote) => {
      const book = state.books.find((item) => item.id === quote.bookId);
      const ocrStatus = String(quote.ocrStatus || "").trim();
      const ocrBadge = ocrStatus
        ? `<span class="quote-ocr-badge quote-ocr-badge--${escapeHtml(ocrStatus)}">${escapeHtml(ocrStatusMap[ocrStatus] || ocrStatus)}</span>`
        : "";
      const quoteContent = quote.content || quote.ocrText ||
        (ocrStatus === "pending" && isStalePendingOcr(quote)
          ? "识别任务可能已中断，请编辑后重新点击识别。"
          : ocrStatus === "pending"
          ? "图片文字识别中，稍后回来继续编辑。"
          : (ocrStatus === "failed" ? (quote.ocrError || "识别失败，可重新编辑或重试。") : ""));
      return `
        <article class="quote-grid-card" data-quote-id="${escapeHtml(quote.id)}">
          <button class="card-menu-btn" type="button" aria-label="操作菜单" aria-expanded="false" data-card-menu-toggle>⋯</button>
          <ul class="card-context-menu" hidden>
            <li><button type="button" data-quote-menu="chat">去聊</button></li>
            <li><button type="button" data-quote-menu="connect">关联</button></li>
            <li><button type="button" data-quote-menu="edit">编辑</button></li>
            <li><button type="button" data-quote-menu="share">生成分享图</button></li>
            <li class="menu-item-danger"><button type="button" data-quote-menu="delete">删除</button></li>
          </ul>
          <div class="entry-card-cover">
            ${quote.imageUrl
              ? `<img src="${resolveImageUrl(quote.imageUrl)}" loading="lazy" decoding="async" alt="摘抄图片" />`
              : '<div class="entry-cover-fallback"></div>'}
            <span class="entry-type-chip entry-type-chip-overlay">${escapeHtml(quoteKindMap[quote.kind] || "卡片")}</span>
          </div>
          <div class="entry-card-body">
            <h3>${book ? formatBookTitle(book.title) : "未知书籍"}${ocrBadge}</h3>
            <p class="entry-card-meta">第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}</p>
            <p class="entry-card-note entry-card-note-clamp">${escapeHtml(quoteContent)}</p>
            <p class="entry-card-tags">${quote.tags?.length ? escapeHtml(quote.tags.join(" / ")) : "无标签"}${getConnectionCount(quote.id) > 0 ? ` <span class="quote-conn-badge">🔗 ${getConnectionCount(quote.id)}</span>` : ""}${getQuoteChatCount(quote.id) > 0 ? ` <span class="quote-conn-badge">💬 ${getQuoteChatCount(quote.id)}</span>` : ""}</p>
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

function syncOpenQuoteFormFromState() {
  if (!els.quoteDialog?.open) return;
  const quoteId = String(els.quoteForm.querySelector('[name="id"]')?.value || "").trim();
  if (!quoteId) return;
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote) return;

  const remoteTags = Array.isArray(quote.tags) ? quote.tags : [];
  if (remoteTags.length) {
    const mergedTags = [...new Set([...selectedQuoteTags, ...remoteTags])];
    if (mergedTags.length !== selectedQuoteTags.length) {
      renderQuoteTagPicker(mergedTags);
    }
  }

  if (quote.ocrStatus === "done") {
    const contentEl = els.quoteContent;
    const recognizedText = quote.content || quote.ocrText || "";
    const ocrBaseContent = normalizeOcrText(els.quoteForm.dataset.ocrBaseContent || "");
    const currentContent = normalizeOcrText(contentEl.value);
    if (recognizedText && (!currentContent || (ocrBaseContent && currentContent === ocrBaseContent))) {
      contentEl.value = recognizedText;
      renderOcrLineSelector(recognizedText);
    }
    delete els.quoteForm.dataset.ocrBaseContent;
    delete els.quoteForm.dataset.ocrQuoteId;
    els.ocrStatus.textContent = remoteTags.length
      ? "识别完成，原文和标签已自动填入。"
      : "识别完成，原文已自动填入。";
  } else if (quote.ocrStatus === "failed") {
    delete els.quoteForm.dataset.ocrBaseContent;
    delete els.quoteForm.dataset.ocrQuoteId;
    els.ocrStatus.textContent = quote.ocrError || "识别失败，可稍后重试。";
  }
}

function renderImagePreview() {
  const src = pendingQuoteImage?.objectUrl || pendingQuoteImage?.dataUrl || resolveImageUrl(pendingQuoteImage?.savedUrl || "");
  if (!src) {
    els.quoteImagePreview.classList.add("is-hidden");
    if (els.quotePreviewImg) els.quotePreviewImg.removeAttribute("src");
    return;
  }
  // iOS Safari caches Live Text recognition per DOM element, not per src.
  // Replacing the <img> node entirely gives iOS a fresh element with no cached state.
  const newImg = document.createElement("img");
  newImg.id = "quotePreviewImg";
  newImg.alt = "摘抄图片预览";
  newImg.onload = () =>
    els.quoteImagePreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  newImg.src = src;
  els.quotePreviewImg.replaceWith(newImg);
  els.quotePreviewImg = newImg;
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

const SAMPLE_COLLECTIONS = ["books", "quotes", "connections", "sessions"];

function hasSampleData() {
  return SAMPLE_COLLECTIONS.some((k) => (state[k] || []).some((it) => it && it.isSample));
}

function renderSampleBanner() {
  if (!els.sampleBanner) return;
  // 探讨(chat)tab 用固定高度布局，横幅在其上方会把输入框顶出屏幕 → 该 tab 不显示横幅。
  const onChatTab = document
    .querySelector('.layout [data-tab-section="chat"]')
    ?.classList.contains("tab-active");
  els.sampleBanner.hidden = onChatTab || !(currentUser?.id && hasSampleData());
}

// 一键清除示例:剔除所有 isSample 条目并同步。
async function clearSampleData() {
  if (!currentUser?.id) return;
  for (const k of SAMPLE_COLLECTIONS) {
    state[k] = (state[k] || []).filter((it) => !(it && it.isSample));
  }
  try {
    await syncState();
  } catch (error) {
    showToast(`清除失败：${error.message}`);
    return;
  }
  render();
  window.dispatchEvent(new CustomEvent("paper-reading-data-changed"));
  showToast("示例已清除");
}

// 载入示例(供已清空的用户重新体验):从后端拉取示例并按 id 去重合并。
async function loadSampleData() {
  if (!requireAuth("载入示例")) return;
  let sample;
  try {
    const data = await apiFetch("/api/sample-state", {}, false);
    sample = data.sample || {};
  } catch (error) {
    showToast(`载入失败：${error.message}`);
    return;
  }
  for (const k of SAMPLE_COLLECTIONS) {
    const existing = new Set((state[k] || []).map((it) => it.id));
    state[k] = (state[k] || []).concat((sample[k] || []).filter((it) => !existing.has(it.id)));
  }
  try {
    await syncState();
  } catch (error) {
    showToast(`保存失败：${error.message}`);
    return;
  }
  render();
  window.dispatchEvent(new CustomEvent("paper-reading-data-changed"));
  showToast("已载入示例，随时可清除");
}

function render() {
  renderHero();
  renderSampleBanner();
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
  syncOpenQuoteFormFromState();
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
  renderSampleBanner(); // 切 tab 后按当前 tab(尤其 chat)更新横幅可见性
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
  // 登录响应已内联返回整个 state，拿到即可立刻渲染进入 App。
  state = normalizeStateShape(payload.state);
  render();
  dispatchUserChange();
  closeMeDrawer();
  // 模型日志仅供「我的 → 调试日志」面板，与登录无关且要多一次隧道往返，
  // 后台异步加载，绝不阻塞「登录中…」的解除（否则登录要白等一次日志请求）。
  loadRemoteLogs().catch(() => {});
}

async function handleRegister(formData) {
  const username = String(formData.get("username")).trim();
  const password = String(formData.get("password")).trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const termsAccepted = formData.get("termsAccepted") === "on";
  if (username.length < 2) {
    showToast("用户名至少 2 位");
    return;
  }
  if (password.length < 4) {
    showToast("密码至少 4 位");
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("邮箱格式不正确");
    return;
  }
  if (!termsAccepted) {
    showToast("请先阅读并同意《用户协议》和《隐私政策》");
    return;
  }
  try {
    const payload = await apiFetch(
      "/api/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email, termsAccepted }),
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

async function handleForgotPassword(formData) {
  const identifier = String(formData.get("identifier") || "").trim();
  if (!identifier) {
    showToast("请输入邮箱或用户名");
    return;
  }
  try {
    const result = await apiFetch(
      "/api/password/reset-request",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      },
      false
    );
    els.forgotPasswordForm.reset();
    els.forgotPasswordDialog.close();
    showToast(result?.message || "如果该账号存在，重置邮件已发送");
  } catch (error) {
    showToast(error.message);
  }
}

async function handlePasswordReset(formData) {
  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "").trim();
  if (!token) {
    showToast("缺少重置 token");
    return;
  }
  if (password.length < 4) {
    showToast("密码至少 4 位");
    return;
  }
  try {
    const result = await apiFetch(
      "/api/password/reset",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      },
      false
    );
    els.resetPasswordForm.reset();
    els.resetPasswordDialog.close();
    // Clear hash so refresh doesn't re-open the dialog
    if (typeof location !== "undefined" && location.hash.startsWith("#reset-password=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    showToast(result?.message || "密码已更新，请重新登录");
  } catch (error) {
    showToast(error.message);
  }
}

function maybeOpenResetPasswordDialog() {
  if (typeof location === "undefined") return;
  const m = location.hash.match(/^#reset-password=([\w\-_.]+)$/);
  if (!m) return;
  if (!els.resetPasswordDialog) return;
  els.resetPasswordToken.value = m[1];
  els.resetPasswordDialog.showModal();
}

function switchAuthTab(tabName) {
  // tabName: "login" or "register"
  document.querySelectorAll(".auth-tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.authTab === tabName);
  });
  const targetId = `authTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
  document.querySelectorAll(".auth-form-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function maybeHandleSignupIntent() {
  // Landing deep-links: /app#signup → open auth drawer on register tab;
  // /app#login → open auth drawer on login tab. Either way the user lands
  // on the form they expected instead of the empty book list.
  if (typeof location === "undefined") return;
  let targetTab = null;
  if (location.hash === "#signup") targetTab = "register";
  else if (location.hash === "#login") targetTab = "login";
  if (!targetTab) return;
  if (currentUser) return;  // already signed in — no point
  openMeDrawer();
  switchAuthTab(targetTab);
  if (typeof history !== "undefined") {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function maybeShowPlusReturnToast() {
  if (typeof location === "undefined") return;
  if (location.hash.startsWith("#plus-success")) {
    showToast?.("订阅生效中，刷新片刻即可看到 Plus 标识 ✨");
    if (typeof history !== "undefined") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  } else if (location.hash === "#plus-canceled") {
    showToast?.("已取消支付，欢迎随时回来 ✨");
    if (typeof history !== "undefined") {
      history.replaceState(null, "", location.pathname + location.search);
    }
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
  state = normalizeStateShape(initialState);
  remoteLogs = [];
  render();
  dispatchUserChange();
  activateTab("me");
}

function logoutAllDevices() {
  if (!authToken) return;
  showConfirmDialog({
    message: "退出所有设备后需要重新登录所有客户端。确定继续吗？",
    confirmLabel: "全部退出",
    onConfirm: async () => {
      try {
        const result = await apiFetch("/api/logout-all", { method: "POST" }, true);
        showToast(`已撤销 ${result?.revoked ?? 0} 个会话`);
      } catch (error) {
        showToast(error.message);
        return;
      }
      setAuthToken("");
      currentUser = null;
      state = normalizeStateShape(initialState);
      remoteLogs = [];
      render();
      dispatchUserChange();
      activateTab("me");
    },
  });
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

async function uploadQuoteImage(image) {
  if (!image) return "";
  if (image.savedUrl && !image.dataUrl && !image.compressionPromise) return image.savedUrl;
  let dataUrl = image.dataUrl || "";
  if (!dataUrl && image.compressionPromise) {
    dataUrl = await image.compressionPromise;
  }
  if (!dataUrl) return "";
  const payload = await apiFetch(
    "/api/upload-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        filename: image.name,
      }),
    },
    true
  );
  return payload.url || "";
}

async function uploadBookCoverImage(image) {
  if (!image) return "";
  let dataUrl = image.dataUrl || "";
  if (!dataUrl && image.compressionPromise) {
    dataUrl = await image.compressionPromise;
  }
  if (!dataUrl) return "";
  const payload = await apiFetch(
    "/api/upload-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        filename: image.name,
      }),
    },
    true
  );
  return payload.url || "";
}

async function uploadBookImageIfNeeded() {
  return uploadBookCoverImage(pendingBookImage);
}

// 把面板里保留的行拼回正文：去掉物理换行，拼成连续段落（中文句子无空格直接相连，
// 句末标点自然断句）。空行（用户清空但未删除的行）自然被丢弃。
function rebuildQuoteContentFromOcrPanel(sel) {
  const parts = Array.from(sel.querySelectorAll(".ocr-line-selector__input"))
    .map((el) => el.value.trim())
    .filter(Boolean);
  if (els.quoteContent) els.quoteContent.value = parts.join("");
}

// 让 OCR 行的 textarea 随内容高度自适应：先归零再按 scrollHeight 撑开。
function autoGrowOcrInput(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderOcrLineSelector(text) {
  const sel = els.ocrLineSelector;
  if (!sel) return;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) {
    sel.hidden = true;
    sel.innerHTML = "";
    sel.onclick = null;
    sel.oninput = null;
    return;
  }
  sel.hidden = false;
  const header = `<p class="ocr-line-selector__hint">整页全文已识别 ${lines.length} 行——可直接改行内文字，或点 ✕ 删去整行；保留的行会拼成连续段落：</p>`;
  const items = lines
    .map(
      (line, i) =>
        `<div class="ocr-line-selector__row" data-line-idx="${i}"><textarea class="ocr-line-selector__input" rows="1" aria-label="第 ${i + 1} 行内容">${escapeHtml(line)}</textarea><button type="button" class="ocr-line-selector__del" aria-label="删除此行">✕</button></div>`
    )
    .join("");
  sel.innerHTML = header + items;
  // textarea 单行起步，按内容撑高——长行不再被裁，整句可见可编辑。
  sel.querySelectorAll(".ocr-line-selector__input").forEach(autoGrowOcrInput);
  // 初始就把正文拼成连续段落（去物理换行），不再让识别结果带满硬换行符。
  rebuildQuoteContentFromOcrPanel(sel);
  // 行内编辑：任意一行改动即实时同步正文，并随内容增减重新撑高。
  sel.oninput = (e) => {
    if (!e.target?.classList?.contains?.("ocr-line-selector__input")) return;
    autoGrowOcrInput(e.target);
    rebuildQuoteContentFromOcrPanel(sel);
  };
  sel.onclick = (e) => {
    const btn = e.target.closest(".ocr-line-selector__del");
    if (!btn) return;
    const row = btn.closest(".ocr-line-selector__row");
    if (row) row.remove();
    rebuildQuoteContentFromOcrPanel(sel);
    const remaining = sel.querySelectorAll(".ocr-line-selector__row").length;
    const hint = sel.querySelector(".ocr-line-selector__hint");
    if (hint) hint.textContent = `已保留 ${remaining} 行（拼成连续段落，可继续编辑或删除）：`;
    if (remaining === 0) {
      sel.hidden = true;
      sel.innerHTML = "";
      sel.onclick = null;
      sel.oninput = null;
    }
  };
}

// 摘抄对话框未保存就关闭时，丢弃 OCR 临时创建但未确认的卡片（issue: 拍照→识别→取消
// 后卡片仍残留）。state.quotes 的移除是同步的；syncState 异步落库后刷新视图。
function discardProvisionalOcrQuote() {
  const orphan = ocrProvisionalQuoteId;
  ocrProvisionalQuoteId = "";
  if (!orphan || !state.quotes.some((q) => q.id === orphan)) return;
  state.quotes = state.quotes.filter((q) => q.id !== orphan);
  state.connections = (state.connections || []).filter(
    (c) => c.sourceId !== orphan && c.targetId !== orphan
  );
  syncState()
    .then(() => { renderHero(); renderSummary(); renderQuotes(); })
    .catch(() => {});
}

function hideOcrLineSelector() {
  if (!els.ocrLineSelector) return;
  els.ocrLineSelector.hidden = true;
  els.ocrLineSelector.innerHTML = "";
  els.ocrLineSelector.onclick = null;
  els.ocrLineSelector.oninput = null;
}

function resetQuoteDraft() {
  if (pendingQuoteImage?.objectUrl) URL.revokeObjectURL(pendingQuoteImage.objectUrl);
  pendingQuoteImage = null;
  els.quoteForm.reset();
  delete els.quoteForm.dataset.ocrBaseContent;
  delete els.quoteForm.dataset.ocrQuoteId;
  document.querySelector("#quoteBookCombobox")?._comboboxReset?.();
  renderImagePreview();
  renderQuoteTagPicker([]);
  hideOcrLineSelector();
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

  const title = normalizeBookTitle(formData.get("title"));
  const author = String(formData.get("author")).trim();
  if (findDuplicateBook(title, author)) {
    showToast("书单里已存在这本书");
    return;
  }

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
      title,
      author,
      totalPages,
      currentPage,
      status: String(formData.get("status")),
      tags: normalizeTags(formData.get("tags")),
      notes: String(formData.get("notes")).trim(),
      review: String(formData.get("review") || "").trim(),
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
  if (dateValue && dateValue > todayLocalDateInput()) {
    showToast("日期不能晚于今天");
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
    // bug-346: never auto-derive a start date that lands after a known finish date
    // (e.g. a session/edit on a book imported as 已读完 with an earlier finishedAt).
    if (!book.startedAt && !(book.finishedAt && date > book.finishedAt)) book.startedAt = date;
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
      delete state.chatHistories[`book:${bookId}`];
    }
    if (state.chatContexts && typeof state.chatContexts === "object") {
      delete state.chatContexts[bookId];
      delete state.chatContexts[`book:${bookId}`];
      Object.entries(state.chatContexts).forEach(([key, context]) => {
        if (context?.bookId === bookId) {
          delete state.chatContexts[key];
          delete state.chatHistories[key];
        }
      });
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
    els.deleteBookDialog.removeEventListener("cancel", cleanup);
  }

  els.deleteBookConfirmBtn.addEventListener("click", onConfirm, { once: true });
  els.deleteBookCancelBtn.addEventListener("click", onCancel, { once: true });
  els.deleteBookDialog.addEventListener("cancel", cleanup, { once: true });
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
  const ocrStatus = String(quote.ocrStatus || "").trim();
  const ocrText = ocrStatus ? ` · ${ocrStatusMap[ocrStatus] || ocrStatus}` : "";
  document.getElementById("quoteDetailMeta").textContent =
    `${quoteKindMap[quote.kind] || "摘抄"} · 第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}${ocrText}`;

  const imgWrap = document.getElementById("quoteDetailImage");
  const img = document.getElementById("quoteDetailImg");
  if (quote.imageUrl) {
    img.src = resolveImageUrl(quote.imageUrl);
    imgWrap.classList.remove("is-hidden");
  } else {
    imgWrap.classList.add("is-hidden");
    img.removeAttribute("src");
  }

  document.getElementById("quoteDetailContent").textContent =
    quote.content || quote.ocrText ||
    (ocrStatus === "pending" && isStalePendingOcr(quote)
      ? "识别任务可能已中断，请编辑后重新点击识别。"
      : ocrStatus === "pending"
      ? "图片文字识别中，稍后回来继续编辑。"
      : (ocrStatus === "failed" ? (quote.ocrError || "识别失败，可重新编辑或重试。") : ""));

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

  const chatCount = getQuoteChatCount(quoteId);
  if (els.quoteDetailChatBtn) {
    els.quoteDetailChatBtn.textContent = chatCount > 0 ? `继续探讨（${chatCount} 条）` : "去聊";
  }

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
      return `<div class="conn-mini-card conn-mini-nav" data-nav-type="${escapeHtml(otherType)}" data-nav-id="${escapeHtml(otherId)}">
        <div class="conn-mini-header">
          <span class="conn-mini-kind" data-kind="${escapeHtml(c.kind)}">${escapeHtml(c.kind)}</span>
        </div>
        <div class="conn-mini-text">↔ ${escapeHtml(other.label)}</div>
        ${other.sub ? `<div class="connection-side-sub">${escapeHtml(other.sub)}</div>` : ""}
        ${c.thought ? `<div class="conn-mini-thought">${escapeHtml(c.thought)}</div>` : ""}
      </div>`;
    }).join("");
    connWrap.classList.remove("is-hidden");
  } else if (connWrap) {
    connWrap.classList.add("is-hidden");
  }

  quoteDetailDlg.showModal();
}

function goToQuoteChat(quoteId) {
  if (!requireAuth("使用探讨功能")) return;
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  document.getElementById("quoteDetailDialog")?.close();
  activateTab("chat");
  window.paperReadingApp?.switchChatToQuote?.(quote.bookId, quote.id);
}

// ===== OPT-087 分享图（摘抄卡 / 思想碰撞卡 / 书卡）=====
// 品牌参照物料（~/Downloads/又买了一本书-分享物料/）：米白底 + 品牌绿 + 衬线大字 +
// 底部 slogan/二维码。三版式共用 header/footer/divider/tags 助手。纯 Canvas，零依赖、离线可用。
const SHARE_CARD = {
  W: 1080, PAD: 84,
  bg: "#f5f0e8", ink: "#3d4a3f", inkSoft: "#5a6a5d", inkMuted: "#8a948a",
  accent: "#c9a85a", pillBg: "#e7ecdf",
  brand: "又买了一本书",
  serif: '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif',
  sans: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
};

function loadImageForShare(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 资源缺失时降级，不阻断出图
    img.src = src;
  });
}

// 中文排版避头尾（禁则处理）：
// 行首禁则——这些标点不能出现在行首，出现则「悬挂」到上一行末尾（宽容超出，落在页边距内）。
const KINSOKU_NO_START = "，。、；：？！）］｝〉》」』】…—·、％‰℃”’》。，！？：；";
// 行尾禁则——这些开引号/开括号不能出现在行尾，出现则连同下一字符换到下一行。
const KINSOKU_NO_END = "（［｛〈《「『【“‘《(";

// 按最大宽度把 text 折成多行（CJK 无空格，逐字测量），并做避头尾。
function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of String(text || "")) {
    if (ch === "\n") { lines.push(line); line = ""; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      if (KINSOKU_NO_START.includes(ch)) {
        line = test; // 行首禁则：标点悬挂在当前行末尾，不另起一行
      } else {
        // 行尾禁则：若当前行末是开引号/括号，把它一起带到下一行
        let carried = "";
        if (KINSOKU_NO_END.includes(line[line.length - 1])) {
          carried = line[line.length - 1];
          line = line.slice(0, -1);
        }
        lines.push(line);
        line = carried + ch;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// 分享图是海报不是文档：超长正文截断到 max 字并加省略号，避免生成一张要滚动半天的巨图。
function truncateForShare(text, max) {
  const s = String(text || "").trim();
  return s.length > max ? s.slice(0, max).replace(/\s+$/, "") + "…" : s;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 三版式共用：加载品牌资源、建 canvas + 铺底、画 header。
async function loadShareAssets() {
  const [qr, logo] = await Promise.all([
    loadImageForShare("/assets/brand/qr-readjot.png"),
    loadImageForShare("/assets/brand/logo-b-stack.svg"),
  ]);
  return { qr, logo };
}

function newShareCanvas(C, height) {
  const canvas = document.createElement("canvas");
  canvas.width = C.W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, C.W, height);
  return { canvas, ctx };
}

function drawShareHeader(ctx, C, logo) {
  const y = C.PAD;
  if (logo) {
    ctx.drawImage(logo, C.PAD, y, 64, 64);
  } else {
    ctx.fillStyle = C.ink;
    roundRectPath(ctx, C.PAD, y, 64, 64, 14);
    ctx.fill();
  }
  ctx.fillStyle = C.ink;
  ctx.font = `600 40px ${C.sans}`;
  ctx.fillText(C.brand, C.PAD + 84, y + 44);
  return y + 64; // header 底部 y
}

function drawShareDivider(ctx, C, y) {
  ctx.strokeStyle = "rgba(61,74,63,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(C.PAD, y);
  ctx.lineTo(C.W - C.PAD, y);
  ctx.stroke();
}

function drawShareFooter(ctx, C, qr, footerTop, slogan, sub) {
  const qrSize = 176;
  if (qr) ctx.drawImage(qr, C.W - C.PAD - qrSize, footerTop, qrSize, qrSize);
  ctx.fillStyle = C.ink;
  ctx.font = `700 34px ${C.sans}`;
  ctx.fillText(slogan, C.PAD, footerTop + 46);
  ctx.fillStyle = C.inkMuted;
  ctx.font = `26px ${C.sans}`;
  ctx.fillText(sub, C.PAD, footerTop + 92);
}

// 一个胶囊标签；返回其宽度。
function drawSharePill(ctx, x, y, text, { font, fg, bg, padX = 24, h = 52, radius = 26 }) {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

// 标签行（# tag 胶囊，自动换行）。draw=false 时只测量高度不绘制。返回结束 y。
function layoutShareTags(ctx, C, tags, startY, draw) {
  if (!tags || !tags.length) return startY;
  const h = 48, gap = 16, rowGap = 14;
  ctx.font = `26px ${C.sans}`;
  let x = C.PAD, y = startY;
  for (const t of tags) {
    const label = `# ${t}`;
    const w = ctx.measureText(label).width + 40;
    if (x + w > C.W - C.PAD && x > C.PAD) { x = C.PAD; y += h + rowGap; }
    if (draw) {
      ctx.fillStyle = "rgba(61,74,63,0.06)";
      roundRectPath(ctx, x, y, w, h, 12);
      ctx.fill();
      ctx.fillStyle = C.inkSoft;
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 20, y + h / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }
    x += w + gap;
  }
  return y + h;
}

async function renderQuoteShareCard(quote, book) {
  const C = SHARE_CARD;
  const contentW = C.W - C.PAD * 2;
  const { qr, logo } = await loadShareAssets();

  const body = truncateForShare(quote.content || quote.ocrText || "", 240);
  const title = book?.title ? `《${book.title.replace(/[《》]/g, "")}》` : "";
  const reflection = truncateForShare(quote.reflection || "", 90);

  const measure = document.createElement("canvas").getContext("2d");
  const bodyLH = 74;
  measure.font = `44px ${C.serif}`;
  const bodyLines = wrapCanvasText(measure, body, contentW);
  measure.font = `30px ${C.sans}`;
  const reflLines = reflection ? wrapCanvasText(measure, `批注 · ${reflection}`, contentW) : [];

  let y = C.PAD + 64 + 64 + 96;         // header + 间距 + 装饰引号
  y += bodyLines.length * bodyLH + 52;  // 正文 + 间距
  y += 46;                              // 出处
  if (reflLines.length) y += 16 + reflLines.length * 44;
  y += 80;
  const dividerY = y;
  const footerTop = dividerY + 56;
  const height = footerTop + 150 + C.PAD;

  const { canvas, ctx } = newShareCanvas(C, height);
  let cy = drawShareHeader(ctx, C, logo) + 64;

  ctx.fillStyle = "rgba(61,74,63,0.20)";
  ctx.font = `italic 700 150px ${C.serif}`;
  ctx.fillText("“", C.PAD - 6, cy + 60);
  cy += 96;

  ctx.fillStyle = C.ink;
  ctx.font = `44px ${C.serif}`;
  for (const ln of bodyLines) { ctx.fillText(ln, C.PAD, cy + 44); cy += bodyLH; }
  cy += 52;

  if (title) {
    ctx.fillStyle = C.inkSoft;
    ctx.font = `700 36px ${C.sans}`;
    ctx.fillText(`—— ${title}`, C.PAD, cy);
  }
  cy += 46;

  if (reflLines.length) {
    cy += 16;
    ctx.fillStyle = C.inkMuted;
    ctx.font = `30px ${C.sans}`;
    for (const ln of reflLines) { ctx.fillText(ln, C.PAD, cy + 30); cy += 44; }
  }

  drawShareDivider(ctx, C, dividerY);
  drawShareFooter(ctx, C, qr, footerTop, "买书容易，读完才算。", "扫码，记录你自己的阅读");
  return canvas.toDataURL("image/png");
}

async function renderConnectionShareCard(conn) {
  const C = SHARE_CARD;
  const contentW = C.W - C.PAD * 2;
  const { qr, logo } = await loadShareAssets();

  const src = resolveConnectionSide(conn.sourceType, conn.sourceId);
  const tgt = resolveConnectionSide(conn.targetType, conn.targetId);
  const kindLabel = KIND_LABELS[conn.kind] || conn.kind || "关联";
  const thought = truncateForShare(conn.thought || "", 220);
  const tags = conn.tags || [];

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `700 44px ${C.serif}`;
  const srcLines = wrapCanvasText(measure, src.label, contentW);
  const tgtLines = wrapCanvasText(measure, tgt.label, contentW);
  measure.font = `40px ${C.serif}`;
  const thoughtLH = 62;
  const thoughtLines = thought ? wrapCanvasText(measure, thought, contentW) : [];
  const tagsBlock = layoutShareTags(measure, C, tags, 0, false); // 0 起算的标签块高度

  let y = C.PAD + 64 + 56;                         // header + 间距
  y += 60 + 40;                                    // kind 胶囊 + 间距
  const sidesTop = y;
  y += srcLines.length * 54 + (src.sub ? 36 : 0);
  y += 54;                                         // 箭头行
  y += tgtLines.length * 54 + (tgt.sub ? 36 : 0);
  y += 44;
  const dividerY1 = y; y += 52;
  y += thoughtLines.length * thoughtLH;
  if (tags.length) y += 20 + tagsBlock;
  y += 70;
  const dividerY2 = y;
  const footerTop = dividerY2 + 56;
  const height = footerTop + 150 + C.PAD;

  const { canvas, ctx } = newShareCanvas(C, height);
  drawShareHeader(ctx, C, logo);

  // 顶部偏右的装饰圆（发现感）
  ctx.fillStyle = "rgba(61,74,63,0.06)";
  ctx.beginPath();
  ctx.arc(C.W - 30, 40, 190, 0, Math.PI * 2);
  ctx.fill();

  let cy = C.PAD + 64 + 56;
  // kind 胶囊
  drawSharePill(ctx, C.PAD, cy, `◎ 思想碰撞 · ${kindLabel}`,
    { font: `700 30px ${C.sans}`, fg: C.ink, bg: C.pillBg, h: 60, radius: 30 });
  cy += 60 + 40;

  // 两侧（纵向堆叠，长标题也不溢出）
  ctx.fillStyle = C.ink;
  ctx.font = `700 44px ${C.serif}`;
  for (const ln of srcLines) { ctx.fillText(ln, C.PAD, cy + 44); cy += 54; }
  if (src.sub) { ctx.fillStyle = C.inkMuted; ctx.font = `26px ${C.sans}`; ctx.fillText(src.sub, C.PAD, cy + 26); cy += 36; }
  ctx.fillStyle = C.accent;
  ctx.font = `700 34px ${C.sans}`;
  ctx.fillText("↓", C.PAD + 4, cy + 34); cy += 54;
  ctx.fillStyle = C.ink;
  ctx.font = `700 44px ${C.serif}`;
  for (const ln of tgtLines) { ctx.fillText(ln, C.PAD, cy + 44); cy += 54; }
  if (tgt.sub) { ctx.fillStyle = C.inkMuted; ctx.font = `26px ${C.sans}`; ctx.fillText(tgt.sub, C.PAD, cy + 26); cy += 36; }
  cy += 44;

  drawShareDivider(ctx, C, dividerY1);
  cy = dividerY1 + 52;
  ctx.fillStyle = C.ink;
  ctx.font = `40px ${C.serif}`;
  for (const ln of thoughtLines) { ctx.fillText(ln, C.PAD, cy + 40); cy += thoughtLH; }
  if (tags.length) { cy += 20; layoutShareTags(ctx, C, tags, cy, true); }

  drawShareDivider(ctx, C, dividerY2);
  drawShareFooter(ctx, C, qr, footerTop, "发现你书架上的暗线", "扫码，让 AI 帮你连起来");
  return canvas.toDataURL("image/png");
}

function readingDaysLabel(book) {
  const s = Date.parse(book?.startedAt || ""), f = Date.parse(book?.finishedAt || "");
  if (!s || !f || f < s) return "";
  return `${Math.max(1, Math.round((f - s) / 86400000))} 天读完`;
}

async function renderBookShareCard(book) {
  const C = SHARE_CARD;
  const [{ qr, logo }, cover] = await Promise.all([
    loadShareAssets(),
    book.coverImageUrl ? loadImageForShare(resolveImageUrl(book.coverImageUrl)) : Promise.resolve(null),
  ]);

  const title = `《${(book.title || "").replace(/[《》]/g, "")}》`;
  const author = book.author || "";
  // 有读后感优先展示读后感，否则回落内容简介；标签随内容语义变化。
  const review = (book.review || "").trim();
  const notesLabel = review ? "我的读后" : "内容简介";
  const notes = truncateForShare(review || book.notes || "", 150);
  const tags = book.tags || [];
  const statusLabel = statusMap[book.status] || book.status || "";
  const pills = [];
  if (statusLabel) pills.push((book.status === "finished" ? "✓ " : "") + statusLabel);
  if (book.totalPages) pills.push(`${book.totalPages} 页`);
  const days = readingDaysLabel(book);
  if (days) pills.push(days);

  const coverW = 300, coverH = 400, gap = 44;
  const hasCover = !!cover;
  const infoX = C.PAD + (hasCover ? coverW + gap : 0);
  const infoW = C.W - C.PAD - infoX;

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `700 52px ${C.serif}`;
  const titleLines = wrapCanvasText(measure, title, infoW);
  const tagsLine = tags.length ? tags.join(" · ") : "";
  const notesLH = 60;
  measure.font = `44px ${C.serif}`;
  const notesLines = notes ? wrapCanvasText(measure, notes, contentWFor(C, 48)) : [];

  const headerBottom = C.PAD + 64 + 56;
  // 右信息列高度
  let infoH = titleLines.length * 64 + 12;
  if (author) infoH += 48;
  if (pills.length) infoH += 68;
  if (tagsLine) infoH += 40;
  const topBlockH = Math.max(hasCover ? coverH : 0, infoH);

  let y = headerBottom + topBlockH + 56;
  let notesBoxTop = 0, notesBoxH = 0;
  if (notesLines.length) {
    notesBoxTop = y;
    notesBoxH = 40 + 40 + notesLines.length * notesLH + 40; // 上内边距+标签+正文+下内边距
    y += notesBoxH + 70;
  }
  const dividerY = y;
  const footerTop = dividerY + 56;
  const height = footerTop + 150 + C.PAD;

  const { canvas, ctx } = newShareCanvas(C, height);
  drawShareHeader(ctx, C, logo);

  const blockTop = headerBottom;
  if (hasCover) {
    ctx.save();
    roundRectPath(ctx, C.PAD, blockTop, coverW, coverH, 16);
    ctx.clip();
    ctx.drawImage(cover, C.PAD, blockTop, coverW, coverH);
    ctx.restore();
  }

  let iy = blockTop + 8;
  ctx.fillStyle = C.ink;
  ctx.font = `700 52px ${C.serif}`;
  for (const ln of titleLines) { ctx.fillText(ln, infoX, iy + 52); iy += 64; }
  iy += 12;
  if (author) {
    ctx.fillStyle = C.inkSoft;
    ctx.font = `34px ${C.sans}`;
    ctx.fillText(author, infoX, iy + 34); iy += 48;
  }
  if (pills.length) {
    let px = infoX;
    for (const p of pills) {
      const w = drawSharePill(ctx, px, iy, p, { font: `600 28px ${C.sans}`, fg: C.ink, bg: C.pillBg, h: 56, radius: 28 });
      px += w + 16;
    }
    iy += 68;
  }
  if (tagsLine) {
    ctx.fillStyle = C.inkMuted;
    ctx.font = `28px ${C.sans}`;
    ctx.fillText(tagsLine, infoX, iy + 28); iy += 40;
  }

  if (notesLines.length) {
    // 读后卡：左绿边 + 浅底
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, C.PAD, notesBoxTop, C.W - C.PAD * 2, notesBoxH, 18);
    ctx.fill();
    ctx.fillStyle = C.ink;
    roundRectPath(ctx, C.PAD, notesBoxTop, 8, notesBoxH, 4);
    ctx.fill();
    let ny = notesBoxTop + 40;
    ctx.fillStyle = C.inkSoft;
    ctx.font = `700 28px ${C.sans}`;
    ctx.fillText(notesLabel, C.PAD + 48, ny + 28); ny += 40 + 12;
    ctx.fillStyle = C.ink;
    ctx.font = `44px ${C.serif}`;
    for (const ln of notesLines) { ctx.fillText(ln, C.PAD + 48, ny + 44); ny += notesLH; }
  }

  drawShareDivider(ctx, C, dividerY);
  drawShareFooter(ctx, C, qr, footerTop, "买书容易，读完才算。", "扫码，管理你自己的书架");
  return canvas.toDataURL("image/png");
}

// 读后卡内容区宽度（左右各留 48 内边距）。
function contentWFor(C, innerPad) {
  return C.W - C.PAD * 2 - innerPad * 2;
}

// 三版式统一的「出图 → 预览弹窗」收尾。
function openShareCardDialog(dataUrl, filename) {
  const dialog = document.getElementById("shareCardDialog");
  const img = document.getElementById("shareCardImg");
  const dl = document.getElementById("shareCardDownload");
  if (img) img.src = dataUrl;
  if (dl) { dl.href = dataUrl; dl.download = `${String(filename).replace(/[《》\/\\]/g, "")}-分享图.png`; }
  dialog?.showModal();
}

async function shareQuoteCard(quoteId) {
  if (!requireAuth("生成分享图")) return;
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  if (!(quote.content || quote.ocrText || "").trim()) {
    showToast("这条摘抄还没有文字内容，先补全再生成分享图");
    return;
  }
  const book = state.books.find((b) => b.id === quote.bookId);
  try {
    showToast("正在生成分享图…");
    openShareCardDialog(await renderQuoteShareCard(quote, book), book?.title || "摘抄");
  } catch (err) {
    showToast("生成分享图失败：" + (err?.message || err));
  }
}

async function shareConnectionCard(connId) {
  if (!requireAuth("生成分享图")) return;
  const conn = (state.connections || []).find((c) => c.id === connId);
  if (!conn) return;
  try {
    showToast("正在生成分享图…");
    openShareCardDialog(await renderConnectionShareCard(conn), "思想碰撞");
  } catch (err) {
    showToast("生成分享图失败：" + (err?.message || err));
  }
}

async function shareBookCard(bookId) {
  if (!requireAuth("生成分享图")) return;
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  try {
    showToast("正在生成分享图…");
    openShareCardDialog(await renderBookShareCard(book), book.title || "书");
  } catch (err) {
    showToast("生成分享图失败：" + (err?.message || err));
  }
}

function openNewQuoteForBook(bookId) {
  if (!requireAuth("新增摘抄")) return;
  activateTab("quote");
  quoteDialogIsNew = true;
  document.getElementById("quoteId").value = "";
  els.quoteForm.querySelector('[name="bookId"]').value = bookId;
  document.querySelector("#quoteBookCombobox")?._comboboxSetValue?.(bookId);
  els.quoteForm.querySelector('[name="page"]').value = "";
  els.quoteForm.querySelector('[name="kind"]').value = "quote";
  renderQuoteTagPicker([]);
  document.getElementById("quoteContent").value = "";
  els.quoteForm.querySelector('[name="reflection"]').value = "";
  if (pendingQuoteImage?.objectUrl) URL.revokeObjectURL(pendingQuoteImage.objectUrl);
  pendingQuoteImage = null;
  renderImagePreview();
  els.quoteDialog.showModal();
}

function openNewSessionForBook(bookId) {
  if (!requireAuth("新增记录")) return;
  activateTab("session");
  document.getElementById("sessionId").value = "";
  els.sessionForm.querySelector('[name="bookId"]').value = bookId;
  document.querySelector("#sessionBookCombobox")?._comboboxSetValue?.(bookId);
  els.sessionForm.querySelector('[name="startPage"]').value = "";
  els.sessionForm.querySelector('[name="endPage"]').value = "";
  els.sessionForm.querySelector('[name="minutes"]').value = "";
  els.sessionForm.querySelector('[name="note"]').value = "";
  const todayLocal = todayLocalDateInput();
  const dateInput = els.sessionForm.querySelector('[name="date"]');
  dateInput.value = todayLocal;
  dateInput.max = todayLocal;
  els.sessionDialog.showModal();
}

function editQuote(quoteId) {
  if (!requireAuth("编辑摘抄")) return;
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  quoteDialogIsNew = false;
  document.getElementById("quoteId").value = quote.id;
  els.quoteForm.querySelector('[name="bookId"]').value = quote.bookId;
  document.querySelector("#quoteBookCombobox")?._comboboxSetValue?.(quote.bookId);
  els.quoteForm.querySelector('[name="page"]').value = quote.page || "";
  els.quoteForm.querySelector('[name="kind"]').value = quote.kind || "quote";
  renderQuoteTagPicker(quote.tags || []);
  document.getElementById("quoteContent").value = quote.content || quote.ocrText || "";
  els.quoteForm.querySelector('[name="reflection"]').value = quote.reflection || "";
  if (pendingQuoteImage?.objectUrl) URL.revokeObjectURL(pendingQuoteImage.objectUrl);
  pendingQuoteImage = quote.imageUrl
    ? { name: "existing-quote-image", savedUrl: quote.imageUrl, dataUrl: null, objectUrl: "", ocrSource: quote.ocrSource || "" }
    : null;
  renderImagePreview();
  els.quoteDialog.showModal();
}

function showConfirmDialog({ message, confirmLabel = "确认删除", onConfirm }) {
  els.confirmDialogMessage.textContent = message;
  els.confirmDialogConfirmBtn.textContent = confirmLabel;
  els.confirmDialog.showModal();

  const handleConfirm = () => {
    cleanup();
    els.confirmDialog.close();
    onConfirm();
  };
  const handleCancel = () => {
    cleanup();
    els.confirmDialog.close();
  };
  function cleanup() {
    els.confirmDialogConfirmBtn.removeEventListener("click", handleConfirm);
    els.confirmDialogCancelBtn.removeEventListener("click", handleCancel);
    els.confirmDialog.removeEventListener("cancel", cleanup);
  }

  els.confirmDialogConfirmBtn.addEventListener("click", handleConfirm, { once: true });
  els.confirmDialogCancelBtn.addEventListener("click", handleCancel, { once: true });
  els.confirmDialog.addEventListener("cancel", cleanup, { once: true });
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
  els.bookEditForm.elements.startedAt.value = isoToDateInput(book.startedAt); // OPT-074
  els.bookEditForm.elements.finishedAt.value = isoToDateInput(book.finishedAt); // OPT-074
  els.bookEditForm.elements.notes.value = book.notes || "";
  if (els.bookEditForm.elements.review) els.bookEditForm.elements.review.value = book.review || "";
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

  // OPT-074: the edit form's date fields are the source of truth for reading dates;
  // the status-based fallback below only fills a date left blank here.
  const startedAtIso = dateInputToIso(formData.get("startedAt"));
  const finishedAtIso = dateInputToIso(formData.get("finishedAt"));
  if (startedAtIso && finishedAtIso && finishedAtIso < startedAtIso) {
    showToast("读完日期不能早于开始阅读日期");
    return;
  }

  // Update in-memory state immediately
  book.currentPage = currentPage;
  book.status = String(formData.get("status"));
  book.notes = String(formData.get("notes")).trim();
  book.review = String(formData.get("review") || "").trim();
  book.tags = Array.isArray(book.tags) ? book.tags : [];
  book.updatedAt = new Date().toISOString();
  book.startedAt = startedAtIso;
  book.finishedAt = finishedAtIso;
  if (book.status === "reading" || book.status === "finished") {
    book.lastReadAt = new Date().toISOString();
    // bug-346: don't fabricate a start date after a known finish date (e.g. a book
    // imported as 已读完 with an earlier finishedAt and no start date) — leave it blank.
    if (!book.startedAt && !(book.finishedAt && book.lastReadAt > book.finishedAt)) {
      book.startedAt = book.lastReadAt;
    }
  }
  // OPT-074: marking a book 已读完 auto-fills the finish date if left blank,
  // mirroring how 阅读中/已读完 auto-fills the start date above. Don't let the
  // auto-filled date land before the start date.
  if (book.status === "finished" && !book.finishedAt) {
    const now = new Date().toISOString();
    book.finishedAt = book.startedAt && now < book.startedAt ? book.startedAt : now;
  }
  if (book.totalPages && currentPage >= book.totalPages) {
    book.status = "finished";
    if (!book.finishedAt) {
      book.finishedAt = new Date().toISOString();
    }
  }

  // Capture pending image then close dialog right away
  const pendingImage = pendingBookEditImage;
  const editedBookId = book.id;
  const booksScrollTop = els.booksList?.scrollTop ?? 0;
  closeDialog(els.bookEditDialog);
  resetBookEditDraft();
  render();
  restoreEditedBookPosition(editedBookId, booksScrollTop);
  showToast("保存中…");

  // Upload image + sync in background. A cover failure should not discard text/status edits.
  let coverUploadFailed = false;
  try {
    if (pendingImage && !pendingImage.fromExisting) {
      const coverImageUrl = await uploadBookCoverImage(pendingImage);
      if (!coverImageUrl) {
        coverUploadFailed = true;
      } else {
        book.coverImageUrl = coverImageUrl;
        render();
        restoreEditedBookPosition(editedBookId, booksScrollTop);
      }
    }
  } catch (error) {
    coverUploadFailed = true;
  }

  try {
    await syncState();
    showToast(coverUploadFailed ? "书籍已更新，封面上传失败" : "书籍已更新");
  } catch (error) {
    showToast(error.message || "保存失败");
  }
}

let _sessionDetailCurrentId = "";
function openSessionDetail(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const book = state.books.find((b) => b.id === session.bookId);
  _sessionDetailCurrentId = sessionId;
  document.getElementById("sessionDetailTitle").textContent = book ? formatBookTitle(book.title) : "未知书籍";
  document.getElementById("sessionDetailMeta").textContent =
    `${session.startPage}–${session.endPage} 页 · ${session.minutes} 分钟 · ${formatDate(session.date)}`;
  document.getElementById("sessionDetailNote").textContent = session.note || "无笔记";
  document.getElementById("sessionDetailDialog").showModal();
}

function openBookDetailDialog(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;

  els.bookDetailTitle.textContent = book.title || "书籍详情";
  els.bookDetailMeta.textContent = `${book.author || "作者未填写"} · ${statusMap[book.status] || book.status || "未标记"}`;

  // OPT-074: show reading dates (auto-filled by saveSession, or set in edit dialog).
  const detailDatesEl = document.getElementById("bookDetailDates");
  if (detailDatesEl) {
    const parts = [];
    if (book.startedAt) parts.push(`开始 ${formatDate(book.startedAt)}`);
    if (book.finishedAt) parts.push(`读完 ${formatDate(book.finishedAt)}`);
    detailDatesEl.textContent = parts.join(" · ");
    detailDatesEl.classList.toggle("is-hidden", parts.length === 0);
  }

  // 优先展示读后感（若有），内容简介保留其下。
  const detailReview = (book.review || "").trim();
  const detailIntro = (book.notes || "").trim();
  if (detailReview) {
    els.bookDetailIntro.innerHTML =
      `<div class="book-detail-review"><span class="book-detail-sub-label">我的读后</span><p>${escapeHtml(detailReview)}</p></div>` +
      (detailIntro ? `<div class="book-detail-intro-text"><span class="book-detail-sub-label">内容简介</span><p>${escapeHtml(detailIntro)}</p></div>` : "");
  } else {
    els.bookDetailIntro.textContent = detailIntro || "暂无内容简介。";
  }

  const bookQuestion = state.quotes
    .filter((q) => q.bookId === bookId && q.kind === "question")
    .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0))[0]; // OPT-037
  const questionWrap = document.getElementById("bookDetailQuestionWrap");
  const questionEl = document.getElementById("bookDetailQuestion");
  if (questionWrap && questionEl && bookQuestion?.content) {
    questionEl.textContent = bookQuestion.content;
    questionWrap.classList.remove("is-hidden");
  } else if (questionWrap && questionEl) {
    questionEl.textContent = "";
    questionWrap.classList.add("is-hidden");
  }

  const bookQuotes = state.quotes
    .filter((q) => q.bookId === bookId && isRegularQuote(q))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)); // OPT-037
  if (els.bookDetailQuotes) {
    const previewQuotes = bookQuotes.slice(0, 2);
    const quoteCards = previewQuotes.map((quote) => `
      <button class="book-detail-quote" type="button" data-detail-quote-id="${escapeHtml(quote.id)}">
        <span class="book-detail-quote-meta">${escapeHtml(quoteKindMap[quote.kind] || "摘抄")} · 第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}</span>
        <span class="book-detail-quote-content">${escapeHtml(quote.content || "")}</span>
        ${quote.reflection ? `<span class="book-detail-quote-reflection">${escapeHtml(quote.reflection)}</span>` : ""}
      </button>
    `).join("");
    const moreButton = bookQuotes.length > 2
      ? `<button class="detail-link-btn" type="button" data-book-detail-action="quotes">查看全部 ${bookQuotes.length} 条摘抄 / 笔记</button>`
      : "";
    els.bookDetailQuotes.innerHTML = bookQuotes.length
      ? `${quoteCards}${moreButton}`
      : `<p class="detail-empty-text">这本书还没有摘抄或笔记。</p>`;
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
      return `<button class="conn-mini-card conn-mini-nav" type="button" data-conn-id="${escapeHtml(c.id)}">
        <span class="conn-mini-kind" data-kind="${escapeHtml(c.kind)}">${escapeHtml(c.kind)}</span>
        <div class="conn-mini-text">${escapeHtml(srcSide.label)} ↔ ${escapeHtml(tgtSide.label)}</div>
        ${c.thought ? `<div class="connection-side-sub">${escapeHtml(c.thought.slice(0, 60))}${c.thought.length > 60 ? "…" : ""}</div>` : ""}
      </button>`;
    }).join("") + `<button class="detail-link-btn" type="button" data-book-detail-action="connections">查看全部 ${bookConns.length} 条关联</button>`;
    connWrap.classList.remove("is-hidden");
  } else if (connWrap) {
    connWrap.classList.add("is-hidden");
  }

  _bookDetailCurrentId = bookId;
  els.bookDetailDialog.showModal();
  // OPT-049 ①: showModal() autofocuses the first focusable element — a 摘抄 card
  // button mid-content — and scrolls it into view, leaving the dialog opened
  // mid-card. A synchronous scrollTop reset alone is not enough: iOS Safari runs
  // the autofocus scroll-into-view *asynchronously* after showModal and overrides
  // it (bug-343). So also move focus to the top container (preventScroll, so it
  // never scrolls to a mid-content button) and re-assert scrollTop on next frames.
  const detailBody = els.bookDetailDialog.querySelector(".dialog-form");
  if (detailBody) {
    detailBody.setAttribute("tabindex", "-1");
    try { detailBody.focus({ preventScroll: true }); } catch (_) { /* older browsers */ }
    detailBody.scrollTop = 0;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => { detailBody.scrollTop = 0; });
    }
  }
}

function goToBookQuotes() {
  const bookId = _bookDetailCurrentId;
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  els.bookDetailDialog.close();
  activateTab("quote");
  if (els.quoteSearch) {
    els.quoteSearch.value = book.title;
    renderQuotes();
  }
}

function goToBookConnections() {
  const bookId = _bookDetailCurrentId;
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  els.bookDetailDialog.close();
  activateTab("connections");
  selectedConnectionKindFilter = "all";
  els.connectionKindChips?.querySelectorAll("[data-kind-filter]").forEach((item) => {
    item.classList.toggle("active", item.dataset.kindFilter === "all");
  });
  if (els.connectionSearch) {
    els.connectionSearch.value = book.title;
  }
  renderConnections();
}

function goToConnection(connId) {
  const conn = (state.connections || []).find((item) => item.id === connId);
  if (!conn) return;
  const sideSearchText = (type, id) => {
    if (type === "book") {
      return state.books.find((book) => book.id === id)?.title || "";
    }
    const quote = state.quotes.find((item) => item.id === id);
    const book = state.books.find((item) => item.id === quote?.bookId);
    return [book?.title || "", quote?.content || ""].join(" ");
  };
  els.bookDetailDialog.close();
  activateTab("connections");
  selectedConnectionKindFilter = "all";
  els.connectionKindChips?.querySelectorAll("[data-kind-filter]").forEach((item) => {
    item.classList.toggle("active", item.dataset.kindFilter === "all");
  });
  if (els.connectionSearch) {
    els.connectionSearch.value = conn.thought || sideSearchText(conn.sourceType, conn.sourceId) || sideSearchText(conn.targetType, conn.targetId);
  }
  renderConnections();
}

function openOrganizeDialog(bookId) {
  if (!requireAuth("整理旧书")) return;
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  _organizeCurrentBookId = bookId;
  els.organizeDialogMeta.textContent = `《${book.title}》`;
  els.organizeRawText.value = "";
  els.organizeSubmitBtn.disabled = false;
  els.organizeSubmitBtn.textContent = "AI 识别";
  // reset to paste tab
  switchOrganizeTab("paste");
  els.organizePhotoPreview.classList.add("is-hidden");
  els.organizePhotoImg.src = "";
  els.bookDetailDialog.close();
  els.organizeDialog.showModal();
}

function switchOrganizeTab(tab) {
  const isPaste = tab === "paste";
  els.organizeTabPaste.classList.toggle("organize-tab--active", isPaste);
  els.organizeTabPhoto.classList.toggle("organize-tab--active", !isPaste);
  els.organizePastePane.classList.toggle("is-hidden", !isPaste);
  els.organizePhotoPane.classList.toggle("is-hidden", isPaste);
  // show submit btn only on paste tab; photo tab is self-serve
  els.organizeSubmitBtn.classList.toggle("is-hidden", !isPaste);
}

async function handleOrganizeImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageToDataUrl(file);
    els.organizePhotoImg.src = dataUrl;
    els.organizePhotoPreview.classList.remove("is-hidden");
    els.organizePickPhotoBtn.textContent = "换一张";
    // scroll image into view
    els.organizePhotoImg.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {
    showToast("图片加载失败，请重试");
  }
  // reset input so same file can be reselected
  event.target.value = "";
}

async function submitOrganizePaste() {
  const bookId = _organizeCurrentBookId;
  const rawText = els.organizeRawText.value.trim();
  if (!rawText) {
    showToast("请先粘贴摘抄或笔记内容");
    return;
  }
  els.organizeSubmitBtn.disabled = true;
  els.organizeSubmitBtn.textContent = "识别中…";
  try {
    const data = await apiFetch("/api/organize/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, rawText }),
    });
    els.organizeDialog.close();
    openCandidatesDialog(bookId, data.candidates);
  } catch (err) {
    showToast("识别失败：" + err.message);
    els.organizeSubmitBtn.disabled = false;
    els.organizeSubmitBtn.textContent = "AI 识别";
  }
}

function openCandidatesDialog(bookId, candidates) {
  const book = state.books.find((b) => b.id === bookId);
  _candidatesCurrentBookId = bookId;
  const typeLabel = { excerpt: "摘抄", note: "笔记" };
  const confidenceLabel = { high: "高置信", medium: "中", low: "低置信" };

  if (!candidates || !candidates.length) {
    showToast("未识别出候选内容，请检查粘贴的文本");
    return;
  }

  els.candidatesDialogMeta.textContent = `《${book ? book.title : ""}》共 ${candidates.length} 条候选`;
  els.candidatesList.innerHTML = "";
  candidates.forEach((c) => {
    const item = document.createElement("div");
    item.className = "candidate-item";
    item.id = `candidate-${c.id}`;
    item.dataset.actionId = c.id;
    const tagsHtml = c.data.tags?.length
      ? `<div class="candidate-tags">${c.data.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>`
      : "";
    item.innerHTML = `
      <div class="candidate-meta">
        <span class="candidate-type-badge candidate-type-${escapeHtml(c.type)}">${escapeHtml(typeLabel[c.type] || c.type)}</span>
        <span class="candidate-confidence">${escapeHtml(confidenceLabel[c.confidence] || c.confidence)}</span>
      </div>
      <div class="candidate-content">${escapeHtml(c.data.content)}</div>
      ${tagsHtml}
      <div class="candidate-actions">
        <button type="button" class="button button-primary candidate-btn-save">保存</button>
        <button type="button" class="button button-ghost candidate-btn-ignore">忽略</button>
      </div>`;
    const saveBtn = item.querySelector(".candidate-btn-save");
    const ignoreBtn = item.querySelector(".candidate-btn-ignore");
    saveBtn.addEventListener("click", () => approveCandidateItem(c.id, saveBtn));
    ignoreBtn.addEventListener("click", () => ignoreCandidateItem(c.id, ignoreBtn));
    els.candidatesList.appendChild(item);
  });
  els.candidatesDialog.showModal();
}

async function approveCandidateItem(actionId, btn) {
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    const data = await apiFetch(`/api/agent-actions/${actionId}/approve`, { method: "POST" });
    state = normalizeStateShape(data.state || state);
    render();
    const item = document.getElementById(`candidate-${actionId}`);
    if (item) {
      item.classList.add("candidate-item--done");
      item.querySelector(".candidate-actions").innerHTML = '<span class="candidate-done-label">已保存</span>';
    }
  } catch (err) {
    showToast("保存失败：" + err.message);
    btn.disabled = false;
    btn.textContent = "保存";
  }
}

async function ignoreCandidateItem(actionId, btn) {
  btn.disabled = true;
  try {
    await apiFetch(`/api/agent-actions/${actionId}/reject`, { method: "POST" });
    const item = document.getElementById(`candidate-${actionId}`);
    if (item) {
      item.classList.add("candidate-item--ignored");
      item.querySelector(".candidate-actions").innerHTML = '<span class="candidate-done-label">已忽略</span>';
    }
  } catch (err) {
    showToast("操作失败：" + err.message);
    btn.disabled = false;
  }
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
  const content = normalizeOcrText(formData.get("content"));
  if (!bookId) { showToast("先选择一本书"); return; }

  const pendingImage = pendingQuoteImage;
  const existingQuote = existingId ? state.quotes.find((q) => q.id === existingId) : null;
  if (!content && !pendingImage && !existingQuote?.imageUrl) {
    showToast("请输入内容，或先拍照保存图片草稿");
    return;
  }
  let quoteId = existingId;

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
      ocrStatus: content && state.quotes[idx].ocrStatus === "pending" ? "done" : state.quotes[idx].ocrStatus,
    };
  } else {
    quoteId = createId("quote");
    state.quotes.unshift({
      id: quoteId,
      bookId,
      page: Number(formData.get("page")) || 0,
      kind: String(formData.get("kind")),
      content,
      reflection: String(formData.get("reflection")).trim(),
      tags: normalizeTags(formData.get("tags")),
      imageUrl: "",
      ocrSource: pendingImage?.ocrSource || "",
      ocrStatus: "",
      createdAt: new Date().toISOString(),
    });
  }

  // Remember the book for the next 新增 whenever this was a new-quote session —
  // even if OCR gave the draft a real id (which would make existingId truthy).
  if (quoteDialogIsNew) lastQuoteBookId = bookId;
  // 保存即确认：这张卡片不再是「未保存的 OCR 临时卡」，清空标记，避免随后 close 事件误删。
  // 必须在 closeDialog 之前清，因为 dialog.close() 会同步触发 close 监听。
  ocrProvisionalQuoteId = "";
  closeDialog(els.quoteDialog);
  resetQuoteDraft();
  renderHero();
  renderSummary();
  renderQuotes();
  if (isTabActive("connections")) renderConnections();
  if (isTabActive("books")) renderBooks();
  activateTab("quote");
  showToast("保存中…");

  try {
    try {
      const uploadedUrl = await uploadQuoteImage(pendingImage);
      if (uploadedUrl) {
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (quote) {
          quote.imageUrl = uploadedUrl;
          quote.ocrSource = pendingImage?.ocrSource || quote.ocrSource || "";
        }
      }
    } catch {
      showToast("图片上传失败，先保存文字");
    }
    await syncState();
    renderHero();
    renderSummary();
    renderQuotes();
    if (isTabActive("connections")) renderConnections();
    if (isTabActive("books")) renderBooks();
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

async function loadPlanInfo() {
  if (!authToken || !els.planSummary) return;
  try {
    const info = await apiFetch("/api/account/plan");
    renderPlanSummary(info);
  } catch (error) {
    // Plan info is non-critical; just log and hide the badge.
    console.debug?.("loadPlanInfo failed:", error.message);
    els.planSummary.hidden = true;
  }
}

function renderPlanSummary(info) {
  if (!els.planSummary || !info) return;
  const chatUsage = info.usage?.chat;
  const ocrUsage = info.usage?.ocr;
  const bookText = info.bookCap
    ? `${info.bookCount}/${info.bookCap} 本`
    : `${info.bookCount} 本（无限）`;
  const chatText = chatUsage
    ? `今日 ${chatUsage.day_count}/${chatUsage.day_limit}`
    : "—";
  const ocrText = ocrUsage
    ? `今日 ${ocrUsage.day_count}/${ocrUsage.day_limit}`
    : "—";
  const upgradeBtn = info.plan === "free"
    ? '<button type="button" class="button button-primary button-small" id="planUpgradeBtn">升级 Plus</button>'
    : "";
  els.planSummary.innerHTML = `
    <div class="plan-row">
      <span class="plan-badge plan-badge--${info.plan}">${info.planLabel}</span>
      ${upgradeBtn}
    </div>
    <div class="plan-stats">
      <div><strong>书架</strong>${bookText}</div>
      <div><strong>AI 对话</strong>${chatText}</div>
      <div><strong>OCR 识别</strong>${ocrText}</div>
    </div>
  `;
  els.planSummary.hidden = false;
  const btn = els.planSummary.querySelector("#planUpgradeBtn");
  if (btn) btn.addEventListener("click", () => startUpgradeFlow(btn));
}

async function startUpgradeFlow(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "跳转中…";
  }
  try {
    const result = await apiFetch("/api/billing/checkout", { method: "POST" });
    if (result?.url) {
      location.href = result.url;
      return;
    }
    throw new Error("missing_checkout_url");
  } catch (error) {
    if (error?.message?.includes("not_configured") || /503/.test(error?.message || "")) {
      showToast("Plus 升级即将上线，敬请期待 ✨");
    } else {
      showToast(error.message || "无法跳转支付页");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "升级 Plus";
    }
  }
}

async function exportAccount() {
  if (!requireAuth("导出账号数据")) return;
  try {
    const response = await fetch(buildApiUrl("/api/account/export"), {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `paper-reading-export-${currentUser.username}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("完整账号数据已导出");
  } catch (error) {
    showToast(error.message);
  }
}

function deleteAccount() {
  if (!requireAuth("注销账号")) return;
  const expected = currentUser?.username || "";
  showConfirmDialog({
    message:
      `注销账号将永久删除你的所有书籍、记录、摘抄、对话和上传图片，且不可恢复。\n` +
      `请在浏览器弹窗中输入用户名「${expected}」确认。`,
    confirmLabel: "永久注销",
    onConfirm: async () => {
      const typed = window.prompt(`再次确认：输入用户名「${expected}」以注销账号`);
      if (typed !== expected) {
        showToast("用户名不匹配，已取消");
        return;
      }
      try {
        await apiFetch("/api/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmUsername: expected }),
        }, true);
        setAuthToken("");
        currentUser = null;
        state = normalizeStateShape(initialState);
        remoteLogs = [];
        render();
        dispatchUserChange();
        activateTab("me");
        showToast("账号已注销");
      } catch (error) {
        showToast(error.message);
      }
    },
  });
}

// Two export formats exist (OPT-040): the lightweight "导出书单备份"
// (exportData) dumps `state` with fields at the top level, while the full
// "完整账号导出（GDPR）" (GET /api/account/export) nests state under `.state`
// and carries an `exportFormat` marker. Detect and unwrap so BOTH files
// restore correctly — otherwise the GDPR file's top-level `books` etc. read as
// undefined and the import silently overwrites the account with empty state.
function resolveImportedState(parsed) {
  const looksLikeFullExport =
    parsed &&
    typeof parsed.state === "object" &&
    parsed.state &&
    (parsed.exportFormat !== undefined || !Array.isArray(parsed.books));
  const source = (looksLikeFullExport ? parsed.state : parsed) || {};
  return normalizeStateShape({
    books: Array.isArray(source.books) ? source.books : [],
    sessions: Array.isArray(source.sessions) ? source.sessions : [],
    quotes: Array.isArray(source.quotes) ? source.quotes : [],
    chatHistories:
      typeof source.chatHistories === "object" && source.chatHistories
        ? source.chatHistories
        : Array.isArray(source.chatHistory)
          ? { "__general__": source.chatHistory }
          : {},
    chatContexts: typeof source.chatContexts === "object" && source.chatContexts ? source.chatContexts : {},
    connections: Array.isArray(source.connections) ? source.connections : [],
  });
}

function stateContentCount(s) {
  if (!s) return 0;
  return (
    (Array.isArray(s.books) ? s.books.length : 0) +
    (Array.isArray(s.sessions) ? s.sessions.length : 0) +
    (Array.isArray(s.quotes) ? s.quotes.length : 0) +
    (Array.isArray(s.connections) ? s.connections.length : 0) +
    Object.keys(s.chatHistories || {}).length
  );
}

// Import replaces the whole account, so its success gets a prominent,
// must-dismiss dialog with a per-type summary (OPT-041) — the bottom-corner
// toast was too easy to miss. Falls back to a toast if the dialog is absent.
function showImportResult(s) {
  const rows = [
    ["书籍", "本", Array.isArray(s.books) ? s.books.length : 0],
    ["摘抄", "条", Array.isArray(s.quotes) ? s.quotes.length : 0],
    ["记录", "条", Array.isArray(s.sessions) ? s.sessions.length : 0],
    ["关联", "条", Array.isArray(s.connections) ? s.connections.length : 0],
  ];
  if (!els.importResultDialog || !els.importResultList) {
    showToast("数据已导入");
    return;
  }
  els.importResultList.innerHTML = rows
    .map(
      ([label, unit, n]) =>
        `<li><span class="import-result-label">${label}</span><span class="import-result-count">${n} ${unit}</span></li>`
    )
    .join("");
  els.importResultDialog.showModal();
}

function importData(file) {
  if (!requireAuth("导入数据")) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let resolved;
    try {
      resolved = resolveImportedState(JSON.parse(String(reader.result)));
    } catch (error) {
      showToast("文件解析失败，请选择有效的备份 JSON");
      return;
    }
    const applyImport = async () => {
      state = resolved;
      try {
        await syncState();
        render();
        showImportResult(state);
      } catch (error) {
        showToast(error.message || "导入失败");
      }
    };
    // Footgun guard (OPT-040): an unrecognized / wrong-format file resolves to
    // empty content; applied blindly it would wipe a non-empty account. Require
    // explicit confirmation instead of silently overwriting with nothing.
    if (stateContentCount(resolved) === 0 && stateContentCount(state) > 0) {
      showConfirmDialog({
        message: "该文件未识别到任何书单 / 摘抄 / 记录内容，导入将清空当前账号的全部数据。确定继续？",
        confirmLabel: "仍要清空导入",
        onConfirm: applyImport,
      });
      return;
    }
    // Decrease guard (OPT-043): importing an older backup silently shrinks
    // counts in one or more categories — the most common real data-loss
    // scenario (bug-274). Require explicit confirmation listing what will be lost.
    const _categoryLabels = { books: "书籍", quotes: "摘抄", sessions: "记录", connections: "关联", chatHistories: "聊天记录" };
    const _losses = Object.entries(_categoryLabels)
      .map(([key, label]) => {
        const cur = Array.isArray(state[key]) ? state[key].length : Object.keys(state[key] || {}).length;
        const inc = Array.isArray(resolved[key]) ? resolved[key].length : Object.keys(resolved[key] || {}).length;
        return inc < cur ? `${label} ${cur - inc} 条` : null;
      })
      .filter(Boolean);
    if (_losses.length > 0) {
      showConfirmDialog({
        message: `导入备份后将丢失：${_losses.join("、")}。确定用这份备份覆盖当前数据？`,
        confirmLabel: "确认覆盖（将丢失上述数据）",
        onConfirm: applyImport,
      });
      return;
    }
    await applyImport();
  };
  reader.readAsText(file);
}

// OPT-001: generate the import template client-side with the same SheetJS
// build used for parsing, so the downloaded headers always match what
// importExcel() actually reads.
function downloadExcelTemplate() {
  if (!window.XLSX) {
    showToast("Excel 解析库未加载，请刷新后重试");
    return;
  }
  const headers = ["书名", "作者", "状态", "标签", "总页数", "开始时间", "完成时间", "译者", "简介", "喜欢程度"];
  const example = ["示例：百年孤独", "加西亚·马尔克斯", "阅读中", "小说,拉美文学", 360, "2026-06-01", "", "范晔", "布恩迪亚家族七代人的故事", "5"];
  const sheet = window.XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = headers.map((h) => ({ wch: h === "书名" || h === "简介" ? 24 : 12 }));
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, "书单");
  window.XLSX.writeFile(workbook, "书单导入模板.xlsx");
  showToast("模板已下载，填好后回来选择文件导入");
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

    // Track seen books (existing + already-imported rows) for wildcard-aware
    // duplicate detection — a plain signature Set can't express empty-author matches.
    const seenBooks = state.books.map((book) => ({ title: book.title, author: book.author || "" }));
    let imported = 0;

    for (const row of rows) {
      const title = String(getRowField(row, ["书名", "图书名称", "title", "Title"])).trim();
      if (!title) continue;
      // Skip the template's example row if the user forgot to delete it.
      if (title.startsWith("示例：")) continue;
      const author = String(getRowField(row, ["作者", "author", "Author"])).trim();
      if (seenBooks.some((book) => isSameBook(title, author, book.title, book.author))) continue;

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
      seenBooks.push({ title, author });
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
  const compressionPromise = resizeImageToDataUrl(file, QUOTE_IMAGE_MAX_PX, QUOTE_IMAGE_QUALITY);
  pendingQuoteImage.compressionPromise = compressionPromise;
  compressionPromise.then((dataUrl) => {
    if (pendingQuoteImage) pendingQuoteImage.dataUrl = dataUrl;
  }).catch(() => {});
}

async function runOcrFromImage(engine = "fast") {
  if (!requireAuth("执行 OCR")) return;
  const isAi = engine === "ai";
  const bookId = String(els.quoteForm.querySelector('[name="bookId"]')?.value || "").trim();
  if (!bookId) {
    showToast("先选择一本书");
    return;
  }
  const existingQuoteId = String(els.quoteForm.querySelector('[name="id"]')?.value || "").trim();
  const existingQuote = existingQuoteId ? state.quotes.find((quote) => quote.id === existingQuoteId) : null;
  const savedImageUrl = pendingQuoteImage?.savedUrl || existingQuote?.imageUrl || "";
  if (!pendingQuoteImage && !savedImageUrl) {
    showToast("先拍照或选择一张图片");
    return;
  }

  els.ocrButton.disabled = true;
  if (els.aiOcrButton) els.aiOcrButton.disabled = true;
  els.ocrStatus.textContent = isAi ? "正在 AI 识别划线句…" : "正在快速识别整页…";
  try {
    let dataUrl = pendingQuoteImage?.dataUrl || "";
    if (!dataUrl && pendingQuoteImage?.compressionPromise) {
      dataUrl = await pendingQuoteImage.compressionPromise;
    }
    if (!dataUrl && !savedImageUrl) {
      showToast("图片还在处理中，请稍候…");
      return;
    }
    const requestContent = normalizeOcrText(els.quoteContent.value);

    const data = await apiFetch(
      "/api/quotes/ocr",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: existingQuoteId,
          bookId,
          engine,
          page: Number(els.quoteForm.querySelector('[name="page"]')?.value || 0),
          kind: String(els.quoteForm.querySelector('[name="kind"]')?.value || "quote"),
          content: requestContent,
          reflection: String(els.quoteForm.querySelector('[name="reflection"]')?.value || "").trim(),
          tags: normalizeTags(els.quoteForm.querySelector('[name="tags"]')?.value || ""),
          imageDataUrl: dataUrl,
          imageUrl: savedImageUrl,
          filename: pendingQuoteImage?.name || "quote-image",
        }),
      },
      true
    );
    if (data.state) {
      state = normalizeStateShape(data.state);
    }
    const quoteId = data.quoteId || existingQuoteId;
    const quote = state.quotes.find((item) => item.id === quoteId);
    if (quoteId) {
      els.quoteForm.querySelector('[name="id"]').value = quoteId;
      els.quoteForm.dataset.ocrQuoteId = quoteId;
      els.quoteForm.dataset.ocrBaseContent = requestContent;
      // 若这是 OCR 为一张全新卡片临时创建的 quote（识别前没有 existingQuoteId），记下它；
      // 用户若直接取消，close 监听会静默删除，避免残留未确认的卡片。
      if (!existingQuoteId) ocrProvisionalQuoteId = quoteId;
    }
    if (quote?.imageUrl) {
      // Keep the known-good local blob (objectUrl) as the preview — switching the
      // <img> to the freshly-saved server URL here can make the photo appear to
      // vanish if that URL doesn't load yet. Just record savedUrl and drop the
      // local dataUrl/compressionPromise so the eventual save reuses the
      // already-uploaded image instead of re-uploading it.
      pendingQuoteImage = {
        name: "existing-quote-image",
        savedUrl: quote.imageUrl,
        dataUrl: null,
        compressionPromise: null,
        objectUrl: pendingQuoteImage?.objectUrl || "",
        ocrSource: quote.ocrSource || (isAi ? "后端 OCR" : "本地 OCR (Tesseract)"),
      };
      renderImagePreview();
    }
    renderHero();
    renderSummary();
    renderQuotes();
    if (isTabActive("connections")) renderConnections();
    if (isTabActive("books")) renderBooks();

    if (data.status === "pending") {
      // AI path: result lands asynchronously, poll for it.
      scheduleOcrStatusRefresh();
      await loadRemoteLogs();
      els.ocrStatus.textContent = "已开始 AI 识别划线句，可以继续编辑我的理解。";
      showToast("已开始 AI 识别划线句，可以继续编辑");
    } else {
      // Fast path: text is already in the response — fill it in synchronously.
      const recognized = String(data.recognizedText || quote?.content || "");
      const currentVal = normalizeOcrText(els.quoteContent.value);
      const guardPass = !!recognized && (!currentVal || currentVal === requestContent);
      if (guardPass) {
        els.quoteContent.value = recognized;
        // OPT-055: fast OCR returns text synchronously here (it does NOT go
        // through syncOpenQuoteFormFromState, which only handles the async AI
        // poll path), so wire the line-delete panel directly into this branch.
        renderOcrLineSelector(recognized);
      }
      await loadRemoteLogs();
      if (data.status === "done" && recognized) {
        els.ocrStatus.textContent = "整页识别完成，可继续编辑；只想要划线句可点「AI 精识别」。";
        showToast("整页识别完成");
      } else {
        els.ocrStatus.textContent = data.message || "未识别到文字，可点「AI 精识别」试试。";
        showToast(data.message || "未识别到文字，可试试 AI 精识别");
      }
    }
  } catch (error) {
    els.ocrStatus.textContent = `${isAi ? "AI 识别" : "快速识别"}失败：${error.message}`;
    showToast(error.message);
    await loadRemoteLogs();
  } finally {
    els.ocrButton.disabled = false;
    if (els.aiOcrButton) els.aiOcrButton.disabled = false;
  }
}

async function runBookOcr() {
  if (!requireAuth("识别封面")) return;
  if (!pendingBookImage) {
    showToast("先拍照或选择一张封面图片");
    return;
  }
  const btn = els.bookOcrButton;
  if (btn) btn.disabled = true;
  if (els.bookImageStatus) els.bookImageStatus.textContent = "正在识别封面信息…";
  try {
    let dataUrl = pendingBookImage?.dataUrl || "";
    if (!dataUrl && pendingBookImage?.compressionPromise) {
      dataUrl = await pendingBookImage.compressionPromise;
    }
    if (!dataUrl) {
      if (els.bookImageStatus) els.bookImageStatus.textContent = "图片还在处理中，请稍候再识别。";
      showToast("图片还在处理中，请稍候…");
      return;
    }
    const data = await apiFetch(
      "/api/books/ocr",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      },
      true
    );
    const titleInput = els.bookForm?.querySelector('[name="title"]');
    const authorInput = els.bookForm?.querySelector('[name="author"]');
    const tagsInput = els.bookForm?.querySelector('[name="tags"]');
    let filled = 0;
    if (titleInput && !titleInput.value.trim() && data.title) {
      titleInput.value = data.title;
      filled += 1;
    }
    if (authorInput && !authorInput.value.trim() && data.author) {
      authorInput.value = data.author;
      filled += 1;
    }
    if (tagsInput && !tagsInput.value.trim() && Array.isArray(data.tags) && data.tags.length) {
      tagsInput.value = data.tags.join(", ");
      filled += 1;
    }
    if (els.bookImageStatus) {
      els.bookImageStatus.textContent = filled
        ? "已根据封面回填信息，可继续修改。"
        : "未识别到可填信息，请手动填写。";
    }
    showToast(filled ? "已根据封面回填信息" : "未识别到可填信息");
  } catch (error) {
    if (els.bookImageStatus) els.bookImageStatus.textContent = `识别失败：${error.message}`;
    showToast(error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function clearChatHistory() {
  try {
    const context = normalizeChatContext(
      window.paperReadingApp?.getActiveChatContext?.(),
      window.paperReadingApp?.getActiveChatBookId?.() || ""
    );
    const historyKey = chatContextHistoryKey(context);
    await apiFetch(
      "/api/chat-history",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, bookId: context.bookId || "" }),
      },
      true
    );
    state.chatHistories = state.chatHistories || {};
    state.chatContexts = state.chatContexts || {};
    state.chatHistories[historyKey] = [];
    state.chatContexts[historyKey] = context;
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
    const content = (q.content || "").slice(0, 70) + (q.content?.length > 70 ? "…" : "");
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
      // 两行封顶：同书多段摘抄可辨识（OPT-080）。垂直 padding 归零以消除 -webkit-box
      // + line-clamp 在带 padding 时的裁切泄漏，行距改用 margin 撑起（margin 在 overflow 盒外）。
      li.style.cssText = "display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.6;padding:0 14px;margin:6px 0;";
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
    allQuotes = (quotes || []).filter(isRegularQuote);
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
  const connId = String(formData.get("id") || "").trim();
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
  const tags = tagsRaw ? tagsRaw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean) : [];

  if (!sourceId) { showToast("请选择来源"); return; }
  if (!targetId) { showToast("请选择目标"); return; }
  if (sourceType === targetType && sourceId === targetId) { showToast("来源和目标不能相同"); return; }
  if (!thought) { showToast("请填写你的想法"); return; }

  if (connId) {
    const idx = (state.connections || []).findIndex((c) => c.id === connId);
    if (idx !== -1) {
      state.connections[idx] = { ...state.connections[idx], sourceType, sourceId, targetType, targetId, kind, thought, tags };
    }
  } else {
    const conn = {
      id: `conn-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`,
      sourceType, sourceId, targetType, targetId, kind, thought, tags,
      createdAt: new Date().toISOString(),
    };
    state.connections = [conn, ...(state.connections || [])];
  }

  try {
    await syncState();
    closeDialog(els.connectionDialog);
    render();
    if (!connId) activateTab("connections");
    showToast(connId ? "关联已更新" : "关联已保存");
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

function openConnectionForEdit(connId) {
  if (!requireAuth("编辑关联")) return;
  const conn = (state.connections || []).find((c) => c.id === connId);
  if (!conn) { showToast("关联不存在"); return; }
  document.getElementById("connectionId").value = connId;
  document.getElementById("connSourceType").value = conn.sourceType;
  document.getElementById("connTargetType").value = conn.targetType;
  els.connectionForm.querySelector('[name="kind"]').value = conn.kind || "延伸";
  els.connectionForm.querySelector('[name="thought"]').value = conn.thought || "";
  els.connectionForm.querySelector('[name="tags"]').value = (conn.tags || []).join(", ");
  connSourceBookComboWrap?._comboboxReset?.();
  connSourceQuoteComboWrap?._comboboxReset?.();
  connTargetBookComboWrap?._comboboxReset?.();
  connTargetQuoteComboWrap?._comboboxReset?.();
  toggleConnComboboxes("source", conn.sourceType);
  toggleConnComboboxes("target", conn.targetType);
  if (conn.sourceType === "book") {
    connSourceBookComboWrap?._comboboxSetValue?.(conn.sourceId);
  } else {
    connSourceQuoteComboWrap?._comboboxSetValue?.(conn.sourceId);
  }
  if (conn.targetType === "book") {
    connTargetBookComboWrap?._comboboxSetValue?.(conn.targetId);
  } else {
    connTargetQuoteComboWrap?._comboboxSetValue?.(conn.targetId);
  }
  els.connectionDialog.showModal();
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
  els.clearSampleBtn?.addEventListener("click", () => {
    if (window.confirm("清除所有示例内容？你自己添加的书和摘抄不受影响。")) {
      clearSampleData();
    }
  });
  els.openSessionDialogBtn?.addEventListener("click", () => {
    if (!requireAuth("记录阅读")) return;
    document.getElementById("sessionId").value = "";
    sessionComboWrap?._comboboxReset?.();
    els.sessionDialog.showModal();
  });
  els.openQuoteDialogBtn?.addEventListener("click", () => {
    if (!requireAuth("新增摘抄")) return;
    resetQuoteDraft();
    quoteDialogIsNew = true;
    document.getElementById("quoteId").value = "";
    if (lastQuoteBookId) {
      els.quoteForm.querySelector('[name="bookId"]').value = lastQuoteBookId;
      quoteComboWrap?._comboboxSetValue?.(lastQuoteBookId);
    }
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
    const shareBtn = event.target.closest(".conn-share-btn");
    if (shareBtn) { event.stopPropagation(); shareConnectionCard(shareBtn.dataset.connId); return; }
    const delBtn = event.target.closest(".conn-delete-btn");
    if (delBtn) { event.stopPropagation(); deleteConnection(delBtn.dataset.connId); return; }
    const editBtn = event.target.closest(".conn-edit-btn");
    if (editBtn) { event.stopPropagation(); openConnectionForEdit(editBtn.dataset.connId); return; }
    const navSide = event.target.closest(".conn-nav-side[data-nav-id]");
    if (navSide) {
      event.stopPropagation();
      const { navType, navId } = navSide.dataset;
      if (navType === "book") openBookDetailDialog(navId);
      else if (navType === "quote") openQuoteDetail(navId);
    }
  });

  els.quoteDetailConnectBtn?.addEventListener("click", () => {
    const quoteId = document.getElementById("quoteDetailDialog")?.dataset?.openQuoteId || "";
    document.getElementById("quoteDetailDialog").close();
    openConnectionDialog({ sourceType: "quote", sourceId: quoteId });
  });

  els.quoteDetailChatBtn?.addEventListener("click", () => {
    const quoteId = document.getElementById("quoteDetailDialog")?.dataset?.openQuoteId || "";
    goToQuoteChat(quoteId);
  });

  document.getElementById("quoteDetailShareBtn")?.addEventListener("click", () => {
    const quoteId = document.getElementById("quoteDetailDialog")?.dataset?.openQuoteId || "";
    document.getElementById("quoteDetailDialog").close();
    shareQuoteCard(quoteId);
  });

  // OPT-027: quote detail delete (action center now owns the full action set)
  document.getElementById("quoteDetailDeleteBtn")?.addEventListener("click", () => {
    const quoteId = document.getElementById("quoteDetailDialog")?.dataset?.openQuoteId || "";
    document.getElementById("quoteDetailDialog").close();
    deleteQuote(quoteId);
  });

  // OPT-027: session detail footer
  document.getElementById("sessionDetailChatBtn")?.addEventListener("click", () => {
    const session = state.sessions.find((s) => s.id === _sessionDetailCurrentId);
    document.getElementById("sessionDetailDialog").close();
    if (!session || !requireAuth("使用探讨功能")) return;
    activateTab("chat");
    window.paperReadingApp?.switchChatToBook?.(session.bookId);
  });
  document.getElementById("sessionDetailEditBtn")?.addEventListener("click", () => {
    const id = _sessionDetailCurrentId;
    document.getElementById("sessionDetailDialog").close();
    editSession(id);
  });
  document.getElementById("sessionDetailDeleteBtn")?.addEventListener("click", () => {
    const id = _sessionDetailCurrentId;
    document.getElementById("sessionDetailDialog").close();
    deleteSession(id);
  });

  // OPT-027: book detail footer (book detail is now an action center, not read-only)
  document.getElementById("bookDetailChatBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    if (!requireAuth("使用探讨功能")) return;
    activateTab("chat");
    window.paperReadingApp?.switchChatToBook?.(id);
  });
  document.getElementById("bookDetailEditBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    openBookEditDialog(id);
  });
  document.getElementById("bookDetailConnectBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    openConnectionDialog({ sourceType: "book", sourceId: id });
  });
  document.getElementById("bookDetailShareBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    shareBookCard(id);
  });
  document.getElementById("bookDetailAddQuoteBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    openNewQuoteForBook(id);
  });
  document.getElementById("bookDetailAddSessionBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    openNewSessionForBook(id);
  });
  document.getElementById("bookDetailDeleteBtn")?.addEventListener("click", () => {
    const id = _bookDetailCurrentId;
    els.bookDetailDialog.close();
    deleteBook(id);
  });

  document.getElementById("quoteDetailConnections")?.addEventListener("click", (event) => {
    const card = event.target.closest(".conn-mini-nav[data-nav-id]");
    if (!card) return;
    const { navType, navId } = card.dataset;
    document.getElementById("quoteDetailDialog").close();
    if (navType === "book") openBookDetailDialog(navId);
    else if (navType === "quote") openQuoteDetail(navId);
  });

  els.bookDetailQuotes?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-book-detail-action]");
    if (action?.dataset.bookDetailAction === "quotes") {
      goToBookQuotes();
      return;
    }
    const quoteBtn = event.target.closest("[data-detail-quote-id]");
    if (!quoteBtn) return;
    els.bookDetailDialog.close();
    openQuoteDetail(quoteBtn.dataset.detailQuoteId);
  });

  document.getElementById("bookDetailConnections")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-book-detail-action]");
    if (action?.dataset.bookDetailAction === "connections") {
      goToBookConnections();
      return;
    }
    const card = event.target.closest(".conn-mini-nav[data-conn-id]");
    if (!card) return;
    goToConnection(card.dataset.connId);
  });

  els.mobileTabs.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog)));
  });

  // 取消（按钮 / Esc）关闭摘抄对话框且未保存时，删除 OCR 临时创建但未确认的卡片。
  // 保存路径已在 addQuote 里先清空 ocrProvisionalQuoteId，故这里只命中真正的取消。
  els.quoteDialog?.addEventListener("close", discardProvisionalOcrQuote);

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

  document.getElementById("quoteTagChips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick-tag]");
    if (!btn) return;
    const tag = btn.dataset.pickTag;
    if (selectedQuoteTags.includes(tag)) {
      selectedQuoteTags = selectedQuoteTags.filter((t) => t !== tag);
    } else {
      selectedQuoteTags = [...selectedQuoteTags, tag];
    }
    btn.classList.toggle("tag-chip-pick--active", selectedQuoteTags.includes(tag));
    _syncQuoteTagsInput();
  });

  document.getElementById("quoteTagInput")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) return;
    const custom = getCustomQuoteTags();
    if (!custom.includes(val) && !DEFAULT_QUOTE_TAGS.includes(val)) {
      saveCustomQuoteTags([...custom, val]);
    }
    if (!selectedQuoteTags.includes(val)) {
      selectedQuoteTags = [...selectedQuoteTags, val];
      _syncQuoteTagsInput();
    }
    e.target.value = "";
    renderQuoteTagPicker(selectedQuoteTags);
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
  els.forgotPasswordBtn?.addEventListener("click", () => {
    els.forgotPasswordDialog?.showModal();
  });
  els.forgotPasswordCancelBtn?.addEventListener("click", () => {
    els.forgotPasswordDialog?.close();
  });
  els.forgotPasswordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.forgotPasswordForm.querySelector('[type="submit"]');
    withSavingState(btn, "发送中…", () => handleForgotPassword(new FormData(els.forgotPasswordForm)));
  });
  els.resetPasswordCancelBtn?.addEventListener("click", () => {
    els.resetPasswordDialog?.close();
  });
  els.resetPasswordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.resetPasswordForm.querySelector('[type="submit"]');
    withSavingState(btn, "设置中…", () => handlePasswordReset(new FormData(els.resetPasswordForm)));
  });
  els.bookEditForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const btn = els.bookEditForm.querySelector('[type="submit"]');
    withSavingState(btn, "保存中…", () => saveBookEdit(new FormData(els.bookEditForm)));
  });

  els.meAvatarBtn?.addEventListener("click", openMeDrawer);
  els.meDrawerOverlay?.addEventListener("click", closeMeDrawer);
  els.logoutBtn?.addEventListener("click", () => { logout(); closeMeDrawer(); });
  els.logoutAllBtn?.addEventListener("click", () => { closeMeDrawer(); logoutAllDevices(); });
  els.exportButton?.addEventListener("click", exportData);
  els.exportAccountBtn?.addEventListener("click", () => { closeMeDrawer(); exportAccount(); });
  els.deleteAccountBtn?.addEventListener("click", () => { closeMeDrawer(); deleteAccount(); });
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
  els.ocrButton?.addEventListener("click", () => runOcrFromImage("fast"));
  els.aiOcrButton?.addEventListener("click", () => runOcrFromImage("ai"));
  els.bookOcrButton?.addEventListener("click", () => runBookOcr());

  els.quotesList?.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-card-menu-toggle]");
    if (toggle) { event.stopPropagation(); toggleCardMenu(toggle); return; }
    const menuItem = event.target.closest("[data-quote-menu]");
    if (menuItem) {
      event.stopPropagation();
      const id = menuItem.closest("[data-quote-id]")?.dataset.quoteId;
      closeAllCardMenus();
      const action = menuItem.dataset.quoteMenu;
      if (action === "edit") editQuote(id);
      else if (action === "delete") deleteQuote(id);
      else if (action === "chat") goToQuoteChat(id);
      else if (action === "connect") openConnectionDialog({ sourceType: "quote", sourceId: id });
      else if (action === "share") shareQuoteCard(id);
      return;
    }
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

  els.importResultOkBtn?.addEventListener("click", () => {
    els.importResultDialog?.close();
  });

  els.importExcelInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    await importExcel(file);
    event.target.value = "";
  });

  // OPT-001: books-page secondary entry opens a guide dialog first (format
  // help + downloadable template); "选择文件" forwards to the drawer's hidden
  // Excel input so both entries share one change handler.
  els.importExcelBooksBtn?.addEventListener("click", () => {
    if (els.importExcelDialog) {
      els.importExcelDialog.showModal();
    } else {
      els.importExcelInput?.click();
    }
  });

  els.chooseExcelFileBtn?.addEventListener("click", () => {
    els.importExcelDialog?.close();
    els.importExcelInput?.click();
  });

  els.importExcelCancelBtn?.addEventListener("click", () => {
    els.importExcelDialog?.close();
  });

  els.downloadExcelTemplateBtn?.addEventListener("click", () => {
    downloadExcelTemplate();
  });

  els.bookEditImageInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (pendingBookEditImage?.objectUrl) URL.revokeObjectURL(pendingBookEditImage.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    const compressionPromise = resizeImageToDataUrl(file);
    pendingBookEditImage = { name: file.name, objectUrl, dataUrl: null, compressionPromise };
    renderBookEditImagePreview();
    if (els.bookEditImageStatus) els.bookEditImageStatus.textContent = "新封面已选择，保存后生效。";
    compressionPromise.then((dataUrl) => {
      if (pendingBookEditImage) pendingBookEditImage.dataUrl = dataUrl;
    }).catch(() => {});
  });

  els.bookImageInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (pendingBookImage?.objectUrl) URL.revokeObjectURL(pendingBookImage.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    const compressionPromise = resizeImageToDataUrl(file);
    pendingBookImage = { name: file.name, objectUrl, dataUrl: null, compressionPromise };
    renderBookImagePreview();
    if (els.bookImageStatus) els.bookImageStatus.textContent = "封面已选择，保存书籍后会自动上传。";
    showToast("封面已载入");
    compressionPromise.then((dataUrl) => {
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

  document.addEventListener("click", closeAllCardMenus);
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
  // OPT-029 Layer B / E35: lets chat.js refresh the optimistic-locking token
  // from the SSE stream's done event (which bypasses apiFetch).
  setStateVersion: (v) => { if (typeof v === "string") stateVersion = v; },
  getStateVersion: () => stateVersion,
  refreshSessionState,
  loadRemoteLogs,
  getRemoteLogs: () => remoteLogs,
  clearChatHistory,
  showConfirmDialog,
  normalizeChatContext,
  chatContextHistoryKey,
  getChatHistoryForContext(context) {
    return state.chatHistories?.[chatContextHistoryKey(context)] || [];
  },
  setChatHistoryForContext(context, history) {
    const normalized = normalizeChatContext(context);
    const historyKey = chatContextHistoryKey(normalized);
    state.chatHistories = state.chatHistories || {};
    state.chatContexts = state.chatContexts || {};
    state.chatHistories[historyKey] = Array.isArray(history) ? history : [];
    state.chatContexts[historyKey] = normalized;
  },
  getChatHistoryForBook(bookId) {
    return state.chatHistories?.[chatContextHistoryKey(normalizeChatContext(null, bookId))] || [];
  },
  setChatHistoryForBook(bookId, history) {
    const context = normalizeChatContext(null, bookId);
    const historyKey = chatContextHistoryKey(context);
    state.chatHistories = state.chatHistories || {};
    state.chatContexts = state.chatContexts || {};
    state.chatHistories[historyKey] = Array.isArray(history) ? history : [];
    state.chatContexts[historyKey] = context;
  },
};

bindEvents();
render();
activateTab("books");
loadSession();
maybeOpenResetPasswordDialog();
maybeShowPlusReturnToast();
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("hashchange", maybeOpenResetPasswordDialog);
}
