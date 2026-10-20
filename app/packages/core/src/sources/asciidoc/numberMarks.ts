import { randomUUID } from "node:crypto";
import { ConverterFactory } from "@asciidoctor/core";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { SKIP, visit } from "unist-util-visit";

/**
 * Generated numbers are not content (roadmap 7.3.2), and in an AsciiDoc page they are marked where
 * Asciidoctor writes them, by Asciidoctor itself.
 *
 * Inserting one section renumbers every later section; inserting one figure, every later caption.
 * What changes is the number — `2.3`, `A`, `II` — not the word written with it (`Section`,
 * `Figure`, `Chapter`), so only the number is marked, and a word the author changes is still a
 * difference. Asciidoctor composes every place a number appears — a heading, its own table of
 * contents, a caption, a cross-reference's text, wherever that text is, a list item or a table cell
 * included — from the number on the section or block. So while it converts a node that writes one,
 * that number is wrapped in a marker on the node, and taken back off afterwards: the marker reaches
 * the HTML wherever Asciidoctor wrote the number, with whatever words, formatting, or limits the
 * document set, and nothing else. Measured with @asciidoctor/core 4.1: with the markers removed,
 * the HTML is Asciidoctor's own, byte for byte.
 *
 * A footnote's number is assigned while Asciidoctor converts the text it is in, not on a node this
 * can wrap; footnotes are unambiguous in the HTML, and are marked there (pipeline/generatedNumbers).
 */

/** The nodes of Asciidoctor's API the converter reads and writes. */
type Node = {
  getNodeName(): string;
  getContext(): string;
  getParent?(): Node | undefined;
  getDocument?(): Node;
  getType?(): string;
  getAttribute?(name: string): unknown;
  getTarget?(): unknown;
  getCatalog?(): { refs?: Record<string, Node> & { $$smap?: Record<string, Node> } };
  findBy?(selector: object): Node[];
  getNumeral?(): unknown;
  setNumeral?(value: unknown): void;
  getCaption?(): unknown;
  setCaption?(value: unknown): void;
  /** A captioned block's number; null where the author wrote the caption. */
  numeral?: unknown;
};

interface Converter {
  convert(node: Node, transform?: string, opts?: unknown): Promise<string>;
}

/** The marker's characters: private-use, apart from the math converter's (U+E000-E003, E010-1F). */
const OPEN = "\uE008";
const MID = "\uE009";
const CLOSE = "\uE00A";
const END = "\uE00B";
/** The key's digits, one per hexadecimal digit, so that only this build's markers are read. */
const KEY_BASE = 0xe030;

/** Elements whose content is written as text, where an element cannot go. */
const RAW_TEXT = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "noscript",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
]);

/** The blocks Asciidoctor writes a numbered caption on. */
const CAPTIONED = new Set(["image", "table", "example", "listing"]);

export type NumberMarks = {
  /** The converter to hand Asciidoctor, wrapping `inner` (the math converter, when there is one). */
  converter: object;
  /**
   * Make each marker in a converted page an element of its own, `span[data-monodocs-generated]`,
   * which post-processing turns back into the text it holds, marked (pipeline/generatedNumbers); a
   * marker in an attribute is removed.
   */
  markGenerated(tree: HastRoot | Element): void;
};

