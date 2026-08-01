// OPT-109: cross-page OCR — when two images are loaded, fast OCR runs serially on
// both and concatenates the recognised text with a blank line separator.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

const PAGE1_LINES = ["第一页第一行。", "第一页第二行。", "第一页第三行。"];
const PAGE2_LINES = ["第二页第一行。", "第二页第二行。", "第二页第三行。"];
const TEXT1 = PAGE1_LINES.join("\n");
const TEXT2 = PAGE2_LINES.join("\n");
const TEXT1_FLAT = PAGE1_LINES.join("");
const TEXT2_FLAT = PAGE2_LINES.join("");

function fieldStub(value = "") {
  return { value, dataset: {} };
}

function createOcrSelectorStub() {
  const state = { hidden: true, oninput: null, onclick: null };
  let html = "";
  let rows = [];
  return {
    get hidden() { return state.hidden; },
    set hidden(v) { state.hidden = v; },
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = String(v);
      rows = [];
      const rowPattern = /data-section="(\d+)"[^>]*>\s*<textarea[^>]*>([\s\S]*?)<\/textarea>/g;
      let match;
      while ((match = rowPattern.exec(html))) {
        const row = { dataset: { section: match[1] } };
        const input = {
          value: match[2],
          style: {},
          scrollHeight: 24,
          closest: () => row,
        };
        row.input = input;
        rows.push(row);
      }
    },
    get oninput() { return state.oninput; },
    set oninput(v) { state.oninput = v; },
    get onclick() { return state.onclick; },
    set onclick(v) { state.onclick = v; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === ".ocr-line-selector__input") return rows.map((row) => row.input);
      if (selector === ".ocr-line-selector__row") return rows;
      return [];
    },
    get rows() { return rows; },
  };
}

function createHarness(opts = {}) {
  const { secondImageDataUrl = "data:image/jpeg;base64,img2", fetchReturnsText2 = true, firstResponseStatus = "done" } = opts;

  const ocrSel = createOcrSelectorStub();
  const quoteContent = fieldStub("");
  const ocrStatus = { textContent: "" };
  const ocrButton = { disabled: false };
  const aiOcrButton = { disabled: false };

  const formFields = {
    '[name="bookId"]': fieldStub("b1"),
    '[name="id"]': fieldStub("q1"),
    '[name="page"]': fieldStub("10"),
    '[name="kind"]': fieldStub("quote"),
    '[name="reflection"]': fieldStub(""),
    '[name="tags"]': fieldStub(""),
  };
  const quoteForm = {
    dataset: {},
    querySelector: (sel) => formFields[sel] || fieldStub(""),
  };

  const elsOverrides = { ocrLineSelector: ocrSel, quoteContent, ocrStatus, ocrButton, aiOcrButton, quoteForm };

  const document = {
    querySelector: () => ({ value: "", dataset: {}, classList: { add() {}, remove() {} }, querySelector: () => null }),
    querySelectorAll: () => [],
    createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => "data:image/jpeg;base64,x" }),
    getElementById: () => ({ value: "" }),
    body: {},
    addEventListener() {},
  };
  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true, location: {},
  };

  const fetchCalls = [];
  // First call returns TEXT1, subsequent calls return TEXT2.
  let callIndex = 0;
  const context = {
    console, document, window,
    localStorage: { getItem: () => "tok", setItem() {}, removeItem() {} },
    fetch: async (url, opts2) => {
      fetchCalls.push(String(url));
      if (String(url).includes("/api/quotes/ocr")) {
        const isFirstCall = callIndex === 0;
        const recognizedText = isFirstCall ? TEXT1 : (fetchReturnsText2 ? TEXT2 : "");
        const responseStatus = isFirstCall ? firstResponseStatus : "done";
        callIndex++;
        return {
          ok: true, status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            state: {
              books: [{ id: "b1", title: "B" }], sessions: [],
              quotes: [{ id: "q1", bookId: "b1", content: recognizedText, imageUrl: "/media/u/x.jpg", ocrStatus: responseStatus }],
              chatHistories: {}, connections: [],
            },
            stateVersion: "v1",
            quoteId: "q1",
            status: responseStatus,
            recognizedText: responseStatus === "pending" ? "" : recognizedText,
          }),
        };
      }
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ logs: [] }) };
    },
    CustomEvent: function(t) { this.type = t; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    FormData, structuredClone, Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");
  const instrumented = `${sourceWithoutBoot}
renderHero = () => {};
renderSummary = () => {};
renderQuotes = () => {};
renderConnections = () => {};
renderBooks = () => {};
renderImagePreview = () => {};
resizeImageToDataUrl = async () => "data:image/jpeg;base64,compressed";
renderModelLogs = () => {};
loadRemoteLogs = async () => {};
scheduleOcrStatusRefresh = () => {};
showToast = () => {};
isTabActive = () => false;
globalThis.__hooks = {
  els,
  runOcrFromImage,
  rebuildQuoteContentFromOcrPanel,
  handleQuoteImage2Change,
  loadQuoteImageSelection,
  setState(v) { state = v; },
  getState() { return state; },
  setCurrentUser(v) { currentUser = v; },
  setAuthToken(v) { authToken = v; },
  setPendingImage(v) { pendingQuoteImage = v; },
  setPendingImage2(v) { pendingQuoteImage2 = v; },
  getPendingImages() { return { first: pendingQuoteImage, second: pendingQuoteImage2 }; },
};
`;
  vm.runInNewContext(instrumented, context, { filename: "app.js" });
  const hooks = context.__hooks;
  Object.assign(hooks.els, elsOverrides);
  hooks.setCurrentUser({ id: "u1", username: "t" });
  hooks.setAuthToken("tok");
  hooks.setState({ books: [{ id: "b1", title: "B" }], sessions: [], quotes: [], chatHistories: {}, connections: [] });
  hooks.setPendingImage({ name: "p1.jpg", dataUrl: "data:image/jpeg;base64,img1", ocrSource: "" });
  if (secondImageDataUrl) {
    hooks.setPendingImage2({ name: "p2.jpg", dataUrl: secondImageDataUrl, ocrSource: "" });
  }
  return { hooks, ocrSel, quoteContent, ocrStatus, fetchCalls };
}

