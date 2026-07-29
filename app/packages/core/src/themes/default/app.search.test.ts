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
  /** Body HTML placed in the article after the headings (for the in-body highlight; not client data). */
  html?: string;
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
        (p.html ?? "") +
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
    // html is a DOM-side concern, so it stays out of the client data, as in a generated document.
    pages: pages.map((p) => ({
      route: p.route,
      title: p.title,
      hidden: p.hidden,
      headings: p.headings,
      text: p.text,
    })),
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
    html: extra.html,
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

/** 仮名・記号の書き分けを畳む（v0.9）。伸ばす記号は `―`（U+2015）と `ー`（U+30FC）を混ぜてある。 */
const KANA: ClientPage[] = [
  page("/katakana", "インストール", { text: "サーバー の設定手順。" }),
  page("/hiragana", "いんすとーる", { text: "せってい の手順。" }),
  page("/dash", "サーバ―の設定", { text: "ダッシュを書き分けたページ。" }),
];

describe("v0.9 search folding (app.js)", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("matches hiragana and katakana forms of the same term", async () => {
    await mountClient(KANA);

    typeQuery("インストール");
    expect(resultRoutes()).toEqual(["/katakana", "/hiragana"]);
    // ひらがなで入力しても同じ結果になる（同点はいずれも文書順）。
    typeQuery("いんすとーる");
    expect(resultRoutes()).toEqual(["/katakana", "/hiragana"]);
  });

  it("highlights the original katakana when the query is hiragana", async () => {
    await mountClient(KANA);

    // 畳んだ文字列は原文と長さが等しいので、ハイライト位置が原文のままずれない。
    typeQuery("いんすとーる");
    const link = document.querySelector("#search-results a[data-route='/katakana']")!;
    expect(link.querySelector(".search-result-title mark")!.textContent).toBe("インストール");
  });

  it("treats prolonged-sound and dash variants as the same character", async () => {
    await mountClient(KANA);

    // `サーバ―`（U+2015）のページも `サーバー`（U+30FC）で引ける。タイトル一致が本文一致より上。
    typeQuery("サーバー");
    expect(resultRoutes()).toEqual(["/dash", "/katakana"]);
  });

  it("leaves half-width katakana unmatched, the documented boundary of folding", async () => {
    await mountClient(KANA);

    // 濁点付き半角カナ（ｶ + ﾞ）は 2 文字 → 1 文字で長さが変わり、位置を共有する
    // ハイライトが成立しないため畳まない。roadmap 22.3 に記録した制限。
    typeQuery("ｲﾝｽﾄｰﾙ");
    expect(document.querySelector("#search-results .search-empty")).not.toBeNull();
  });
});

function pressKey(key: string, init: KeyboardEventInit = {}): boolean {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event.defaultPrevented;
}

/** IME 変換中の keydown。ブラウザは変換中も keydown を送り、`isComposing` を立てる。 */
function pressComposingKey(key: string): boolean {
  return pressKey(key, { isComposing: true });
}

function selectedRoute(): string | null {
  const selected = document.querySelector("#search-results a[aria-selected='true']");
  return selected ? selected.getAttribute("data-route") : null;
}

