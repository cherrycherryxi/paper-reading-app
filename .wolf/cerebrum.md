# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-11

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** paper-reading-app
- **Description:** 一个面向手机网页的纸质书阅读工具，当前优先适配 iPhone 12。

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-05-12] **dialog-form class on \<dialog\> itself causes iOS Safari display bug.** `.dialog-form` has `display:grid` which overrides the UA `dialog:not([open]) { display:none }` on iOS, making the closed dialog permanently visible. Rule: always put `dialog-form` on an inner `<div>` or `<form>`, never directly on the `<dialog>` element. All other dialogs in this project already follow this pattern.

- [2026-05-12] **Regression tests must execute real source via vm.runInNewContext.** Writing tests that simulate the fix logic themselves (without loading the actual JS file) always pass and catch nothing. Pattern: use `vm.runInNewContext(source, context)` as done in `chat-agent-approval.test.js` and `book-list-ordering-fix.test.js`. For CSS/HTML: read the real file and assert against its content. For `renderQuotes`, set `els.quoteFilter.value = "all"` in the test harness or all quotes get filtered out.

- [2026-05-12] **opacity:0 + :hover is invisible on mobile touch devices.** Using `opacity:0` with `:hover` reveal for action buttons (e.g. `.card-delete-btn`) makes them permanently invisible on iPhone — there is no hover event. Fix: override to `opacity:1` inside `@media (max-width:768px)`.

- [2026-05-12] **P1-003 was only partially fixed.** The original fix added a custom dialog for `deleteBook` but left `deleteSession`, `deleteQuote` (app.js), and `clearHistory` (chat.js) still calling native `window.confirm`/`confirm`. When fixing "replace native confirm" always grep all three files for remaining `confirm(` calls.

## Decision Log

- [2026-05-12] **Auth panel redesigned as login-first tabbed UI.** Two forms (login + register) now tab-switch instead of sitting side-by-side. Login tab shown first by default. Tab panels use `display: contents` when active so the inner `<form>` participates in parent grid layout correctly.
