/**
 * What is compared inside a pair of a deleted and an added block (roadmap 7.3.6).
 *
 * A block's text is read again from the nodes it was read from (`Block.own`), as `textOf` reads it
 * for the block's key — generated numbers left out, whitespace collapsed — but with each place in
 * the text mapped back to the text node it came from, so that the difference can be written into
 * the tree. What is not text is one token: an inline formula keyed by its TeX, an inline image by
 * its hash and `alt`, a line break, a footnote reference, a checkbox by its state, an inline SVG or
 * a player by what it shows. Each such thing is written into the text as one character from the
 * Supplementary Private Use Area, the same character for the same key on both sides of a pair, so
 * the tokenizer reads it as one token of its own.
 *
 * Code is compared by line, whether or not it was highlighted; a table row cell by cell, by
 * position, when its cells agree in number, kind, and span; a display formula and a diagram are
 * shown old and new whole.
 */
import type { Element, ElementContent, Text } from "hast";
import { isGenerated, isGeneratedSeparator } from "../pipeline/generatedNumbers.js";
import { recordedData } from "../pipeline/postprocess.js";
import { has, holdsBlocks, imageKey, mediaKey, MEDIA, svgKey, type Block } from "./blocks.js";
import { inRanges } from "./graphemes.js";
import { diffSequences } from "./myers.js";
import { diffText, type Segment } from "./text.js";
import { SPACE_RANGES } from "./unicodeTables.js";

/** Where one UTF-16 unit of an extracted text came from: part of a text node, or a whole element. */
export type Origin = { node: Text; start: number; end: number } | { atom: Element };

/** A block's text, with where each of its UTF-16 units came from. */
export type Extract = { text: string; origin: Origin[] };

/** The characters standing for what is not text, by key, shared by the two sides of a pair. */
export class Atoms {
  private readonly byKey = new Map<string, string>();
  private next: number;
  /** Whether more distinct keys came than private-use characters remain: the pair is not compared. */
  overflowed = false;

  /** Starts above every Supplementary Private Use Area character the texts already hold. */
  constructor(...texts: string[]) {
    let highest = 0xf0000 - 1;
    for (const text of texts) {
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (cp >= 0xf0000 && cp <= 0x10fffd && cp > highest) highest = cp;
      }
    }
    this.next = highest + 1;
  }

  /** The character for `key`, the same for the same key. */
  of(key: string): string {
    let ch = this.byKey.get(key);
    if (ch === undefined) {
      if (this.next > 0x10fffd) {
        // Some 65,000 distinct inline elements in one pair: the pair is shown whole instead.
        this.overflowed = true;
        return "\u{10FFFD}";
      }
      ch = String.fromCodePoint(this.next++);
      this.byKey.set(key, ch);
    }
    return ch;
  }
}

