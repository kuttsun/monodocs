import { dirname } from "node:path";
import { load, LoggerManager, NullLogger, type Document, type Section } from "@asciidoctor/core";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import type { Root as HastRoot } from "hast";
import type {
  GeneratedNumbering,
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
import { markChecklists, normalizeChecklistBoxes } from "./checklist.js";
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
    /** Called with every file `include::` reads and its content, before Asciidoctor reads it. */
    checkInclude?: (path: string, content: Buffer) => void;
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
    rootDir === undefined
      ? undefined
      : createIncludeBoundary(rootDir, source.relativePath, options.checkInclude);

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
      let numbering: GeneratedNumbering | undefined;
      const rawHtml = await withBoundary(boundary, source, async () => {
        const doc = await load(
          source.raw,
          buildOptions(source, attributes, boundary?.registry, math),
        );
        markChecklists(doc);
        const html = await doc.convert();
        numbering = numberingOf(doc);
        return html;
      });
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
        .use(() => normalizeChecklistBoxes)
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
        ...(numbering === undefined ? {} : { numbering }),
        // A formula in a section title is converted again for each copy (a TOC entry, an xref's
        // text), and reported once.
        math: unique([
          ...problems,
          ...(math?.broken ?? []).map((formula): MathProblem => ({
            kind: "broken",
            source: formula,
          })),
          ...(math?.failed ?? []).map(({ source, detail }): MathProblem => ({
            kind: "parse",
            source,
            detail,
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
  boundary:
    { takeViolation(): IncludeViolation | undefined; takeRefusal(): Error | undefined } | undefined,
  source: SourceFile,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    rethrowIncludeViolation(boundary?.takeViolation(), source.relativePath);
    // A check on an included file throws inside Asciidoctor, which wraps it; the original is kept.
    const refused = boundary?.takeRefusal();
    if (refused !== undefined) throw refused;
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

/**
 * Run `run` with Asciidoctor's own log silenced, and restore it after. The earlier version's build
 * (roadmap 7.3.2) reports no warnings, and Asciidoctor writes its own straight to the terminal — a
 * missing include, a duplicate ID — past the diagnostics monodocs discards. The logger is global,
 * so this suits only a build that runs alone, as the earlier one does between the new one's steps.
 */
export async function withoutAsciidoctorLog<T>(run: () => Promise<T>): Promise<T> {
  const logger = LoggerManager.getLogger();
  LoggerManager.setLogger(NullLogger.create());
  try {
    return await run();
  } finally {
    LoggerManager.setLogger(logger);
  }
}

/** The block kinds Asciidoctor captions with a number, by the context it gives them. */
const CAPTIONED: Record<string, keyof GeneratedNumbering["captions"]> = {
  image: "figure",
  table: "table",
  example: "example",
  listing: "listing",
};

/**
 * The numbers Asciidoctor generated, read from the document's model after conversion (roadmap
 * 7.3.2), built as its HTML converter writes them: a section's caption when it has one
 * (`Appendix A: `), else, when it is numbered within `sectnumlevels`, its number — after the
 * chapter or part signifier in a book. A cross-reference to it reads `{name}-refsig` and the
 * number, or the number alone where the document set no signifier.
 */
function numberingOf(doc: Document): GeneratedNumbering {
  type Node = {
    getContext(): string;
    getId?(): unknown;
    getCaption?(): unknown;
    isNumbered?(): boolean;
    getSectionNumeral?(): unknown;
    sectnum?(delimiter?: string, append?: string): unknown;
    getSectionName?(): unknown;
    getLevel?(): number;
    /** The number Asciidoctor gave a captioned block; null where the author wrote the caption. */
    numeral?: unknown;
    rows?: Record<
      "head" | "body" | "foot",
      { getStyle?(): unknown; getInnerDocument?(): unknown }[][]
    >;
  };
  const attribute = (name: string): string | undefined => {
    const value = doc.getAttribute(name) as unknown;
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
  const book = attribute("doctype") === "book";
  const sectnumlevels = Number(attribute("sectnumlevels") ?? 3);
  const targets: GeneratedNumbering["targets"] = {};
  const unidentified: GeneratedNumbering["unidentified"] = [];
  const captions: GeneratedNumbering["captions"] = {};

  const visitNode = (node: Node) => {
    const id = text(node.getId?.());
    const context = node.getContext();
    if (context === "section") {
      const name = text(node.getSectionName?.());
      if (name === "header") return;
      const level = node.getLevel?.() ?? 1;
      const caption = text(node.getCaption?.());
      // Truthy rather than true: a book's special sections under `:sectnums: all` answer "chapter".
      // A cross-reference writes the number at any depth; the heading only within `sectnumlevels`.
      const numbered = Boolean(node.isNumbered?.()) ? text(node.getSectionNumeral?.()) : undefined;
      const numeral = level <= sectnumlevels ? numbered : undefined;
      let heading: string | undefined;
      if (caption !== undefined) heading = caption;
      else if (numeral !== undefined) {
        const signifier = book && level <= 1 ? attribute(`${name}-signifier`) : undefined;
        const number =
          book && name === "part" ? (text(node.sectnum?.(undefined, ":")) ?? numeral) : numeral;
        heading = `${signifier === undefined ? "" : `${signifier} `}${number} `;
      }
      // A section without an ID is found by its place among the others without one.
      if (id === undefined) return void unidentified.push(heading ?? null);
      // Every section with an ID is a target, numbered or not, so its ID is known to be
      // Asciidoctor's and not one monodocs gave a heading without one.
      const refsig = attribute(`${name}-refsig`);
      const bare = (numbered ?? heading)?.replace(/[.:]\s*$/, "").replace(/^.* /, "");
      const reference =
        bare === undefined ? undefined : refsig === undefined ? bare : `${refsig} ${bare}`;
      targets[id] = {
        ...(heading === undefined ? {} : { heading }),
        references: [heading, reference].filter((r): r is string => r !== undefined),
      };
      return;
    }
    const kind = CAPTIONED[context];
    const caption = text(node.getCaption?.());
    // A caption the author set is theirs: Asciidoctor gives it no number.
    if (
      kind === undefined ||
      caption === undefined ||
      node.numeral === null ||
      node.numeral === undefined
    )
      return;
    (captions[kind] ??= []).push(caption);
    if (id !== undefined) {
      // A cross-reference to a captioned block reads as its caption without the full stop.
      targets[id] = { references: [caption.replace(/[.:]\s*$/, "").trim()] };
    }
  };
  // `findBy` does not enter a table cell's own document (`a|`), whose blocks share the document's
  // counters, so each such cell is walked as a document of its own.
  const walk = (document: { findBy(selector: object): unknown }) => {
    for (const node of document.findBy({}) as Node[]) {
      visitNode(node);
      if (node.getContext() !== "table" || node.rows === undefined) continue;
      for (const part of ["head", "body", "foot"] as const) {
        for (const row of node.rows[part] ?? []) {
          for (const cell of row) {
            if (cell.getStyle?.() !== "asciidoc") continue;
            const inner = cell.getInnerDocument?.() as
              { findBy(selector: object): unknown } | undefined;
            if (inner !== undefined) walk(inner);
          }
        }
      }
    }
  };
  walk(doc as unknown as { findBy(selector: object): unknown });
  return { targets, unidentified, captions };
}

/** 設定を持たない既定の AsciiDoc renderer（core を直接使う呼び出し側向け）。 */
export const asciidocRenderer: SourceRenderer = createAsciidocRenderer();
