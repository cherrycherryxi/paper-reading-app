const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stylesPath = path.join(__dirname, "..", "styles.css");
const indexPath = path.join(__dirname, "..", "index.html");
const styles = fs.readFileSync(stylesPath, "utf8");
const indexHtml = fs.readFileSync(indexPath, "utf8");

function getRuleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "m"));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

test("property: cream page background is tokenized and gradients are removed", () => {
  assert.match(styles, /--color-bg:\s*#f5f0e8;/i);
  assert.match(styles, /body\s*\{\s*font-family:\s*var\(--font-sans\);[\s\S]*background:\s*var\(--color-bg\);[\s\S]*\}/m);
  assert.doesNotMatch(styles, /body\s*\{[\s\S]*radial-gradient|body\s*\{[\s\S]*linear-gradient/m);
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

test("property: black-filled tag chips and active filters are defined", () => {
  const sharedChips = getRuleBlock(".filter-chip.active,\n.tag-chip,\n.book-tag-chip");
  assert.match(sharedChips, /background:\s*var\(--color-tag-bg\);/);
  assert.match(sharedChips, /color:\s*var\(--color-tag-text\);/);

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

test("property: mobile tabs use black active state and safe-area padding", () => {
  const mediaBlockMatch = styles.match(/@media \(max-width: 768px\)\s*\{([\s\S]*)\}\s*$/m);
  assert.ok(mediaBlockMatch, "Missing mobile media block");
  const mobileBlock = mediaBlockMatch[1];
  assert.match(mobileBlock, /\.mobile-tabs\s*\{[\s\S]*padding-bottom:\s*env\(safe-area-inset-bottom\);/);
  assert.match(mobileBlock, /\.layout\s*\{[\s\S]*padding:\s*14px 14px calc\(84px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(mobileBlock, /\.mobile-tab\.active\s*\{[\s\S]*color:\s*var\(--color-ink\);/);
  assert.doesNotMatch(mobileBlock, /#15b554|rgb\(21,\s*181,\s*84\)/);
});

test("property: token architecture and legacy palette audit pass", () => {
  assert.match(styles, /--color-surface:\s*#ffffff;/i);
  assert.match(styles, /--color-yellow:\s*#ffd700;/i);
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
