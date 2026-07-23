import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BuildOptions, OutputFormat, SidebarTitleTransforms, TitleFrom } from "./types.js";

const DEFAULT_INPUT = "./docs";
const DEFAULT_TITLE = "Documentation";
const DEFAULT_MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const DEFAULT_ASCIIDOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc"];
// `_` 始まりのファイルは拡張子を問わず include/partial 用とみなしてページ化しない。
const DEFAULT_EXCLUDE = ["_partials/**", "partials/**", "includes/**", "**/_*"];
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
  if (format === "pdf") return "./dist/manual.pdf";
  // both は `-o` をディレクトリ扱いにするため、既定はディレクトリ（./dist）。
  // build 側の resolveOutputs が manual.html / manual.pdf を生成する。
  if (format === "both") return "./dist";
  return "./dist/manual.html";
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
        message: `Invalid regex transform: ${(error as Error).message}`,
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

/** `monodocs.config.yml` のスキーマ（現状利用する項目のみ。未知のキーは無視）。 */
const configFileSchema = z.object({
  title: z.string().optional(),
  input: z.string().optional(),
  output: z
    .object({
      format: z.enum(["html", "pdf", "both"]).optional(),
      path: z.string().optional(),
    })
    .optional(),
  sources: z
    .object({
      markdown: z.object({ extensions: z.array(z.string()).optional() }).optional(),
      asciidoc: z.object({ extensions: z.array(z.string()).optional() }).optional(),
    })
    .optional(),
  sidebar: z
    .object({
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
    .optional(),
  toc: z
    .object({
      // ページ内目次に出す見出しの最深レベル（2〜6）。h1 はページタイトル相当のため常に除外。
      maxLevel: z.number().int().min(2).max(6).optional(),
    })
    .optional(),
  assets: z
    .object({
      embedImages: z.boolean().optional(),
      maxInlineSize: z.union([z.string(), z.number()]).optional(),
      onLargeImage: z.enum(["warn", "error", "external"]).optional(),
    })
    .optional(),
  mermaid: z
    .object({
      enabled: z.boolean().optional(),
      mode: z.enum(["client", "pre-render"]).optional(),
      runtime: z.enum(["cdn", "inline"]).optional(),
    })
    .optional(),
  highlight: z.object({ enabled: z.boolean().optional() }).optional(),
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
      // ドキュメントを開いたときの初期配色。"light"（既定）/ "dark" / "auto"（OS 追従）。
      // 読者がトグルで切り替えると localStorage の選択が優先される。
      colorScheme: z.enum(["light", "dark", "auto"]).optional(),
    })
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
    })
    .strict()
    .optional(),
});

export type ConfigFile = z.infer<typeof configFileSchema>;

/** PDF のページ余白（各辺 CSS 長さ）。 */
export type PdfMargin = { top: string; right: string; bottom: string; left: string };

/** 設定ファイルと CLI オプションを統合した、解決済みの設定。 */
export type ResolvedConfig = {
  /** 実際に読み込んだ設定ファイル。未検出の場合は undefined。 */
  configFilePath?: string;
  title: string;
  inputDir: string;
  outputFile: string;
  format: OutputFormat;
  markdownExtensions: string[];
  asciidocExtensions: string[];
  exclude: string[];
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
};

/**
 * "5MB" / "500KB" / 1048576 などをバイト数に変換する。
 * 未指定は fallback。不正値・非正値は設定エラーとして例外を投げる。
 */
export function parseSize(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid maxInlineSize: ${value}`);
    }
    return value;
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) {
    throw new Error(`Invalid maxInlineSize: "${value}"`);
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const factor = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit] ?? 1;
  const bytes = Math.round(amount * factor);
  if (bytes <= 0) {
    throw new Error(`Invalid maxInlineSize: "${value}"`);
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
      throw new Error(`Invalid contentWidth: ${value}`);
    }
    return `${value}px`;
  }

  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "full" || trimmed.toLowerCase() === "none") {
    return "none";
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em|ch|vw|%)$/i);
  if (!match) {
    throw new Error(`Invalid contentWidth: "${value}"`);
  }
  const rawAmount = match[1];
  const rawUnit = match[2];
  if (rawAmount === undefined || rawUnit === undefined) {
    throw new Error(`Invalid contentWidth: "${value}"`);
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid contentWidth: "${value}"`);
  }
  return `${amount}${rawUnit.toLowerCase()}`;
}

