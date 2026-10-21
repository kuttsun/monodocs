import type { DiffLabels } from "../labels.js";
import { escapeAttr, escapeHtml } from "../util/html.js";

/**
 * What a difference adds to the page in the browser (roadmap 7.3.4): its rules, through
 * `{{style}}`, its bar, before `{{pages}}`, and its script, through `{{bodyScripts}}` — tokens every
 * template has, so a custom theme gets them without carrying them, and the default theme's `app.js`
 * stays byte for byte what it was.
 */

/**
 * The diagrams a render draws in a build with a difference: those of the page shown, as in any build,
 * but not those in a column the view hides, which would be laid out at no size and kept that way.
 * The script draws them when their column is shown.
 */
export const DIFF_MERMAID =
  "#content article:not([hidden]) .mermaid" +
  ':not(:root[data-monodocs-diff-view="current"] .monodocs-diff-earlier .mermaid)' +
  ':not(:root[data-monodocs-diff-view="earlier"] .monodocs-diff-current .mermaid)';

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
/* The band's room, only while the band is shown. */
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) p[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) li[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) h1[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) h2[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) h3[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) h4[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) h5[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) h6[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) dt[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) dd[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) div[data-monodocs-diff-block],
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"]) span[data-monodocs-diff-block] {
  padding-inline: 0.5rem;
  margin-inline: -0.5rem;
}
tr[data-monodocs-diff-block] { box-shadow: none; }
/* An image, a diagram drawn inline, or a player covers its own background: it is ringed instead. */
:is(img, svg, object, video, audio, iframe, embed)[data-monodocs-diff-block] {
  box-shadow: none;
  outline: 3px solid var(--monodocs-diff-ring);
  outline-offset: 3px;
}
:is(img, svg, object, video, audio, iframe, embed)[data-monodocs-diff-block="ins"] { --monodocs-diff-ring: var(--monodocs-diff-added); }
:is(img, svg, object, video, audio, iframe, embed)[data-monodocs-diff-block="del"] { --monodocs-diff-ring: var(--monodocs-diff-deleted); }
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
/* Code struck through or underlined line by line cannot be read; its band and edge say what changed. */
pre :is(ins, del)[data-monodocs-diff] { text-decoration: none; }

/* A file the earlier column shows as its path stands in a span; lining it up takes its top margin. */
.monodocs-diff-columns span[data-monodocs-diff-pair] { display: inline-block; }

/* Two columns, and the line between them that every change leans towards. */
.monodocs-diff-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 3rem;
  background: linear-gradient(var(--monodocs-diff-line), var(--monodocs-diff-line)) center / 1px 100% no-repeat;
}
/* While the band is shown, a deleted block's reaches towards the line between the columns, and an
   added block's stops at its column's edge. */
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"])
  .monodocs-diff-earlier
  [data-monodocs-diff-block="del"] { margin-inline-end: -0.75rem; }
:is(:root:not([data-monodocs-diff-marks="off"]), :root[data-monodocs-diff-view="both"])
  .monodocs-diff-current
  [data-monodocs-diff-block="ins"] { margin-inline-end: 0; }
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
/* A column's heading tells the two apart; a version's own view is that version, named by the bar. */
:root[data-monodocs-diff-view="current"] .monodocs-diff-column-title,
:root[data-monodocs-diff-view="earlier"] .monodocs-diff-column-title { display: none; }
:root[data-monodocs-diff-view="current"] .monodocs-diff-columns,
:root[data-monodocs-diff-view="earlier"] .monodocs-diff-columns {
  grid-template-columns: minmax(0, 1fr);
  background: none;
}
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
:is(img, svg, object, video, audio, iframe, embed).monodocs-diff-change-current {
  --monodocs-diff-ring: var(--color-accent, Highlight);
}

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
.monodocs-diff-marks {
  display: inline-flex;
  margin-inline-end: auto;
  align-items: center;
  gap: 0.4em;
  font-size: 0.8125rem;
  color: var(--monodocs-diff-muted);
  cursor: pointer;
  user-select: none;
}
.monodocs-diff-marks input { margin: 0; accent-color: var(--color-accent, auto); }
/* Side by side, both columns are always marked: the box is ticked and cannot be changed. */
.monodocs-diff-marks:has(input:disabled) { opacity: 0.55; cursor: default; }

