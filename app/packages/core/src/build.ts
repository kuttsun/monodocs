import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { BuildOptions, BuildResult, Page, SidebarNode, SourceFormat } from "./types.js";
import { loadConfig, type MermaidMode, type OnLargeImage, type ResolvedConfig } from "./config.js";
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
import { createPuppeteerPdfGenerator, type PdfGenerator } from "./pipeline/renderPdf.js";
import { sidebarToOutline } from "./pipeline/pdfOutline.js";
import { renderSingleHtml } from "./pipeline/renderSingleHtml.js";
import { mermaidRuntimeScript } from "./themes/mermaid.js";

/** {@link preparePages} のオプション（テスト時のレンダラ注入・validate の mode 上書き用）。 */
type PreparePagesOptions = {
  /** pre-render 用レンダラ。build 経路で pre-render のとき渡す。テストでは偽実装を注入する。 */
  mermaidPrerenderer?: MermaidPrerenderer;
  /** config の mermaidMode を上書きする（validate は "client" にして browserless にする）。 */
  mermaidMode?: MermaidMode;
  /**
   * config の embedImages を上書きする。PDF 出力時は画像を data URI として埋め込む必要が
   * あるため（配布 PDF は読者のファイルシステム上の相対画像を参照できない）true を渡す。
   */
  embedImages?: boolean;
  /**
   * config の onLargeImage を上書きする。PDF 出力時は `external`（大きい画像を外部参照のまま
   * にする）だと PDF から画像が欠落するため、埋め込み側（`warn`）へ倒す。
   */
  onLargeImage?: OnLargeImage;
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
    embedImages: opts.embedImages ?? config.embedImages,
    maxInlineSize: config.maxInlineSize,
    onLargeImage: opts.onLargeImage ?? config.onLargeImage,
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

/** buildSite が書き出す出力パス（format により html / pdf / 両方）。 */
type ResolvedOutputs = { html?: string; pdf?: string };

/**
 * format と outputFile から実際の出力パスを決める。
 * - `html`: outputFile をそのまま HTML に使う。
 * - `pdf`: outputFile をそのまま PDF に使う。
 * - `both`: outputFile を **常にディレクトリ扱い**し、その中へ `manual.html` / `manual.pdf`
 *   を出力する（`dist/v1.0` のようにドットを含むディレクトリ名でもファイルと誤判定しない）。
 */
export function resolveOutputs(config: ResolvedConfig, cwd: string): ResolvedOutputs {
  const out = isAbsolute(config.outputFile) ? config.outputFile : resolve(cwd, config.outputFile);
  if (config.format === "html") return { html: out };
  if (config.format === "pdf") return { pdf: out };
  return { html: join(out, "manual.html"), pdf: join(out, "manual.pdf") };
}

/**
 * buildSite 内部でブラウザ依存処理へ差し込む注入口。
 * 通常は使わず、テストで Chromium なしに検証するために偽実装を渡す。
 */
export type BuildInternals = {
  mermaidPrerenderer?: MermaidPrerenderer;
  pdfGenerator?: PdfGenerator;
};

/**
 * 入力ディレクトリの Markdown / AsciiDoc 群から単一 HTML / PDF を生成する。
 *
 * リンク変換 / 画像 data URI 埋め込み / Mermaid / frontmatter・`:sd-*:` メタデータに対応。
 * `format` が `pdf` / `both` のときは、生成した単一 HTML をヘッドレスブラウザで PDF 化する
 * （v0.5）。client mode の Mermaid は全ページ展開後に描画完了を待ってから PDF 化する。
 */
export async function buildSite(
  options: BuildOptions = {},
  internals: BuildInternals = {},
): Promise<BuildResult> {
  const cwd = process.cwd();
  const config = await loadConfig(options, cwd);

  // PDF は配布時に読者のファイルシステム上の相対画像を参照できないため、PDF を出力する場合は
  // 画像を data URI として埋め込む必要がある。embedImages: false や onLargeImage: external
  // （大きい画像を外部参照のまま残す）は PDF から画像を欠落させるので、PDF 出力時は上書きする。
  const needsPdf = config.format === "pdf" || config.format === "both";
  const forceEmbed = needsPdf && !config.embedImages;
  const forceLargeEmbed = needsPdf && config.onLargeImage === "external";

  // pre-render mode では各図をビルド時に SVG 化する。レンダラは lazy 起動なので
  // 図が 0 個なら Chromium は起動しない。注入時（テスト）は close も呼び出し側が管理する。
  const ownPrerenderer = internals.mermaidPrerenderer === undefined;
  const prerenderer =
    internals.mermaidPrerenderer ??
    (config.mermaidEnabled && config.mermaidMode === "pre-render"
      ? createPuppeteerPrerenderer({ colorScheme: config.colorScheme })
      : undefined);

  let prepared: PreparedSite;
  try {
    prepared = await preparePages(config, cwd, {
      mermaidPrerenderer: prerenderer,
      embedImages: forceEmbed ? true : undefined,
      onLargeImage: forceLargeEmbed ? "warn" : undefined,
    });
  } finally {
    if (ownPrerenderer) await prerenderer?.close();
  }
  const { pages, sidebar, warnings, hasMermaid } = prepared;
  if (forceEmbed || forceLargeEmbed) {
    warnings.unshift(
      "PDF 出力のため画像を埋め込みました（配布 PDF は外部の相対画像を参照できないため、" +
        "assets.embedImages / onLargeImage: external を上書き）。",
    );
  }

  // pre-render は静的 SVG なのでランタイム JS を注入しない（client mode のときだけ注入）。
  const clientMermaid = hasMermaid && config.mermaidEnabled && config.mermaidMode === "client";
  const bodyScripts = clientMermaid ? await mermaidRuntimeScript(config.mermaidRuntime) : "";

  const html = await renderSingleHtml({
    title: config.title,
    pages,
    sidebar,
    theme: config.theme,
    colorScheme: config.colorScheme,
    contentWidth: config.contentWidth,
    contentWidthToggle: config.contentWidthToggle,
    contentWidthDefault: config.contentWidthDefault,
    imageLightbox: config.imageLightbox,
    sidebarCollapseDepth: config.sidebarCollapseDepth,
    tocMaxLevel: config.tocMaxLevel,
    bodyScripts,
  });

  const outputs = resolveOutputs(config, cwd);
  const written: string[] = [];

  if (outputs.html) {
    await mkdir(dirname(outputs.html), { recursive: true });
    await writeFile(outputs.html, html, "utf8");
    written.push(outputs.html);
  }

  if (outputs.pdf) {
    const ownGenerator = internals.pdfGenerator === undefined;
    const generator = internals.pdfGenerator ?? createPuppeteerPdfGenerator();
    try {
      const pdf = await generator.render(html, {
        pageSize: config.pdfPageSize,
        margin: config.pdfMargin,
        printBackground: config.pdfPrintBackground,
        waitForMermaid: clientMermaid,
        // HTML サイドバーと同じ フォルダ→ページ 構造をしおりとして付与する。
        outline: config.pdfBookmarks ? sidebarToOutline(sidebar) : undefined,
      });
      await mkdir(dirname(outputs.pdf), { recursive: true });
      await writeFile(outputs.pdf, pdf);
      written.push(outputs.pdf);
    } finally {
      if (ownGenerator) await generator.close();
    }
  }

  return { outputs: written, pages: pages.length, warnings };
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
    // validate は出力を書き出さないため format（html/pdf/both）に関わらず同じ検証を行う。
    // また pre-render の実描画（Chromium 起動）は行わない。mermaidMode を "client" に上書き
    // してクラス付与のみに留める（pre-render の描画/構文エラーは対象外）。
    const { pages, warnings } = await preparePages(config, cwd, { mermaidMode: "client" });
    return { errors: [], warnings, pages: pages.length };
  } catch (error) {
    return { errors: [(error as Error).message], warnings: [], pages: 0 };
  }
}
