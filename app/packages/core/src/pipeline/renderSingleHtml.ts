import type { Page, SidebarNode } from "../types.js";
import { parseContentWidth, type ColorScheme, type ContentWidthDefault } from "../config.js";
import { loadTheme } from "../themes/index.js";
import { escapeAttr, escapeHtml, injectToken } from "../util/html.js";

export type RenderHtmlInput = {
  title: string;
  pages: Page[];
  sidebar: SidebarNode[];
  theme?: string;
  /** ドキュメントを開いたときの初期配色（未指定は "light"）。読者の選択があればそちらが優先。 */
  colorScheme?: ColorScheme;
  /** 本文領域の最大幅。`full` / `none` の場合は利用可能な横幅いっぱいに広げる。 */
  contentWidth?: string;
  /** 読者向けの本文幅切替ボタンを表示するか。未指定は true。 */
  contentWidthToggle?: boolean;
  /** Initial state when the content-width toggle is shown. Defaults to standard. */
  contentWidthDefault?: ContentWidthDefault;
  /** Whether the image lightbox is enabled. Defaults to true. */
  imageLightbox?: boolean;
  /**
   * この階層より深いディレクトリを既定で折りたたむ（隠さず畳むだけなので到達性は失わない）。
   * undefined は折りたたみなし。トップレベルのディレクトリを深さ 1 とする。
   */
  sidebarCollapseDepth?: number;
  /** ページ内目次に出す見出しの最深レベル（2〜6）。未指定は h3 まで。 */
  tocMaxLevel?: number;
  /** </body> 直前に挿入する追加スクリプト（例: Mermaid ランタイム）。 */
  bodyScripts?: string;
};

/**
 * サイドバーのツリーを ul/li の HTML に変換する。
 * `collapseDepth` 指定時は、その階層より深いディレクトリに `collapsed` を付けて
 * 既定で畳む（クライアントの開閉トグルでいつでも開ける）。`depth` はトップレベルを 1 とする。
 */
function renderSidebar(nodes: SidebarNode[], collapseDepth?: number, depth = 1): string {
  if (nodes.length === 0) return "";
  const items = nodes
    .map((node) => {
      if (node.type === "dir") {
        const collapsed = collapseDepth !== undefined && depth > collapseDepth ? " collapsed" : "";
        return (
          `<li class="sidebar-dir${collapsed}">` +
          `<span class="sidebar-dir-title">${escapeHtml(node.title)}</span>` +
          renderSidebar(node.children, collapseDepth, depth + 1) +
          `</li>`
        );
      }
      return (
        `<li class="sidebar-page">` +
        // href は encodeURI（route の "/" は保持）。data-route はクライアントで
        // decode 後に比較するため生の route を保持する。
        `<a href="#${escapeAttr(encodeURI(node.route))}" data-route="${escapeAttr(node.route)}">` +
        `${escapeHtml(node.title)}</a></li>`
      );
    })
    .join("");
  return `<ul class="sidebar-list">${items}</ul>`;
}

/** 1 ページ分の <article> を生成する。先頭ページのみ表示、他は hidden。 */
function renderArticle(page: Page, index: number): string {
  const hidden = index === 0 ? "" : " hidden";
  return (
    `<article class="page" data-route="${escapeAttr(page.route)}"` +
    ` id="page-${escapeAttr(page.id)}"${hidden}>\n${page.html}\n</article>`
  );
}

/** </script> での早期終了を防ぐため、JSON 中の `<` をエスケープする。 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** 設定由来のテーマ CSS 変数を追加する。公開レンダリング境界でも値を検証する。 */
function styleWithOverrides(style: string, input: RenderHtmlInput): string {
  const overrides: string[] = [];
  if (input.contentWidth !== undefined) {
    overrides.push(`  --content-max-width: ${parseContentWidth(input.contentWidth)};`);
  }
  if (overrides.length === 0) return style;
  return `${style}\n:root {\n${overrides.join("\n")}\n}\n`;
}

/** クライアント（目次・検索・前後ナビ）へ渡す 1 ページ分のデータ。 */
function pageData(
  page: Page,
  tocMaxLevel: number,
): {
  route: string;
  title: string;
  hidden: boolean;
  headings: { id: string; text: string; level: number }[];
  text: string;
} {
  return {
    route: page.route,
    title: page.title,
    hidden: page.hidden === true,
    // 目次は h2 以降を対象にする（h1 はページタイトル相当のため除外）。最深レベルは設定で可変。
    headings: page.headings
      .filter((h) => h.level >= 2 && h.level <= tocMaxLevel)
      .map((h) => ({ id: h.id, text: h.text, level: h.level })),
    text: page.text,
  };
}

