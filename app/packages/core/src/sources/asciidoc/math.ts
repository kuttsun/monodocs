import { randomUUID } from "node:crypto";
import { ConverterFactory } from "@asciidoctor/core";
import type { Element, Root as HastRoot } from "hast";
import { visit } from "unist-util-visit";

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
export async function createMathConverter(): Promise<AsciidocMath> {
  const base = (await (
    ConverterFactory as unknown as { create(backend: string, opts: object): Promise<Converter> }
  ).create("html5", {})) as Converter & object;
  const nonce = randomUUID();
  const asciimath: string[] = [];

  const marker = (tex: string, source: string, display: boolean) =>
    `<${display ? "div" : "span"} class="math ${display ? "math-display" : "math-inline"}"` +
    ` data-math-source="${attribute(source)}" data-math-tex="${attribute(tex)}"` +
    ` data-monodocs-math="${nonce}">${text(tex)}</${display ? "div" : "span"}>`;

  const convert = async (node: MathNode, transform?: string, opts?: unknown): Promise<string> => {
    const name = transform ?? node.getNodeName();
    if (name === "inline_quoted" && node.type === "latexmath") {
      const tex = decode(node.text ?? "");
      return marker(tex, `latexmath:[${tex.replace(/\]/g, "\\]")}]`, false);
    }
    if (name === "inline_quoted" && node.type === "asciimath") {
      asciimath.push(`asciimath:[${decode(node.text ?? "")}]`);
    }
    if (name === "stem" && node.style === "latexmath") {
      const content = (await node.content?.()) ?? "";
      // A passthrough block's content is raw; with special characters substituted, it is escaped.
      const tex = node.subs?.includes("specialcharacters") ? decode(content) : content;
      const id = node.id ? ` id="${attribute(node.id)}"` : "";
      const role = node.role ? ` ${attribute(node.role)}` : "";
      const title = node.hasTitle?.() ? `<div class="title">${node.title}</div>\n` : "";
      return (
        `<div${id} class="stemblock${role}">\n${title}` +
        marker(tex, `[latexmath]\n++++\n${tex}\n++++`, true) +
        "\n</div>"
      );
    }
    if (name === "stem" && node.style === "asciimath") {
      asciimath.push(`[asciimath]\n++++\n${(await node.content?.()) ?? ""}\n++++`);
    }
    return base.convert(node, transform, opts);
  };

  const converter = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "convert") return convert;
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
        if (node.properties.dataMonodocsMath !== nonce) return;
        delete node.properties.dataMonodocsMath;
        node.data = { ...node.data, monodocsMath: true } as Element["data"];
        // Asciidoctor's HTML has no lines of the source to point at.
        delete node.position;
      });
    },
    titleText(html) {
      const pattern = new RegExp(
        `<span class="math math-inline" data-math-source="[^"]*" data-math-tex="[^"]*" data-monodocs-math="${nonce}">([^<]*)</span>`,
        "g",
      );
      return html.replace(pattern, (_, tex: string) => `$${tex}$`);
    },
  };
}

function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attribute(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}

/** The character references Asciidoctor writes, decoded: what a formula's TeX is. */
function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
