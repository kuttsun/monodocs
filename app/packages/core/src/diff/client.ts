import type { DiffLabels } from "../labels.js";
import { escapeAttr, escapeHtml } from "../util/html.js";

/**
 * What a difference adds to the page in the browser (roadmap 7.3.4): its rules, through
 * `{{style}}`, its bar, before `{{pages}}`, and its script, through `{{bodyScripts}}` — tokens every
 * template has, so a custom theme gets them without carrying them, and the default theme's `app.js`
 * stays byte for byte what it was.
 */

/** The rules a difference adds to `{{style}}`. */
export const DIFF_STYLE = `
/* monodocs: difference from an earlier version. The states take the default theme's admonition
   colours, so they follow its light and dark schemes; a custom theme without them gets the
   fallbacks. */
:root {
  --monodocs-diff-added: var(--color-adm-tip, #1a7f37);
  --monodocs-diff-deleted: var(--color-adm-caution, #cf222e);
  --monodocs-diff-changed: var(--color-adm-warning, #9a6700);
  --monodocs-diff-moved: var(--color-adm-note, #0969da);
  --monodocs-diff-paper: var(--color-bg, Canvas);
  --monodocs-diff-line: var(--color-border, rgba(127, 127, 127, 0.4));
  --monodocs-diff-muted: var(--color-muted, GrayText);
  --monodocs-diff-tint: var(--admonition-tint, 10%);
}

/* Marked blocks: a tinted band, edged towards the middle of the two columns. */
[data-monodocs-diff-block] {
  border-radius: 4px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
[data-monodocs-diff-block="ins"] {
  background: color-mix(in srgb, var(--monodocs-diff-added) var(--monodocs-diff-tint), transparent);
  box-shadow: inset 3px 0 0 var(--monodocs-diff-added);
}
[data-monodocs-diff-block="del"] {
  background: color-mix(in srgb, var(--monodocs-diff-deleted) var(--monodocs-diff-tint), transparent);
  box-shadow: inset -3px 0 0 var(--monodocs-diff-deleted);
}
p[data-monodocs-diff-block], li[data-monodocs-diff-block], h1[data-monodocs-diff-block],
h2[data-monodocs-diff-block], h3[data-monodocs-diff-block], h4[data-monodocs-diff-block],
h5[data-monodocs-diff-block], h6[data-monodocs-diff-block], dt[data-monodocs-diff-block],
dd[data-monodocs-diff-block], div[data-monodocs-diff-block], span[data-monodocs-diff-block] {
  padding-inline: 0.5rem;
  margin-inline: -0.5rem;
}
tr[data-monodocs-diff-block] { box-shadow: none; }
tr[data-monodocs-diff-block="ins"] > * {
  background: color-mix(in srgb, var(--monodocs-diff-added) var(--monodocs-diff-tint), var(--monodocs-diff-paper));
}
tr[data-monodocs-diff-block="del"] > * {
  background: color-mix(in srgb, var(--monodocs-diff-deleted) var(--monodocs-diff-tint), var(--monodocs-diff-paper));
}
/* The text keeps a mark of its own, so black and white still tells the two apart. */
ins[data-monodocs-diff] {
  background: none;
  text-decoration: underline dotted color-mix(in srgb, var(--monodocs-diff-added) 70%, transparent);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}
del[data-monodocs-diff] {
  background: none;
  text-decoration: line-through color-mix(in srgb, var(--monodocs-diff-deleted) 75%, transparent);
  text-decoration-thickness: 1px;
}

/* Two columns, and the line between them that every change leans towards. */
.monodocs-diff-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 3rem;
  background: linear-gradient(var(--monodocs-diff-line), var(--monodocs-diff-line)) center / 1px 100% no-repeat;
}
.monodocs-diff-earlier [data-monodocs-diff-block="del"] { margin-inline-end: -0.75rem; }
.monodocs-diff-current [data-monodocs-diff-block="ins"] { margin-inline-end: 0; }
.monodocs-diff-column-title {
  position: sticky;
  top: var(--monodocs-diff-bar-height, 3.25rem);
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  margin: 0 0 1.25rem;
  padding: 0.4rem 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--monodocs-diff-muted);
  background: var(--monodocs-diff-paper);
  border-bottom: 1px solid var(--monodocs-diff-line);
}
.monodocs-diff-version {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 500;
}
.monodocs-diff-earlier .monodocs-diff-column-title::before,
.monodocs-diff-current .monodocs-diff-column-title::before {
  content: "";
  width: 0.55em;
  height: 0.55em;
  border-radius: 50%;
  align-self: center;
}
.monodocs-diff-earlier .monodocs-diff-column-title::before { background: var(--monodocs-diff-deleted); }
.monodocs-diff-current .monodocs-diff-column-title::before { background: var(--monodocs-diff-added); }
:root[data-monodocs-diff-view="current"] .monodocs-diff-earlier,
:root[data-monodocs-diff-view="earlier"] .monodocs-diff-current { display: none; }
:root[data-monodocs-diff-view="current"] .monodocs-diff-columns,
:root[data-monodocs-diff-view="earlier"] .monodocs-diff-columns {
  grid-template-columns: minmax(0, 1fr);
  background: none;
}
:root[data-monodocs-diff-view="earlier"] #toc { visibility: hidden; }
:root:not([data-monodocs-diff-view]) #content:has(.page:not([hidden]) .monodocs-diff-columns),
:root[data-monodocs-diff-view="both"] #content:has(.page:not([hidden]) .monodocs-diff-columns) {
  max-width: none;
}
@media (max-width: 1000px) {
  .monodocs-diff-columns { grid-template-columns: minmax(0, 1fr); background: none; }
  .monodocs-diff-current { border-top: 1px solid var(--monodocs-diff-line); padding-top: 1.5rem; margin-top: 1.5rem; }
}

/* A note stands for a change no block carries: an added, deleted, moved, or retitled page. */
.monodocs-diff-note {
  --monodocs-diff-note: var(--monodocs-diff-changed);
  margin: 0 0 1.5rem;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--monodocs-diff-note) 35%, transparent);
  background: color-mix(in srgb, var(--monodocs-diff-note) var(--monodocs-diff-tint), transparent);
}
.monodocs-diff-note p { margin: 0.2em 0; }
.page[data-monodocs-diff-page="moved"] > .monodocs-diff-note { --monodocs-diff-note: var(--monodocs-diff-moved); }
.monodocs-diff-earlier > .monodocs-diff-note { --monodocs-diff-note: var(--monodocs-diff-added); }
.monodocs-diff-current > .monodocs-diff-note { --monodocs-diff-note: var(--monodocs-diff-deleted); }

/* The change the navigation is on. */
.monodocs-diff-change-current {
  outline: 2px solid var(--color-accent, Highlight);
  outline-offset: 3px;
  border-radius: 4px;
  scroll-margin-top: calc(var(--monodocs-diff-bar-height) + 3rem);
}
/* A table scrolls sideways in its own box, which would cut a ring drawn outside a row: a row's is
   drawn inside it. */
tr.monodocs-diff-change-current { outline-offset: -2px; border-radius: 0; }

/* The sidebar: a badge for each state, its name told to assistive technology alone. */
.monodocs-diff-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.sidebar-page[data-monodocs-diff-page] > a { display: flex; align-items: center; gap: 0.5em; }
.monodocs-diff-mark {
  --monodocs-diff-mark: var(--monodocs-diff-changed);
  margin-inline-start: auto;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  color: var(--monodocs-diff-mark);
  background: color-mix(in srgb, var(--monodocs-diff-mark) 16%, transparent);
}
[data-monodocs-diff-page="added"] .monodocs-diff-mark { --monodocs-diff-mark: var(--monodocs-diff-added); }
[data-monodocs-diff-page="deleted"] .monodocs-diff-mark { --monodocs-diff-mark: var(--monodocs-diff-deleted); }
[data-monodocs-diff-page="moved"] .monodocs-diff-mark { --monodocs-diff-mark: var(--monodocs-diff-moved); }
.sidebar-page[data-monodocs-diff-page="deleted"] > a {
  color: var(--monodocs-diff-muted);
  text-decoration: line-through color-mix(in srgb, var(--monodocs-diff-deleted) 60%, transparent);
}

/* The bar stands fixed across the top of the window, and the page — the sidebar, the content, the
   table of contents — starts below it: what it switches and walks is the whole document. The column
   headings stick right under it. The default theme's content clips what overflows sideways with
   overflow-x: hidden, which would make it the box they stick to; clip cuts the same overflow
   without that. */
:root { --monodocs-diff-bar-height: 3.25rem; }
body:has(.monodocs-diff-bar) { padding-top: var(--monodocs-diff-bar-height); }
body:has(.monodocs-diff-bar) #app { min-height: calc(100vh - var(--monodocs-diff-bar-height)); }
body:has(.monodocs-diff-bar) #sidebar,
body:has(.monodocs-diff-bar) #toc {
  top: var(--monodocs-diff-bar-height);
  height: calc(100vh - var(--monodocs-diff-bar-height));
}
body:has(.monodocs-diff-bar) #sidebar-show { top: calc(var(--monodocs-diff-bar-height) + 0.6rem); }
#content:has(.monodocs-diff-bar) { overflow-x: clip; }

/* The sidebar of the view shown: the difference's side by side, each version's in its own view. */
.monodocs-diff-sidebar { display: none; }
:root:not([data-monodocs-diff-view]) [data-monodocs-diff-sidebar="both"],
:root[data-monodocs-diff-view="both"] [data-monodocs-diff-sidebar="both"],
:root[data-monodocs-diff-view="current"] [data-monodocs-diff-sidebar="current"],
:root[data-monodocs-diff-view="earlier"] [data-monodocs-diff-sidebar="earlier"] { display: block; }

/* The bar: the views as one segmented control, the way through the changes beside it. */
.monodocs-diff-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 60;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 0.55rem 1.25rem;
  background: var(--monodocs-diff-paper);
  border-bottom: 1px solid var(--monodocs-diff-line);
}
.monodocs-diff-views {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--monodocs-diff-line);
  border-radius: 8px;
  background: var(--color-sidebar-bg, transparent);
}
.monodocs-diff-bar button {
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.2;
  color: var(--monodocs-diff-muted);
  background: transparent;
  border: 0;
  border-radius: 6px;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.monodocs-diff-bar button:hover { color: var(--color-text, CanvasText); }
.monodocs-diff-bar button:focus-visible { outline: 2px solid var(--color-accent, Highlight); outline-offset: 1px; }
.monodocs-diff-views button[aria-pressed="true"] {
  color: var(--color-text, CanvasText);
  background: var(--monodocs-diff-paper);
  box-shadow: 0 0 0 1px var(--monodocs-diff-line), 0 1px 2px rgba(0, 0, 0, 0.08);
  font-weight: 600;
}
.monodocs-diff-nav { display: inline-flex; align-items: center; gap: 0.25rem; }
.monodocs-diff-nav button {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  border: 1px solid var(--monodocs-diff-line);
}
.monodocs-diff-nav svg { width: 0.9em; height: 0.9em; }
.monodocs-diff-count {
  min-width: 4.5em;
  text-align: center;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: var(--monodocs-diff-muted);
}
@media (prefers-reduced-motion: no-preference) {
  .monodocs-diff-bar button { transition: color 0.15s, background-color 0.15s; }
}
@media print { .monodocs-diff-bar { display: none; } }
`;

