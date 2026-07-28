// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadTheme } from "../index";

type ClientHeading = { id: string; text: string; level: number };
type ClientPage = {
  route: string;
  title: string;
  hidden: boolean;
  headings: ClientHeading[];
  text: string;
};

/**
 * 検索に必要な最小の DOM（検索欄・結果リスト・見出しを含む本文）を組み立て、
 * クライアント app.js を実行して v0.8 の検索挙動を検証する。
 */
async function mountClient(
  pages: ClientPage[],
  options: { tocMaxLevel?: number } = {},
): Promise<void> {
  const theme = await loadTheme("default");

  const links = pages
    .filter((p) => !p.hidden)
    .map(
      (p) =>
        `<li class="sidebar-page"><a data-route="${p.route}" href="#${p.route}">${p.title}</a></li>`,
    )
    .join("");
  // 見出しへ飛べることを確認するため、本文にも実際の見出し要素を置く。
  const articles = pages
    .map(
      (p, i) =>
        `<article class="page" data-route="${p.route}"${i === 0 ? "" : " hidden"}>` +
        p.headings.map((h) => `<h${h.level} id="${h.id}">${h.text}</h${h.level}>`).join("") +
        `</article>`,
    )
    .join("");

  document.body.innerHTML =
    `<div id="app">` +
    `<aside id="sidebar">` +
    `<div class="sidebar-tools"><input id="search-input" type="search" /></div>` +
    `<ul id="search-results" hidden></ul>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list">${links}</ul></nav>` +
    `</aside>` +
    `<main id="content">${articles}<nav id="page-nav"></nav></main>` +
    `<aside id="toc"><nav id="toc-nav"></nav></aside>` +
    `</div>`;

  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
    initialRoute: pages[0]?.route,
    tocMaxLevel: options.tocMaxLevel,
    pages,
  };

  new Function(theme.appJs)();
}

function typeQuery(query: string): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  input.value = query;
  input.dispatchEvent(new Event("input"));
}

function resultRoutes(): (string | null)[] {
  return Array.from(document.querySelectorAll("#search-results a")).map((a) =>
    a.getAttribute("data-route"),
  );
}

function page(route: string, title: string, extra: Partial<ClientPage> = {}): ClientPage {
  return {
    route,
    title,
    hidden: extra.hidden ?? false,
    headings: extra.headings ?? [],
    text: extra.text ?? title,
  };
}

const SAMPLE: ClientPage[] = [
  page("/", "Home", { text: "Welcome. This manual explains the install steps." }),
  page("/guide", "Guide", {
    text: "Install the CLI first, then configure the output. Configure the PDF margins later.",
    headings: [
      { id: "guide-install", text: "Install the CLI", level: 2 },
      { id: "guide-configure", text: "Configure output", level: 3 },
      { id: "guide-troubleshooting", text: "Install troubleshooting", level: 4 },
    ],
  }),
  page("/install", "Install", { text: "Nothing else here." }),
  page("/secret", "Secret", { hidden: true, text: "install secret" }),
];

