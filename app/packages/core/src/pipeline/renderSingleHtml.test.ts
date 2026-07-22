import { describe, expect, it } from "vitest";
import { renderSingleHtml } from "./renderSingleHtml";
import type { Page, SidebarNode } from "../types";

function page(route: string, id: string, title: string): Page {
  return {
    id,
    route,
    sourcePath: "",
    relativePath: id + ".md",
    format: "markdown",
    title,
    rawSource: "",
    html: `<p>${title}</p>`,
    text: title,
    headings: [],
    links: [],
    assets: [],
  };
}

describe("renderSingleHtml", () => {
  it("encodes non-ASCII routes in href but keeps data-route raw", async () => {
    const pages: Page[] = [page("/ガイド", "ガイド", "ガイド")];
    const sidebar: SidebarNode[] = [
      { type: "page", title: "ガイド", route: "/ガイド", pageId: "ガイド" },
    ];

    const html = await renderSingleHtml({ title: "T", pages, sidebar });

    // href はブラウザの percent-encode と一致するよう encodeURI 済み。
    expect(html).toContain(`href="#${encodeURI("/ガイド")}"`);
    // data-route はクライアントで decode 後に比較するため生のまま。
    expect(html).toContain('data-route="/ガイド"');
    expect(html).toContain("__MONODOCS_DATA__");
    expect(html).toContain('id="content-width-toggle"');
  });

  it("escapes HTML special characters in titles", async () => {
    const pages: Page[] = [page("/p", "p", "A & <B>")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "A & <B>", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar });
    expect(html).toContain("A &amp; &lt;B&gt;");
  });

  it("injects the configured content width as a theme CSS variable", async () => {
    const pages: Page[] = [page("/p", "p", "Page")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Page", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar, contentWidth: "none" });

    expect(html).toContain("--content-max-width: 860px;");
    expect(html).toContain("--content-max-width: none;");
  });

  it("omits the content-width toggle when disabled", async () => {
    const pages: Page[] = [page("/p", "p", "Page")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Page", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({
      title: "T",
      pages,
      sidebar,
      contentWidthToggle: false,
    });

    expect(html).not.toContain('id="content-width-toggle"');
    expect(html).not.toContain("{{#contentWidthToggle}}");
    expect(html).not.toContain("{{/contentWidthToggle}}");
  });

  it("rejects unsafe content width values at the render boundary", async () => {
    const pages: Page[] = [page("/p", "p", "Page")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Page", route: "/p", pageId: "p" }];

    await expect(
      renderSingleHtml({
        title: "T",
        pages,
        sidebar,
        contentWidth: "860px;} body{display:none}",
      }),
    ).rejects.toThrow(/contentWidth/);
  });

  it("embeds per-page data (h2/h3 headings + text) for TOC and search", async () => {
    const p = page("/g", "g", "Guide");
    p.text = "searchable body text";
    p.headings = [
      { level: 1, id: "g-guide", text: "Guide" },
      { level: 2, id: "g-install", text: "Install" },
      { level: 3, id: "g-step", text: "Step" },
      { level: 4, id: "g-deep", text: "Deep" },
    ];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Guide", route: "/g", pageId: "g" }];

    const html = await renderSingleHtml({ title: "T", pages: [p], sidebar });
    const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
    const data = JSON.parse(json.replace(/\\u003c/g, "<"));

    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].text).toBe("searchable body text");
    // 目次は h2/h3 のみ（h1 と h4 は除外）。
    expect(data.pages[0].headings.map((h: { id: string }) => h.id)).toEqual([
      "g-install",
      "g-step",
    ]);
  });

  it("respects toc.maxLevel when embedding headings", async () => {
    const p = page("/g", "g", "Guide");
    p.headings = [
      { level: 2, id: "g-h2", text: "H2" },
      { level: 3, id: "g-h3", text: "H3" },
      { level: 4, id: "g-h4", text: "H4" },
    ];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Guide", route: "/g", pageId: "g" }];

    const html = await renderSingleHtml({ title: "T", pages: [p], sidebar, tocMaxLevel: 4 });
    const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
    const data = JSON.parse(json.replace(/\\u003c/g, "<"));
    // maxLevel 4 なら h4 まで目次に含む。
    expect(data.pages[0].headings.map((h: { id: string }) => h.id)).toEqual([
      "g-h2",
      "g-h3",
      "g-h4",
    ]);
  });

  it("collapses directories deeper than collapseDepth by default", async () => {
    const pages: Page[] = [page("/a/b/c", "a-b-c", "Deep")];
    // a (depth 1) > b (depth 2) > page。collapseDepth=1 なら depth 2 以降を畳む。
    const sidebar: SidebarNode[] = [
      {
        type: "dir",
        title: "a",
        path: "a",
        children: [
          {
            type: "dir",
            title: "b",
            path: "a/b",
            children: [{ type: "page", title: "Deep", route: "/a/b/c", pageId: "a-b-c" }],
          },
        ],
      },
    ];

    const html = await renderSingleHtml({ title: "T", pages, sidebar, sidebarCollapseDepth: 1 });
    // depth 1 の "a" は展開、depth 2 の "b" は collapsed。
    expect(html).toContain('<li class="sidebar-dir"><span class="sidebar-dir-title">a</span>');
    expect(html).toContain(
      '<li class="sidebar-dir collapsed"><span class="sidebar-dir-title">b</span>',
    );
  });

  it("does not collapse any directory when collapseDepth is unset", async () => {
    const pages: Page[] = [page("/a/b", "a-b", "Page")];
    const sidebar: SidebarNode[] = [
      {
        type: "dir",
        title: "a",
        path: "a",
        children: [{ type: "page", title: "Page", route: "/a/b", pageId: "a-b" }],
      },
    ];

    const html = await renderSingleHtml({ title: "T", pages, sidebar });
    expect(html).not.toContain("sidebar-dir collapsed");
  });

  it("emits data-theme on <html> and embeds the configured color scheme", async () => {
    const pages: Page[] = [page("/p", "p", "Page")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Page", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar, colorScheme: "dark" });

    // CSS 評価前に配色を確定させるため <html> に data-theme を出力する。
    expect(html).toContain('<html lang="ja" data-theme="dark">');
    const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
    const data = JSON.parse(json.replace(/\\u003c/g, "<"));
    expect(data.colorScheme).toBe("dark");
  });

  it("defaults the color scheme to light", async () => {
    const pages: Page[] = [page("/p", "p", "Page")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Page", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar });

    expect(html).toContain('<html lang="ja" data-theme="light">');
    const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
    const data = JSON.parse(json.replace(/\\u003c/g, "<"));
    expect(data.colorScheme).toBe("light");
  });

  it("omits data-theme for the auto color scheme so it follows the OS", async () => {
    const pages: Page[] = [page("/p", "p", "Page")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "Page", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar, colorScheme: "auto" });

    // <html> タグには data-theme を付けない（CSS セレクタ内の data-theme は別物なので
    // タグ単位で検証する）。
    expect(html).toContain('<html lang="ja">');
    const htmlTag = html.match(/<html[^>]*>/)?.[0] ?? "";
    expect(htmlTag).not.toContain("data-theme");
    const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
    const data = JSON.parse(json.replace(/\\u003c/g, "<"));
    expect(data.colorScheme).toBe("auto");
  });

  it("marks hidden pages in the embedded data", async () => {
    const p = page("/s", "s", "Secret");
    p.hidden = true;
    const sidebar: SidebarNode[] = [];

    const html = await renderSingleHtml({ title: "T", pages: [p], sidebar });
    const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
    const data = JSON.parse(json.replace(/\\u003c/g, "<"));
    expect(data.pages[0].hidden).toBe(true);
  });
});
