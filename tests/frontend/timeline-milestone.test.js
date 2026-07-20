/**
 * OPT-077: renderTimeline() book milestone events (startedAt / finishedAt)
 *
 * Books have startedAt and finishedAt fields (written by saveSession / OPT-074,
 * back-filled by OPT-105 Douban import). Before this fix, renderTimeline() only
 * rendered per-session cards; the overall arc of when a user started and finished
 * a book was invisible. After: the timeline interleaves milestone cards for each
 * book's startedAt ("开始读") and finishedAt ("读完了") events in chronological order.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJsPath = path.join(__dirname, "..", "..", "app.js");
const appSource = fs.readFileSync(appJsPath, "utf8");

// ─── minimal DOM stub ─────────────────────────────────────────────────────────

function createElementStub(tagName = "div") {
  let _innerHTML = "";
  const _classes = new Set();
  const children = [];
  const el = {
    tagName: (tagName || "div").toUpperCase(),
    className: "",
    textContent: "",
    style: { display: "" },
    dataset: {},
    value: "",
    disabled: false,
    hidden: false,
    children,
    _classes,
    classList: {
      add(c) { _classes.add(c); },
      remove(c) { _classes.delete(c); },
      toggle(c, force) {
        const want = force === undefined ? !_classes.has(c) : !!force;
        if (want) _classes.add(c); else _classes.delete(c);
        return want;
      },
      contains(c) { return _classes.has(c); },
    },
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) { _innerHTML = String(v); children.length = 0; },
    appendChild(child) { children.push(child); return child; },
    insertAdjacentHTML(pos, v) {
      _innerHTML = pos === "beforeend" ? `${_innerHTML}${v}` : `${v}${_innerHTML}`;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return createElementStub("button"); },
    querySelectorAll() { return []; },
    showModal() {},
    close() {},
    reset() {},
    setAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    focus() {},
    scrollIntoView() {},
    cloneNode() { return createElementStub(tagName); },
  };
  return el;
}

function createHarness() {
  const elements = new Map();
  function getElement(selector) {
    if (!elements.has(selector)) elements.set(selector, createElementStub());
    return elements.get(selector);
  }

  // The timeline element needs to track appended children
  const timelineEl = createElementStub("div");
  timelineEl._appendedChildren = [];
  const origAppend = timelineEl.appendChild.bind(timelineEl);
  timelineEl.appendChild = function(child) {
    timelineEl._appendedChildren.push(child);
    return origAppend(child);
  };

  const document = {
    querySelector(selector) {
      if (selector === ".timeline") return timelineEl;
      return getElement(selector);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return createElementStub(tag); },
    getElementById(id) { return getElement(`#${id}`); },
    createElementNS(_, tag) { return createElementStub(tag); },
  };

  const window = {
    PAPER_READING_APP_CONFIG: { backendBaseUrl: "" },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout(fn) { return fn(); },
    confirm() { return true; },
  };

  const context = {
    console, document, window,
    localStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, headers: { get() { return "application/json"; } }, json: async () => ({}) }),
    CustomEvent: function CustomEvent(type) { this.type = type; },
    FormData, structuredClone,
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp,
    setTimeout, clearTimeout,
    requestAnimationFrame(fn) { return fn(); },
  };

  const sourceWithoutBoot = appSource.replace(/\nbindEvents\(\);\nrender\(\);[\s\S]*$/, "\n");

  const instrumentedSource = `${sourceWithoutBoot}
globalThis.__testHooks = {
  renderTimeline,
  els,
  timeline: els.timeline,
  setState(value) { state = value; },
  setCurrentUser(value) { currentUser = value; },
  setSessionSearch(value) { if (els.sessionSearch) els.sessionSearch.value = value; },
  getTimelineEl() { return els.timeline; },
};
`;

  vm.runInNewContext(instrumentedSource, context, { filename: "app.js" });
  const hooks = context.__testHooks;
  // Patch the els.timeline to use our tracked element
  hooks.els.timeline = timelineEl;
  hooks._timelineEl = timelineEl;
  return hooks;
}

// ─── factories ───────────────────────────────────────────────────────────────

function book(overrides) {
  return {
    id: "b1", title: "深度工作", author: "卡尔·纽波特",
    status: "finished", startedAt: null, finishedAt: null, createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function session(overrides) {
  return {
    id: "s1", bookId: "b1", startPage: 1, endPage: 51, minutes: 60, note: "",
    date: "2026-03-10T04:00:00.000Z",
    ...overrides,
  };
}

function getAppendedClasses(hooks) {
  return hooks._timelineEl._appendedChildren.map((c) => c.className || "");
}

function getAppendedInnerHTMLs(hooks) {
  return hooks._timelineEl._appendedChildren.map((c) => c.innerHTML || c.textContent || "");
}

// ─── tests ───────────────────────────────────────────────────────────────────

test("OPT-077: finishedAt milestone card appears in timeline", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", finishedAt: "2026-03-15T00:00:00.000Z" })],
    quotes: [],
    sessions: [session({ id: "s1", bookId: "b1", date: "2026-03-10T00:00:00.000Z" })],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const classes = getAppendedClasses(hooks);
  assert.ok(
    classes.some((c) => c.includes("timeline-milestone--finished")),
    "should append a finished milestone card"
  );
});

test("OPT-077: startedAt milestone card appears in timeline", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", startedAt: "2026-03-01T00:00:00.000Z", status: "reading" })],
    quotes: [],
    sessions: [session({ id: "s1", bookId: "b1", date: "2026-03-10T00:00:00.000Z" })],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const classes = getAppendedClasses(hooks);
  assert.ok(
    classes.some((c) => c.includes("timeline-milestone--started")),
    "should append a started milestone card"
  );
});

test("OPT-077: milestones interleaved in correct date order (newest first)", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({
      id: "b1",
      startedAt: "2026-01-05T00:00:00.000Z",
      finishedAt: "2026-04-20T00:00:00.000Z",
    })],
    quotes: [],
    sessions: [
      session({ id: "s1", bookId: "b1", date: "2026-02-10T00:00:00.000Z" }),
      session({ id: "s2", bookId: "b1", date: "2026-03-15T00:00:00.000Z" }),
    ],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const classes = getAppendedClasses(hooks);
  // Order should be: finished (Apr 20) > session s2 (Mar 15) > session s1 (Feb 10) > started (Jan 5)
  const finishedIdx = classes.findIndex((c) => c.includes("timeline-milestone--finished"));
  const s2Idx = classes.findIndex((c) => c.includes("session-grid-card") && !classes.slice(0, classes.indexOf(c) + 1).filter(x => x.includes("session-grid-card")).length > 1);
  const startedIdx = classes.findIndex((c) => c.includes("timeline-milestone--started"));

  assert.ok(finishedIdx < startedIdx, "finished milestone should appear before started milestone (newer date first)");
  assert.ok(finishedIdx === 0, "finished milestone (Apr 20) should be first item");
  assert.ok(startedIdx === classes.length - 1, "started milestone (Jan 5) should be last item");
});

test("OPT-077: milestones are hidden during search", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "深度工作", startedAt: "2026-01-05T00:00:00.000Z", finishedAt: "2026-04-20T00:00:00.000Z" })],
    quotes: [],
    sessions: [session({ id: "s1", bookId: "b1", date: "2026-02-10T00:00:00.000Z" })],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("深度工作");
  hooks.renderTimeline();

  const classes = getAppendedClasses(hooks);
  assert.ok(
    !classes.some((c) => c.includes("timeline-milestone")),
    "milestone cards should not appear during search"
  );
});

test("OPT-077: book without startedAt/finishedAt adds no milestone", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", startedAt: null, finishedAt: null })],
    quotes: [],
    sessions: [session({ id: "s1", bookId: "b1", date: "2026-02-10T00:00:00.000Z" })],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const classes = getAppendedClasses(hooks);
  assert.ok(
    !classes.some((c) => c.includes("timeline-milestone")),
    "no milestones should appear for a book without dates"
  );
  assert.ok(
    classes.some((c) => c.includes("session-grid-card")),
    "session card should still render"
  );
});

test("OPT-077: milestone card innerHTML contains book title and label", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", title: "深度工作", finishedAt: "2026-04-20T00:00:00.000Z" })],
    quotes: [],
    sessions: [session({ id: "s1", bookId: "b1", date: "2026-03-10T00:00:00.000Z" })],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  const children = hooks._timelineEl._appendedChildren;
  const milestoneCard = children.find((c) => (c.className || "").includes("timeline-milestone--finished"));
  assert.ok(milestoneCard, "finished milestone card should exist");
  const html = milestoneCard.innerHTML || "";
  assert.ok(html.includes("读完了"), "milestone label should say 读完了");
  assert.ok(html.includes("深度工作"), "milestone card should include the book title");
});

test("OPT-077: existing OPT-053 stats bar still works with milestones", () => {
  const hooks = createHarness();
  hooks.setCurrentUser({ id: "u1" });
  hooks.setState({
    books: [book({ id: "b1", finishedAt: "2026-04-20T00:00:00.000Z" })],
    quotes: [],
    sessions: [
      session({ id: "s1", bookId: "b1", startPage: 1, endPage: 51, minutes: 60 }),
      session({ id: "s2", bookId: "b1", startPage: 51, endPage: 101, minutes: 45 }),
    ],
    connections: [], chatHistories: {},
  });
  hooks.setSessionSearch("");
  hooks.renderTimeline();

  // Stats bar uses els.sessionStats, not our timeline element, so just verify render didn't crash
  const classes = getAppendedClasses(hooks);
  assert.ok(classes.some((c) => c.includes("session-grid-card")), "session cards still rendered");
  assert.ok(classes.some((c) => c.includes("timeline-milestone--finished")), "milestone card also rendered");
});
