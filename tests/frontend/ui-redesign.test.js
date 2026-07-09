const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stylesPath = path.join(__dirname, "..", "..", "styles.css");
const indexPath = path.join(__dirname, "..", "..", "index.html");
const appJsPath = path.join(__dirname, "..", "..", "app.js");
const styles = fs.readFileSync(stylesPath, "utf8");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const appSource = fs.readFileSync(appJsPath, "utf8");

function getRuleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "m"));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

test("property: warm reading background is tokenized without body gradients", () => {
  assert.match(styles, /--color-bg:\s*#f5f0e8;/i);
  assert.match(styles, /--color-surface:\s*#fefcf7;/i);
  assert.match(styles, /--color-surface-alt:\s*#faf6ec;/i);
  const bodyRuleMatch = styles.match(/\nbody\s*\{\s*font-family:\s*var\(--font-sans\);[\s\S]*?\n\}/m);
  assert.ok(bodyRuleMatch, "Missing primary body theme rule");
  const bodyRule = bodyRuleMatch[0];
  assert.match(bodyRule, /font-family:\s*var\(--font-sans\);/);
  assert.match(bodyRule, /background:\s*var\(--color-bg\);/);
  assert.doesNotMatch(bodyRule, /radial-gradient|linear-gradient/);
  const bodyBeforeRule = getRuleBlock("body::before");
  assert.match(bodyBeforeRule, /display:\s*none;/);
});

test("property: yellow CTA buttons and progress fills use the new palette", () => {
  const buttonPrimary = getRuleBlock(".button-primary");
  assert.match(buttonPrimary, /background:\s*var\(--color-yellow\);/);
  assert.match(buttonPrimary, /color:\s*var\(--color-ink\);/);
  assert.match(getRuleBlock(".button"), /border-radius:\s*var\(--radius-pill\);/);

  const progressFill = getRuleBlock(".profile-progress-fill,\n.progress-fill");
  assert.match(progressFill, /background:\s*var\(--color-yellow\);/);
});

test("property: active filters are dark and regular tag chips stay soft", () => {
  const activeFilter = getRuleBlock(".filter-chip.active");
  assert.match(activeFilter, /background:\s*var\(--color-tag-bg\);/);
  assert.match(activeFilter, /color:\s*var\(--color-tag-text\);/);
  assert.match(activeFilter, /border-color:\s*var\(--color-tag-bg\);/);

  const regularTags = getRuleBlock(".tag-chip,\n.book-tag-chip");
  assert.match(regularTags, /background:\s*var\(--color-soft-accent2\);/);
  assert.match(regularTags, /color:\s*var\(--color-ink\);/);
  assert.match(regularTags, /border-color:\s*var\(--color-soft-accent2\);/);

  const filterChip = getRuleBlock(".filter-chip");
  assert.match(filterChip, /border:\s*1px solid var\(--color-border\);/);
  assert.match(filterChip, /background:\s*var\(--color-surface\);/);
  assert.match(filterChip, /color:\s*var\(--color-ink-muted\);/);
});

test("property: grid cards use white surfaces, radius-md, and card shadows", () => {
  const cards = getRuleBlock(".book-grid-card,\n.session-grid-card,\n.quote-grid-card");
  assert.match(cards, /background:\s*var\(--color-surface\);/);
  assert.match(cards, /border-radius:\s*var\(--radius-md\);/);
  assert.match(cards, /box-shadow:\s*var\(--shadow-card\);/);
});

test("property: book and quote grids use compact, equal-height card behavior", () => {
  const compactLists = getRuleBlock(".book-list,\n.quote-list");
  assert.match(compactLists, /align-items:\s*stretch;/);

  const compactCards = getRuleBlock(".book-grid-card,\n.quote-grid-card");
  assert.match(compactCards, /display:\s*flex;/);
  assert.match(compactCards, /flex-direction:\s*column;/);
  assert.match(compactCards, /height:\s*100%;/);
  assert.match(compactCards, /overflow:\s*hidden;/);

  const cardTitle = getRuleBlock(".book-grid-body h3,\n.entry-card-body h3");
  assert.match(cardTitle, /line-clamp:\s*2;/);
  assert.match(cardTitle, /-webkit-line-clamp:\s*2;/);

  const quoteNote = getRuleBlock(".entry-card-note-clamp");
  assert.match(quoteNote, /line-clamp:\s*5;/);
  assert.match(quoteNote, /-webkit-line-clamp:\s*5;/);
  assert.match(appSource, /<p class="entry-card-note entry-card-note-clamp">\$\{escapeHtml\(quoteContent\)\}<\/p>/);
});

test("regression: quote OCR can start from an image-only draft", () => {
  assert.doesNotMatch(
    indexHtml,
    /<textarea name="content" id="quoteContent"[^>]*required/,
    "Quote content textarea must allow image-only drafts"
  );
  assert.match(appSource, /apiFetch\(\s*["']\/api\/quotes\/ocr["']/);
  assert.match(appSource, /showToast\("已开始 AI 识别划线句，可以继续编辑"\)/);
  assert.match(appSource, /function scheduleOcrStatusRefresh\(/);
});

test("regression: stale pending OCR cards stop looking actively in progress", () => {
  assert.match(appSource, /function isStalePendingOcr\(quote, now = Date\.now\(\)\)/);
  assert.match(appSource, /now - startedAt > 10 \* 60 \* 1000/);
  assert.match(appSource, /quote\.ocrStatus === "pending" && !isStalePendingOcr\(quote\)/);
  assert.match(appSource, /识别任务可能已中断，请编辑后重新点击识别。/);
});

test("regression: quote OCR keeps enough image resolution for book-page text", () => {
  // 分辨率(1800px)是 OCR 认字的关键，保持不变；质量可低于 1（0.80）以缩小上传体积，
  // 降质量不损文字锐度、对 OCR 安全，故 quality 断言放宽为「0<q<1」而非固定 0.92。
  assert.match(appSource, /const QUOTE_IMAGE_MAX_PX = 1800;/);
  assert.match(appSource, /const QUOTE_IMAGE_QUALITY = 0\.(8|80|82|85);/);
  assert.match(appSource, /resizeImageToDataUrl\(file, QUOTE_IMAGE_MAX_PX, QUOTE_IMAGE_QUALITY\)/);
});

test("regression: quote OCR completion syncs generated tags into the open form", () => {
  assert.match(appSource, /function syncOpenQuoteFormFromState\(/);
  assert.match(appSource, /renderQuoteTagPicker\(mergedTags\)/);
  assert.match(appSource, /const ocrBaseContent = normalizeOcrText\(els\.quoteForm\.dataset\.ocrBaseContent \|\| ""\);/);
  assert.match(appSource, /currentContent === ocrBaseContent/);
  assert.match(appSource, /els\.quoteForm\.dataset\.ocrBaseContent = requestContent;/);
  assert.match(appSource, /delete els\.quoteForm\.dataset\.ocrBaseContent;/);
  assert.match(appSource, /识别完成，原文和标签已自动填入。/);
  assert.match(appSource, /tags:\s*normalizeTags\(els\.quoteForm\.querySelector\('\[name="tags"\]'\)\?\.value \|\| ""\)/);
});

test("regression: AI quote tags stay selected without being added to default picker tags", () => {
  assert.match(appSource, /const pickerTags = \[\.\.\.new Set\(\[\.\.\.DEFAULT_QUOTE_TAGS, \.\.\.getCustomQuoteTags\(\)\]\)\];/);
  // picker 不得再从 state.quotes 反推「书用过的标签」（会拖进笔记/AI 自动标签，杂乱）。
  assert.doesNotMatch(appSource, /getUsedQuoteTags/, "getUsedQuoteTags must be fully removed");
  assert.match(appSource, /const selectedOnlyTags = selectedQuoteTags\.filter\(\(tag\) => !pickerTags\.includes\(tag\)\);/);
  assert.match(appSource, /data-selected-only-tag="true"/);
  assert.doesNotMatch(appSource, /\.\.\.DEFAULT_QUOTE_TAGS, \.\.\.getCustomQuoteTags\(\), \.\.\.selectedQuoteTags/);
});

test("regression: book list status chip stays visible over the cover image", () => {
  assert.match(
    appSource,
    /<div class="book-card-cover[\s\S]*?<span class="book-status-chip" data-status="\$\{book\.status\}"/,
    "Book status chip must be rendered inside the cover layer"
  );

  const coverStatusChip = getRuleBlock(".book-card-cover .book-status-chip");
  assert.match(coverStatusChip, /position:\s*absolute;/);
  assert.match(coverStatusChip, /top:\s*8px;/);
  assert.match(coverStatusChip, /left:\s*8px;/);
  assert.match(coverStatusChip, /z-index:\s*1;/);
  assert.match(coverStatusChip, /display:\s*inline-flex;/);
  assert.match(coverStatusChip, /margin-left:\s*0;/);

  assert.match(styles, /\.chip-dot--paused\s*\{\s*background:\s*var\(--status-paused-dot\);/);
  assert.match(styles, /\.book-status-chip\[data-status="paused"\]\s*\{[\s\S]*background:\s*var\(--status-paused-bg\);/);
});

test("property: chat bubbles use black AI / white user surfaces", () => {
  const assistant = getRuleBlock(".chat-bubble-assistant");
  assert.match(assistant, /background:\s*var\(--color-chat-ai-bg\);/);
  assert.match(assistant, /color:\s*var\(--color-chat-ai-text\);/);
  assert.match(assistant, /align-self:\s*flex-start;/);

  const user = getRuleBlock(".chat-bubble-user");
  assert.match(user, /background:\s*var\(--color-chat-user-bg\);/);
  assert.match(user, /color:\s*var\(--color-chat-user-text\);/);
  assert.match(user, /align-self:\s*flex-end;/);
});

test("property: links and form controls are explicitly styled", () => {
  const linkRule = getRuleBlock("a");
  assert.match(linkRule, /color:\s*var\(--color-ink\);/);

  assert.match(
    styles,
    /input,\s*\nselect,\s*\ntextarea\s*\{\s*width:\s*100%;[\s\S]*background:\s*var\(--color-surface\);[\s\S]*border:\s*1px solid var\(--color-border\);[\s\S]*border-radius:\s*var\(--radius-sm\);/m
  );

  assert.match(
    styles,
    /input:focus,\s*\nselect:focus,\s*\ntextarea:focus\s*\{[\s\S]*border-color:\s*var\(--color-ink\);[\s\S]*box-shadow:\s*0 0 0 3px rgba\(17, 17, 17, 0\.1\);/m
  );
});

test("property: mobile tabs use current ink active state and safe-area sizing", () => {
  // Mobile block opener may carry extra conditions (e.g. ", (pointer: coarse)")
  const mediaBlockMatch = styles.match(/@media \(max-width: 768px\)[^{]*\{([\s\S]*)\}\s*$/m);
  assert.ok(mediaBlockMatch, "Missing mobile media block");
  const mobileBlock = mediaBlockMatch[1];
  assert.match(mobileBlock, /\.mobile-tabs\s*\{[\s\S]*padding-bottom:\s*env\(safe-area-inset-bottom\);/);
  assert.match(mobileBlock, /\.mobile-tabs\s*\{[\s\S]*height:\s*calc\(72px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(mobileBlock, /\.layout\s*\{[\s\S]*height:\s*calc\(100svh - 72px - env\(safe-area-inset-bottom\)\);/);
  assert.match(mobileBlock, /\.mobile-tab\.active\s*\{[\s\S]*color:\s*var\(--color-ink\);/);
  assert.doesNotMatch(mobileBlock, /#15b554|rgb\(21,\s*181,\s*84\)/);
});

test("property: token architecture and legacy palette audit pass", () => {
  assert.match(styles, /--color-surface:\s*#fefcf7;/i);
  assert.match(styles, /--color-surface-alt:\s*#faf6ec;/i);
  assert.match(styles, /--color-yellow:\s*#c9a85a;/i);
  assert.match(styles, /--color-yellow-dark:\s*#b8944d;/i);
  assert.match(styles, /--color-tag-bg:\s*#3d4a3f;/i);
  assert.match(styles, /--radius-md:\s*16px;/i);
  assert.match(styles, /--shadow-panel:\s*0 20px 56px rgba\(17, 17, 17, 0\.1\);/i);

  assert.doesNotMatch(styles, /#9e5d31|#6f3a14|#6d7a45|#bb7a6c|#15b554|#2e6f3a/i);
  assert.doesNotMatch(styles, /--bg:|--panel:|--panel-border:|--ink:|--muted:|--accent:|--accent-strong:|--olive:|--rose:|--shadow:|--radius-xl:/);

  const backdropMatches = [...styles.matchAll(/backdrop-filter/g)];
  assert.equal(backdropMatches.length, 1);
  assert.match(styles, /dialog::backdrop\s*\{[\s\S]*backdrop-filter:\s*blur\(4px\);/);
});

test("property: index has no hardcoded green active-state inline styles", () => {
  assert.doesNotMatch(indexHtml, /#15b554|21,\s*181,\s*84/);
  assert.doesNotMatch(indexHtml, /style=/);
  assert.match(indexHtml, /class="profile-status" id="profileStatusPill"/);
  assert.match(indexHtml, /class="mobile-tab active"/);
  assert.match(indexHtml, /class="filter-chip active"/);
});
