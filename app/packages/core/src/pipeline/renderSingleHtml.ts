import type { Page, SidebarNode } from "../types.js";
import { loadTheme } from "../themes/index.js";
import { escapeAttr, escapeHtml, injectToken } from "../util/html.js";

export type RenderHtmlInput = {
  title: string;
  pages: Page[];
  sidebar: SidebarNode[];
  theme?: string;
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

/** Page[] とサイドバーから自己完結した単一 HTML を生成する。 */
export async function renderSingleHtml(input: RenderHtmlInput): Promise<string> {
  const theme = await loadTheme(input.theme ?? "default");
  const tocMaxLevel = input.tocMaxLevel ?? 3;

  const sidebarHtml = renderSidebar(input.sidebar, input.sidebarCollapseDepth);
  const pagesHtml = input.pages.map(renderArticle).join("\n");
  const siteData = safeJson({
    title: input.title,
    initialRoute: input.pages[0]?.route ?? "/",
    // 目次・検索・前後ナビ用のページメタ（本文 HTML は含めない）。
    pages: input.pages.map((page) => pageData(page, tocMaxLevel)),
  });

  let html = theme.template;
  html = injectToken(html, "{{title}}", escapeHtml(input.title));
  html = injectToken(html, "{{style}}", theme.style);
  html = injectToken(html, "{{sidebar}}", sidebarHtml);
  html = injectToken(html, "{{pages}}", pagesHtml);
  html = injectToken(html, "{{siteDataJson}}", siteData);
  html = injectToken(html, "{{appJs}}", theme.appJs);
  html = injectToken(html, "{{bodyScripts}}", input.bodyScripts ?? "");
  return html;
}
