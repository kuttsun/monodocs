import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { BuildOptions, BuildResult, Page, SidebarNode, SourceFormat } from "./types.js";
import { loadConfig, type MermaidMode, type ResolvedConfig } from "./config.js";
import { scanSourceFiles } from "./scan.js";
import { markdownRenderer } from "./sources/markdown/renderer.js";
import { asciidocRenderer } from "./sources/asciidoc/renderer.js";
import { buildPages } from "./pipeline/buildPages.js";
import { buildSidebar } from "./pipeline/buildSidebar.js";
import { postprocessPages } from "./pipeline/postprocess.js";
import {
  createPuppeteerPrerenderer,
  type MermaidPrerenderer,
} from "./pipeline/mermaidPrerender.js";
import { renderSingleHtml } from "./pipeline/renderSingleHtml.js";
import { mermaidRuntimeScript } from "./themes/mermaid.js";

/** {@link preparePages} のオプション（テスト時のレンダラ注入・validate の mode 上書き用）。 */
type PreparePagesOptions = {
  /** pre-render 用レンダラ。build 経路で pre-render のとき渡す。テストでは偽実装を注入する。 */
  mermaidPrerenderer?: MermaidPrerenderer;
  /** config の mermaidMode を上書きする（validate は "client" にして browserless にする）。 */
  mermaidMode?: MermaidMode;
};

type PreparedSite = {
  pages: Page[];
  sidebar: SidebarNode[];
  warnings: string[];
  hasMermaid: boolean;
};

/**
 * 設定をもとにソースを走査・レンダリング・後処理し、ページ群を組み立てる。
 * buildSite / validateSite の共通処理。ハードエラー（入力なし等）は例外を投げる。
 */
export async function preparePages(
  config: ResolvedConfig,
  cwd: string,
  opts: PreparePagesOptions = {},
): Promise<PreparedSite> {
  const inputDir = isAbsolute(config.inputDir) ? config.inputDir : resolve(cwd, config.inputDir);
  if (!existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${config.inputDir}`);
  }

  const extensions = new Map<string, SourceFormat>();
  for (const ext of config.markdownExtensions) extensions.set(ext.toLowerCase(), "markdown");
  for (const ext of config.asciidocExtensions) extensions.set(ext.toLowerCase(), "asciidoc");

  const sources = await scanSourceFiles(inputDir, { extensions, exclude: config.exclude });
  if (sources.length === 0) {
    throw new Error(`No Markdown / AsciiDoc files found in: ${config.inputDir}`);
  }

  const { pages, warnings } = await buildPages(sources, [markdownRenderer, asciidocRenderer], {
    titleTransform: config.sidebarTitleTransform.page,
    titleFrom: config.sidebarTitleFrom,
  });
  const post = await postprocessPages(pages, {
    inputDir,
    sourceExtensions: [...config.markdownExtensions, ...config.asciidocExtensions],
    embedImages: config.embedImages,
    maxInlineSize: config.maxInlineSize,
    onLargeImage: config.onLargeImage,
    mermaidEnabled: config.mermaidEnabled,
    mermaidMode: opts.mermaidMode ?? config.mermaidMode,
    mermaidPrerenderer: opts.mermaidPrerenderer,
    codeHighlight: config.codeHighlight,
  });
  const sidebar = buildSidebar(pages, {
    titleTransform: config.sidebarTitleTransform.directory,
    flattenSingleChild: config.sidebarFlattenSingleChild,
  });

  return {
    pages,
    sidebar,
    warnings: [...warnings, ...post.warnings],
    hasMermaid: post.hasMermaid,
  };
}

/**
 * 入力ディレクトリの Markdown / AsciiDoc 群から単一 HTML を生成する。
 *
 * v0.3 ではリンク変換 / 画像 data URI 埋め込み / Mermaid（client mode）/
 * frontmatter・`:sd-*:` メタデータに対応。PDF（--format pdf/both）は v0.5 で対応予定。
 */
export async function buildSite(options: BuildOptions = {}): Promise<BuildResult> {
  const cwd = process.cwd();
  const config = await loadConfig(options, cwd);

  if (config.format !== "html") {
    throw new Error(`Output format "${config.format}" is not supported yet (only "html").`);
  }

  // pre-render mode では各図をビルド時に SVG 化する。レンダラは lazy 起動なので
  // 図が 0 個なら Chromium は起動しない。ライフサイクル（close）は build 側で管理する。
  const prerenderer =
    config.mermaidEnabled && config.mermaidMode === "pre-render"
      ? createPuppeteerPrerenderer({ colorScheme: config.colorScheme })
      : undefined;

  let prepared: PreparedSite;
  try {
    prepared = await preparePages(config, cwd, { mermaidPrerenderer: prerenderer });
  } finally {
    await prerenderer?.close();
  }
  const { pages, sidebar, warnings, hasMermaid } = prepared;

  // pre-render は静的 SVG なのでランタイム JS を注入しない（client mode のときだけ注入）。
  const bodyScripts =
    hasMermaid && config.mermaidEnabled && config.mermaidMode === "client"
      ? await mermaidRuntimeScript(config.mermaidRuntime)
      : "";

  const html = await renderSingleHtml({
    title: config.title,
    pages,
    sidebar,
    theme: config.theme,
    colorScheme: config.colorScheme,
    contentWidth: config.contentWidth,
    sidebarCollapseDepth: config.sidebarCollapseDepth,
    tocMaxLevel: config.tocMaxLevel,
    bodyScripts,
  });

  const outputFile = isAbsolute(config.outputFile)
    ? config.outputFile
    : resolve(cwd, config.outputFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, html, "utf8");

  return { outputs: [outputFile], pages: pages.length, warnings };
}

/** {@link validateSite} の結果。 */
export type ValidateResult = {
  errors: string[];
  warnings: string[];
  pages: number;
};

/**
 * 出力を書き出さずに、ビルド時と同じ処理を実行して問題点を収集する。
 * ハードエラー（入力なし・route 重複など）は errors、リンク切れ・画像欠落・
 * タイトル欠落などは warnings として返す。
 */
export async function validateSite(options: BuildOptions = {}): Promise<ValidateResult> {
  const cwd = process.cwd();
  try {
    const config = await loadConfig(options, cwd);
    if (config.format !== "html") {
      return {
        errors: [`Output format "${config.format}" is not supported yet (only "html").`],
        warnings: [],
        pages: 0,
      };
    }
    // validate では pre-render の実描画（Chromium 起動）は行わない。mermaidMode を
    // "client" に上書きしてクラス付与のみに留める（pre-render の描画/構文エラーは対象外）。
    const { pages, warnings } = await preparePages(config, cwd, { mermaidMode: "client" });
    return { errors: [], warnings, pages: pages.length };
  } catch (error) {
    return { errors: [(error as Error).message], warnings: [], pages: 0 };
  }
}
