const { loadState, saveState, createId } = require("../../utils/store");

const statusOptions = [
  { value: "reading", label: "阅读中" },
  { value: "wishlist", label: "待读" },
  { value: "paused", label: "暂停" },
  { value: "finished", label: "已读完" }
];

const quoteKindOptions = [
  { value: "quote", label: "摘抄" },
  { value: "note", label: "笔记" }
];

Page({
  data: {
    statusOptions,
    quoteKindOptions,
    statusFilterOptions: [{ value: "all", label: "全部" }, ...statusOptions],
    quoteFilterOptions: [
      { value: "all", label: "全部卡片" },
      { value: "quote", label: "只看摘抄" },
      { value: "note", label: "只看笔记" }
    ],
    statusFilter: "all",
    quoteFilter: "all",
    state: {
      books: [],
      sessions: [],
      quotes: []
    },
    stats: {
      books: 0,
      minutes: 0,
      quotes: 0
    },
    bookOptions: [],
    filteredBooks: [],
    recentSessions: [],
    filteredQuotes: [],
    sessionBookLabel: "请选择一本书",
    quoteBookLabel: "请选择一本书",
    bookDraft: {
      title: "",
      author: "",
      totalPages: "",
      currentPage: "0",
      statusIndex: 0,
      tags: "",
      notes: ""
    },
    sessionDraft: {
      bookIndex: 0,
      startPage: "",
      endPage: "",
      minutes: "",
      note: ""
    },
    quoteDraft: {
      bookIndex: 0,
      page: "",
      kindIndex: 0,
      tags: "",
      content: "",
      reflection: "",
      imageData: ""
    }
  },

  onLoad() {
    this.hydrate();
  },

  hydrate() {
    const state = loadState();
    this.setData({ state });
    this.renderDerived();
  },

  renderDerived() {
    const { books, sessions, quotes } = this.data.state;
    const bookOptions = books.map((book) => ({
      id: book.id,
      title: book.author ? `${book.title} · ${book.author}` : book.title
    }));

    const filteredBooks = books
      .filter((book) => this.data.statusFilter === "all" || book.status === this.data.statusFilter)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .map((book) => {
        const progress = this.getProgress(book);
        const bookQuoteCount = quotes.filter((quote) => quote.bookId === book.id).length;
        return {
          ...book,
          statusLabel: statusOptions.find((item) => item.value === book.status)?.label || book.status,
          progressWidth: progress === null ? "8%" : `${progress}%`,
          progressText:
            progress === null
              ? `已读到第 ${book.currentPage || 0} 页`
              : `进度 ${progress}% · ${book.currentPage || 0}/${book.totalPages} 页`,
          metaText: `会话 ${sessions.filter((session) => session.bookId === book.id).length} 次 · 卡片 ${bookQuoteCount} 张`
        };
      });

    const recentSessions = [...sessions]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 10)
      .map((session) => ({
        ...session,
        bookTitle: books.find((book) => book.id === session.bookId)?.title || "未知书籍",
        dateLabel: this.formatDate(session.createdAt)
      }));

    const filteredQuotes = [...quotes]
      .filter((quote) => this.data.quoteFilter === "all" || quote.kind === this.data.quoteFilter)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .map((quote) => ({
        ...quote,
        bookTitle: books.find((book) => book.id === quote.bookId)?.title || "未知书籍",
        kindLabel: quoteKindOptions.find((item) => item.value === quote.kind)?.label || quote.kind,
        pageLabel: quote.page || "-",
        dateLabel: this.formatDate(quote.createdAt),
        tagsLabel: Array.isArray(quote.tags) && quote.tags.length ? quote.tags.join(" / ") : "无标签"
      }));

    this.setData({
      bookOptions,
      filteredBooks,
      recentSessions,
      filteredQuotes,
      stats: {
        books: books.length,
        minutes: sessions.reduce((sum, session) => sum + Number(session.minutes || 0), 0),
        quotes: quotes.length
      },
      sessionBookLabel: bookOptions[this.data.sessionDraft.bookIndex]?.title || "请选择一本书",
      quoteBookLabel: bookOptions[this.data.quoteDraft.bookIndex]?.title || "请选择一本书"
    });
  },

  onInputChange(event) {
    const { form, field } = event.currentTarget.dataset;
    const value = event.detail.value;
    this.setData({
      [`${form}.${field}`]: value
    });
  },

  onBookStatusChange(event) {
    this.setData({
      "bookDraft.statusIndex": Number(event.detail.value)
    });
  },

  onSessionBookChange(event) {
    const bookIndex = Number(event.detail.value);
    this.setData({
      "sessionDraft.bookIndex": bookIndex,
      sessionBookLabel: this.data.bookOptions[bookIndex]?.title || "请选择一本书"
    });
  },

  onQuoteBookChange(event) {
    const bookIndex = Number(event.detail.value);
    this.setData({
      "quoteDraft.bookIndex": bookIndex,
      quoteBookLabel: this.data.bookOptions[bookIndex]?.title || "请选择一本书"
    });
  },

  onQuoteKindChange(event) {
    this.setData({
      "quoteDraft.kindIndex": Number(event.detail.value)
    });
  },

  onStatusFilterTap(event) {
    this.setData({
      statusFilter: event.currentTarget.dataset.value
    });
    this.renderDerived();
  },

  onQuoteFilterTap(event) {
    this.setData({
      quoteFilter: event.currentTarget.dataset.value
    });
    this.renderDerived();
  },

  saveBook() {
    const { bookDraft, state } = this.data;
    const totalPages = Number(bookDraft.totalPages || 0);
    const currentPage = Number(bookDraft.currentPage || 0);

    if (!bookDraft.title.trim()) {
      return this.toast("书名不能为空");
    }
    if (totalPages && currentPage > totalPages) {
      return this.toast("当前页码不能大于总页数");
    }

    const nextState = {
      ...state,
      books: [
        {
          id: createId("book"),
          title: bookDraft.title.trim(),
          author: bookDraft.author.trim(),
          totalPages,
          currentPage,
          status: statusOptions[bookDraft.statusIndex].value,
          tags: this.normalizeTags(bookDraft.tags),
          notes: bookDraft.notes.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        ...state.books
      ]
    };

    saveState(nextState);
    this.setData({
      state: nextState,
      bookDraft: {
        title: "",
        author: "",
        totalPages: "",
        currentPage: "0",
        statusIndex: 0,
        tags: "",
        notes: ""
      }
    });
    this.renderDerived();
    this.toast("书籍已保存");
  },

  saveSession() {
    const { state, sessionDraft, bookOptions } = this.data;
    const book = state.books.find((item) => item.id === bookOptions[sessionDraft.bookIndex]?.id);
    const startPage = Number(sessionDraft.startPage || 0);
    const endPage = Number(sessionDraft.endPage || 0);
    const minutes = Number(sessionDraft.minutes || 0);

    if (!book) {
      return this.toast("先选择一本书");
    }
    if (endPage < startPage) {
      return this.toast("结束页不能小于开始页");
    }
    if (minutes <= 0) {
      return this.toast("阅读分钟必须大于 0");
    }
    if (book.totalPages && endPage > book.totalPages) {
      return this.toast("结束页不能超过总页数");
    }

    const nextBooks = state.books.map((item) => {
      if (item.id !== book.id) return item;
      const nextCurrentPage = Math.max(Number(item.currentPage || 0), endPage);
      return {
        ...item,
        currentPage: nextCurrentPage,
        status: item.totalPages && nextCurrentPage >= item.totalPages ? "finished" : "reading",
        updatedAt: new Date().toISOString()
      };
    });

    const nextState = {
      ...state,
      books: nextBooks,
      sessions: [
        {
          id: createId("session"),
          bookId: book.id,
          startPage,
          endPage,
          minutes,
          note: sessionDraft.note.trim(),
          createdAt: new Date().toISOString()
        },
        ...state.sessions
      ]
    };

    saveState(nextState);
    this.setData({
      state: nextState,
      sessionDraft: {
        bookIndex: 0,
        startPage: "",
        endPage: "",
        minutes: "",
        note: ""
      }
    });
    this.renderDerived();
    this.toast("阅读会话已记录");
  },

  async saveQuote() {
    const { state, quoteDraft, bookOptions } = this.data;
    const book = state.books.find((item) => item.id === bookOptions[quoteDraft.bookIndex]?.id);

    if (!book) {
      return this.toast("先选择一本书");
    }
    if (!quoteDraft.content.trim()) {
      return this.toast("摘抄内容不能为空");
    }

    const nextState = {
      ...state,
      quotes: [
        {
          id: createId("quote"),
          bookId: book.id,
          page: Number(quoteDraft.page || 0),
          kind: quoteKindOptions[quoteDraft.kindIndex].value,
          tags: this.normalizeTags(quoteDraft.tags),
          content: quoteDraft.content.trim(),
          reflection: quoteDraft.reflection.trim(),
          imageData: quoteDraft.imageData || "",
          createdAt: new Date().toISOString()
        },
        ...state.quotes
      ]
    };

    saveState(nextState);
    this.setData({
      state: nextState,
      quoteDraft: {
        bookIndex: 0,
        page: "",
        kindIndex: 0,
        tags: "",
        content: "",
        reflection: "",
        imageData: ""
      }
    });
    this.renderDerived();
    this.toast("摘抄卡片已保存");
  },

  takePhoto() {
    this.pickImage(["camera"]);
  },

  chooseImage() {
    this.pickImage(["album"]);
  },

  pickImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType,
      success: async (res) => {
        const tempFilePath = res.tempFiles?.[0]?.tempFilePath;
        if (!tempFilePath) {
          return this.toast("没有获取到图片");
        }

        try {
          const imageData = await this.tempFileToDataUrl(tempFilePath);
          this.setData({
            "quoteDraft.imageData": imageData
          });
          this.toast(sourceType[0] === "camera" ? "拍照成功" : "图片已载入");
        } catch {
          this.toast("图片读取失败");
        }
      },
      fail: () => {
        this.toast("已取消选择图片");
      }
    });
  },

  tempFileToDataUrl(tempFilePath) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath: tempFilePath,
        encoding: "base64",
        success: (res) => {
          resolve(`data:image/jpeg;base64,${res.data}`);
        },
        fail: reject
      });
    });
  },

  previewDraftImage() {
    if (!this.data.quoteDraft.imageData) return;
    wx.previewImage({
      urls: [this.data.quoteDraft.imageData],
      current: this.data.quoteDraft.imageData
    });
  },

  previewQuoteImage(event) {
    const src = event.currentTarget.dataset.src;
    wx.previewImage({
      urls: [src],
      current: src
    });
  },

  showOcrHint() {
    wx.showModal({
      title: "OCR 说明",
      content:
        "这版小程序已经支持直接拍照留档。OCR 建议接云函数或后端识别服务来做，准确率和兼容性都比纯前端方案更稳。",
      showCancel: false
    });
  },

  getProgress(book) {
    if (!book.totalPages) return null;
    return Math.max(0, Math.min(100, Math.round((Number(book.currentPage || 0) / Number(book.totalPages)) * 100)));
  },

  formatDate(dateString) {
    if (!dateString) return "未记录";
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
  },

  normalizeTags(raw) {
    return String(raw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  },

  toast(title) {
    wx.showToast({
      title,
      icon: "none"
    });
  }
});
