import { randomUUID } from "node:crypto";
import { ConverterFactory } from "@asciidoctor/core";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import type { Element, Root as HastRoot } from "hast";
import { SKIP, visit } from "unist-util-visit";

/**
 * AsciiDoc math (roadmap 6.4): Asciidoctor's own markup — `latexmath:[...]`, the `[latexmath]` block,
 * and `stem:[...]` and the `[stem]` block when they mean latexmath — rendered as Markdown's formulas
 * are.
 *
 * The converter's output for a formula is replaced, inside Asciidoctor's conversion, by a marker
 * element whose text is the formula's TeX as Asciidoctor gives it, already escaped. Asciidoctor makes a
 * section's ID from its converted title, so a formula in a heading gives the ID it gave before. The
 * markers are made formulas once the HTML is parsed; raw HTML from a passthrough cannot pass for one,
 * since a marker carries a token that is new for each conversion. asciimath is left to Asciidoctor,
 * whose output stays as it was, and is only noted, to be reported.
 */

/** What a conversion with the math converter found. */
export interface AsciidocMath {
  /** The converter to hand Asciidoctor (as `_preCreatedConverter`, so that titles use it too). */
  converter: object;
  /** asciimath formulas, as written, which are not rendered. */
  asciimath: string[];
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
  subs?: string[];
}

interface Converter {
  convert(node: MathNode, transform?: string, opts?: unknown): Promise<string>;
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
  const nonce = randomUUID();
  const asciimath: string[] = [];
  // What each marker stands for, kept here rather than read back from the HTML: a passthrough's
  // unclosed tag can swallow a marker's attributes, but not this.
  const formulas = new Map<
    string,
    { tex: string; source: string; display: boolean; shown: string }
  >();

  /**
   * A marker for a formula. Its content is what Asciidoctor converted the formula's text to, exactly,
   * since Asciidoctor makes a section's ID from that (`latexmath:a[&#945;]` keeps the reference, which
   * the ID leaves out); what the formula is for rendering is kept apart.
   */
  const marker = (tex: string, source: string, display: boolean, converted: string) => {
    const key = `${nonce}-${formulas.size}`;
    // What the element will hold once the HTML is parsed, read by the same parser.
    formulas.set(key, { tex, source, display, shown: parsedText(converted) });
    const tag = display ? "div" : "span";
    return `<${tag} data-monodocs-math="${key}">${converted}</${tag}>`;
  };

  const convert = async (node: MathNode, transform?: string, opts?: unknown): Promise<string> => {
    const name = transform ?? node.getNodeName();
    if (name === "inline_quoted" && node.type === "latexmath") {
      const tex = decode(node.text ?? "");
      return marker(tex, `latexmath:[${tex.replace(/\]/g, "\\]")}]`, false, node.text ?? "");
    }
    if (name === "inline_quoted" && node.type === "asciimath") {
      asciimath.push(`asciimath:[${decode(node.text ?? "")}]`);
    }
    if (name === "stem" && node.style === "latexmath") {
      // Decoded whatever the block's substitutions, as the browser decoded it for MathJax before; and
      // without the `\\[...\\]` an author may have written around it, which Asciidoctor does not add
      // a second time.
      let tex = decode((await node.content?.()) ?? "");
      // One pair around the whole; `\\[a\\] + \\[b\\]` is two formulas, which KaTeX reports.
      const delimited = /^\s*\\\[([\s\S]*)\\\]\s*$/.exec(tex);
      if (delimited && !/\\[[\]]/.test(delimited[1]!)) tex = delimited[1]!;
      const id = node.id ? ` id="${attribute(node.id)}"` : "";
      const role = node.role ? ` ${attribute(node.role)}` : "";
      const title = node.hasTitle?.() ? `<div class="title">${node.title}</div>\n` : "";
      return (
        `<div${id} class="stemblock${role}">\n${title}` +
        marker(tex, `[latexmath]\n++++\n${tex}\n++++`, true, text(tex)) +
        "\n</div>"
      );
    }
    if (name === "stem" && node.style === "asciimath") {
      asciimath.push(`[asciimath]\n++++\n${decode((await node.content?.()) ?? "")}\n++++`);
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

  return {
    converter,
    asciimath,
    markFormulas(tree) {
      visit(tree, "element", (node: Element) => {
        const key = node.properties.dataMonodocsMath;
        const formula = typeof key === "string" ? formulas.get(key) : undefined;
        // Only a marker as the converter wrote it: an element whose tag matches and which holds the
        // marker's text alone. One a passthrough's malformed tag swallowed is left as it is.
        const tag = formula?.display ? "div" : "span";
        const holdsText = formula !== undefined && textOf(node) === formula.shown;
        if (!formula || node.tagName !== tag || !holdsText) return;
        // A marker can appear more than once (a section title repeated in a TOC); each is made the same.
        node.tagName = formula.display ? "div" : "span";
        node.properties = {
          className: ["math", formula.display ? "math-display" : "math-inline"],
          dataMathSource: formula.source,
          dataMathTex: formula.tex,
        };
        node.children = [{ type: "text", value: formula.tex }];
        node.data = { ...node.data, monodocsMath: true } as Element["data"];
        // Asciidoctor's HTML has no lines of the source to point at.
        delete node.position;
      });
    },
    titleText(html) {
      if (!html.includes(nonce)) return html;
      // Parsed rather than matched: a formula with its own substitutions can hold a raw `<` or tags.
      const tree = fromHtml(html, { fragment: true });
      visit(tree, "element", (node: Element, index, parent) => {
        const key = node.properties.dataMonodocsMath;
        const formula = typeof key === "string" ? formulas.get(key) : undefined;
        if (!formula || !parent || index === undefined) return;
        parent.children[index] = { type: "text", value: `$${formula.tex}$` };
        return SKIP;
      });
      return toHtml(tree, { characterReferences: { useNamedReferences: true } });
    },
  };
}

function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attribute(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}

function textOf(node: Element): string {
  return node.children
    .map((c) => (c.type === "text" ? c.value : c.type === "element" ? textOf(c) : ""))
    .join("");
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
