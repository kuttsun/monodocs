// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLabels } from "../../labels.js";
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
async function mountClient(
  pages: ClientPage[],
  options: {
    colorScheme?: string;
    contentWidthToggle?: boolean;
    contentWidthDefault?: string;
    articleHtml?: string;
    imageLightbox?: boolean;
  } = {},
): Promise<void> {
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
        `<article class="page" data-route="${p.route}"${i === 0 ? "" : " hidden"}>${p.title}${i === 0 ? (options.articleHtml ?? "") : ""}</article>`,
    )
    .join("");
  const contentWidthToggle =
    options.contentWidthToggle === false
      ? ""
      : `<button id="content-width-toggle" aria-pressed="false"></button>`;
  const imageLightbox =
    options.imageLightbox === false
      ? ""
      : `<dialog id="image-lightbox"><button id="image-lightbox-close"></button>` +
        `<figure><img id="image-lightbox-image" alt="" />` +
        `<div id="image-lightbox-diagram" hidden></div>` +
        `<figcaption id="image-lightbox-caption" hidden></figcaption></figure></dialog>`;

  document.body.innerHTML =
    `<button id="sidebar-show">☰</button>` +
    `<div id="app">` +
    `<aside id="sidebar">` +
    `<div class="sidebar-header">T</div>` +
    `<div class="sidebar-tools">` +
    `<input id="search-input" type="search" />` +
    contentWidthToggle +
    `<button id="theme-toggle"><span class="theme-toggle-icon"></span></button>` +
    `<button id="sidebar-toggle" aria-expanded="true">«</button>` +
    `</div>` +
    `<ul id="search-results" hidden></ul>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list">` +
    `<li class="sidebar-dir"><span class="sidebar-dir-title">setup</span>` +
    `<ul class="sidebar-list">${links}</ul></li>` +
    `</ul></nav>` +
    `</aside>` +
    `<main id="content">${articles}<nav id="page-nav"></nav></main>` +
    `<aside id="toc"><div class="toc-title">On this page</div><nav id="toc-nav"></nav></aside>` +
    `</div>` +
    imageLightbox;

  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
    labels: resolveLabels("en").labels,
    initialRoute: pages[0]?.route,
    colorScheme: options.colorScheme,
    contentWidthDefault: options.contentWidthDefault,
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
    document.body.className = "";
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

  it("opens content images in a lightbox and preserves linked image behavior", async () => {
    await mountClient(SAMPLE, {
      articleHtml:
        '<img id="previewable" src="diagram.png" alt="Architecture diagram" />' +
        '<a href="full.png"><img id="linked-image" src="thumbnail.png" alt="Linked" /></a>' +
        '<img id="decorative-image" src="decoration.png" alt="" />',
    });

    const trigger = document.getElementById("previewable")!;
    const linked = document.getElementById("linked-image")!;
    const decorative = document.getElementById("decorative-image")!;
    expect(trigger.classList.contains("image-lightbox-trigger")).toBe(true);
    expect(trigger.getAttribute("role")).toBe("button");
    expect(trigger.getAttribute("tabindex")).toBe("0");
    expect(linked.classList.contains("image-lightbox-trigger")).toBe(false);
    expect(decorative.classList.contains("image-lightbox-trigger")).toBe(false);

    trigger.focus();
    trigger.click();
    const dialog = document.getElementById("image-lightbox")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(document.getElementById("image-lightbox-image")!.getAttribute("src")).toContain(
      "diagram.png",
    );
    expect(document.getElementById("image-lightbox-caption")!.textContent).toBe(
      "Architecture diagram",
    );

    document.getElementById("image-lightbox-close")!.click();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    dialog.click();
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it.each(["Enter", " "])("opens the image lightbox with the %j key", async (key) => {
    await mountClient(SAMPLE, {
      articleHtml: '<img id="previewable" src="diagram.png" alt="Diagram" />',
    });

    const trigger = document.getElementById("previewable")!;
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    expect(document.getElementById("image-lightbox")!.hasAttribute("open")).toBe(true);
  });

  const DIAGRAM_SVG =
    '<svg id="mermaid-0" viewBox="0 0 400 100" style="max-width: 400px;">' +
    '<title id="chart-title-mermaid-0">Login flow</title><g id="mermaid-0-node"></g></svg>';

  it("opens a pre-rendered Mermaid diagram by moving its SVG into the lightbox", async () => {
    await mountClient(SAMPLE, {
      articleHtml: `<figure id="diagram" class="mermaid">${DIAGRAM_SVG}</figure>`,
    });

    const block = document.getElementById("diagram")!;
    expect(block.classList.contains("image-lightbox-trigger")).toBe(true);
    // The block keeps its own semantics so the diagram stays readable to assistive technology;
    // a separate button is the keyboard route in.
    expect(block.hasAttribute("role")).toBe(false);
    expect(block.hasAttribute("tabindex")).toBe(false);
    const button = block.querySelector<HTMLButtonElement>("button.diagram-lightbox-open")!;
    expect(button.getAttribute("aria-label")).toBe("Open image preview: Login flow");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");

    button.focus();
    button.click();
    const dialog = document.getElementById("image-lightbox")!;
    const host = document.getElementById("image-lightbox-diagram")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(host.hidden).toBe(false);
    expect(document.getElementById("image-lightbox-image")!.hidden).toBe(true);
    expect(host.querySelector("svg")!.id).toBe("mermaid-0");
    expect(block.querySelector("svg")).toBeNull();
    // Moved, not copied: the SVG's ids stay unique in the document.
    expect(document.querySelectorAll("#mermaid-0")).toHaveLength(1);
    expect(document.getElementById("image-lightbox-caption")!.textContent).toBe("Login flow");

    document.getElementById("image-lightbox-close")!.click();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(block.querySelector("svg")!.id).toBe("mermaid-0");
    expect(host.hidden).toBe(true);
    expect(host.children).toHaveLength(0);
    expect(host.hasAttribute("style")).toBe(false);
    expect(document.getElementById("image-lightbox-image")!.hidden).toBe(false);
    expect(block.style.height).toBe("");
    expect(document.activeElement).toBe(button);

    // A click anywhere on the diagram opens it too, and the backdrop puts the SVG back.
    block.querySelector("g")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(dialog.hasAttribute("open")).toBe(true);
    dialog.click();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(block.querySelector("svg")).not.toBeNull();
  });

  it("labels a diagram without a title and lets links drawn in it navigate", async () => {
    await mountClient(SAMPLE, {
      articleHtml:
        '<figure id="diagram" class="mermaid"><svg viewBox="0 0 10 10">' +
        '<a id="node-link" href="#/faq"><g></g></a></svg></figure>',
    });

    const button = document.querySelector<HTMLButtonElement>(".diagram-lightbox-open")!;
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.textContent).toBe("Open image preview");

    document
      .getElementById("node-link")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(document.getElementById("image-lightbox")!.hasAttribute("open")).toBe(false);
  });

  it("shows an image normally after a diagram was previewed", async () => {
    await mountClient(SAMPLE, {
      articleHtml:
        `<figure id="diagram" class="mermaid">${DIAGRAM_SVG}</figure>` +
        '<img id="previewable" src="photo.png" alt="Photo" />',
    });

    document.querySelector<HTMLButtonElement>(".diagram-lightbox-open")!.click();
    document.getElementById("image-lightbox-close")!.click();
    document.getElementById("previewable")!.click();

    const host = document.getElementById("image-lightbox-diagram")!;
    const preview = document.getElementById("image-lightbox-image") as HTMLImageElement;
    expect(host.hidden).toBe(true);
    expect(host.children).toHaveLength(0);
    expect(preview.hidden).toBe(false);
    expect(preview.getAttribute("src")).toContain("photo.png");
    expect(document.getElementById("image-lightbox-caption")!.textContent).toBe("Photo");
  });

  it.each([
    ["printing", () => window.dispatchEvent(new Event("beforeprint"))],
    ["leaving the page", () => navigate("/faq")],
  ])("puts an open diagram back in the page before %s", async (_name, act) => {
    await mountClient(SAMPLE, {
      articleHtml: `<figure id="diagram" class="mermaid">${DIAGRAM_SVG}</figure>`,
    });

    const block = document.getElementById("diagram")!;
    block.querySelector<HTMLButtonElement>(".diagram-lightbox-open")!.click();
    expect(block.querySelector("svg")).toBeNull();

    act();
    expect(document.getElementById("image-lightbox")!.hasAttribute("open")).toBe(false);
    expect(block.querySelector("svg")!.id).toBe("mermaid-0");
    expect(block.style.height).toBe("");
    // Focus is not sent back into a page the reader may have left.
    expect(document.activeElement).not.toBe(block.querySelector(".diagram-lightbox-open"));
  });

  it("does not open a diagram when the click ends a text selection", async () => {
    await mountClient(SAMPLE, {
      articleHtml:
        '<figure id="diagram" class="mermaid"><svg viewBox="0 0 10 10">' +
        '<text id="label">Login</text></svg></figure>',
    });

    const label = document.getElementById("label")!;
    const range = document.createRange();
    range.selectNodeContents(label);
    window.getSelection()!.addRange(range);
    label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("image-lightbox")!.hasAttribute("open")).toBe(false);
    window.getSelection()!.removeAllRanges();
  });

  it("enhances a client-mode Mermaid block once its SVG has been rendered", async () => {
    await mountClient(SAMPLE, {
      articleHtml: '<pre id="diagram" class="mermaid">graph TD; A--&gt;B</pre>',
    });

    const block = document.getElementById("diagram")!;
    expect(block.classList.contains("image-lightbox-trigger")).toBe(false);
    expect(block.querySelector("button")).toBeNull();
    block.click();
    expect(document.getElementById("image-lightbox")!.hasAttribute("open")).toBe(false);

    // What mermaid.run does when the page is shown.
    block.innerHTML = DIAGRAM_SVG;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(block.classList.contains("image-lightbox-trigger")).toBe(true);
    expect(block.querySelectorAll("button.diagram-lightbox-open")).toHaveLength(1);
    block.click();
    expect(document.getElementById("image-lightbox")!.hasAttribute("open")).toBe(true);
    expect(document.getElementById("image-lightbox-diagram")!.querySelector("svg")).not.toBeNull();
  });

  it("does not enhance Mermaid diagrams when the lightbox is disabled", async () => {
    await mountClient(SAMPLE, {
      articleHtml: `<figure id="diagram" class="mermaid">${DIAGRAM_SVG}</figure>`,
      imageLightbox: false,
    });

    const block = document.getElementById("diagram")!;
    expect(block.classList.contains("image-lightbox-trigger")).toBe(false);
    expect(block.querySelector("button")).toBeNull();
  });

  it("does not enhance images when the lightbox is disabled", async () => {
    await mountClient(SAMPLE, {
      articleHtml: '<img id="plain-image" src="diagram.png" alt="Diagram" />',
      imageLightbox: false,
    });

    expect(
      document.getElementById("plain-image")!.classList.contains("image-lightbox-trigger"),
    ).toBe(false);
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
    expect(window.localStorage.getItem("monodocs:theme")).toBe("dark");
    btn.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("applies the stored theme on load", async () => {
    window.localStorage.setItem("monodocs:theme", "dark");
    await mountClient(SAMPLE);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies the configured initial color scheme when nothing is stored", async () => {
    await mountClient(SAMPLE, { colorScheme: "dark" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("lets the stored choice win over the configured color scheme", async () => {
    window.localStorage.setItem("monodocs:theme", "light");
    await mountClient(SAMPLE, { colorScheme: "dark" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("follows the OS setting for the auto color scheme (no data-theme)", async () => {
    await mountClient(SAMPLE, { colorScheme: "auto" });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("toggles wide content and persists the choice", async () => {
    await mountClient(SAMPLE);
    const btn = document.getElementById("content-width-toggle")!;
    expect(document.body.classList.contains("content-wide")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    btn.click();
    expect(document.body.classList.contains("content-wide")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("title")).toBe("Use standard content width");
    expect(window.localStorage.getItem("monodocs:content-width")).toBe("wide");

    btn.click();
    expect(document.body.classList.contains("content-wide")).toBe(false);
    expect(window.localStorage.getItem("monodocs:content-width")).toBe("standard");
  });

  it("applies the stored wide content choice on load", async () => {
    window.localStorage.setItem("monodocs:content-width", "wide");
    await mountClient(SAMPLE);
    expect(document.body.classList.contains("content-wide")).toBe(true);
    expect(document.getElementById("content-width-toggle")!.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("applies the configured initial content width when nothing is stored", async () => {
    await mountClient(SAMPLE, { contentWidthDefault: "wide" });
    expect(document.body.classList.contains("content-wide")).toBe(true);
    expect(document.getElementById("content-width-toggle")!.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("lets the stored choice win over the configured initial content width", async () => {
    window.localStorage.setItem("monodocs:content-width", "standard");
    await mountClient(SAMPLE, { contentWidthDefault: "wide" });
    expect(document.body.classList.contains("content-wide")).toBe(false);
  });

  it("ignores the stored wide choice when the content-width toggle is disabled", async () => {
    window.localStorage.setItem("monodocs:content-width", "wide");
    await mountClient(SAMPLE, { contentWidthToggle: false, contentWidthDefault: "wide" });
    expect(document.getElementById("content-width-toggle")).toBeNull();
    expect(document.body.classList.contains("content-wide")).toBe(false);
  });

  it("collapses the sidebar and reopens via the floating button", async () => {
    await mountClient(SAMPLE);
    const hide = document.getElementById("sidebar-toggle")!;
    const show = document.getElementById("sidebar-show")!;
    hide.click();
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);
    expect(hide.getAttribute("aria-expanded")).toBe("false");
    show.click();
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
    expect(hide.getAttribute("aria-expanded")).toBe("true");
  });

  it("auto-expands a collapsed directory that contains the active page", async () => {
    await mountClient(SAMPLE);
    const dir = document.querySelector("#sidebar-nav .sidebar-dir")!;
    dir.classList.add("collapsed");
    // /guide のリンクはこのディレクトリ内にある。
    navigate("/guide");
    expect(dir.classList.contains("collapsed")).toBe(false);
  });

  it("renders mermaid on the visible page when navigating", async () => {
    let calls = 0;
    const g = window as unknown as { __sdRenderMermaid?: () => void };
    g.__sdRenderMermaid = () => {
      calls++;
    };
    try {
      await mountClient(SAMPLE); // init → showPage(initial) で 1 回
      const before = calls;
      navigate("/guide"); // showPage で再度呼ばれる
      expect(calls).toBeGreaterThan(before);
    } finally {
      delete g.__sdRenderMermaid;
    }
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

  /** code ブロックを含む最小 DOM を組み立て、app.js を実行する。 */
  async function mountCode(codeHtml: string): Promise<void> {
    const theme = await loadTheme("default");
    document.body.innerHTML =
      `<main id="content"><article class="page" data-route="/">${codeHtml}` +
      `<nav id="page-nav"></nav></article></main>`;
    (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
      labels: resolveLabels("en").labels,
      initialRoute: "/",
      pages: [page("/", "Home")],
    };
    new Function(theme.appJs)();
  }

  it("wraps code blocks with copy and wrap-toggle buttons", async () => {
    await mountCode('<pre class="shiki"><code>const x = 1;\nconst y = 2;</code></pre>');
    const block = document.querySelector("#content .code-block");
    expect(block).not.toBeNull();
    // ボタンはアイコン（SVG）で表示する。
    expect(block!.querySelector(".code-copy-btn svg")).not.toBeNull();
    expect(block!.querySelector(".code-wrap-btn svg")).not.toBeNull();

    const wrapBtn = block!.querySelector(".code-wrap-btn") as HTMLElement;
    expect(wrapBtn.getAttribute("aria-pressed")).toBe("false");
    wrapBtn.click();
    expect(block!.classList.contains("wrap")).toBe(true);
    expect(wrapBtn.getAttribute("aria-pressed")).toBe("true");
    wrapBtn.click();
    expect(block!.classList.contains("wrap")).toBe(false);
  });

  it("does not add a toolbar to mermaid blocks", async () => {
    await mountCode('<pre class="mermaid">graph TD; A--&gt;B;</pre>');
    expect(document.querySelector("#content .code-block")).toBeNull();
    expect(document.querySelector("#content .code-toolbar")).toBeNull();
  });

  it("copies the code text via the copy button", async () => {
    let copied = "";
    const nav = window.navigator as unknown as { clipboard?: unknown };
    const original = nav.clipboard;
    Object.defineProperty(nav, "clipboard", {
      configurable: true,
      value: {
        writeText: (t: string) => {
          copied = t;
          return Promise.resolve();
        },
      },
    });
    try {
      await mountCode("<pre><code>hello world</code></pre>");
      const copyBtn = document.querySelector("#content .code-copy-btn") as HTMLElement;
      copyBtn.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(copied).toBe("hello world");
      // コピー後はトーストが一定時間表示される。
      const toast = document.querySelector("#content .code-copied-toast") as HTMLElement;
      expect(toast.classList.contains("show")).toBe(true);
      expect(toast.textContent).toBe("Copied!");
    } finally {
      Object.defineProperty(nav, "clipboard", { configurable: true, value: original });
    }
  });
});