describe("v0.8 search (app.js)", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("requires every keyword to match (AND) across title, headings, and text", async () => {
    await mountClient(SAMPLE);

    typeQuery("install configure");
    // /guide だけが両方の語を含む。
    expect(resultRoutes()).toEqual(["/guide"]);

    typeQuery("install nonexistent");
    expect(document.querySelector("#search-results .search-empty")).not.toBeNull();
  });

  it("ranks a title match above a heading match, and a heading match above body text", async () => {
    await mountClient(SAMPLE);

    typeQuery("install");
    // /install（タイトル一致）> /guide（見出し一致）> /（本文のみ）。hidden は対象外。
    expect(resultRoutes()).toEqual(["/install", "/guide", "/"]);
  });

  it("links a heading match to the heading and navigates there", async () => {
    await mountClient(SAMPLE);

    typeQuery("configure");
    const link = document.querySelector("#search-results a[data-route='/guide']")!;
    expect(link.getAttribute("data-heading")).toBe("guide-configure");
    expect(link.getAttribute("href")).toBe("#guide-configure");
    expect(document.querySelector("#search-results .search-result-heading")?.textContent).toBe(
      "Configure output",
    );

    (link as HTMLElement).click();
    // 再読み込み・共有・戻るでも同じ見出しに戻れるよう、hash に見出しアンカーを残す。
    expect(window.location.hash).toBe("#guide-configure");
    window.dispatchEvent(new Event("hashchange"));
    const shown = Array.from(
      document.querySelectorAll<HTMLElement>("#content article[data-route]"),
    ).filter((el) => !el.hidden);
    expect(shown.map((el) => el.getAttribute("data-route"))).toEqual(["/guide"]);
  });

  it("shows the target page when the same heading result is clicked again", async () => {
    await mountClient(SAMPLE);

    // すでに同じ hash にいる場合は hashchange が起きないため、クリックで直接処理する。
    window.location.hash = "#guide-configure";
    typeQuery("configure");
    const link = document.querySelector(
      "#search-results a[data-heading='guide-configure']",
    ) as HTMLElement;
    link.click();
    expect(window.location.hash).toBe("#guide-configure");
    const shown = Array.from(
      document.querySelectorAll<HTMLElement>("#content article[data-route]"),
    ).filter((el) => !el.hidden);
    expect(shown.map((el) => el.getAttribute("data-route"))).toEqual(["/guide"]);
  });

  it("falls back to the page top when only the title or body matches", async () => {
    await mountClient(SAMPLE);

    typeQuery("welcome");
    const link = document.querySelector("#search-results a[data-route='/']")!;
    expect(link.getAttribute("data-heading")).toBeNull();
    expect(link.getAttribute("href")).toBe("#/");
    expect(document.querySelector("#search-results .search-result-heading")).toBeNull();
  });

  it("highlights every keyword in the title, heading, and snippet", async () => {
    await mountClient(SAMPLE);

    typeQuery("install configure");
    const marks = Array.from(document.querySelectorAll("#search-results .search-result mark")).map(
      (m) => m.textContent,
    );
    expect(marks).toContain("Install");
    expect(marks).toContain("Configure");
    // スニペットは両方の語を含む位置を選ぶ。
    const snippet = document.querySelector("#search-results .search-result-snippet")!;
    expect(snippet.querySelectorAll("mark").length).toBeGreaterThanOrEqual(2);
  });

  it("searches headings that the table of contents hides at toc.maxLevel", async () => {
    await mountClient(SAMPLE, { tocMaxLevel: 3 });

    // h4 見出しは目次に出ないが検索対象で、その見出しへ飛ぶ。
    typeQuery("troubleshooting");
    const link = document.querySelector("#search-results a[data-route='/guide']")!;
    expect(link.getAttribute("data-heading")).toBe("guide-troubleshooting");

    window.location.hash = "#/guide";
    window.dispatchEvent(new Event("hashchange"));
    const tocIds = Array.from(document.querySelectorAll("#toc-nav a[data-heading]")).map((a) =>
      a.getAttribute("data-heading"),
    );
    expect(tocIds).toEqual(["guide-install", "guide-configure"]);
  });

  it("matches case and full-width variants of the same term", async () => {
    await mountClient(SAMPLE);

    typeQuery("PDF");
    expect(resultRoutes()).toEqual(["/guide"]);
    // 全角で入力しても同じ結果になる。
    typeQuery("ｐｄｆ");
    expect(resultRoutes()).toEqual(["/guide"]);
  });

  it("splits keywords on ideographic spaces and matches Japanese substrings", async () => {
    await mountClient([
      page("/ja", "インストール", {
        text: "監査ログの設定はインストール後に行う。設定ファイルは YAML。",
        headings: [{ id: "ja-config", text: "設定ファイル", level: 2 }],
      }),
      page("/other", "その他", { text: "インストールのみ" }),
    ]);

    typeQuery("インストール　設定");
    expect(resultRoutes()).toEqual(["/ja"]);
  });

  it("lowercases in context so a Greek final sigma still matches", async () => {
    await mountClient([page("/greek", "Greek", { text: "ΛΟΓΟΣ について" })]);

    // 文字単位の小文字化では語末シグマ（ς）にならず、この検索が外れる。
    typeQuery("λογος");
    expect(resultRoutes()).toEqual(["/greek"]);
  });

  it("gives the phrase bonus regardless of which whitespace separates the keywords", async () => {
    await mountClient([
      // 文書順では先だが語順どおりには並んでいないページ。
      page("/a", "A", { text: "設定の説明。別の段落でインストールに触れる。" }),
      // 全角空白を挟んで語順どおりに並ぶページ。
      page("/b", "B", { text: "インストール　設定の説明。" }),
    ]);

    typeQuery("インストール 設定");
    expect(resultRoutes()).toEqual(["/b", "/a"]);
  });
});
