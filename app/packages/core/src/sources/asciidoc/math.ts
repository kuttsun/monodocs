import { randomUUID } from "node:crypto";
import { ConverterFactory } from "@asciidoctor/core";
import asciimath2tex from "asciimath2tex";
import { fromHtml } from "hast-util-from-html";
import type { Element, ElementContent, Root as HastRoot, Text } from "hast";
import { SKIP, visit } from "unist-util-visit";
import { t } from "../../messages.js";

/**
 * AsciiDoc math (roadmap 6.4): Asciidoctor's own markup — `latexmath:[...]` and `asciimath:[...]`,
 * their blocks, and `stem:[...]` and the `[stem]` block, which mean one or the other — rendered as
 * Markdown's formulas are. asciimath is first turned into TeX by asciimath2tex (v0.16).
 *
 * The converter's output for a formula is replaced inside Asciidoctor's conversion, and the formulas
 * are made once the HTML is parsed. An inline formula is marked with characters, not a tag: three
 * private-use characters around a key and Asciidoctor's own converted text, where the default output
 * has `\(` and `\)`. Asciidoctor makes a section's ID from its converted title, taking out tags and
 * every character that is not a word character, so a title with formulas in it gives the very ID it
 * gave before, whatever the formulas hold; a tag in place of the delimiters would not, since its `>`
 * can end a bracketed run Asciidoctor reads as a tag across formulas. A key is new for each
 * conversion, and what it stands for is kept by the converter, so raw HTML from a passthrough can
 * neither pass for a formula nor change one. A formula the HTML around it broke apart (its own
 * substitutions let a `</span>` through) is written back with `\(` and `\)`, as Asciidoctor writes it,
 * and reported.
 */

/** A symbol in one of asciimath2tex's tables. */
interface AsciiMathSymbol {
  asciimath: string;
  tex?: string;
  atname?: string;
  atval?: string;
  acc?: boolean;
  rawfirst?: boolean;
}

/** The parts of asciimath2tex's parser that are adjusted below; its tables are read at parse time. */
interface AsciiMathParser {
  parse(asciimath: string): string;
  escape_text(text: string): string;
  sort_symbols(): void;
  unary_symbols: AsciiMathSymbol[];
  binary_symbols: AsciiMathSymbol[];
  constants: AsciiMathSymbol[];
}

/**
 * asciimath2tex's parser. Its types declare an ES default export, but its CommonJS build assigns the
 * class to `module.exports`, which is what Node and the bundler hand over as the default import.
 */
const AsciiMathParserClass = asciimath2tex as unknown as new () => AsciiMathParser;

/** Capitalised functions asciimath2tex writes as a command TeX does not have (`\Sin`). */
const CAPITALISED = new Set(
  "Sin Cos Tan Sinh Cosh Tanh Cot Sec Csc Arcsin Arccos Arctan Log Ln".split(" "),
);

/**
 * What ASCIIMathML defines and asciimath2tex lacks, and the TeX for it. Bold sans-serif, bold script,
 * and bold fraktur have no command in KaTeX, so they name one it does not know and are reported as a
 * formula that cannot be rendered, rather than printed as their letters; `class` and `id` set an
 * attribute, which KaTeX does only behind `trust`, and are refused as any such command is.
 */
const MISSING_UNARY: AsciiMathSymbol[] = [
  { asciimath: "bold", tex: "\\mathbf" },
  { asciimath: "italic", tex: "\\mathit" },
  { asciimath: "mathit", tex: "\\mathit" },
  { asciimath: "sfit", tex: "\\mathsfit" },
  { asciimath: "bbit", tex: "\\boldsymbol" },
  { asciimath: "bbsf", tex: "\\mathbfsf" },
  { asciimath: "bbsfit", tex: "\\mathbfsfit" },
  { asciimath: "bbcc", tex: "\\mathbfcal" },
  { asciimath: "bbfr", tex: "\\mathbffrak" },
  { asciimath: "overarc", tex: "\\overgroup", acc: true },
  { asciimath: "overparen", tex: "\\overgroup", acc: true },
];
const MISSING_BINARY: AsciiMathSymbol[] = [
  { asciimath: "class", tex: "\\htmlClass", rawfirst: true },
  { asciimath: "id", tex: "\\htmlId", rawfirst: true },
];

/** What `\text{...}` cannot take as it is, and what it takes instead. */
const TEXT_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "&": "\\&",
  "#": "\\#",
  $: "\\$",
  "%": "\\%",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  _: "\\_",
};

