// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadTheme } from "../index";

/**
 * 検索欄を呼び出すショートカット（`/` と Ctrl+K / ⌘K）。サイドバーが閉じていれば
 * 開いてから移すため、狭い画面のドロワー判定（matchMedia）まで含めて確かめる。
 * CSS の `@media` は happy-dom では評価されないので、app.mobile.test.ts と同じく
 * クライアントが参照する matchMedia を差し替える。
 */
let isNarrowViewport = false;

function setViewportMatches(narrow: boolean): void {
  isNarrowViewport = narrow;
  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
    get matches() {
      return isNarrowViewport && query.includes("max-width: 768px");
    },
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

// app.js は document にリスナーを張る。テストごとに再実行すると前回のリスナーが残り、
// 1 回の打鍵が何度も処理される。何を張ったか記録し、次のマウント前に外す。
let documentListeners: Array<[string, EventListenerOrEventListenerObject]> = [];

async function mountClient(narrow = false): Promise<void> {
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
    `<ul id="search-results" hidden></ul>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list">` +
    `<li class="sidebar-page"><a data-route="/guide" href="#/guide">Guide</a></li>` +
    `</ul></nav>` +
    `</aside>` +
    `<main id="content">` +
    `<article class="page" data-route="/">Home<input id="body-field" /></article>` +
    `<article class="page" data-route="/guide" hidden>Guide</article>` +
    `<nav id="page-nav"></nav>` +
    `</main>` +
    `<dialog id="image-lightbox"><button id="lightbox-close">×</button></dialog>` +
    `</div>`;

  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
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

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  (init.target ? (init.target as EventTarget) : document).dispatchEvent(event);
  return event;
}

function searchInput(): HTMLInputElement {
  return document.getElementById("search-input") as HTMLInputElement;
}

function focused(): string | null {
  return document.activeElement ? document.activeElement.id || null : null;
}

describe("search focus shortcut", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("moves focus to the search box on / and consumes the key", async () => {
    await mountClient();
    const event = press({ key: "/" });
    expect(focused()).toBe("search-input");
    // 押した「/」が検索欄に入ってしまわないよう既定動作は止める。
    expect(event.defaultPrevented).toBe(true);
  });

  it("moves focus to the search box on Ctrl+K and on Meta+K, consuming the key", async () => {
    await mountClient();
    // ブラウザ既定（Firefox の Ctrl+K は検索バーへのフォーカス）を抑える。
    expect(press({ key: "k", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(focused()).toBe("search-input");

    searchInput().blur();
    expect(focused()).not.toBe("search-input");
    expect(press({ key: "k", metaKey: true }).defaultPrevented).toBe(true);
    expect(focused()).toBe("search-input");
  });

  it("answers the physical K position on a layout that does not produce a Latin letter", async () => {
    await mountClient();
    // キリル文字配列では K の位置が「л」を出す。
    press({ key: "л", code: "KeyK", ctrlKey: true });
    expect(focused()).toBe("search-input");
  });

  it("leaves the physical K position alone when the layout produces another Latin letter", async () => {
    await mountClient();
    // Dvorak では K の位置が「v」を出す。ここを取ると Ctrl+V（貼り付け）を奪う。
    const event = press({ key: "v", code: "KeyK", ctrlKey: true });
    expect(focused()).not.toBe("search-input");
    expect(event.defaultPrevented).toBe(false);
  });

  it("answers / typed with AltGr, which Windows reports as Ctrl+Alt", async () => {
    await mountClient();
    // ドイツ語配列などでは AltGr を押さないと「/」が出ない。
    press({ key: "/", ctrlKey: true, altKey: true });
    expect(focused()).toBe("search-input");
  });

  it("selects the existing query so the next keystroke replaces it", async () => {
    await mountClient();
    const input = searchInput();
    input.value = "previous";
    press({ key: "/" });
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("previous".length);
  });

  it("leaves / alone while the reader is typing in a field", async () => {
    await mountClient();
    const field = document.getElementById("body-field") as HTMLInputElement;
    field.focus();
    const event = press({ key: "/", target: field });
    // 本文中の入力欄に「/」を打てなくなってはいけない。
    expect(focused()).toBe("body-field");
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Ctrl+K to the editing operation while the reader is typing", async () => {
    await mountClient();
    const field = document.getElementById("body-field") as HTMLInputElement;
    field.focus();
    // macOS の Ctrl+K は入力欄で「行末まで削除」。⌘K があるので奪う理由がない。
    const event = press({ key: "k", ctrlKey: true, target: field });
    expect(focused()).toBe("body-field");
    expect(event.defaultPrevented).toBe(false);
  });

  it("still answers Meta+K from inside a field, including the search box itself", async () => {
    await mountClient();
    const field = document.getElementById("body-field") as HTMLInputElement;
    field.focus();
    press({ key: "k", metaKey: true, target: field });
    expect(focused()).toBe("search-input");

    // 検索欄の中で押したときは、入力済みの語を選び直せる。
    const input = searchInput();
    input.value = "query";
    input.setSelectionRange(5, 5);
    press({ key: "k", metaKey: true, target: input });
    expect(focused()).toBe("search-input");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });

  it("leaves the keys to the IME while composing", async () => {
    await mountClient();
    // 変換中の「/」は変換対象の入力。横取りすると日本語入力そのものが壊れる。
    press({ key: "/", isComposing: true });
    expect(focused()).not.toBe("search-input");
    // isComposing を出さない環境向けの keyCode 229 の保険も同じ扱い。
    press({ key: "/", keyCode: 229 });
    expect(focused()).not.toBe("search-input");
    press({ key: "k", ctrlKey: true, isComposing: true });
    expect(focused()).not.toBe("search-input");
  });

  it("ignores other modifier combinations on K", async () => {
    await mountClient();
    press({ key: "k", ctrlKey: true, altKey: true });
    expect(focused()).not.toBe("search-input");
    press({ key: "k", ctrlKey: true, shiftKey: true });
    expect(focused()).not.toBe("search-input");
    // 素の K は本文のどこにでも現れる打鍵なので割り当てない。
    press({ key: "k" });
    expect(focused()).not.toBe("search-input");
  });

  it("opens the collapsed sidebar first, since a hidden search box cannot take focus", async () => {
    await mountClient(false);
    document.getElementById("sidebar-toggle")!.click();
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);

    press({ key: "/" });
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
    expect(focused()).toBe("search-input");
    // 表示状態と支援技術向けの状態を食い違わせない。
    expect(document.getElementById("sidebar-toggle")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the drawer first on a narrow viewport", async () => {
    await mountClient(true);
    expect(document.body.classList.contains("sidebar-open")).toBe(false);

    press({ key: "k", ctrlKey: true });
    expect(document.body.classList.contains("sidebar-open")).toBe(true);
    expect(focused()).toBe("search-input");
    expect(document.getElementById("sidebar-show")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the drawer when a result is opened with the keyboard", async () => {
    await mountClient(true);
    press({ key: "k", ctrlKey: true });
    expect(document.body.classList.contains("sidebar-open")).toBe(true);

    const input = searchInput();
    input.value = "guide";
    input.dispatchEvent(new Event("input"));
    press({ key: "Enter", target: input });

    expect(window.location.hash).toBe("#/guide");
    // Enter は click を出さないので、サイドバー内クリックの自動クローズを通らない。
    // 閉じないと、開いた本文がドロワーの陰に隠れたままになる。
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
    // 閉じたサイドバーの中にフォーカスを残さない。
    expect(document.getElementById("sidebar")!.contains(document.activeElement)).toBe(false);
  });

  it("hands focus to the re-open button when Escape closes the drawer", async () => {
    await mountClient(true);
    press({ key: "k", ctrlKey: true });
    const input = searchInput();
    input.value = "guide";
    input.dispatchEvent(new Event("input"));

    press({ key: "Escape", target: input });
    expect(input.value).toBe("");
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
    // 同じ Escape が検索欄とドロワーの両方に届く。検索欄側で先に blur すると
    // ドロワー側の移動先が失われ、フォーカスが body に落ちて現在地を見失う。
    expect(focused()).toBe("sidebar-show");
  });

  it("still leaves the search box on Escape while the sidebar is permanent", async () => {
    await mountClient(false);
    press({ key: "/" });
    const input = searchInput();
    input.value = "guide";
    input.dispatchEvent(new Event("input"));

    press({ key: "Escape", target: input });
    expect(input.value).toBe("");
    // 広い画面ではサイドバーは閉じないので、従来どおり検索欄から出るだけ。
    expect(focused()).not.toBe("search-input");
  });

  it("leaves focus behind an open modal alone", async () => {
    await mountClient();
    const dialog = document.getElementById("image-lightbox") as HTMLDialogElement;
    dialog.setAttribute("open", "");
    const event = press({ key: "/" });
    // 画像プレビューの裏へフォーカスを送らない。
    expect(focused()).not.toBe("search-input");
    expect(event.defaultPrevented).toBe(false);
  });
});
