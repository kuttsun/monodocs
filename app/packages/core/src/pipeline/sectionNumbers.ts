import { visit } from "unist-util-visit";
import type { Element, Root as HastRoot } from "hast";
import type { SectionNumbering } from "../config.js";
import type { Page, SidebarNode } from "../types.js";
import { headingLevel } from "./pageBreakHeadings.js";

/**
 * Section numbering across the whole document (roadmap 19.1).
 *
 * Decided here, on the `Page[]` model and the sidebar, rather than in either renderer: AsciiDoc's
 * `:sectnums:` restarts in every file and Markdown has nothing, so neither can number a document
 * that is a bundle of both. A number is a label, never an address — routes, page IDs, and heading
 * IDs are left exactly as they were, because an address that changed when a page was reordered
 * would break every link anyone had copied.
 */

/** The class of the element holding a number, in a heading, the sidebar, and the in-page TOC. */
export const SECTION_NUMBER_CLASS = "section-number";

/**
 * Number the sidebar in the order a reader moves through it.
 *
 * A page's number is its position among its siblings, and a directory contributes a level of its
 * own, so `guide/usage.md` as the third entry of the second top-level entry is `2.3`. The sidebar
 * being numbered is the one the reader sees — after `flattenSingleChild`, or as `sidebar.items`
 * wrote it — so the number beside an entry is always the number on the page it opens. A page with
 * no place in the sidebar (`hidden`, or unlisted in a custom one) has no number.
 */
export function numberSidebar(nodes: SidebarNode[]): {
  sidebar: SidebarNode[];
  pageNumbers: Map<string, string>;
} {
  const pageNumbers = new Map<string, string>();
  const walk = (list: SidebarNode[], prefix: string): SidebarNode[] =>
    list.map((node, index) => {
      const number = `${prefix}${index + 1}`;
      if (node.type === "dir") {
        return { ...node, number, children: walk(node.children, `${number}.`) };
      }
      pageNumbers.set(node.pageId, number);
      return { ...node, number };
    });
  return { sidebar: walk(nodes, ""), pageNumbers };
}

function hasClass(node: Element, name: string): boolean {
  const value: unknown = node.properties?.className;
  if (Array.isArray(value)) return value.map(String).includes(name);
  return typeof value === "string" && value.split(/\s+/).includes(name);
}

/** `<span class="section-number">2.3</span> `, put in front of whatever the heading holds. */
function prependNumber(heading: Element, number: string): void {
  heading.children.unshift(
    {
      type: "element",
      tagName: "span",
      properties: { className: [SECTION_NUMBER_CLASS] },
      children: [{ type: "text", value: number }],
    },
    // A space in the text rather than a margin, so that copying a heading copies "2.3 Usage" and
    // not "2.3Usage". Hiding the number with a stylesheet leaves a leading space, which a block
    // collapses away.
    { type: "text", value: " " },
  );
}

/**
 * Put the page's number on its h1 and a section number on each heading from h2 down to `depth`.
 *
 * Only the headings the renderer collected are numbered, matched by ID: those are the headings the
 * table of contents and search know, so the body and the lists can never disagree. A heading
 * Asciidoctor marked `discrete` is not a section, so it is skipped and does not move the count —
 * the same thing `:sectnums:` does. The first h1 is the page title and carries the page's own
 * number; a later h1 is left alone.
 *
 * A skipped level counts as zero (`1.0.1` for an h4 straight under an h2), which keeps the number's
 * depth equal to the heading's level. `heading/level-skipped` already reports that structure.
 */
export function numberHeadings(
  tree: HastRoot,
  page: Page,
  pageNumber: string,
  depth: Exclude<SectionNumbering, false>,
): void {
  const byId = new Map(page.headings.map((heading) => [heading.id, heading]));
  const counters: number[] = [];
  let titled = false;

  visit(tree, "element", (node: Element) => {
    const level = headingLevel(node);
    if (level === 0) return;
    const id = node.properties?.id;
    const heading = typeof id === "string" ? byId.get(id) : undefined;
    if (heading === undefined || heading.number !== undefined) return;

    if (level === 1) {
      if (titled) return;
      titled = true;
      prependNumber(node, pageNumber);
      return;
    }
    if (level > depth || hasClass(node, "discrete")) return;

    // counters[0] is h2. Deeper levels restart whenever a shallower one advances.
    counters[level - 2] = (counters[level - 2] ?? 0) + 1;
    counters.length = level - 1;
    const parts = Array.from(counters, (count) => count ?? 0);
    const number = [pageNumber, ...parts].join(".");
    heading.number = number;
    prependNumber(node, number);
  });

  page.number = pageNumber;
}
