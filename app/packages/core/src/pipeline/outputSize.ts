import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { type Diagnostic, MonodocsError, warn } from "../diagnostics.js";
import { t } from "../messages.js";

/** An image embedded as a data URI, by the path it was read from (relative to the root). */
export type EmbeddedImage = { path: string; dataUri: string };

/** Where the bytes of a single HTML went (roadmap 20.5). The parts sum to `bytes`. */
export type HtmlBreakdown = {
  images: { bytes: number; files: number; largest?: { path: string; bytes: number } };
  /** The Mermaid runtime when `mermaid.runtime: inline` put it in the file; 0 otherwise. */
  mermaid: number;
  /** The `siteDataJson` payload: page text, headings, and search data. */
  pageData: number;
  /** Everything else: the pages' HTML, the theme, the scripts, the sidebar. */
  document: number;
};

export type OutputSize = {
  path: string;
  /** Bytes on disk, read back after the file was written. */
  bytes: number;
  /** Only for HTML; a PDF is one opaque file. */
  breakdown?: HtmlBreakdown;
};

/** How many times `needle` occurs in `haystack`, without overlap. */
function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    count++;
  }
  return count;
}

/** Bytes of `needle` in `haystack`, counted once per occurrence. */
function occurrenceBytes(haystack: string, needle: string): number {
  return occurrences(haystack, needle) * Buffer.byteLength(needle, "utf8");
}

/**
 * Measures a written single HTML. The total is the file's size on disk, read after it is
 * complete; each part is what that part occupies in the final text, found by searching the text
 * rather than estimated while building, and `document` is the remainder so the parts sum to the
 * file exactly.
 */
export async function measureHtml(
  path: string,
  html: string,
  parts: { images: EmbeddedImage[]; mermaidRuntime: string; siteDataJson: string },
): Promise<OutputSize> {
  const bytes = (await stat(path)).size;

  // Keyed by the data URI, so identical files that produced the same URI are not counted twice.
  // A copy is matched as a whole attribute value, quotes included: a URI can be a prefix of
  // another (the same image with one more trailing byte), and a bare substring search would count
  // the shorter one inside the longer one.
  const byUri = new Map<string, Set<string>>();
  for (const image of parts.images) {
    const files = byUri.get(image.dataUri) ?? new Set<string>();
    files.add(image.path);
    byUri.set(image.dataUri, files);
  }
  let imageBytes = 0;
  let fileCount = 0;
  let largest: { path: string; bytes: number } | undefined;
  for (const [dataUri, files] of byUri) {
    const copies = occurrences(html, `"${dataUri}"`);
    if (copies === 0) continue;
    const copyBytes = Buffer.byteLength(dataUri, "utf8");
    imageBytes += copies * copyBytes;
    fileCount += files.size;
    // The largest image is the largest single copy: what one image costs, which is what a reader
    // acts on, rather than how often it was referenced.
    const [first] = [...files].sort();
    if (!largest || copyBytes > largest.bytes) largest = { path: first!, bytes: copyBytes };
  }

  const mermaid = occurrenceBytes(html, parts.mermaidRuntime);
  const pageData = occurrenceBytes(html, parts.siteDataJson);
  return {
    path,
    bytes,
    breakdown: {
      images: { bytes: imageBytes, files: fileCount, largest },
      mermaid,
      pageData,
      document: bytes - imageBytes - mermaid - pageData,
    },
  };
}

/** Measures a written file that has no breakdown (the PDF). */
export async function measureFile(path: string): Promise<OutputSize> {
  return { path, bytes: (await stat(path)).size };
}

/**
 * Compares one output, just measured, with `assets.budget`. Unset, nothing is checked. `warn` adds
 * a warning; `error` fails the build with the size report of everything measured so far in the
 * message, because the breakdown is what the author needs to act on and a failed build returns no
 * result to print it from. The file stays in place for inspection.
 *
 * Called after each output rather than once at the end, so an HTML over budget under `error` fails
 * before the PDF is rendered from it.
 */
export function checkBudget(
  size: OutputSize,
  measured: OutputSize[],
  budget: number | undefined,
  onBudget: "warn" | "error",
  warnings: Diagnostic[],
): void {
  if (budget === undefined || size.bytes <= budget) return;
  const message = t("build.overBudget", {
    file: basename(size.path),
    size: formatSize(size.bytes),
    budget: formatSize(budget),
  });
  if (onBudget === "error") {
    throw new MonodocsError(
      "output/over-budget",
      [message, ...sizeReportLines(measured)].join("\n"),
    );
  }
  warnings.push(warn("output/over-budget", message));
}

/** "8.4 MB" / "512.0 KB" / "300 B", in binary units like `maxInlineSize`. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * The lines a build prints about its outputs: each file's size and, for the HTML, where it went.
 * Images and the Mermaid runtime get a line only when the file holds some; Shiki never does,
 * because highlighting leaves no runtime in the output.
 */
export function sizeReportLines(sizes: OutputSize[]): string[] {
  const lines: string[] = [];
  for (const size of sizes) {
    lines.push(t("cli.size.total", { file: basename(size.path), size: formatSize(size.bytes) }));
    const parts = size.breakdown;
    if (!parts) continue;
    if (parts.images.largest) {
      lines.push(
        t("cli.size.images", {
          size: formatSize(parts.images.bytes),
          files: parts.images.files,
          largest: parts.images.largest.path,
          largestSize: formatSize(parts.images.largest.bytes),
        }),
      );
    }
    if (parts.mermaid > 0) lines.push(t("cli.size.mermaid", { size: formatSize(parts.mermaid) }));
    lines.push(t("cli.size.pageData", { size: formatSize(parts.pageData) }));
    lines.push(t("cli.size.document", { size: formatSize(parts.document) }));
  }
  return lines;
}
