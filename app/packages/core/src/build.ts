import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
  BuildOptions,
  BuildResult,
  Page,
  SidebarNode,
  SourceFile,
  SourceFormat,
} from "./types.js";
import { loadConfig, type MermaidMode, type OnLargeImage, type ResolvedConfig } from "./config.js";
import { bySeverity, type Diagnostic, MonodocsError, toDiagnostic, warn } from "./diagnostics.js";
import { documentAuthor, documentKeywords, documentSubject } from "./documentMeta.js";
import { resolveLabels } from "./labels.js";
import { readSourceFile, scanSourceFiles } from "./scan.js";
import { markdownRenderer } from "./sources/markdown/renderer.js";
import { createAsciidocRenderer } from "./sources/asciidoc/renderer.js";
import { assertIncludesInsideRoot } from "./sources/asciidoc/includeBoundary.js";
import { buildPages } from "./pipeline/buildPages.js";
import { buildCustomSidebar, buildSidebar, orderPagesBySidebar } from "./pipeline/buildSidebar.js";
import { postprocessPages } from "./pipeline/postprocess.js";
import {
  createPuppeteerPrerenderer,
  type MermaidPrerenderer,
} from "./pipeline/mermaidPrerender.js";
import { createPuppeteerPdfGenerator, type PdfGenerator } from "./pipeline/renderPdf.js";
import { sidebarToOutline } from "./pipeline/pdfOutline.js";
import { renderSingleHtml } from "./pipeline/renderSingleHtml.js";
import { mermaidRuntimeScript } from "./themes/mermaid.js";
import { t } from "./messages.js";

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
  warnings: Diagnostic[];
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
  const inputPath = isAbsolute(config.inputDir) ? config.inputDir : resolve(cwd, config.inputDir);
  if (!existsSync(inputPath)) {
    throw new MonodocsError("input/not-found", t("build.inputNotFound", { path: config.inputDir }));
  }

  const extensions = new Map<string, SourceFormat>();
  for (const ext of config.markdownExtensions) extensions.set(ext.toLowerCase(), "markdown");
  for (const ext of config.asciidocExtensions) extensions.set(ext.toLowerCase(), "asciidoc");

  // A single file is a legitimate input: monodocs bundles a set of pages into one artifact, and a
  // set of one is still a set, so pointing at `plan.md` is the obvious thing to try. The directory
  // holding the file becomes the base for its links and images — the same relationship the input
  // directory has to what it contains.
  const inputIsFile = statSync(inputPath).isFile();
  // Everything relative — routes, images, `include::` — is resolved against the root, which is the
  // input unless the configuration said otherwise (12.5). The scan walks from here too, so a
  // document spanning `README.md` and `docs/**` is one tree with one set of routes.
  const rootDir = isAbsolute(config.rootDir) ? config.rootDir : resolve(cwd, config.rootDir);

  let sources: SourceFile[];
  if (inputIsFile) {
    const file = await readSourceFile(inputPath, { extensions, rootDir });
    if (file === undefined) {
      throw new MonodocsError(
        "input/unsupported-file",
        t("build.inputUnsupportedFile", {
          path: config.inputDir,
          extensions: [...extensions.keys()].sort().join(", "),
        }),
      );
    }
    sources = [file];
  } else {
    sources = await scanSourceFiles(rootDir, {
      extensions,
      include: config.include,
      exclude: config.exclude,
    });
    if (sources.length === 0) {
      throw new MonodocsError("input/no-sources", t("build.noSources", { path: config.inputDir }));
    }
  }

  // `include::` の読み取り先を、Asciidoctor が読む前に確かめる（17.5）。safe mode は字句的にしか
  // 閉じ込めず、シンボリックリンクを解決しないため、この検査が無いとツリーの外の内容が束に入る。
  await assertIncludesInsideRoot(sources, rootDir);

  const { pages, warnings } = await buildPages(
    sources,
    [markdownRenderer, createAsciidocRenderer(config.asciidocAttributes)],
    {
      titleTransform: config.sidebarTitleTransform.page,
      titleFrom: config.sidebarTitleFrom,
      sourceExtensions: [...config.markdownExtensions, ...config.asciidocExtensions],
    },
  );
  const post = await postprocessPages(pages, {
    inputDir: rootDir,
    sourceExtensions: [...config.markdownExtensions, ...config.asciidocExtensions],
    embedImages: opts.embedImages ?? config.embedImages,
    maxInlineSize: config.maxInlineSize,
    onLargeImage: opts.onLargeImage ?? config.onLargeImage,
    mermaidEnabled: config.mermaidEnabled,
    mermaidMode: opts.mermaidMode ?? config.mermaidMode,
    mermaidPrerenderer: opts.mermaidPrerenderer,
    codeHighlight: config.codeHighlight,
    pdfPageBreakLevel: config.pdfPageBreakLevel,
  });
  // custom はサイドバーが閲覧順そのものになるため、ページの並びもそれに合わせる
  // （前後ナビ・PDF のページ順・初期表示ページが一致する）。
  if (config.sidebarMode === "custom") {
    const custom = buildCustomSidebar(pages, config.sidebarItems);
    return {
      pages: orderPagesBySidebar(pages, custom.orderedPages),
      sidebar: custom.sidebar,
      warnings: [...config.warnings, ...warnings, ...post.warnings, ...custom.warnings],
      hasMermaid: post.hasMermaid,
    };
  }

  const sidebar = buildSidebar(pages, {
    titleTransform: config.sidebarTitleTransform.directory,
    flattenSingleChild: config.sidebarFlattenSingleChild,
  });

  return {
    pages,
    sidebar,
    warnings: [...config.warnings, ...warnings, ...post.warnings],
    hasMermaid: post.hasMermaid,
  };
}

