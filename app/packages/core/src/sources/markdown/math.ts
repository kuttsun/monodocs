import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { decodeNumericCharacterReference } from "micromark-util-decode-numeric-character-reference";
import type { CompileContext, Extension as FromMarkdownExtension } from "mdast-util-from-markdown";
import type { Token } from "micromark-util-types";
import type {
  Break,
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
 *
 * A tree in which no formula is found is left exactly as remark built it.
 */

/** A formula found in text: `$...$`, `` $`...`$ ``, or `$$...$$`. */
export interface InlineMath extends Literal {
  type: "inlineMath";
  /** The TeX as interpreted: delimiters removed, character references decoded, `\$` kept. */
  value: string;
  data: InlineMathData;
}

interface InlineMathData extends Data {
  /**
   * The formula as written, delimiters and line endings included, without what Markdown removes from
   * the start of a continuation line: a quote's `>`, a list's indentation, a paragraph's own leading
   * spaces.
   */
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

declare module "mdast" {
  interface PhrasingContentMap {
    inlineMath: InlineMath;
  }
  interface RootContentMap {
    math: BlockMath;
    inlineMath: InlineMath;
  }
  interface RootData {
    /** What the plugin records while mdast is built; removed once the formulas are found. */
    mathMarks?: Marks;
  }
}

/**
 * remark plugin: finds the formulas and replaces them with `inlineMath` and `math` nodes.
 *
 * The formulas are found while mdast is built, as its first transform, before GFM's autolink literals
 * split text nodes into nodes without a position; every text is then still where it was written,
 * which is how a `\$` is told from a `$`. GitHub, too, reads a formula in text an autolink literal
 * could otherwise have taken (`www.x.com/($x$)`). The transform needs the Markdown itself, which it
 * takes from the processor's parser: whichever parser is set, before or after this plugin is used, is
 * wrapped so that the document it is given is at hand while mdast is built.
 */
/** Offsets in the Markdown, recorded while mdast is built. */
interface Marks {
  /** Where each `\$` starts. */
  escapes: number[];
  /** Where each code fence's sequence (```` ``` ````, `~~~`) starts, opening and closing alike. */
  fences: number[];
  /** Where each line of code content starts, after the prefixes micromark consumed. */
  codeLines: number[];
}

/** The functions this plugin registers, to recognise what a processor copy inherits from another. */
const own = new WeakSet<object>();

function marksOf(context: CompileContext): Marks {
  const root = context.stack[0] as Root;
  return ((root.data ??= {}).mathMarks ??= { escapes: [], fences: [], codeLines: [] });
}

export function remarkMath(this: Processor) {
  const state: { raw?: string } = {};
  const extension: FromMarkdownExtension = {
    enter: {
      characterEscape(this: CompileContext, token: Token) {
        if (this.sliceSerialize(token) === "\\$") marksOf(this).escapes.push(token.start.offset);
        this.config.enter.data!.call(this, token);
      },
      codeFencedFenceSequence(this: CompileContext, token: Token) {
        marksOf(this).fences.push(token.start.offset);
      },
      codeFlowValue(this: CompileContext, token: Token) {
        marksOf(this).codeLines.push(token.start.offset);
        this.config.enter.data!.call(this, token);
      },
    },
    transforms: [
      (tree) => {
        const root = tree as Root;
        if (state.raw !== undefined) findMath(root, state.raw);
        else forgetMarks(root);
      },
    ],
  };
  for (const f of [...Object.values(extension.enter!), ...extension.transforms!]) own.add(f);
  // A copy of the processor copies the original's extension along with its data; it would read the
  // original's document, so what the original's plugin registered is taken out of it, and only this
  // processor's own extension is used. Anything else in the copied extensions stays.
  const extensions = (this.data().fromMarkdownExtensions ??= []);
  const others = withoutOwn(extensions);
  extensions.splice(0, extensions.length, extension, ...others);

  type Parser = NonNullable<Processor["parser"]>;
  const wrap = (parse: Parser | undefined): Parser | undefined =>
    parse &&
    ((doc, file) => {
      const previous = state.raw;
      // micromark counts offsets after a byte order mark.
      state.raw = doc.startsWith("\uFEFF") ? doc.slice(1) : doc;
      try {
        return parse(doc, file);
      } finally {
        state.raw = previous;
      }
    });
  let parser = wrap(this.parser);
  Object.defineProperty(this, "parser", {
    configurable: true,
    enumerable: true,
    get: () => parser,
    set: (next: Parser | undefined) => {
      parser = wrap(next);
    },
  });
}

type Extensions = (FromMarkdownExtension | FromMarkdownExtension[])[];

function withoutOwn(extensions: Extensions): Extensions {
  const out: Extensions = [];
  for (const e of extensions) {
    if (Array.isArray(e)) {
      out.push(withoutOwn(e) as FromMarkdownExtension[]);
      continue;
    }
    const copy: FromMarkdownExtension = { ...e };
    if (e.transforms) copy.transforms = e.transforms.filter((t) => !own.has(t));
    for (const key of ["enter", "exit"] as const) {
      const handlers = e[key];
      if (handlers) {
        copy[key] = Object.fromEntries(Object.entries(handlers).filter(([, h]) => !own.has(h!)));
      }
    }
    out.push(copy);
  }
  return out;
}

// --- The tree -----------------------------------------------------------------------------------

/** Raw HTML elements whose content GitHub reads no formula in. */
const RAW_SKIPPING = new Set(["em", "b", "a", "code"]);

/** Find the formulas in a tree parsed with the plugin's extension, from the Markdown it was parsed from. */
export function findMath(tree: Root, raw: string): void {
  const marks = tree.data?.mathMarks ?? { escapes: [], fences: [], codeLines: [] };
  forgetMarks(tree);
  walkBlocks(tree, new Doc(raw, marks), false);
}

function forgetMarks(tree: Root): void {
  if (!tree.data?.mathMarks) return;
  delete tree.data.mathMarks;
  if (Object.keys(tree.data).length === 0) delete tree.data;
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
  const value = lf(node.value);
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const source =
    (start !== undefined && end !== undefined && fenceAsWritten(doc, start, end, node.value)) ||
    "```math\n" + value + "\n```";
  return { type: "math", value, data: { source }, position: node.position };
}

/**
 * A fenced block as written, from where micromark found its parts: the opening fence from its first
 * character, each content line from where its content starts (a quote's `>` and a list's indentation
 * left out; a tab partly taken as indentation kept whole), and the closing fence, if there is one,
 * from its first character. Line endings and trailing spaces stay as written.
 */
function fenceAsWritten(doc: Doc, start: number, end: number, value: string): string | undefined {
  const { raw } = doc;
  const fences = doc.marks.fences.filter((f) => f >= start && f < end);
  const open = fences[0];
  if (open === undefined) return undefined;
  const close = fences[1];
  const lineEnd = (from: number) => {
    let i = from;
    while (i < end && raw[i] !== "\n" && raw[i] !== "\r") i++;
    return i;
  };
  const valueLines = value.split(/\r\n|\r|\n/);
  let line = 0;
  let at = lineEnd(open);
  let out = raw.slice(open, at);
  while (at < end) {
    const ending = raw.startsWith("\r\n", at) ? "\r\n" : raw[at]!;
    const lineStart = at + ending.length;
    at = lineEnd(lineStart);
    if (close !== undefined && close >= lineStart && close <= at) {
      out += ending + raw.slice(close, end);
      break;
    }
    const first = firstAtOrAfter(doc.marks.codeLines, lineStart);
    let content = first !== undefined && first <= at ? first : undefined;
    // A tab taken partly as indentation leaves spaces in the value and starts the content after it.
    if (
      content !== undefined &&
      raw[content - 1] === "\t" &&
      (valueLines[line]?.length ?? 0) > at - content
    ) {
      content--;
    }
    out += ending + (content === undefined ? "" : raw.slice(content, at));
    line++;
  }
  return out;
}

/** The first of these ascending offsets that is at least `offset`. */
function firstAtOrAfter(sorted: number[], offset: number): number | undefined {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < offset) lo = mid + 1;
    else hi = mid;
  }
  return sorted[lo];
}

