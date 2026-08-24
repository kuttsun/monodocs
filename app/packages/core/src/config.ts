import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { type Diagnostic, MonodocsError, warn } from "./diagnostics.js";
import type { DocumentMetadata } from "./documentMeta.js";
import { z } from "zod";
import {
  DEFAULT_LANG,
  isValidLanguageTag,
  LABEL_KEYS,
  type LabelKey,
  type Labels,
} from "./labels.js";
import { t } from "./messages.js";
import { FONT_CHECK_MODES, type FontCheckMode } from "./pipeline/fontCheck.js";
import { DEFAULT_PDF_FOOTER, EMPTY_PDF_BAND, resolveBand } from "./pipeline/pdfBands.js";
import type {
  BuildOptions,
  OutputFormat,
  SidebarItem,
  SidebarTitleTransforms,
  TitleFrom,
} from "./types.js";

const DEFAULT_INPUT = "./docs";
const DEFAULT_TITLE = "Documentation";
const DEFAULT_MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const DEFAULT_ASCIIDOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc"];
/**
 * Paths that are never pages: include fragments and partials. A file whose name starts with `_` is
 * a fragment whatever its extension. `sources.exclude` adds to this list instead of replacing it,
 * so naming one unrelated path cannot quietly turn every fragment into a page.
 */
