// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLabels } from "../../labels.js";
import { loadTheme } from "../index";

/**
 * 狭い画面ではサイドバーをドロワーとして重ねる。CSS 側の `@media (max-width: 768px)` は
 * happy-dom では評価されないため、クライアントが参照する matchMedia を差し替えて
 * 「狭い画面かどうか」の分岐だけを検証する。
 */
type MediaListener = () => void;
let mediaListeners: MediaListener[] = [];
let isNarrowViewport = false;

function setViewportMatches(narrow: boolean): void {
  isNarrowViewport = narrow;
  mediaListeners = [];
  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
    get matches() {
      return isNarrowViewport && query.includes("max-width: 768px");
    },
    media: query,
    addEventListener(_type: string, fn: MediaListener) {
      mediaListeners.push(fn);
    },
    removeEventListener() {},
  });
}

/** 画面幅の変化（ドロワー↔常設の切り替え）を再現する。 */
function resizeViewport(narrow: boolean): void {
  isNarrowViewport = narrow;
  mediaListeners.forEach((fn) => fn());
}

// app.js は document にもリスナーを張る（ドロワー外クリック・Escape）。テストごとに
// 再実行すると前回のリスナーが残り、現在の DOM を「外側」とみなして直後に閉じてしまう。
// 何を張ったか記録し、次のマウント前に外す。
let documentListeners: Array<[string, EventListenerOrEventListenerObject]> = [];

async function mountClient(narrow: boolean): Promise<void> {
  documentListeners.forEach(([type, fn]) => document.removeEventListener(type, fn));
  documentListeners = [];
  setViewportMatches(narrow);
  const theme = await loadTheme("default");

  document.body.className = "";
  document.body.innerHTML =
    `<button id="sidebar-show">☰</button>` +
    `<div id="app">` +
    `<aside id="sidebar">` +
    `<div class="sidebar-header"><button id="sidebar-toggle" aria-expanded="true">«</button></div>` +
    `<div class="sidebar-tools"><input id="search-input" type="search" /></div>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list">` +
    `<li class="sidebar-page"><a data-route="/guide" href="#/guide">Guide</a></li>` +
    `</ul></nav>` +
    `</aside>` +
    `<main id="content">` +
    `<article class="page" data-route="/">Home</article>` +
    `<article class="page" data-route="/guide" hidden>Guide</article>` +
    `<nav id="page-nav"></nav>` +
    `</main>` +
    `</div>`;

  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
    labels: resolveLabels("en").labels,
    initialRoute: "/",
    pages: [
      { route: "/", title: "Home", hidden: false, headings: [], text: "home" },
      { route: "/guide", title: "Guide", hidden: false, headings: [], text: "guide" },
    ],
  };

  const addEventListener = document.addEventListener.bind(document);
  document.addEventListener = ((
    type: string,
    fn: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    documentListeners.push([type, fn]);
    addEventListener(type, fn, options);
  }) as typeof document.addEventListener;
  try {
    new Function(theme.appJs)();
  } finally {
    document.addEventListener = addEventListener;
  }
}

describe("sidebar drawer on narrow viewports", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("opens with the toggle button and marks the state on <body>", async () => {
    await mountClient(true);
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
    // 初期表示のドロワーは閉じているので、テンプレートの初期値を実状態へ合わせる。
    expect(document.getElementById("sidebar-toggle")!.getAttribute("aria-expanded")).toBe("false");

    document.getElementById("sidebar-show")!.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(true);
    expect(document.getElementById("sidebar-show")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes after following a link so the reader lands on the page", async () => {
    await mountClient(true);
    document.getElementById("sidebar-show")!.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(true);

    (document.querySelector("#sidebar-nav a") as HTMLElement).click();
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
    // 表示状態と支援技術向けの状態を食い違わせない。
    expect(document.getElementById("sidebar-show")!.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("sidebar-toggle")!.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and on a click outside the drawer", async () => {
    await mountClient(true);

    document.getElementById("sidebar-show")!.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.body.classList.contains("sidebar-open")).toBe(false);

    document.getElementById("sidebar-show")!.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(true);
    (document.getElementById("content") as HTMLElement).click();
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
  });

  it("restores the permanent sidebar when the viewport widens after closing the drawer", async () => {
    await mountClient(true);
    document.getElementById("sidebar-show")!.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(true);
    (document.querySelector("#sidebar-nav a") as HTMLElement).click();
    // 閉じた状態では、ドロワー用のクラスに加えて従来の折りたたみクラスも立てる
    // （style.css だけ差し替えたテーマでも閉じられるようにするため）。
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);

    resizeViewport(false);
    // 画面が広がればサイドバーは常設に戻る（畳んだままにしない）。
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
    expect(document.getElementById("sidebar-toggle")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("moves focus out of the drawer when it closes", async () => {
    await mountClient(true);
    document.getElementById("sidebar-show")!.click();
    (document.getElementById("search-input") as HTMLElement | null)?.focus();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // 閉じたサイドバーは不可視なので、その中にフォーカスを残さない。
    const sidebar = document.getElementById("sidebar")!;
    expect(sidebar.contains(document.activeElement)).toBe(false);
  });

  it("keeps the sidebar open on wide viewports", async () => {
    await mountClient(false);
    // 常設表示なので初期状態は開いている扱い。
    expect(document.getElementById("sidebar-toggle")!.getAttribute("aria-expanded")).toBe("true");
    // 広い画面ではサイドバーは常設。折りたたみ→再表示後にリンクを押しても閉じない。
    document.getElementById("sidebar-toggle")!.click();
    document.getElementById("sidebar-show")!.click();
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);

    (document.querySelector("#sidebar-nav a") as HTMLElement).click();
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
  });
});
