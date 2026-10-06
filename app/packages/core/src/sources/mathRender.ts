import katex from "katex";
import { fromHtml } from "hast-util-from-html";
import type { Element, ElementContent, Root as HastRoot, Text } from "hast";
import { visit, SKIP } from "unist-util-visit";

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
      if (result.notations.length > 0) {
        report({ kind: "notation", source, notations: result.notations.join(", "), ...where });
      }
      node.children = [result.math];
      return SKIP;
    });
  };
}

/**
 * The largest size, in em, a formula may ask for (`\rule`, `\kern`, `\hspace`, `\raisebox`, and the
 * like). KaTeX's own `maxSize` does not reach every size it writes into MathML — `\raisebox` keeps the
 * unit it was given — so the MathML's sizes are limited in {@link normalizeLengths}.
 */
const MAX_SIZE_EM = 100;

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
  const numbered = dropClasses(math);
  normalizeLengths(math);
  const notations = drawEnclosures(math);
  return { math, unsupported, numbered, notations };
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

/** A TeX length as written: its sign, size, and unit, and whether it was written relative (`+6pt`). */
interface Length {
  size: number;
  unit: string;
  relative: boolean;
}

function parseLength(value: unknown): Length | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^([-+]?)(Infinity|(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z]{2})$/i.exec(value.trim());
  const unit = m?.[3]!.toLowerCase();
  if (!m || unit === undefined || UNITS_PER_EM[unit] === undefined) return undefined;
  const size = Number(m[2]);
  return { size: m[1] === "-" ? -size : size, unit, relative: m[1] !== "" };
}

/** The units CSS reads as TeX means them (TeX's point is within 0.4% of CSS's); the others are converted. */
const CSS_UNITS = new Set(["em", "ex", "pt", "mm", "cm", "in", "pc"]);

/**
 * A TeX length as MathML Core reads it, within {@link MAX_SIZE_EM}: a unit CSS has stays, so that an
 * absolute length stays absolute and a relative one relative; `mu` becomes em, as it is a fraction of
 * one; TeX's other absolute units (`bp`, `dd`, `cc`, `nd`, `nc`, `sp`, and KaTeX's `px`) become points.
 */
function cssLength(length: Length): string {
  const inEm = length.size / UNITS_PER_EM[length.unit]!;
  if (!(Math.abs(inEm) <= MAX_SIZE_EM)) return `${inEm < 0 ? "-" : ""}${MAX_SIZE_EM}em`;
  const round = (n: number) => Number(n.toFixed(4));
  if (CSS_UNITS.has(length.unit)) return `${round(length.size)}${length.unit}`;
  if (length.unit === "mu") return `${round(inEm)}em`;
  return `${round(inEm * 10)}pt`;
}

/** A length in em, for arithmetic between lengths. */
const inEm = (length: Length | undefined) =>
  length ? length.size / UNITS_PER_EM[length.unit]! : 0;

/**
 * Write every length as MathML Core reads it (see {@link cssLength}), and the `mpadded` forms it reads
 * differently from KaTeX:
 *
 * - a signed amount that grows the content (`width="+6pt" lspace="3pt"`, for `\colorbox` and
 *   `\fcolorbox`) is read as an absolute size, so that the box would not fit what it holds: it becomes
 *   padding around the content;
 * - a `voffset` alone (`\raisebox`) moves the content without making room for it, so that a display
 *   formula's box cuts it off: room is made on the side it moves to, as TeX does;
 * - a size in the content's own width (`lspace="-1width"`, for `\mathllap` and `\mathclap`) is not a
 *   length at all: the content is moved by that fraction of its width with a transform.
 */
function normalizeLengths(math: Element): void {
  visit(math, "element", (node: Element) => {
    if (node.tagName === "mpadded") {
      growByPadding(node);
      makeRoomForOffset(node);
      shiftByOwnWidth(node);
    }
    for (const [key, value] of Object.entries(node.properties)) {
      const length = parseLength(value);
      if (length) node.properties[key] = cssLength(length);
    }
  });
}

function addStyle(node: Element, style: string): void {
  node.properties.style =
    typeof node.properties.style === "string" ? `${style}; ${node.properties.style}` : style;
}

function growByPadding(node: Element): void {
  const width = parseLength(node.properties.width);
  const height = parseLength(node.properties.height);
  const depth = parseLength(node.properties.depth);
  if (!width?.relative && !height?.relative && !depth?.relative) return;
  const lspace = parseLength(node.properties.lspace);
  const voffset = parseLength(node.properties.voffset);
  const padding = [
    (height?.relative ? inEm(height) : 0) - inEm(voffset),
    (width?.relative ? inEm(width) : 0) - inEm(lspace),
    (depth?.relative ? inEm(depth) : 0) + inEm(voffset),
    inEm(lspace),
  ];
  // Shrinking has no padding to become; such an mpadded is left as KaTeX wrote it.
  if (padding.some((p) => p < 0)) return;
  for (const key of ["width", "height", "depth", "lspace", "voffset"]) delete node.properties[key];
  // KaTeX grows a box by points, a fixed amount, so the padding is in points too.
  const pt = (n: number) => cssLength({ size: n * 10, unit: "pt", relative: false });
  addStyle(node, `padding: ${padding.map(pt).join(" ")}`);
}

function makeRoomForOffset(node: Element): void {
  const voffset = parseLength(node.properties.voffset);
  if (!voffset || voffset.size === 0) return;
  if (node.properties.height !== undefined || node.properties.depth !== undefined) return;
  const room = cssLength({ ...voffset, size: Math.abs(voffset.size), relative: false });
  addStyle(node, voffset.size > 0 ? `padding-top: ${room}` : `padding-bottom: ${room}`);
}