/** A converter that marks the numbers Asciidoctor generates, for one conversion. */
export async function createNumberMarks(
  inner: object | undefined,
  options: { htmlsyntax?: string } = {},
): Promise<NumberMarks> {
  // Made as the math converter makes its own, when there is none to wrap.
  const base = (inner ??
    (await (
      ConverterFactory as unknown as { create(backend: string, opts: object): Promise<Converter> }
    ).create(
      "html5",
      options.htmlsyntax === undefined ? {} : { htmlsyntax: options.htmlsyntax },
    ))) as Converter & object;
  const key = [...randomUUID().replace(/-/g, "")]
    .map((digit) => String.fromCharCode(KEY_BASE + parseInt(digit, 16)))
    .join("");
  const wrap = (value: unknown) => `${OPEN}${key}${MID}${String(value)}${CLOSE}${key}${END}`;
  const wrapped = (value: unknown) => typeof value === "string" && value.includes(OPEN);

  /** Wrap the numbers of `nodes` — and of the sections around a section — for the length of `run`. */
  const withMarked = async (nodes: (Node | undefined)[], run: () => Promise<string>) => {
    const restore: (() => void)[] = [];
    const markCaption = (node: Node, numeral: unknown) => {
      const caption = node.getCaption?.();
      if (typeof caption !== "string" || wrapped(caption) || node.setCaption === undefined) return;
      // The caption was composed when the document was read (`Appendix A: `, `Figure 1. `); the
      // number is its last occurrence there.
      const at = caption.lastIndexOf(String(numeral));
      if (at < 0) return;
      node.setCaption(
        caption.slice(0, at) + wrap(numeral) + caption.slice(at + String(numeral).length),
      );
      restore.push(() => node.setCaption!(caption));
    };
    for (const node of nodes) {
      if (node === undefined) continue;
      if (node.getContext() === "section") {
        for (
          let section: Node | undefined = node;
          section?.getContext() === "section";
          section = section.getParent?.()
        ) {
          const numeral = section.getNumeral?.();
          if (numeral === null || numeral === undefined || wrapped(numeral)) continue;
          const current = section;
          current.setNumeral?.(wrap(numeral));
          restore.push(() => current.setNumeral?.(numeral));
          markCaption(current, numeral);
        }
      } else if (
        CAPTIONED.has(node.getContext()) &&
        node.numeral !== null &&
        node.numeral !== undefined &&
        !wrapped(node.numeral)
      ) {
        const numeral = node.numeral;
        node.numeral = wrap(numeral);
        restore.push(() => (node.numeral = numeral));
        markCaption(node, numeral);
      }
    }
    try {
      return await run();
    } finally {
      for (const undo of restore.reverse()) undo();
    }
  };

  /** The node a cross-reference points to, in the document's catalogue. */
  const targetOf = (node: Node): Node | undefined => {
    const refid = node.getAttribute?.("refid");
    const id =
      typeof refid === "string" ? refid : String(node.getTarget?.() ?? "").replace(/^#/, "");
    const refs = node.getDocument?.().getCatalog?.().refs;
    return refs?.[id] ?? refs?.$$smap?.[id];
  };

  const convert = async (node: Node, transform?: string, opts?: unknown): Promise<string> => {
    const name = transform ?? node.getNodeName();
    const run = () => base.convert(node, transform, opts);
    if (name === "section" || CAPTIONED.has(name)) return withMarked([node], run);
    // The document's own table of contents writes every section's number.
    if (name === "outline") {
      const document = node.getDocument?.() ?? node;
      return withMarked(document.findBy?.({ context: "section" }) ?? [], run);
    }
    if (name === "inline_anchor" && node.getType?.() === "xref")
      return withMarked([targetOf(node)], run);
    return run();
  };

  const converter = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "convert") return convert;
      if (prop === "constructor") return target.constructor;
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  const marker = new RegExp(`${OPEN}${key}${MID}([^${OPEN}]*?)${CLOSE}${key}${END}`, "g");
  const anyMarker = new RegExp(`${OPEN}${key}${MID}|${CLOSE}${key}${END}`, "g");

  const strip = (value: string) => value.replace(anyMarker, "");

  /** Remove every marker under `tree`, from its text, comments, and attributes. */
  const stripAll = (tree: HastRoot | Element) => {
    visit(tree, (node) => {
      if (node.type === "text" || node.type === "comment") node.value = strip(node.value);
      else if (node.type === "element") {
        for (const [name, value] of Object.entries(node.properties)) {
          if (typeof value === "string") node.properties[name] = strip(value);
        }
        const content = (node as Element & { content?: HastRoot }).content;
        if (content !== undefined) stripAll(content);
      }
    });
  };

  const markGenerated = (tree: HastRoot | Element) => {
    visit(tree, (node, index, parent) => {
      if (node.type === "comment") {
        node.value = strip(node.value);
        return;
      }
      if (node.type === "element") {
        const element = node as Element;
        for (const [name, value] of Object.entries(element.properties)) {
          if (typeof value === "string" && value.includes(OPEN)) {
            element.properties[name] = strip(value);
          } else if (Array.isArray(value)) {
            element.properties[name] = value.map((v) => (typeof v === "string" ? strip(v) : v));
          }
        }
        // A template's content is a fragment of its own, which the walk does not enter, and which
        // nothing shows or compares: the marker is only removed.
        const content = (element as Element & { content?: HastRoot }).content;
        if (content !== undefined) stripAll(content);
        // Where text is written as it is — a script, a textarea, a passthrough's — an element
        // would be written as text, so the marker is only removed.
        if (RAW_TEXT.has(element.tagName)) {
          visit(element, "text", (text) => {
            text.value = strip(text.value);
          });
          return SKIP;
        }
        return;
      }
      if (node.type !== "text" || parent === undefined || typeof index !== "number") return;
      const value = node.value;
      if (!value.includes(OPEN)) return;
      const parts: ElementContent[] = [];
      let last = 0;
      for (const match of value.matchAll(marker)) {
        if (match.index > last) parts.push({ type: "text", value: value.slice(last, match.index) });
        parts.push({
          type: "element",
          tagName: "span",
          properties: { dataMonodocsGenerated: "" },
          children: [{ type: "text", value: match[1]! }],
        });
        last = match.index + match[0].length;
      }
      if (last < value.length) parts.push({ type: "text", value: strip(value.slice(last)) });
      (parent as { children: ElementContent[] }).children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };

  return { converter, markGenerated };
}
