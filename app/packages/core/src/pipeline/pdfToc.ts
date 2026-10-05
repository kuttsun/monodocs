import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import type { Page, SidebarNode } from "../types.js";
import { escapeHtml } from "../util/html.js";

/**
 * A table of contents on paper (roadmap 24.9).
 *
 * Nothing in the pipeline knows what sheet anything is on until Chromium has produced the PDF, so
 * the table is printed with its page-number column empty, the sheets are read back out of that
 * PDF, and the document is printed again with the numbers in. The numbers are then read once more
 * from the PDF that will be delivered and compared with what it prints: a page number that is
 * usually right is worse than none, because a reader who finds one wrong number cannot trust the
 * rest. The PDF only — the HTML has the sidebar, and no page to number.
 */

/**
 * What a line points at: a page's article, or an element inside it. Looked up within the page
 * rather than by ID across the document, because two pages can produce the same element ID — a
 * page ID joins route segments with `-`, so `setup.md`'s "Install Guide" and `setup/install.md`'s
 * "Guide" are both `setup-install-guide` — and the first match would be the wrong heading, on the
 * wrong sheet, with a destination that verifies against itself.
 */
export type PdfTocTarget = {
  route: string;
  id?: string;
  /**
   * Which heading carrying `id`, counting from 0 in document order. Asciidoctor only warns about an
   * ID used twice in one file, and both headings reach the output; without this both lines would
   * point at the first.
   */
  nth?: number;
};

/** One line of the table. */
export type PdfTocEntry = {
  /** 1 for a top-level sidebar entry; a heading is one deeper than its page per level below h1. */
  depth: number;
  /** The section number `numbering.sections` gave the entry (19.1), if any. */
  number?: string;
  title: string;
  target: PdfTocTarget;
};

export type PdfToc = {
  /** The heading printed above the list (the `contents` label). */
  title: string;
  entries: PdfTocEntry[];
};

/**
 * The entries, in the shape the sidebar and the PDF bookmarks have: each directory and page, and
 * under each page its headings from h2 down to `depth`. A directory points at its first page, as
 * its bookmark does. A page with no place in the sidebar is not listed, as it is not numbered.
 */
