// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLabels } from "../../labels.js";
import { loadTheme } from "../index";

/**
 * 既定の app.js が、`siteDataJson` で届いたラベルを実際に DOM へ書いているか。
 *
 * ここでは既定表とは重ならない値を渡す。英語の既定表を渡して英語を期待すると、
 * app.js が英語を自前で持ち続けていても通ってしまい、「core が正本」という保証を
 * まったく検証しないテストになる。
 */
const MARKED = Object.fromEntries(
  Object.keys(resolveLabels("en").labels).map((key) => [key, `«${key}»`]),
) as Record<string, string>;

async function mountClient(labels: Record<string, string>): Promise<void> {
  const theme = await loadTheme("default");

  document.body.className = "";
  document.body.innerHTML =
    `<div id="app">` +
    `<aside id="sidebar">` +
    `<div class="sidebar-tools"><input id="search-input" type="search" /></div>` +
    `<ul id="search-results" hidden></ul>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list">` +
    `<li class="sidebar-page"><a data-route="/a" href="#/a">A</a></li>` +
    `<li class="sidebar-page"><a data-route="/b" href="#/b">B</a></li>` +
    `</ul></nav>` +
    `</aside>` +
    `<main id="content">` +
    `<article class="page" data-route="/a"><pre><code>code</code></pre>` +
    `<img src="x.png" alt="a picture" /></article>` +
    `<article class="page" data-route="/b" hidden>B body</article>` +
    `<nav id="page-nav"></nav>` +
    `</main>` +
    `<aside id="toc"><nav id="toc-nav"></nav></aside>` +
    // 画像の操作名は lightbox の設定時に付くので、ダイアログが無いとその経路自体が走らない。
    `<dialog id="image-lightbox"><button id="image-lightbox-close">×</button>` +
    `<img id="image-lightbox-image" alt="" />` +
    `<figcaption id="image-lightbox-caption" hidden></figcaption></dialog>` +
    `</div>`;

  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
    initialRoute: "/a",
    labels,
    pages: [
      { route: "/a", title: "A", hidden: false, headings: [], text: "alpha" },
      { route: "/b", title: "B", hidden: false, headings: [], text: "beta" },
    ],
  };

  new Function(theme.appJs)();
}

describe("the client applies the labels core published", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("writes the published prev/next labels into the page navigation", async () => {
    await mountClient(MARKED);
    const nav = document.getElementById("page-nav")!;
    expect(nav.textContent).toContain("«next»");

    window.location.hash = "#/b";
    window.dispatchEvent(new Event("hashchange"));
    expect(document.getElementById("page-nav")!.textContent).toContain("«prev»");
  });

  it("writes the published label when a search finds nothing", async () => {
    await mountClient(MARKED);
    const input = document.getElementById("search-input") as HTMLInputElement;
    input.value = "zzzzzz";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".search-empty")!.textContent).toBe("«noResults»");
  });

  it("writes the published labels onto the code block and image controls", async () => {
    await mountClient(MARKED);
    const buttons = document.querySelectorAll("#content .code-toolbar button");
    const titles = Array.from(buttons).map((b) => b.getAttribute("title"));
    expect(titles).toContain("«wrapToggle»");
    expect(titles).toContain("«copy»");
    expect(
      document
        .querySelector("#content .code-toolbar button:last-child")
        ?.getAttribute("aria-label"),
    ).toBe("«copyCode»");
    // 画像の操作名は alt と組み合わせて作る。
    expect(document.querySelector("#content img")?.getAttribute("aria-label")).toBe(
      "«openImagePreview»: a picture",
    );
  });

  it("writes the published label onto the result list and the search box state", async () => {
    await mountClient(MARKED);
    expect(document.getElementById("search-results")?.getAttribute("aria-label")).toBe(
      "«searchResults»",
    );
  });

  it("escapes a published label instead of letting it become markup", async () => {
    // ラベルは設定ファイル由来なので、innerHTML へ入る経路では文書タイトルと同じ扱いが要る。
    await mountClient({
      ...MARKED,
      next: '<img src=x onerror="window.__labelXss = true">',
      noResults: "<b>none</b>",
    });
    const nav = document.getElementById("page-nav")!;
    expect(nav.querySelector("img")).toBeNull();
    expect(nav.textContent).toContain("<img src=x");

    const input = document.getElementById("search-input") as HTMLInputElement;
    input.value = "zzzzzz";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".search-empty")!.querySelector("b")).toBeNull();
    expect((window as unknown as { __labelXss?: boolean }).__labelXss).toBeUndefined();
  });
});