test("two images: fast OCR preserves both pages' Baidu visual lines before rebuilding content", async () => {
  const { hooks, ocrSel, quoteContent, fetchCalls } = createHarness();
  await hooks.runOcrFromImage("fast");

  const ocrCalls = fetchCalls.filter((u) => u.includes("/api/quotes/ocr"));
  assert.equal(ocrCalls.length, 2, "must call OCR API twice — once per image");
  assert.equal(quoteContent.value, `${TEXT1_FLAT}\n\n${TEXT2_FLAT}`, "textarea must reflow each page and retain the page break");
  assert.deepEqual(
    Array.from(ocrSel.rows, (row) => row.dataset.section),
    ["0", "0", "0", "1", "1", "1"],
    "line editor must receive all original lines from page 1 and page 2",
  );
});

test("two images: status text reflects two-page completion", async () => {
  const { hooks, ocrStatus } = createHarness();
  await hooks.runOcrFromImage("fast");
  assert.ok(ocrStatus.textContent.includes("两页"), "status text must mention 两页 when second page succeeds");
});

test("single image: fast OCR calls API once, no concatenation", async () => {
  const { hooks, quoteContent, fetchCalls } = createHarness({ secondImageDataUrl: null });
  await hooks.runOcrFromImage("fast");

  const ocrCalls = fetchCalls.filter((u) => u.includes("/api/quotes/ocr"));
  assert.equal(ocrCalls.length, 1, "must call OCR API exactly once when only one image is loaded");
  assert.equal(quoteContent.value, TEXT1_FLAT, "textarea contains the reflowed first-image text");
});

test("two images: second page returns no text — only first page text kept", async () => {
  const { hooks, quoteContent } = createHarness({ fetchReturnsText2: false });
  await hooks.runOcrFromImage("fast");
  assert.equal(quoteContent.value, TEXT1_FLAT, "textarea keeps first page text when second page OCR returns nothing");
});

test("AI path ignores second image (second API call not made)", async () => {
  // AI path returns status "pending" — the second-page branch is in the fast-path
  // else block, so a "pending" response skips it entirely.
  const { hooks, fetchCalls } = createHarness({ firstResponseStatus: "pending" });
  await hooks.runOcrFromImage("ai");

  const ocrCalls = fetchCalls.filter((u) => u.includes("/api/quotes/ocr"));
  assert.equal(ocrCalls.length, 1, "AI path must not trigger second-page OCR (async path, out of Phase 1 scope)");
});

test("separate captures: adding the second photo keeps the first photo intact", async () => {
  const { hooks } = createHarness({ secondImageDataUrl: null });
  hooks.setPendingImage(null);
  hooks.setPendingImage2(null);

  await hooks.loadQuoteImageSelection([{ name: "page-1.jpg" }]);
  await hooks.handleQuoteImage2Change({ name: "page-2.jpg" });

  const { first, second } = hooks.getPendingImages();
  assert.equal(first.name, "page-1.jpg");
  assert.equal(second.name, "page-2.jpg");
});

test("OCR line editor retains the blank separator between two photo pages", () => {
  const { hooks, quoteContent } = createHarness({ secondImageDataUrl: null });
  const input = (value, section) => ({
    value,
    closest: () => ({ dataset: { section: String(section) } }),
  });
  const selector = {
    querySelectorAll: () => [
      input("第一页第一行", 0),
      input("第一页第二行", 0),
      input("第二页第一行", 1),
      input("第二页第二行", 1),
    ],
  };

  hooks.rebuildQuoteContentFromOcrPanel(selector);
  assert.equal(quoteContent.value, "第一页第一行第一页第二行\n\n第二页第一行第二页第二行");
});
