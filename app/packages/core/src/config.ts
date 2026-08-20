import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  DEFAULT_LANG,
  isValidLanguageTag,
  LABEL_KEYS,
  type LabelKey,
  type Labels,
} from "./labels.js";
import { t } from "./messages.js";
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
const DEFAULT_CONFIG_FILE = "monodocs.config.yml";
const DEFAULT_MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_CONTENT_WIDTH = "860px";
// ページ内目次に出す見出しの最深レベル（h2〜h3）。h1 はページタイトル相当のため常に除外。
const DEFAULT_TOC_MAX_LEVEL = 3;
// PDF（v0.5）の既定値。pageSize は Puppeteer の `format` 値、margin は CSS 長さ。
const DEFAULT_PDF_PAGE_SIZE = "A4";
const DEFAULT_PDF_MARGIN = { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" };

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

/** 設定ファイルと CLI オプションを統合した、解決済みの設定。 */
export type ResolvedConfig = {
  /** 実際に読み込んだ設定ファイル。未検出の場合は undefined。 */
  configFilePath?: string;
  /**
   * Problems found while resolving the configuration that do not stop the build — a deprecated
   * key, for one. The build surfaces them alongside its own warnings, because a configuration
   * that is quietly half-honoured is the failure this is here to prevent.
   */
  warnings: string[];
  title: string;
  /** 生成した文書の言語（BCP 47）。`<html lang>` を埋め、UI ラベルの表を選ぶ。 */
  lang: string;
  /** `lang` が選んだ表の上に重ねる UI ラベルの差し替え。 */
  labelOverrides: Partial<Labels>;
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
      throw new Error(t("config.invalidMaxInlineSize", { value }));
    }
    return value;
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) {
    throw new Error(t("config.invalidMaxInlineSize", { value: `"${value}"` }));
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const factor = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit] ?? 1;
  const bytes = Math.round(amount * factor);
  if (bytes <= 0) {
    throw new Error(t("config.invalidMaxInlineSize", { value: `"${value}"` }));
  }
  return bytes;
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
      throw new Error(t("config.invalidContentWidth", { value }));
    }
    return `${value}px`;
  }

  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "full" || trimmed.toLowerCase() === "none") {
    return "none";
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em|ch|vw|%)$/i);
  if (!match) {
    throw new Error(t("config.invalidContentWidth", { value: `"${value}"` }));
  }
  const rawAmount = match[1];
  const rawUnit = match[2];
  if (rawAmount === undefined || rawUnit === undefined) {
    throw new Error(t("config.invalidContentWidth", { value: `"${value}"` }));
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(t("config.invalidContentWidth", { value: `"${value}"` }));
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
      throw new Error(
        t("config.parseFailed", { path: configPath, detail: (error as Error).message }),
      );
    }
    const result = buildConfigFileSchema().safeParse(parsed ?? {});
    if (!result.success) {
      throw new Error(
        t("config.invalid", { path: configPath, detail: formatConfigIssues(result.error) }),
      );
    }
    fileConfig = result.data;
  } else if (options.configFile) {
    // 明示指定された設定ファイルが存在しない場合はエラー。
    throw new Error(t("config.notFound", { path: String(configPath) }));
  }

  const configBaseDir = configPath ? dirname(configPath) : cwd;

  const warnings: string[] = [];

  // `sidebar.exclude` moved to `sources.exclude`, which is where it acts: a match never becomes a
  // page, so it leaves the bundle rather than just the sidebar. The old key still works — a 0.9
  // configuration keeps building — but it is worth one line of output, because its meaning changed
  // too: the patterns now add to the built-in list instead of replacing it.
  const sidebarExclude = fileConfig.sidebar?.exclude;
  const sourcesExclude = fileConfig.sources?.exclude;
  if (sidebarExclude !== undefined && sourcesExclude !== undefined) {
    throw new Error(t("config.excludeInBothPlaces"));
  }
  if (sidebarExclude !== undefined) warnings.push(t("config.sidebarExcludeMoved"));
  const excludeDefaults = fileConfig.sources?.excludeDefaults ?? true;
  const exclude = [
    ...(excludeDefaults ? DEFAULT_EXCLUDE : []),
    ...(sourcesExclude ?? sidebarExclude ?? []),
  ];

  // 設定ファイルの output.format は zod で検証済みだが、CLI の --format は生文字列で渡るため
  // ここで検証する（不正値が resolveOutputs の both 分岐へ落ちるのを防ぐ）。
  const format = options.format ?? fileConfig.output?.format ?? "html";
  if (format !== "html" && format !== "pdf" && format !== "both") {
    throw new Error(t("config.invalidFormat", { value: String(format) }));
  }

  return {
    configFilePath: configPath,
    warnings,
    title: fileConfig.title ?? DEFAULT_TITLE,
    lang: fileConfig.lang ?? DEFAULT_LANG,
    labelOverrides: fileConfig.html?.labels ?? {},
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
    pdfPrintBackground: fileConfig.pdf?.printBackground ?? true,
    pdfBookmarks: fileConfig.pdf?.bookmarks ?? true,
    // ヘッダは既定で帯なし。フッタは既定でページ番号。
    pdfHeader: resolveBand(fileConfig.pdf?.header, EMPTY_PDF_BAND),
    pdfFooter: resolveBand(fileConfig.pdf?.footer, DEFAULT_PDF_FOOTER),
  };
}