function resolveConfigRelativePath(baseDir: string, target: string): string {
  return isAbsolute(target) ? target : resolve(baseDir, target);
}

function findDefaultConfigPath(options: BuildOptions, cwd: string): string | undefined {
  if (options.inputDir) {
    const inputConfigPath = resolve(cwd, options.inputDir, DEFAULT_CONFIG_FILE);
    return existsSync(inputConfigPath) ? inputConfigPath : undefined;
  }

  const cwdConfigPath = resolve(cwd, DEFAULT_CONFIG_FILE);
  return existsSync(cwdConfigPath) ? cwdConfigPath : undefined;
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
      throw new Error(`Failed to parse config file ${configPath}: ${(error as Error).message}`);
    }
    const result = configFileSchema.safeParse(parsed ?? {});
    if (!result.success) {
      throw new Error(`Invalid config file ${configPath}: ${result.error.message}`);
    }
    fileConfig = result.data;
  } else if (options.configFile) {
    // 明示指定された設定ファイルが存在しない場合はエラー。
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configBaseDir = configPath ? dirname(configPath) : cwd;

  // 設定ファイルの output.format は zod で検証済みだが、CLI の --format は生文字列で渡るため
  // ここで検証する（不正値が resolveOutputs の both 分岐へ落ちるのを防ぐ）。
  const format = options.format ?? fileConfig.output?.format ?? "html";
  if (format !== "html" && format !== "pdf" && format !== "both") {
    throw new Error(`Invalid output format: "${format}" (expected "html", "pdf", or "both").`);
  }

  return {
    configFilePath: configPath,
    title: fileConfig.title ?? DEFAULT_TITLE,
    inputDir:
      options.inputDir ??
      resolveConfigRelativePath(configBaseDir, fileConfig.input ?? DEFAULT_INPUT),
    outputFile:
      options.outputFile ??
      resolveConfigRelativePath(configBaseDir, fileConfig.output?.path ?? defaultOutputFor(format)),
    format,
    markdownExtensions: fileConfig.sources?.markdown?.extensions ?? DEFAULT_MARKDOWN_EXTENSIONS,
    asciidocExtensions: fileConfig.sources?.asciidoc?.extensions ?? DEFAULT_ASCIIDOC_EXTENSIONS,
    exclude: fileConfig.sidebar?.exclude ?? DEFAULT_EXCLUDE,
    sidebarCollapseDepth: fileConfig.sidebar?.collapseDepth,
    sidebarTitleTransform: {
      page: fileConfig.sidebar?.titleTransform?.page ?? { type: "none" },
      directory: fileConfig.sidebar?.titleTransform?.directory ?? { type: "none" },
    },
    sidebarTitleFrom: fileConfig.sidebar?.titleFrom ?? "heading",
    sidebarFlattenSingleChild: fileConfig.sidebar?.flattenSingleChild ?? false,
    tocMaxLevel: fileConfig.toc?.maxLevel ?? DEFAULT_TOC_MAX_LEVEL,
    theme: fileConfig.html?.theme ?? "default",
    colorScheme: fileConfig.html?.colorScheme ?? "light",
    contentWidth: parseContentWidth(fileConfig.html?.contentWidth),
    contentWidthToggle: fileConfig.html?.contentWidthToggle ?? true,
    contentWidthDefault: fileConfig.html?.contentWidthDefault ?? "standard",
    imageLightbox: fileConfig.html?.imageLightbox ?? true,
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
  };
}
