import type { ResolvedConfig } from "../config.js";

/**
 * Which configuration each field of the earlier build comes from (roadmap 7.3.2).
 *
 * The earlier version is built with its own configuration for what the document contains — which
 * files are pages and how their text reads, the titles and order of its pages, whether `$5` is a
 * formula — and with the new one for how it looks, since there is one output and two
 * configurations competing over it would leave the author unable to tell which one wins.
 *
 * A table over every field, so that a field added to `ResolvedConfig` does not compile until
 * someone decides where it belongs.
 */
const SOURCE: { [K in keyof Required<ResolvedConfig>]: "earlier" | "new" } = {
  // Where the earlier configuration is, for its messages, and what it warned about, which is not
  // reported (the author cannot fix a released version).
  configFilePath: "earlier",
  warnings: "earlier",
  // Which files are pages and how their text reads.
  inputDir: "earlier",
  rootDir: "earlier",
  markdownExtensions: "earlier",
  asciidocExtensions: "earlier",
  include: "earlier",
  exclude: "earlier",
  asciidocAttributes: "earlier",
  lineBreak: "earlier",
  // Page titles, and the order deleted pages are listed in.
  sidebarMode: "earlier",
  sidebarItems: "earlier",
  sidebarTitleFrom: "earlier",
  sidebarTitleTransform: "earlier",
  sidebarFlattenSingleChild: "earlier",
  // What the text means.
  mathEnabled: "earlier",
  mermaidEnabled: "earlier",
  // How it looks, and everything else: the new version's.
  title: "new",
  documentMetadata: "new",
  lang: "new",
  labelOverrides: "new",
  fontCheck: "new",
  outputFile: "new",
  format: "new",
  sidebarCollapseDepth: "new",
  tocMaxLevel: "new",
  numberingSections: "new",
  figuresAlign: "new",
  theme: "new",
  colorScheme: "new",
  contentWidth: "new",
  contentWidthToggle: "new",
  contentWidthDefault: "new",
  imageLightbox: "new",
  branding: "new",
  embedImages: "new",
  maxInlineSize: "new",
  onLargeImage: "new",
  budget: "new",
  onBudget: "new",
  mermaidMode: "new",
  mermaidRuntime: "new",
  codeHighlight: "new",
  pdfPageSize: "new",
  pdfMargin: "new",
  pdfPrintBackground: "new",
  pdfBookmarks: "new",
  pdfPageBreakLevel: "new",
  pdfDensity: "new",
  pdfHeader: "new",
  pdfFooter: "new",
  pdfCover: "new",
  pdfToc: "new",
  pdfWatermark: "new",
};

/** The fields the earlier build takes from the earlier configuration. */
export const EARLIER_FIELDS = (Object.keys(SOURCE) as (keyof ResolvedConfig)[]).filter(
  (key) => SOURCE[key] === "earlier",
);

/**
 * The configuration the earlier version is built with: the new one, with {@link EARLIER_FIELDS}
 * taken from the earlier one, and two adjustments for a build whose output is never shown as it
 * is. `numbering.sections` is off, because the earlier version's numbers are never shown, and
 * numbering would refuse an earlier AsciiDoc document that numbered itself with `:sectnums:`
 * (19.1). `assets.onLargeImage: error` is read as `warn`, because an image too large for the new
 * rules is the past's. The third, what a PDF forces on images, is passed to the build as it is
 * for the new version. The earlier `document.version`, which names the earlier version, is read
 * from the earlier configuration on its own.
 */
export function earlierBuildConfig(
  current: ResolvedConfig,
  earlier: ResolvedConfig,
): ResolvedConfig {
  const merged = { ...current } as Record<keyof ResolvedConfig, unknown>;
  for (const key of EARLIER_FIELDS) merged[key] = earlier[key];
  const config = merged as ResolvedConfig;
  return {
    ...config,
    numberingSections: false,
    onLargeImage: config.onLargeImage === "error" ? "warn" : config.onLargeImage,
  };
}