/* A version's own view with its marks off is that version, plain: no band, no line, no note above
   the page, no badge in the sidebar. The way through the changes still shows where each one is. */
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) [data-monodocs-diff-block],
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) tr[data-monodocs-diff-block] > * {
  background: none;
  box-shadow: none;
  outline: none;
}
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) ins[data-monodocs-diff],
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) del[data-monodocs-diff] {
  text-decoration: none;
}
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) .page > .monodocs-diff-note,
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) .monodocs-diff-mark,
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) .monodocs-diff-label {
  display: none;
}
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) .sidebar-page[data-monodocs-diff-page="deleted"] > a {
  color: inherit;
  text-decoration: none;
}
/* What the plain view takes off a block, the ring of the change the navigation is on puts back. */
:root[data-monodocs-diff-marks="off"]:not([data-monodocs-diff-view="both"]) .monodocs-diff-change-current {
  outline: 2px solid var(--color-accent, Highlight);
}
/* The in-page table of contents of a changed page: both versions' headings, the added and the
   deleted marked, each with the number of changes in its section. */
.monodocs-diff-columns :is(h2, h3, h4, h5, h6) {
  scroll-margin-top: calc(var(--monodocs-diff-bar-height) + 3.5rem);
}
.monodocs-diff-toc a { display: flex; align-items: baseline; gap: 0.4em; }
.monodocs-diff-toc-text { min-width: 0; }
.monodocs-diff-toc-sign { flex: none; font-weight: 700; }
.monodocs-diff-toc-ins .monodocs-diff-toc-sign { color: var(--monodocs-diff-added); }
.monodocs-diff-toc-del .monodocs-diff-toc-sign { color: var(--monodocs-diff-deleted); }
.monodocs-diff-toc-del .monodocs-diff-toc-text {
  text-decoration: line-through color-mix(in srgb, var(--monodocs-diff-deleted) 70%, transparent);
}
.monodocs-diff-toc-count {
  margin-inline-start: auto;
  flex: none;
  min-width: 1.4em;
  padding: 0 0.4em;
  border-radius: 999px;
  font-size: 0.75em;
  line-height: 1.6;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--monodocs-diff-changed);
  background: color-mix(in srgb, var(--monodocs-diff-changed) 14%, transparent);
}
/* The previous and next pages: none side by side, where two versions' orders meet; in a
   version's own view, that version's order, which the script writes. */