function displayCandidate(children: PhrasingContent[]): boolean {
  return children.every((c) => c.type === "text" || c.type === "break" || isComment(c));
}

function isComment(node: Nodes): boolean {
  return node.type === "html" && node.value.startsWith("<!--");
}

/** Line endings as `\n`, so that a formula's TeX is the same whatever the file's line endings. */
function lf(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

// --- Runs of text -------------------------------------------------------------------------------

/**
 * One character of the string the rules read, and where it came from. The string is the text as
 * GitHub's HTML has it, `&`, `<`, and `>` escaped, since the rules look at the characters around a
 * `$` there; `&amp;` is five characters that all point at the one `&` of the text.
 */
interface Unit {
  ch: string;
  node: Text | Break;
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
    const run = toRun(children, doc);
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
      const run = toRun(pending, doc);
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
        !doc.isEscaped(before, before.value.length - 1) &&
        after?.type === "text" &&
        after.value.startsWith("$") &&
        !doc.isEscaped(after, 0)
      ) {
        const math = codeSpanMath(before, child, after, doc);
        if (before.value === "") pending.pop();
        flush();
        out.push(math);
        continue;
      }
    }
    if (child.type === "text" || isComment(child)) {
      // A text emptied by taking the `$` of a code-span formula out of it is dropped.
      if (child.type !== "text" || child.value !== "") pending.push(child);
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
  const open = doc.sourceOf(before, before.value.length - 1, before.value.length);
  const close = doc.sourceOf(after, 0, 1);
  const codeStart = code.position?.start.offset;
  const codeEnd = code.position?.end.offset;
  const source =
    open !== undefined && close !== undefined && codeStart !== undefined && codeEnd !== undefined
      ? open + doc.raw.slice(codeStart, codeEnd).replace(/(\r\n|\r|\n)[ \t>]*/g, "$1") + close
      : "$`" + code.value + "`$";
  const start = doc.offsetIn(before, before.value.length - 1);
  const end = doc.offsetIn(after, 1);
  doc.trimHead(after, 1);
  before.value = before.value.slice(0, -1);
  after.value = after.value.slice(1);
  // The texts around keep positions that do not overlap the formula.
  if (before.position && start !== undefined) before.position.end = doc.point(start);
  if (after.position && end !== undefined) after.position.start = doc.point(end);
  return {
    type: "inlineMath",
    value: code.value,
    data: { source, display: false },
    ...positionOf(doc, start, end),
  };
}