describe("v0.9 search keyboard navigation (app.js)", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("exposes the input and result list as a combobox and its listbox", async () => {
    await mountClient(SAMPLE);
    const input = document.getElementById("search-input")!;
    const box = document.getElementById("search-results")!;

    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-controls")).toBe("search-results");
    expect(box.getAttribute("role")).toBe("listbox");
    // 結果が出るまでは閉じた状態。
    expect(input.getAttribute("aria-expanded")).toBe("false");

    typeQuery("install");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll("#search-results a[role='option']").length).toBe(3);

    // 一致が無いときは開いたままにしない。
    typeQuery("nonexistent");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("moves the selection with the arrow keys and wraps at both ends", async () => {
    await mountClient(SAMPLE);
    const input = document.getElementById("search-input")!;

    (input as HTMLInputElement).focus();
    typeQuery("install");
    expect(selectedRoute()).toBeNull();

    // 下キーは既定のキャレット移動を止めて選択を進める。
    expect(pressKey("ArrowDown")).toBe(true);
    expect(selectedRoute()).toBe("/install");
    // フォーカスは検索欄に残り、読み上げ位置だけが動く。
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-activedescendant")).toBe(
      document.querySelector("#search-results a[aria-selected='true']")!.id,
    );

    pressKey("ArrowDown");
    pressKey("ArrowDown");
    expect(selectedRoute()).toBe("/");
    // 末尾からさらに下へ進むと先頭へ回り込む。
    pressKey("ArrowDown");
    expect(selectedRoute()).toBe("/install");
    // 先頭から上へ戻ると末尾へ回り込む。
    expect(pressKey("ArrowUp")).toBe(true);
    expect(selectedRoute()).toBe("/");
  });

  it("clears the selection when the query changes", async () => {
    await mountClient(SAMPLE);
    const input = document.getElementById("search-input")!;

    typeQuery("install");
    pressKey("ArrowDown");
    expect(selectedRoute()).toBe("/install");

    typeQuery("configure");
    expect(selectedRoute()).toBeNull();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("opens the selected result with Enter, jumping to the matched heading", async () => {
    await mountClient(SAMPLE);

    typeQuery("install");
    pressKey("ArrowDown");
    pressKey("ArrowDown");
    expect(selectedRoute()).toBe("/guide");

    expect(pressKey("Enter")).toBe(true);
    // 見出し一致の結果なので、クリックと同じくその見出しのアンカーへ遷移する。
    expect(window.location.hash).toBe("#guide-install");
    window.dispatchEvent(new Event("hashchange"));
    const shown = Array.from(
      document.querySelectorAll<HTMLElement>("#content article[data-route]"),
    ).filter((el) => !el.hidden);
    expect(shown.map((el) => el.getAttribute("data-route"))).toEqual(["/guide"]);
  });

  it("opens the first result with Enter when nothing is selected yet", async () => {
    await mountClient(SAMPLE);

    typeQuery("install");
    expect(selectedRoute()).toBeNull();
    // 先頭は最上位スコアの /install（タイトル一致）。
    pressKey("Enter");
    expect(window.location.hash).toBe("#/install");
  });

  it("does nothing on Enter when there is no result", async () => {
    await mountClient(SAMPLE);

    typeQuery("nonexistent");
    // 既定動作を止めない（フォーム送信等の妨げにならない）。
    expect(pressKey("Enter")).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("leaves the keys alone while an IME is composing", async () => {
    await mountClient(SAMPLE);

    typeQuery("install");
    // 変換中の上下キーは候補選択、Enter は確定。横取りすると日本語入力が壊れる。
    expect(pressComposingKey("ArrowDown")).toBe(false);
    expect(selectedRoute()).toBeNull();
    expect(pressComposingKey("Enter")).toBe(false);
    expect(window.location.hash).toBe("");

    // isComposing を出さない環境向けの keyCode 229 も同じ扱い。
    expect(pressKey("ArrowDown", { keyCode: 229 })).toBe(false);
    expect(selectedRoute()).toBeNull();

    // 変換が終われば通常どおり動く。
    expect(pressKey("ArrowDown")).toBe(true);
    expect(selectedRoute()).toBe("/install");
  });

  it("keeps option ids clear of ids the document already uses", async () => {
    // ページ ID と見出しの組み合わせ次第で、既定の接頭辞と同じ ID は実際に生成されうる。
    await mountClient([
      page("/monodocs-search", "monodocs search", {
        text: "install notes",
        headings: [{ id: "monodocs-search-option-0", text: "Option 0", level: 2 }],
      }),
      page("/install", "Install", { text: "install" }),
    ]);

    typeQuery("install");
    const ids = Array.from(document.querySelectorAll("#search-results a[role='option']")).map(
      (a) => a.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    // 生成した option の ID が本文側の ID と重ならない（重なると、その ID を指す
    // アンカー遷移が結果一覧側の要素を拾ってページを切り替えられなくなる）。
    for (const id of ids) {
      expect(document.querySelectorAll(`[id='${id}']`).length).toBe(1);
    }
  });
});

/** In-body highlight of the page a result opens (v0.9). The first page is where the reader starts. */
const BODY: ClientPage[] = [
  page("/", "Home", {
    text: "Install from the top page.",
    html: "<p>Install from the top page.</p>",
  }),
  page("/guide", "Guide", {
    text: "Install the CLI, then install the theme. Note the order.",
    headings: [{ id: "guide-install", text: "Install the CLI", level: 2 }],
    html:
      "<p>Install the CLI, then <strong>install</strong> the theme. " +
      "<mark>Note</mark> the order.</p>" +
      '<pre class="mermaid">graph TD; install --&gt; done;</pre>',
  }),
];

function openResult(route: string): void {
  const link = document.querySelector(`#search-results a[data-route='${route}']`) as HTMLElement;
  link.click();
  // Navigation across pages goes through the hash; the test dispatches hashchange itself.
  window.dispatchEvent(new Event("hashchange"));
}

function highlighted(route: string): (string | null)[] {
  return Array.from(
    document.querySelectorAll(`#content article[data-route='${route}'] mark.search-hit`),
  ).map((m) => m.textContent);
}

describe("v0.9 in-body highlight (app.js)", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("marks nothing until a result is opened", async () => {
    await mountClient(BODY);

    // Typing only changes the result list; the page being read is left alone.
    typeQuery("install");
    expect(document.querySelectorAll("#content mark.search-hit").length).toBe(0);
  });

  it("marks every keyword occurrence in the page the result opens", async () => {
    await mountClient(BODY);

    typeQuery("install");
    openResult("/guide");

    // Every match is marked: in the heading, in the body, and inside inline markup.
    expect(highlighted("/guide")).toEqual(["Install", "Install", "install"]);
    // Only the page that was opened (a page not on display is untouched).
    expect(highlighted("/")).toEqual([]);
  });

  it("leaves Mermaid source, injected UI text, and the page's own mark alone", async () => {
    await mountClient(BODY);

    typeQuery("install");
    openResult("/guide");

    // A Mermaid block is source the runtime reads; marking it would break the diagram.
    const mermaid = document.querySelector("#content pre.mermaid")!;
    expect(mermaid.querySelectorAll("mark").length).toBe(0);
    expect(mermaid.childNodes.length).toBe(1);
    // Outside the body (prev/next navigation) is out of scope.
    expect(document.querySelectorAll("#page-nav mark").length).toBe(0);
    // The <mark> the page carries of its own stays, without the highlight class.
    const own = document.querySelector(
      "#content article[data-route='/guide'] mark:not(.search-hit)",
    )!;
    expect(own.textContent).toBe("Note");
  });

  it("keeps the highlight while the search is open, following the page the reader moves to", async () => {
    await mountClient(BODY);

    typeQuery("install");
    openResult("/guide");
    expect(highlighted("/guide").length).toBe(3);

    // Following a link or prev/next keeps the highlight while the search stays open.
    window.location.hash = "#/";
    window.dispatchEvent(new Event("hashchange"));
    expect(highlighted("/")).toEqual(["Install"]);
    expect(highlighted("/guide")).toEqual([]);
  });

  it("restores the body when the query changes or Escape clears the box", async () => {
    await mountClient(BODY);
    const paragraph = document.querySelector("#content article[data-route='/guide'] p")!;
    const nodeCount = paragraph.childNodes.length;
    const html = paragraph.innerHTML;

    typeQuery("install");
    openResult("/guide");
    expect(highlighted("/guide").length).toBe(3);

    // Once the query changes, the highlight on the open page belongs to the previous search.
    typeQuery("note");
    expect(document.querySelectorAll("#content mark.search-hit").length).toBe(0);
    // The body comes back, split text nodes merged, so repeating this does not add nodes.
    expect(paragraph.innerHTML).toBe(html);
    expect(paragraph.childNodes.length).toBe(nodeCount);

    openResult("/guide");
    expect(document.querySelectorAll("#content mark.search-hit").length).toBeGreaterThan(0);
    pressKey("Escape");
    expect(document.querySelectorAll("#content mark.search-hit").length).toBe(0);
    expect(paragraph.innerHTML).toBe(html);
    expect(paragraph.childNodes.length).toBe(nodeCount);
  });

  it("caps the number of marks so one navigation cannot fill the page with elements", async () => {
    // 3 per paragraph x 200 paragraphs = 600 matches; it stops at 500, mid-paragraph if need be.
    const paragraphs = "<p>install install install</p>".repeat(200);
    await mountClient([
      page("/", "Home", { text: "top", html: "<p>top</p>" }),
      page("/long", "Long", { text: "install".repeat(600), html: paragraphs }),
    ]);

    typeQuery("install");
    openResult("/long");
    expect(highlighted("/long").length).toBe(500);
  });

  it("caps a single huge text node at the same limit", async () => {
    // A huge paragraph or code block can be one text node. Collecting every match and discarding
    // the surplus would scan and sort tens of thousands of them per navigation, so it stops early.
    await mountClient([
      page("/", "Home", { text: "top", html: "<p>top</p>" }),
      page("/big", "Big", {
        text: "install",
        html: `<pre><code>${"install ".repeat(5000)}</code></pre>`,
      }),
    ]);

    typeQuery("install");
    openResult("/big");
    expect(highlighted("/big").length).toBe(500);
    // Code blocks are marked too, because they are part of the search index.
    expect(document.querySelectorAll("#content pre code mark.search-hit").length).toBe(500);
  });

  it("leaves content that carries the same class, and its own mark, intact", async () => {
    // Authored HTML using the same class survives; the class is only there for the colour.
    const own = '<p>install <mark class="search-hit"><em>note</em></mark> here</p>';
    await mountClient([page("/own", "Own", { text: "install note here", html: own })]);
    const paragraph = document.querySelector("#content article[data-route='/own'] p")!;

    typeQuery("install");
    openResult("/own");
    // Exactly one <mark> was added; the other one is the page's own.
    expect(paragraph.querySelectorAll("mark").length).toBe(2);
    expect(paragraph.querySelector("mark.search-hit")!.textContent).toBe("install");

    typeQuery("note");
    // Only the marks the script created are removed; the page's own one keeps its children.
    expect(paragraph.innerHTML).toBe(own.replace("<p>", "").replace("</p>", ""));
    expect(paragraph.querySelector("mark.search-hit em")!.textContent).toBe("note");

    // A match inside the page's own <mark> is marked within it, leaving that element in place.
    openResult("/own");
    expect(paragraph.querySelectorAll("mark").length).toBe(2);
    expect(paragraph.querySelector("em mark")!.textContent).toBe("note");
    pressKey("Escape");
    expect(paragraph.innerHTML).toBe(own.replace("<p>", "").replace("</p>", ""));
  });

  it("marks the spelling the page uses, folded the same way as the result list", async () => {
    await mountClient([
      page("/ja", "案内", { text: "サーバーの設定。", html: "<p>サーバーの設定。</p>" }),
    ]);

    // Searched in hiragana with a prolonged sound mark, the body still marks its own spelling.
    typeQuery("さーばー");
    openResult("/ja");
    expect(highlighted("/ja")).toEqual(["サーバー"]);
  });
});