/** An arrow for the way through the changes, up for the previous one and down for the next. */
function arrow(up: boolean): string {
  return (
    `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="` +
    (up
      ? "M3.47 9.53a.75.75 0 0 0 1.06 0L8 6.06l3.47 3.47a.75.75 0 1 0 1.06-1.06l-4-4a.75.75 0 0 0-1.06 0l-4 4a.75.75 0 0 0 0 1.06Z"
      : "M12.53 6.47a.75.75 0 0 0-1.06 0L8 9.94 4.53 6.47a.75.75 0 0 0-1.06 1.06l4 4a.75.75 0 0 0 1.06 0l4-4a.75.75 0 0 0 0-1.06Z") +
    `"/></svg>`
  );
}

/** The bar prepended to `{{pages}}`: the three views, and the way through the changes. */
export function diffBar(labels: DiffLabels): string {
  const view = (name: string, label: string, pressed: boolean) =>
    `<button type="button" data-monodocs-diff-view="${name}" aria-pressed="${pressed}">` +
    `${escapeHtml(label)}</button>`;
  return (
    `<div class="monodocs-diff-bar" role="toolbar" aria-label="${escapeAttr(labels.diffChanges)}">` +
    `<div class="monodocs-diff-views" role="group">` +
    view("both", labels.diffViewSideBySide, true) +
    // In the order the columns stand: the earlier version on the left, the new on the right.
    view("earlier", labels.diffViewEarlier, false) +
    view("current", labels.diffViewCurrent, false) +
    `</div><div class="monodocs-diff-nav">` +
    `<button type="button" data-monodocs-diff-go="-1">${arrow(true)}${escapeHtml(labels.diffPrevious)}</button>` +
    `<span class="monodocs-diff-count" aria-live="polite"></span>` +
    `<button type="button" data-monodocs-diff-go="1">${escapeHtml(labels.diffNext)}${arrow(false)}</button>` +
    `</div></div>\n`
  );
}

