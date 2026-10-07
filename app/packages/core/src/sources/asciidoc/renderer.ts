import { dirname } from "node:path";
import { convert, load, type Document, type Section } from "@asciidoctor/core";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import type { Root as HastRoot } from "hast";
import type {
  Heading,
  PageFormula,
  PageMeta,
  RenderContext,
  RenderedContent,
  SourceFile,
  SourceRenderer,
} from "../../types.js";
import { MonodocsError } from "../../diagnostics.js";
import { t } from "../../messages.js";
import { toPageMeta } from "../meta.js";
import { joinSegmentBreaks, type LineBreak } from "../lineBreak.js";
import { prefixIdsAndCollect } from "../prefixIds.js";
import { rehypeRenderMath, type MathProblem } from "../mathRender.js";
import { createMathConverter, type AsciidocMath } from "./math.js";
import {
  createIncludeBoundary,
  rethrowIncludeViolation,
  type IncludeViolation,
} from "./includeBoundary.js";

/**
 * Asciidoctor の変換オプションを生成する。
 *
 * - `safe` モードで include をドキュメントのディレクトリ配下に jail する
 *   （`base_dir` を入力ファイルのディレクトリにすることで相対 include を正しく解決し、
 *   外部へのアクセスを防ぐ）。
 * - `standalone:false` で本文のみ、`showtitle` で `= Title` を h1 として出力する。
 *
 * 注意: 変換後 HTML はそのまま埋め込むため、入力は信頼できるドキュメントを前提とする
 * （AsciiDoc は passthrough で生 HTML を出力できる）。
 */
function buildOptions(
  source: SourceFile,
  attributes: Readonly<Record<string, string>>,
  registry: unknown,
  math?: AsciidocMath,
): Record<string, unknown> {
  return {
    // Asciidoctor's own hook for a converter made beforehand, used here so that the formulas in a
    // section title, which Asciidoctor converts while it loads the document (to make the section's ID),
    // go through the math converter too. Not in Asciidoctor's public API; a test pins it.
    ...(math === undefined ? {} : { _preCreatedConverter: math.converter }),
    safe: "safe",
    standalone: false,
    base_dir: dirname(source.absolutePath),
    // 設定由来の属性が先。monodocs 自身が必要とするものは後に置いて上書きされないようにする。
    // 値はすべて `@` 付き（soft set）で届くので、文書が自分で指定すればそちらが勝つ（17.5）。
    attributes: { ...attributes, showtitle: true },
    // include の読み取り先がルートの外へ解決されないことを、Asciidoctor が読む直前に確かめる（17.5）。
    ...(registry === undefined ? {} : { extension_registry: registry }),
  };
}

/**
 * 設定で解決済みの AsciiDoc 属性を束ねた SourceRenderer を作る。
 *
 * A factory rather than a module constant, because the attributes come from the configuration and a
 * renderer has no other way to reach it: `extractMeta` takes only a source, so there is nowhere to
 * hand them in per call. `asciidocRenderer` below is this with nothing configured, which is what a
 * caller reaching core directly gets.
 */
export function createAsciidocRenderer(
  configured: Readonly<Record<string, string>> = {},
  rootDir?: string,
  options: {
    lineBreak?: LineBreak;
    /**
     * `numbering.sections` is on (19.1), so a file numbering its own sections with `:sectnums:` is
     * refused: two schemes over one document give one heading two numbers.
     */
    refuseSectnums?: boolean;
    /** Render latexmath (`math.enabled`, roadmap 6.4). On unless turned off. */
    math?: boolean;
  } = {},
): SourceRenderer {
  const lineBreak = options.lineBreak ?? "space";
  // `break` is Asciidoctor's own hard-break mode, set soft (`@`) like every attribute monodocs
  // passes, so a document that writes `:hardbreaks-option!:` still wins (17.5). Measured with
  // @asciidoctor/core 4.1: passed as "" the attribute overrides that line, passed as "@" it does not.
  const attributes =
    lineBreak === "break" ? { "hardbreaks-option": "@", ...configured } : configured;
  // ルートを知らされていない呼び出し（core を直接使う場合）は境界を張らない。判定の基準が無い。
  const htmlsyntax = attributes.htmlsyntax?.replace(/@$/, "");
  const mathFor = () =>
    (options.math ?? true) ? createMathConverter({ htmlsyntax }) : Promise.resolve(undefined);
  const boundaryFor = (source: SourceFile) =>
    rootDir === undefined ? undefined : createIncludeBoundary(rootDir, source.relativePath);

  return {
    format: "asciidoc",
    extensions: [".adoc", ".asciidoc", ".asc"],

    async extractMeta(source: SourceFile): Promise<PageMeta> {
      const boundary = boundaryFor(source);
      const math = await mathFor();
      const doc = await withBoundary(boundary, source, () =>
        load(source.raw, buildOptions(source, attributes, boundary?.registry, math)),
      );
      if (options.refuseSectnums) refuseNumberedSections(doc, source);
      const rawTitle = doc.getDocumentTitle();
      const docTitle =
        typeof rawTitle === "string" ? (math ? math.titleText(rawTitle) : rawTitle) : undefined;

      // `:sd-*:` 属性をメタデータとして読む（タイトル優先順位: sd-title > = Title）。
      return toPageMeta(
        {
          title: doc.getAttribute("sd-title"),
          order: doc.getAttribute("sd-order"),
          hidden: doc.getAttribute("sd-hidden"),
          description: doc.getAttribute("sd-description"),
          aliases: doc.getAttribute("sd-aliases"),
        },
        docTitle,
      );
    },

    async render(source: SourceFile, context: RenderContext): Promise<RenderedContent> {
      const boundary = boundaryFor(source);
      const math = await mathFor();
      const rawHtml = (await withBoundary(boundary, source, () =>
        convert(source.raw, buildOptions(source, attributes, boundary?.registry, math)),
      )) as string;
      const problems: MathProblem[] = [];

      const out = {
        headings: [] as Heading[],
        formulas: [] as PageFormula[],
        text: "",
        anchors: [] as string[],
      };

      // 全要素 ID を page id で prefix し、同一文書内アンカーを追従させる
      // （見出し・xref・脚注などの単一 HTML 内 ID 衝突を回避）。Markdown と共通処理。
      const file = await unified()
        .use(rehypeParse, { fragment: true })
        .use(math ? [() => (tree: HastRoot) => math.markFormulas(tree)] : [])
        .use(lineBreak === "join" ? [() => joinSegmentBreaks] : [])
        .use(math ? [() => rehypeRenderMath((problem) => problems.push(problem))] : [])
        .use(() => (tree: HastRoot) => {
          const result = prefixIdsAndCollect(tree, context.page.id);
          out.headings = result.headings;
          out.text = result.text;
          out.anchors = result.anchors;
          out.formulas = result.formulas;
        })
        .use(rehypeStringify)
        .process(rawHtml);

      return {
        html: String(file),
        text: out.text,
        headings: out.headings,
        anchors: out.anchors,
        formulas: out.formulas,
        links: [],
        assets: [],
        // A formula in a section title is converted again for each copy (a TOC entry, an xref's
        // text), and reported once.
        math: unique([
          ...problems,
          ...(math?.asciimath ?? []).map((formula): MathProblem => ({
            kind: "asciimath",
            source: formula,
          })),
          ...(math?.broken ?? []).map((formula): MathProblem => ({
            kind: "broken",
            source: formula,
          })),
        ]),
      };
    },
  };
}

