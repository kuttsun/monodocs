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
/* monodocs: difference from an earlier version */
:root {
  --monodocs-diff-ins: rgba(46, 160, 67, 0.18);
  --monodocs-diff-del: rgba(248, 81, 73, 0.18);
  --monodocs-diff-added: #1a7f37;
  --monodocs-diff-deleted: #cf222e;
  --monodocs-diff-changed: #bc4c00;
  --monodocs-diff-moved: #0969da;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --monodocs-diff-added: #3fb950;
    --monodocs-diff-deleted: #f85149;
    --monodocs-diff-changed: #f0883e;
    --monodocs-diff-moved: #58a6ff;
  }
}
:root[data-theme="dark"] {
  --monodocs-diff-added: #3fb950;
  --monodocs-diff-deleted: #f85149;
  --monodocs-diff-changed: #f0883e;
  --monodocs-diff-moved: #58a6ff;
}
ins[data-monodocs-diff] { background: var(--monodocs-diff-ins); text-decoration: none; }
del[data-monodocs-diff] { background: var(--monodocs-diff-del); text-decoration: line-through; }
[data-monodocs-diff-block="ins"] { box-shadow: -4px 0 0 var(--monodocs-diff-added); }
[data-monodocs-diff-block="del"] { box-shadow: -4px 0 0 var(--monodocs-diff-deleted); }
.monodocs-diff-change-current { outline: 2px solid var(--monodocs-diff-changed); outline-offset: 2px; }
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
.monodocs-diff-mark { margin-inline-start: 0.4em; font-weight: 700; }
.sidebar-page[data-monodocs-diff-page="added"] > a { color: var(--monodocs-diff-added); }
.sidebar-page[data-monodocs-diff-page="deleted"] > a { color: var(--monodocs-diff-deleted); }
.sidebar-page[data-monodocs-diff-page="changed"] > a { color: var(--monodocs-diff-changed); }
.sidebar-page[data-monodocs-diff-page="moved"] > a { color: var(--monodocs-diff-moved); }
.monodocs-diff-note {
  border-inline-start: 4px solid var(--monodocs-diff-changed);
  padding: 0.25em 1em;
  margin: 0 0 1em;
}
.monodocs-diff-note p { margin: 0.25em 0; }
.monodocs-diff-earlier > .monodocs-diff-note { border-color: var(--monodocs-diff-added); }
.monodocs-diff-current > .monodocs-diff-note { border-color: var(--monodocs-diff-deleted); }
.monodocs-diff-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2.5rem; }
.monodocs-diff-column-title {
  font-size: 0.8em;
  font-weight: 700;
  opacity: 0.7;
  margin: 0 0 0.5em;
  border-bottom: 1px solid currentColor;
}
:root[data-monodocs-diff-view="current"] .monodocs-diff-earlier,
:root[data-monodocs-diff-view="earlier"] .monodocs-diff-current { display: none; }
:root[data-monodocs-diff-view="current"] .monodocs-diff-columns,
:root[data-monodocs-diff-view="earlier"] .monodocs-diff-columns { grid-template-columns: minmax(0, 1fr); }
:root[data-monodocs-diff-view="earlier"] #toc { visibility: hidden; }
:root:not([data-monodocs-diff-view]) #content:has(.page:not([hidden]) .monodocs-diff-columns),
:root[data-monodocs-diff-view="both"] #content:has(.page:not([hidden]) .monodocs-diff-columns) {
  max-width: none;
}
@media (max-width: 1000px) {
  .monodocs-diff-columns { grid-template-columns: minmax(0, 1fr); }
}
.monodocs-diff-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  margin: -1rem 0 1.5rem;
  background: var(--bg, Canvas);
  border-bottom: 1px solid rgba(127, 127, 127, 0.35);
}
.monodocs-diff-bar button {
  font: inherit;
  font-size: 0.85em;
  padding: 0.3em 0.8em;
  border: 1px solid rgba(127, 127, 127, 0.5);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.monodocs-diff-bar button[aria-pressed="true"] { background: rgba(127, 127, 127, 0.2); font-weight: 700; }
.monodocs-diff-bar .monodocs-diff-views,
.monodocs-diff-bar .monodocs-diff-nav { display: flex; gap: 0.4rem; align-items: center; }
.monodocs-diff-count { font-variant-numeric: tabular-nums; min-width: 4.5em; text-align: center; }
@media print { .monodocs-diff-bar { display: none; } }
`;

/** The bar prepended to `{{pages}}`: the three views, and the way through the changes. */
export function diffBar(labels: DiffLabels): string {
  const view = (name: string, label: string, pressed: boolean) =>
    `<button type="button" data-monodocs-diff-view="${name}" aria-pressed="${pressed}">` +
    `${escapeHtml(label)}</button>`;
  return (
    `<div class="monodocs-diff-bar" role="toolbar" aria-label="${escapeAttr(labels.diffChanges)}">` +
    `<div class="monodocs-diff-views" role="group">` +
    view("both", labels.diffViewSideBySide, true) +
    view("current", labels.diffViewCurrent, false) +
    view("earlier", labels.diffViewEarlier, false) +
    `</div><div class="monodocs-diff-nav">` +
    `<button type="button" data-monodocs-diff-go="-1">${escapeHtml(labels.diffPrevious)}</button>` +
    `<span class="monodocs-diff-count" aria-live="polite"></span>` +
    `<button type="button" data-monodocs-diff-go="1">${escapeHtml(labels.diffNext)}</button>` +
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
    unpad();
    var article = shown();
    if (!article) return;
    own(article, ".monodocs-diff-columns").forEach(function (columns) {
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
    if (position.article && position.index >= 0) {
      var list = articles();
      for (var i = 0; i < list.length && list[i] !== position.article; i++) before += changes(list[i]).length;
      out.textContent = before + position.index + 1 + " / " + all;
    } else out.textContent = "– / " + all;
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

  var pending = 0;
  function later() {
    clearTimeout(pending);
    pending = setTimeout(function () { align(); count(); }, 60);
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
      later();
    });
    window.addEventListener("resize", later);
    document.addEventListener("load", later, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    new MutationObserver(function () { unhighlight(); later(); }).observe(document.getElementById("content") || document.body, {
      childList: true,
      subtree: true,
    });
    later();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`;
