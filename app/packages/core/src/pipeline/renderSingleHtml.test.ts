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
    expect(html).toContain("__SINGLE_DOCS_DATA__");
  });

  it("escapes HTML special characters in titles", async () => {
    const pages: Page[] = [page("/p", "p", "A & <B>")];
    const sidebar: SidebarNode[] = [{ type: "page", title: "A & <B>", route: "/p", pageId: "p" }];

    const html = await renderSingleHtml({ title: "T", pages, sidebar });
    expect(html).toContain("A &amp; &lt;B&gt;");
  });
});
