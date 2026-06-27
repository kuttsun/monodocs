import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BuildOptions, OutputFormat } from "./types.js";

const DEFAULT_INPUT = "./docs";
const DEFAULT_OUTPUT = "./dist/manual.html";
const DEFAULT_TITLE = "Documentation";
const DEFAULT_MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const DEFAULT_ASCIIDOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc"];
// `_` 始まりのファイルは拡張子を問わず include/partial 用とみなしてページ化しない。
const DEFAULT_EXCLUDE = ["_partials/**", "partials/**", "includes/**", "**/_*"];
const DEFAULT_CONFIG_FILE = "single-docs.config.yml";

/**
 * `single-docs.config.yml` のスキーマ（v0.1 で利用する項目のみ）。
 * 未知のキー（mermaid / pdf / assets など）はデフォルトで無視される。
 */
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
      markdown: z
        .object({
          extensions: z.array(z.string()).optional(),
        })
        .optional(),
      asciidoc: z
        .object({
          extensions: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  sidebar: z
    .object({
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
  html: z
    .object({
      theme: z.string().optional(),
    })
    .optional(),
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
  theme: string;
};

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
    theme: fileConfig.html?.theme ?? "default",
  };
}
