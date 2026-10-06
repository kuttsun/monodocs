import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { decodeNumericCharacterReference } from "micromark-util-decode-numeric-character-reference";
import type { CompileContext, Extension as FromMarkdownExtension } from "mdast-util-from-markdown";
import type { Token } from "micromark-util-types";
import type {
  Code,
  Data,
  Html,
  InlineCode,
  Literal,
  Nodes,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import type { Point, Position } from "unist";
import type { Processor } from "unified";

/**
 * Markdown math, read by GitHub's rules (roadmap 6.4).
 *
 * GitHub finds formulas after CommonMark has parsed the document, in the text between tags, so the
 * rules are applied here to the mdast tree rather than inside the tokenizer: emphasis wins over a
 * formula (`$a*b*c$` is text), backslash escapes and character references are already resolved, and
 * an element is a boundary no formula crosses. The rules, and the cases they are pinned to, are in
 * `scripts/data/github-math-2026-10-06.json` and `scripts/data/github-math-probes-2026-10-06.json`.
 *
 * The deliberate differences from GitHub:
 *
 * - `\$` never opens or closes a formula. Outside one it prints `$`; inside `$...$` or `$$...$$` it
 *   stays `\$`. GitHub's parser cannot tell `\$` from `$`.
 * - A paragraph is read as display math only when it holds nothing but text. GitHub also displays a
 *   paragraph that mixes `$$...$$` with emphasis, struck-through text, images, or inline HTML, and
 *   rewrites that markup into the formula (`$$a *b* c$$` becomes the TeX `a _b_ c`); here such a
 *   paragraph is read by the inline rules.
 */

/** A formula found in text: `$...$`, `` $`...`$ ``, or `$$...$$`. */
export interface InlineMath extends Literal {
  type: "inlineMath";
  /** The TeX as interpreted: delimiters removed, character references decoded, `\$` kept. */
  value: string;
  data: InlineMathData;
}

interface InlineMathData extends Data {
  /** The formula as written, delimiters included, without the prefixes of a quote or list. */
  source: string;
  /** `$$...$$` in a paragraph read as display math. */
  display: boolean;
}

/** A fenced code block whose language is `math`. */
export interface BlockMath extends Literal {
  type: "math";
  value: string;
  data: BlockMathData;
}

interface BlockMathData extends Data {
  source: string;
}

/** A `\$`, kept apart from the text around it until the formulas have been found. */
interface EscapedDollar extends Literal {
  type: "escapedDollar";
}

declare module "mdast" {
  interface PhrasingContentMap {
    inlineMath: InlineMath;
    escapedDollar: EscapedDollar;
  }
  interface RootContentMap {
    math: BlockMath;
    inlineMath: InlineMath;
    escapedDollar: EscapedDollar;
  }
}

/**
 * remark plugin: finds the formulas and replaces them with `inlineMath` and `math` nodes. It must be
 * used before the document is parsed, since it marks `\$` while mdast is built.
 */
export function remarkMath(this: Processor) {
  const data = this.data();
  (data.fromMarkdownExtensions ??= []).push(escapedDollarExtension);
  return (tree: Root, file: { value: unknown }) => {
    findMath(tree, String(file.value));
  };
}

// --- `\$` ---------------------------------------------------------------------------------------

/**
 * `\$` becomes a node of its own, so that the formula rules can tell it from a `$`. The default
 * handlers put an escape into the text node around it: `characterEscape` opens the text node and
 * `characterEscapeValue` closes it.
 */
const escapedDollarExtension: FromMarkdownExtension = {
  enter: {
    characterEscape(this: CompileContext, token: Token) {
      if (this.sliceSerialize(token) !== "\\$") {
        this.config.enter.data!.call(this, token);
        return;
      }
      const parent = this.stack[this.stack.length - 1] as Parent;
      const node: EscapedDollar = {
        type: "escapedDollar",
        value: "$",
        position: { start: pointOf(token.start), end: pointOf(token.end) },
      };
      parent.children.push(node as never);
      this.stack.push(node as never);
    },
  },
  exit: {
    characterEscapeValue(this: CompileContext, token: Token) {
      const top = this.stack[this.stack.length - 1] as Nodes;
      if (top.type === "escapedDollar") {
        this.stack.pop();
        return;
      }
      this.config.exit.data!.call(this, token);
    },
  },
};

function pointOf(p: { line: number; column: number; offset: number }): Point {
  return { line: p.line, column: p.column, offset: p.offset };
}

// --- The tree -----------------------------------------------------------------------------------

/** Raw HTML elements whose content GitHub reads no formula in. */
const RAW_SKIPPING = new Set(["em", "b", "a", "code"]);

/** Exported for tests: find the formulas in a parsed tree, then put `\$` back as text. */
export function findMath(tree: Root, raw: string): void {
  const doc = new Doc(raw);
  walkBlocks(tree, doc, false);
  restoreEscapedDollars(tree);
}

function walkBlocks(parent: Parent, doc: Doc, inListItem: boolean): void {
  const children = parent.children as RootContent[];
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    switch (node.type) {
      case "footnoteDefinition":
        // GitHub renders no math in a footnote, fenced block included.
        break;
      case "code":
        if (node.lang === "math") children[i] = blockMath(node, doc);
        break;
      case "paragraph":
        // A paragraph displays only outside a list item, quoted or not.
        inlineMath(node, doc, !inListItem && displayCandidate(node.children));
        break;
      case "heading":
      case "tableCell":
        inlineMath(node, doc, false);
        break;
      default:
        if ("children" in node) {
          walkBlocks(node as Parent, doc, inListItem || node.type === "listItem");
        }
    }
  }
}

