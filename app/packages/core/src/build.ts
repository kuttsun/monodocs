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
import type { Root as HastRoot } from "hast";
import { loadConfig, type MermaidMode, type OnLargeImage, type ResolvedConfig } from "./config.js";
import { bySeverity, type Diagnostic, MonodocsError, toDiagnostic, warn } from "./diagnostics.js";
import {
  assertDiffSupported,
  assertNoDiff,
  earlierLabel,
  inEarlierVersion,
  loadEarlierConfig,
} from "./diff/earlier.js";
import { compareVersions, type PageComparison } from "./diff/compare.js";
import { earlierBuildConfig } from "./diff/earlierConfig.js";
import {
  earlierRelocator,
  relocateEarlierPages,
  sharedClockAttributes,
} from "./diff/earlierLocation.js";
import { refuseLfsPointer } from "./diff/lfsPointer.js";
import { earlierIdPrefix, elementIds, writeChangedPages } from "./diff/write.js";
import { CHANGES_ROUTE, writeDiffDocument, type DiffDocument } from "./diff/changes.js";
import { loadTheme } from "./themes/index.js";
import {
  documentAuthor,
  documentCoverParts,
  documentKeywords,
  documentSubject,
} from "./documentMeta.js";
import { resolveDiffLabels, resolveLabels } from "./labels.js";
import { readSourceFile, scanSourceFiles } from "./scan.js";
import { createMarkdownRenderer } from "./sources/markdown/renderer.js";
import { createAsciidocRenderer, withoutAsciidoctorLog } from "./sources/asciidoc/renderer.js";
import { buildPages } from "./pipeline/buildPages.js";
import { buildCustomSidebar, buildSidebar, orderPagesBySidebar } from "./pipeline/buildSidebar.js";
import { postprocessPages, type PostprocessOptions } from "./pipeline/postprocess.js";
import { numberSidebar } from "./pipeline/sectionNumbers.js";
import {
  createPuppeteerPrerenderer,
  type MermaidPrerenderer,
} from "./pipeline/mermaidPrerender.js";
import { createPuppeteerPdfGenerator, type PdfGenerator } from "./pipeline/renderPdf.js";
import { sidebarToOutline } from "./pipeline/pdfOutline.js";
import { buildPdfCover } from "./pipeline/pdfCover.js";
import { buildPdfToc } from "./pipeline/pdfToc.js";
import { renderSingleHtmlParts } from "./pipeline/renderSingleHtml.js";
import {
  checkBudget,
  type EmbeddedImage,
  measureFile,
  measureHtml,
  type OutputSize,
} from "./pipeline/outputSize.js";
import { mermaidRuntimeScript } from "./themes/mermaid.js";
import { loadMathFont, mathFontHead } from "./themes/mathFont.js";
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
  /**
   * Called with every file the build reads — a page, an included file, an image — and its content.
   * The earlier version's build refuses an LFS pointer with it (roadmap 7.3.1).
   */
  checkRead?: (path: string, content: Buffer | string) => void;
  /** Called with every image Asciidoctor read itself and wrote into a page, and those bytes. */
  checkEmbedded?: (page: Page, content: Buffer) => void;
  /**
   * Rewrites the pages as the renderers wrote them, before the sidebar takes their titles and
   * before post-processing splits their text — highlighting cuts a path into tokens.
   */
  relocate?: (pages: Page[]) => Page[];
  /** Rewrites a page title before `sidebar.titleTransform` changes its characters. */
  relocateTitle?: (title: string) => string;
  /** Keep each page's tree with what comparison needs (7.3.2), as {@link PreparedSite.trees}. */
  record?: boolean;
  /** What the version's pre-rendered diagram IDs start with. */
  mermaidIdPrefix?: string;
};

