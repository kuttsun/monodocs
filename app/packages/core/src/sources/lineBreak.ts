import type { Element, ElementContent, Root as HastRoot, RootContent, Text } from "hast";
import type { Break, Parent as MdastParent, Root as MdastRoot, Text as MdastText } from "mdast";
import { EAST_ASIAN_WIDE_RANGES } from "./eastAsianWidth.js";

/**
 * What a newline inside a paragraph becomes (`sources.lineBreak`, roadmap 12.6).
 *
 * - `space`: a space, as CommonMark and Asciidoctor render it. Nothing is done.
 * - `break`: a `<br>`.
 * - `join`: removed between two East Asian characters, left alone everywhere else.
 */
export type LineBreak = "space" | "break" | "join";

export const LINE_BREAKS: readonly LineBreak[] = ["space", "break", "join"];

/** Whether a code point's East_Asian_Width is F, W, or H. */
export function isEastAsianWide(cp: number): boolean {
  let lo = 0;
  let hi = EAST_ASIAN_WIDE_RANGES.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < EAST_ASIAN_WIDE_RANGES[mid * 2]!) hi = mid - 1;
    else if (cp > EAST_ASIAN_WIDE_RANGES[mid * 2 + 1]!) lo = mid + 1;
    else return true;
  }
  return false;
}

const HANGUL = /\p{Script=Hangul}/u;

/**
 * Whether a segment break between these two characters is removed under `join`: both are
 * East_Asian_Width F, W, or H and neither is Hangul, the rule of the 2013 CSS Text Working Draft
 * that web-platform-tests still asserts. Korean separates words with spaces, so its line ends do too.
 */
export function joinsAcross(before: string, after: string): boolean {
  const a = before.codePointAt(0);
  const b = after.codePointAt(0);
  if (a === undefined || b === undefined) return false;
  if (!isEastAsianWide(a) || !isEastAsianWide(b)) return false;
  return !HANGUL.test(before) && !HANGUL.test(after);
}

/**
 * remark plugin for `break`: every newline left in a text node becomes a `break` node, which
 * remark-rehype turns into `<br>`. Code and inline code are other node types and are not touched,
 * and neither are headings: the key is about paragraphs, and Asciidoctor's hard-break mode leaves
 * section titles alone too, so a multi-line setext heading stays one line in both formats.
 */
export function remarkSoftBreaksToBreaks() {
  return (tree: MdastRoot) => splitTextNodes(tree);
}

function splitTextNodes(parent: MdastParent): void {
  const out: MdastParent["children"] = [];
  for (const child of parent.children) {
    if (child.type === "text") {
      out.push(...splitText(child));
    } else {
      if ("children" in child && child.type !== "heading") splitTextNodes(child as MdastParent);
      out.push(child);
    }
  }
  parent.children = out;
}

function splitText(node: MdastText): (MdastText | Break)[] {
  const lines = node.value.split(/\r?\n|\r/);
  if (lines.length === 1) return [node];
  const parts: (MdastText | Break)[] = [];
  lines.forEach((line, i) => {
    if (i > 0) parts.push({ type: "break" });
    // Spaces next to the newline are part of the segment break, not of either line.
    let value = line;
    if (i > 0) value = value.replace(/^[ \t]+/, "");
    if (i < lines.length - 1) value = value.replace(/[ \t]+$/, "");
    if (value) parts.push({ type: "text", value });
  });
  return parts;
}

/**
 * Elements a line of text runs through. Anything else — a block, `<br>`, an image, `code` (whose
 * text is not touched), and `ruby` (whose `rt` text is not what the reader sees next to the line
 * end) — ends the run, so a newline is never joined across it. That misses a join next to inline
 * code or an image, which is the safe direction: a space that stays is what `space` shows anyway.
 */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
]);

/** Subtrees whose text is left exactly as written. */
const VERBATIM = new Set(["pre", "code", "script", "style", "textarea"]);

/** A newline and the collapsible spaces around it: one segment break as CSS sees it. */
const SEGMENT_BREAK = /[ \t]*(?:\r\n|\n|\r)[ \t]*/g;

/**
 * `join`: removes a segment break whose neighbours are both East Asian wide characters
 * ({@link joinsAcross}), across inline elements but never across a block, a `<br>`, or code.
 * Runs on the renderer's HAST before the page's text is collected, so the search index and the
 * HTML agree (roadmap 12.6).
 */
export function joinSegmentBreaks(tree: HastRoot): void {
  for (const run of textRuns(tree)) joinRun(run);
}

function textRuns(tree: HastRoot): Text[][] {
  const runs: Text[][] = [[]];
  const visit = (nodes: (RootContent | ElementContent)[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        runs[runs.length - 1]!.push(node);
      } else if (node.type === "element") {
        const el = node as Element;
        if (INLINE.has(el.tagName)) {
          visit(el.children);
        } else {
          runs.push([]);
          if (!VERBATIM.has(el.tagName)) visit(el.children);
          runs.push([]);
        }
      }
    }
  };
  visit(tree.children);
  return runs.filter((run) => run.length > 0);
}

function joinRun(run: Text[]): void {
  const text = run.map((node) => node.value).join("");
  const removals: [number, number][] = [];
  for (const m of text.matchAll(SEGMENT_BREAK)) {
    const start = m.index;
    const end = start + m[0].length;
    const before = codePointBefore(text, start);
    const after = text.codePointAt(end);
    if (before !== undefined && after !== undefined) {
      if (joinsAcross(String.fromCodePoint(before), String.fromCodePoint(after))) {
        removals.push([start, end]);
      }
    }
  }
  if (removals.length === 0) return;

  // Cut each removal out of the text nodes it overlaps; a break can straddle an inline element.
  let offset = 0;
  for (const node of run) {
    const nodeStart = offset;
    const nodeEnd = offset + node.value.length;
    offset = nodeEnd;
    let value = "";
    let cursor = nodeStart;
    for (const [rs, re] of removals) {
      if (re <= nodeStart || rs >= nodeEnd) continue;
      value += text.slice(cursor, Math.max(rs, nodeStart));
      cursor = Math.min(re, nodeEnd);
    }
    value += text.slice(cursor, nodeEnd);
    node.value = value;
  }
}

/** The code point that ends just before `index`, reading a surrogate pair as one. */
function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) return undefined;
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.codePointAt(index - 2);
  }
  return low;
}