export function buildPdfToc(
  sidebar: SidebarNode[],
  pages: Page[],
  depth: number,
  title: string,
): PdfToc {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const entries: PdfTocEntry[] = [];

  const firstPage = (node: SidebarNode): Extract<SidebarNode, { type: "page" }> | undefined => {
    if (node.type === "page") return node;
    for (const child of node.children) {
      const found = firstPage(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const walk = (nodes: SidebarNode[], level: number): void => {
    for (const node of nodes) {
      const first = firstPage(node);
      if (first === undefined) continue;
      entries.push({
        depth: level,
        number: node.number,
        title: node.title,
        target: { route: first.route },
      });
      if (node.type === "dir") {
        walk(node.children, level + 1);
        continue;
      }
      const seen = new Map<string, number>();
      for (const heading of byId.get(node.pageId)?.headings ?? []) {
        // Counted over every heading, listed or not, so it matches the heading's place in the page.
        const nth = seen.get(heading.id) ?? 0;
        seen.set(heading.id, nth + 1);
        if (heading.level < 2 || heading.level > depth) continue;
        entries.push({
          depth: level + heading.level - 1,
          number: heading.number,
          title: heading.text,
          target:
            nth === 0
              ? { route: node.route, id: heading.id }
              : { route: node.route, id: heading.id, nth },
        });
      }
    }
  };
  walk(sidebar, 1);
  return { title, entries };
}

/** The element the table is printed in. Namespaced, like every ID core adds to a document. */
export const PDF_TOC_ID = "monodocs-print-toc";

/** The named destination for the n-th distinct target. ASCII, whatever the element ID is. */
export function tocAnchor(prefix: string, n: number): string {
  return `${prefix}${n}`;
}

/** The distinct targets, in order: entry `i` points at `tocAnchor(targetIndex[i])`. */
export function tocTargets(toc: PdfToc): { targets: PdfTocTarget[]; targetIndex: number[] } {
  const targets: PdfTocTarget[] = [];
  const index = new Map<string, number>();
  const targetIndex = toc.entries.map((entry) => {
    const key = `${entry.target.route}\u0000${entry.target.id ?? ""}\u0000${entry.target.nth ?? 0}`;
    let n = index.get(key);
    if (n === undefined) {
      n = targets.length;
      targets.push(entry.target);
      index.set(key, n);
    }
    return n;
  });
  return { targets, targetIndex };
}

/**
 * The rules the table is laid out by, carried inside it so that a theme cannot remove them and so
 * that the layout does not depend on the theme's. The number column has a fixed width in tabular
 * figures: the space a line's text gets is then the same whether the column is empty or holds
 * "9" or "1024", so filling it in cannot rewrap an entry and move a section to another sheet.
 */
function tocStyle(width: number): string {
  return (
    `#${PDF_TOC_ID}{break-after:page;page-break-after:always}` +
    `#${PDF_TOC_ID} ol{list-style:none;margin:0;padding:0}` +
    `#${PDF_TOC_ID} li{margin:0;padding:0;break-inside:avoid}` +
    `#${PDF_TOC_ID} a{display:flex;align-items:baseline;gap:0.4em;color:inherit;` +
    `text-decoration:none;padding-left:calc((var(--monodocs-toc-depth) - 1) * 1.5em)}` +
    // A title must be able to shrink and wrap, or one long unbreakable word (an identifier, a URL)
    // would push the leader and the number past the edge of the sheet.
    `#${PDF_TOC_ID} .monodocs-toc-title{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}` +
    `#${PDF_TOC_ID} .monodocs-toc-heading{margin-top:0}` +
    `#${PDF_TOC_ID} .monodocs-toc-leader{flex:1 1 1em;min-width:1em;` +
    `border-bottom:1px dotted currentColor;opacity:0.5}` +
    `#${PDF_TOC_ID} .monodocs-toc-page{flex:none;width:${width}ch;text-align:right;` +
    `font-variant-numeric:tabular-nums}`
  );
}

/**
 * The table's HTML. `numbers` is undefined on the first pass, which prints the column empty.
 * Every value is escaped: titles come from documents and the label from configuration.
 */
export function pdfTocHtml(
  toc: PdfToc,
  numbers: string[] | undefined,
  width: number,
  prefix: string,
): string {
  const { targetIndex } = tocTargets(toc);
  const items = toc.entries
    .map((entry, i) => {
      const number =
        entry.number === undefined
          ? ""
          : `<span class="section-number">${escapeHtml(entry.number)}</span> `;
      return (
        `<li style="--monodocs-toc-depth:${entry.depth}">` +
        `<a href="#${tocAnchor(prefix, targetIndex[i]!)}">` +
        `<span class="monodocs-toc-title">${number}${escapeHtml(entry.title)}</span>` +
        `<span class="monodocs-toc-leader"></span>` +
        `<span class="monodocs-toc-page">${escapeHtml(numbers?.[i] ?? "")}</span>` +
        `</a></li>`
      );
    })
    .join("");
  return (
    // The heading first, so a theme's `h1:first-child` rule sees it as the first thing on the sheet.
    `<h1 class="monodocs-toc-heading">${escapeHtml(toc.title)}</h1>` +
    `<style>${tocStyle(width)}</style>` +
    `<ol>${items}</ol>`
  );
}

/**
 * Browser-side lookup of a target, shared by the probe and the injection so the two cannot find
 * different elements: the article whose `data-route` is the route, and inside it the `nth` heading
 * whose ID is the ID — compared as a string, so no ID has to survive being written as a selector.
 * Only headings are candidates, since every line with an ID points at one: another element sharing
 * the ID (an explicit `[[h1]]` anchor and the ID an untitled heading is given) cannot be taken for
 * it. The index is built once per script, so a page is walked once rather than once per line.
 */
const FIND_TARGET =
  `var index=null;function findTarget(t){if(!index){index={};` +
  `document.querySelectorAll('article.page').forEach(function(a){var r=a.getAttribute('data-route');` +
  `if(Object.prototype.hasOwnProperty.call(index,r))return;var ids=new Map();` +
  `a.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]').forEach(function(el){` +
  `var list=ids.get(el.id);if(list)list.push(el);else ids.set(el.id,[el]);});` +
  `index[r]={article:a,ids:ids};});}` +
  `if(!Object.prototype.hasOwnProperty.call(index,t.route))return null;var e=index[t.route];` +
  `if(t.id===undefined)return e.article;var list=e.ids.get(t.id);` +
  `return (list&&list[t.nth||0])||null;}`;

/**
 * A prefix for the anchors that no ID in the document starts with. The anchors are added to a
 * document whose IDs come from its authors — a page `mdtoc.md` with a heading "3" has the ID
 * `mdtoc-3` — and Chromium resolves a link to the first element with its ID, so an anchor sharing
 * one would put a line on another section's sheet, and verify there.
 */
const FREE_PREFIX =
  `function freePrefix(){var ids=[];document.querySelectorAll('[id]').forEach(function(el){` +
  `ids.push(el.id);});for(var k=0;;k++){var p='mdtoc'+(k?k:'')+'-';` +
  `if(!ids.some(function(id){return id.indexOf(p)===0;}))return p;}}`;

/**
 * For each target, whether it was found and whether it is printed — "missing", "hidden", or "ok" —
 * and a free prefix for the anchors ({@link FREE_PREFIX}).
 * A heading inside a closed `<details>` — an AsciiDoc collapsible block — is not on paper, though
 * Chromium still writes a destination for it, so a line for it would point at a sheet that does
 * not show it. A heading in the block's own `<summary>` is shown and is not hidden.
 */
export function probePdfTocScript(targets: PdfTocTarget[]): string {
  return (
    `(function(){${FIND_TARGET}${FREE_PREFIX}var ts=${JSON.stringify(targets)};` +
    `var states=ts.map(function(t){var el=findTarget(t);if(!el)return 'missing';` +
    `for(var d=el.parentElement;d;d=d.parentElement){if(d.tagName==='DETAILS'&&!d.open){` +
    `var s=d.querySelector(':scope>summary');if(!s||!s.contains(el))return 'hidden';}}` +
    `return 'ok';});return JSON.stringify({states:states,prefix:freePrefix()});})()`
  );
}

/**
 * Put the table in front of the first page, and an anchor at each target for its line to link to.
 * Chromium makes a named destination of every internal link's target, which is what the pages
 * are read back from. Run once; {@link setPdfTocScript} replaces the table's contents afterwards.
 */
export function injectPdfTocScript(targets: PdfTocTarget[], html: string, prefix: string): string {
  return (
    `(function(){${FIND_TARGET}var ts=${JSON.stringify(targets)};` +
    `for(var n=0;n<ts.length;n++){var t=findTarget(ts[n]);` +
    `if(t){var a=document.createElement('a');a.id=${JSON.stringify(prefix)}+n;` +
    // In a heading the anchor is an atomic box on its first line, so it is laid out on the sheet
    // the heading's text is. Measured with Google Chrome on Windows: an empty inline anchor at the
    // start of a heading that begins a sheet was given the previous sheet, one lower than the
    // heading, and verifying the destination against itself could not see it. A page's anchor
    // stays an empty inline, which adds no line at the top of the article.
    `if(ts[n].id!==undefined)a.style.cssText='display:inline-block;width:0;height:0;vertical-align:top';` +
    `t.insertBefore(a,t.firstChild);}}` +
    `var first=document.querySelector('article.page');if(!first)return;` +
    `var nav=document.createElement('nav');nav.id=${JSON.stringify(PDF_TOC_ID)};` +
    `nav.innerHTML=${JSON.stringify(html)};first.parentNode.insertBefore(nav,first);})()`
  );
}

/** How a target is named in a message: the element ID, or the route of a page. */
export function describeTarget(target: PdfTocTarget): string {
  return target.id ?? target.route;
}

export function setPdfTocScript(html: string): string {
  return (
    `(function(){var nav=document.getElementById(${JSON.stringify(PDF_TOC_ID)});` +
    `if(nav)nav.innerHTML=${JSON.stringify(html)};})()`
  );
}

/**
 * The 1-based sheet each named destination lands on, or undefined for one the PDF does not have.
 * Read from the catalog's `/Dests`, where Chromium puts them, as the outline pass does (24.3.2).
 */
export async function resolveDestPages(
  pdf: Uint8Array,
  names: string[],
): Promise<(number | undefined)[]> {
  const doc = await PDFDocument.load(pdf);
  const sheets = new Map(doc.getPages().map((page, i) => [page.ref.toString(), i + 1]));
  const dests = doc.catalog.lookup(PDFName.of("Dests"));
  return names.map((name) => {
    if (!(dests instanceof PDFDict)) return undefined;
    let value = dests.lookup(PDFName.of(name));
    if (value instanceof PDFDict) value = value.lookup(PDFName.of("D"));
    if (!(value instanceof PDFArray)) return undefined;
    const ref = value.get(0);
    return ref instanceof PDFRef ? sheets.get(ref.toString()) : undefined;
  });
}
