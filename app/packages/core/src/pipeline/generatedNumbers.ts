import type { Element, ElementContent, Root as HastRoot, Text } from "hast";
import { SKIP, visit } from "unist-util-visit";
import type { Page } from "../types.js";

/**
 * Generated numbers are not content (roadmap 7.3.2). Inserting one section renumbers every section
 * after it, one figure every later caption, one footnote every later reference; compared as text,
 * each would show untouched blocks as changed. In a build with a difference each such number is a
 * text node of its own, marked on its `data`, which the serialiser does not write: the bytes are the
 * same, and comparison leaves the marked text out. Only the number is marked, not the word written
 * with it (`Section`, `Figure`), which an insertion does not change and an author may.
 *
 * An AsciiDoc page's numbers are marked by Asciidoctor as it writes them
 * (sources/asciidoc/numberMarks.ts); its footnotes, and GFM's, are marked by their structure here.
 * The numbers `numbering.sections` writes are elements of their own already
 * (`[data-monodocs-section-number]`).
 */

/** What a marked text node carries. */
export type GeneratedData = { monodocsGenerated?: true };

/** Whether a text node is a number the build generated. */
export function isGenerated(node: Text): boolean {
  return (node.data as GeneratedData | undefined)?.monodocsGenerated === true;
}

function classes(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

/** Mark the whole text of `node` as generated. */
function markAll(node: Element): void {
  visit(node, "text", (text) => {
    if (text.value.trim() !== "") {
      text.data = { ...text.data, monodocsGenerated: true } as Text["data"];
    }
  });
}

/** Mark every number the renderers generated on a page, in its tree. */
export function markGeneratedNumbers(tree: HastRoot, page: Page): void {
  if (page.format === "asciidoc") markAsciidoc(tree);
  else markGfm(tree);
}

/** GFM's footnote references are numbered in order of first use; the list is an `<ol>`. */
function markGfm(tree: HastRoot): void {
  visit(tree, "element", (node) => {
    if (node.tagName === "a" && node.properties.dataFootnoteRef !== undefined) markAll(node);
    // A footnote referred to again is listed with a counter on its back-reference: `↩2`.
    if (node.tagName === "a" && node.properties.dataFootnoteBackref !== undefined) {
      for (const child of node.children) {
        if (child.type === "element" && child.tagName === "sup") markAll(child);
      }
    }
  });
}

/**
 * An AsciiDoc page's numbers, marked as Asciidoctor wrote them (sources/asciidoc/numberMarks.ts):
 * each `span[data-monodocs-generated]` is turned back into the text it holds, marked, so the page
 * is written as it would be without one. Its footnotes are marked by their structure: Asciidoctor
 * assigns their numbers as it converts the text they are in.
 */
function markAsciidoc(tree: HastRoot): void {
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName === "span" && node.properties.dataMonodocsGenerated !== undefined) {
      if (parent === undefined || typeof index !== "number") return;
      const marked: ElementContent[] = node.children.map((child) =>
        child.type === "text"
          ? ({ ...child, data: { ...child.data, monodocsGenerated: true } } as Text)
          : child,
      );
      parent.children.splice(index, 1, ...marked);
      return [SKIP, index + marked.length];
    }
    const own = classes(node);
    // The whole reference, brackets and all; in a table of contents it is copied with no link.
    if (node.tagName === "sup" && (own.includes("footnote") || own.includes("footnoteref"))) {
      markAll(node);
      return;
    }
    // The number a footnote is listed with.
    if (node.tagName === "div" && own.includes("footnote")) {
      const link = node.children.find((c): c is Element => c.type === "element");
      if (link?.tagName === "a") markAll(link);
    }
  });
}
