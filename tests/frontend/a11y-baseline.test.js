// Regression tests for the a11y baseline pass: OPT-018 (prefers-reduced-motion),
// OPT-013 (button :focus-visible), OPT-019 (toast aria-live).
// These assert against the real styles.css / index.html, not a simulation.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stylesPath = path.join(__dirname, "..", "..", "styles.css");
const indexPath = path.join(__dirname, "..", "..", "index.html");
const styles = fs.readFileSync(stylesPath, "utf8");
const indexHtml = fs.readFileSync(indexPath, "utf8");

test("OPT-018: prefers-reduced-motion block neutralizes animations/transitions", () => {
  const match = styles.match(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\}\s*)\}/m
  );
  assert.ok(match, "Missing @media (prefers-reduced-motion: reduce) block");
  const block = match[1];
  assert.match(block, /animation-duration:\s*0\.01ms\s*!important/,
    "should collapse animation-duration to a near-zero (not 0) duration so transitionend still fires");
  assert.match(block, /animation-iteration-count:\s*1\s*!important/,
    "should stop infinite loops (chat-dot-pulse) with iteration-count: 1");
  assert.match(block, /transition-duration:\s*0\.01ms\s*!important/,
    "should collapse transition-duration");
});

test("OPT-013: keyboard focus indicator exists for buttons and role/anchor controls", () => {
  const match = styles.match(
    /button:focus-visible[^{]*\{([\s\S]*?)\}/m
  );
  assert.ok(match, "Missing button:focus-visible rule");
  // The same rule should also cover [role="button"] and anchors.
  const selectorLine = styles.match(/button:focus-visible,[\s\S]*?\{/m);
  assert.ok(selectorLine, "focus-visible rule should group multiple selectors");
  assert.match(selectorLine[0], /\[role="button"\]:focus-visible/,
    "should also cover [role=button]");
  assert.match(selectorLine[0], /a:focus-visible/,
    "should also cover anchors");
  const body = match[1];
  assert.match(body, /outline:\s*2px solid var\(--color-ink\)/,
    "focus ring should be a visible outline using the ink token (dark-mode aware)");
  assert.doesNotMatch(body, /outline:\s*none/,
    "focus-visible must not suppress the outline");
});

test("OPT-019: #toast exposes a live region for assistive tech", () => {
  const toast = indexHtml.match(/<div\s+id="toast"[^>]*>/);
  assert.ok(toast, "Missing #toast element");
  assert.match(toast[0], /role="status"/,
    'role="status" implies aria-live="polite" so screen readers announce toasts');
  assert.match(toast[0], /aria-atomic="true"/,
    "aria-atomic ensures the full message is re-read on each update");
});
