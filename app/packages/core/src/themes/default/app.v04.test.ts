// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadTheme } from "../index";

type ClientPage = {
  route: string;
  title: string;
  hidden: boolean;
  headings: { id: string; text: string; level: number }[];
  text: string;
};

/**
 * 実テンプレートに近い DOM（検索・目次・前後ナビ・トグル）を組み立て、
 * クライアント app.js を実行して v0.4 のドキュメントサイト機能を検証する。
 */
async function mountClient(pages: ClientPage[]): Promise<void> {
  const theme = await loadTheme("default");

  const visible = pages.filter((p) => !p.hidden);
  const links = visible
    .map(
      (p) =>
        `<li class="sidebar-page"><a data-route="${p.route}" href="#${encodeURI(p.route)}">${p.title}</a></li>`,
    )
    .join("");
  const articles = pages
    .map(
      (p, i) =>
        `<article class="page" data-route="${p.route}"${i === 0 ? "" : " hidden"}>${p.title}</article>`,
    )
    .join("");

  document.body.innerHTML =
    `<button id="sidebar-toggle" aria-expanded="true">☰</button>` +
    `<div id="app">` +
    `<aside id="sidebar">` +
    `<div class="sidebar-header">T</div>` +
    `<div class="sidebar-tools">` +
    `<input id="search-input" type="search" />` +
    `<button id="theme-toggle"><span class="theme-toggle-icon"></span></button>` +
    `</div>` +
    `<ul id="search-results" hidden></ul>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list">` +
    `<li class="sidebar-dir"><span class="sidebar-dir-title">setup</span>` +
    `<ul class="sidebar-list">${links}</ul></li>` +
    `</ul></nav>` +
    `</aside>` +
    `<main id="content">${articles}<nav id="page-nav"></nav></main>` +
    `<aside id="toc"><div class="toc-title">目次</div><nav id="toc-nav"></nav></aside>` +
    `</div>`;

  (window as unknown as { __SINGLE_DOCS_DATA__: unknown }).__SINGLE_DOCS_DATA__ = {
    initialRoute: pages[0]?.route,
    pages,
  };

  new Function(theme.appJs)();
}

/** ブラウザが行うのと同じ encode 済み hash を設定して遷移する。 */
function navigate(route: string): void {
  window.location.hash = "#" + encodeURI(route);
  window.dispatchEvent(new Event("hashchange"));
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
  page("/", "Home", { text: "welcome home" }),
  page("/guide", "Guide", {
    text: "how to install things and configure",
    headings: [
      { id: "guide-install", text: "Install", level: 2 },
      { id: "guide-config", text: "Config", level: 3 },
    ],
  }),
  page("/faq", "FAQ", { text: "frequently asked questions" }),
  page("/secret", "Secret", { hidden: true, text: "secret content" }),
];