function classes(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

/** A footnote reference: GFM's `sup` around `a[data-footnote-ref]`, AsciiDoc's `sup.footnote`. */
function isFootnoteReference(node: Element): boolean {
  if (node.tagName !== "sup") return false;
  const own = classes(node);
  if (own.includes("footnote") || own.includes("footnoteref")) return true;
  return node.children.some(
    (child) => child.type === "element" && child.properties.dataFootnoteRef !== undefined,
  );
}

/** The key of what is not text, or undefined for an element whose content is read as text. */
function atomKey(node: Element, idPrefix: string): string | undefined {
  if (has(node, "math") && typeof node.properties.dataMathTex === "string") {
    return `math:${node.properties.dataMathTex}`;
  }
  if (node.tagName === "img" || node.tagName === "object") return `image:${imageKey(node)}`;
  if (node.tagName === "input" && node.properties.type === "checkbox") {
    const checked = node.properties.checked === true || node.properties.checked === "";
    return checked ? "checkbox:x" : "checkbox: ";
  }
  if (node.tagName === "svg") return `svg:${svgKey(node, idPrefix)}`;
  if (node.tagName === "br") return "br";
  if (MEDIA.has(node.tagName)) return `${node.tagName}:${mediaKey(node)}`;
  if (isFootnoteReference(node)) return "footnote";
  return undefined;
}

const isSpace = (ch: string) => inRanges(SPACE_RANGES, ch.codePointAt(0)!);

/**
 * The text of `nodes` as the comparison inside a block reads it: generated numbers and the
 * separators around a section's left out, each run of whitespace one space, leading and trailing
 * whitespace dropped, and what is not text one character from `atoms`.
 */
export function extract(nodes: readonly ElementContent[], atoms: Atoms, pageId: string): Extract {
  const idPrefix = pageId === "" ? "" : `${pageId}-`;
  let text = "";
  const origin: Origin[] = [];
  // A space is written only before the next thing that is not one, so none is left at the end.
  let pending: Origin | undefined;
  const put = (piece: string, from: Origin) => {
    if (pending !== undefined && text !== "") {
      text += " ";
      origin.push(pending);
    }
    pending = undefined;
    text += piece;
    for (let i = 0; i < piece.length; i++) origin.push(from);
  };
  const walk = (list: readonly ElementContent[]) => {
    for (const child of list) {
      if (child.type === "text") {
        if (isGenerated(child) || isGeneratedSeparator(child)) continue;
        let i = 0;
        for (const ch of child.value) {
          if (isSpace(ch)) {
            if (pending === undefined) pending = { node: child, start: i, end: i + ch.length };
            else if ("node" in pending && pending.node === child) pending.end = i + ch.length;
          } else {
            put(ch, { node: child, start: i, end: i + ch.length });
          }
          i += ch.length;
        }
        continue;
      }
      if (child.type !== "element") continue;
      if (child.properties.dataMonodocsSectionNumber !== undefined) continue;
      const key = atomKey(child, idPrefix);
      if (key === undefined) {
        walk(child.children);
        continue;
      }
      // A line break reads as the space it stands for in the block's key, and as a token here.
      put(atoms.of(key), { atom: child });
    }
  };
  walk(nodes);
  return { text, origin };
}

/** A pair of text blocks, compared in tokens. */
export type TextPlan = { kind: "text"; old: Extract; new: Extract; segments: Segment[] };

/** One line of a code block: its text, without the line break, and the text nodes it spans. */
export type Line = { text: string; extract: Extract };

/** A pair of code blocks, compared by line. */
export type CodePlan = {
  kind: "code";
  old: Line[];
  new: Line[];
  edits: (
    | { op: "equal"; old: number; new: number }
    | { op: "delete"; old: number }
    | { op: "insert"; new: number }
  )[];
};

/** A pair of table rows, compared cell by cell: a plan, the cell unchanged, or the cell whole. */
export type RowPlan = { kind: "row"; cells: (TextPlan | "same" | "whole")[] };

/** A display formula or a diagram, shown old and new whole. */
export type WholePlan = { kind: "whole" };

export type Inside = TextPlan | CodePlan | RowPlan | WholePlan;

/** The block kinds read as text, which pair when their texts keep half of themselves. */
const TEXT_KINDS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "dt",
  "dd",
  "caption",
  "figcaption",
  "summary",
  "title",
  "text",
]);

/** The text nodes' own text, for finding the private-use characters a text already holds. */
function rawText(nodes: readonly ElementContent[]): string {
  let out = "";
  const walk = (list: readonly ElementContent[]) => {
    for (const child of list) {
      if (child.type === "text") out += child.value;
      else if (child.type === "element") walk(child.children);
    }
  };
  walk(nodes);
  return out;
}

/** Two texts compared, or undefined when they keep less than half of themselves. */
function textPlan(
  old: readonly ElementContent[],
  next: readonly ElementContent[],
  oldPage: string,
  newPage: string,
): TextPlan | undefined {
  // Atoms are numbered over both sides, after every private-use character either already holds.
  const atoms = new Atoms(rawText(old), rawText(next));
  const a = extract(old, atoms, oldPage);
  const b = extract(next, atoms, newPage);
  if (atoms.overflowed) return undefined;
  const difference = diffText(a.text, b.text);
  if (difference.whole) return undefined;
  return { kind: "text", old: a, new: b, segments: difference.segments };
}

