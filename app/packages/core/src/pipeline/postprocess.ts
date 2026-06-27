import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Element, Root as HastRoot } from "hast";
import type { OnLargeImage } from "../config.js";
import type { Page } from "../types.js";

/** リンク変換対象とする追加拡張子（AsciiDoc 変換後の .html 相当）。 */
const EXTRA_LINK_EXTENSIONS = [".html", ".htm"];

/** data URI に埋め込む画像の拡張子 → MIME。 */
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export type PostprocessOptions = {
  /** 入力ルート（画像埋め込みをこの配下に jail する）。 */
  inputDir: string;
  /** ソース拡張子（リンク変換対象。設定のカスタム拡張子に追従）。 */
  sourceExtensions: string[];
  embedImages: boolean;
  maxInlineSize: number;
  onLargeImage: OnLargeImage;
  mermaidEnabled: boolean;
};

export type PostprocessResult = {
  warnings: string[];
  /** いずれかのページに Mermaid ブロックが含まれていたか。 */
  hasMermaid: boolean;
};

function normalizePath(p: string): string {
  return p.split("\\").join("/");
}

function stripExtension(p: string): string {
  const ext = posix.extname(p);
  return ext ? p.slice(0, -ext.length) : p;
}

/** 相対パス（拡張子除く・index 正規化済み）→ route のマップを作る。 */
function buildRouteMap(pages: Page[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const page of pages) {
    map.set(stripExtension(normalizePath(page.relativePath)), page.route);
  }
  return map;
}

function hasClass(element: Element, name: string): boolean {
  const cls = element.properties.className;
  return Array.isArray(cls) && cls.includes(name);
}

/**
 * Mermaid のコードブロックを `<pre class="mermaid">` に変換する。
 * Markdown の ```mermaid（`<pre><code class="language-mermaid">`）と
 * AsciiDoc の `[source,mermaid]`（同構造）を共通で扱う。
 */
function processMermaid(tree: HastRoot): boolean {
  let found = false;
  visit(tree, "element", (node) => {
    if (node.tagName !== "pre") return;
    const code = node.children.find(
      (child): child is Element => child.type === "element" && child.tagName === "code",
    );
    if (!code || !hasClass(code, "language-mermaid")) return;
    node.properties = { className: ["mermaid"] };
    node.children = [{ type: "text", value: toText(code) }];
    found = true;
  });
  return found;
}

type LinkResolution = { href: string; hadFragment: boolean } | null | undefined;

/**
 * href を解決する。
 * - オブジェクトを返す → その href に書き換える（hadFragment=見出しアンカーを落とした）
 * - null → ドキュメントへのリンクだが解決できなかった（警告対象）
 * - undefined → 対象外（そのまま）
 */
function resolveHref(
  href: string,
  pageRelPath: string,
  routeMap: Map<string, string>,
  linkExtensions: Set<string>,
): LinkResolution {
  if (!href || href.startsWith("#")) return undefined; // 同一ページ内アンカー等
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return undefined; // http: mailto: data: など
  if (href.startsWith("//") || href.startsWith("/")) return undefined; // 絶対 / プロトコル相対

  const hashIdx = href.indexOf("#");
  const withoutHash = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const qIdx = withoutHash.indexOf("?");
  const pathPart = qIdx === -1 ? withoutHash : withoutHash.slice(0, qIdx);
  if (!pathPart) return undefined;
  if (!linkExtensions.has(posix.extname(pathPart).toLowerCase())) return undefined;

  const dir = posix.dirname(normalizePath(pageRelPath));
  const targetKey = stripExtension(posix.normalize(posix.join(dir, pathPart)));
  const route = routeMap.get(targetKey);
  if (!route) return null;
  return { href: `#${route}`, hadFragment: hashIdx !== -1 };
}

