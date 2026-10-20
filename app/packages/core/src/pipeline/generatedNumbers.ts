import type { Element, ElementContent, Root as HastRoot, Text } from "hast";
import { visit } from "unist-util-visit";
import type { GeneratedNumbering, Page } from "../types.js";

/**
 * Generated numbers are not content (roadmap 7.3.2). Inserting one section renumbers every section
 * after it, one figure every later caption, one footnote every later reference; compared as text,
 * each would show untouched blocks as changed. The numbers Asciidoctor writes — `:sectnums:`
 * headings, `Figure 1.` captions, the letters of appendices, footnote numbers, cross-reference text
 * such as `Section 2.3` — and GFM's footnote numbers are text, so in a build with a difference each
 * is split into a text node of its own and marked on its `data`, which the serialiser does not
 * write: the bytes are the same, and comparison leaves the marked text out. The numbers
 * `numbering.sections` writes are elements of their own already (`[data-monodocs-section-number]`).
 */

/** What a marked text node carries. */
export type GeneratedData = { monodocsGenerated?: true };

/** Whether a text node is a number the build generated. */
export function isGenerated(node: Text): boolean {
  return (node.data as GeneratedData | undefined)?.monodocsGenerated === true;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classes(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

/** The first text node under `node`, in document order, with its parent and index. */
function firstText(node: Element): { parent: Element; index: number; text: Text } | undefined {
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index]!;
    if (child.type === "text") {
      if (child.value.trim() === "") continue;
      return { parent: node, index, text: child };
    }
    if (child.type === "element") {
      const found = firstText(child);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Split off and mark what `pattern` matches at the start of `node`'s text. */
function markPrefix(node: Element, pattern: RegExp): void {
  const found = firstText(node);
  if (found === undefined) return;
  const leading = /^\s*/.exec(found.text.value)![0];
  const match = pattern.exec(found.text.value.slice(leading.length));
  if (match === null || match.index !== 0 || match[0] === "") return;
  const number = leading + match[0];
  const rest = found.text.value.slice(number.length);
  const marked: Text = {
    type: "text",
    value: number,
    data: { monodocsGenerated: true } as Text["data"],
  };
  const replacement: ElementContent[] =
    rest === "" ? [marked] : [marked, { type: "text", value: rest }];
  found.parent.children.splice(found.index, 1, ...replacement);
}

/** Mark the whole text of `node` as generated. */
function markAll(node: Element): void {
  visit(node, "text", (text) => {
    if (text.value.trim() !== "")
      text.data = { ...text.data, monodocsGenerated: true } as Text["data"];
  });
}

const HEADING = /^h[2-6]$/;
const SECTION = /^sect[0-6]$/;

/** Mark every number the renderers generated on a page, in its tree. */
export function markGeneratedNumbers(tree: HastRoot, page: Page): void {
  if (page.format === "asciidoc") markAsciidoc(tree, page.numbering);
  else markGfm(tree);
}

/** GFM's footnote references are numbered in order of first use; the list is an `<ol>`. */
function markGfm(tree: HastRoot): void {
  visit(tree, "element", (node) => {
    if (node.tagName === "a" && node.properties.dataFootnoteRef !== undefined) markAll(node);
  });
}

function markAsciidoc(tree: HastRoot, numbering: GeneratedNumbering | undefined): void {
  const sectnum = /(?:\d+\.)+ /;
  const appendix =
    numbering?.appendixCaption === undefined
      ? undefined
      : new RegExp(`${escapeRegExp(numbering.appendixCaption)} [A-Z]+: `);
  const either = (words: string[], tail: string) =>
    words.length === 0
      ? undefined
      : new RegExp(
          `(?:${[...words]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegExp)
            .join("|")}) ${tail}`,
        );
  const captions = numbering?.captions ?? {};
  const caption = (word: string | undefined) =>
    either(word === undefined ? [] : [word], "\\d+\\. ");
  // The block a title belongs to decides which caption it can carry.
  const captionFor: [string, RegExp | undefined][] = [
    ["imageblock", caption(captions.figure)],
    ["tableblock", caption(captions.table)],
    ["exampleblock", caption(captions.example)],
    ["listingblock", caption(captions.listing)],
  ];
  // `Section 2.3`, `Appendix B`, `Figure 1`: the word and the number or letter after it.
  const reference = either(numbering?.refsigs ?? [], "(?:[A-Z]|\\d+)(?:\\.\\d+)*");

  visit(tree, "element", (node, _index, parent) => {
    const own = classes(node);
    // A section's heading, numbered by `:sectnums:` or lettered as an appendix.
    if (
      HEADING.test(node.tagName) &&
      parent?.type === "element" &&
      classes(parent).some((c) => SECTION.test(c))
    ) {
      if (
        appendix !== undefined &&
        firstText(node) !== undefined &&
        appendix.test(firstText(node)!.text.value.trimStart())
      ) {
        markPrefix(node, appendix);
      } else if (numbering?.sectnums === true) {
        markPrefix(node, sectnum);
      }
      return;
    }
    // A block's title: `Figure 1. ` on an image, `Table 1. ` on a table, `Example 1. ` on an
    // example, each only on its own kind of block.
    if (own.includes("title") && parent?.type === "element") {
      const block = classes(parent);
      const pattern = captionFor.find(([kind]) => block.includes(kind))?.[1];
      if (pattern !== undefined) markPrefix(node, pattern);
      return;
    }
    // A footnote's number, where it is referred to and where it is listed.
    if (node.tagName === "sup" && own.includes("footnote")) {
      for (const child of node.children) {
        if (child.type === "element" && child.tagName === "a") markAll(child);
      }
      return;
    }
    if (node.tagName === "div" && own.includes("footnote")) {
      const link = node.children.find((c): c is Element => c.type === "element");
      if (link?.tagName === "a") markAll(link);
      return;
    }
    // A cross-reference's text.
    if (node.tagName === "a" && reference !== undefined) {
      const href = node.properties.href;
      if (typeof href === "string" && href.startsWith("#")) markPrefix(node, reference);
    }
  });
}
