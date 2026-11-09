// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLabels } from "../../labels.js";
import { loadTheme } from "../index";

/**
 * The client half of route aliases (roadmap.md 15.5). An alias is consulted only when the hash
 * matches no page, so it can never shadow one; when it does resolve, the address bar is rewritten
 * to the current route, so the link a reader copies next is the one that will still work.
 */
/**
 * Every mount runs the app's IIFE again, and it registers its own `hashchange` listener. Left
 * attached, a listener from an earlier test acts on the current DOM with its own page table — and
 * one whose alias resolves will rewrite the hash before the current instance reads it. So the
 * listeners each mount registers are recorded and removed before the next one.
 */
const mounted: [string, EventListenerOrEventListenerObject][] = [];

function unmountClients(): void {
  for (const [type, listener] of mounted.splice(0)) window.removeEventListener(type, listener);
}

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

  const add = window.addEventListener.bind(window);
  window.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    ...rest: unknown[]
  ) => {
    mounted.push([type, listener]);
    return (add as unknown as (...args: unknown[]) => void)(type, listener, ...rest);
  }) as typeof window.addEventListener;
  try {
    new Function(theme.appJs)();
  } finally {
    window.addEventListener = add;
  }
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
    unmountClients();
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

  /**
   * A route can contain "#": `old#name.md` produces `/old#name`, and `encodeURI` leaves the "#"
   * alone, so that is what the sidebar link and the address bar both hold. Splitting the hash
   * before trying it as a route would send the reader to the first page instead.
   */
  it("reaches a page whose own route contains a hash", async () => {
    await mountClient(["/", "/old#name"], {});

    navigate("/old#name");

    expect(visibleRoute()).toBe("/old#name");
    expect(currentHash()).toBe("/old#name");
  });

  it("resolves an alias whose old route contains a hash", async () => {
    await mountClient(["/", "/guide/new"], { "/old#name": "/guide/new" });

    navigate("/old#name");

    expect(visibleRoute()).toBe("/guide/new");
    expect(currentHash()).toBe("/guide/new");
  });

  it("prefers a real route over splitting, even when the prefix is also a page", async () => {
    await mountClient(["/", "/old", "/old#name"], {});

    navigate("/old#name");

    expect(visibleRoute()).toBe("/old#name");
  });

  it("does not treat an inherited object property as an alias", async () => {
    await mountClient(["/", "/guide/install"], {});

    navigate("/constructor");

    expect(visibleRoute()).toBe("/");
  });
});
