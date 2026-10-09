import type { Document } from "@asciidoctor/core";
import type { Element, Root as HastRoot } from "hast";
import { visit } from "unist-util-visit";

/**
 * Make every checklist in `doc` render its boxes as `<input>` rather than as text.
 *
 * Asciidoctor draws a checklist item's box as a character — `✓` (U+2713) when checked, `❏`
 * (U+274F) when not — unless the list has the `interactive` option, when it writes an
 * `<input type="checkbox">`. No font in the development image has `❏`, so the default turns every
 * AsciiDoc checklist into tofu in the PDF, where a Markdown task list draws a checkbox (roadmap
 * v0.16). Setting the option on the parsed document, rather than matching the characters in the
 * HTML, leaves an item that is only written to start with `✓` as text.
 *
 * `findBy` does not enter the document nested in an `a|` table cell, so each one is marked in turn,
 * as `numbersSections` in the renderer does.
 */
export function markChecklists(doc: Document): void {
  for (const list of doc.findBy({ context: "ulist" })) {
    if (list.hasOption("checklist")) list.setOption("interactive");
  }
  for (const cell of doc.findBy({ context: "table_cell" })) {
    // A table cell; its class is not exported from the package entry point.
    const inner = (cell as unknown as { getInnerDocument(): Document | null }).getInnerDocument();
    if (inner !== null) markChecklists(inner);
  }
}

/**
 * Give each checklist box the element a Markdown task list item carries:
 * `<input type="checkbox" disabled>`, with `checked` when checked.
 *
 * `[%interactive]` is rendered the same way. A single HTML file has nowhere to keep what a reader
 * ticks, so a box that can be clicked would forget it on reload, and it prints the same either way.
 * Only an `<input>` Asciidoctor wrote at the head of a checklist item's first paragraph is touched;
 * one passed through from raw HTML elsewhere is left as written.
 */
export function normalizeChecklistBoxes(tree: HastRoot): void {
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "ul" || !hasClass(node, "checklist")) return;
    for (const item of node.children) {
      if (item.type !== "element" || item.tagName !== "li") continue;
      const paragraph = item.children.find((child) => child.type === "element");
      if (paragraph?.type !== "element" || paragraph.tagName !== "p") continue;
      const box = paragraph.children[0];
      if (box?.type !== "element" || box.tagName !== "input") continue;
      if (box.properties.type !== "checkbox") continue;
      const checked = box.properties.checked === true;
      box.properties = checked
        ? { type: "checkbox", checked: true, disabled: true }
        : { type: "checkbox", disabled: true };
    }
  });
}

function hasClass(element: Element, name: string): boolean {
  const className = element.properties.className;
  return Array.isArray(className) && className.includes(name);
}