/**
 * An asciimath2tex parser whose TeX KaTeX reads, and draws as ASCIIMathML does, for every symbol
 * AsciiMath defines (roadmap 6.4, v0.16). Measured against ASCIIMathML's own table, it wrote the
 * capitalised functions as `\Sin`, `>->>` as `\twoheadrightarrowtail`, and `mathbf` and `mathsf`
 * without their backslash; it lacked `bold`, `italic`, `mathit`, `sfit`, the bold styles, `overarc`,
 * `class`, and `id`; it passed `&`, `#`, `$`, and `~` through as they are, which TeX reads as markup;
 * and in text it escaped only braces, and left `--`, `''`, and a doubled backquote to KaTeX's
 * ligatures.
 */
export function createAsciiMathParser(): AsciiMathParser {
  const parser = new AsciiMathParserClass();
  for (const symbol of parser.unary_symbols) {
    if (CAPITALISED.has(symbol.asciimath)) symbol.tex = `\\operatorname{${symbol.asciimath}}`;
    if (symbol.atname === "mathvariant" && symbol.tex && !symbol.tex.startsWith("\\")) {
      symbol.tex = `\\${symbol.tex}`;
    }
  }
  for (const symbol of parser.constants) {
    if (symbol.tex === "\\twoheadrightarrowtail") symbol.tex = '\\mathrel{\\char"2916}';
  }
  parser.unary_symbols.push(...MISSING_UNARY.map((symbol) => ({ ...symbol })));
  parser.binary_symbols.push(...MISSING_BINARY.map((symbol) => ({ ...symbol })));
  // Longest first again, so that `bbit` is not read as `bb` and `it`; the single characters, matched
  // after every longer symbol they could begin (`~~`, `~=`), go last either way.
  parser.constants.push(
    { asciimath: "&", tex: "\\&" },
    { asciimath: "#", tex: "\\#" },
    { asciimath: "$", tex: "\\$" },
    { asciimath: "~", tex: "\\text{\\textasciitilde}" },
  );
  parser.sort_symbols();
  parser.escape_text = (text) =>
    text
      .replace(/[\\{}&#$%~^_]/g, (c) => TEXT_ESCAPES[c]!)
      // KaTeX joins these in text into a dash or a quote, which ASCIIMathML leaves as they are.
      .replace(/([-'`])(?=[-'`])/g, "$1{}");
  return parser;
}

/** Deeper than this, asciimath2tex's time grows past a second (16 levels, half a second). */
const MAX_BRACKET_DEPTH = 12;

/** How deeply the brackets of an asciimath formula nest, counting every opening bracket. */
function bracketDepth(asciimath: string): number {
  let depth = 0;
  let deepest = 0;
  for (const c of asciimath) {
    if (c === "(" || c === "[" || c === "{") deepest = Math.max(deepest, ++depth);
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
  }
  return deepest;
}

/**
 * Split an asciimath block as Asciidoctor does before it writes each part as a formula of its own: at
 * a blank line, or at a line ending in ` \` (Asciidoctor's `StemBreakRx`).
 */
const STEM_BREAK = / *\\\n(?:\\?\n)*|\n\n+/;

/** What a conversion with the math converter found. */
export interface AsciidocMath {
  /** The converter to hand Asciidoctor (as `_preCreatedConverter`, so that titles use it too). */
  converter: object;
  /** latexmath formulas the HTML around them broke apart, written as Asciidoctor writes them. */
  broken: string[];
  /** asciimath formulas that could not be turned into TeX, written as Asciidoctor writes them. */
  failed: { source: string; detail: string }[];
  /** Turn the markers in parsed HTML into formulas. */
  markFormulas(tree: HastRoot): void;
  /** A converted title with each formula as `$TeX$`, as the lists of headings show it. */
  titleText(html: string): string;
}

/** The nodes of Asciidoctor's API the converter reads. */
interface MathNode {
  getNodeName(): string;
  type?: string;
  text?: string;
  style?: string;
  id?: string;
  role?: string;
  title?: string;
  hasTitle?(): boolean;
  content?(): Promise<string>;
}

interface Converter {
  convert(node: MathNode, transform?: string, opts?: unknown): Promise<string>;
}

/**
 * An inline marker: U+E000, the key, U+E001, Asciidoctor's converted text, U+E002, the key, U+E003.
 * Both ends carry the key, so that either end, alone or with its pair, is known to be one this
 * converter wrote, and a private-use character an author wrote is left alone.
 */
const OPEN = "\uE000";
/** Elements whose content is text only, where a formula's element cannot go. */
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
]);
/** The key's digits: sixteen private-use characters, one per hexadecimal digit. */
const KEY_BASE = 0xe010;
const INLINE = /\uE000([\uE010-\uE01F]+)\uE001([^\uE000-\uE003]*)\uE002\1\uE003/g;
const BLOCK_KEY = /data-monodocs-math="([\uE010-\uE01F]+)"/g;
const END = /\uE000([\uE010-\uE01F]+)\uE001|\uE002([\uE010-\uE01F]+)\uE003/g;

interface Formula {
  tex: string;
  source: string;
  display: boolean;
  /** A display formula's block, as this converter wrote it and as Asciidoctor writes it. */
  block?: { ours: string; asciidoctor: string; oursDecoded: string; asciidoctorDecoded: string };
}

/**
 * A converter for one conversion. Asciidoctor resolves `stem` before converting: `stem:[x]` under
 * `:stem: latexmath` arrives as latexmath, and `[stem,asciimath]` as asciimath.
 */
export async function createMathConverter(
  options: { htmlsyntax?: string } = {},
): Promise<AsciidocMath> {
  // Made as Asciidoctor makes the document's own, which is given the `htmlsyntax` set by the API: a
  // converter made without it sets the attribute back to `html`, which a document could test.
  const base = (await (
    ConverterFactory as unknown as { create(backend: string, opts: object): Promise<Converter> }
  ).create(
    "html5",
    options.htmlsyntax === undefined ? {} : { htmlsyntax: options.htmlsyntax },
  )) as Converter & object;
  const nonce = randomUUID().replace(/-/g, "");
  const asciimathParser = createAsciiMathParser();
  const broken: string[] = [];
  const failed: { source: string; detail: string }[] = [];

  /**
   * The TeX for an asciimath formula, or `undefined`, reported, when asciimath2tex cannot make it:
   * brackets nested too deeply for its time, or a formula long enough to exhaust its stack. A block's
   * parts, split where Asciidoctor splits them, are stacked one per line.
   */
  const asciimathTex = (written: string, source: string, block: boolean): string | undefined => {
    const parts = block
      ? written.split(STEM_BREAK).filter((part) => part.trim() !== "")
      : [written];
    if (parts.some((part) => bracketDepth(part) > MAX_BRACKET_DEPTH)) {
      failed.push({ source, detail: t("pages.mathTooDeep", { max: String(MAX_BRACKET_DEPTH) }) });
      return undefined;
    }
    try {
      const tex = parts.map((part) => asciimathParser.parse(part));
      // What it read without understanding comes out as `undefined` (`color red x`, without the
      // parentheses `color` takes), a formula that would render wrong rather than fail.
      if (tex.some((part) => /\bundefined\b/.test(part) && !/\bundefined\b/.test(written))) {
        failed.push({ source, detail: t("pages.mathAsciimathUnread") });
        return undefined;
      }
      return tex.length > 1
        ? `\\begin{gathered}${tex.join(" \\\\ ")}\\end{gathered}`
        : (tex[0] ?? "");
    } catch (error) {
      failed.push({ source, detail: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  };
  const formulas = new Map<string, Formula>();
  let count = 0;

  /** A key new for this conversion, written in KEY_DIGITS. */
  const newKey = (formula: Formula) => {
    const hex = `${nonce}${(count++).toString(16)}`;
    const key = [...hex].map((d) => String.fromCharCode(KEY_BASE + parseInt(d, 16))).join("");
    formulas.set(key, formula);
    return key;
  };

  const convert = async (node: MathNode, transform?: string, opts?: unknown): Promise<string> => {
    const name = transform ?? node.getNodeName();
    const inline = name === "inline_quoted" ? node.type : undefined;
    if (inline === "latexmath" || inline === "asciimath") {
      const converted = node.text ?? "";
      const written = decode(converted);
      const source = `${inline}:[${written.replace(/\]/g, "\\]")}]`;
      const tex = inline === "asciimath" ? asciimathTex(written, source, false) : written;
      if (tex === undefined) return base.convert(node, transform, opts);
      const key = newKey({ tex, source, display: false });
      return `\uE000${key}\uE001${converted}\uE002${key}\uE003`;
    }
    const block = name === "stem" ? node.style : undefined;
    if (block === "latexmath" || block === "asciimath") {
      // Decoded whatever the block's substitutions, as the browser decoded it for MathJax before; and
      // without the `\[...\]` (or, for asciimath, `\$...\$`) an author may have written around it,
      // which Asciidoctor does not add a second time. One pair around the whole: `\[a\] + \[b\]` is
      // two formulas, which KaTeX reports.
      let written = decode((await node.content?.()) ?? "");
      const delimited =
        block === "latexmath"
          ? /^\s*\\\[([\s\S]*)\\\]\s*$/.exec(written)
          : /^\s*\\\$([\s\S]*)\\\$\s*$/.exec(written);
      const inner = block === "latexmath" ? /\\[[\]]/ : /\\\$/;
      if (delimited && !inner.test(delimited[1]!)) written = delimited[1]!;
      const source = `[${block}]\n++++\n${written}\n++++`;
      const tex = block === "asciimath" ? asciimathTex(written, source, true) : written;
      if (tex === undefined) return base.convert(node, transform, opts);
      const formula: Formula = { tex, source, display: true };
      const key = newKey(formula);
      const id = node.id ? ` id="${attribute(node.id)}"` : "";
      const role = node.role ? ` ${attribute(node.role)}` : "";
      const title = node.hasTitle?.() ? `<div class="title">${node.title}</div>\n` : "";
      // A block is not in a title, so a tag marks it; its content is checked when it is read back.
      // Asciidoctor's own block is kept, to write back wherever the marker cannot become a formula.
      const ours =
        `<div${id} class="stemblock${role}">\n${title}` +
        `<div data-monodocs-math="${key}">${text(tex)}</div>\n</div>`;
      const asciidoctor = await base.convert(node, transform, opts);
      formula.block = {
        ours,
        asciidoctor,
        oursDecoded: decode(ours),
        asciidoctorDecoded: decode(asciidoctor),
      };
      return ours;
    }
    return base.convert(node, transform, opts);
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

  const placeholder = (formula: Formula): Element => ({
    type: "element",
    tagName: formula.display ? "div" : "span",
    properties: {
      className: ["math", formula.display ? "math-display" : "math-inline"],
      dataMathSource: formula.source,
      dataMathTex: formula.tex,
    },
    children: [{ type: "text", value: formula.tex }],
    data: { monodocsMath: true } as Element["data"],
  });

  /** A text with its markers made formulas, or `undefined` when it holds none. */
  const splitText = (value: string): ElementContent[] | undefined => {
    if (!value.includes(OPEN) && !value.includes("\uE002")) return undefined;
    const out: ElementContent[] = [];
    let at = 0;
    const pushText = (s: string) => {
      const restored = restore(s);
      if (restored) out.push({ type: "text", value: restored });
    };
    for (const m of value.matchAll(INLINE)) {
      const formula = formulas.get(m[1]!);
      if (!formula) continue;
      pushText(value.slice(at, m.index));
      out.push(placeholder(formula));
      at = m.index! + m[0].length;
    }
    pushText(value.slice(at));
    return out;
  };

  /**
   * A string with every marker this converter wrote written back as Asciidoctor writes the formula:
   * a whole one as `\(` and `\)` around its text, as it stands (an attribute's value or a comment is
   * already decoded); an end left alone, because the HTML around it broke the marker apart, as `\(` or
   * `\)`, and the formula reported. Anything else is left as written.
   */
  const restore = (value: string): string => {
    if (!value.includes(OPEN) && !value.includes("\uE002") && !/[\uE010-\uE01F]/.test(value)) {
      return value;
    }
    // A display formula's block in text (a textarea, a script): as Asciidoctor writes it, as it stands
    // in a script or a style, or with its references decoded as a textarea or a title reads them. Only
    // the blocks whose keys the text holds are looked at.
    const replacements = new Map<string, string>();
    for (const m of value.matchAll(BLOCK_KEY)) {
      const block = formulas.get(m[1]!)?.block;
      if (!block) continue;
      replacements.set(block.ours, block.asciidoctor);
      replacements.set(block.oursDecoded, block.asciidoctorDecoded);
    }
    if (replacements.size > 0) {
      // One pass over the text, however many blocks it holds.
      const pattern = new RegExp(
        [...replacements.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "g",
      );
      value = value.replace(pattern, (found) => replacements.get(found) ?? found);
    }
    return value
      .replace(INLINE, (whole, key: string, converted: string) =>
        formulas.has(key) ? `\\(${converted}\\)` : whole,
      )
      .replace(END, (whole, open: string | undefined, close: string | undefined) => {
        const formula = formulas.get(open ?? close!);
        if (!formula) return whole;
        if (!broken.includes(formula.source)) broken.push(formula.source);
        return open !== undefined ? "\\(" : "\\)";
      });
  };

  /** Every marker in a tree written back: its texts, comments, and properties, templates included. */
  const restoreAll = (tree: HastRoot | Element) => {
    visit(tree, (node) => {
      if (node.type === "text" || node.type === "comment") node.value = restore(node.value);
      else if (node.type === "element") {
        const element = node as Element;
        // A display formula's marker, written back as Asciidoctor writes the block's content.
        const key = element.properties.dataMonodocsMath;
        const formula = typeof key === "string" ? formulas.get(key) : undefined;
        if (formula?.block) {
          // The content Asciidoctor writes in the block, taken from its own output.
          const own = fromHtml(formula.block.asciidoctor, { fragment: true });
          let content: Element | undefined;
          visit(own, "element", (candidate: Element) => {
            const className = candidate.properties.className;
            if (Array.isArray(className) && className.includes("content")) {
              content = candidate;
              return SKIP;
            }
          });
          if (content)
            Object.assign(element, { properties: content.properties, children: content.children });
          return SKIP;
        }
        restoreProperties(node as Element);
        if ((node as Element).tagName === "template" && (node as Element).content) {
          restoreAll((node as Element).content!);
        }
      }
    });
  };

  /** Every string an element carries, in its properties' names and values, written back. */
  const restoreProperties = (element: Element) => {
    const restored: Element["properties"] = {};
    for (const [name, value] of Object.entries(element.properties)) {
      // A block marker's own key is read where the block is made a formula, not written back.
      if (name === "dataMonodocsMath" && typeof value === "string" && formulas.get(value)?.block) {
        restored[name] = value;
        continue;
      }
      restored[restore(name)] = Array.isArray(value)
        ? value.map((v) => (typeof v === "string" ? restore(v) : v))
        : typeof value === "string"
          ? restore(value)
          : value;
    }
    element.properties = restored;
  };

  return {
    converter,
    broken,
    failed,
    markFormulas(tree) {
      visit(tree, (node, index, parent) => {
        if (node.type === "text" && parent && index !== undefined) {
          // Where no element can go (a script, a style, a textarea, a title), the marker is written
          // back instead, as Asciidoctor writes the formula there.
          if (parent.type === "element" && RAW_TEXT.has((parent as Element).tagName)) {
            (node as Text).value = restore((node as Text).value);
            return;
          }
          const split = splitText((node as Text).value);
          if (!split) return;
          parent.children.splice(index, 1, ...(split as typeof parent.children));
          return [SKIP, index + split.length];
        }
        if (node.type === "comment") {
          node.value = restore(node.value);
          return;
        }
        if (node.type !== "element") return;
        const element = node as Element;
        // A template's content is not part of the page as it is shown, nor walked by what renders a
        // formula: its markers are written back.
        if (element.tagName === "template" && element.content) restoreAll(element.content);
        // A marker can sit in an attribute too (an image's alt text, a link's title, or anywhere a
        // passthrough put one): written back as Asciidoctor writes the formula there.
        restoreProperties(element);
        const key = element.properties.dataMonodocsMath;
        const formula = typeof key === "string" ? formulas.get(key) : undefined;
        if (!formula) return;
        // Only a block marker as the converter wrote it: a div holding the formula's text alone. One a
        // passthrough's malformed tag swallowed is left as it is.
        if (element.tagName !== "div" || textOf(element) !== formula.tex) {
          delete element.properties.dataMonodocsMath;
          return;
        }
        Object.assign(element, placeholder(formula));
        // Asciidoctor's HTML has no lines of the source to point at.
        delete element.position;
        return SKIP;
      });
    },
    titleText(html) {
      if (!html.includes(OPEN) && !html.includes("\uE002")) return html;
      return restore(
        html.replace(INLINE, (whole, key: string) => {
          const formula = formulas.get(key);
          return formula ? `$${text(formula.tex)}$` : whole;
        }),
      );
    },
  };
}

function textOf(node: Element): string {
  return node.children
    .map((c) => (c.type === "text" ? c.value : c.type === "element" ? textOf(c) : ""))
    .join("");
}

function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attribute(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}

/**
 * Character references decoded once, by the HTML parser the formulas are read with later, so that the
 * two agree on every reference (`&#128;` is `€`, as HTML has it); a raw `<` stays a character.
 */
function decode(value: string): string {
  return parsedText(value.replace(/</g, "&lt;"));
}

/** The text an HTML fragment parses to. */
function parsedText(html: string): string {
  const tree = fromHtml(html, { fragment: true });
  const walk = (node: { type: string; value?: string; children?: unknown[] }): string =>
    node.type === "text"
      ? (node.value ?? "")
      : (node.children ?? []).map((c) => walk(c as typeof node)).join("");
  return walk(tree);
}
