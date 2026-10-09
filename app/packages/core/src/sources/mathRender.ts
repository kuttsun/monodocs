import katex from "katex";
import { fromHtml } from "hast-util-from-html";
import type { Element, ElementContent, Root as HastRoot, Text } from "hast";
import { visit, SKIP } from "unist-util-visit";
import { addStyle, rewriteForCore } from "./mathCore.js";

/**
 * Rendering a formula at build time, in either source format (roadmap 6.4).
 *
 * A formula is a `.math` element carrying `data-math-source` (as written, for copying) and
 * `data-math-tex` (as interpreted), with the TeX as its text until it is rendered, so that a heading's
 * ID is made from the TeX. KaTeX renders it to MathML only — no script, no stylesheet — and the
 * `mathvariant` styles Chromium ignores are resolved into Unicode mathematical alphanumerics here.
 */

/** A problem with one formula, reported by the caller with the file it came from. */
export type MathProblem = { source: string; line?: number; column?: number } & (
  | { kind: "parse"; detail: string }
  | { kind: "not-allowed"; commands: string }
  | { kind: "numbering" }
  | { kind: "notation"; notations: string }
  | { kind: "construct"; constructs: string }
  | { kind: "broken" }
  | { kind: "style"; variant: string; chars: string }
);

/** The hast element a formula is written as before it is rendered. */
export function mathPlaceholder(
  tex: string,
  source: string,
  display: boolean,
  block: boolean,
): Element {
  return {
    type: "element",
    tagName: block ? "div" : "span",
    properties: {
      className: ["math", display ? "math-display" : "math-inline"],
      dataMathSource: source,
      dataMathTex: tex,
    },
    children: [{ type: "text", value: tex }],
    // The mark that makes it a formula: raw HTML can spell the class and the attributes, but not this.
    data: { monodocsMath: true } as Element["data"],
  };
}

declare module "hast" {
  interface ElementData {
    /** Set on a formula monodocs made; see {@link mathPlaceholder}. */
    monodocsMath?: boolean;
  }
}

/** Whether a hast element is a formula monodocs made (rendered or not), not raw HTML that looks like one. */
export function isMath(node: ElementContent): boolean {
  return node.type === "element" && node.data?.monodocsMath === true;
}

/** rehype plugin: renders every formula placeholder, reporting what it could not render. */
export function rehypeRenderMath(report: (problem: MathProblem) => void) {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (!isMath(node)) return;
      const tex = node.properties.dataMathTex as string;
      const source = String(node.properties.dataMathSource ?? tex);
      const display = (node.properties.className as string[]).includes("math-display");
      const where = { line: node.position?.start.line, column: node.position?.start.column };
      const result = renderFormula(tex, display);
      if ("error" in result || "notAllowed" in result) {
        report(
          "error" in result
            ? { kind: "parse", source, detail: result.error, ...where }
            : { kind: "not-allowed", source, commands: result.notAllowed.join(", "), ...where },
        );
        // Shown as written, as it was before math was rendered, rather than as KaTeX's error box.
        node.properties.className = ["math-error"];
        delete node.data;
        delete node.properties.dataMathTex;
        delete node.properties.dataMathSource;
        node.children = [{ type: "text", value: source }];
        return SKIP;
      }
      for (const s of result.unsupported) report({ kind: "style", source, ...s, ...where });
      if (result.numbered) report({ kind: "numbering", source, ...where });
      if (result.constructs.length > 0) {
        report({ kind: "construct", source, constructs: result.constructs.join(", "), ...where });
      }
      if (result.notations.length > 0) {
        report({ kind: "notation", source, notations: result.notations.join(", "), ...where });
      }
      node.children = [result.math];
      return SKIP;
    });
    keepPunctuationWithFormulas(tree);
  };
}

/**
 * Punctuation that may not start a line, and brackets that may not end one, as Chromium's line
 * breaker treats them between two characters: measured, each of these stayed off the start (or
 * the end) of a line in text, and did not after an inline formula. `ー`, small kana, and `—` start a
 * line in text too, and are left out.
 */
