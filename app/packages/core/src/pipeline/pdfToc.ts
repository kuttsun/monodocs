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

/** One line of the table. `target` is the ID of the element the line points at. */
export type PdfTocEntry = {
  /** 1 for a top-level sidebar entry; a heading is one deeper than its page per level below h1. */
  depth: number;
  /** The section number `numbering.sections` gave the entry (19.1), if any. */
  number?: string;
  title: string;
  target: string;
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

  const firstPage = (node: SidebarNode): string | undefined => {
    if (node.type === "page") return node.pageId;
    for (const child of node.children) {
      const found = firstPage(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const walk = (nodes: SidebarNode[], level: number): void => {
    for (const node of nodes) {
      const pageId = firstPage(node);
      if (pageId === undefined) continue;
      entries.push({
        depth: level,
        number: node.number,
        title: node.title,
        target: `page-${pageId}`,
      });
      if (node.type === "dir") {
        walk(node.children, level + 1);
        continue;
      }
      for (const heading of byId.get(node.pageId)?.headings ?? []) {
        if (heading.level < 2 || heading.level > depth) continue;
        entries.push({
          depth: level + heading.level - 1,
          number: heading.number,
          title: heading.text,
          target: heading.id,
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
const TOC_ANCHOR_PREFIX = "mdtoc-";

export function tocAnchor(n: number): string {
  return `${TOC_ANCHOR_PREFIX}${n}`;
}

/** The distinct targets, in order: entry `i` points at `tocAnchor(targetIndex[i])`. */
export function tocTargets(toc: PdfToc): { targets: string[]; targetIndex: number[] } {
  const targets: string[] = [];
  const index = new Map<string, number>();
  const targetIndex = toc.entries.map((entry) => {
    let n = index.get(entry.target);
    if (n === undefined) {
      n = targets.length;
      targets.push(entry.target);
      index.set(entry.target, n);
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
export function pdfTocHtml(toc: PdfToc, numbers: string[] | undefined, width: number): string {
  const { targetIndex } = tocTargets(toc);
  const items = toc.entries
    .map((entry, i) => {
      const number =
        entry.number === undefined
          ? ""
          : `<span class="section-number">${escapeHtml(entry.number)}</span> `;
      return (
        `<li style="--monodocs-toc-depth:${entry.depth}">` +
        `<a href="#${tocAnchor(targetIndex[i]!)}">` +
        `<span class="monodocs-toc-title">${number}${escapeHtml(entry.title)}</span>` +
        `<span class="monodocs-toc-leader"></span>` +
        `<span class="monodocs-toc-page">${escapeHtml(numbers?.[i] ?? "")}</span>` +
        `</a></li>`
      );
    })
    .join("");
  return (
    `<style>${tocStyle(width)}</style>` +
    `<h1 class="monodocs-toc-heading">${escapeHtml(toc.title)}</h1>` +
    `<ol>${items}</ol>`
  );
}

/**
 * Put the table in front of the first page, and an anchor at each target for its line to link to.
 * Chromium makes a named destination of every internal link's target, which is what the pages
 * are read back from. Run once; {@link setPdfTocScript} replaces the table's contents afterwards.
 */
export function injectPdfTocScript(targets: string[], html: string): string {
  return (
    `(function(){var ids=${JSON.stringify(targets)};` +
    `for(var n=0;n<ids.length;n++){var t=document.getElementById(ids[n]);` +
    `if(t){var a=document.createElement('a');a.id=${JSON.stringify(TOC_ANCHOR_PREFIX)}+n;` +
    `t.insertBefore(a,t.firstChild);}}` +
    `var first=document.querySelector('article.page');if(!first)return;` +
    `var nav=document.createElement('nav');nav.id=${JSON.stringify(PDF_TOC_ID)};` +
    `nav.innerHTML=${JSON.stringify(html)};first.parentNode.insertBefore(nav,first);})()`
  );
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