/** buildSite が書き出す出力パス（format により html / pdf / 両方）。 */
type ResolvedOutputs = { html?: string; pdf?: string };

/**
 * format と outputFile から実際の出力パスを決める。
 * - `html`: outputFile をそのまま HTML に使う。
 * - `pdf`: outputFile をそのまま PDF に使う。
 * - `both`: outputFile を **常にディレクトリ扱い**し、その中へ `docs.html` / `docs.pdf`
 *   を出力する（`dist/v1.0` のようにドットを含むディレクトリ名でもファイルと誤判定しない）。
 */
export function resolveOutputs(config: ResolvedConfig, cwd: string): ResolvedOutputs {
  const out = isAbsolute(config.outputFile) ? config.outputFile : resolve(cwd, config.outputFile);
  if (config.format === "html") return { html: out };
  if (config.format === "pdf") return { pdf: out };
  return { html: join(out, "docs.html"), pdf: join(out, "docs.pdf") };
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
    // pre-render は本文と違って、ビルドマシンのフォントを SVG へ焼き込む。図を描いた文脈が
    // まだ開いているこの時点で確かめる（fontCheck: error なら例外が出てビルドは止まる）。
    await prerenderer?.checkFonts?.({
      mode: config.fontCheck,
      onWarning: (message) => prepared.warnings.push(message),
    });
  } finally {
    if (ownPrerenderer) await prerenderer?.close();
  }
  const { pages, sidebar, warnings, hasMermaid } = prepared;
  if (forceEmbed || forceLargeEmbed) {
    warnings.unshift(warn("image/embedded-for-pdf", t("build.pdfImagesEmbedded")));
  }

  // pre-render は静的 SVG なのでランタイム JS を注入しない（client mode のときだけ注入）。
  const clientMermaid = hasMermaid && config.mermaidEnabled && config.mermaidMode === "client";
  const bodyScripts = clientMermaid ? await mermaidRuntimeScript(config.mermaidRuntime) : "";

  // ラベルの解決はここで 1 度だけ行う。同梱の表が無いタグの警告も、ビルド 1 回につき 1 度になる。
  const resolvedLabels = resolveLabels(config.lang, config.labelOverrides);
  if (resolvedLabels.warning !== undefined) warnings.push(resolvedLabels.warning);

  const html = await renderSingleHtml({
    title: config.title,
    documentMetadata: config.documentMetadata,
    pages,
    sidebar,
    lang: config.lang,
    labels: resolvedLabels.labels,
    theme: config.theme,
    colorScheme: config.colorScheme,
    contentWidth: config.contentWidth,
    // 印刷時の密度は生成物そのものに書き込む。PDF はこの HTML を印刷して作るので、
    // ブラウザから同じ HTML を印刷したときも同じ版面になる。
    pdfDensity: config.pdfDensity,
    pdfPageBreakLevel: config.pdfPageBreakLevel,
    contentWidthToggle: config.contentWidthToggle,
    contentWidthDefault: config.contentWidthDefault,
    imageLightbox: config.imageLightbox,
    branding: config.branding,
    generatorVersion: options.generatorVersion,
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
        title: config.title,
        generator: options.generatorVersion ? `monodocs v${options.generatorVersion}` : "monodocs",
        // 13.5: 書き手が書いた値がビューアの文書情報へ届く。
        author: documentAuthor(config.documentMetadata),
        subject: documentSubject(config.documentMetadata, resolvedLabels.labels),
        keywords: documentKeywords(config.documentMetadata),
        header: config.pdfHeader,
        footer: config.pdfFooter,
        fontCheck: config.fontCheck,
        onWarning: (message) => warnings.push(message),
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
  /** Everything found, errors and warnings alike, in the order they were reported. */
  diagnostics: Diagnostic[];
  /** The errors among them. Derived, so that the two can never disagree. */
  errors: Diagnostic[];
  /** The warnings among them. Derived the same way. */
  warnings: Diagnostic[];
  pages: number;
};

function toValidateResult(diagnostics: Diagnostic[], pages: number): ValidateResult {
  return {
    diagnostics,
    errors: bySeverity(diagnostics, "error"),
    warnings: bySeverity(diagnostics, "warning"),
    pages,
  };
}

/**
 * 出力を書き出さずに、ビルド時と同じ処理を実行して問題点を収集する。
 * ハードエラー（入力なし・route 重複など）は errors、リンク切れ・画像欠落・
 * タイトル欠落などは warnings として返す。
 */
export async function validateSite(options: BuildOptions = {}): Promise<ValidateResult> {
  const cwd = process.cwd();
  // What was found before the run stopped is still found. A deprecated key is still deprecated
  // when a route collision ends the build, and dropping it would make the report depend on which
  // problem happened to be fatal.
  const found: Diagnostic[] = [];
  try {
    const config = await loadConfig(options, cwd);
    found.push(...config.warnings);
    // validate は出力を書き出さないため format（html/pdf/both）に関わらず同じ検証を行う。
    // また pre-render の実描画（Chromium 起動）は行わない。mermaidMode を "client" に上書き
    // してクラス付与のみに留める（pre-render の描画/構文エラーは対象外）。
    // `preparePages` returns the configuration's warnings with its own, so the list it hands back
    // is the whole report on the path where nothing threw.
    const { pages, warnings } = await preparePages(config, cwd, { mermaidMode: "client" });
    return toValidateResult(warnings, pages.length);
  } catch (error) {
    // The error that stopped the run is one more diagnostic, carrying the code it was thrown with
    // (27.3), reported after what had already been found.
    return toValidateResult([...found, toDiagnostic(error)], 0);
  }
}