const NO_LINE_START =
  /^[,.;:!?)\]}'"\-‐–%％‰°′″℃、。，．：；！？）］｝」』】〕〉》〙〗〛”’…‥・〜々゠〟‼⁉｡､｣･]+/;
const NO_LINE_END = /[(\[{（［｛「『【〔〈《〘〖〚“‘｢]+$/;

/**
 * Inline elements that may hold a formula and nothing else, and then stand for it at a line break.
 * It is not lineBreak.ts's set, which lists what a line break may run through; this lists the text
 * formatting a formula is written in (`**$x$**`, a link whose text is a formula).
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
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
  "var",
]);

type Parent = HastRoot | Element;

/**
 * Chromium breaks a line on either side of an inline box, a formula included, even where it never
 * breaks between two characters: measured, a line could start with `、`, `。`, `,`, or `）` right
 * after an inline formula, and an inline-block did the same, while text alone never did. The
 * punctuation that may not start a line after a formula, and the brackets that may not end one
 * before it, are kept with it in a span that does not wrap. Where strong text, emphasis, or a link
 * holds the formula and nothing else, that element is what is kept, and a footnote reference right
 * after the formula goes with it; nothing longer than that is kept from wrapping. The
 * formula's own element is left as it is, so the text copied and searched is unchanged; the style is
 * inline, so a theme cannot lose it.
 */
function keepPunctuationWithFormulas(tree: HastRoot): void {
  const found: { formula: Element; ancestors: Parent[] }[] = [];
  const walk = (node: Parent, ancestors: Parent[]): void => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (isMath(child)) {
        const classes = child.properties.className as string[];
        if (classes.includes("math-inline"))
          found.push({ formula: child, ancestors: [...ancestors, node] });
        continue;
      }
      walk(child, [...ancestors, node]);
    }
  };
  walk(tree, []);
  for (const { formula, ancestors } of found) {
    // The element the formula stands for: an inline element holding nothing else (`**$x$**`), so
    // that what is kept from wrapping is never more than the formula, which cannot wrap anyway.
    let unit: Element = formula;
    let k = ancestors.length - 1;
    for (; k > 0; k--) {
      const parent = ancestors[k]!;
      if (parent.type !== "element" || !INLINE.has(parent.tagName)) break;
      if (parent.children.length !== 1 || parent.children[0] !== unit) break;
      unit = parent;
    }
    keep(ancestors[k]!, unit);
  }
}

/**
 * A footnote reference: GFM's, which links with `data-footnote-ref`, or Asciidoctor's `sup.footnote`
 * (`sup.footnoteref` where a named footnote is referred to again).
 */
function isFootnoteRef(node: ElementContent | undefined): boolean {
  if (node?.type !== "element" || node.tagName !== "sup") return false;
  const classes = node.properties.className;
  if (Array.isArray(classes) && (classes.includes("footnote") || classes.includes("footnoteref"))) {
    return true;
  }
  return node.children.some(
    (c) => c.type === "element" && c.properties.dataFootnoteRef !== undefined,
  );
}

/** Wrap `unit` in `parent` with the bracket before it and the punctuation after it, if any. */
function keep(parent: Parent, unit: Element): void {
  const children = parent.children as ElementContent[];
  // The parent is the one the formula had when the tree was walked; a span made for an earlier
  // formula holds only formulas and punctuation, never an element a later formula is in.
  let first = children.indexOf(unit);
  if (first < 0) return;
  let last = first;
  const kept: ElementContent[] = [unit];
  // A footnote reference set right after the formula goes with it.
  while (isFootnoteRef(children[last + 1])) kept.push(children[++last]!);
  const prev = children[first - 1];
  const next = children[last + 1];
  const opening = prev?.type === "text" ? NO_LINE_END.exec(prev.value)?.[0] : undefined;
  const closing = next?.type === "text" ? NO_LINE_START.exec(next.value)?.[0] : undefined;
  if (opening === undefined && closing === undefined && kept.length === 1) return;
  if (opening !== undefined && prev?.type === "text") {
    kept.unshift({ type: "text", value: opening });
    prev.value = prev.value.slice(0, -opening.length);
    if (prev.value === "") first--;
  }
  if (closing !== undefined && next?.type === "text") {
    kept.push({ type: "text", value: closing });
    next.value = next.value.slice(closing.length);
    if (next.value === "") last++;
  }
  children.splice(first, last - first + 1, {
    type: "element",
    tagName: "span",
    properties: { style: "white-space: nowrap" },
    children: kept,
  });
}

/**
 * One formula as a MathML `<math>` element; or KaTeX's reason for not parsing it; or the commands it
 * uses that monodocs does not allow (links, images, and raw HTML attributes: `\href`, `\url`,
 * `\includegraphics`, `\htmlClass`, and the rest), which KaTeX would otherwise render as red text.
 */
export function renderFormula(
  tex: string,
  display: boolean,
):
  | {
      math: Element;
      unsupported: { variant: string; chars: string }[];
      numbered: boolean;
      notations: string[];
      constructs: string[];
    }
  | { error: string }
  | { notAllowed: string[] } {
  let html: string;
  const notAllowed: string[] = [];
  try {
    html = katex.renderToString(tex, {
      output: "mathml",
      displayMode: display,
      throwOnError: true,
      // Non-Latin text in math mode is rendered as text; KaTeX's console warning about it is not
      // something a reader of the build's output could act on.
      strict: "ignore",
      trust: (context) => {
        notAllowed.push(context.command);
        return false;
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (notAllowed.length > 0) return { notAllowed: [...new Set(notAllowed)] };
  let math: Element | undefined;
  visit(fromHtml(html, { fragment: true }), "element", (node) => {
    if (node.tagName === "math") {
      math = node;
      return SKIP;
    }
  });
  if (!math) return { error: "KaTeX produced no <math> element" };
  const unsupported = resolveMathvariants(math);
  const { notations, constructs } = rewriteForCore(math);
  constructs.push(...parseTreeLosses(tex, display));
  const numbered = dropClasses(math);
  return { math, unsupported, numbered, notations, constructs };
}

/**
 * Remove the classes KaTeX puts in its MathML, which only its stylesheet gives a meaning to, and say
 * whether one of them was an equation number: KaTeX draws `equation`, `align`, and `gather` numbers
 * with a CSS counter on `mml-eqn-num`, so without the stylesheet the number is not there.
 */
function dropClasses(math: Element): boolean {
  let numbered = false;
  visit(math, "element", (node: Element) => {
    const className = node.properties.className;
    if (Array.isArray(className) && className.includes("mml-eqn-num")) numbered = true;
    delete node.properties.className;
  });
  return numbered;
}

/**
 * What KaTeX drops on the way from its parse tree to MathML, read from the parse tree since the MathML
 * no longer shows it:
 *
 * - `\\boldsymbol` (and `\\bm`) on a relation, a bracket, or punctuation (`\\boldsymbol{\\rightarrow}`):
 *   KaTeX writes the style only for letters, digits, and binary operators;
 * - the room `\\\\[2em]` asks for between the rows of an environment, which KaTeX's MathML leaves out;
 * - the branch of `\\mathchoice` (written directly, or through `\\bmod` and the like) inside a script or
 *   a fraction: KaTeX picks it by a style it does not carry into scripts and fractions, so it can be
 *   the wrong one.
 */
function parseTreeLosses(tex: string, display: boolean): string[] {
  let tree: unknown;
  try {
    tree = (katex as unknown as { __parse(tex: string, options: object): unknown }).__parse(tex, {
      displayMode: display,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return [];
  }
  const losses = new Set<string>();
  const lost = new Set(["rel", "open", "close", "punct", "inner"]);
  const walk = (node: unknown, bold: boolean, smaller = false): void => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, bold, smaller));
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (bold && record.type === "atom" && lost.has(String(record.family))) {
      losses.add("\\boldsymbol on a relation, bracket, or punctuation");
    }
    if (record.type === "array" && Array.isArray(record.rowGaps) && record.rowGaps.some(Boolean)) {
      losses.add("\\\\[...] inside an environment");
    }
    // Only the branch that reaches MathML counts (`\\html@mathml{...}{...}`).
    if (record.type === "htmlmathml") return walk(record.mathml, bold, smaller);
    if (record.type === "mathchoice" && smaller) losses.add("\\mathchoice");
    // A script, or a fraction's numerator or denominator, is set in a smaller style.
    const scripts =
      record.type === "supsub"
        ? ["sup", "sub"]
        : record.type === "genfrac"
          ? ["numer", "denom"]
          : [];
    // A font replaces the one around it: \\mathrm inside \\boldsymbol is upright, not bold.
    const inside = record.type === "font" ? record.font === "boldsymbol" : bold;
    for (const [key, value] of Object.entries(record)) {
      if (key !== "loc") walk(value, inside, smaller || scripts.includes(key));
    }
  };
  walk(tree, false);
  return [...losses];
}

// --- mathvariant --------------------------------------------------------------------------------

/**
 * Where each style's letters, digits, and Greek start in Unicode's Mathematical Alphanumeric
 * Symbols, and the letters that live elsewhere (in Letterlike Symbols, from before the block).
 * A style without a range for a kind of character has no Unicode form for it.
 */
interface Style {
  upper?: number;
  lower?: number;
  digits?: number;
  greekUpper?: number;
  greekLower?: number;
  holes?: Record<string, number>;
  extra?: Record<string, number>;
}

const STYLES: Record<string, Style> = {
  bold: {
    upper: 0x1d400,
    lower: 0x1d41a,
    digits: 0x1d7ce,
    greekUpper: 0x1d6a8,
    greekLower: 0x1d6c2,
    extra: { Ϝ: 0x1d7ca, ϝ: 0x1d7cb },
  },
  italic: {
    upper: 0x1d434,
    lower: 0x1d44e,
    greekUpper: 0x1d6e2,
    greekLower: 0x1d6fc,
    holes: { h: 0x210e },
    extra: { ı: 0x1d6a4, ȷ: 0x1d6a5 },
  },
  "bold-italic": { upper: 0x1d468, lower: 0x1d482, greekUpper: 0x1d71c, greekLower: 0x1d736 },
  script: {
    upper: 0x1d49c,
    lower: 0x1d4b6,
    holes: {
      B: 0x212c,
      E: 0x2130,
      F: 0x2131,
      H: 0x210b,
      I: 0x2110,
      L: 0x2112,
      M: 0x2133,
      R: 0x211b,
      e: 0x212f,
      g: 0x210a,
      o: 0x2134,
    },
  },
  "bold-script": { upper: 0x1d4d0, lower: 0x1d4ea },
  fraktur: {
    upper: 0x1d504,
    lower: 0x1d51e,
    holes: { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 },
  },
  "double-struck": {
    upper: 0x1d538,
    lower: 0x1d552,
    digits: 0x1d7d8,
    holes: { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 },
  },
  "bold-fraktur": { upper: 0x1d56c, lower: 0x1d586 },
  "sans-serif": { upper: 0x1d5a0, lower: 0x1d5ba, digits: 0x1d7e2 },
  "bold-sans-serif": {
    upper: 0x1d5d4,
    lower: 0x1d5ee,
    digits: 0x1d7ec,
    greekUpper: 0x1d756,
    greekLower: 0x1d770,
  },
  "sans-serif-italic": { upper: 0x1d608, lower: 0x1d622 },
  "sans-serif-bold-italic": {
    upper: 0x1d63c,
    lower: 0x1d656,
    greekUpper: 0x1d790,
    greekLower: 0x1d7aa,
  },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digits: 0x1d7f6 },
};

/** The Greek capitals in the order the blocks use: Α–Ρ, ϴ, Σ–Ω, then ∇. */
const GREEK_UPPER = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇";
/** The Greek small letters in the order the blocks use: α–ω (ς included), then ∂ϵϑϰϕϱϖ. */
const GREEK_LOWER = "αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖ";

/** `ch` in `variant`, or `undefined` when Unicode has no such character. */
export function styledCharacter(variant: string, ch: string): string | undefined {
  const style = STYLES[variant];
  if (!style) return undefined;
  if (style.holes?.[ch] !== undefined) return String.fromCodePoint(style.holes[ch]);
  if (style.extra?.[ch] !== undefined) return String.fromCodePoint(style.extra[ch]);
  const at = (base: number | undefined, index: number) =>
    base === undefined || index < 0 ? undefined : String.fromCodePoint(base + index);
  if (ch >= "A" && ch <= "Z") return at(style.upper, ch.charCodeAt(0) - 65);
  if (ch >= "a" && ch <= "z") return at(style.lower, ch.charCodeAt(0) - 97);
  if (ch >= "0" && ch <= "9") return at(style.digits, ch.charCodeAt(0) - 48);
  if (GREEK_UPPER.includes(ch)) return at(style.greekUpper, GREEK_UPPER.indexOf(ch));
  if (GREEK_LOWER.includes(ch)) return at(style.greekLower, GREEK_LOWER.indexOf(ch));
  return undefined;
}

const TOKENS = new Set(["mi", "mn", "mo", "mtext", "ms"]);

/**
 * Replace every `mathvariant` other than `normal` with the characters it stands for, since MathML
 * Core, and so Chromium, applies only `normal`. A letter or digit with no Unicode form in the style is
 * left as it is and returned, so that it is reported rather than lost in silence; other characters
 * (spaces, punctuation, operators) have no styled forms to lose.
 */
export function resolveMathvariants(math: Element): { variant: string; chars: string }[] {
  const unsupported = new Map<string, Set<string>>();
  const walk = (node: Element, inherited: string | undefined) => {
    const own = node.properties.mathVariant ?? node.properties.mathvariant;
    let variant = inherited;
    if (typeof own === "string") {
      variant = own;
      if (own !== "normal") {
        delete node.properties.mathVariant;
        delete node.properties.mathvariant;
      }
    }
    for (const child of node.children) {
      if (child.type === "element") walk(child, variant);
      else if (
        child.type === "text" &&
        TOKENS.has(node.tagName) &&
        variant !== undefined &&
        variant !== "normal"
      ) {
        restyle(node, child, variant, unsupported);
      }
    }
  };
  walk(math, undefined);
  return [...unsupported].map(([variant, chars]) => ({ variant, chars: [...chars].join("") }));
}

function restyle(
  token: Element,
  text: Text,
  variant: string,
  unsupported: Map<string, Set<string>>,
): void {
  let out = "";
  let symbols = false;
  for (const ch of text.value) {
    const styled = styledCharacter(variant, ch);
    if (styled !== undefined) out += styled;
    else {
      out += ch;
      if (/[\p{L}\p{N}]/u.test(ch)) {
        if (!unsupported.has(variant)) unsupported.set(variant, new Set());
        unsupported.get(variant)!.add(ch);
      } else if (!/\s/u.test(ch)) {
        symbols = true;
      }
    }
  }
  text.value = out;
  // A symbol has no styled letter in Unicode, but CSS can still make it bold or italic
  // (`\\boldsymbol{+}`); the other styles are not something a symbol is drawn in.
  if (symbols) {
    const css = [
      variant.includes("bold") ? "font-weight: bold" : "",
      variant.includes("italic") ? "font-style: italic" : "",
    ].filter(Boolean);
    if (css.length > 0) addStyle(token, css.join("; "));
  }
}
