import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { toText } from "hast-util-to-text";
import { EXIT, SKIP, visit } from "unist-util-visit";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { OnLargeImage } from "../config.js";
import type { Page } from "../types.js";

/** コードハイライトに使う配色（shiki の dual theme。ダークは CSS で切替）。 */
const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;

// shiki は重いので、ハイライトが実際に必要になったときだけ動的 import する。
type CodeToHast = typeof import("shiki").codeToHast;
let codeToHastFn: CodeToHast | null = null;
async function loadCodeToHast(): Promise<CodeToHast> {
  if (!codeToHastFn) {
    const shiki = await import("shiki");
    codeToHastFn = shiki.codeToHast;
  }
  return codeToHastFn;
}

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
  codeHighlight: boolean;
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

/** Admonition / GFM alert の種別（Markdown と AsciiDoc で共通の 5 種）。 */
const ADMONITION_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
type AdmonitionType = (typeof ADMONITION_TYPES)[number];

/** 共通構造で表示するラベル（GitHub / Asciidoctor 既定に合わせ英語で統一）。 */
const ADMONITION_LABEL: Record<AdmonitionType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

/**
 * Markdown blockquote 先頭の GFM alert マーカー（`> [!NOTE]` など）。
 * GitHub に合わせ、マーカーは行頭・1 行単独であることを要求する
 * （同じ行に続く本文があるものは alert として扱わない）。
 */
const ALERT_MARKER = /^[^\S\n]*\[!(note|tip|important|warning|caution)\][^\S\n]*(?:\r?\n|$)/i;

/** 種別と本文から共通の admonition 構造（`.admonition`）を組み立てる。 */
function makeAdmonition(type: AdmonitionType, content: ElementContent[]): Element {
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["admonition", `admonition-${type}`] },
    children: [
      {
        type: "element",
        tagName: "p",
        properties: { className: ["admonition-title"] },
        children: [{ type: "text", value: ADMONITION_LABEL[type] }],
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["admonition-content"] },
        children: content,
      },
    ],
  };
}

/**
 * 元要素の `id` を正規化後の admonition に引き継ぐ。
 * AsciiDoc の `[#anchor]` 付き admonition は `prefixIdsAndCollect`（renderer 段）で
 * id を prefix 済み・同一文書内 xref も書き換え済みなので、ここで id を捨てると
 * `<<anchor>>` の参照先が消えてしまう。少なくとも id は保持する。
 */
function carryId(from: Element, to: Element): void {
  const id = from.properties.id;
  if (id != null && id !== "") to.properties.id = id;
}

/** node 配下から最初の `td.content`（AsciiDoc admonition の本文セル）の子を返す。 */
function findAdmonitionContent(node: Element): ElementContent[] | null {
  let content: ElementContent[] | null = null;
  visit(node, "element", (el) => {
    if (el.tagName === "td" && hasClass(el, "content")) {
      content = el.children;
      return EXIT;
    }
    return undefined;
  });
  return content;
}

/**
 * Markdown の GFM alerts（`> [!NOTE]` など）と AsciiDoc の admonition
 * （Asciidoctor 出力の `.admonitionblock`）を、共通の `.admonition` 構造へ正規化する。
 * 5 種（note/tip/important/warning/caution）は両形式で一致するため共通化できる。
 * Mermaid / shiki と同じく、形式ごとの出力を postprocess で共通構造に揃える。
 */
function processAdmonitions(tree: HastRoot): void {
  type Match = { parent: { children: ElementContent[] }; index: number; replacement: Element };
  const matches: Match[] = [];

  visit(tree, "element", (node, index, parent) => {
    if (!parent || typeof index !== "number") return undefined;

    // AsciiDoc: <div class="admonitionblock TYPE"><table>...<td class="content">…</td>
    if (node.tagName === "div" && hasClass(node, "admonitionblock")) {
      const type = ADMONITION_TYPES.find((t) => hasClass(node, t));
      if (!type) return undefined;
      const replacement = makeAdmonition(type, findAdmonitionContent(node) ?? []);
      carryId(node, replacement); // `[#anchor]` 付きブロックの id を保持
      matches.push({ parent: parent as { children: ElementContent[] }, index, replacement });
      return SKIP; // 本文セルの再走査・二重変換を避ける
    }

    // Markdown (GFM alert): <blockquote><p>[!NOTE]\n…</p>…</blockquote>
    if (node.tagName === "blockquote") {
      const firstEl = node.children.find((c): c is Element => c.type === "element");
      if (!firstEl || firstEl.tagName !== "p") return undefined;
      const firstText = firstEl.children[0];
      if (!firstText || firstText.type !== "text") return undefined;
      const marker = ALERT_MARKER.exec(firstText.value);
      if (!marker) return undefined;
      const type = marker[1]!.toLowerCase() as AdmonitionType;

      // マーカー（と直後の改行）を本文から取り除く。
      firstText.value = firstText.value.slice(marker[0].length);
      // マーカーだけの段落（`> [!NOTE]\n>\n> 本文` 形式）は空になるので除去する。
      if (toText(firstEl).trim() === "") {
        node.children = node.children.filter((c) => c !== firstEl);
      }

      const replacement = makeAdmonition(type, node.children);
      carryId(node, replacement); // blockquote 自体に付いた id があれば保持
      matches.push({ parent: parent as { children: ElementContent[] }, index, replacement });
      return SKIP;
    }

    return undefined;
  });

  // 1:1 置換なので index は安定（収集順＝文書順のまま差し替えてよい）。
  for (const m of matches) {
    m.parent.children[m.index] = m.replacement;
  }
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
    // whitespace:"pre" で改行を保持する（Mermaid は文の区切りに改行が必要）。
    node.children = [{ type: "text", value: toText(code, { whitespace: "pre" }) }];
    found = true;
  });
  return found;
}