export const DEFAULT_EXCLUDE = ["_partials/**", "partials/**", "includes/**", "**/_*"];
/** The one file name a build looks for on its own. `init` writes this name for that reason. */
export const DEFAULT_CONFIG_FILE = "monodocs.config.yml";
const DEFAULT_MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_CONTENT_WIDTH = "860px";
// ページ内目次に出す見出しの最深レベル（h2〜h3）。h1 はページタイトル相当のため常に除外。
const DEFAULT_TOC_MAX_LEVEL = 3;
// PDF（v0.5）の既定値。pageSize は Puppeteer の `format` 値、margin は CSS 長さ。
const DEFAULT_PDF_PAGE_SIZE = "A4";
const DEFAULT_PDF_MARGIN = { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" };

/**
 * How tightly the printed page is set. The four values are what decide how many sheets a document
 * comes out as: type size, leading, the air around headings, and the padding inside table cells.
 * The named presets move all four together, because moving one alone rarely reads well: smaller
 * type with unchanged leading looks lost on the line.
 *
 * There is deliberately no measure (maximum text width) here. The width of the text column is what
 * `pdf.margin` decides, and a second cap would fight it — a reader who set 12mm margins to fit more
 * on the page would find the column stopping short of the margin they chose. Its right value also
 * differs by script, which makes it a poor thing to freeze into a preset.
 */
export type PdfDensity = {
  /** Root font size for print; every rem/em in the stylesheet follows it. */
  fontSize: string;
  /** Body line-height, unitless. */
  lineHeight: string;
  /** Space above headings (`margin-top`). */
  headingSpacing: string;
  /** Padding inside table cells, one or two lengths. */
  tableCellPadding: string;
};

/**
 * What the default theme sets for the screen, and the baseline the print rules are written against:
 * only what differs from these values is ever emitted. It is a record of the stylesheet rather than
 * a density anyone chooses, which is why it is kept apart from the presets below — the default
 * density is free to move without changing what "the same as on screen" means.
 *
 * `fontSize` is the one value the theme does not set. There is no `font-size` on the root at all, so
 * leaving it alone means inheriting whatever base size the reader's browser uses; 16px records what
 * that is in practice, so that a density which does not change the type size writes no rule for it.
 */
export const PDF_DENSITY_SCREEN = {
  fontSize: "16px",
  lineHeight: "1.7", // style.css: body
  headingSpacing: "1.8em", // style.css: #content h1, h2, h3
  tableCellPadding: "0.5rem 0.8rem", // style.css: #content th, td
} as const satisfies PdfDensity;

/**
 * The shipped densities, loosest first.
 *
 * The default is set for paper, not for a screen. A web stylesheet is generous with leading and with
 * the air above headings, and that generosity is most of what a printed page pays for: the same
 * document comes out on 49 sheets at `normal` where the screen values put it on 56, with the type
 * size untouched. Type size is the last lever rather than the first, because it is the one that also
 * lengthens the line — the measure is what `pdf.margin` leaves, so 16px inside the default margins
 * is around 42 Japanese characters, and dropping to 12px stretches that to 56 unless the margins
 * widen with it.
 *
 * `relaxed` is the screen setting under a name, for a document that is read on a screen and printed
 * only now and then. It is `PDF_DENSITY_SCREEN` itself, so asking for it emits nothing at all.
 */
export const PDF_DENSITY_PRESETS = {
  relaxed: PDF_DENSITY_SCREEN,
  normal: {
    fontSize: "16px",
    lineHeight: "1.45",
    headingSpacing: "0.9em",
    tableCellPadding: "0.35rem 0.6rem",
  },
  compact: {
    fontSize: "14px",
    lineHeight: "1.35",
    headingSpacing: "0.8em",
    tableCellPadding: "0.3rem 0.5rem",
  },
  tight: {
    fontSize: "12px",
    lineHeight: "1.3",
    headingSpacing: "0.6em",
    tableCellPadding: "0.2rem 0.35rem",
  },
} as const satisfies Record<string, PdfDensity>;

/**
 * `pdf.pageBreakLevel`: the deepest heading level that starts a new sheet, or `false` for none.
 *
 * Spelled out rather than `number` so that the public boundaries — the resolved configuration,
 * `PostprocessOptions`, `RenderHtmlInput` — carry what the schema validates. A caller reaching
 * core from TypeScript cannot hand them a 1 or a 7 that the configuration file could not.
 */
export type PdfPageBreakLevel = false | 2 | 3 | 4 | 5 | 6;

/** Names accepted by `pdf.density`, and by `base` inside its object form. Loosest first. */
export const PDF_DENSITY_NAMES = ["relaxed", "normal", "compact", "tight"] as const;
export type PdfDensityName = (typeof PDF_DENSITY_NAMES)[number];

/** `-o` / 設定の output.path が未指定のときの既定出力パス（format 別）。 */
function defaultOutputFor(format: OutputFormat): string {
  if (format === "pdf") return "./dist/docs.pdf";
  // both は `-o` をディレクトリ扱いにするため、既定はディレクトリ（./dist）。
  // build 側の resolveOutputs が docs.html / docs.pdf を生成する。
  if (format === "both") return "./dist";
  return "./dist/docs.html";
}

/** 画像の最大インラインサイズ超過時の挙動。 */
export type OnLargeImage = "warn" | "error" | "external";
/** Mermaid ランタイムの配給方法（client mode 専用）。 */
export type MermaidRuntime = "cdn" | "inline";
/**
 * Mermaid の描画方式。
 * `"client"`（既定）= ブラウザで mermaid ランタイムを実行（`runtime` で cdn/inline を選ぶ）。
 * `"pre-render"` = ビルド時にヘッドレスブラウザで各図を SVG 化して埋め込む
 * （JS 不要・印刷安定・図が少数なら inline より小さい。テーマはビルド時固定）。
 */
export type MermaidMode = "client" | "pre-render";
/**
 * ドキュメント表示時の初期配色。読者がトグルで切り替える前の既定値。
 * `"light"`（既定）/ `"dark"` は明示的にその配色で開く。`"auto"` は OS の
 * `prefers-color-scheme` に追従する。読者が一度切り替えると localStorage の
 * 選択が優先され、この初期値は無視される。`html.theme`（テンプレート名）とは別物。
 */
export type ColorScheme = "light" | "dark" | "auto";
/**
 * Initial state of the content-width toggle.
 * A reader's localStorage choice takes precedence after they use the toggle.
 */
export type ContentWidthDefault = "standard" | "wide";
/**
 * サイドバーの生成方式。`"folder"`（既定）はフォルダ構造から自動生成し、
 * `"custom"` は `sidebar.items` に書いた構造と順序をそのまま使う。
 */
export type SidebarMode = "folder" | "custom";

/**
 * スキーマは呼び出しのたびに組み立てる。モジュール定数のままだと、その中の `t()` が
 * 読み込み時＝CLI が言語を決める前に評価され、`--lang ja` を付けても英語のまま固定される。
 * loadConfig はビルド 1 回につき 1 度しか呼ばれないので、組み立て直す費用は無視できる。
 */
function buildConfigFileSchema() {
  const regexTitleTransformSchema = z
    .object({
      type: z.literal("regex"),
      pattern: z.string().min(1),
      replacement: z.string(),
      flags: z.string().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      try {
        new RegExp(value.pattern, value.flags);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("config.invalidRegexTransform", { detail: (error as Error).message }),
        });
      }
    });

  const titleTransformSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }).strict(),
    z.object({ type: z.literal("stripNumberPrefix") }).strict(),
    regexTitleTransformSchema,
  ]);

  const sidebarTitleTransformSchema = z
    .object({
      page: titleTransformSchema.optional(),
      directory: titleTransformSchema.optional(),
    })
    .strict();

  /**
   * `sidebar.mode: "custom"` の 1 項目。`path`（ページ）か `children`（グループ）の
   * どちらか一方を持つ。ページは省略時にページ自身のタイトルを使うため `title` を省略でき、
   * グループは導出元が無いため `title` が必須。
   */
  const sidebarItemSchema: z.ZodType<SidebarItem> = z.lazy(() =>
    z
      .object({
        title: z.string().min(1).optional(),
        path: z.string().min(1).optional(),
        children: z.array(sidebarItemSchema).min(1).optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        const hasPath = value.path !== undefined;
        const hasChildren = value.children !== undefined;
        if (hasPath && hasChildren) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("config.sidebarItemBothPathAndChildren"),
          });
        }
        if (!hasPath && !hasChildren) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("config.sidebarItemNeedsPathOrChildren"),
          });
        }
        if (hasChildren && value.title === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("config.sidebarItemChildrenNeedTitle"),
          });
        }
      }),
  );

  /**
   * `html.labels` のスキーマ。**未知のキーは拒否する**。タイプミスが黙って既定のまま残ると、
   * 書いたのに効かないという最も気づきにくい失敗になる。その帰結としてキー集合は
   * 1.0 で凍結される公開 API になり、設定リファレンスに列挙される（labels.ts の LABEL_KEYS）。
   */
  const labelsSchema = z
    .object(
      Object.fromEntries(LABEL_KEYS.map((key) => [key, z.string().min(1).optional()])) as Record<
        LabelKey,
        z.ZodOptional<z.ZodString>
      >,
    )
    .strict();

  /**
   * The `monodocs.config.yml` schema. **Every object in it rejects unknown keys**, top level
   * included. A key that is accepted and ignored is worse than one that is refused: the file
   * looks right, and only the output says otherwise. The depth a key sits at is not a reason
   * for it to be checked differently.
   */
  const configFileSchema = z
    .object({
      title: z.string().optional(),
      /**
       * 生成した文書の言語。`<html lang>` を埋め、UI ラベルの表を選ぶ（既定 "en"）。
       * 同梱の表が無いタグも属性には書き、ラベルだけ en へ落とす。CLI 自身のメッセージの
       * 言語とは別物（文書はある言語で書かれ、書いている人の端末は別の言語を返しうる）。
       */
      lang: z
        .string()
        .min(1)
        .refine(isValidLanguageTag, { message: t("config.invalidLanguageTag") })
        .optional(),
      /**
       * ビルドを走らせているマシンに、文書が必要とするフォントが無いときの挙動
       * （warn 既定 / error / off）。PDF 出力と mermaid pre-render の両方を覆うため
       * `pdf.fontCheck` ではなくトップレベルに置く（24.3.3）。
       */
      fontCheck: z.enum(FONT_CHECK_MODES).optional(),
      /**
       * What the document says about itself (13.5). Every field is optional and every field is a
       * string monodocs does not interpret. `title` stays at the top level rather than moving in
       * here: it is in every existing configuration, and moving it would buy consistency at the
       * price of the one thing 12.4 promises not to do.
       */
      document: z
        .object({
          version: z.string().min(1).optional(),
          date: z.string().min(1).optional(),
          authors: z.array(z.string().min(1)).optional(),
        })
        .strict()
        .optional(),
      input: z.string().optional(),
      output: z
        .object({
          format: z.enum(["html", "pdf", "both"]).optional(),
          path: z.string().optional(),
        })
        .strict()
        .optional(),
      sources: z
        .object({
          markdown: z
            .object({ extensions: z.array(z.string()).optional() })
            .strict()
            .optional(),
          asciidoc: z
            .object({ extensions: z.array(z.string()).optional() })
            .strict()
            .optional(),
          /**
           * Glob patterns whose matches are not turned into pages, evaluated against the path
           * relative to the input directory. These are added to DEFAULT_EXCLUDE rather than
           * replacing it: a list written to keep one draft out of the bundle should not also
           * hand back the fragments the built-in list exists to keep out.
           */
          exclude: z.array(z.string()).optional(),
          /** Set false to drop DEFAULT_EXCLUDE, for a tree that really does bundle its `_*` files. */
          excludeDefaults: z.boolean().optional(),
        })
        .strict()
        .optional(),
      sidebar: z
        .object({
          // "folder"（既定）= フォルダ構造からサイドバーを生成する。
          // "custom" = items に書いた構造と順序をそのまま使う。
          mode: z.enum(["folder", "custom"]).optional(),
          items: z.array(sidebarItemSchema).min(1).optional(),
          /**
           * Deprecated in favour of `sources.exclude`, which is named for what it does: a match is
           * left out of the bundle, not merely out of the sidebar. Still honoured, with a warning,
           * and merged with DEFAULT_EXCLUDE like its replacement.
           */
          exclude: z.array(z.string()).optional(),
          // この階層より深いディレクトリを既定で折りたたむ（隠さず畳むだけなので到達性は失わない）。
          // 0 = 全ディレクトリを畳む / 未指定 = 折りたたみなし（全展開）。
          collapseDepth: z.number().int().min(0).optional(),
          // 明示タイトルではなく、ページタイトル・ディレクトリ名から導出した表示名へ適用する変換。
          titleTransform: sidebarTitleTransformSchema.optional(),
          // ページタイトルの取得元。"heading"（既定）= frontmatter → 見出し → ファイル名。
          // "filename" = 見出しがあってもファイル名を使う（明示タイトルは常に最優先）。
          titleFrom: z.enum(["heading", "filename"]).optional(),
          // ページを 1 つだけ含む（サブフォルダを持たない）ディレクトリ階層をサイドバーから畳み、
          // その唯一のページを親へ繰り上げる。ドキュメント＋画像を 1 フォルダにまとめた場合などに
          // 冗長なフォルダ階層を消すための設定。画像はページに数えないため自動で判定できる。
          flattenSingleChild: z.boolean().optional(),
        })
        .strict()
        .superRefine((value, ctx) => {
          // 片方だけの指定は「書いたのに効かない」事故になるため、両方そろっていることを求める。
          if (value.mode === "custom" && value.items === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("config.sidebarCustomNeedsItems"),
            });
          }
          if (value.mode !== "custom" && value.items !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("config.sidebarItemsNeedCustom"),
            });
          }
        })
        .optional(),
      toc: z
        .object({
          // ページ内目次に出す見出しの最深レベル（2〜6）。h1 はページタイトル相当のため常に除外。
          maxLevel: z.number().int().min(2).max(6).optional(),
        })
        .strict()
        .optional(),
      assets: z
        .object({
          embedImages: z.boolean().optional(),
          maxInlineSize: z.union([z.string(), z.number()]).optional(),
          onLargeImage: z.enum(["warn", "error", "external"]).optional(),
        })
        .strict()
        .optional(),
      mermaid: z
        .object({
          enabled: z.boolean().optional(),
          mode: z.enum(["client", "pre-render"]).optional(),
          runtime: z.enum(["cdn", "inline"]).optional(),
        })
        .strict()
        .optional(),
      highlight: z.object({ enabled: z.boolean().optional() }).strict().optional(),
      html: z
        .object({
          theme: z.string().optional(),
          contentWidth: z.union([z.string(), z.number()]).optional(),
          /** 読者向けの本文幅切替ボタンを表示するか（既定 true）。 */
          contentWidthToggle: z.boolean().optional(),
          /** Initial content-width toggle state (default: standard). */
          contentWidthDefault: z.enum(["standard", "wide"]).optional(),
          /** Whether unlinked, non-decorative content images open in a lightbox (default: true). */
          imageLightbox: z.boolean().optional(),
          /** Whether the generated document shows the monodocs branding footer (default: true). */
          branding: z.boolean().optional(),
          // ドキュメントを開いたときの初期配色。"light"（既定）/ "dark" / "auto"（OS 追従）。
          // 読者がトグルで切り替えると localStorage の選択が優先される。
          colorScheme: z.enum(["light", "dark", "auto"]).optional(),
          // lang が選んだ表の上に、個別の UI ラベルを差し替える。テーマの chrome に作用する
          // 層なので html の下（lang は文書自身の記述なのでトップレベル）。
          labels: labelsSchema.optional(),
        })
        .strict()
        .optional(),
      pdf: z
        .object({
          // Puppeteer の page.pdf `format`（"A4" / "Letter" など）。既定は "A4"。
          pageSize: z.string().optional(),
          // ページ余白（CSS 長さ。"20mm" など）。省略した辺は既定値を使う。
          margin: z
            .object({
              top: z.string().optional(),
              right: z.string().optional(),
              bottom: z.string().optional(),
              left: z.string().optional(),
            })
            .strict()
            .optional(),
          // 背景色・背景画像を印刷するか（既定 true）。
          printBackground: z.boolean().optional(),
          // PDF のしおり（HTML サイドバーと同じ フォルダ→ページ 構造）を付与するか（既定 true）。
          bookmarks: z.boolean().optional(),
          // ページ上下の帯。false = 帯なし / HTML フラグメント = 置き換え。既定はヘッダ無し・
          // フッタにページ番号。フラグメントは Chromium 自身のクラス（pageNumber / totalPages /
          // title / date / url）に値が差し込まれる。monodocs のトークン構文ではない。
          header: z.union([z.literal(false), z.string().min(1)]).optional(),
          footer: z.union([z.literal(false), z.string().min(1)]).optional(),
          /**
           * この深さまでの見出しの前で改ページする。`false`（既定）はどの見出しでも改ページ
           * しない。数値は「新しい紙を始める最も深い見出しレベル」で、2 は h2 だけ、6 は h2〜h6。
           * h1 はページタイトルであり、そのファイルは既に改ページ済みなので含めない。
           * `"off"` ではなく `false` にしているのは、機能を無効化する値として header / footer が
           * 既に `false` を使っているためで、`fontCheck` の warn|error|off は動作モードの列挙。
           */
          pageBreakLevel: z
            .union(
              [
                z.literal(false),
                z.literal(2),
                z.literal(3),
                z.literal(4),
                z.literal(5),
                z.literal(6),
              ],
              {
                message: t("config.invalidPdfPageBreakLevelValue"),
              },
            )
            .optional(),
          /**
           * 版面の密度。プリセット名か、プリセットを土台に一部だけ差し替えるオブジェクト。
           * 値を 4 つ書き写させないために `base` を持たせている（写しは、後でプリセット側を
           * 調整したときに取り残される）。`html.labels` が lang の表に重なるのと同じ解決順。
           */
          density: z
            .union([
              z.enum(PDF_DENSITY_NAMES),
              z
                .object({
                  base: z.enum(PDF_DENSITY_NAMES).optional(),
                  fontSize: z
                    .string()
                    .refine(isCssLength, { message: t("config.invalidPdfLengthValue") })
                    .optional(),
                  lineHeight: z
                    .union([z.number(), z.string()])
                    .refine(isCssNumberAboveZero, {
                      message: t("config.invalidPdfLineHeightValue"),
                    })
                    .optional(),
                  headingSpacing: z
                    .string()
                    .refine(isCssLength, { message: t("config.invalidPdfLengthValue") })
                    .optional(),
                  tableCellPadding: z
                    .string()
                    .refine(isCssLengthPair, { message: t("config.invalidPdfCellPaddingValue") })
                    .optional(),
                })
                .strict(),
            ])
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict();

  return configFileSchema;
}

export type ConfigFile = z.infer<ReturnType<typeof buildConfigFileSchema>>;

/** PDF のページ余白（各辺 CSS 長さ）。 */
export type PdfMargin = { top: string; right: string; bottom: string; left: string };

/**
 * Resolve `pdf.density` into the four values the stylesheet needs. The object form starts from the
 * preset named by `base` (default `normal`) and replaces only what it names, so adjusting one value
 * does not mean copying the other three — and a preset that is retuned later still carries.
 */
function resolvePdfDensity(density: NonNullable<ConfigFile["pdf"]>["density"]): PdfDensity {
  if (density === undefined) return PDF_DENSITY_PRESETS.normal;
  if (typeof density === "string") return PDF_DENSITY_PRESETS[density];
  const base = PDF_DENSITY_PRESETS[density.base ?? "normal"];
  return {
    fontSize: density.fontSize?.trim() ?? base.fontSize,
    lineHeight:
      density.lineHeight !== undefined ? String(density.lineHeight).trim() : base.lineHeight,
    headingSpacing: density.headingSpacing?.trim() ?? base.headingSpacing,
    tableCellPadding:
      density.tableCellPadding?.trim().replace(/\s+/g, " ") ?? base.tableCellPadding,
  };
}

/** 設定ファイルと CLI オプションを統合した、解決済みの設定。 */
export type ResolvedConfig = {
  /** 実際に読み込んだ設定ファイル。未検出の場合は undefined。 */
  configFilePath?: string;
  /**
   * Problems found while resolving the configuration that do not stop the build — a deprecated
   * key, for one. The build surfaces them alongside its own warnings, because a configuration
   * that is quietly half-honoured is the failure this is here to prevent.
   */
  warnings: Diagnostic[];
  title: string;
  /** What the document says about itself: version, date, authors (13.5). */
  documentMetadata: DocumentMetadata;
  /** 生成した文書の言語（BCP 47）。`<html lang>` を埋め、UI ラベルの表を選ぶ。 */
  lang: string;
  /** `lang` が選んだ表の上に重ねる UI ラベルの差し替え。 */
  labelOverrides: Partial<Labels>;
  /** 必要なフォントがビルド環境に無いときの挙動（既定 warn）。 */
  fontCheck: FontCheckMode;
  inputDir: string;
  outputFile: string;
  format: OutputFormat;
  markdownExtensions: string[];
  asciidocExtensions: string[];
  exclude: string[];
  /** サイドバーの生成方式（"folder" = フォルダ構造 / "custom" = sidebarItems）。 */
  sidebarMode: SidebarMode;
  /** `sidebarMode: "custom"` のときに使うサイドバー定義。folder のときは空配列。 */
  sidebarItems: SidebarItem[];
  /** この階層より深いディレクトリを既定で折りたたむ。undefined は折りたたみなし。 */
  sidebarCollapseDepth?: number;
  /** 明示タイトルではなく、ページタイトル・ディレクトリ名から導出した表示名へ適用する変換。 */
  sidebarTitleTransform: SidebarTitleTransforms;
  /** ページタイトルの取得元（"heading" = 見出し優先 / "filename" = ファイル名優先）。 */
  sidebarTitleFrom: TitleFrom;
  /** ページ 1 つだけ・サブフォルダ無しのディレクトリ階層を畳んでページを親へ繰り上げるか。 */
  sidebarFlattenSingleChild: boolean;
  /** ページ内目次に出す見出しの最深レベル（2〜6）。 */
  tocMaxLevel: number;
  /**
   * テーマ。組み込みテーマ名（"default"）か、カスタムテーマディレクトリの絶対パス。
   * 設定ファイルにパスらしき値が書かれていれば設定ファイル基準で解決する。
   */
  theme: string;
  /** ドキュメントを開いたときの初期配色（"light" 既定 / "dark" / "auto" = OS 追従）。 */
  colorScheme: ColorScheme;
  /** 本文領域の最大幅。`full` 指定時は CSS の `none` に解決する。 */
  contentWidth: string;
  /** 読者向けの本文幅切替ボタンを表示するか。 */
  contentWidthToggle: boolean;
  /** Initial state when the content-width toggle is shown. */
  contentWidthDefault: ContentWidthDefault;
  /** Whether the image lightbox is enabled. */
  imageLightbox: boolean;
  /** monodocs のブランディングフッターを表示するか。 */
  branding: boolean;
  embedImages: boolean;
  maxInlineSize: number;
  onLargeImage: OnLargeImage;
  mermaidEnabled: boolean;
  mermaidMode: MermaidMode;
  mermaidRuntime: MermaidRuntime;
  codeHighlight: boolean;
  /** PDF の用紙サイズ（Puppeteer の page.pdf `format`。既定 "A4"）。 */
  pdfPageSize: string;
  /** PDF のページ余白（各辺 CSS 長さ）。 */
  pdfMargin: PdfMargin;
  /** PDF に背景色・背景画像を含めるか（既定 true）。 */
  pdfPrintBackground: boolean;
  /** PDF にしおり（サイドバーと同じ構造）を付与するか（既定 true）。 */
  pdfBookmarks: boolean;
  /**
   * 改ページする最も深い見出しレベル（2〜6）。`false` は見出しでは改ページしない（既定）。
   */
  pdfPageBreakLevel: PdfPageBreakLevel;
  /** 印刷時の版面の密度（解決済みの値。`normal` は既定テーマの値そのもの）。 */
  pdfDensity: PdfDensity;
  /** ページ上部の帯（解決済み HTML フラグメント。帯なしのときは空フラグメント）。 */
  pdfHeader: string;
  /** ページ下部の帯（同上。既定はページ番号）。 */
  pdfFooter: string;
};

/**
 * "5MB" / "500KB" / 1048576 などをバイト数に変換する。
 * 未指定は fallback。不正値・非正値は設定エラーとして例外を投げる。
 */
export function parseSize(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new MonodocsError("config/invalid", t("config.invalidMaxInlineSize", { value }));
    }
    return value;
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidMaxInlineSize", { value: `"${value}"` }),
    );
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const factor = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit] ?? 1;
  const bytes = Math.round(amount * factor);
  if (bytes <= 0) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidMaxInlineSize", { value: `"${value}"` }),
    );
  }
  return bytes;
}

