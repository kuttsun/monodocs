// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadTheme } from "../index";

/**
 * 生成 HTML と同じ DOM 構造を組み立て、クライアント app.js を実行する。
 * これにより encode 済み hash → decodeURI → data-route 照合という
 * 実際のルーティング挙動（fix #1 の核心）を検証できる。
 */
async function mountClient(routes: string[]): Promise<void> {
  const theme = await loadTheme("default");

  const links = routes.map((r) => `<a data-route="${r}" href="#${encodeURI(r)}">${r}</a>`).join("");
  const articles = routes
    .map((r, i) => `<article data-route="${r}"${i === 0 ? "" : " hidden"}>${r}</article>`)
    .join("");

  document.body.innerHTML = `<nav id="sidebar-nav">${links}</nav><main id="content">${articles}</main>`;

  (window as unknown as { __SINGLE_DOCS_DATA__: unknown }).__SINGLE_DOCS_DATA__ = {
    initialRoute: routes[0],
  };

  // IIFE を現在の window/document コンテキストで実行し、リスナーを登録する。
  new Function(theme.appJs)();
}

function visibleRoute(): string | null {
  const articles = Array.from(document.querySelectorAll<HTMLElement>("#content [data-route]"));
  const shown = articles.filter((el) => !el.hidden);
  return shown.length === 1 ? shown[0]!.getAttribute("data-route") : null;
}

function activeLinkRoute(): string | null {
  const active = document.querySelector("#sidebar-nav a.active");
  return active ? active.getAttribute("data-route") : null;
}

/** ブラウザが行うのと同じ encode 済み hash を設定して遷移する。 */
function navigate(route: string): void {
  window.location.hash = "#" + encodeURI(route);
  window.dispatchEvent(new Event("hashchange"));
}

describe("client hash routing (app.js)", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("switches to a Japanese route via a percent-encoded hash", async () => {
    await mountClient(["/", "/案内/ガイド"]);
    navigate("/案内/ガイド");
    expect(visibleRoute()).toBe("/案内/ガイド");
    expect(activeLinkRoute()).toBe("/案内/ガイド");
  });

  it("switches to a route containing a space", async () => {
    await mountClient(["/", "/a b"]);
    navigate("/a b");
    expect(visibleRoute()).toBe("/a b");
    expect(activeLinkRoute()).toBe("/a b");
  });

  it("falls back to the first page for an unknown route", async () => {
    await mountClient(["/", "/x"]);
    navigate("/does-not-exist");
    expect(visibleRoute()).toBe("/");
  });
});