/** code 要素の className から言語名（language-xxx）を取り出す。 */
function languageOf(code: Element): string | undefined {
  const cls = code.properties.className;
  if (!Array.isArray(cls)) return undefined;
  for (const c of cls) {
    if (typeof c === "string" && c.startsWith("language-")) return c.slice("language-".length);
  }
  return undefined;
}

type CodeBlock = {
  parent: { children: ElementContent[] };
  index: number;
  lang: string;
  code: string;
};

/**
 * `<pre><code class="language-xxx">` を shiki で構文ハイライトする。
 * Markdown / AsciiDoc とも同じ構造（language-xxx）なので共通で扱える。
 * Mermaid ブロック（processMermaid 済み）や言語指定の無いブロックは対象外。
 * 未対応言語は素のテキストとしてハイライトし、失敗時は元のまま残す。
 */
async function highlightCode(tree: HastRoot): Promise<void> {
  const blocks: CodeBlock[] = [];
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName !== "pre" || !parent || typeof index !== "number") return;
    const code = node.children.find(
      (child): child is Element => child.type === "element" && child.tagName === "code",
    );
    if (!code) return;
    const lang = languageOf(code);
    if (!lang || lang === "mermaid") return;
    blocks.push({
      parent: parent as { children: ElementContent[] },
      index,
      lang,
      // whitespace:"pre" で改行・インデントを保持する（複数行コードのため）。
      code: toText(code, { whitespace: "pre" }),
    });
  });
  if (blocks.length === 0) return;

  const codeToHast = await loadCodeToHast();
  for (const block of blocks) {
    let root: HastRoot;
    try {
      root = await codeToHast(block.code, { lang: block.lang, themes: SHIKI_THEMES });
    } catch {
      // 未対応言語などは素のテキスト（plaintext）としてハイライトする。
      try {
        root = await codeToHast(block.code, { lang: "text", themes: SHIKI_THEMES });
      } catch {
        continue; // それも失敗するなら元の <pre> を残す。
      }
    }
    const pre = root.children.find(
      (child): child is Element => child.type === "element" && child.tagName === "pre",
    );
    if (pre) block.parent.children[block.index] = pre;
  }
}

type LinkResolution = { href: string; hadFragment: boolean } | null | undefined;
type SourceLocation = { line: number; column: number };

function safeDecodeUri(value: string): string | undefined {
  try {
    return decodeURI(value);
  } catch {
    return undefined;
  }
}

function decodePathPart(pathPart: string): string {
  return safeDecodeUri(pathPart) ?? pathPart;
}

function replaceHrefExtension(href: string, nextExt: string): string | undefined {
  const hashIdx = href.indexOf("#");
  const beforeHash = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : href.slice(hashIdx);
  const qIdx = beforeHash.indexOf("?");
  const pathPart = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx);
  const query = qIdx === -1 ? "" : beforeHash.slice(qIdx);
  const ext = posix.extname(pathPart);
  if (!ext) return undefined;
  return `${pathPart.slice(0, -ext.length)}${nextExt}${query}${hash}`;
}