/**
 * A CSS length monodocs is willing to write into a stylesheet. Deliberately narrow: these values
 * reach the generated CSS, so anything that is not plainly a number and a unit — `calc(...)`, or a
 * value with a `;` after it — has to be refused rather than passed through.
 */
const CSS_LENGTH = /^(?:0|\d+(?:\.\d+)?(?:px|pt|mm|cm|in|rem|em))$/;

function isCssLength(value: string): boolean {
  return CSS_LENGTH.test(value.trim());
}

/** One or two lengths, as CSS shorthand padding takes them (`0.3rem` / `0.3rem 0.5rem`). */
function isCssLengthPair(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  return parts.length >= 1 && parts.length <= 2 && parts.every(isCssLength);
}

/**
 * A unitless CSS number, above zero. Written as a pattern rather than handed to `Number()`, which
 * also accepts spellings CSS does not have: `0x10`, `0b10`, `1e2`, `Infinity`. Those would pass a
 * numeric check and then sit in the stylesheet as an invalid declaration.
 */
const CSS_NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

function isCssNumberAboveZero(value: string | number): boolean {
  const text = String(value).trim();
  return CSS_NUMBER.test(text) && Number(text) > 0;
}

/**
 * Re-check a density before it is written into CSS, and return the **normalized** values.
 * `loadConfig` already validates what it read, but `renderSingleHtml` is a public entry point of
 * its own and takes these values as data. Returning the checked form matters as much as the check:
 * validating a trimmed copy while the caller writes the original is how a value that passed and a
 * value that was written stop being the same string.
 */