function shiftByOwnWidth(node: Element): void {
  const m =
    typeof node.properties.lspace === "string"
      ? /^([-+]?(?:\d+\.?\d*|\.\d+))width$/.exec(node.properties.lspace.trim())
      : null;
  if (!m) return;
  delete node.properties.lspace;
  node.children = [
    {
      type: "element",
      tagName: "mrow",
      properties: { style: `transform: translateX(${Number(m[1]) * 100}%)` },
      children: node.children,
    },
  ];
}

/**
 * How many of each TeX unit make an em, taking an em as 10pt as KaTeX does; `ex` and `mu` are KaTeX's
 * own proportions. A unit not listed is left alone.
 */
const UNITS_PER_EM: Record<string, number> = {
  em: 1,
  ex: 1 / 0.431,
  mu: 18,
  pt: 10,
  mm: 10 / (72.27 / 25.4),
  cm: 10 / (72.27 / 2.54),
  in: 10 / 72.27,
  bp: 10 / (72.27 / 72),
  pc: 10 / 12,
  dd: 10 / (1238 / 1157),
  cc: 10 / (14856 / 1157),
  nd: 10 / (685 / 642),
  nc: 10 / (1370 / 107),
  sp: 10 * 65536,
  // KaTeX's px is 803/800 of a point, not CSS's 1/96 inch.
  px: 10 / (803 / 800),
};

/** A line as thick as KaTeX draws its rules. */
const LINE = "0.06em";
const strike = (direction: string) =>
  `linear-gradient(${direction}, transparent calc(50% - ${LINE} / 2), currentColor calc(50% - ${LINE} / 2), ` +
  `currentColor calc(50% + ${LINE} / 2), transparent calc(50% + ${LINE} / 2))`;

/** The CSS each `menclose` notation becomes: borders for the sides, gradients for the strikes. */
const ENCLOSURES: Record<string, { border?: string[]; radius?: boolean; strike?: string }> = {
  box: { border: ["top", "right", "bottom", "left"] },
  roundedbox: { border: ["top", "right", "bottom", "left"], radius: true },
  top: { border: ["top"] },
  bottom: { border: ["bottom"] },
  left: { border: ["left"] },
  right: { border: ["right"] },
  actuarial: { border: ["top", "right"] },
  // A gradient's stripe runs across its direction: "to bottom right" draws the stripe from the bottom
  // left corner to the top right one.
  updiagonalstrike: { strike: strike("to bottom right") },
  downdiagonalstrike: { strike: strike("to top right") },
  horizontalstrike: { strike: strike("to bottom") },
  verticalstrike: { strike: strike("to right") },
};

/**
 * `menclose` is not in MathML Core, so Chromium draws its content and nothing around it: `\cancel`
 * would show the term it cancels, and `\boxed` no box. Each one becomes an `mrow` drawing its
 * notations with an inline style, as KaTeX itself does for `\fcolorbox`: borders around the term,
 * strikes on an element laid over it. A notation CSS cannot draw
 * this way (`phasorangle`, `circle`, `longdiv`, and the rest) is returned to be reported.
 */
function drawEnclosures(math: Element): string[] {
  const unsupported = new Set<string>();
  visit(math, "element", (node: Element) => {
    if (node.tagName !== "menclose") return;
    const notations = String(node.properties.notation ?? "longdiv")
      .split(/\s+/)
      .filter(Boolean);
    const borders = new Set<string>();
    const strikes: string[] = [];
    let radius = false;
    for (const notation of notations) {
      const drawn = ENCLOSURES[notation];
      if (!drawn) {
        unsupported.add(notation);
        continue;
      }
      drawn.border?.forEach((side) => borders.add(side));
      if (drawn.strike) strikes.push(drawn.strike);
      radius ||= drawn.radius === true;
    }
    const style = [
      ...[...borders].map((side) => `border-${side}: ${LINE} solid`),
      borders.size > 0 ? "padding: 0.15em" : "",
      radius ? "border-radius: 0.3em" : "",
      strikes.length > 0 ? "position: relative" : "",
      typeof node.properties.style === "string" ? node.properties.style : "",
    ].filter(Boolean);
    node.tagName = "mrow";
    delete node.properties.notation;
    if (style.length > 0) node.properties.style = style.join("; ");
    if (strikes.length > 0) {
      // The strikes are drawn over the term, by an empty element laid over it, so that a background
      // in the term (`\colorbox`) cannot hide them; and they are printed even with
      // `pdf.printBackground` off, since a cancelled term that prints uncancelled changes the formula.
      node.children.push({
        type: "element",
        tagName: "mrow",
        properties: {
          style:
            `position: absolute; inset: 0; background-image: ${strikes.join(", ")}; ` +
            "print-color-adjust: exact; -webkit-print-color-adjust: exact",
        },
        children: [],
      });
    }
  });
  return [...unsupported];
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
        restyle(child, variant, unsupported);
      }
    }
  };
  walk(math, undefined);
  return [...unsupported].map(([variant, chars]) => ({ variant, chars: [...chars].join("") }));
}

function restyle(text: Text, variant: string, unsupported: Map<string, Set<string>>): void {
  let out = "";
  for (const ch of text.value) {
    const styled = styledCharacter(variant, ch);
    if (styled !== undefined) out += styled;
    else {
      out += ch;
      if (/[\p{L}\p{N}]/u.test(ch)) {
        if (!unsupported.has(variant)) unsupported.set(variant, new Set());
        unsupported.get(variant)!.add(ch);
      }
    }
  }
  text.value = out;
}