function sourceHrefVariants(href: string, linkExtensions: Set<string>): string[] {
  const variants = new Set<string>([href]);
  const decoded = safeDecodeUri(href);
  if (decoded) variants.add(decoded);

  for (const value of [...variants]) {
    const ext = posix.extname(value.split("#")[0]?.split("?")[0] ?? "").toLowerCase();
    if (ext !== ".html" && ext !== ".htm") continue;
    for (const sourceExt of linkExtensions) {
      if (sourceExt === ".html" || sourceExt === ".htm") continue;
      const replaced = replaceHrefExtension(value, sourceExt);
      if (replaced) variants.add(replaced);
    }
  }

  return [...variants].filter((v) => v.length > 0);
}

function hrefMatches(
  sourceHref: string,
  renderedHref: string,
  linkExtensions: Set<string>,
): boolean {
  if (sourceHref === renderedHref) return true;
  return (
    sourceHrefVariants(renderedHref, linkExtensions).includes(sourceHref) ||
    sourceHrefVariants(sourceHref, linkExtensions).includes(renderedHref)
  );
}

function findRawSourceLocations(rawSource: string, needles: string[]): SourceLocation[] {
  if (!rawSource || needles.length === 0) return [];
  const seen = new Set<string>();
  const locations: SourceLocation[] = [];
  const lines = rawSource.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    for (const needle of needles) {
      let columnIdx = line.indexOf(needle);
      while (columnIdx !== -1) {
        const key = `${i + 1}:${columnIdx + 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          locations.push({ line: i + 1, column: columnIdx + 1 });
        }
        columnIdx = line.indexOf(needle, columnIdx + Math.max(needle.length, 1));
      }
    }
  }

  return locations.sort((a, b) => a.line - b.line || a.column - b.column);
}

class SourceLocationTracker {
  private readonly linkCursors = new Map<string, number>();
  private readonly rawCursors = new Map<string, number>();
  private readonly rawCache = new Map<string, SourceLocation[]>();

  constructor(
    private readonly page: Page,
    private readonly linkExtensions: Set<string>,
  ) {}

  consume(href: string): SourceLocation | undefined {
    return this.consumeLinkLocation(href) ?? this.consumeRawLocation(href);
  }

  private consumeLinkLocation(href: string): SourceLocation | undefined {
    const matches = this.page.links
      .filter((link) => link.line != null && hrefMatches(link.href, href, this.linkExtensions))
      .map((link) => ({ line: link.line!, column: link.column ?? 1 }));
    if (matches.length === 0) return undefined;

    const cursor = this.linkCursors.get(href) ?? 0;
    this.linkCursors.set(href, cursor + 1);
    return matches[Math.min(cursor, matches.length - 1)];
  }

  private consumeRawLocation(href: string): SourceLocation | undefined {
    let locations = this.rawCache.get(href);
    if (!locations) {
      locations = findRawSourceLocations(
        this.page.rawSource,
        sourceHrefVariants(href, this.linkExtensions),
      );
      this.rawCache.set(href, locations);
    }
    if (locations.length === 0) return undefined;

    const cursor = this.rawCursors.get(href) ?? 0;
    this.rawCursors.set(href, cursor + 1);
    return locations[Math.min(cursor, locations.length - 1)];
  }
}

function formatSourceRef(page: Page, href: string, locations: SourceLocationTracker): string {
  const location = locations.consume(href);
  return location ? `${page.relativePath}:${location.line}` : page.relativePath;
}

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
  const targetKey = stripExtension(posix.normalize(posix.join(dir, decodePathPart(pathPart))));
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
  locations: SourceLocationTracker,
): void {
  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;
    const href = node.properties.href;
    if (typeof href !== "string") return;
    const resolved = resolveHref(href, page.relativePath, routeMap, linkExtensions);
    if (resolved === null) {
      warnings.push(`Unresolved link "${href}" in "${formatSourceRef(page, href, locations)}".`);
      return;
    }
    if (resolved === undefined) return;
    node.properties.href = resolved.href;
    if (resolved.hadFragment) {
      warnings.push(
        `Heading anchor in "${href}" is not supported yet; linked to page top in "${formatSourceRef(page, href, locations)}".`,
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
    // admonition を共通構造へ正規化してから Mermaid / ハイライト / リンク変換にかける
    // （正規化後も内部の <pre>/<a>/<img> は後続処理の対象になる）。
    processAdmonitions(tree);
    if (options.mermaidEnabled && processMermaid(tree)) hasMermaid = true;
    // Mermaid 変換後にハイライト（mermaid ブロックは対象外になる）。
    if (options.codeHighlight) await highlightCode(tree);
    rewriteLinks(
      tree,
      page,
      routeMap,
      linkExtensions,
      warnings,
      new SourceLocationTracker(page, linkExtensions),
    );
    if (options.embedImages) await embedImages(tree, page, options, realRoot, warnings);
    page.html = serializer.stringify(tree);
  }

  return { warnings, hasMermaid };
}