export function validatePdfDensity(density: PdfDensity): PdfDensity {
  const fontSize = density.fontSize.trim();
  const lineHeight = String(density.lineHeight).trim();
  const headingSpacing = density.headingSpacing.trim();
  const tableCellPadding = density.tableCellPadding.trim().replace(/\s+/g, " ");
  if (!isCssLength(fontSize)) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidPdfLength", { key: "fontSize", value: density.fontSize }),
    );
  }
  if (!isCssNumberAboveZero(lineHeight)) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidPdfLineHeight", { value: density.lineHeight }),
    );
  }
  if (!isCssLength(headingSpacing)) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidPdfLength", { key: "headingSpacing", value: density.headingSpacing }),
    );
  }
  if (!isCssLengthPair(tableCellPadding)) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidPdfCellPadding", { value: density.tableCellPadding }),
    );
  }
  return { fontSize, lineHeight, headingSpacing, tableCellPadding };
}

/**
 * `html.contentWidth` を CSS の max-width 値へ変換する。
 * 数値は px として扱う。`full` はサイドバー・目次を除く残り幅いっぱいに広げるため `none` へ変換する。
 */
export function parseContentWidth(
  value: string | number | undefined,
  fallback: string = DEFAULT_CONTENT_WIDTH,
): string {
  if (value === undefined) return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new MonodocsError("config/invalid", t("config.invalidContentWidth", { value }));
    }
    return `${value}px`;
  }

  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "full" || trimmed.toLowerCase() === "none") {
    return "none";
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em|ch|vw|%)$/i);
  if (!match) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidContentWidth", { value: `"${value}"` }),
    );
  }
  const rawAmount = match[1];
  const rawUnit = match[2];
  if (rawAmount === undefined || rawUnit === undefined) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidContentWidth", { value: `"${value}"` }),
    );
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MonodocsError(
      "config/invalid",
      t("config.invalidContentWidth", { value: `"${value}"` }),
    );
  }
  return `${amount}${rawUnit.toLowerCase()}`;
}