function blockMath(node: Code, doc: Doc): BlockMath {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  let source = "```math\n" + node.value + "\n```";
  if (start !== undefined && end !== undefined) {
    const lines = doc.raw.slice(start, end).split(/\r\n|\r|\n/);
    const open = stripPrefix(lines[0]!);
    const last = lines.length > 1 ? stripPrefix(lines[lines.length - 1]!) : "";
    const close = /^(`{3,}|~{3,})[ \t]*$/.test(last) ? "\n" + last.trimEnd() : "";
    source = open.trimEnd() + "\n" + node.value + close;
  }
  return { type: "math", value: node.value, data: { source }, position: node.position };
}

function stripPrefix(line: string): string {
  return line.replace(/^[ \t>]*/, "");
}

function displayCandidate(children: PhrasingContent[]): boolean {
  return children.every(
    (c) => c.type === "text" || c.type === "escapedDollar" || c.type === "break" || isComment(c),
  );
}

function isComment(node: Nodes): boolean {
  return node.type === "html" && node.value.startsWith("<!--");
}

// --- Runs of text -------------------------------------------------------------------------------

/**
 * One character of the string the rules read, and where it came from. The string is the text as
 * GitHub's HTML has it, `&`, `<`, and `>` escaped, since the rules look at the characters around a
 * `$` there; `&amp;` is five characters that all point at the one `&` of the text.
 */
interface Unit {
  ch: string;
  node: Text | EscapedDollar | PhrasingContent;
  /** Index into a text node's value. */
  index: number;
  /** A `\$`: a dollar sign that delimits nothing. */
  escaped: boolean;
}

interface Run {
  units: Unit[];
  /** The run's nodes, in order. */
  nodes: PhrasingContent[];
  /** HTML comments, which add no character: GitHub removes them before looking for formulas. */
  comments: { node: Html; at: number }[];
}

interface Found {
  /** Unit indexes of the opening delimiter's first `$` and the closing delimiter's last, inclusive. */
  from: number;
  to: number;
  width: 1 | 2;
  display: boolean;
}

function inlineMath(parent: Parent, doc: Doc, display: boolean): void {
  const children = parent.children as PhrasingContent[];
  if (display) {
    const run = toRun(children, true);
    if (startsAndEndsWithDoubleDollar(run.units)) {
      parent.children = rebuild(run, findDisplay(run.units), doc) as never;
      return;
    }
  }
  parent.children = splitRuns(children, doc) as never;
}

function startsAndEndsWithDoubleDollar(units: Unit[]): boolean {
  let a = 0;
  let b = units.length - 1;
  while (a < units.length && SPACE.test(units[a]!.ch)) a++;
  while (b >= 0 && SPACE.test(units[b]!.ch)) b--;
  return (
    b - a >= 3 &&
    isDollar(units[a]) &&
    isDollar(units[a + 1]) &&
    isDollar(units[b - 1]) &&
    isDollar(units[b])
  );
}

/**
 * Split the runs of text among these children, and the runs inside struck-through and strong text,
 * at the formulas in them. Emphasis, links, images, and code are left alone, as GitHub leaves them;
 * so is what sits inside the raw HTML elements GitHub reads no formula in.
 */
function splitRuns(children: PhrasingContent[], doc: Doc): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let pending: PhrasingContent[] = [];
  let skipping = 0;
  const flush = () => {
    if (pending.length === 0) return;
    if (skipping > 0) out.push(...pending);
    else {
      const run = toRun(pending, false);
      out.push(...rebuild(run, findInline(run.units, 0, run.units.length), doc));
    }
    pending = [];
  };
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.type === "inlineCode" && skipping === 0) {
      const before = pending[pending.length - 1];
      const after = children[i + 1];
      if (
        before?.type === "text" &&
        before.value.endsWith("$") &&
        after?.type === "text" &&
        after.value.startsWith("$")
      ) {
        const math = codeSpanMath(before, child, after, doc);
        flush();
        out.push(math);
        continue;
      }
    }
    if (child.type === "text" || child.type === "escapedDollar" || isComment(child)) {
      pending.push(child);
      continue;
    }
    flush();
    if (child.type === "html") {
      const tag = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/.exec(child.value);
      if (tag && RAW_SKIPPING.has(tag[2]!.toLowerCase()))
        skipping = Math.max(0, skipping + (tag[1] ? -1 : 1));
    } else if ((child.type === "strong" || child.type === "delete") && skipping === 0) {
      child.children = splitRuns(child.children, doc);
    }
    out.push(child);
  }
  flush();
  return out;
}

/**
 * `` $`...`$ ``: a `$` right before a code span and right after it, whatever surrounds them. The
 * two dollar signs are taken from the texts around the code span, which is replaced by the formula.
 */
function codeSpanMath(before: Text, code: InlineCode, after: Text, doc: Doc): InlineMath {
  const start = doc.offsetIn(before, before.value.length - 1);
  const end = doc.offsetIn(after, 1);
  doc.trim(before, 0);
  doc.trim(after, 1);
  before.value = before.value.slice(0, -1);
  after.value = after.value.slice(1);
  const math: InlineMath = {
    type: "inlineMath",
    value: code.value,
    data: {
      source:
        start !== undefined && end !== undefined
          ? normalizeSource(doc.raw.slice(start, end))
          : "$`" + code.value + "`$",
      display: false,
    },
    ...positionOf(doc, start, end),
  };
  return math;
}

function toRun(nodes: PhrasingContent[], display: boolean): Run {
  const units: Unit[] = [];
  const comments: Run["comments"] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      for (let i = 0; i < node.value.length; i++) {
        const c = node.value[i]!;
        // A display paragraph is read from its text: GitHub does not escape js-display-math.
        const html = display
          ? c
          : c === "&"
            ? "&amp;"
            : c === "<"
              ? "&lt;"
              : c === ">"
                ? "&gt;"
                : c;
        for (const ch of html) units.push({ ch, node, index: i, escaped: false });
      }
    } else if (node.type === "escapedDollar") {
      units.push({ ch: "$", node, index: 0, escaped: true });
    } else if (node.type === "break") {
      units.push({ ch: "\n", node, index: 0, escaped: false });
    } else if (isComment(node)) {
      comments.push({ node: node as Html, at: units.length });
    }
  }
  return { units, nodes, comments };
}

// --- The rules ----------------------------------------------------------------------------------

const isDollar = (u: Unit | undefined) => u !== undefined && u.ch === "$" && !u.escaped;
const SPACE = /[ \t\n\r\f\v]/;
const WORD = /[A-Za-z0-9_]/;

/**
 * `$...$` and `$$...$$` within one run, as GitHub reads them: the opening delimiter comes after the
 * start of the run, an ASCII space, or `(`, and before a character that is neither a space nor `$`;
 * the formula holds no `$` and no newline; the closing delimiter is not followed by an ASCII letter,
 * digit, or `_`, and a closing `$` not by the character just before it.
 */
function findInline(units: Unit[], from: number, to: number): Found[] {
  const found: Found[] = [];
  let i = from;
  while (i < to) {
    const prev = i > from ? units[i - 1]!.ch : undefined;
    if (!isDollar(units[i]) || (prev !== undefined && !SPACE.test(prev) && prev !== "(")) {
      i++;
      continue;
    }
    const width = isDollar(units[i + 1]) ? 2 : 1;
    const first = units[i + width];
    if (i + width >= to || isDollar(first) || SPACE.test(first!.ch)) {
      i++;
      continue;
    }
    let j = i + width;
    while (j < to && !isDollar(units[j]) && units[j]!.ch !== "\n") j++;
    const closes =
      j < to && isDollar(units[j]) && (width === 1 || (j + 1 < to && isDollar(units[j + 1])));
    const after = j + width < to ? units[j + width]!.ch : undefined;
    if (
      closes &&
      (after === undefined || !WORD.test(after)) &&
      (width === 2 || after === undefined || after !== units[j - 1]!.ch)
    ) {
      found.push({ from: i, to: j + width - 1, width, display: false });
      i = j + width;
    } else {
      i++;
    }
  }
  return found;
}

/**
 * A paragraph of text that starts and ends with `$$`: every `$$...$$` in it displays, a formula may
 * cross lines and start or end with a space, and the text between is read by the inline rules.
 */
function findDisplay(units: Unit[]): Found[] {
  const found: Found[] = [];
  let gap = 0;
  let i = 0;
  while (i + 1 < units.length) {
    if (!(isDollar(units[i]) && isDollar(units[i + 1]))) {
      i++;
      continue;
    }
    let j = i + 3;
    while (j + 1 < units.length && !(isDollar(units[j]) && isDollar(units[j + 1]))) j++;
    if (j + 1 >= units.length) break;
    found.push(...findInline(units, gap, i));
    found.push({ from: i, to: j + 1, width: 2, display: true });
    gap = i = j + 2;
  }
  found.push(...findInline(units, gap, units.length));
  return found;
}

// --- Building the nodes -------------------------------------------------------------------------

/** The run's nodes again, the formulas cut out of them. A comment inside a formula is dropped. */
function rebuild(run: Run, found: Found[], doc: Doc): PhrasingContent[] {
  if (found.length === 0) return run.nodes;
  const { units, comments } = run;
  const out: PhrasingContent[] = [];
  const emit = (from: number, to: number) => {
    let text = "";
    const flushText = () => {
      if (text) out.push({ type: "text", value: text });
      text = "";
    };
    for (let k = from; k <= to; k++) {
      for (const c of comments) {
        if (c.at === k) {
          flushText();
          out.push(c.node);
        }
      }
      if (k === to) break;
      const u = units[k]!;
      if (u.node.type !== "text") {
        flushText();
        out.push(u.node as PhrasingContent);
      } else if (!continues(units, k, from)) {
        text += (u.node as Text).value[u.index];
      }
    }
    flushText();
  };
  let at = 0;
  for (const f of found) {
    emit(at, f.from);
    out.push(toMath(units, f, doc));
    at = f.to + 1;
  }
  emit(at, units.length);
  return out;
}

/** Whether unit `k` is a later character of the same escaped character as the unit before it. */
function continues(units: Unit[], k: number, from: number): boolean {
  return (
    k > from && units[k - 1]!.node === units[k]!.node && units[k - 1]!.index === units[k]!.index
  );
}

function toMath(units: Unit[], f: Found, doc: Doc): InlineMath {
  let tex = "";
  for (let k = f.from + f.width; k <= f.to - f.width; k++) {
    const u = units[k]!;
    if (u.node.type === "text") {
      if (!continues(units, k, f.from + f.width)) tex += (u.node as Text).value[u.index];
    } else if (u.node.type === "escapedDollar") {
      tex += "\\$";
    } else if (u.node.type === "break") {
      tex += "\n";
    }
  }
  const first = units[f.from]!;
  const last = units[f.to]!;
  const start = doc.offsetOf(first);
  const end = doc.offsetAfter(last);
  const delimiter = f.width === 2 ? "$$" : "$";
  const source =
    start !== undefined && end !== undefined
      ? normalizeSource(doc.raw.slice(start, end))
      : delimiter + tex + delimiter;
  return {
    type: "inlineMath",
    value: tex,
    data: { source, display: f.display },
    ...positionOf(doc, start, end),
  };
}

/** A formula's source without the prefixes a quote or list puts at the start of its lines. */
function normalizeSource(source: string): string {
  return source.replace(/(?:\r\n|\r|\n)[ \t>]*/g, "\n");
}

function positionOf(
  doc: Doc,
  start: number | undefined,
  end: number | undefined,
): { position?: Position } {
  if (start === undefined || end === undefined) return {};
  return { position: { start: doc.point(start), end: doc.point(end) } };
}

function restoreEscapedDollars(node: Nodes): void {
  if (!("children" in node)) return;
  const out: Nodes[] = [];
  for (const child of node.children as Nodes[]) {
    restoreEscapedDollars(child);
    const value = child.type === "escapedDollar" ? "$" : undefined;
    const prev = out[out.length - 1];
    if (child.type === "text" || value !== undefined) {
      const text = value ?? (child as Text).value;
      if (text === "") continue;
      if (prev?.type === "text") {
        prev.value += text;
        if (prev.position && child.position)
          prev.position = { ...prev.position, end: child.position.end };
        else delete prev.position;
        continue;
      }
      out.push({
        type: "text",
        value: text,
        ...(child.position ? { position: child.position } : {}),
      });
      continue;
    }
    out.push(child);
  }
  (node as Parent).children = out as never;
}

// --- Where a character was written ---------------------------------------------------------------

/**
 * Maps a character of a text node's value back to its offset in the Markdown. The value differs from
 * what was written where an escape or a character reference was resolved and where a line's prefix
 * (indentation, `>`) or trailing spaces were removed.
 */
class Doc {
  private readonly maps = new Map<Text, number[] | null>();
  private readonly heads = new Map<Text, number>();
  private lineStarts: number[] | undefined;

  constructor(readonly raw: string) {}

  /** Characters about to be taken from the start of a text node's value. */
  trim(node: Text, head: number): void {
    this.mapOf(node);
    this.heads.set(node, (this.heads.get(node) ?? 0) + head);
  }

  offsetIn(node: Text, index: number): number | undefined {
    const map = this.mapOf(node);
    return map ? map[index + (this.heads.get(node) ?? 0)] : undefined;
  }

  offsetOf(unit: Unit): number | undefined {
    if (unit.node.type === "text") return this.offsetIn(unit.node as Text, unit.index);
    return unit.node.position?.start.offset;
  }

  offsetAfter(unit: Unit): number | undefined {
    if (unit.node.type === "text") return this.offsetIn(unit.node as Text, unit.index + 1);
    return unit.node.position?.end.offset;
  }

  point(offset: number): Point {
    this.lineStarts ??= lineStartsOf(this.raw);
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.lineStarts[lo]! + 1, offset };
  }

  private mapOf(node: Text): number[] | null {
    let map = this.maps.get(node);
    if (map === undefined) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      map =
        start === undefined || end === undefined
          ? null
          : align(node.value, this.raw.slice(start, end), start);
      this.maps.set(node, map);
    }
    return map;
  }
}

function lineStartsOf(raw: string): number[] {
  const starts = [0];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\r" && raw[i + 1] === "\n") i++;
    if (raw[i] === "\n" || raw[i] === "\r") starts.push(i + 1);
  }
  return starts;
}

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const REFERENCE = /^&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{0,31}));/;

/**
 * The offset of each character of `value` in `written` (plus `base`), and one past the end; `null`
 * when the two cannot be lined up, in which case a formula's source is rebuilt from its TeX.
 */
export function align(value: string, written: string, base: number): number[] | null {
  const map: number[] = [];
  let i = 0;
  let j = 0;
  while (i < value.length) {
    const c = value[i]!;
    if (c === "\n") {
      map.push(base + j);
      while (j < written.length && written[j] !== "\n" && written[j] !== "\r") j++;
      if (j >= written.length) return null;
      j += written[j] === "\r" && written[j + 1] === "\n" ? 2 : 1;
      while (j < written.length && /[ \t>]/.test(written[j]!) && written[j] !== value[i + 1]) j++;
      i++;
      continue;
    }
    if (
      written[j] === "\\" &&
      ASCII_PUNCTUATION.test(written[j + 1] ?? "") &&
      written[j + 1] === c
    ) {
      map.push(base + j);
      j += 2;
      i++;
      continue;
    }
    if (written[j] === "&") {
      const m = REFERENCE.exec(written.slice(j, j + 40));
      const decoded = m
        ? m[1] !== undefined
          ? decodeNumericCharacterReference(m[1], 16)
          : m[2] !== undefined
            ? decodeNumericCharacterReference(m[2], 10)
            : decodeNamedCharacterReference(m[3]!)
        : false;
      if (m && decoded && value.startsWith(decoded, i)) {
        for (let k = 0; k < decoded.length; k++) map.push(base + j);
        i += decoded.length;
        j += m[0].length;
        continue;
      }
    }
    if (written[j] === c) {
      map.push(base + j);
      i++;
      j++;
      continue;
    }
    return null;
  }
  map.push(base + j);
  return map;
}
