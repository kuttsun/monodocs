import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BuildOptions, OutputFormat, TitleFrom } from "./types.js";

const DEFAULT_INPUT = "./docs";
const DEFAULT_OUTPUT = "./dist/manual.html";
const DEFAULT_TITLE = "Documentation";
const DEFAULT_MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const DEFAULT_ASCIIDOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc"];
// `_` 始まりのファイルは拡張子を問わず include/partial 用とみなしてページ化しない。
const DEFAULT_EXCLUDE = ["_partials/**", "partials/**", "includes/**", "**/_*"];
const DEFAULT_CONFIG_FILE = "monodocs.config.yml";
const DEFAULT_MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
// ページ内目次に出す見出しの最深レベル（h2〜h3）。h1 はページタイトル相当のため常に除外。
const DEFAULT_TOC_MAX_LEVEL = 3;

/** 画像の最大インラインサイズ超過時の挙動。 */
export type OnLargeImage = "warn" | "error" | "external";
/** Mermaid ランタイムの配給方法。 */
export type MermaidRuntime = "cdn" | "inline";

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
      // フォルダ名・ファイル名の先頭にある並び替え用の数値プレフィックス（`01_` `001-` など）を
      // 表示タイトルから除去する。順序はファイル名で制御しつつ、表示には数字を出さない運用向け。
      stripNumberPrefix: z.boolean().optional(),
      // ページタイトルの取得元。"heading"（既定）= frontmatter → 見出し → ファイル名。
      // "filename" = 見出しがあってもファイル名を使う（明示タイトルは常に最優先）。
      titleFrom: z.enum(["heading", "filename"]).optional(),
      // ページを 1 つだけ含む（サブフォルダを持たない）ディレクトリ階層をサイドバーから畳み、
      // その唯一のページを親へ繰り上げる。ドキュメント＋画像を 1 フォルダにまとめた場合などに
      // 冗長なフォルダ階層を消すための設定。画像はページに数えないため自動で判定できる。
      flattenSingleChild: z.boolean().optional(),
    })
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
      runtime: z.enum(["cdn", "inline"]).optional(),
    })
    .optional(),
  highlight: z.object({ enabled: z.boolean().optional() }).optional(),
  html: z.object({ theme: z.string().optional() }).optional(),
});

export type ConfigFile = z.infer<typeof configFileSchema>;

/** 設定ファイルと CLI オプションを統合した、解決済みの設定。 */
export type ResolvedConfig = {
  title: string;
  inputDir: string;
  outputFile: string;
  format: OutputFormat;
  markdownExtensions: string[];
  asciidocExtensions: string[];
  exclude: string[];
  /** この階層より深いディレクトリを既定で折りたたむ。undefined は折りたたみなし。 */
  sidebarCollapseDepth?: number;
  /** 表示タイトルから並び替え用の数値プレフィックス（`01_` など）を除去するか。 */
  sidebarStripNumberPrefix: boolean;
  /** ページタイトルの取得元（"heading" = 見出し優先 / "filename" = ファイル名優先）。 */
  sidebarTitleFrom: TitleFrom;
  /** ページ 1 つだけ・サブフォルダ無しのディレクトリ階層を畳んでページを親へ繰り上げるか。 */
  sidebarFlattenSingleChild: boolean;
  /** ページ内目次に出す見出しの最深レベル（2〜6）。 */
  tocMaxLevel: number;
  theme: string;
  embedImages: boolean;
  maxInlineSize: number;
  onLargeImage: OnLargeImage;
  mermaidEnabled: boolean;
  mermaidRuntime: MermaidRuntime;
  codeHighlight: boolean;
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
 * 設定ファイル（存在すれば）と CLI オプションを統合して解決済み設定を返す。
 * 優先順位は CLI オプション > 設定ファイル > デフォルト。
 */
export async function loadConfig(
  options: BuildOptions = {},
  cwd: string = process.cwd(),
): Promise<ResolvedConfig> {
  const configPath = resolve(cwd, options.configFile ?? DEFAULT_CONFIG_FILE);

  let fileConfig: ConfigFile = {};
  if (existsSync(configPath)) {
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

  return {
    title: fileConfig.title ?? DEFAULT_TITLE,
    inputDir: options.inputDir ?? fileConfig.input ?? DEFAULT_INPUT,
    outputFile: options.outputFile ?? fileConfig.output?.path ?? DEFAULT_OUTPUT,
    format: options.format ?? fileConfig.output?.format ?? "html",
    markdownExtensions: fileConfig.sources?.markdown?.extensions ?? DEFAULT_MARKDOWN_EXTENSIONS,
    asciidocExtensions: fileConfig.sources?.asciidoc?.extensions ?? DEFAULT_ASCIIDOC_EXTENSIONS,
    exclude: fileConfig.sidebar?.exclude ?? DEFAULT_EXCLUDE,
    sidebarCollapseDepth: fileConfig.sidebar?.collapseDepth,
    sidebarStripNumberPrefix: fileConfig.sidebar?.stripNumberPrefix ?? false,
    sidebarTitleFrom: fileConfig.sidebar?.titleFrom ?? "heading",
    sidebarFlattenSingleChild: fileConfig.sidebar?.flattenSingleChild ?? false,
    tocMaxLevel: fileConfig.toc?.maxLevel ?? DEFAULT_TOC_MAX_LEVEL,
    theme: fileConfig.html?.theme ?? "default",
    embedImages: fileConfig.assets?.embedImages ?? true,
    maxInlineSize: parseSize(fileConfig.assets?.maxInlineSize, DEFAULT_MAX_INLINE_SIZE),
    onLargeImage: fileConfig.assets?.onLargeImage ?? "warn",
    mermaidEnabled: fileConfig.mermaid?.enabled ?? true,
    mermaidRuntime: fileConfig.mermaid?.runtime ?? "cdn",
    codeHighlight: fileConfig.highlight?.enabled ?? true,
  };
}