function resolveConfigRelativePath(baseDir: string, target: string): string {
  return isAbsolute(target) ? target : resolve(baseDir, target);
}

/**
 * 設定の `html.theme` を解決する。`./my-theme` のようなパス表記は設定ファイル基準の
 * 絶対パスにし、それ以外は組み込みテーマ名として渡す（存在確認は loadTheme が行う）。
 * パス表記かどうかは区切り文字と先頭のドット・ドライブレターで判定する。
 */
function resolveTheme(baseDir: string, theme: string | undefined): string {
  if (theme === undefined || theme === "") return "default";
  const looksLikePath =
    theme.startsWith(".") ||
    theme.includes("/") ||
    theme.includes("\\") ||
    /^[A-Za-z]:/.test(theme) ||
    isAbsolute(theme);
  return looksLikePath ? resolveConfigRelativePath(baseDir, theme) : theme;
}

/**
 * The directory a configuration file would sit in for a given input. A single-file input is
 * configured from the directory that holds it — `monodocs build ./docs/plan.md` should read the
 * same `monodocs.config.yml` as `monodocs build ./docs`.
 */
function configBaseFor(input: string): string {
  return existsSync(input) && statSync(input).isFile() ? dirname(input) : input;
}

function findDefaultConfigPath(options: BuildOptions, cwd: string): string | undefined {
  if (options.inputDir) {
    const inputConfigPath = join(
      configBaseFor(resolve(cwd, options.inputDir)),
      DEFAULT_CONFIG_FILE,
    );
    return existsSync(inputConfigPath) ? inputConfigPath : undefined;
  }

  const cwdConfigPath = resolve(cwd, DEFAULT_CONFIG_FILE);
  return existsSync(cwdConfigPath) ? cwdConfigPath : undefined;
}

