import type { Paragraph, Root as MdastRoot } from "mdast";

/**
 * The page-break marker in Markdown.
 *
 * Raw HTML in Markdown is dropped (roadmap 16.1), and this does not move that boundary. What is
 * recognised here is a marker that happens to be spelled like HTML: an `html` node matching one of
 * two spellings — in the quoting and ASCII-whitespace variants the expression below spells out, and
 * the configuration reference enumerates for the reader — is replaced with an element
 * **monodocs builds**, so nothing the author wrote
 * reaches the output and an attribute or a script cannot ride in on it. Everything else stays
 * dropped.
 *
 * The spelling is the one Typora, the Markdown-to-PDF converters, the MkDocs PDF plugins, and a
 * browser's print dialog already understand, and the class is the one Asciidoctor emits for `<<<`,
 * so one print rule serves both formats (roadmap 24.7).
 */

/** ASCII whitespace, spelled out rather than `\s`, which also matches U+00A0 and friends. */
const SPACE = "[ \\t\\r\\n\\f]";

/**
 * Deliberately narrow, so that the accepted language can be read off this expression:
 * lowercase `div`, exactly one attribute, either quoting, and nothing at all between the tags.
 * `<DIV>`, a second attribute, an extra class, a self-closing tag, and a `style` carrying anything
 * more all fail to match and are dropped like any other raw HTML.
 */
const MARKER = new RegExp(
  `^${SPACE}*<div${SPACE}+(?:` +
    `class${SPACE}*=${SPACE}*(?:"page-break"|'page-break')` +
    `|` +
    `style${SPACE}*=${SPACE}*(?:"page-break-after:[ \\t]*always;?"|'page-break-after:[ \\t]*always;?')` +
    `)${SPACE}*></div>${SPACE}*$`,
);

/** Whether a raw HTML node is the page-break marker. */
export function isPageBreakMarker(value: string): boolean {
  return MARKER.test(value);
}

/**
 * The element the marker becomes. Built here rather than parsed from the input; `hName` and
 * `hProperties` are what mdast-util-to-hast reads, so no rehype-raw and no `allowDangerousHtml`.
 */
function pageBreakNode(): Paragraph {
  return {
    type: "paragraph",
    children: [],
    data: { hName: "div", hProperties: { className: ["page-break"] } },
  };
}

/**
 * Replace root-level marker nodes before `remark-rehype` runs, which is where raw HTML is dropped.
 *
 * Root level only: a marker inside a blockquote, a list item, or a table cell would ask Chromium to
 * break inside a block the print stylesheet keeps together (roadmap 24.3.1), so it is not a marker
 * and stays dropped.
 */
export function remarkPageBreak() {
  return (tree: MdastRoot): void => {
    tree.children = tree.children.map((node) =>
      node.type === "html" && isPageBreakMarker(node.value) ? pageBreakNode() : node,
    );
  };
}
