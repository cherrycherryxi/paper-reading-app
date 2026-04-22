const STORAGE_KEY = "paper-reading-miniprogram-v1";

const initialState = {
  books: [],
  sessions: [],
  quotes: []
};

function loadState() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (!saved) {
      return { ...initialState };
    }

    return {
      books: Array.isArray(saved.books) ? saved.books : [],
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      quotes: Array.isArray(saved.quotes) ? saved.quotes : []
    };
  } catch {
    return { ...initialState };
  }
}

function saveState(state) {
  wx.setStorageSync(STORAGE_KEY, state);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

module.exports = {
  STORAGE_KEY,
  loadState,
  saveState,
  createId
};
