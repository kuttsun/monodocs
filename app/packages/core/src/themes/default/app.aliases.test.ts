// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLabels } from "../../labels.js";
import { loadTheme } from "../index";

/**
 * The client half of route aliases (roadmap.md 15.5). An alias is consulted only when the hash
 * matches no page, so it can never shadow one; when it does resolve, the address bar is rewritten
 * to the current route, so the link a reader copies next is the one that will still work.
 */
async function mountClient(
  routes: string[],
  aliases: Record<string, string>,
  headingIds: string[] = [],
): Promise<void> {
  const theme = await loadTheme("default");

  const links = routes.map((r) => `<a data-route="${r}" href="#${encodeURI(r)}">${r}</a>`).join("");
  const articles = routes
    .map((r, i) => {
      const headings = headingIds.map((id) => `<h2 id="${id}">${id}</h2>`).join("");
      return `<article data-route="${r}"${i === 0 ? "" : " hidden"}>${r}${i === 1 ? headings : ""}</article>`;
    })
    .join("");

  document.body.innerHTML = `<nav id="sidebar-nav">${links}</nav><main id="content">${articles}</main>`;

  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
    labels: resolveLabels("en").labels,
    initialRoute: routes[0],
    pages: routes.map((r) => ({ route: r, title: r, hidden: false, headings: [], text: "" })),
    aliases,
  };

  new Function(theme.appJs)();
}

function visibleRoute(): string | null {
  const articles = Array.from(document.querySelectorAll<HTMLElement>("#content [data-route]"));
  const shown = articles.filter((el) => !el.hidden);
  return shown.length === 1 ? shown[0]!.getAttribute("data-route") : null;
}

function navigate(hash: string): void {
  window.location.hash = "#" + encodeURI(hash);
  window.dispatchEvent(new Event("hashchange"));
}

/** The hash as it stands in the address bar, decoded for comparison. */
function currentHash(): string {
  return decodeURI(window.location.hash.replace(/^#/, ""));
}

describe("route aliases in the client", () => {
  beforeEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
  });

  it("renders the page an old route now points at", async () => {
    await mountClient(["/", "/guide/install"], { "/setup/install": "/guide/install" });

    navigate("/setup/install");

    expect(visibleRoute()).toBe("/guide/install");
  });

  it("replaces the hash with the current route, so the next copy of the link works", async () => {
    await mountClient(["/", "/guide/install"], { "/setup/install": "/guide/install" });

    navigate("/setup/install");

    expect(currentHash()).toBe("/guide/install");
  });

  it("keeps an anchor across the substitution, because it names a heading and not a path", async () => {
    await mountClient(["/", "/guide/install"], { "/setup/install": "/guide/install" }, [
      "guide-install-configuration",
    ]);

    navigate("/setup/install#guide-install-configuration");

    expect(visibleRoute()).toBe("/guide/install");
    expect(currentHash()).toBe("/guide/install#guide-install-configuration");
  });

  it("never lets an alias shadow a real page", async () => {
    // The table should not carry this — the build drops a shadowed alias — but the client must not
    // depend on that, because a hand-edited or older document could still hold one.
    await mountClient(["/", "/guide/install"], { "/guide/install": "/" });

    navigate("/guide/install");

    expect(visibleRoute()).toBe("/guide/install");
    expect(currentHash()).toBe("/guide/install");
  });

  it("leaves a hash matching neither a page nor an alias to the existing fallback", async () => {
    await mountClient(["/", "/guide/install"], { "/setup/install": "/guide/install" });

    navigate("/nowhere");

    expect(visibleRoute()).toBe("/");
    expect(currentHash()).toBe("/nowhere");
  });

  it("resolves an alias on first load rather than only on a later hash change", async () => {
    window.location.hash = "#" + encodeURI("/setup/install");
    await mountClient(["/", "/guide/install"], { "/setup/install": "/guide/install" });

    expect(visibleRoute()).toBe("/guide/install");
    expect(currentHash()).toBe("/guide/install");
  });

  it("does not treat an inherited object property as an alias", async () => {
    await mountClient(["/", "/guide/install"], {});

    navigate("/constructor");

    expect(visibleRoute()).toBe("/");
  });
});