/**
 * Refuse a document in which Asciidoctor numbered a section.
 *
 * Asked of the sections rather than of the `sectnums` attribute: an attribute entry can turn
 * numbering on above one section and off again before the end, which leaves the attribute unset
 * on the loaded document while that section still carries a number. Measured with
 * @asciidoctor/core 4.1. A `[discrete]` heading is not a section and is never numbered, so it
 * cannot trip this. The same check catches `sectnums` set in `sources.asciidoc.attributes`.
 *
 * An `[appendix]` section is left out: Asciidoctor numbers it with a letter whether or not
 * `sectnums` is set (measured: "Appendix A: Extra", or "A. Extra" without the caption), so it says
 * nothing about `sectnums`. Under `numbering.sections` it is counted as any other section. A book's
 * part is left out for the same reason: `:partnums:` labels it "I: First Part" without `sectnums`,
 * and a part is a level-0 heading, which `numbering.sections` does not number.
 */
function refuseNumberedSections(doc: Document, source: SourceFile): void {
  if (!numbersSections(doc)) return;
  throw new MonodocsError(
    "numbering/sectnums",
    t("asciidoc.sectnumsWithNumbering", { path: source.relativePath }),
    { path: source.relativePath },
  );
}

/**
 * Whether Asciidoctor numbered a section of `doc`, or of a document nested in one of its `a|`
 * table cells. `findBy` does not enter those, and in @asciidoctor/core 4.1 neither does its
 * `traverseDocuments` option (measured), so each cell's inner document is searched in turn —
 * a `:sectnums:` set inside a cell numbers that cell's sections and nothing outside it.
 */
/** Sections Asciidoctor labels by a scheme of their own rather than by `sectnums`. */
const LABELLED_APART = new Set(["appendix", "part"]);

function numbersSections(doc: Document): boolean {
  const numbered = doc.findBy({ context: "section" }).some((block) => {
    const section = block as Section;
    return section.isNumbered() && !LABELLED_APART.has(section.getSectionName() ?? "");
  });
  if (numbered) return true;
  return doc.findBy({ context: "table_cell" }).some((cell) => {
    // A table cell; its class is not exported from the package entry point.
    const inner = (cell as unknown as { getInnerDocument(): Document | null }).getInnerDocument();
    return inner !== null && numbersSections(inner);
  });
}

/**
 * Asciidoctor を走らせ、include の境界違反があれば monodocs のエラーに変えて投げ直す。
 *
 * The boundary throws from inside `handles`, and Asciidoctor wraps that in a failure of its own, so
 * what the caller would otherwise see is "Failed to load AsciiDoc document" with monodocs' message
 * buried in it. The violation is read back from the boundary instead of parsed out of the text.
 */
async function withBoundary<T>(
  boundary: { takeViolation(): IncludeViolation | undefined } | undefined,
  source: SourceFile,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    rethrowIncludeViolation(boundary?.takeViolation(), source.relativePath);
    throw error;
  }
}

function unique(problems: MathProblem[]): MathProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const key = JSON.stringify(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 設定を持たない既定の AsciiDoc renderer（core を直接使う呼び出し側向け）。 */
export const asciidocRenderer: SourceRenderer = createAsciidocRenderer();
