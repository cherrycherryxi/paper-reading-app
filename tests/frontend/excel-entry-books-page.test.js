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

test("OPT-001: books-page button opens the guide dialog (with input fallback)", () => {
  assert.match(appJs, /importExcelBooksBtn:\s*document\.querySelector\("#importExcelBooksBtn"\)/, "button must be registered in els");
  const binding = appJs.match(/importExcelBooksBtn\?\.addEventListener\("click",[\s\S]*?\n  \}\);/m);
  assert.ok(binding, "click binding must exist");
  assert.match(binding[0], /importExcelDialog\.showModal\(\)/, "click must open the guide dialog");
  assert.match(binding[0], /importExcelInput\?\.click\(\)/, "must fall back to the input if the dialog is missing");
});

test("OPT-001: guide dialog exists with format help, template and file buttons", () => {
  const dialog = indexHtml.match(/<dialog id="importExcelDialog"[\s\S]*?<\/dialog>/m);
  assert.ok(dialog, "importExcelDialog must exist");
  assert.match(dialog[0], /aria-labelledby="import-excel-title"/, "dialog must be labelled (OPT-033 convention)");
  assert.match(dialog[0], /「书名」/, "format help must mention the required 书名 column");
  assert.match(dialog[0], /id="downloadExcelTemplateBtn"/, "must offer a template download");
  assert.match(dialog[0], /id="chooseExcelFileBtn"/, "must offer file selection");
  assert.match(dialog[0], /id="importExcelCancelBtn"/, "must offer cancel");
});

test("OPT-001: 选择文件 closes the dialog and forwards to the shared input", () => {
  const binding = appJs.match(/chooseExcelFileBtn\?\.addEventListener\("click",[\s\S]*?\}\);/m);
  assert.ok(binding, "choose-file binding must exist");
  assert.match(binding[0], /importExcelDialog\?\.close\(\)/, "must close the dialog");
  assert.match(binding[0], /importExcelInput\?\.click\(\)/, "must forward to the hidden Excel input");
});

test("OPT-001: template generator headers match what importExcel() reads", () => {
  const fn = appJs.match(/function downloadExcelTemplate\(\)[\s\S]*?\n\}/m);
  assert.ok(fn, "downloadExcelTemplate must exist");
  // Every template header must be an alias importExcel() actually looks up.
  for (const header of ["书名", "作者", "状态", "标签", "总页数", "开始时间", "完成时间", "译者", "简介", "喜欢程度", "读后感"]) {
    assert.match(fn[0], new RegExp(`"${header}"`), `template must include ${header} column`);
    assert.match(appJs, new RegExp(`getRowField\\(row, \\[[^\\]]*"${header}"`), `importExcel must read the ${header} column`);
  }
  assert.match(fn[0], /writeFile/, "must trigger an .xlsx download");
});

test("OPT-001: importExcel skips the template's example row", () => {
  assert.match(appJs, /title\.startsWith\("示例："\)/, "example row guard must exist");
  const fn = appJs.match(/function downloadExcelTemplate\(\)[\s\S]*?\n\}/m);
  assert.match(fn[0], /"示例：/, "example row title must carry the 示例： prefix the guard skips");
});

// OPT-100: 「喜欢程度」must write to book.rating (number) not into notes text
test("OPT-100: importExcel writes 喜欢程度 to book.rating as a number, not into notes", () => {
  const fn = appJs.match(/async function importExcel\(file\)[\s\S]*?\n\}/m);
  assert.ok(fn, "importExcel must exist");
  // rating must be parsed as a number clamped 0-5
  assert.match(fn[0], /rating.*Math\.min.*Math\.max.*Math\.round.*Number/, "rating must be clamped to 0-5 integer");
  // rating must appear in the book object literal
  assert.match(fn[0], /rating,/, "rating must be set on the book object");
  // notes must NOT include 喜欢程度 text concatenation
  assert.doesNotMatch(fn[0], /喜欢程度：/, "喜欢程度 must not be concatenated into notes text");
});

// OPT-110: 「读后感」column in template + importExcel writes to book.review
test("OPT-110: importExcel writes 读后感 column to book.review with reviewIsAi false", () => {
  const fn = appJs.match(/async function importExcel\(file\)[\s\S]*?\n\}/m);
  assert.ok(fn, "importExcel must exist");
  // review field must be extracted from the row
  assert.match(fn[0], /getRowField\(row, \["读后感"/, "importExcel must read 读后感 column");
  // review and reviewIsAi must be set on the book object
  assert.match(fn[0], /review,/, "review must be set on the imported book");
  assert.match(fn[0], /reviewIsAi: false/, "reviewIsAi must be false for Excel-imported reviews");
});