/**
 * Render a schema failure as `path: message` per problem. Zod's own `error.message` is a JSON dump
 * of the issue array, which buries the one thing the author needs — which key, and what about it.
 */
function formatConfigIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * 設定ファイル（存在すれば）と CLI オプションを統合して解決済み設定を返す。
 * 優先順位は CLI オプション > 設定ファイル > デフォルト。
 */
export async function loadConfig(
  options: BuildOptions = {},
  cwd: string = process.cwd(),
): Promise<ResolvedConfig> {
  const configPath = options.configFile
    ? resolve(cwd, options.configFile)
    : findDefaultConfigPath(options, cwd);

  let fileConfig: ConfigFile = {};
  if (configPath && existsSync(configPath)) {
    let parsed: unknown;
    try {
      parsed = parseYaml(await readFile(configPath, "utf8"));
    } catch (error) {
      throw new MonodocsError(
        "config/invalid",
        t("config.parseFailed", { path: configPath, detail: (error as Error).message }),
      );
    }
    const result = buildConfigFileSchema().safeParse(parsed ?? {});
    if (!result.success) {
      throw new MonodocsError(
        "config/invalid",
        t("config.invalid", { path: configPath, detail: formatConfigIssues(result.error) }),
      );
    }
    fileConfig = result.data;
  } else if (options.configFile) {
    // 明示指定された設定ファイルが存在しない場合はエラー。
    throw new MonodocsError("config/not-found", t("config.notFound", { path: String(configPath) }));
  }

  const configBaseDir = configPath ? dirname(configPath) : cwd;

  const warnings: Diagnostic[] = [];

  // `sidebar.exclude` moved to `sources.exclude`, which is where it acts: a match never becomes a
  // page, so it leaves the bundle rather than just the sidebar. The old key still works — a 0.9
  // configuration keeps building — but it is worth one line of output, because its meaning changed
  // too: the patterns now add to the built-in list instead of replacing it.
  const sidebarExclude = fileConfig.sidebar?.exclude;
  const sourcesExclude = fileConfig.sources?.exclude;
  if (sidebarExclude !== undefined && sourcesExclude !== undefined) {
    throw new MonodocsError("config/invalid", t("config.excludeInBothPlaces"));
  }
  if (sidebarExclude !== undefined) {
    warnings.push(warn("config/deprecated-key", t("config.sidebarExcludeMoved")));
  }
  const excludeDefaults = fileConfig.sources?.excludeDefaults ?? true;
  const exclude = [
    ...(excludeDefaults ? DEFAULT_EXCLUDE : []),
    ...(sourcesExclude ?? sidebarExclude ?? []),
  ];

  // 設定ファイルの output.format は zod で検証済みだが、CLI の --format は生文字列で渡るため
  // ここで検証する（不正値が resolveOutputs の both 分岐へ落ちるのを防ぐ）。
  const format = options.format ?? fileConfig.output?.format ?? "html";
  if (format !== "html" && format !== "pdf" && format !== "both") {
    throw new MonodocsError("config/invalid", t("config.invalidFormat", { value: String(format) }));
  }

  return {
    configFilePath: configPath,
    warnings,
    title: fileConfig.title ?? DEFAULT_TITLE,
    documentMetadata: fileConfig.document ?? {},
    lang: fileConfig.lang ?? DEFAULT_LANG,
    labelOverrides: fileConfig.html?.labels ?? {},
    // 既定は warn。検査は Chromium のフォールバック連鎖に対するヒューリスティックなので、
    // 誤検出が既定でビルドを止められる形にはしない。
    fontCheck: fileConfig.fontCheck ?? "warn",
    inputDir:
      options.inputDir ??
      resolveConfigRelativePath(configBaseDir, fileConfig.input ?? DEFAULT_INPUT),
    outputFile:
      options.outputFile ??
      resolveConfigRelativePath(configBaseDir, fileConfig.output?.path ?? defaultOutputFor(format)),
    format,
    markdownExtensions: fileConfig.sources?.markdown?.extensions ?? DEFAULT_MARKDOWN_EXTENSIONS,
    asciidocExtensions: fileConfig.sources?.asciidoc?.extensions ?? DEFAULT_ASCIIDOC_EXTENSIONS,
    exclude,
    sidebarMode: fileConfig.sidebar?.mode ?? "folder",
    sidebarItems: fileConfig.sidebar?.items ?? [],
    sidebarCollapseDepth: fileConfig.sidebar?.collapseDepth,
    sidebarTitleTransform: {
      page: fileConfig.sidebar?.titleTransform?.page ?? { type: "none" },
      directory: fileConfig.sidebar?.titleTransform?.directory ?? { type: "none" },
    },
    sidebarTitleFrom: fileConfig.sidebar?.titleFrom ?? "heading",
    sidebarFlattenSingleChild: fileConfig.sidebar?.flattenSingleChild ?? false,
    tocMaxLevel: fileConfig.toc?.maxLevel ?? DEFAULT_TOC_MAX_LEVEL,
    theme: resolveTheme(configBaseDir, fileConfig.html?.theme),
    colorScheme: fileConfig.html?.colorScheme ?? "light",
    contentWidth: parseContentWidth(fileConfig.html?.contentWidth),
    contentWidthToggle: fileConfig.html?.contentWidthToggle ?? true,
    contentWidthDefault: fileConfig.html?.contentWidthDefault ?? "standard",
    imageLightbox: fileConfig.html?.imageLightbox ?? true,
    branding: fileConfig.html?.branding ?? true,
    embedImages: fileConfig.assets?.embedImages ?? true,
    maxInlineSize: parseSize(fileConfig.assets?.maxInlineSize, DEFAULT_MAX_INLINE_SIZE),
    onLargeImage: fileConfig.assets?.onLargeImage ?? "warn",
    mermaidEnabled: fileConfig.mermaid?.enabled ?? true,
    mermaidMode: fileConfig.mermaid?.mode ?? "client",
    // 既定は inline（自己完結）。単一ファイル配布時にオフラインでも図が表示される。
    // サイズ最小化したい場合のみ cdn を選ぶ。
    mermaidRuntime: fileConfig.mermaid?.runtime ?? "inline",
    codeHighlight: fileConfig.highlight?.enabled ?? true,
    pdfPageSize: fileConfig.pdf?.pageSize ?? DEFAULT_PDF_PAGE_SIZE,
    pdfMargin: {
      top: fileConfig.pdf?.margin?.top ?? DEFAULT_PDF_MARGIN.top,
      right: fileConfig.pdf?.margin?.right ?? DEFAULT_PDF_MARGIN.right,
      bottom: fileConfig.pdf?.margin?.bottom ?? DEFAULT_PDF_MARGIN.bottom,
      left: fileConfig.pdf?.margin?.left ?? DEFAULT_PDF_MARGIN.left,
    },
    pdfDensity: resolvePdfDensity(fileConfig.pdf?.density),
    pdfPrintBackground: fileConfig.pdf?.printBackground ?? true,
    pdfBookmarks: fileConfig.pdf?.bookmarks ?? true,
    pdfPageBreakLevel: fileConfig.pdf?.pageBreakLevel ?? false,
    // ヘッダは既定で帯なし。フッタは既定でページ番号。
    pdfHeader: resolveBand(fileConfig.pdf?.header, EMPTY_PDF_BAND),
    pdfFooter: resolveBand(fileConfig.pdf?.footer, DEFAULT_PDF_FOOTER),
  };
}