:root:not([data-monodocs-diff-view]) #page-nav,
:root[data-monodocs-diff-view="both"] #page-nav { display: none; }
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
  const view = (name: string, label: string, pressed: boolean, hint?: string) =>
    `<button type="button" data-monodocs-diff-view="${name}" aria-pressed="${pressed}"` +
    `${hint === undefined ? "" : ` title="${escapeAttr(hint)}"`}>${escapeHtml(label)}</button>`;
  return (
    `<div class="monodocs-diff-bar" role="toolbar" aria-label="${escapeAttr(labels.diffChanges)}">` +
    `<div class="monodocs-diff-views" role="group">` +
    view("both", labels.diffViewSideBySide, true, labels.diffViewSideBySideHint) +
    // In the order the columns stand: the earlier version on the left, the new on the right.
    view("earlier", labels.diffViewEarlier, false) +
    view("current", labels.diffViewCurrent, false) +
    `</div>` +
    // In a version's own view, whether its changes are marked: plain by default (7.3.4).
    `<label class="monodocs-diff-marks"><input type="checkbox" data-monodocs-diff-marks-toggle checked disabled>` +
    `${escapeHtml(labels.diffShowMarks)}</label>` +
    `<div class="monodocs-diff-nav">` +
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
  // The pages the changes are walked through: side by side, every page in the document's order; in a
  // version's own view, the pages that version's sidebar lists, in its order — as the previous and
  // next pages under a page go.
  function walked() {
    var all = articles();
    if (view === "both") return all;
    var byRoute = {};
    all.forEach(function (article) { byRoute[article.getAttribute("data-route")] = article; });
    var out = [];
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-monodocs-diff-sidebar="' + view + '"] a[data-route]'),
      function (link) {
        var article = byRoute[link.getAttribute("data-route")];
        if (article && out.indexOf(article) === -1) out.push(article);
      },
    );
    return out;
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
    watchSizes(held);
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
      // A note above the page is hidden in a version's plain view: the page's first block shows
      // where its change is.
      var plain = !marksShown();
      var notes = own(article, ".monodocs-diff-note").filter(visible).filter(function (note) {
        return !(plain && note.parentNode === article);
      });
      if (notes.length > 0) return notes.slice(0, 1);
      if (plain && own(article, ":scope > .monodocs-diff-note").length > 0) {
        var first = Array.prototype.filter.call(article.children, function (child) {
          return !child.classList.contains("monodocs-diff-note");
        })[0];
        // On a page in two columns, the first block of the column shown, not the columns whole.
        if (first && first.classList.contains("monodocs-diff-columns")) {
          var column = Array.prototype.filter.call(first.children, visible)[0];
          first = column && Array.prototype.filter.call(column.children, function (child) {
            return !child.classList.contains("monodocs-diff-column-title");
          })[0];
        }
        if (first) return [first];
      }
      // An added or deleted page whose note is in the column hidden: the column shown stands for it.
      // Another page whose changes are all in the hidden column has none in this view.
      if (state !== "added" && state !== "deleted") return [];
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
    return walked().reduce(function (sum, article) { return sum + changes(article).length; }, 0);
  }
  function count() {
    var out = document.querySelector(".monodocs-diff-count");
    if (!out) return;
    var all = total();
    var before = 0;
    var text = "– / " + all;
    if (position.article && position.index >= 0) {
      var list = walked();
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
    var list = walked().filter(function (article) { return changes(article).length > 0; });
    if (list.length === 0) return;
    var at = list.indexOf(position.article);
    var index = position.index + step;
    if (at === -1) {
      var current = shown();
      at = step > 0 ? -1 : list.length;
      if (current) {
        var all = walked();
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

  // Whether a version's own view marks its changes; side by side always does.
  var marks = false;
  function setMarks(on) {
    marks = on;
    root.setAttribute("data-monodocs-diff-marks", on ? "on" : "off");
    // What stands for a change may differ with the marks: the position starts again.
    var old = document.querySelector(".monodocs-diff-change-current");
    if (old) old.classList.remove("monodocs-diff-change-current");
    position = { article: null, index: -1 };
    later();
  }
  function showBox() {
    var box = document.querySelector("[data-monodocs-diff-marks-toggle]");
    if (!box) return;
    box.disabled = view === "both";
    box.checked = view === "both" || marks;
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
    // The list of changes is the side-by-side view's: leaving it, a version's view opens its first page.
    var article = shown();
    if (name !== "both" && article && article.getAttribute("data-route") === "//changes") {
      var first = document.querySelector('[data-monodocs-diff-sidebar="' + name + '"] a[data-route]');
      if (first) location.hash = "#" + encodeURI(first.getAttribute("data-route"));
    }
    showBox();
    reveal();
    // The diagrams of a column just shown, which a render left out while it was hidden.
    if (typeof window.__sdRenderMermaid === "function") window.__sdRenderMermaid().then(later);
    align();
    count();
    drawToc();
    drawPageNav();
  }

  // The in-page table of contents of a changed page, drawn into the theme's own place for it: the
  // headings of the columns shown, in the order the alignment puts them, a pair once; side by side,
  // or with the changes shown, the added and deleted marked and each with the changes in its section.
  var tocEntries = [];
  function tocLevel() {
    var data = window.__MONODOCS_DATA__;
    return data && typeof data.tocMaxLevel === "number" ? data.tocMaxLevel : 3;
  }
  function marksShown() {
    return view === "both" || marks;
  }
  function escapeText(text) {
    return text.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // A heading as the theme's table of contents reads it: its words, a formula as its TeX between
  // dollars, without its section number, which is written beside it.
  function headingText(heading) {
    var copy = heading.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll(".section-number"), function (node) {
      node.parentNode.removeChild(node);
    });
    Array.prototype.forEach.call(copy.querySelectorAll("[data-math-tex]"), function (node) {
      node.parentNode.replaceChild(document.createTextNode("$" + node.getAttribute("data-math-tex") + "$"), node);
    });
    // Escaped twice: this script is a template literal, which would turn a lone backslash-s into "s".
    return (copy.textContent || "").replace(/\\s+/g, " ").trim();
  }
  function drawToc() {
    var nav = document.getElementById("toc-nav");
    var article = shown();
    tocEntries = [];
    if (!nav || !article) return;
    var columns = article.querySelector(".monodocs-diff-columns");
    if (!columns) return;
    var levels = [];
    for (var level = 2; level <= tocLevel(); level++) levels.push("h" + level);
    var visible = function (node) { return node.offsetParent !== null; };
    var seen = {};
    var headings = own(columns, levels.join(",")).filter(visible).filter(function (heading) {
      var pair = heading.getAttribute("data-monodocs-diff-pair");
      if (pair === null) return true;
      if (seen[pair]) return false;
      seen[pair] = true;
      return true;
    });
    var top = function (node) { return node.getBoundingClientRect().top; };
    headings.sort(function (a, b) {
      var d = top(a) - top(b);
      if (Math.abs(d) >= 1) return d;
      return a.closest(".monodocs-diff-earlier") ? -1 : 1;
    });
    var shownMarks = marksShown();
    var changed = changes(article).filter(function (node) {
      return node.hasAttribute("data-monodocs-diff-block");
    });
    // A section's changes are counted in its own column, up to the column's next heading; an
    // unchanged heading's, in both columns.
    var inColumn = function (column) {
      return own(column, levels.join(",")).filter(visible);
    };
    var lists = [inColumn(columns.children[0]), inColumn(columns.children[1])];
    var section = function (heading) {
      var column = heading.closest(".monodocs-diff-earlier") ? 0 : 1;
      var list = lists[column];
      var at = list.indexOf(heading);
      var from = top(heading);
      var to = at + 1 < list.length ? top(list[at + 1]) : Infinity;
      return changed.filter(function (node) {
        var place = top(node);
        return node.closest(".monodocs-diff-columns > div") === columns.children[column] &&
          place >= from - 1 && place < to - 1;
      }).length;
    };
    var partner = function (heading) {
      var pair = heading.getAttribute("data-monodocs-diff-pair");
      if (pair === null) return null;
      var other = heading.closest(".monodocs-diff-earlier") ? columns.children[1] : columns.children[0];
      var found = other.querySelector('[data-monodocs-diff-pair="' + pair + '"]');
      return found && visible(found) ? found : null;
    };
    var html = '<ul class="toc-list monodocs-diff-toc">';
    headings.forEach(function (heading, i) {
      var state = heading.getAttribute("data-monodocs-diff-block");
      var other = partner(heading);
      var count = section(heading) + (other ? section(other) : 0);
      var number = heading.querySelector(".section-number");
      var text = headingText(heading);
      var kind = shownMarks && state ? " monodocs-diff-toc-" + state : "";
      tocEntries.push(heading);
      html +=
        '<li class="toc-item toc-level-' + heading.tagName.slice(1) + kind + '">' +
        '<a href="#" data-monodocs-diff-toc="' + i + '">' +
        (shownMarks && state ? '<span class="monodocs-diff-toc-sign" aria-hidden="true">' + (state === "ins" ? "+" : "−") + "</span>" : "") +
        '<span class="monodocs-diff-toc-text">' +
        (number ? '<span class="section-number">' + escapeText(number.textContent) + "</span> " : "") +
        escapeText(text) + "</span>" +
        (shownMarks && count > 0 ? '<span class="monodocs-diff-toc-count">' + count + "</span>" : "") +
        "</a></li>";
    });
    html += "</ul>";
    var toc = document.getElementById("toc");
    if (toc) toc.hidden = headings.length === 0;
    if (nav.innerHTML !== html) nav.innerHTML = html;
    spyToc();
  }
  // The heading read now: the last whose top has passed under the bar and the column headings.
  function spyToc() {
    var nav = document.getElementById("toc-nav");
    if (!nav || tocEntries.length === 0) return;
    var line = (parseFloat(getComputedStyle(root).getPropertyValue("--monodocs-diff-bar-height")) || 52) + 80;
    var current = -1;
    tocEntries.forEach(function (heading, i) {
      if (heading.getBoundingClientRect().top <= line) current = i;
    });
    // At the end of the page the last headings can rise no further: the last is the one read.
    var scroller = document.scrollingElement || root;
    if (scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 2) {
      current = tocEntries.length - 1;
    }
    Array.prototype.forEach.call(nav.querySelectorAll("a[data-monodocs-diff-toc]"), function (link) {
      link.classList.toggle("active", Number(link.getAttribute("data-monodocs-diff-toc")) === Math.max(current, 0));
    });
  }

  // The previous and next pages in a version's own view: that version's order, as its sidebar
  // lists it, the list of changes left out; written in the theme's markup for them.
  function drawPageNav() {
    var nav = document.getElementById("page-nav");
    var article = shown();
    if (!nav || !article || view === "both") return;
    var links = Array.prototype.slice
      .call(document.querySelectorAll('[data-monodocs-diff-sidebar="' + view + '"] a[data-route]'))
      .filter(function (link) { return link.getAttribute("data-route") !== "//changes"; });
    var route = article.getAttribute("data-route");
    var at = -1;
    links.forEach(function (link, i) { if (link.getAttribute("data-route") === route) at = i; });
    var data = window.__MONODOCS_DATA__;
    var labels = (data && data.labels) || {};
    var item = function (link, side, label) {
      var copy = link.cloneNode(true);
      Array.prototype.forEach.call(copy.querySelectorAll(".monodocs-diff-mark, .monodocs-diff-label, .section-number"), function (node) {
        node.parentNode.removeChild(node);
      });
      var target = link.getAttribute("data-route");
      return '<div class="page-nav-item page-nav-item-' + side + '"><span class="page-nav-dir">' +
        escapeText(label || "") + '</span><a class="page-nav-link page-nav-' + side +
        '" data-route="' + escapeText(target) + '" href="#' + escapeText(encodeURI(target)) + '">' +
        escapeText((copy.textContent || "").trim()) + "</a></div>";
    };
    var html = "";
    if (at !== -1) {
      html += at > 0 ? item(links[at - 1], "prev", labels.prev) : '<span class="page-nav-spacer"></span>';
      if (at < links.length - 1) html += item(links[at + 1], "next", labels.next);
    }
    if (nav.innerHTML !== html) nav.innerHTML = html;
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

  // A column's width or height changed by anything but this script — the sidebar opened or closed,
  // a code block's lines wrapped, a font come in — calls for lining up again. Its size once lined
  // up is kept, so the space this script adds is not taken for a change.
  var sizes = typeof WeakMap === "function" ? new WeakMap() : null;
  var resized =
    typeof ResizeObserver === "function" && sizes
      ? new ResizeObserver(function (entries) {
          var moved = entries.some(function (entry) {
            var last = sizes.get(entry.target);
            var box = entry.contentRect;
            return !last || Math.abs(last.width - box.width) > 1 || Math.abs(last.height - box.height) > 1;
          });
          if (moved) later();
        })
      : null;
  function watchSizes(list) {
    if (!resized) return;
    list.forEach(function (columns) {
      Array.prototype.forEach.call(columns.children, function (column) {
        // The content box, as the observer reports it.
        var style = getComputedStyle(column);
        var across = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        var down = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        sizes.set(column, { width: column.clientWidth - across, height: column.clientHeight - down });
        resized.observe(column);
      });
    });
  }

  var pending = 0;
  function later() {
    clearTimeout(pending);
    pending = setTimeout(function () { measure(); align(); count(); drawToc(); drawPageNav(); }, 60);
  }

  function start() {
    root.setAttribute("data-monodocs-diff-view", view);
    root.setAttribute("data-monodocs-diff-marks", "off");
    showBox();
    setTimeout(reveal, 0);
    document.addEventListener("change", function (event) {
      if (event.target.hasAttribute && event.target.hasAttribute("data-monodocs-diff-marks-toggle")) {
        setMarks(event.target.checked);
      }
    });
    document.addEventListener("click", function (event) {
      var entry = event.target.closest && event.target.closest("a[data-monodocs-diff-toc]");
      if (entry) {
        event.preventDefault();
        var heading = tocEntries[Number(entry.getAttribute("data-monodocs-diff-toc"))];
        if (heading) heading.scrollIntoView({ block: "start" });
        return;
      }
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
    var spying = false;
    window.addEventListener("scroll", function () {
      if (spying) return;
      spying = true;
      requestAnimationFrame(function () { spying = false; spyToc(); });
    }, { passive: true });
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
