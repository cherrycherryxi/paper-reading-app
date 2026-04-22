const STORAGE_KEY = "paper-reading-app-v2";

const initialState = {
  books: [],
  sessions: [],
  quotes: [],
};

const statusMap = {
  reading: "阅读中",
  wishlist: "待读",
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
  statusFilter: document.querySelector("#statusFilter"),
  quoteFilter: document.querySelector("#quoteFilter"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  booksList: document.querySelector("#booksList"),
  timeline: document.querySelector("#timeline"),
  quotesList: document.querySelector("#quotesList"),
  statsGrid: document.querySelector("#statsGrid"),
  sessionBookSelect: document.querySelector("#sessionBookSelect"),
  quoteBookSelect: document.querySelector("#quoteBookSelect"),
  quoteContent: document.querySelector("#quoteContent"),
  quoteImageInput: document.querySelector("#quoteImageInput"),
  quoteImagePreview: document.querySelector("#quoteImagePreview"),
  quotePreviewImg: document.querySelector("#quotePreviewImg"),
  ocrButton: document.querySelector("#ocrButton"),
  ocrStatus: document.querySelector("#ocrStatus"),
  heroBooks: document.querySelector("#heroBooks"),
  heroMinutes: document.querySelector("#heroMinutes"),
  heroPages: document.querySelector("#heroPages"),
  toast: document.querySelector("#toast"),
  progressDialog: document.querySelector("#progressDialog"),
  progressForm: document.querySelector("#progressForm"),
  progressDialogTitle: document.querySelector("#progressDialogTitle"),
  cancelDialog: document.querySelector("#cancelDialog"),
  bookCardTemplate: document.querySelector("#bookCardTemplate"),
};

let state = loadState();
let toastTimer = null;
let pendingQuoteImage = null;
let ocrSupported = false;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        books: Array.isArray(parsed.books) ? parsed.books : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      };
    }

    const legacy = localStorage.getItem("paper-reading-app-v1");
    if (!legacy) {
      return structuredClone(initialState);
    }

    const parsedLegacy = JSON.parse(legacy);
    return {
      books: Array.isArray(parsedLegacy.books) ? parsedLegacy.books : [],
      sessions: Array.isArray(parsedLegacy.sessions) ? parsedLegacy.sessions : [],
      quotes: [],
    };
  } catch {
    return structuredClone(initialState);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("visible");
  }, 2200);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatDate(dateString) {
  if (!dateString) return "未记录";
  return new Date(dateString).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getProgress(book) {
  if (!book.totalPages) return null;
  return Math.max(0, Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)));
}

function getBookSessions(bookId) {
  return state.sessions.filter((session) => session.bookId === bookId);
}

function getBookMetrics(bookId) {
  const sessions = getBookSessions(bookId);
  return {
    minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
    pages: sessions.reduce((sum, session) => sum + session.pagesRead, 0),
    count: sessions.length,
  };
}

function getBookQuoteCount(bookId) {
  return state.quotes.filter((quote) => quote.bookId === bookId).length;
}

function renderBookSelect(selectEl, includeWishlist = false) {
  const options = [
    '<option value="">请选择一本书</option>',
    ...state.books
      .filter((book) => includeWishlist || book.status !== "wishlist")
      .map(
        (book) =>
          `<option value="${book.id}">${escapeHtml(book.title)}${
            book.author ? ` · ${escapeHtml(book.author)}` : ""
          }</option>`
      ),
  ];
  selectEl.innerHTML = options.join("");
}

function renderHero() {
  const totalMinutes = state.sessions.reduce((sum, session) => sum + session.minutes, 0);
  const totalPages = state.sessions.reduce((sum, session) => sum + session.pagesRead, 0);
  els.heroBooks.textContent = state.books.length;
  els.heroMinutes.textContent = totalMinutes;
  els.heroPages.textContent = totalPages;
}