/**
 * The script: it lines up each unchanged pair, switches the view, walks the changes, and takes the
 * search highlight back out of the earlier column. Plain ES5, as `app.js` is.
 */
export const DIFF_SCRIPT = `(function () {
  var root = document.documentElement;
  var view = "both";
  var padded = [];
  var position = { article: null, index: -1 };

  function articles() {
    return Array.prototype.slice.call(document.querySelectorAll("article.page[data-route]"));
  }
  function shown() {
    var list = articles();
    for (var i = 0; i < list.length; i++) if (!list[i].hidden) return list[i];
    return null;
  }
  function own(article, selector) {
    return Array.prototype.slice.call(article.querySelectorAll(selector));
  }

  // Line up each unchanged pair: the higher of the two gets space above it.
  function unpad() {
    padded.forEach(function (entry) { entry.node.style.marginTop = entry.margin; });
    padded = [];
  }
  function sideBySide(columns) {
    var earlier = columns.children[0];
    var current = columns.children[1];
    return view === "both" && earlier && current &&
      earlier.getBoundingClientRect().left !== current.getBoundingClientRect().left;
  }
  function align() {
    // The columns keep their height while their space is taken off and put back, so the page never
    // grows shorter under a reader scrolled to its end, which the browser would answer by moving
    // the reader up.
    var scroller = document.scrollingElement || root;
    var top = scroller.scrollTop;
    var article = shown();
    var held = article ? own(article, ".monodocs-diff-columns") : [];
    held.forEach(function (columns) { columns.style.minHeight = columns.offsetHeight + "px"; });
    unpad();
    held.forEach(function (columns) {
      if (!sideBySide(columns)) return;
      var right = {};
      own(columns.children[1], "[data-monodocs-diff-pair]").forEach(function (node) {
        right[node.getAttribute("data-monodocs-diff-pair")] = node;
      });
      own(columns.children[0], "[data-monodocs-diff-pair]").forEach(function (left) {
        var other = right[left.getAttribute("data-monodocs-diff-pair")];
        if (!other || /^(TR|TD|TH)$/.test(left.tagName)) return;
        for (var tries = 0; tries < 3; tries++) {
          var gap = left.getBoundingClientRect().top - other.getBoundingClientRect().top;
          if (Math.abs(gap) < 1) break;
          var node = gap > 0 ? other : left;
          var known = padded.filter(function (entry) { return entry.node === node; })[0];
          if (!known) {
            known = { node: node, margin: node.style.marginTop };
            padded.push(known);
          }
          var now = parseFloat(getComputedStyle(node).marginTop) || 0;
          node.style.marginTop = now + Math.abs(gap) + "px";
        }
      });
    });
    held.forEach(function (columns) { columns.style.minHeight = ""; });
    if (scroller.scrollTop !== top) scroller.scrollTop = top;
  }

  // The changes: a page's marked blocks in the columns shown, in the order the alignment puts them,
  // or the note that stands for a page whose change no block carries.
  function changes(article) {
    var state = article.getAttribute("data-monodocs-diff-page");
    if (!state) return [];
    var hidden = view === "current" ? ".monodocs-diff-earlier" : view === "earlier" ? ".monodocs-diff-current" : null;
    var visible = function (node) { return !hidden || !node.closest(hidden); };
    var marks = own(article, "[data-monodocs-diff-block]").filter(visible);
    if (marks.length === 0) {
      var notes = own(article, ".monodocs-diff-note").filter(visible);
      if (notes.length > 0) return notes.slice(0, 1);
      // An added or deleted page whose note is in the column hidden: the column shown stands for it.
      return own(article, ".monodocs-diff-columns > div").filter(visible).slice(0, 1);
    }
    if (!article.hidden) {
      marks.sort(function (a, b) {
        var d = a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        if (Math.abs(d) >= 1) return d;
        return a.closest(".monodocs-diff-earlier") ? -1 : 1;
      });
    }
    return marks;
  }
  function total() {
    return articles().reduce(function (sum, article) { return sum + changes(article).length; }, 0);
  }
  function count() {
    var out = document.querySelector(".monodocs-diff-count");
    if (!out) return;
    var all = total();
    var before = 0;
    var text = "– / " + all;
    if (position.article && position.index >= 0) {
      var list = articles();
      for (var i = 0; i < list.length && list[i] !== position.article; i++) before += changes(list[i]).length;
      text = before + position.index + 1 + " / " + all;
    }
    // Written only when it changes: the page is watched for changes, and this is in it.
    if (out.textContent !== text) out.textContent = text;
  }
  function select(article, index) {
    var old = document.querySelector(".monodocs-diff-change-current");
    if (old) old.classList.remove("monodocs-diff-change-current");
    position = { article: article, index: index };
    var target = changes(article)[index];
    if (target) {
      target.classList.add("monodocs-diff-change-current");
      target.scrollIntoView({ block: "center" });
    }
    count();
  }
  function open(article, then) {
    if (!article.hidden) return then();
    location.hash = "#" + encodeURI(article.getAttribute("data-route"));
    var waited = 0;
    (function wait() {
      if (!article.hidden || waited > 40) {
        align();
        return then();
      }
      waited++;
      setTimeout(wait, 25);
    })();
  }
  function go(step) {
    var list = articles().filter(function (article) { return changes(article).length > 0; });
    if (list.length === 0) return;
    var at = list.indexOf(position.article);
    var index = position.index + step;
    if (at === -1) {
      var current = shown();
      at = step > 0 ? -1 : list.length;
      if (current) {
        var all = articles();
        var here = all.indexOf(current);
        for (var i = 0; i < list.length; i++) {
          if (all.indexOf(list[i]) >= here) { at = step > 0 ? i - 1 : i; break; }
        }
      }
      index = step > 0 ? Infinity : -1;
    }
    if (at >= 0 && at < list.length && index >= 0 && index < changes(list[at]).length) {
      return select(list[at], index);
    }
    at = (at + step + list.length) % list.length;
    var next = list[at];
    open(next, function () {
      select(next, step > 0 ? 0 : changes(next).length - 1);
    });
  }

  // The sidebar shown keeps the page on display open in it, as the theme does for its own.
  function reveal() {
    var link = document.querySelector('[data-monodocs-diff-sidebar="' + view + '"] a.active');
    for (var node = link && link.parentElement; node; node = node.parentElement) {
      if (node.classList && node.classList.contains("sidebar-dir")) node.classList.remove("collapsed");
    }
  }

  function setView(name) {
    view = name;
    root.setAttribute("data-monodocs-diff-view", name);
    Array.prototype.forEach.call(document.querySelectorAll("[data-monodocs-diff-view]"), function (button) {
      if (button.tagName === "BUTTON") {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-monodocs-diff-view") === name));
      }
    });
    var old = document.querySelector(".monodocs-diff-change-current");
    if (old) old.classList.remove("monodocs-diff-change-current");
    position = { article: null, index: -1 };
    reveal();
    align();
    count();
  }

  // The search highlight does not stay in the earlier column (22.5).
  function unhighlight() {
    Array.prototype.forEach.call(document.querySelectorAll(".monodocs-diff-earlier mark.search-hit"), function (mark) {
      var parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  // The column headings stick right under the bar, whatever its height once it wraps.
  function measure() {
    var bar = document.querySelector(".monodocs-diff-bar");
    if (bar) root.style.setProperty("--monodocs-diff-bar-height", bar.offsetHeight + "px");
  }

  var pending = 0;
  function later() {
    clearTimeout(pending);
    pending = setTimeout(function () { measure(); align(); count(); }, 60);
  }

  function start() {
    root.setAttribute("data-monodocs-diff-view", view);
    document.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest(".monodocs-diff-bar button");
      if (!button) return;
      if (button.hasAttribute("data-monodocs-diff-view")) setView(button.getAttribute("data-monodocs-diff-view"));
      else go(Number(button.getAttribute("data-monodocs-diff-go")));
    });
    window.addEventListener("hashchange", function () {
      if (position.article && position.article.hidden) position = { article: null, index: -1 };
      setTimeout(reveal, 0);
      later();
    });
    window.addEventListener("resize", later);
    document.addEventListener("load", later, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    // What changes in the page — a diagram drawn, the search highlight — calls for the columns to be
    // lined up again; what the bar shows does not.
    new MutationObserver(function (records) {
      var outside = records.some(function (record) {
        var node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return !(node && node.closest && node.closest(".monodocs-diff-bar"));
      });
      if (!outside) return;
      unhighlight();
      later();
    }).observe(document.getElementById("content") || document.body, {
      childList: true,
      subtree: true,
    });
    later();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`;
