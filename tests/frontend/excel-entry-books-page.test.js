// Regression tests for OPT-001: books-page secondary entry for Excel batch import.
// The books panel gets a #importExcelBooksBtn that forwards clicks to the
// drawer's existing hidden #importExcelInput, so both entries share one
// change handler. These assert against the real index.html / app.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(__dirname, "..", "..", "index.html");
const appJsPath = path.join(__dirname, "..", "..", "app.js");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const appJs = fs.readFileSync(appJsPath, "utf8");

test("OPT-001: books panel has the Excel import button inside books-search-row", () => {
  const row = indexHtml.match(/<div class="books-search-row">([\s\S]*?)<\/div>/m);
  assert.ok(row, "books-search-row must exist");
  assert.match(row[1], /id="importExcelBooksBtn"/, "Excel entry button must live in the books search row");
  assert.match(row[1], /id="openBookDialogBtn"/, "add-book button must remain alongside it");
});

test("OPT-001: the new entry is a real button with an accessible name", () => {
  const btn = indexHtml.match(/<button[^>]*id="importExcelBooksBtn"[^>]*>/);
  assert.ok(btn, "must be a <button>, not a label, for keyboard accessibility");
  assert.match(btn[0], /type="button"/, "must not submit forms");
  assert.match(btn[0], /aria-label="[^"]*Excel[^"]*"/, "needs an aria-label mentioning Excel");
});

test("OPT-001: drawer's original entry and input are untouched", () => {
  const inputs = indexHtml.match(/id="importExcelInput"/g) || [];
  assert.equal(inputs.length, 1, "exactly one hidden file input — the new button must reuse it, not clone it");
  assert.match(indexHtml, /从 Excel 批量加书[\s\S]*?id="importExcelInput"/, "drawer entry stays as the backup path");
});

test("OPT-001: app.js forwards the button click to the shared input", () => {
  assert.match(appJs, /importExcelBooksBtn:\s*document\.querySelector\("#importExcelBooksBtn"\)/, "button must be registered in els");
  const binding = appJs.match(/importExcelBooksBtn\?\.addEventListener\("click",[\s\S]*?\}\);/m);
  assert.ok(binding, "click binding must exist");
  assert.match(binding[0], /importExcelInput\?\.click\(\)/, "click must forward to the hidden Excel input");
});