export type PreparedSite = {
  pages: Page[];
  /** Each page's tree by page ID, with what comparison needs; only when asked to record. */
  trees?: Map<string, HastRoot>;
  sidebar: SidebarNode[];
  warnings: Diagnostic[];
  hasMermaid: boolean;
  embeddedImages: EmbeddedImage[];
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

  if (opts.checkRead !== undefined) {
    for (const source of sources) opts.checkRead(source.absolutePath, source.raw);
  }

  const rendered = await buildPages(
    sources,
    [
      createMarkdownRenderer({ lineBreak: config.lineBreak, math: config.mathEnabled }),
      createAsciidocRenderer(config.asciidocAttributes, rootDir, {
        lineBreak: config.lineBreak,
        refuseSectnums: config.numberingSections !== false,
        math: config.mathEnabled,
        checkInclude: opts.checkRead,
        markNumbers: opts.record === true,
      }),
    ],
    {
      titleTransform: config.sidebarTitleTransform.page,
      titleFrom: config.sidebarTitleFrom,
      ...(opts.relocateTitle === undefined ? {} : { rewriteTitle: opts.relocateTitle }),
      sourceExtensions: [...config.markdownExtensions, ...config.asciidocExtensions],
    },
  );
  const { warnings } = rendered;
  const pages = opts.relocate === undefined ? rendered.pages : opts.relocate(rendered.pages);
  // The sidebar comes first: it needs only titles and paths, and with numbering on it decides
  // every page's number, which post-processing writes into the headings (19.1).
  const custom =
    config.sidebarMode === "custom" ? buildCustomSidebar(pages, config.sidebarItems) : undefined;
  let sidebar =
    custom?.sidebar ??
    buildSidebar(pages, {
      titleTransform: config.sidebarTitleTransform.directory,
      flattenSingleChild: config.sidebarFlattenSingleChild,
    });
  let sectionNumbers: PostprocessOptions["sectionNumbers"];
  if (config.numberingSections !== false) {
    const numbered = numberSidebar(sidebar);
    sidebar = numbered.sidebar;
    sectionNumbers = { depth: config.numberingSections, pageNumbers: numbered.pageNumbers };
  }

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
    figureAlign: config.figuresAlign,
    sectionNumbers,
    checkRead: opts.checkRead,
    checkEmbedded: opts.checkEmbedded,
    ...(opts.record === true ? { record: true } : {}),
    ...(opts.mermaidIdPrefix === undefined ? {} : { mermaidIdPrefix: opts.mermaidIdPrefix }),
  });
  // custom はサイドバーが閲覧順そのものになるため、ページの並びもそれに合わせる
  // （前後ナビ・PDF のページ順・初期表示ページが一致する）。
  if (custom !== undefined) {
    return {
      pages: orderPagesBySidebar(pages, custom.orderedPages),
      sidebar,
      warnings: [...config.warnings, ...warnings, ...post.warnings, ...custom.warnings],
      hasMermaid: post.hasMermaid,
      embeddedImages: post.embeddedImages,
      ...(post.trees === undefined ? {} : { trees: post.trees }),
    };
  }

  return {
    pages,
    sidebar,
    warnings: [...config.warnings, ...warnings, ...post.warnings],
    hasMermaid: post.hasMermaid,
    embeddedImages: post.embeddedImages,
    ...(post.trees === undefined ? {} : { trees: post.trees }),
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
/** What the earlier version's pre-rendered diagram IDs start with (roadmap 7.3.2). */
export const EARLIER_MERMAID_ID_PREFIX = "mermaid-earlier-";

export type BuildInternals = {
  mermaidPrerenderer?: MermaidPrerenderer;
  pdfGenerator?: PdfGenerator;
  /** The clock a build with a difference reads its one instant from (7.3.2). For tests. */
  now?: () => Date;
  /** What makes the Mermaid pre-renderer when none is passed. For tests. */
  createPrerenderer?: typeof createPuppeteerPrerenderer;
  /** Called with the comparison of the two versions, in a build with a difference. For tests. */
  onCompared?: (pages: PageComparison[]) => void;
  /** Called with each version's pages once they are built, in a build with a difference. */
  onPrepared?: (version: "new" | "earlier", site: PreparedSite) => void;
  /** Called with the new version's pages once the difference is written into them. For tests. */
  onWritten?: (pages: Page[]) => void;
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
  // One instant for both builds of a difference, taken before either reads the clock (7.3.2).
  const startedAt = internals.now?.() ?? new Date();
  const loadedConfig = await loadConfig(options, cwd);
  const clock = options.diff === undefined ? {} : sharedClockAttributes(startedAt);
  const withClock = (c: ResolvedConfig): ResolvedConfig =>
    Object.keys(clock).length === 0
      ? c
      : { ...c, asciidocAttributes: { ...clock, ...c.asciidocAttributes } };
  const config = withClock(loadedConfig);
  // The earlier version (7.3), built with its own configuration for what the document contains
  // and with the new one for how it looks (7.3.2).
  let earlierConfig: ResolvedConfig | undefined;
  // What names the earlier version in the list of changes, when it says (7.3.4).
  let earlierVersion: string | undefined;
  if (options.diff !== undefined) {
    assertDiffSupported(config, options.diff);
    const loaded = await loadEarlierConfig(options, cwd, options.diff);
    earlierConfig = withClock(earlierBuildConfig(loadedConfig, loaded));
    earlierVersion = loaded.documentMetadata.version;
  }

  // PDF は配布時に読者のファイルシステム上の相対画像を参照できないため、PDF を出力する場合は
  // 画像を data URI として埋め込む必要がある。embedImages: false や onLargeImage: external
  // （大きい画像を外部参照のまま残す）は PDF から画像を欠落させるので、PDF 出力時は上書きする。
  const needsPdf = config.format === "pdf" || config.format === "both";
  const forceEmbed = needsPdf && !config.embedImages;
  const forceLargeEmbed = needsPdf && config.onLargeImage === "external";

  // pre-render mode では各図をビルド時に SVG 化する。レンダラは lazy 起動なので
  // 図が 0 個なら Chromium は起動しない。注入時（テスト）は close も呼び出し側が管理する。
  // The carried math font, read once and only if a PDF has a formula (roadmap 6.4).
  let mathFontStyle: Promise<string> | undefined;
  const mathFont = () => (mathFontStyle ??= loadMathFont().then(mathFontHead));

  const ownPrerenderer = internals.mermaidPrerenderer === undefined;
  const prerenderer =
    internals.mermaidPrerenderer ??
    // Decided over both versions, so an earlier diagram is drawn when the new version has none
    // or has Mermaid off (7.3.2).
    ((config.mermaidEnabled || earlierConfig?.mermaidEnabled === true) &&
    config.mermaidMode === "pre-render"
      ? (internals.createPrerenderer ?? createPuppeteerPrerenderer)({
          colorScheme: config.colorScheme,
          // A PDF's labels are laid out in the font the PDF sets them in; the HTML's are not.
          mathFont: needsPdf
            ? { head: mathFont, mode: config.format === "pdf" ? "only" : "variant" }
            : undefined,
        })
      : undefined);

  let prepared: PreparedSite;
  let earlierSite: PreparedSite | undefined;
  try {
    prepared = await preparePages(config, cwd, {
      mermaidPrerenderer: prerenderer,
      embedImages: forceEmbed ? true : undefined,
      onLargeImage: forceLargeEmbed ? "warn" : undefined,
      record: options.diff !== undefined,
    });
    if (options.diff !== undefined && earlierConfig !== undefined) {
      const diff = options.diff;
      const settings = earlierConfig;
      // Its warnings are not reported: the author cannot fix a released version, and a report
      // doubled by the past hides what can be fixed now. A hard error stops the build, its paths
      // shown in the earlier version (7.3.2).
      const earlier = await inEarlierVersion(diff, cwd, () =>
        withoutAsciidoctorLog(() =>
          preparePages(settings, resolve(cwd, diff.dir), {
            mermaidPrerenderer: prerenderer,
            embedImages: forceEmbed ? true : undefined,
            onLargeImage: forceLargeEmbed ? "warn" : undefined,
            checkRead: refuseLfsPointer,
            checkEmbedded: (page, content) =>
              refuseLfsPointer(page.sourcePath, content, "embedded"),
            relocate: (pages) => relocateEarlierPages(pages, diff, cwd),
            relocateTitle: earlierRelocator(diff, cwd).text,
            record: true,
            // The pre-renderer numbers IDs from a counter that restarts in every call, so the
            // earlier build's diagrams use a prefix of their own (7.3.2).
            mermaidIdPrefix: EARLIER_MERMAID_ID_PREFIX,
          }),
        ),
      );
      internals.onPrepared?.("earlier", earlier);
      earlierSite = earlier;
    }
    // The earlier version's diagrams are checked too: a deleted one is drawn in the output with
    // this machine's fonts, as the new version's are. What the check finds is the machine's, not
    // either version's, so it is reported as it is in any build (7.3.2).
    // pre-render は本文と違って、ビルドマシンのフォントを SVG へ焼き込む。図を描いた文脈が
    // まだ開いているこの時点で確かめる（fontCheck: error なら例外が出てビルドは止まる）。
    await prerenderer?.checkFonts?.({
      mode: config.fontCheck,
      onWarning: (message) => prepared.warnings.push(message),
    });
  } finally {
    if (ownPrerenderer) await prerenderer?.close();
  }
  // The difference, written into the new version's pages (7.3.4).
  let diffDocument: DiffDocument | undefined;
  // The document as it would be without the difference, which the size report measures against.
  let withoutDiff: { pages: Page[]; sidebar: SidebarNode[] } | undefined;
  let earlierImages: PreparedSite["embeddedImages"] = [];
  let deletedDiagrams = 0;
  if (options.diff !== undefined && earlierSite !== undefined) {
    internals.onPrepared?.("new", prepared);
    const next = prepared.trees ?? new Map<string, HastRoot>();
    const old = earlierSite.trees ?? new Map<string, HastRoot>();
    const comparison = compareVersions(
      { pages: prepared.pages, trees: next },
      { pages: earlierSite.pages, trees: old },
    );
    internals.onCompared?.(comparison);
    withoutDiff = { pages: prepared.pages.map((page) => ({ ...page })), sidebar: prepared.sidebar };
    // The list of changes' route is one no path gives but a name beginning with a backslash, which
    // `toRoute` reads as a separator (7.3.4).
    const taken = prepared.pages.find((page) => page.route === CHANGES_ROUTE);
    if (taken !== undefined) {
      throw new MonodocsError(
        "page/duplicate-route",
        t("pages.changesRouteCollision", { route: CHANGES_ROUTE, path: taken.relativePath }),
      );
    }
    // The IDs the list of changes and deleted SVGs avoid: the pages' and the theme template's own.
    const theme = await loadTheme(config.theme);
    const ids = [
      ...elementIds(next.values()),
      ...[...theme.template.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]!),
    ];
    const write = {
      svgIdPrefix: earlierIdPrefix(
        ids,
        prepared.pages.map((page) => page.id),
      ),
      // Kept only while no ID of the new version shares it.
      earlierDiagramPrefix: ids.some((id) => id.startsWith(EARLIER_MERMAID_ID_PREFIX))
        ? undefined
        : EARLIER_MERMAID_ID_PREFIX,
    };
    deletedDiagrams = writeChangedPages(comparison, { next, old }, write);
    diffDocument = writeDiffDocument(
      comparison,
      { pages: prepared.pages, sidebar: prepared.sidebar },
      { pages: earlierSite.pages, sidebar: earlierSite.sidebar, trees: old },
      {
        labels: resolveDiffLabels(config.lang, config.labelOverrides),
        // The earlier version is named by its own `document.version`, else by the argument that
        // named it, as written.
        names: {
          from: earlierVersion?.trim() || earlierLabel(options.diff),
          to: config.documentMetadata.version,
        },
        write,
        elementIds: ids,
      },
    );
    deletedDiagrams += diffDocument.deletedDiagrams;
    // An image both versions embed is counted once, under the new version's path (20.5).
    const shared = new Set(prepared.embeddedImages.map((image) => image.dataUri));
    earlierImages = earlierSite.embeddedImages.filter((image) => !shared.has(image.dataUri));
    internals.onWritten?.(diffDocument.pages);
  }
  const { warnings, hasMermaid } = prepared;
  const pages = diffDocument?.pages ?? prepared.pages;
  const sidebar = diffDocument?.sidebar ?? prepared.sidebar;
  if (forceEmbed || forceLargeEmbed) {
    warnings.unshift(warn("image/embedded-for-pdf", t("build.pdfImagesEmbedded")));
  }

  // pre-render は静的 SVG なのでランタイム JS を注入しない（client mode のときだけ注入）。
  // A deleted diagram is drawn in the browser too, when the new version has none or has Mermaid
  // off (7.3.2).
  const ownMermaid = hasMermaid && config.mermaidEnabled && config.mermaidMode === "client";
  const clientMermaid = ownMermaid || (deletedDiagrams > 0 && config.mermaidMode === "client");
  const bodyScripts = clientMermaid ? await mermaidRuntimeScript(config.mermaidRuntime) : "";

  // ラベルの解決はここで 1 度だけ行う。同梱の表が無いタグの警告も、ビルド 1 回につき 1 度になる。
  const resolvedLabels = resolveLabels(config.lang, config.labelOverrides);
  if (resolvedLabels.warning !== undefined) warnings.push(resolvedLabels.warning);

  const renderInput = {
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
    pdfWatermark: config.pdfWatermark,
    pdfPageBreakLevel: config.pdfPageBreakLevel,
    contentWidthToggle: config.contentWidthToggle,
    contentWidthDefault: config.contentWidthDefault,
    imageLightbox: config.imageLightbox,
    branding: config.branding,
    generatorVersion: options.generatorVersion,
    sidebarCollapseDepth: config.sidebarCollapseDepth,
    tocMaxLevel: config.tocMaxLevel,
    bodyScripts,
  };
  const { html, siteDataJson } = await renderSingleHtmlParts({
    ...renderInput,
    ...(diffDocument === undefined
      ? {}
      : { diff: { states: diffDocument.states, labels: diffDocument.labels } }),
  });

  const outputs = resolveOutputs(config, cwd);
  const written: string[] = [];
  const sizes: OutputSize[] = [];
  const onBudget = options.onBudget ?? config.onBudget;

  if (outputs.html) {
    await mkdir(dirname(outputs.html), { recursive: true });
    await writeFile(outputs.html, html, "utf8");
    written.push(outputs.html);
    const runtime = (on: boolean) => (on && config.mermaidRuntime === "inline" ? bodyScripts : "");
    const images = [...prepared.embeddedImages, ...earlierImages];
    // With a difference, the same document without it, rendered for the size report alone: what
    // the file holds beyond it is the difference's line (20.5, 7.3.4).
    const without =
      withoutDiff === undefined
        ? undefined
        : await renderSingleHtmlParts({
            ...renderInput,
            pages: withoutDiff.pages,
            sidebar: withoutDiff.sidebar,
            bodyScripts: ownMermaid ? bodyScripts : "",
          });
    const size = await measureHtml(
      outputs.html,
      html,
      {
        images,
        // Only the inline runtime is the runtime; a CDN reference is a few bytes of document.
        mermaidRuntime: runtime(clientMermaid),
        siteDataJson,
      },
      without === undefined
        ? undefined
        : {
            html: without.html,
            parts: {
              images,
              mermaidRuntime: runtime(ownMermaid),
              siteDataJson: without.siteDataJson,
            },
          },
    );
    sizes.push(size);
    checkBudget(size, sizes, config.budget, onBudget, warnings);
  }

  if (outputs.pdf) {
    const ownGenerator = internals.pdfGenerator === undefined;
    const generator = internals.pdfGenerator ?? createPuppeteerPdfGenerator();
    try {
      const pdf = await generator.render(withPdfVariants(html, prerenderer?.pdfVariants?.()), {
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
        cover: config.pdfCover
          ? buildPdfCover({
              title: config.title,
              parts: documentCoverParts(config.documentMetadata, resolvedLabels.labels),
              lang: config.lang,
              pageLabel: resolvedLabels.labels.cover,
              watermark: config.pdfWatermark,
            })
          : undefined,
        toc: config.pdfToc.enabled
          ? buildPdfToc(sidebar, pages, config.pdfToc.depth, resolvedLabels.labels.contents)
          : undefined,
        header: config.pdfHeader,
        footer: config.pdfFooter,
        fontCheck: config.fontCheck,
        watermark: config.pdfWatermark,
        mathFont,
        onWarning: (message) => warnings.push(message),
      });
      await mkdir(dirname(outputs.pdf), { recursive: true });
      await writeFile(outputs.pdf, pdf);
      written.push(outputs.pdf);
      const size = await measureFile(outputs.pdf);
      sizes.push(size);
      checkBudget(size, sizes, config.budget, onBudget, warnings);
    } finally {
      if (ownGenerator) await generator.close();
    }
  }

  // The document's own pages: the list of changes is generated, not one of them.
  return { outputs: written, pages: prepared.pages.length, warnings, sizes };
}

/**
 * The HTML the PDF is printed from: the document, with each pre-rendered diagram that has a formula
 * in a label swapped for the one laid out in the carried math font. The SVG is in the document
 * verbatim and carries an id no other element has, so it is replaced as a string, once.
 */
function withPdfVariants(html: string, variants: ReadonlyMap<string, string> | undefined): string {
  if (variants === undefined || variants.size === 0) return html;
  let out = html;
  for (const [svg, variant] of variants) {
    const at = out.indexOf(svg);
    if (at !== -1) out = out.slice(0, at) + variant + out.slice(at + svg.length);
  }
  return out;
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
    assertNoDiff(options, "validate");
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
