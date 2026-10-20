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
  if (numbering === undefined) return;
  const startingWith = (prefixes: string[]) =>
    prefixes.length === 0
      ? undefined
      : new RegExp(
          `(?:${[...new Set(prefixes)]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegExp)
            .join("|")})`,
        );
  const captionFor: [string, RegExp | undefined][] = [
    ["imageblock", startingWith(numbering.captions.figure ?? [])],
    ["tableblock", startingWith(numbering.captions.table ?? [])],
    ["exampleblock", startingWith(numbering.captions.example ?? [])],
    ["listingblock", startingWith(numbering.captions.listing ?? [])],
  ];
  // A reference is marked only where it is followed by what ends a number, so `Section 1` is not
  // taken from `Section 12`.
  const reference =
    numbering.references.length === 0
      ? undefined
      : new RegExp(
          `(?:${[...numbering.references]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegExp)
            .join("|")})(?![0-9A-Za-z.])`,
        );
  let section = 0;

  visit(tree, "element", (node, _index, parent) => {
    const own = classes(node);
    // A section's heading, in document order: the prefix Asciidoctor wrote, if it wrote one.
    if (
      HEADING.test(node.tagName) &&
      parent?.type === "element" &&
      classes(parent).some((c) => SECTION.test(c))
    ) {
      const prefix = numbering.sections[section++];
      if (prefix !== undefined && prefix !== null) {
        markPrefix(node, new RegExp(escapeRegExp(prefix)));
      }
      return;
    }
    // A block's title, with the caption Asciidoctor wrote on that kind of block.
    if (own.includes("title") && parent?.type === "element") {
      const block = classes(parent);
      const pattern = captionFor.find(([kind]) => block.includes(kind))?.[1];
      if (pattern !== undefined) markPrefix(node, pattern);
      return;
    }
    // A footnote's number, where it is referred to — the first time and again by name — and where
    // it is listed.
    if (node.tagName === "sup" && (own.includes("footnote") || own.includes("footnoteref"))) {
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
    // A cross-reference's text, where it names a numbered target.
    if (node.tagName === "a" && reference !== undefined) {
      const href = node.properties.href;
      if (typeof href === "string" && href.startsWith("#")) markPrefix(node, reference);
    }
  });
}