/** The lines of a code block's rendered text, each with the text nodes it spans. */
export function linesOf(pre: Element): Line[] {
  const lines: Line[] = [];
  let current: Extract = { text: "", origin: [] };
  const end = () => {
    lines.push({ text: current.text, extract: current });
    current = { text: "", origin: [] };
  };
  const walk = (list: readonly ElementContent[]) => {
    for (const child of list) {
      if (child.type === "text") {
        for (let i = 0; i < child.value.length; i++) {
          if (child.value[i] === "\n") end();
          else {
            current.text += child.value[i];
            current.origin.push({ node: child, start: i, end: i + 1 });
          }
        }
      } else if (child.type === "element") walk(child.children);
    }
  };
  walk(pre.children);
  // A final line break ends the last line rather than starting an empty one.
  if (current.text !== "" || lines.length === 0) end();
  return lines;
}

/** The language a code block was written in, as its key records it, or undefined. */
function languageOf(block: Block): string | undefined {
  const source = recordedData(block.node).monodocsSource;
  if (source === undefined) return undefined;
  return source.kind === "mermaid" ? "mermaid" : (source.lang ?? "");
}

/** Two code blocks compared by line, or undefined when they keep less than half of their lines. */
function codePlan(old: Block, next: Block): CodePlan | undefined {
  if (languageOf(old) !== languageOf(next)) return undefined;
  const a = linesOf(old.node);
  const b = linesOf(next.node);
  const edits = diffSequences(a, b, (x, y) => x.text === y.text);
  const equal = edits.filter((e) => e.op === "equal").length;
  if (equal * 2 < Math.max(a.length, b.length)) return undefined;
  return { kind: "code", old: a, new: b, edits };
}

function cellsOf(row: Element): Element[] {
  return row.children.filter(
    (c): c is Element => c.type === "element" && (c.tagName === "td" || c.tagName === "th"),
  );
}

/** Two rows compared cell by cell, or undefined when their cells differ in number, kind, or span. */
function rowPlan(old: Block, next: Block): RowPlan | undefined {
  const a = cellsOf(old.node);
  const b = cellsOf(next.node);
  if (a.length !== b.length) return undefined;
  const shape = (cell: Element) =>
    `${cell.tagName}[${String(cell.properties.colSpan ?? 1)}x${String(cell.properties.rowSpan ?? 1)}]`;
  if (a.some((cell, i) => shape(cell) !== shape(b[i]!))) return undefined;
  const cells = a.map((cell, i): TextPlan | "same" | "whole" => {
    const other = b[i]!;
    // A cell that holds blocks of its own (AsciiDoc's `a|`) is compared whole.
    if (holdsBlocks(cell) || holdsBlocks(other)) return "whole";
    const plan = textPlan(cell.children, other.children, old.pageId, next.pageId);
    if (plan === undefined) return "whole";
    return plan.segments.every((s) => s.op === "equal") ? "same" : plan;
  });
  return { kind: "row", cells };
}

/**
 * What the pair of `old` and `next` shows inside it, or undefined when they are not paired: their
 * kinds or chains differ, their kind is not compared inside (an image, a player, a rule), or they
 * keep less than half of themselves.
 */
export function insideDifference(old: Block, next: Block): Inside | undefined {
  if (old.kind !== next.kind || old.chain !== next.chain) return undefined;
  if (TEXT_KINDS.has(old.kind)) {
    if (old.own === undefined || next.own === undefined) return undefined;
    return textPlan(old.own, next.own, old.pageId, next.pageId);
  }
  if (old.kind === "code") return codePlan(old, next);
  if (old.kind === "tr") return rowPlan(old, next);
  if (old.kind === "formula" || old.kind === "diagram") return { kind: "whole" };
  return undefined;
}
