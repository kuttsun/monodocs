import type { Element, ElementContent, Root as HastRoot } from "hast";
import { SKIP, visit } from "unist-util-visit";
import type { FigureAlign } from "../config.js";
import type { SourceFormat } from "../types.js";

/**
 * Mark every figure with where it sits across the column (roadmap 20.6).
 *
 * The decision is made here, per element, rather than by a selector, for the reason
 * {@link file://./pageBreakHeadings.ts} gives: what counts as a figure differs between the two
 * renderers. A Markdown figure is a paragraph holding one image and nothing else, which no
 * selector can tell from a sentence with an icon in it — `img:only-child` ignores text. The rules
 * that place what is marked are written by `renderSingleHtml`, not the theme, so a theme cannot
 * delete the feature.
 */

/** The attribute the placement rules match. Namespaced, as the page-break mark is. */
export const FIGURE_ATTRIBUTE = "data-monodocs-figure";

/** What Asciidoctor writes for `align=` on an image block. */
const ASCIIDOC_ALIGN = new Map<string, FigureAlign>([
  ["text-left", "left"],
  ["text-center", "center"],
  ["text-right", "right"],
]);

function classes(node: Element): string[] {
  const value: unknown = node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/) : [];
}

/** The children that are not whitespace between tags. */
function substantive(children: ElementContent[]): ElementContent[] {
  return children.filter((child) => !(child.type === "text" && child.value.trim() === ""));
}

function isElement(node: ElementContent | undefined, tagName: string): boolean {
  return node?.type === "element" && node.tagName === tagName;
}

/** A paragraph holding one image, bare or as the only content of a link, and nothing else. */
function isMarkdownFigure(node: Element): boolean {
  if (node.tagName !== "p") return false;
  const [only, ...rest] = substantive(node.children);
  if (rest.length > 0) return false;
  if (isElement(only, "img")) return true;
  if (only?.type !== "element" || only.tagName !== "a") return false;
  const inner = substantive(only.children);
  return inner.length === 1 && isElement(inner[0], "img");
}

function asciidocAlign(node: Element): FigureAlign | undefined {
  for (const name of classes(node)) {
    const align = ASCIIDOC_ALIGN.get(name);
    if (align !== undefined) return align;
  }
  return undefined;
}

/** An AsciiDoc listing block's title, when the block holds a Mermaid diagram. */
function mermaidBlockTitle(node: Element): Element | undefined {
  if (node.tagName !== "div" || !classes(node).includes("listingblock")) return undefined;
  let diagram = false;
  visit(node, "element", (inner) => {
    if (classes(inner).includes("mermaid")) diagram = true;
  });
  if (!diagram) return undefined;
  return node.children.find(
    (child): child is Element => child.type === "element" && classes(child).includes("title"),
  );
}

/**
 * Mark the figures of one page.
 *
 * - Markdown: a paragraph holding one image (linked or not) and nothing else. An image beside text
 *   or beside another image is not a figure and stays where it was.
 * - AsciiDoc: an image block (`image::`), its `align=` winning over `fallback`. An inline
 *   `image:` is never one. `float=` is not alignment and is not honoured; a floated block is an
 *   unaligned figure.
 * - Either format: a Mermaid diagram, which has no markup of its own for alignment in either. An
 *   AsciiDoc block title over it goes with it, as an image block's does.
 *
 * Nothing in a table cell is a figure: a cell has an alignment of its own, which Markdown writes in
 * the delimiter row and AsciiDoc as `halign`, and an image in it sits as the cell's content does.
 */
export function markFigures(tree: HastRoot, format: SourceFormat, fallback: FigureAlign): void {
  visit(tree, "element", (node) => {
    if (node.tagName === "td" || node.tagName === "th") return SKIP;
    const names = classes(node);
    let align: FigureAlign | undefined;
    if (names.includes("mermaid")) {
      align = fallback;
    } else if (format === "markdown") {
      if (isMarkdownFigure(node)) align = fallback;
    } else if (node.tagName === "div" && names.includes("imageblock")) {
      align = asciidocAlign(node) ?? fallback;
    } else {
      const title = mermaidBlockTitle(node);
      if (title !== undefined) title.properties[FIGURE_ATTRIBUTE] = fallback;
    }
    if (align !== undefined) node.properties[FIGURE_ATTRIBUTE] = align;
    return undefined;
  });
}
