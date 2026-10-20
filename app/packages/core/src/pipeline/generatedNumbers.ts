import type { Element, ElementContent, Root as HastRoot, Text } from "hast";
import { toText } from "hast-util-to-text";
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

const HEADING = /^h[1-6]$/;

/**
 * Whether a heading is a section's own: the first element in a `div.sectN`, or a part's `h1.sect0`
 * — not a `[discrete]` heading, nor one a passthrough wrote.
 */
function isSectionHeading(node: Element, parent: unknown): boolean {
  if (classes(node).includes("discrete")) return false;
  if (node.tagName === "h1") return classes(node).includes("sect0");
  const container = parent as Element | undefined;
  if (container?.type !== "element" || !classes(container).some((c) => /^sect[1-6]$/.test(c))) {
    return false;
  }
  return container.children.find((child) => child.type === "element") === node;
}

/**
 * What a link's text may start with, longest first. A text that ends in its number (`Section 2`)
 * is taken only where the number ends there, so `Section 1` is not found in `Section 12`; one that
 * ends in a space (`1. `, the heading's own prefix in a table of contents) is followed by the title.
 */
function referencePattern(references: string[]): RegExp | undefined {
  const unique = [...new Set(references)].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return undefined;
  return new RegExp(
    `(?:${unique
      .map((reference) =>
        /[0-9A-Za-z]$/.test(reference)
          ? `${escapeRegExp(reference)}(?![0-9A-Za-z.])`
          : escapeRegExp(reference),
      )
      .join("|")})`,
  );
}

/** Mark every number the renderers generated on a page, in its tree. */
export function markGeneratedNumbers(tree: HastRoot, page: Page): void {
  if (page.format === "asciidoc") markAsciidoc(tree, page);
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

function markAsciidoc(tree: HastRoot, page: Page): void {
  const numbering = page.numbering;
  if (numbering === undefined) return;
  const startingWith = (prefixes: string[], boundary = "") =>
    prefixes.length === 0
      ? undefined
      : new RegExp(
          `(?:${[...new Set(prefixes)]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegExp)
            .join("|")})${boundary}`,
        );
  const captionFor: [string, RegExp | undefined][] = [
    ["imageblock", startingWith(numbering.captions.figure ?? [])],
    ["tableblock", startingWith(numbering.captions.table ?? [])],
    ["exampleblock", startingWith(numbering.captions.example ?? [])],
    ["listingblock", startingWith(numbering.captions.listing ?? [])],
  ];
  // Element IDs carry the page's prefix (`{page}-{id}`, sources/prefixIds.ts).
  const prefix = `${page.id}-`;
  const targetOf = (id: unknown) =>
    typeof id === "string" && id.startsWith(prefix)
      ? numbering.targets[id.slice(prefix.length)]
      : undefined;

  // A heading monodocs gave an ID because Asciidoctor gave it none — the first `{page}`, the rest
  // `{page}-h1` and on (prefixIds.ts) — and that is no section's own ID.
  const anonymous = new RegExp(`^${escapeRegExp(page.id)}(?:-h\\d+)?$`);
  const isAnonymous = (id: unknown) =>
    typeof id === "string" && anonymous.test(id) && targetOf(id) === undefined;
  let unidentified = 0;
  // The document's own table of contents links a section without an ID as `#null`. Which sections
  // it lists depends on more than one limit (`toclevels`, a `toc::[levels=]`, a section's own), so
  // an entry is matched to its section by its text — the prefix and the title — not by its place.
  const listed = new Map(
    numbering.unidentified
      .filter((section): section is { heading: string; title: string } => section.heading !== null)
      .map((section) => [
        `${section.heading}${section.title}`.replace(/\s+/g, " ").trim(),
        section.heading,
      ]),
  );

  visit(tree, "element", (node, _index, parent) => {
    const own = classes(node);
    // A section's heading, found by its ID: the text Asciidoctor wrote before its title. One
    // Asciidoctor gave no ID is found by its place among the other sections without one.
    if (HEADING.test(node.tagName)) {
      const id = node.properties.id;
      const heading =
        isAnonymous(id) && isSectionHeading(node, parent)
          ? (numbering.unidentified[unidentified++]?.heading ?? undefined)
          : targetOf(id)?.heading;
      if (heading !== undefined && heading !== null) {
        markPrefix(node, new RegExp(escapeRegExp(heading)));
      }
      return;
    }
    // A block's title, with a caption Asciidoctor wrote on that kind of block.
    if (own.includes("title") && parent?.type === "element") {
      const block = classes(parent);
      const pattern = captionFor.find(([kind]) => block.includes(kind))?.[1];
      if (pattern !== undefined) markPrefix(node, pattern);
      return;
    }
    // A footnote's number, where it is referred to — the first time and again by name — and where
    // it is listed.
    // The whole reference, brackets and all; in a table of contents it is copied with no link.
    if (node.tagName === "sup" && (own.includes("footnote") || own.includes("footnoteref"))) {
      markAll(node);
      return;
    }
    if (node.tagName === "div" && own.includes("footnote")) {
      const link = node.children.find((c): c is Element => c.type === "element");
      if (link?.tagName === "a") markAll(link);
      return;
    }
    // A link to a numbered target — the table of contents, a cross-reference — where its text
    // starts with what Asciidoctor wrote for it, and the number ends there.
    if (node.tagName === "a" && node.properties.href === "#null") {
      const heading = listed.get(toText(node).replace(/\s+/g, " ").trim());
      if (heading !== undefined) markPrefix(node, new RegExp(escapeRegExp(heading)));
      return;
    }
    if (node.tagName === "a") {
      const href = node.properties.href;
      const target =
        typeof href === "string" && href.startsWith("#") ? targetOf(href.slice(1)) : undefined;
      const pattern = target === undefined ? undefined : referencePattern(target.references);
      if (pattern !== undefined) markPrefix(node, pattern);
    }
  });
}
