import type { Page, SidebarNode } from "../types.js";
import { loadTheme } from "../themes/index.js";
import { escapeAttr, escapeHtml, injectToken } from "../util/html.js";

export type RenderHtmlInput = {
  title: string;
  pages: Page[];
  sidebar: SidebarNode[];
  theme?: string;
};

/** サイドバーのツリーを ul/li の HTML に変換する。 */
function renderSidebar(nodes: SidebarNode[]): string {
  if (nodes.length === 0) return "";
  const items = nodes
    .map((node) => {
      if (node.type === "dir") {
        return (
          `<li class="sidebar-dir">` +
          `<span class="sidebar-dir-title">${escapeHtml(node.title)}</span>` +
          renderSidebar(node.children) +
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

/** Page[] とサイドバーから自己完結した単一 HTML を生成する。 */
export async function renderSingleHtml(input: RenderHtmlInput): Promise<string> {
  const theme = await loadTheme(input.theme ?? "default");

  const sidebarHtml = renderSidebar(input.sidebar);
  const pagesHtml = input.pages.map(renderArticle).join("\n");
  const siteData = safeJson({
    title: input.title,
    routes: input.pages.map((p) => p.route),
    initialRoute: input.pages[0]?.route ?? "/",
  });

  let html = theme.template;
  html = injectToken(html, "{{title}}", escapeHtml(input.title));
  html = injectToken(html, "{{style}}", theme.style);
  html = injectToken(html, "{{sidebar}}", sidebarHtml);
  html = injectToken(html, "{{pages}}", pagesHtml);
  html = injectToken(html, "{{siteDataJson}}", siteData);
  html = injectToken(html, "{{appJs}}", theme.appJs);
  return html;
}
