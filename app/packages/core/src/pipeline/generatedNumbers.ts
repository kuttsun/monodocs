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

/** What a marked text node carries: a number, or the separators around a section's numbers. */
export type GeneratedData = { monodocsGenerated?: true; monodocsGeneratedSeparator?: true };

/** Whether a text node is a number the build generated. */
export function isGenerated(node: Text): boolean {
  return (node.data as GeneratedData | undefined)?.monodocsGenerated === true;
}

/** Whether a text node is the dots and space Asciidoctor writes around a section's numbers. */
export function isGeneratedSeparator(node: Text): boolean {
  return (node.data as GeneratedData | undefined)?.monodocsGeneratedSeparator === true;
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

const HEADING = /^h[1-6]$/;

/**
 * Asciidoctor writes a numbered section's heading as `1.2. Title`, and only the numbers are marked:
 * the dots and the space around them are its own too, and read as part of the heading they would
 * make a heading numbered by `:sectnums:` differ from the same heading numbered by
 * `numbering.sections`, which writes its number as an element (19.1). The separators in the run of
 * numbers that opens the heading — a `.` between two numbers, the `. ` (an appendix's `: `) after
 * the last, and a signifier word before them (`Chapter 1. Title`, `Appendix A: Title`) — are
 * marked, as the earlier column leaves them out (diff/write.ts); a title's own leading dot (`.NET`)
 * is the title's. The heading's text may sit behind an
 * empty anchor (`:sectanchors:`) or inside a link (`:sectlinks:`), and the same run opens each entry
 * of Asciidoctor's table of contents. The mark is a separator's, not a number's: what reads the
 * numbers alone sees what it saw before.
 */
function markSectionSeparators(container: Element): void {
  const isNumeral = (child: ElementContent | undefined) =>
    (child?.type === "text" && isGenerated(child)) ||
    (child?.type === "element" &&
      child.tagName === "span" &&
      child.properties.dataMonodocsGenerated !== undefined);
  const hasText = (node: ElementContent): boolean =>
    node.type === "text"
      ? node.value.trim() !== ""
      : node.type === "element" && node.children.some(hasText);
  // Whitespace, and the empty anchor `:sectanchors:` writes before the title.
  const before = (node: ElementContent) =>
    !hasText(node) && (node.type === "text" || (node.type === "element" && node.tagName === "a"));
  const children = container.children;
  let first = 0;
  while (first < children.length && before(children[first]!)) first++;
  const lead = children[first];
  // The heading inside its own link (`:sectlinks:`, `a.link`); any other link opening it is a
  // cross-reference, whose words are the author's.
  if (lead?.type === "element" && lead.tagName === "a" && !isNumeral(lead)) {
    if (classes(lead).includes("link")) markSectionSeparators(lead);
    return;
  }
  // A separator keeps whatever else its text node carried.
  const separator = (from: Text, value: string): Text => ({
    ...from,
    value,
    data: { ...from.data, monodocsGeneratedSeparator: true } as Text["data"],
  });
  // A signifier before the number, a book's `Chapter 1. Title`: a word alone, as the earlier
  // column leaves it out (diff/write.ts), so the comparison reads the heading as it shows.
  if (lead?.type === "text" && /^\S+\s+$/.test(lead.value) && isNumeral(children[first + 1])) {
    children[first] = separator(lead, lead.value);
    first++;
  } else if (!isNumeral(lead)) {
    return;
  }
  for (let i = first + 1; i < children.length; i++) {
    const child = children[i]!;
    if (isNumeral(child)) continue;
    if (child.type !== "text") return;
    // Between two numbers: `.` alone.
    if (child.value === "." && isNumeral(children[i + 1])) {
      children[i] = separator(child, ".");
      continue;
    }
    // After the last: `. `, or an appendix's `: `, then the title.
    const end = /^[.:]\s/.exec(child.value)?.[0];
    if (end === undefined) return;
    const rest = child.value.slice(end.length);
    children.splice(
      i,
      1,
      separator(child, end),
      ...(rest === "" ? [] : [{ ...child, value: rest }]),
    );
    return;
  }
}

/** Asciidoctor's table of contents: each `ul.sectlevelN > li > a` opens with the section's numbers. */
function markTocSeparators(list: Element): void {
  for (const item of list.children) {
    if (item.type !== "element" || item.tagName !== "li") continue;
    const link = item.children.find((c): c is Element => c.type === "element");
    if (link?.tagName === "a") markSectionSeparators(link);
  }
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
    // A section's heading, and its entry in the table of contents: the separators around the
    // numbers are generated with them.
    if (HEADING.test(node.tagName)) markSectionSeparators(node);
    if (node.tagName === "ul" && classes(node).some((name) => /^sectlevel\d+$/.test(name))) {
      markTocSeparators(node);
    }
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