describe("v0.4 client features (app.js)", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  it("renders the in-page TOC from h2/h3 headings of the current page", async () => {
    await mountClient(SAMPLE);
    navigate("/guide");
    const toc = document.getElementById("toc-nav")!;
    const ids = Array.from(toc.querySelectorAll("a")).map((a) => a.getAttribute("data-heading"));
    expect(ids).toEqual(["guide-install", "guide-config"]);
  });

  it("hides the TOC for a page without headings", async () => {
    await mountClient(SAMPLE);
    navigate("/");
    expect(document.getElementById("toc")!.hidden).toBe(true);
  });

  it("renders prev/next navigation across visible pages only", async () => {
    await mountClient(SAMPLE);
    navigate("/guide");
    const nav = document.getElementById("page-nav")!;
    const prev = nav.querySelector(".page-nav-prev");
    const next = nav.querySelector(".page-nav-next");
    expect(prev?.getAttribute("data-route")).toBe("/");
    // 次は FAQ（hidden の Secret は飛ばす）。
    expect(next?.getAttribute("data-route")).toBe("/faq");
  });

  it("omits prev on the first page and next on the last visible page", async () => {
    await mountClient(SAMPLE);
    navigate("/");
    expect(document.querySelector("#page-nav .page-nav-prev")).toBeNull();
    expect(document.querySelector("#page-nav .page-nav-next")?.getAttribute("data-route")).toBe(
      "/guide",
    );
    navigate("/faq");
    expect(document.querySelector("#page-nav .page-nav-next")).toBeNull();
  });

  it("searches titles and text, excluding hidden pages", async () => {
    await mountClient(SAMPLE);
    const input = document.getElementById("search-input") as HTMLInputElement;
    const results = document.getElementById("search-results")!;
    const nav = document.getElementById("sidebar-nav")!;

    input.value = "install";
    input.dispatchEvent(new Event("input"));
    expect(results.hidden).toBe(false);
    expect(nav.hidden).toBe(true);
    const routes = Array.from(results.querySelectorAll("a")).map((a) =>
      a.getAttribute("data-route"),
    );
    expect(routes).toEqual(["/guide"]);

    // hidden ページは検索対象外。
    input.value = "secret";
    input.dispatchEvent(new Event("input"));
    expect(results.querySelector(".search-empty")).not.toBeNull();

    // クリアで一覧に戻る。
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(results.hidden).toBe(true);
    expect(nav.hidden).toBe(false);
  });

  it("navigates to a page from a search result", async () => {
    await mountClient(SAMPLE);
    const input = document.getElementById("search-input") as HTMLInputElement;
    input.value = "questions";
    input.dispatchEvent(new Event("input"));
    const link = document.querySelector("#search-results a[data-route='/faq']") as HTMLElement;
    link.click();
    window.dispatchEvent(new Event("hashchange"));
    const shown = Array.from(
      document.querySelectorAll<HTMLElement>("#content article[data-route]"),
    ).filter((el) => !el.hidden);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.getAttribute("data-route")).toBe("/faq");
  });

  it("toggles dark mode and persists the choice", async () => {
    await mountClient(SAMPLE);
    const btn = document.getElementById("theme-toggle")!;
    btn.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("single-docs:theme")).toBe("dark");
    btn.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("applies the stored theme on load", async () => {
    window.localStorage.setItem("single-docs:theme", "dark");
    await mountClient(SAMPLE);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("collapses the sidebar", async () => {
    await mountClient(SAMPLE);
    const btn = document.getElementById("sidebar-toggle")!;
    btn.click();
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("collapses a sidebar directory group", async () => {
    await mountClient(SAMPLE);
    const title = document.querySelector("#sidebar-nav .sidebar-dir-title") as HTMLElement;
    title.click();
    expect(title.parentElement!.classList.contains("collapsed")).toBe(true);
  });

  it("treats an in-page anchor (#id) as an anchor, not a route fallback", async () => {
    await mountClient(SAMPLE);
    navigate("/guide");
    // /guide ページ内に脚注相当のアンカー要素を用意する。
    const guide = document.querySelector('#content article[data-route="/guide"]')!;
    guide.innerHTML += '<span id="guide-fn-1">footnote</span>';

    // route ではない hash（"/" 始まりでない）へ遷移してもページは切り替わらない。
    navigate("guide-fn-1");
    const shown = Array.from(
      document.querySelectorAll<HTMLElement>("#content article[data-route]"),
    ).filter((el) => !el.hidden);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.getAttribute("data-route")).toBe("/guide");
  });

  it("shows the containing page when deep-linking to an in-page anchor", async () => {
    await mountClient(SAMPLE);
    // 初期は先頭ページ。FAQ ページ内のアンカーを直接開く。
    const faq = document.querySelector('#content article[data-route="/faq"]')!;
    faq.innerHTML += '<span id="faq-note">note</span>';

    navigate("faq-note");
    const shown = Array.from(
      document.querySelectorAll<HTMLElement>("#content article[data-route]"),
    ).filter((el) => !el.hidden);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.getAttribute("data-route")).toBe("/faq");
  });

  it("highlights the current heading in the TOC on scroll (IntersectionObserver)", async () => {
    // happy-dom には IntersectionObserver が無いため、観測対象とコールバックを
    // 捕捉するスタブを差し込んでスクロール連動を検証する。
    type Entry = { target: Element; isIntersecting: boolean };
    type Stub = { cb: (entries: Entry[]) => void; elements: Element[]; disconnect: () => void };
    const instances: Stub[] = [];
    const g = globalThis as unknown as { IntersectionObserver?: unknown };
    const original = g.IntersectionObserver;
    g.IntersectionObserver = class {
      cb: (entries: Entry[]) => void;
      elements: Element[] = [];
      constructor(cb: (entries: Entry[]) => void) {
        this.cb = cb;
        instances.push(this as unknown as Stub);
      }
      observe(el: Element) {
        this.elements.push(el);
      }
      disconnect() {}
    } as unknown as typeof IntersectionObserver;

    try {
      await mountClient(SAMPLE);
      const guide = document.querySelector('#content article[data-route="/guide"]')!;
      guide.innerHTML = '<h2 id="guide-install">Install</h2><h3 id="guide-config">Config</h3>';
      navigate("/guide");

      const io = instances[instances.length - 1]!;
      expect(io.elements.map((e) => e.id)).toEqual(["guide-install", "guide-config"]);

      const link = (id: string) =>
        document.querySelector(`#toc-nav a[data-heading="${id}"]`) as HTMLElement;

      // guide-config だけが可視 → それが active。
      io.cb([{ target: document.getElementById("guide-config")!, isIntersecting: true }]);
      expect(link("guide-config").classList.contains("active")).toBe(true);
      expect(link("guide-install").classList.contains("active")).toBe(false);

      // guide-install も可視になれば文書順で先頭が優先。
      io.cb([{ target: document.getElementById("guide-install")!, isIntersecting: true }]);
      expect(link("guide-install").classList.contains("active")).toBe(true);
      expect(link("guide-config").classList.contains("active")).toBe(false);
    } finally {
      g.IntersectionObserver = original;
    }
  });
});