function renderStats() {
  const stats = [
    { label: "阅读中", value: state.books.filter((book) => book.status === "reading").length, filter: "reading" },
    { label: "已读完", value: state.books.filter((book) => book.status === "finished").length, filter: "finished" },
    { label: "摘抄卡片", value: state.quotes.length, filter: "" },
    { label: "阅读会话", value: state.sessions.length, filter: "" },
  ];

  els.statsGrid.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat-card ${stat.filter ? 'stat-card-clickable' : ''}" ${stat.filter ? `data-filter="${stat.filter}"` : ''}>
          <strong>${stat.value}</strong>
          <span>${stat.label}</span>
        </div>
      `
    )
    .join("");
}

function renderBooks() {
  const filter = els.statusFilter.value;
  const books = [...state.books]
    .filter((book) => filter === "all" || book.status === filter)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  if (books.length === 0) {
    els.booksList.className = "book-list empty-state";
    els.booksList.textContent = "还没有匹配的书籍，先新增一本开始记录。";
    return;
  }

  els.booksList.className = "book-list";
  els.booksList.innerHTML = "";

  for (const book of books) {
    const node = els.bookCardTemplate.content.firstElementChild.cloneNode(true);
    const progress = getProgress(book);
    const metrics = getBookMetrics(book.id);

    node.dataset.bookId = book.id;
    node.querySelector(".status-pill").textContent = statusMap[book.status] || book.status;
    node.querySelector("h3").textContent = book.title;
    node.querySelector(".author-line").textContent = book.author || "作者未填写";
    node.querySelector(".progress-fill").style.width = `${progress ?? 0}%`;
    node.querySelector(".progress-copy").textContent =
      progress === null
        ? `已读到第 ${book.currentPage} 页`
        : `进度 ${progress}% · ${book.currentPage}/${book.totalPages} 页`;
    node.querySelector(".book-details").innerHTML = [
      `会话 ${metrics.count} 次`,
      `累计 ${metrics.pages} 页`,
      `卡片 ${getBookQuoteCount(book.id)} 张`,
      book.startedAt   ? `开始阅读 ${formatDate(book.startedAt)}`   : "尚未开始阅读",
      book.finishedAt  ? `阅读完成 ${formatDate(book.finishedAt)}`  : "尚未完成",
     //`最近阅读 ${formatDate(book.lastReadAt)}`,
      book.tags?.length ? `标签 ${book.tags.join(" / ")}` : "无标签",
    ]
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("");
    node.querySelector(".book-notes").textContent = book.notes || "暂无备注。";
    node.querySelector(".progress-button").addEventListener("click", () => openProgressDialog(book.id));
    els.booksList.appendChild(node);
  }
}

function renderTimeline() {
  const recent = [...state.sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  if (recent.length === 0) {
    els.timeline.className = "timeline empty-state";
    els.timeline.textContent = "还没有阅读记录，完成一次阅读会话后会显示在这里。";
    return;
  }

  els.timeline.className = "timeline";
  els.timeline.innerHTML = recent
    .map((session) => {
      const book = state.books.find((item) => item.id === session.bookId);
      return `
        <article class="timeline-item">
          <strong>${escapeHtml(book?.title || "未知书籍")}</strong>
          <div class="timeline-meta">${formatDate(session.date)} · ${session.startPage}-${session.endPage} 页 · ${
            session.minutes
          } 分钟</div>
          <div class="timeline-note">${escapeHtml(session.note || "无笔记")}</div>
        </article>
      `;
    })
    .join("");
}

function renderQuotes() {
  const filter = els.quoteFilter.value;
  const quotes = [...state.quotes]
    .filter((quote) => filter === "all" || quote.kind === filter)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  if (quotes.length === 0) {
    els.quotesList.className = "quote-list empty-state";
    els.quotesList.textContent = "还没有摘抄卡片。拍一页、识别一下，或者直接手动记下要点。";
    return;
  }

  els.quotesList.className = "quote-list";
  els.quotesList.innerHTML = quotes
    .map((quote) => {
      const book = state.books.find((item) => item.id === quote.bookId);
      return `
        <article class="quote-card">
          <div class="quote-card-head">
            <div>
              <p class="quote-kind">${escapeHtml(quoteKindMap[quote.kind] || "卡片")}</p>
              <h3>${escapeHtml(book?.title || "未知书籍")}</h3>
              <p class="quote-meta">第 ${quote.page || "-"} 页 · ${formatDate(quote.createdAt)}</p>
            </div>
            ${
              quote.ocrSource === "textdetector"
                ? '<span class="quote-badge">OCR</span>'
                : quote.imageData
                  ? '<span class="quote-badge quote-badge-muted">照片</span>'
                  : ""
            }
          </div>
          ${
            quote.imageData
              ? `<div class="quote-image-wrap"><img src="${quote.imageData}" alt="摘抄照片" /></div>`
              : ""
          }
          <blockquote class="quote-content">${escapeHtml(quote.content)}</blockquote>
          ${
            quote.reflection
              ? `<p class="quote-reflection">${escapeHtml(quote.reflection)}</p>`
              : ""
          }
          <div class="quote-footer">
            <span>${escapeHtml(book?.author || "作者未填写")}</span>
            <span>${quote.tags?.length ? escapeHtml(quote.tags.join(" / ")) : "无标签"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderOcrStatus() {
  const apiKey = localStorage.getItem("paper-reading-chat-apikey");
  els.ocrStatus.textContent = apiKey
    ? "将调用 DeepSeek 识别划线文字。"
    : "请先在对话窗口保存 API Key 后再使用 OCR。";
  els.ocrButton.disabled = false;
  // const text = ocrSupported
  //   ? "当前浏览器支持 OCR，可直接对照片尝试文字识别。"
  //   : "当前浏览器不支持原生 OCR，可上传照片留档并手动整理文字。";
  // els.ocrStatus.textContent = text;
  // els.ocrButton.disabled = !ocrSupported;
}

function renderImagePreview() {
  if (!pendingQuoteImage) {
    els.quoteImagePreview.classList.add("is-hidden");
    els.quotePreviewImg.removeAttribute("src");
    return;
  }

  els.quotePreviewImg.src = pendingQuoteImage.dataUrl;
  els.quoteImagePreview.classList.remove("is-hidden");
}

function render() {
  renderHero();
  renderStats();
  renderBooks();
  renderTimeline();
  renderQuotes();
  renderBookSelect(els.sessionBookSelect);
  renderBookSelect(els.quoteBookSelect, true);
  renderOcrStatus();
  renderImagePreview();
  persistState();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTags(raw) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function addBook(formData) {
  const totalPages = Number(formData.get("totalPages")) || 0;
  const currentPage = Number(formData.get("currentPage")) || 0;
  if (totalPages && currentPage > totalPages) {
    showToast("当前页码不能大于总页数");
    return;
  }

  state.books.unshift({
    id: createId("book"),
    title: String(formData.get("title")).trim(),
    author: String(formData.get("author")).trim(),
    totalPages,
    currentPage,
    status: String(formData.get("status")),
    tags: normalizeTags(String(formData.get("tags") || "")),
    notes: String(formData.get("notes")).trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,      // ← 新增
    finishedAt: null,     // ← 新增
    lastReadAt: null,
  });

  els.bookForm.reset();
  render();
  showToast("书籍已保存");
}

function addSession(formData) {
  const bookId = String(formData.get("bookId"));
  const startPage = Number(formData.get("startPage"));
  const endPage = Number(formData.get("endPage"));
  const minutes = Number(formData.get("minutes"));
  const dateValue = String(formData.get("date"));
  const date = dateValue ? new Date(`${dateValue}T12:00:00`).toISOString() : new Date().toISOString();

  if (!bookId) {
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

  const book = state.books.find((item) => item.id === bookId);
  if (!book) {
    showToast("未找到对应书籍");
    return;
  }
  if (book.totalPages && endPage > book.totalPages) {
    showToast("结束页不能超过总页数");
    return;
  }

  state.sessions.unshift({
    id: createId("session"),
    bookId,
    startPage,
    endPage,
    pagesRead: endPage - startPage,
    minutes,
    note: String(formData.get("note")).trim(),
    date,
    createdAt: new Date().toISOString(),
  });

  book.currentPage = Math.max(book.currentPage, endPage);
  book.lastReadAt = date;
  book.updatedAt = new Date().toISOString();

  // 第一次记录阅读时，写入开始日期
if (!book.startedAt) {
  book.startedAt = date;
}

if (book.totalPages && endPage >= book.totalPages) {
  book.status = "finished";
  // 首次完成时写入完成日期
  if (!book.finishedAt) {
    book.finishedAt = date;
  }
} else if (book.status !== "finished") {
  book.status = "reading";
}
  els.sessionForm.reset();
  render();
  showToast("阅读会话已记录");
  // 手机端保存后跳转到书单
  if (window.innerWidth <= 768 && typeof window.activateTab === 'function') {
    window.activateTab('books');
  }
}

function openProgressDialog(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;

  els.progressForm.elements.bookId.value = book.id;
  els.progressForm.elements.currentPage.value = book.currentPage;
  els.progressForm.elements.status.value = book.status;
  els.progressForm.elements.notes.value = book.notes || "";
  els.progressDialogTitle.textContent = `${book.title}${book.author ? ` · ${book.author}` : ""}`;
  els.progressDialog.showModal();
}

function updateBookProgress(formData) {
  const book = state.books.find((item) => item.id === String(formData.get("bookId")));
  if (!book) {
    return;
  }

  const currentPage = Number(formData.get("currentPage"));
  if (book.totalPages && currentPage > book.totalPages) {
    showToast("当前页码不能超过总页数");
    return;
  }

  book.currentPage = currentPage;
  book.status = String(formData.get("status"));
  book.notes = String(formData.get("notes")).trim();
  book.updatedAt = new Date().toISOString();
  if (book.status === "reading" || book.status === "finished") {
    book.lastReadAt = new Date().toISOString();
  }

  if (book.totalPages && currentPage >= book.totalPages) {
    book.status = "finished";
  }

  els.progressDialog.close();
  render();
  showToast("进度已更新");
}

function resetQuoteDraft() {
  pendingQuoteImage = null;
  els.quoteForm.reset();
  renderBookSelect(els.quoteBookSelect, true);
  renderImagePreview();
  renderOcrStatus();
}

function addQuote(formData) {
  const bookId = String(formData.get("bookId"));
  const content = String(formData.get("content")).trim();
  const page = Number(formData.get("page")) || 0;

  if (!bookId) {
    showToast("先选择一本书");
    return;
  }
  if (!content) {
    showToast("卡片内容不能为空");
    return;
  }

  state.quotes.unshift({
    id: createId("quote"),
    bookId,
    page,
    kind: String(formData.get("kind")),
    content,
    reflection: String(formData.get("reflection")).trim(),
    tags: normalizeTags(String(formData.get("tags") || "")),
    imageData: pendingQuoteImage?.dataUrl || "",
    imageName: pendingQuoteImage?.name || "",
    ocrSource: pendingQuoteImage?.ocrSource || "",
    createdAt: new Date().toISOString(),
  });

  resetQuoteDraft();
  render();
  showToast("摘抄卡片已保存");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paper-reading-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.books) || !Array.isArray(parsed.sessions)) {
        throw new Error("invalid");
      }
      state = {
        books: parsed.books,
        sessions: parsed.sessions,
        quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      };
      render();
      showToast("数据已导入");
    } catch {
      showToast("导入失败，JSON 格式不正确");
    }
  };
  reader.readAsText(file);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

async function handleQuoteImageChange(file) {
  if (!file) {
    pendingQuoteImage = null;
    renderImagePreview();
    return;
  }

  const dataUrl = await fileToDataUrl(file);
  pendingQuoteImage = {
    name: file.name,
    dataUrl,
    ocrSource: "",
  };
  renderImagePreview();
  showToast("图片已载入，可以直接保存，也可以先做 OCR");
}

async function imageBitmapFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function runOcrFromImage() {
  if (!pendingQuoteImage) {
    showToast("先拍照或选择一张图片");
    return;
  }

  els.ocrButton.disabled = true;
  els.ocrStatus.textContent = "正在识别划线文字…";

  try {
    const apiKey = localStorage.getItem("paper-reading-chat-apikey");
    if (!apiKey) {
      els.ocrStatus.textContent = "未找到 API Key，请先在对话窗口里保存一次。";
      showToast("请先在右下角对话窗口填写 API Key");
      return;
    }

    // 把 dataUrl 拆出 base64 部分
    const base64 = pendingQuoteImage.dataUrl.split(",")[1];
    const mimeType = pendingQuoteImage.dataUrl.split(";")[0].split(":")[1];

    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
              {
                type: "text",
                text: "请提取图片中所有被划线标注的文字，按出现顺序列出，每条单独一行，不需要其他解释。如果没有发现划线内容，回复‘未发现划线文字’。",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices[0].message.content.trim();

    if (text === "未发现划线文字") {
      els.ocrStatus.textContent = "未发现划线内容，建议重拍或手动输入。";
      showToast("未发现划线文字");
      return;
    }

    const current = els.quoteContent.value.trim();
    els.quoteContent.value = current ? `${current}\n\n${text}` : text;
    pendingQuoteImage.ocrSource = "deepseek-vision";
    els.ocrStatus.textContent = "识别完成，结果已填入内容框，可手动微调。";
    showToast("OCR 识别完成");

  } catch (err) {
    els.ocrStatus.textContent = `识别失败：${err.message}`;
    showToast("OCR 识别失败");
  } finally {
    els.ocrButton.disabled = false;
  }
}

// async function runOcrFromImage() {
//   if (!pendingQuoteImage) {
//     showToast("先拍照或选择一张图片");
//     return;
//   }
//   if (!ocrSupported) {
//     showToast("当前浏览器不支持原生 OCR");
//     return;
//   }

//   els.ocrButton.disabled = true;
//   els.ocrStatus.textContent = "正在识别图片文字…";

//   try {
//     const detector = new TextDetector();
//     const bitmap = await imageBitmapFromDataUrl(pendingQuoteImage.dataUrl);
//     const blocks = await detector.detect(bitmap);
//     const text = blocks
//       .map((block) => block.rawValue?.trim())
//       .filter(Boolean)
//       .join("\n");

//     if (!text) {
//       els.ocrStatus.textContent = "没有识别到清晰文字，建议重拍或手动整理。";
//       showToast("OCR 未识别到文字");
//       return;
//     }

//     const current = els.quoteContent.value.trim();
//     els.quoteContent.value = current ? `${current}\n\n${text}` : text;
//     pendingQuoteImage.ocrSource = "textdetector";
//     els.ocrStatus.textContent = "OCR 完成，已把识别结果填入内容框。";
//     showToast("OCR 识别完成");
//   } catch {
//     els.ocrStatus.textContent = "OCR 失败，可能是浏览器限制或图片质量不足。";
//     showToast("OCR 识别失败");
//   } finally {
//     els.ocrButton.disabled = !ocrSupported;
//   }
// }

function detectOcrCapability() {
  // 改用 DeepSeek Vision，不再依赖浏览器原生 TextDetector
  ocrSupported = true;
  // ocrSupported = typeof window.TextDetector === "function";
}

els.bookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addBook(new FormData(els.bookForm));
});

els.sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addSession(new FormData(els.sessionForm));
});

els.quoteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addQuote(new FormData(els.quoteForm));
});

els.progressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateBookProgress(new FormData(els.progressForm));
});

els.cancelDialog.addEventListener("click", () => {
  els.progressDialog.close();
});

els.quoteImageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    await handleQuoteImageChange(file);
  } catch {
    showToast("图片读取失败");
  }
});

els.ocrButton.addEventListener("click", async () => {
  await runOcrFromImage();
});

els.statusFilter.addEventListener("change", renderBooks);
els.quoteFilter.addEventListener("change", renderQuotes);
els.exportButton.addEventListener("click", exportData);
els.importInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) {
    importData(file);
  }
  event.target.value = "";
});

detectOcrCapability();
render();

// ── Mobile Tab Navigation ──
(function () {
  const tabs = document.querySelectorAll('.mobile-tab');
  if (!tabs.length) return;

  function activateTab(tabName) {
    // 更新按钮状态
    tabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 更新 section 显示
    document.querySelectorAll('.layout [data-tab-section]').forEach(section => {
      section.classList.toggle('tab-active', section.dataset.tabSection === tabName);
    });

   
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // 默认激活书单
  activateTab('books');
})();