/**
 * 設定由来の初期配色を `<html>` の属性として返す。
 * `light` / `dark` は `data-theme` を出力して CSS 評価前に配色を確定させ、
 * FOUC（ダーク OS で一瞬ダーク表示→ライトへ反転）と JS 無効時の未適用を防ぐ。
 * `auto`（および未指定）は属性を出さず OS の `prefers-color-scheme` に追従する。
 * 読者がトグルで切り替えた選択（localStorage）は app.js が読み込み後に上書きする。
 */
function rootThemeAttr(colorScheme: ColorScheme | undefined): string {
  if (colorScheme === "light" || colorScheme === "dark") {
    return ` data-theme="${colorScheme}"`;
  }
  return "";
}

/** Return the `<body>` attribute that applies the configured width before client JS runs. */
function bodyContentWidthAttr(
  contentWidthToggle: boolean | undefined,
  contentWidthDefault: ContentWidthDefault | undefined,
): string {
  return contentWidthToggle !== false && contentWidthDefault === "wide"
    ? ' class="content-wide"'
    : "";
}

/** Return the initial accessible state for the content-width toggle button. */
function contentWidthToggleState(contentWidthDefault: ContentWidthDefault): {
  pressed: string;
  title: string;
} {
  return contentWidthDefault === "wide"
    ? { pressed: "true", title: "Use standard content width" }
    : { pressed: "false", title: "Use wide content" };
}

/** テーマ内の単純な条件ブロックを残すか、内容ごと除去する。 */
function renderConditionalBlock(template: string, name: string, enabled: boolean): string {
  const start = `{{#${name}}}`;
  const end = `{{/${name}}}`;
  const startIndex = template.indexOf(start);
  const endIndex = template.indexOf(end, startIndex + start.length);
  // この機能に対応していないカスタムテーマはそのまま扱う。
  if (startIndex === -1 || endIndex === -1) return template;
  if (enabled) {
    return (
      template.slice(0, startIndex) +
      template.slice(startIndex + start.length, endIndex) +
      template.slice(endIndex + end.length)
    );
  }
  return template.slice(0, startIndex) + template.slice(endIndex + end.length);
}

/** Page[] とサイドバーから自己完結した単一 HTML を生成する。 */
export async function renderSingleHtml(input: RenderHtmlInput): Promise<string> {
  const theme = await loadTheme(input.theme ?? "default");
  const tocMaxLevel = input.tocMaxLevel ?? 3;
  // 既定はライト。サーバ出力の data-theme と __MONODOCS_DATA__ の値を必ず一致させる。
  const colorScheme: ColorScheme = input.colorScheme ?? "light";
  const contentWidthDefault: ContentWidthDefault = input.contentWidthDefault ?? "standard";
  const contentWidthState = contentWidthToggleState(contentWidthDefault);

  const sidebarHtml = renderSidebar(input.sidebar, input.sidebarCollapseDepth);
  const pagesHtml = input.pages.map(renderArticle).join("\n");
  const siteData = safeJson({
    title: input.title,
    initialRoute: input.pages[0]?.route ?? "/",
    // 読者がまだ配色を選んでいないときに使う初期配色（"light" / "dark" / "auto"）。
    colorScheme,
    // Initial state used until the reader stores a choice ("standard" / "wide").
    contentWidthDefault,
    // 目次・検索・前後ナビ用のページメタ（本文 HTML は含めない）。
    pages: input.pages.map((page) => pageData(page, tocMaxLevel)),
  });

  let html = renderConditionalBlock(
    theme.template,
    "contentWidthToggle",
    input.contentWidthToggle !== false,
  );
  html = renderConditionalBlock(html, "imageLightbox", input.imageLightbox !== false);
  html = injectToken(html, "{{htmlAttrs}}", rootThemeAttr(colorScheme));
  html = injectToken(
    html,
    "{{bodyAttrs}}",
    bodyContentWidthAttr(input.contentWidthToggle, contentWidthDefault),
  );
  html = injectToken(html, "{{contentWidthTogglePressed}}", contentWidthState.pressed);
  html = injectToken(html, "{{contentWidthToggleTitle}}", contentWidthState.title);
  html = injectToken(html, "{{title}}", escapeHtml(input.title));
  html = injectToken(html, "{{style}}", styleWithOverrides(theme.style, input));
  html = injectToken(html, "{{sidebar}}", sidebarHtml);
  html = injectToken(html, "{{pages}}", pagesHtml);
  html = injectToken(html, "{{siteDataJson}}", siteData);
  html = injectToken(html, "{{appJs}}", theme.appJs);
  html = injectToken(html, "{{bodyScripts}}", input.bodyScripts ?? "");
  return html;
}
