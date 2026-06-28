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
  });

  it("escapes HTML special characters in titles", async () => {
    const pages: Page[] = [page("/p", "p", "A & <B>")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "A & <B>", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar });
    expect(html).toContain("A &amp; &lt;B&gt;");
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