function rewriteLinks(
  tree: HastRoot,
  page: Page,
  routeMap: Map<string, string>,
  linkExtensions: Set<string>,
  warnings: string[],
): void {
  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;
    const href = node.properties.href;
    if (typeof href !== "string") return;
    const resolved = resolveHref(href, page.relativePath, routeMap, linkExtensions);
    if (resolved === null) {
      warnings.push(`Unresolved link "${href}" in "${page.relativePath}".`);
      return;
    }
    if (resolved === undefined) return;
    node.properties.href = resolved.href;
    if (resolved.hadFragment) {
      warnings.push(
        `Heading anchor in "${href}" is not supported yet; linked to page top in "${page.relativePath}".`,
      );
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function isExternalSrc(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("/");
}

/** real が realRoot 配下（または同一）か。 */
function isInside(realRoot: string, real: string): boolean {
  return real === realRoot || real.startsWith(realRoot + sep);
}

async function embedImages(
  tree: HastRoot,
  page: Page,
  options: PostprocessOptions,
  realRoot: string,
  warnings: string[],
): Promise<void> {
  const images: Element[] = [];
  visit(tree, "element", (node) => {
    if (node.tagName === "img") images.push(node);
  });

  const baseDir = dirname(page.sourcePath);
  for (const img of images) {
    const src = img.properties.src;
    if (typeof src !== "string" || !src || isExternalSrc(src)) continue;

    const pathPart = src.split("#")[0]?.split("?")[0] ?? src;
    const ext = posix.extname(pathPart).toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) {
      warnings.push(`Unsupported image type "${src}" in "${page.relativePath}".`);
      continue;
    }

    // symlink を解決した実体パスで存在確認し、入力ルート外への参照を拒否する。
    let real: string;
    try {
      real = await realpath(resolve(baseDir, pathPart));
    } catch {
      warnings.push(`Image not found "${src}" in "${page.relativePath}".`);
      continue;
    }
    if (!isInside(realRoot, real)) {
      warnings.push(`Image outside input directory "${src}" in "${page.relativePath}"; skipped.`);
      continue;
    }

    const size = (await stat(real)).size;
    if (size > options.maxInlineSize) {
      const detail = `"${src}" (${formatBytes(size)} > ${formatBytes(options.maxInlineSize)}) in "${page.relativePath}"`;
      if (options.onLargeImage === "error") {
        throw new Error(`Image exceeds maxInlineSize: ${detail}`);
      }
      if (options.onLargeImage === "external") {
        warnings.push(`Image too large, left as-is: ${detail}`);
        continue;
      }
      warnings.push(`Large image embedded: ${detail}`);
    }

    const data = await readFile(real);
    img.properties.src = `data:${mime};base64,${data.toString("base64")}`;
  }
}

/**
 * 各ページの HTML に対して Mermaid 変換・リンク変換・画像埋め込みを適用し、
 * page.html を更新する。発生した警告と Mermaid 有無を返す。
 */
export async function postprocessPages(
  pages: Page[],
  options: PostprocessOptions,
): Promise<PostprocessResult> {
  const routeMap = buildRouteMap(pages);
  const linkExtensions = new Set([
    ...options.sourceExtensions.map((e) => e.toLowerCase()),
    ...EXTRA_LINK_EXTENSIONS,
  ]);
  const realRoot = await realpath(options.inputDir).catch(() => resolve(options.inputDir));

  const parser = unified().use(rehypeParse, { fragment: true });
  const serializer = unified().use(rehypeStringify);

  const warnings: string[] = [];
  let hasMermaid = false;

  for (const page of pages) {
    const tree = parser.parse(page.html);
    if (options.mermaidEnabled && processMermaid(tree)) hasMermaid = true;
    rewriteLinks(tree, page, routeMap, linkExtensions, warnings);
    if (options.embedImages) await embedImages(tree, page, options, realRoot, warnings);
    page.html = serializer.stringify(tree);
  }

  return { warnings, hasMermaid };
}
