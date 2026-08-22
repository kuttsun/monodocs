import type { Element, ElementContent, Root as HastRoot, Text } from "hast";

/**
 * Mark the headings that start a new sheet under `pdf.pageBreakLevel` (roadmap 24.7).
 *
 * The decision is made here rather than in a selector because the two renderers produce different
 * shapes for the same document: Markdown a flat body, Asciidoctor a nesting of `.sect1`–`.sect5`
 * and `.sectionbody`. A CSS rule for "unless the page title is all that precedes it" would have to
 * enumerate both, and would still misread a page whose h1 is missing or whose first heading is an
 * h3.
 */

/** The attribute the print rule matches. Namespaced: a theme and an AsciiDoc passthrough can both
 * put attributes on a heading, and this one must mean only what core put there. */
export const PAGE_BREAK_ATTRIBUTE = "data-monodocs-pdf-break-before";

/** Asciidoctor's section wrappers are structure, not content, so the walk passes through them. */
const TRANSPARENT_CLASS = /^(sect[1-5]|sectionbody)$/;

function classes(node: Element): string[] {
  const value: unknown = node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/) : [];
}

function isTransparent(node: Element): boolean {
  return node.tagName === "div" && classes(node).some((c) => TRANSPARENT_CLASS.test(c));
}

/** The heading level, or 0 for anything else. */
function headingLevel(node: Element): number {
  const match = /^h([1-6])$/.exec(node.tagName);
  return match ? Number(match[1]) : 0;
}

function isMarker(node: Element): boolean {
  return node.tagName === "div" && classes(node).includes("page-break");
}

/**
 * The page's own flow: every node that draws something, with the section wrappers expanded in place
 * and whitespace between blocks left out.
 *
 * A container that is not a wrapper — a table, a figure, an admonition, a blockquote — is one item
 * and is not descended into, so a heading inside a block the print stylesheet keeps together
 * (roadmap 24.3.1) is never a candidate. Asking Chromium to hold a block together and to break
 * inside it at once is not a request with an answer.
 */
function pageFlow(nodes: ElementContent[]): (Element | Text)[] {
  const out: (Element | Text)[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      if (node.value.trim() !== "") out.push(node);
      continue;
    }
    if (node.type !== "element") continue;
    if (isTransparent(node)) out.push(...pageFlow(node.children));
    else out.push(node);
  }
  return out;
}

/**
 * Mark every heading from h2 down to `level` that should start a sheet.
 *
 * A heading breaks unless nothing renders before it, or the only thing that does is the page's h1 —
 * "the first heading of the page" is the wrong rule, because a page that opens with its title, an
 * introduction, and then its first section should break before that section.
 *
 * A heading straight after a manual marker is left alone: measured, Chromium does not collapse two
 * forced breaks, so marking it would put a blank sheet between the two.
 */
export function markPageBreakHeadings(tree: HastRoot, level: number): void {
  // One pass, carrying the two things the rule asks about: how much has rendered before this node,
  // and what the last of it was. Slicing the flow at every heading would make a document that is
  // mostly headings quadratic in both time and garbage.
  let seen = 0;
  let previous: Element | Text | undefined;

  for (const node of pageFlow(tree.children as ElementContent[])) {
    const heading = node.type === "element" ? headingLevel(node) : 0;
    const breaks =
      heading >= 2 &&
      heading <= level &&
      previous !== undefined &&
      !(previous.type === "element" && isMarker(previous)) &&
      !(seen === 1 && previous.type === "element" && headingLevel(previous) === 1);

    if (breaks && node.type === "element") {
      node.properties = { ...node.properties, [PAGE_BREAK_ATTRIBUTE]: "" };
    }
    seen += 1;
    previous = node;
  }
}
