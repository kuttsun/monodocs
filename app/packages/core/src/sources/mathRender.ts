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
      node.children = [result.math];
      return SKIP;
    });
  };
}

/**
 * The largest size, in em, a formula may ask for (`\rule`, `\kern`, `\hspace`, `\raisebox`, and the
 * like). KaTeX's own `maxSize` does not reach every size it writes into MathML — `\raisebox` keeps the
 * unit it was given — so the MathML's sizes are limited here, in whatever unit they are written.
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
  | { math: Element; unsupported: { variant: string; chars: string }[]; numbered: boolean }
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
  limitSizes(math);
  return { math, unsupported, numbered };
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

/** Clamp every size in em beyond {@link MAX_SIZE_EM}, so that one formula cannot break the page. */
function limitSizes(math: Element): void {
  visit(math, "element", (node: Element) => {
    for (const [key, value] of Object.entries(node.properties)) {
      const m =
        typeof value === "string"
          ? /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z]{2})$/i.exec(value.trim())
          : null;
      const perEm = m ? UNITS_PER_EM[m[2]!.toLowerCase()] : undefined;
      if (!m || perEm === undefined) continue;
      const size = Number(m[1]) / perEm;
      if (Math.abs(size) > MAX_SIZE_EM) {
        node.properties[key] = `${size < 0 ? "-" : ""}${MAX_SIZE_EM}em`;
      }
    }
  });
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
  px: 10 / (72.27 / 96),
};

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