function toRun(nodes: PhrasingContent[], doc: Doc): Run {
  const units: Unit[] = [];
  const comments: Run["comments"] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      for (let i = 0; i < node.value.length; i++) {
        const c = node.value[i]!;
        const escaped = c === "$" && doc.isEscaped(node, i);
        const html = c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c;
        for (const ch of html) units.push({ ch, node, index: i, escaped });
      }
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
 * the formula holds no `$` and no line ending; the closing delimiter is not followed by an ASCII
 * letter, digit, or `_`, and a closing `$` not by the character just before it.
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
    while (j < to && !isDollar(units[j]) && units[j]!.ch !== "\n" && units[j]!.ch !== "\r") j++;
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
      if (u.node.type === "break") {
        flushText();
        out.push(u.node);
      } else if (!continues(units, k, from)) {
        text += u.node.value[u.index];
      }
    }
    flushText();
  };
  let at = 0;
  for (const f of found) {
    emit(at, f.from);
    out.push(toMath(run, f, doc));
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

function toMath(run: Run, f: Found, doc: Doc): InlineMath {
  const { units } = run;
  let tex = "";
  for (let k = f.from + f.width; k <= f.to - f.width; k++) {
    const u = units[k]!;
    if (u.node.type === "break") tex += "\n";
    else if (u.escaped) tex += "\\$";
    else if (!continues(units, k, f.from + f.width)) tex += u.node.value[u.index];
  }
  tex = lf(tex);

  // The source, piece by piece: the stretch of each text node as written, a hard break as written,
  // and a comment as mdast holds it, which is without the prefixes of a quote or list.
  let source: string | undefined = "";
  let k = f.from;
  while (k <= f.to && source !== undefined) {
    for (const c of run.comments) if (c.at === k && k > f.from) source += c.node.value;
    const u = units[k]!;
    if (u.node.type === "break") {
      const p = u.node.position;
      source = p ? source + doc.raw.slice(p.start.offset, p.end.offset) : undefined;
      k++;
      continue;
    }
    let e = k;
    while (e + 1 <= f.to && units[e + 1]!.node === u.node) e++;
    const piece = doc.sourceOf(u.node, u.index, units[e]!.index + 1);
    source = piece === undefined ? undefined : source + piece;
    k = e + 1;
  }
  const delimiter = f.width === 2 ? "$$" : "$";
  const start = doc.offsetOf(units[f.from]!);
  const end = doc.offsetAfter(units[f.to]!);
  return {
    type: "inlineMath",
    value: tex,
    data: { source: source ?? delimiter + tex + delimiter, display: f.display },
    ...positionOf(doc, start, end),
  };
}

function positionOf(
  doc: Doc,
  start: number | undefined,
  end: number | undefined,
): { position?: Position } {
  if (start === undefined || end === undefined) return {};
  return { position: { start: doc.point(start), end: doc.point(end) } };
}

// --- Where a character was written ---------------------------------------------------------------

interface Alignment {
  /** The offset of each character of the value, and one past the end. */
  map: number[];
  /** Stretches of the Markdown left out of the value: a line's prefix, `[start, end)`. */
  skips: [number, number][];
}

/**
 * Maps a character of a text node's value back to the Markdown. The value differs from what was
 * written where an escape or a character reference was resolved and where a line's prefix
 * (indentation, `>`) or trailing spaces were removed.
 */
class Doc {
  private readonly alignments = new Map<Text, Alignment | null>();
  private readonly heads = new Map<Text, number>();
  private lineStarts: number[] | undefined;

  private readonly escapes: Set<number>;

  constructor(
    readonly raw: string,
    readonly marks: Marks,
  ) {
    this.escapes = new Set(marks.escapes);
  }

  /** Characters about to be taken from the start of a text node's value. */
  trimHead(node: Text, count: number): void {
    this.alignmentOf(node);
    this.heads.set(node, (this.heads.get(node) ?? 0) + count);
  }

  offsetIn(node: Text, index: number): number | undefined {
    return this.alignmentOf(node)?.map[index + (this.heads.get(node) ?? 0)];
  }

  /** Whether the `$` at this index of a text node was written `\$`. */
  isEscaped(node: Text, index: number): boolean {
    const offset = this.offsetIn(node, index);
    if (offset !== undefined) return this.escapes.has(offset);
    // Not lined up with the Markdown. Every `$` of the value was written as `$`, as `\$`, or as a
    // character reference; if the Markdown holds as many of these as the value has dollar signs, the
    // n-th is the n-th. Otherwise fail safe: a `\$` anywhere the text may have come from makes every
    // `$` in it a non-delimiter, since a `\$` read as a delimiter would change the document.
    const range = this.rangeOf(node);
    if (!range) return this.escapes.size > 0;
    const written = dollarsWritten(this.raw.slice(range[0], range[1]));
    const head = this.heads.get(node) ?? 0;
    const full = node.value;
    let nth = 0;
    let count = 0;
    for (let i = 0; i < full.length + head; i++) {
      const c = i < head ? "$" : full[i - head];
      if (c !== "$") continue;
      if (i < index + head) nth++;
      count++;
    }
    if (written.length === count) return written[nth]!;
    for (const e of this.escapes) if (e >= range[0] && e < range[1]) return true;
    return false;
  }

  private rangeOf(node: Text): [number, number] | undefined {
    const p = node.position;
    if (p?.start.offset === undefined || p.end.offset === undefined) return undefined;
    return [p.start.offset, p.end.offset];
  }

  /** A text node's characters `from` to `to` as written, line prefixes left out. */
  sourceOf(node: Text, from: number, to: number): string | undefined {
    const alignment = this.alignmentOf(node);
    const start = this.offsetIn(node, from);
    const end = this.offsetIn(node, to);
    if (!alignment || start === undefined || end === undefined) return undefined;
    let out = "";
    let at = start;
    for (const [a, b] of alignment.skips) {
      if (a >= start && b <= end) {
        out += this.raw.slice(at, a);
        at = b;
      }
    }
    return out + this.raw.slice(at, end);
  }

  offsetOf(unit: Unit): number | undefined {
    if (unit.node.type === "text") return this.offsetIn(unit.node, unit.index);
    return unit.node.position?.start.offset;
  }

  offsetAfter(unit: Unit): number | undefined {
    if (unit.node.type === "text") return this.offsetIn(unit.node, unit.index + 1);
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

  private alignmentOf(node: Text): Alignment | null {
    let alignment = this.alignments.get(node);
    if (alignment === undefined) {
      const range = this.rangeOf(node);
      alignment = range ? align(node.value, this.raw.slice(range[0], range[1]), range[0]) : null;
      this.alignments.set(node, alignment);
    }
    return alignment;
  }
}

/** For each dollar sign the Markdown produces, in order, whether it was written `\$`. */
function dollarsWritten(written: string): boolean[] {
  const out: boolean[] = [];
  for (let j = 0; j < written.length; j++) {
    if (written[j] === "\\" && ASCII_PUNCTUATION.test(written[j + 1] ?? "")) {
      if (written[j + 1] === "$") out.push(true);
      j++;
    } else if (written[j] === "&") {
      const m = REFERENCE.exec(written.slice(j, j + 40));
      const decoded = m ? decodeReference(m) : false;
      if (m && decoded) {
        for (const ch of decoded) if (ch === "$") out.push(false);
        j += m[0].length - 1;
      }
    } else if (written[j] === "$") {
      out.push(false);
    }
  }
  return out;
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

function decodeReference(m: RegExpExecArray): string | false {
  if (m[1] !== undefined) return decodeNumericCharacterReference(m[1], 16);
  if (m[2] !== undefined) return decodeNumericCharacterReference(m[2], 10);
  return decodeNamedCharacterReference(m[3]!);
}

/**
 * Lines `value` up with `written`, the Markdown it was built from (starting at offset `base`); `null`
 * when the two cannot be lined up, in which case a formula's source is rebuilt from its TeX.
 *
 * After a line ending, the next line's prefix — spaces, tabs, and `>` — is not in the value. Where
 * the value's next character is itself `>` or a space, how much of the prefix to skip is ambiguous,
 * and the longest skip that lets the rest line up is taken.
 */
export function align(value: string, written: string, base: number): Alignment | null {
  const map: number[] = [];
  const skips: [number, number][] = [];
  const failed = new Set<string>();

  const go = (i: number, j: number): boolean => {
    while (i < value.length) {
      const c = value[i]!;
      if (c === "\n" || c === "\r") {
        const valueEnding = c === "\r" && value[i + 1] === "\n" ? 2 : 1;
        // Trailing spaces before the line ending are not in the value.
        let k = j;
        while (written[k] === " " || written[k] === "\t") k++;
        if (written[k] !== "\n" && written[k] !== "\r") return false;
        for (let n = 0; n < valueEnding; n++) map.push(base + j);
        k += written[k] === "\r" && written[k + 1] === "\n" ? 2 : 1;
        let end = k;
        while (end < written.length && /[ \t>]/.test(written[end]!)) end++;
        const next = i + valueEnding;
        const candidates: number[] = [];
        for (let p = end; p >= k; p--) {
          const fits =
            next >= value.length ||
            written[p] === value[next] ||
            (written[p] === "\0" && value[next] === "\uFFFD") ||
            written[p] === "\\" ||
            written[p] === "&";
          if (fits && !failed.has(`${next}:${p}`)) candidates.push(p);
        }
        if (candidates.length === 1) {
          // No choice to make: carry on without recursing, so a long paragraph cannot overflow the stack.
          if (candidates[0]! > k) skips.push([base + k, base + candidates[0]!]);
          i = next;
          j = candidates[0]!;
          continue;
        }
        for (const p of candidates) {
          const mapLength = map.length;
          const skipsLength = skips.length;
          if (p > k) skips.push([base + k, base + p]);
          if (go(next, p)) return true;
          map.length = mapLength;
          skips.length = skipsLength;
          failed.add(`${next}:${p}`);
        }
        return false;
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
        const decoded = m ? decodeReference(m) : false;
        if (m && decoded && value.startsWith(decoded, i)) {
          for (let n = 0; n < decoded.length; n++) map.push(base + j);
          i += decoded.length;
          j += m[0].length;
          continue;
        }
      }
      // micromark reads U+0000 as U+FFFD.
      if (written[j] === c || (written[j] === "\0" && c === "\uFFFD")) {
        map.push(base + j);
        i++;
        j++;
        continue;
      }
      return false;
    }
    map.push(base + j);
    return true;
  };

  return go(0, 0) ? { map, skips } : null;
}
