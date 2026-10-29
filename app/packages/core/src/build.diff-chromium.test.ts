import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build";

/**
 * What only a browser can show about a difference (roadmap 7.3.4): the two columns lined up block
 * by block, the views, and the way through the changes.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

let base: string;
let out: string;

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-chromium-"));
  const shared = "> [!NOTE]\n> A note.\n\n```js\nconst a = 1;\n```\n\nEnd.\n";
  await write(join(base, "then"), {
    "docs/a.md":
      "# A\n\n1. one\n2. two\n3. three\n\n- x\n  - y\n  - z\n\n| h |\n|---|\n| 1 |\n| 2 |\n| 3 |\n\n" +
      shared,
    "docs/b.md": "# B\n\nGone.\n",
  });
  await write(join(base, "now"), {
    "docs/a.md":
      "# A\n\n1. one\n2. three\n\nAn added paragraph,\nlong enough to wrap onto lines of its own.\n\n" +
      "- x\n  - y\n\n| h |\n|---|\n| 1 |\n\n" +
      shared,
    "docs/c.md": "# C\n\nNew.\n",
  });
  out = join(base, "out.html");
  vi.spyOn(process, "cwd").mockReturnValue(join(base, "now"));
  await buildSite({ outputFile: out, diff: { dir: "../then", label: "v1" } });
  vi.restoreAllMocks();
});

// Closing the browser can outlast the default hook timeout when the suite runs under load.
afterAll(async () => {
  await rm(base, { recursive: true, force: true });
  await shared?.close();
}, 60_000);

/**
 * One browser for every test here, each opening and closing its own pages: launching one per test
 * slows the whole suite enough, under load, to time other browser tests out.
 */
let shared: import("puppeteer-core").Browser | undefined;
async function sharedBrowser(): Promise<import("puppeteer-core").Browser> {
  if (shared === undefined) {
    const puppeteer = await import("puppeteer-core");
    shared = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
  }
  return shared;
}

async function closePages(browser: import("puppeteer-core").Browser): Promise<void> {
  for (const page of await browser.pages()) await page.close();
}

describe.skipIf(!chromium)("the difference in a real browser", () => {
  it("lines up every unchanged pair, walks every change, and switches the view", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      await page.goto(`${pathToFileURL(out).href}#/a`);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const offsets = () =>
        page.evaluate(() => {
          const article = [...document.querySelectorAll("article.page")].find((a) => !a.hidden)!;
          const [left, right] = [...article.querySelectorAll(".monodocs-diff-columns > div")];
          return [...left!.querySelectorAll("[data-monodocs-diff-pair]")]
            .filter((node) => !/^(TR|TD|TH)$/.test(node.tagName))
            .map((node) => {
              const pair = node.getAttribute("data-monodocs-diff-pair");
              const other = right!.querySelector(`[data-monodocs-diff-pair="${pair}"]`)!;
              return Math.round(
                node.getBoundingClientRect().top - other.getBoundingClientRect().top,
              );
            });
        });
      // Lining up runs after the layout settles; under load that takes a while, so wait for it.
      const lined = async () => {
        for (let waited = 0; waited < 5000; waited += 100) {
          const gaps = await offsets();
          if (gaps.length > 5 && gaps.every((gap) => Math.abs(gap) <= 1)) return gaps;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return offsets();
      };
      const before = await lined();
      expect(before.length).toBeGreaterThan(5);
      expect(before.every((gap) => Math.abs(gap) <= 1)).toBe(true);
      // Lined up again at another width, which wraps the added paragraph differently.
      await page.setViewport({ width: 1100, height: 900 });
      expect((await lined()).every((gap) => Math.abs(gap) <= 1)).toBe(true);
      // And when the content's width changes with the window's the same: the sidebar closed.
      await page.evaluate(() => document.body.classList.toggle("sidebar-collapsed"));
      expect((await lined()).every((gap) => Math.abs(gap) <= 1)).toBe(true);
      await page.evaluate(() => document.body.classList.toggle("sidebar-collapsed"));
      await page.setViewport({ width: 1500, height: 900 });

      // Left alone, the page is left alone: nothing is lined up again over and over — the count it
      // writes is in the page it watches — and a reader scrolled to the end stays there.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const idle = await page.evaluate(async () => {
        let changes = 0;
        const watcher = new MutationObserver((records) => (changes += records.length));
        watcher.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 600));
        watcher.disconnect();
        return changes;
      });
      expect(idle).toBe(0);
      const end = await page.evaluate(async () => {
        const scroller = document.scrollingElement!;
        scroller.scrollTop = scroller.scrollHeight;
        const bottom = scroller.scrollTop;
        window.dispatchEvent(new Event("resize"));
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { bottom, after: scroller.scrollTop };
      });
      expect(end.after).toBe(end.bottom);

      // The bar stays at the top while the page scrolls, its views in the order of the columns.
      await page.evaluate(() => window.scrollTo(0, 600));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const bar = await page.evaluate(() => ({
        top: Math.round(document.querySelector(".monodocs-diff-bar")!.getBoundingClientRect().top),
        views: [...document.querySelectorAll(".monodocs-diff-views button")].map((b) =>
          b.getAttribute("data-monodocs-diff-view"),
        ),
      }));
      expect(bar).toEqual({ top: 0, views: ["both", "earlier", "current"] });

      // A row's ring is drawn inside it, where the table's own scrolling box does not cut it.
      const offset = await page.evaluate(() => {
        const row = document.querySelector("article:not([hidden]) tr[data-monodocs-diff-block]")!;
        row.classList.add("monodocs-diff-change-current");
        const value = getComputedStyle(row).outlineOffset;
        row.classList.remove("monodocs-diff-change-current");
        return value;
      });
      expect(offset).toBe("-2px");

      // Next reaches every change once, across pages, and comes round.
      const seen: string[] = [];
      for (let i = 0; i < 12; i++) {
        await page.click('[data-monodocs-diff-go="1"]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        seen.push(
          await page.evaluate(
            () => `${document.querySelector(".monodocs-diff-count")!.textContent} ${location.hash}`,
          ),
        );
      }
      const total = Number(seen[0]!.split(" / ")[1]!.split(" ")[0]);
      // Five blocks on the page (two items, two rows, the paragraph), and the added and deleted pages.
      expect(total).toBe(7);
      expect(seen.slice(0, total).map((s) => s.split(" ")[0])).toEqual(
        Array.from({ length: total }, (_, i) => String(i + 1)),
      );
      expect(seen.some((s) => s.endsWith("#//deleted/b"))).toBe(true);
      expect(seen.some((s) => s.endsWith("#/c"))).toBe(true);
      // The added page is reached at its first block, its note being in the column the new view hides.
      await page.click('[data-monodocs-diff-view="current"]');
      await page.evaluate(() => {
        location.hash = "#/a";
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      let added = "";
      for (let step = 0; step < 8 && added === ""; step++) {
        await page.click('[data-monodocs-diff-go="1"]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        added = await page.evaluate(() =>
          decodeURI(location.hash) === "#/c"
            ? document.querySelector(".monodocs-diff-change-current")!.tagName
            : "",
        );
      }
      expect(added).toBe("H1");
      await page.click('[data-monodocs-diff-view="both"]');
      expect(seen[total]!.startsWith("1 /")).toBe(true);

      // The earlier version's view hides the new column and counts what it shows, through the
      // pages the earlier version has: the four deletions, and the deleted page by its column.
      await page.click('[data-monodocs-diff-view="earlier"]');
      const earlier = await page.evaluate(() => ({
        view: document.documentElement.getAttribute("data-monodocs-diff-view"),
        count: document.querySelector(".monodocs-diff-count")!.textContent,
        current: [...document.querySelectorAll(".monodocs-diff-current")].every(
          (node) => getComputedStyle(node).display === "none",
        ),
      }));
      expect(earlier).toEqual({ view: "earlier", count: "– / 5", current: true });

      // Leaving the list of changes for a version's own view opens that version's first page.
      await page.goto(`${pathToFileURL(out).href}#//changes`);
      await page.click('[data-monodocs-diff-view="both"]');
      await page.click('[data-monodocs-diff-view="earlier"]');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await page.evaluate(() => decodeURI(location.hash))).toBe("#/a");

      // The previous and next pages: none side by side; each version's own order in its view.
      const next = () =>
        page.evaluate(() => {
          const nav = document.getElementById("page-nav")!;
          if (getComputedStyle(nav).display === "none") return "hidden";
          return nav.querySelector(".page-nav-next")?.getAttribute("data-route") ?? "none";
        });
      await page.goto(`${pathToFileURL(out).href}#/a`);
      await page.click('[data-monodocs-diff-view="both"]');
      expect(await next()).toBe("hidden");
      await page.click('[data-monodocs-diff-view="earlier"]');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await next()).toBe("//deleted/b");
      await page.click('[data-monodocs-diff-view="current"]');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await next()).toBe("/c");

      // That view is the earlier version, plain, until the box marks its changes.
      const marked = () =>
        page.evaluate(() => {
          const block = document.querySelector(
            "article:not([hidden]) .monodocs-diff-earlier [data-monodocs-diff-block]",
          )!;
          const badge = document.querySelector(
            '[data-monodocs-diff-sidebar="earlier"] .monodocs-diff-mark',
          )!;
          const box = document.querySelector<HTMLInputElement>(
            "[data-monodocs-diff-marks-toggle]",
          )!;
          return {
            band: getComputedStyle(block).backgroundColor !== "rgba(0, 0, 0, 0)",
            badge: getComputedStyle(badge).display !== "none",
            box: `${box.checked ? "ticked" : "clear"}${box.disabled ? ", fixed" : ""}`,
          };
        });
      await page.goto(`${pathToFileURL(out).href}#/a`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await page.click('[data-monodocs-diff-view="earlier"]');
      expect(await marked()).toEqual({ band: false, badge: false, box: "clear" });
      // The bar names the version; the column's own heading is for telling two apart.
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll("article:not([hidden]) .monodocs-diff-column-title")].every(
            (title) => getComputedStyle(title).display === "none",
          ),
        ),
      ).toBe(true);
      await page.click("[data-monodocs-diff-marks-toggle]");
      expect(await marked()).toEqual({ band: true, badge: true, box: "ticked" });
      // Side by side always marks: the box stays in view, ticked and fixed; the choice comes back.
      await page.click('[data-monodocs-diff-view="both"]');
      expect((await marked()).box).toBe("ticked, fixed");
      await page.click('[data-monodocs-diff-view="current"]');
      expect((await marked()).box).toBe("ticked");
    } finally {
      await closePages(browser);
    }
  });
});

describe.skipIf(!chromium)("the in-page table of contents of a changed page", () => {
  it("lists both versions' headings, marks the added and deleted, and counts each section", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-toc-"));
    try {
      await write(join(dir, "then"), {
        "docs/a.md":
          "# A\n\n## Kept\n\nOne.\n\nTwo.\n\n## Gone\n\nOld.\n\n## Cost $x^2$\n\nSame.\n",
      });
      await write(join(dir, "now"), {
        "docs/a.md":
          "# A\n\n## Kept\n\nOne.\n\nNew.\n\n## Added\n\nFresh.\n\n## Cost $x^2$\n\nSame.\n",
      });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1500, height: 900 });
        await page.goto(`${pathToFileURL(html).href}#/a`);
        const toc = () =>
          page.evaluate(() =>
            [...document.querySelectorAll("#toc-nav a[data-monodocs-diff-toc]")].map((a) =>
              a.textContent!.replace(/\s+/g, " ").trim(),
            ),
          );
        const settled = async (want: string[]) => {
          for (let waited = 0; waited < 5000; waited += 100) {
            if (JSON.stringify(await toc()) === JSON.stringify(want)) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return toc();
        };
        // Side by side: Kept with its two changes, the deleted Gone and the added Added, each with
        // itself and its paragraph.
        // A formula in a heading reads as its TeX, as the theme's table of contents writes it.
        const both = ["Kept2", "−Gone2", "+Added2", "Cost $x^2$"];
        expect(await settled(both)).toEqual(both);
        // The new version's own view, plain: its headings alone, unmarked.
        await page.click('[data-monodocs-diff-view="current"]');
        expect(await settled(["Kept", "Added", "Cost $x^2$"])).toEqual([
          "Kept",
          "Added",
          "Cost $x^2$",
        ]);
        // A heading in the list opens its section.
        await page.click('[data-monodocs-diff-toc="2"]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const opened = await page.evaluate(() => {
          const heading = [...document.querySelectorAll(".monodocs-diff-current h2")].find((h) =>
            h.textContent!.startsWith("Cost"),
          )!;
          const box = heading.getBoundingClientRect();
          return {
            inView: box.top >= 0 && box.bottom <= window.innerHeight,
            active: document.querySelector("#toc-nav a.active")?.textContent?.trim(),
          };
        });
        expect(opened).toEqual({ inView: true, active: "Cost $x^2$" });
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromium)("an image replaced under the same name", () => {
  it("is ringed in each column, its colour that of its change", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-image-"));
    try {
      const svg = (fill: string) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="${fill}"/></svg>`;
      await write(join(dir, "then"), {
        "docs/a.md": "# A\n\n![x](x.svg)\n",
        "docs/x.svg": svg("blue"),
      });
      await write(join(dir, "now"), {
        "docs/a.md": "# A\n\n![x](x.svg)\n",
        "docs/x.svg": svg("orange"),
      });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        await page.goto(`${pathToFileURL(html).href}#/a`);
        const rings = await page.evaluate(() =>
          [...document.querySelectorAll("article:not([hidden]) img[data-monodocs-diff-block]")].map(
            (img) =>
              `${img.getAttribute("data-monodocs-diff-block")} ${getComputedStyle(img).outlineStyle}`,
          ),
        );
        expect(rings).toEqual(["del solid", "ins solid"]);
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromium)("a page whose only change is its note", () => {
  it("is shown where it is in a version's plain view, where the note is hidden", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-note-"));
    try {
      await write(join(dir, "then"), {
        "docs/a.md": "# A\n\nText.\n",
        "docs/d.md": "# D\n\nKept.\n\nGone.\n",
        "docs/old.md": "# Moved\n\nText.\n",
      });
      await write(join(dir, "now"), {
        "docs/a.md": "# A\n\nText.\n",
        "docs/d.md": "# D\n\nKept.\n",
        "docs/new.md": "---\naliases: [/old]\n---\n\n# Moved\n\nText.\n",
      });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        await page.goto(`${pathToFileURL(html).href}#/a`);
        await page.click('[data-monodocs-diff-view="current"]');
        // D's one change, a deletion, is in the column this view hides: the move alone is counted.
        expect(
          await page.evaluate(() => document.querySelector(".monodocs-diff-count")!.textContent),
        ).toBe("– / 1");
        await page.click('[data-monodocs-diff-go="1"]');
        await new Promise((resolve) => setTimeout(resolve, 600));
        const at = await page.evaluate(() => {
          const ring = document.querySelector(".monodocs-diff-change-current");
          return {
            hash: decodeURI(location.hash),
            shown: ring !== null && (ring as HTMLElement).offsetParent !== null,
          };
        });
        expect(at).toEqual({ hash: "#/new", shown: true });

        // A marked block the navigation is on is ringed in the plain view too, its mark off.
        await page.goto(`${pathToFileURL(html).href}#/a`);
        await page.click('[data-monodocs-diff-view="current"]');
        const ring = await page.evaluate(() => {
          const block = document.createElement("p");
          block.setAttribute("data-monodocs-diff-block", "ins");
          block.className = "monodocs-diff-change-current";
          document.querySelector("article:not([hidden])")!.appendChild(block);
          const style = getComputedStyle(block);
          return `${style.outlineStyle} ${style.backgroundColor}`;
        });
        expect(ring).toBe("solid rgba(0, 0, 0, 0)");
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromium)("a diagram in a column a view hides", () => {
  it("is drawn when its column is shown, not while it is hidden", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-mermaid-"));
    try {
      const diagram = (to: string) => `# A\n\n\`\`\`mermaid\ngraph LR\n  Start --> ${to}\n\`\`\`\n`;
      await write(join(dir, "then"), { "docs/a.md": diagram("Old") });
      await write(join(dir, "now"), { "docs/a.md": diagram("New") });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1500, height: 900 });
        await page.goto(pathToFileURL(html).href);
        await page.click('[data-monodocs-diff-view="current"]');
        await page.evaluate(() => {
          location.hash = "#/a";
        });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await page.click('[data-monodocs-diff-view="both"]');
        const width = async () =>
          page.evaluate(() => {
            const svg = document.querySelector(
              "article:not([hidden]) .monodocs-diff-earlier .mermaid svg",
            );
            return svg ? Math.round(svg.getBoundingClientRect().width) : 0;
          });
        let drawn = 0;
        for (let waited = 0; waited < 5000 && drawn === 0; waited += 200) {
          drawn = await width();
          if (drawn === 0) await new Promise((resolve) => setTimeout(resolve, 200));
        }
        expect(drawn).toBeGreaterThan(20);
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});

describe.skipIf(!chromium)("an image the earlier column shows as its path", () => {
  it("is lined up with its pair, whichever side stands lower", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-path-"));
    try {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      const config = "assets:\n  embedImages: false\n";
      await mkdir(join(dir, "then", "docs"), { recursive: true });
      await mkdir(join(dir, "now", "docs"), { recursive: true });
      for (const version of ["then", "now"]) {
        await writeFile(join(dir, version, "docs", "dot.png"), png);
        await writeFile(join(dir, version, "monodocs.config.yml"), config);
      }
      // Paragraphs added above the image in the new version: the earlier side is the higher one.
      await writeFile(join(dir, "then", "docs", "a.md"), "# A\n\n![dot](dot.png)\n");
      await writeFile(
        join(dir, "now", "docs", "a.md"),
        "# A\n\nOne.\n\nTwo.\n\nThree.\n\n![dot](dot.png)\n",
      );
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1500, height: 900 });
        await page.goto(`${pathToFileURL(html).href}#/a`);
        let gap = Infinity;
        for (let waited = 0; waited < 5000 && Math.abs(gap) > 1; waited += 100) {
          gap = await page.evaluate(() => {
            const left = document.querySelector(
              ".monodocs-diff-earlier span[data-monodocs-diff-pair]",
            )!;
            const pair = left.getAttribute("data-monodocs-diff-pair");
            const right = document.querySelector(
              `.monodocs-diff-current [data-monodocs-diff-pair="${pair}"]`,
            )!;
            return Math.round(left.getBoundingClientRect().top - right.getBoundingClientRect().top);
          });
          if (Math.abs(gap) > 1) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(Math.abs(gap)).toBeLessThanOrEqual(1);
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromium)("the way through the changes in a version's own view", () => {
  it("follows that version's order, as its sidebar lists the pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-order-"));
    try {
      await write(join(dir, "then"), {
        "docs/a.md": "# A\n\nOld A.\n",
        "docs/b.md": "# B\n\nOld B.\n",
        "docs/c.md": "# C\n\nOld C.\n",
      });
      // The new version reverses the order: C, B, A.
      await write(join(dir, "now"), {
        "docs/a.md": "---\norder: 3\n---\n\n# A\n\nNew A.\n",
        "docs/b.md": "---\norder: 2\n---\n\n# B\n\nNew B.\n",
        "docs/c.md": "---\norder: 1\n---\n\n# C\n\nNew C.\n",
      });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        const walk = async (view: string) => {
          await page.goto(`${pathToFileURL(html).href}#//changes`);
          await page.click('[data-monodocs-diff-view="both"]');
          await page.click(`[data-monodocs-diff-view="${view}"]`);
          const seen: string[] = [];
          for (let step = 0; step < 3; step++) {
            await page.click('[data-monodocs-diff-go="1"]');
            await new Promise((resolve) => setTimeout(resolve, 400));
            seen.push(await page.evaluate(() => decodeURI(location.hash)));
          }
          return seen;
        };
        expect(await walk("earlier")).toEqual(["#/a", "#/b", "#/c"]);
        expect(await walk("current")).toEqual(["#/c", "#/b", "#/a"]);
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromium)("a change inside a collapsed block, and the earlier footnotes", () => {
  it("opens the block to show the change, and lists the earlier footnotes with no number", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-details-"));
    try {
      await write(join(dir, "then"), {
        "docs/a.adoc": "= A\n\n.More\n[%collapsible]\n====\nOld inside.\n====\n",
        "docs/b.md": "# B\n\nOne[^a] and two[^b].\n\n[^a]: First.\n[^b]: Second.\n",
      });
      await write(join(dir, "now"), {
        "docs/a.adoc": "= A\n\n.More\n[%collapsible]\n====\nNew inside.\n====\n",
        "docs/b.md": "# B\n\nOne and two[^b].\n\n[^b]: Second.\n",
      });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const browser = await sharedBrowser();
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1500, height: 900 });
        await page.goto(`${pathToFileURL(html).href}#/a`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await page.click('[data-monodocs-diff-go="1"]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const opened = await page.evaluate(() => {
          const ring = document.querySelector(".monodocs-diff-change-current")!;
          return {
            inside: ring.closest("details")?.open,
            visible: (ring as HTMLElement).offsetParent !== null,
          };
        });
        expect(opened).toEqual({ inside: true, visible: true });
        // The deletion and the addition inside the block, in each column, are reached once each:
        // opening one column's block does not change their order.
        await page.click('[data-monodocs-diff-go="1"]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const second = await page.evaluate(() => {
          const ring = document.querySelector(".monodocs-diff-change-current")!;
          return {
            mark: ring.getAttribute("data-monodocs-diff-block"),
            count: document.querySelector(".monodocs-diff-count")!.textContent,
          };
        });
        expect(second).toEqual({ mark: "ins", count: "2 / 3" });
        await page.goto(`${pathToFileURL(html).href}#/b`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const markers = await page.evaluate(() =>
          [...document.querySelectorAll("article:not([hidden]) .monodocs-diff-columns > div")].map(
            (column) => {
              const list = column.querySelector(":is(section.footnotes, [data-footnotes]) > ol");
              return list ? getComputedStyle(list).listStyleType : "";
            },
          ),
        );
        expect(markers).toEqual(["none", "decimal"]);
      } finally {
        await closePages(browser);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!chromium)("search in each view", () => {
  it("searches the version the view reads, and searches anew when the view changes", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      await page.goto(`${pathToFileURL(out).href}#/a`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      // "two" is a step only the earlier version has.
      await page.type("#search-input", "two");
      const results = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("#search-results a[data-route]")].map((a) =>
            a.getAttribute("data-route"),
          ),
        );
      const settled = async (want: string[]) => {
        for (let waited = 0; waited < 3000; waited += 100) {
          if (JSON.stringify(await results()) === JSON.stringify(want)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return results();
      };
      expect(await settled([])).toEqual([]);
      await page.click('[data-monodocs-diff-view="earlier"]');
      expect(await settled(["/a"])).toEqual(["/a"]);
      // A result opens the page, and the highlight stays in the column of the version searched.
      await page.click('#search-results a[data-route="/a"]');
      await new Promise((resolve) => setTimeout(resolve, 400));
      const marks = await page.evaluate(() => ({
        earlier: document.querySelectorAll(
          "article:not([hidden]) .monodocs-diff-earlier mark.search-hit",
        ).length,
        current: document.querySelectorAll(
          "article:not([hidden]) .monodocs-diff-current mark.search-hit",
        ).length,
      }));
      expect(marks.earlier).toBeGreaterThan(0);
      expect(marks.current).toBe(0);
      // A document's own <mark class="search-hit"> is not a highlight, and stays.
      await page.evaluate(() => {
        const own = document.createElement("mark");
        own.className = "search-hit";
        own.id = "own-mark";
        own.textContent = "own";
        document.querySelector("article:not([hidden]) .monodocs-diff-earlier p")!.appendChild(own);
      });
      await page.focus("#search-input");
      await page.click('[data-monodocs-diff-view="current"]');
      expect(await settled([])).toEqual([]);
      const left = await page.evaluate(() => ({
        own: document.getElementById("own-mark") !== null,
        highlights: document.querySelectorAll(
          "article:not([hidden]) .monodocs-diff-earlier mark.search-hit",
        ).length,
      }));
      expect(left).toEqual({ own: true, highlights: 1 });
    } finally {
      await closePages(browser);
    }
  });
});

/** Builds a difference from `then` to `now` into a new directory, returning both. */
async function builtDiff(
  prefix: string,
  then: Record<string, string>,
  now: Record<string, string>,
): Promise<{ dir: string; html: string }> {
  const dir = await mkdtemp(join(tmpdir(), `monodocs-diff-${prefix}-`));
  await write(join(dir, "then"), then);
  await write(join(dir, "now"), now);
  const html = join(dir, "out.html");
  vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
  try {
    await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
  } finally {
    vi.restoreAllMocks();
  }
  return { dir, html };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads `read` until `ok` holds or five seconds pass, and returns the last reading. */
async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean): Promise<T> {
  for (let waited = 0; waited < 5000; waited += 100) {
    const value = await read();
    if (ok(value)) return value;
    await sleep(100);
  }
  return read();
}

/** What Next lands on, `steps` times: the page, and the element ringed. */
async function walk(page: import("puppeteer-core").Page, steps: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < steps; i++) {
    await page.click('[data-monodocs-diff-go="1"]');
    await sleep(300);
    seen.push(
      await page.evaluate(() => {
        const ring = document.querySelector(".monodocs-diff-change-current");
        const what = ring
          ? ring.classList.contains("monodocs-diff-note")
            ? "note"
            : `${ring.tagName}:${ring.textContent!.trim()}`
          : "none";
        return `${decodeURI(location.hash)} ${what}`;
      }),
    );
  }
  return seen;
}

/**
 * Opens `route` of `html` in `view`, chosen on the bar as a reader would, in a fresh load: a change
 * of the hash alone would keep the box as it was left.
 */
async function openView(
  page: import("puppeteer-core").Page,
  html: string,
  view: string,
  route: string,
): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`${pathToFileURL(html).href}#${route}`);
  await sleep(200);
  if (view !== "both") await page.click(`[data-monodocs-diff-view="${view}"]`);
  await sleep(200);
}

const countOf = (page: import("puppeteer-core").Page) =>
  page.evaluate(() => document.querySelector(".monodocs-diff-count")!.textContent);

/**
 * Pages of each kind a difference has: a changed page whose changes lie far down it, past an
 * unchanged run long enough to scroll, with a heading only the earlier version has; an added, a
 * deleted, a moved, and a retitled page.
 */
const filler = Array.from({ length: 40 }, (_, i) => `Filler ${i + 1}.`).join("\n\n");
const head = "# A\n\n## Kept head\n\nKept.\n\n";
const kinds = {
  then: {
    "docs/a.md": `${head}${filler}\n\n## Zebra section\n\nStriped.\n\nOld para.\n`,
    "docs/b.md": "# B\n\nGone.\n",
    "docs/old.md": "# Moved\n\nText.\n",
    "docs/t.md": "---\ntitle: Old T\n---\n\nSame.\n",
  },
  now: {
    "docs/a.md": `${head}${filler}\n\nNew para.\n`,
    "docs/c.md": "# C\n\nNew.\n",
    "docs/new.md": "---\naliases: [/old]\n---\n\n# Moved\n\nText.\n",
    "docs/t.md": "---\ntitle: New T\n---\n\nSame.\n",
  },
};

describe.skipIf(!chromium)("each kind of page in each view", () => {
  let dir: string;
  let html: string;
  beforeAll(async () => {
    ({ dir, html } = await builtDiff("kinds", kinds.then, kinds.now));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const open = (page: import("puppeteer-core").Page, view: string, route: string) =>
    openView(page, html, view, route);

  it("shows an added page in the earlier view as its note alone, and hides a page note while plain", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      const article = () =>
        page.evaluate(() =>
          (document.querySelector("article.page:not([hidden])") as HTMLElement).innerText.trim(),
        );
      // Plain or marked, the earlier version's view of an added page is the note saying so.
      await open(page, "earlier", "/c");
      expect(await article()).toBe("This page was added.");
      await page.click("[data-monodocs-diff-marks-toggle]");
      expect(await article()).toBe("This page was added.");

      // A note above a page (a retitled one, a moved one) is hidden in a plain view, in each
      // version's, and shown once the box marks the changes.
      const note = () =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector("article.page:not([hidden]) > .monodocs-diff-note")!,
            ).display,
        );
      for (const view of ["earlier", "current"]) {
        for (const route of ["/t", "/new"]) {
          await open(page, view, route);
          expect(await note()).toBe("none");
          await page.click("[data-monodocs-diff-marks-toggle]");
          expect(await note()).toBe("block");
        }
      }
      // Side by side it is always shown.
      await open(page, "both", "/t");
      expect(await note()).toBe("block");
    } finally {
      await closePages(browser);
    }
  });

  it("shows the new version plain, with no mark, page note, or badge, until the box is ticked", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      const marked = () =>
        page.evaluate(() => {
          const block = document.querySelector(
            "article:not([hidden]) .monodocs-diff-current [data-monodocs-diff-block]",
          )!;
          const shown = (selector: string) =>
            [
              ...document.querySelectorAll(`[data-monodocs-diff-sidebar="current"] ${selector}`),
            ].map((node) => getComputedStyle(node).display !== "none");
          const note = document.querySelector('article[data-route="/t"] > .monodocs-diff-note')!;
          return {
            band: getComputedStyle(block).backgroundColor !== "rgba(0, 0, 0, 0)",
            edge: getComputedStyle(block).boxShadow !== "none",
            badges: shown(".monodocs-diff-mark"),
            labels: shown(".monodocs-diff-label"),
            note: getComputedStyle(note).display !== "none",
          };
        });
      await open(page, "current", "/a");
      // Four pages in the new version's sidebar, each changed: a badge and a label each.
      expect(await marked()).toEqual({
        band: false,
        edge: false,
        badges: [false, false, false, false],
        labels: [false, false, false, false],
        note: false,
      });
      await page.click("[data-monodocs-diff-marks-toggle]");
      expect(await marked()).toEqual({
        band: true,
        edge: true,
        badges: [true, true, true, true],
        labels: [true, true, true, true],
        note: true,
      });
    } finally {
      await closePages(browser);
    }
  });

  it("walks each change in a version's own view, its marks off and on", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      // Plain, a page whose change is its hidden note is reached at its first block; marked, at
      // the note itself. The added page is reached at its first block either way.
      await open(page, "current", "//changes");
      expect(await walk(page, 5)).toEqual([
        "#/a P:New para.",
        "#/c H1:C",
        "#/new H1:Moved",
        "#/t P:Same.",
        "#/a P:New para.",
      ]);
      expect(await countOf(page)).toBe("1 / 4");
      // Ticking the box starts the way again, from the page shown.
      await page.click("[data-monodocs-diff-marks-toggle]");
      expect(await walk(page, 5)).toEqual([
        "#/a P:New para.",
        "#/c H1:C",
        "#/new note",
        "#/t note",
        "#/a P:New para.",
      ]);

      await open(page, "earlier", "//changes");
      const earlier = [
        "#/a H2:Zebra section",
        "#/a P:Striped.",
        "#/a P:Old para.",
        "#//deleted/b H1:B",
      ];
      expect(await walk(page, 6)).toEqual([...earlier, "#/new H1:Moved", "#/t P:Same."]);
      // Ticking the box starts the way again, from the page shown.
      await page.click("[data-monodocs-diff-marks-toggle]");
      expect(await walk(page, 7)).toEqual(["#/t note", ...earlier, "#/new note", "#/t note"]);
    } finally {
      await closePages(browser);
    }
  });

  it("counts a retitled page among the changes side by side, and reaches it", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      await open(page, "both", "//changes");
      const seen = await walk(page, 9);
      // Four marked blocks on /a, and four pages whose change no block carries: the added, the
      // deleted, the moved, and the retitled.
      const blocks = await page.evaluate(
        () => document.querySelectorAll("article.page [data-monodocs-diff-block]").length,
      );
      expect(blocks).toBe(4);
      // On /a in the order they stand: the added paragraph, nothing being under it to line up,
      // stands level with the deleted heading's margin, above it.
      expect(seen).toEqual([
        "#/a P:New para.",
        "#/a H2:Zebra section",
        "#/a P:Striped.",
        "#/a P:Old para.",
        "#//deleted/b note",
        "#/c note",
        "#/new note",
        "#/t note",
        "#/a P:New para.",
      ]);
      expect(await countOf(page)).toBe(`1 / ${blocks + 4}`);
    } finally {
      await closePages(browser);
    }
  });

  it("brings the change the bar goes to on another page into view, and leaves out the list of changes", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      const ring = () =>
        page.evaluate(() => {
          const box = document
            .querySelector(".monodocs-diff-change-current")!
            .getBoundingClientRect();
          return {
            hash: decodeURI(location.hash),
            scrolled: window.scrollY > 500,
            inView: box.top >= 0 && box.bottom <= window.innerHeight,
          };
        });
      // From the list of changes to the first change on /a, past forty paragraphs.
      await open(page, "both", "//changes");
      await page.click('[data-monodocs-diff-go="1"]');
      await sleep(400);
      expect(await ring()).toEqual({ hash: "#/a", scrolled: true, inView: true });
      // Back from the added page to the last change on /a, in the new version's own view.
      await open(page, "current", "/c");
      await page.click('[data-monodocs-diff-go="-1"]');
      await sleep(400);
      expect(await ring()).toEqual({ hash: "#/a", scrolled: true, inView: true });

      // In a version's own view, Previous from its first page comes round to its last change, not
      // to the list of changes, and the page navigation under the first page has no previous page.
      for (const view of ["earlier", "current"]) {
        await open(page, view, "/a");
        expect(
          await page.evaluate(() => [
            document.querySelector("#page-nav .page-nav-prev")?.getAttribute("data-route") ??
              "none",
            document.querySelector("#page-nav .page-nav-next")!.getAttribute("data-route"),
          ]),
        ).toEqual(["none", view === "earlier" ? "//deleted/b" : "/c"]);
        await page.click('[data-monodocs-diff-go="-1"]');
        await sleep(400);
        expect(await page.evaluate(() => decodeURI(location.hash))).toBe("#/t");
      }
    } finally {
      await closePages(browser);
    }
  });

  it("shows each state in the sidebar in its colour, and each view's own sidebar", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      await open(page, "both", "//changes");
      const badges = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-monodocs-diff-sidebar="both"] .sidebar-page[data-monodocs-diff-page]',
          ),
        ].map((item) => {
          const mark = item.querySelector(".monodocs-diff-mark")!;
          const label = getComputedStyle(item.querySelector(".monodocs-diff-label")!);
          return {
            state: item.getAttribute("data-monodocs-diff-page"),
            sign: mark.textContent,
            colour: getComputedStyle(mark).color,
            label: [
              label.display,
              label.position,
              label.width,
              label.height,
              label.overflow,
              label.clip,
            ].join(" "),
          };
        }),
      );
      // The default theme's light colours: its tip, caution, warning, and note.
      const hidden = "block absolute 1px 1px hidden rect(0px, 0px, 0px, 0px)";
      expect(badges).toEqual([
        { state: "changed", sign: "•", colour: "rgb(154, 103, 0)", label: hidden },
        { state: "deleted", sign: "−", colour: "rgb(207, 34, 46)", label: hidden },
        { state: "added", sign: "+", colour: "rgb(26, 127, 55)", label: hidden },
        { state: "moved", sign: "→", colour: "rgb(9, 105, 218)", label: hidden },
        { state: "changed", sign: "•", colour: "rgb(154, 103, 0)", label: hidden },
      ]);

      // The bar stands above the sidebar and the content, not over them, at the top and scrolled.
      const layout = () =>
        page.evaluate(() => {
          const bar = document.querySelector(".monodocs-diff-bar")!.getBoundingClientRect();
          const sidebar = document.getElementById("sidebar")!.getBoundingClientRect();
          const first = document.querySelector("article.page:not([hidden]) > *")!;
          return {
            barTop: Math.round(bar.top),
            sidebarBelow: sidebar.top >= bar.bottom - 1,
            contentBelow: window.scrollY > 0 || first.getBoundingClientRect().top >= bar.bottom - 1,
          };
        });
      expect(await layout()).toEqual({ barTop: 0, sidebarBelow: true, contentBelow: true });
      await open(page, "both", "/a");
      await page.evaluate(() => window.scrollTo(0, 800));
      await sleep(200);
      expect(await layout()).toEqual({ barTop: 0, sidebarBelow: true, contentBelow: true });

      // Each view shows its own sidebar alone: the earlier version's in its order and titles.
      const sidebars = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("[data-monodocs-diff-sidebar]")]
            .filter((sidebar) => getComputedStyle(sidebar).display !== "none")
            .map((sidebar) => ({
              view: sidebar.getAttribute("data-monodocs-diff-sidebar"),
              titles: [...sidebar.querySelectorAll("a[data-route]")].map((a) =>
                a.firstChild!.textContent!.trim(),
              ),
            })),
        );
      expect(await sidebars()).toEqual([
        { view: "both", titles: ["Changes v1", "A", "B", "C", "Moved", "New T"] },
      ]);
      await page.click('[data-monodocs-diff-view="earlier"]');
      expect(await sidebars()).toEqual([{ view: "earlier", titles: ["A", "B", "Moved", "Old T"] }]);
      await page.click('[data-monodocs-diff-view="current"]');
      expect(await sidebars()).toEqual([{ view: "current", titles: ["A", "C", "Moved", "New T"] }]);
    } finally {
      await closePages(browser);
    }
  });

  it("lists the earlier headings in the earlier view, and opens a section only the earlier column has", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      const toc = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("#toc-nav a[data-monodocs-diff-toc]")].map((a) =>
            a.textContent!.replace(/\s+/g, " ").trim(),
          ),
        );
      const zebra = async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(200);
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("#toc-nav a[data-monodocs-diff-toc]")]
            .find((a) => a.textContent!.includes("Zebra"))!
            .click(),
        );
        await sleep(300);
        return page.evaluate(() => {
          const heading = [...document.querySelectorAll("article:not([hidden]) h2")].find((h) =>
            h.textContent!.includes("Zebra"),
          )!;
          const box = heading.getBoundingClientRect();
          return {
            column: heading.closest(".monodocs-diff-earlier") ? "earlier" : "current",
            id: heading.id,
            inView: box.top >= 0 && box.bottom <= window.innerHeight,
          };
        });
      };
      await open(page, "both", "/a");
      // Side by side, each with its changes: the new column's Kept head runs to the added paragraph.
      expect(await until(toc, (list) => list.length === 2)).toEqual([
        "Kept head1",
        "−Zebra section3",
      ]);
      expect(await zebra()).toEqual({ column: "earlier", id: "", inView: true });
      await open(page, "earlier", "/a");
      expect(await until(toc, (list) => list.length === 2)).toEqual(["Kept head", "Zebra section"]);
      expect(await zebra()).toEqual({ column: "earlier", id: "", inView: true });
      await open(page, "current", "/a");
      expect(await until(toc, (list) => list.length === 1)).toEqual(["Kept head"]);
    } finally {
      await closePages(browser);
    }
  });

  it("finds a heading only the earlier version has in its view alone, highlighted in its column", async () => {
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      // The routes found, or the theme's word for none once it has searched.
      const results = () =>
        page.evaluate(() =>
          document.querySelector("#search-results .search-empty")
            ? ["none"]
            : [...document.querySelectorAll("#search-results a[data-route]")].map((a) =>
                a.getAttribute("data-route"),
              ),
        );
      await open(page, "both", "/c");
      await page.type("#search-input", "Zebra");
      expect(await until(results, (list) => list.length > 0)).toEqual(["none"]);
      await page.click('[data-monodocs-diff-view="current"]');
      await sleep(500);
      expect(await until(results, (list) => list.length > 0)).toEqual(["none"]);
      await page.click('[data-monodocs-diff-view="earlier"]');
      expect(await until(results, (list) => list.length > 0)).toEqual(["/a"]);
      await page.click('#search-results a[data-route="/a"]');
      await sleep(400);
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll("article:not([hidden]) mark.search-hit")].map(
            (mark) =>
              `${mark.closest(".monodocs-diff-earlier") ? "earlier" : "current"} ${mark.closest("h2") ? "H2" : "elsewhere"} ${mark.textContent}`,
          ),
        ),
      ).toEqual(["earlier H2 Zebra"]);
    } finally {
      await closePages(browser);
    }
  });
});

/**
 * A document's own struck text, which GFM writes as `<del>`, and a raw `<ins>`, here an AsciiDoc
 * passthrough (Markdown's raw HTML is not kept), on pages that changed elsewhere.
 */
describe.skipIf(!chromium)("a document's own struck and inserted text", () => {
  it("shows the document's own struck and inserted text in every view, marked or plain", async () => {
    const { dir, html } = await builtDiff(
      "own",
      {
        "docs/a.md": "# A\n\nSome ~~struck~~ words.\n\nGone.\n",
        "docs/r.adoc": "= R\n\nKeep +++<ins>raw</ins>+++.\n\nGone.\n",
      },
      {
        "docs/a.md": "# A\n\nSome ~~struck~~ words.\n",
        "docs/r.adoc": "= R\n\nKeep +++<ins>raw</ins>+++.\n",
      },
    );
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      const own = () =>
        page.evaluate(() =>
          [
            ...document.querySelectorAll(
              "article:not([hidden]) :is(del, ins):not([data-monodocs-diff])",
            ),
          ]
            .filter((node) => (node as HTMLElement).offsetParent !== null)
            .map((node) => {
              const column = node.closest(".monodocs-diff-earlier") ? "earlier" : "current";
              return `${column} ${node.textContent} ${getComputedStyle(node).textDecorationLine}`;
            }),
        );
      for (const [route, text] of [
        ["/a", "struck line-through"],
        ["/r", "raw underline"],
      ] as const) {
        await openView(page, html, "both", route);
        expect(await own()).toEqual([`earlier ${text}`, `current ${text}`]);
        for (const view of ["earlier", "current"]) {
          await openView(page, html, view, route);
          expect(await own()).toEqual([`${view} ${text}`]);
          await page.click("[data-monodocs-diff-marks-toggle]");
          expect(await own()).toEqual([`${view} ${text}`]);
        }
      }
    } finally {
      await closePages(browser);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** Each pair's gap, the earlier side's top less the new side's, on the page shown. */
function pairGaps(page: import("puppeteer-core").Page) {
  return page.evaluate(() => {
    const article = [...document.querySelectorAll("article.page")].find((a) => !a.hidden)!;
    const [left, right] = [...article.querySelectorAll(".monodocs-diff-columns > div")];
    return [...left!.querySelectorAll("[data-monodocs-diff-pair]")]
      .filter((node) => !/^(TR|TD|TH)$/.test(node.tagName))
      .map((node) => {
        const pair = node.getAttribute("data-monodocs-diff-pair");
        const other = right!.querySelector(`[data-monodocs-diff-pair="${pair}"]`)!;
        const diagram = node.querySelector("svg") !== null;
        const gap = Math.round(
          node.getBoundingClientRect().top - other.getBoundingClientRect().top,
        );
        return { diagram, gap };
      });
  });
}

describe.skipIf(!chromium)("a diagram with changes around it", () => {
  it("lines up the blocks either side in both columns, at any width, and stacks them when narrow", async () => {
    const diagram = "```mermaid\ngraph LR\n  Start --> End\n```\n";
    const { dir, html } = await builtDiff(
      "around",
      {
        "docs/a.md": `# A\n\nBefore.\n\n${diagram}\nAfter.\n\nTail.\n`,
        "docs/u.md": "# U\n\nSame.\n",
      },
      {
        "docs/a.md":
          "# A\n\nBefore, now a paragraph long enough to wrap onto lines of its own beside the " +
          "earlier one, which stays short.\n\nAnd one more added.\n\n" +
          `${diagram}\nAfter, changed.\n\nTail.\n`,
        "docs/u.md": "# U\n\nSame.\n",
      },
    );
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      await page.goto(`${pathToFileURL(html).href}#/a`);
      // Both diagrams drawn, and every pair, the diagram's and the tail's below it, level.
      const lined = () =>
        until(
          () => pairGaps(page),
          (gaps) =>
            gaps.filter((pair) => pair.diagram).length === 1 &&
            gaps.every((pair) => Math.abs(pair.gap) <= 1),
        );
      const drawn = () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll("article:not([hidden]) .mermaid svg")].filter(
              (svg) => svg.getBoundingClientRect().height > 10,
            ).length,
        );
      expect(await until(drawn, (n) => n === 2)).toBe(2);
      const before = await lined();
      // The heading, the diagram, and the tail.
      expect(before).toEqual([
        { diagram: false, gap: 0 },
        { diagram: true, gap: 0 },
        { diagram: false, gap: 0 },
      ]);
      await page.setViewport({ width: 1100, height: 900 });
      expect((await lined()).every((pair) => Math.abs(pair.gap) <= 1)).toBe(true);

      // Too narrow for two columns, the earlier stands above the new, as wide as it.
      await page.setViewport({ width: 900, height: 900 });
      await sleep(300);
      const stacked = await page.evaluate(() => {
        const earlier = document
          .querySelector("article:not([hidden]) .monodocs-diff-earlier")!
          .getBoundingClientRect();
        const current = document
          .querySelector("article:not([hidden]) .monodocs-diff-current")!
          .getBoundingClientRect();
        return {
          above: earlier.bottom <= current.top,
          left: Math.round(earlier.left - current.left),
          width: Math.round(earlier.width - current.width),
        };
      });
      expect(stacked).toEqual({ above: true, left: 0, width: 0 });

      // A page that did not change is shown once, in no columns.
      await page.setViewport({ width: 1500, height: 900 });
      await page.evaluate(() => {
        location.hash = "#/u";
      });
      await sleep(300);
      expect(
        await page.evaluate(() => {
          const article = document.querySelector("article.page:not([hidden])") as HTMLElement;
          return {
            route: article.getAttribute("data-route"),
            columns: article.querySelector(".monodocs-diff-columns") !== null,
            text: article.innerText.trim(),
          };
        }),
      ).toEqual({ route: "/u", columns: false, text: "U\n\nSame." });
    } finally {
      await closePages(browser);
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});

describe.skipIf(!chromium)("versions that start on different pages", () => {
  it("opens each version's own first page from the list of changes", async () => {
    // The earlier version starts with a page since deleted; the new one with the page after it.
    const { dir, html } = await builtDiff(
      "first",
      { "docs/a.md": "# A\n\nFirst.\n", "docs/b.md": "# B\n\nOld.\n" },
      { "docs/b.md": "# B\n\nNew.\n", "docs/c.md": "# C\n\nAdded.\n" },
    );
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      const shown = () =>
        page.evaluate(() => [
          decodeURI(location.hash),
          document.querySelector("article.page:not([hidden])")!.getAttribute("data-route"),
        ]);
      for (const [view, first] of [
        ["earlier", "//deleted/a"],
        ["current", "/b"],
      ] as const) {
        await openView(page, html, "both", "//changes");
        expect(await shown()).toEqual(["#//changes", "//changes"]);
        // The list of changes is in the side-by-side sidebar alone.
        expect(
          await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-monodocs-diff-sidebar] a[data-route="//changes"]',
              ),
            ].map((a) =>
              a.closest("[data-monodocs-diff-sidebar]")!.getAttribute("data-monodocs-diff-sidebar"),
            ),
          ),
        ).toEqual(["both"]);
        await page.click(`[data-monodocs-diff-view="${view}"]`);
        await sleep(300);
        expect(await shown()).toEqual([`#${first}`, first]);
      }
    } finally {
      await closePages(browser);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * A theme of its own: a template with only the tokens it must have, a stylesheet of one rule, and a
 * script that does nothing but show the page the hash names.
 */
const customTheme = {
  "theme/template.html":
    "<!doctype html>\n<html>\n  <head><style>{{style}}</style></head>\n  <body>\n" +
    '    <nav id="side">{{sidebar}}</nav>\n    <main id="content">{{pages}}</main>\n' +
    "    <script>window.__MONODOCS_DATA__ = {{siteDataJson}};</script>\n" +
    "    <script>{{appJs}}</script>\n{{bodyScripts}}\n  </body>\n</html>\n",
  "theme/style.css": "body { margin: 0; font-family: serif; }\n",
  "theme/app.js":
    "(function () {\n  function show() {\n" +
    "    var route = decodeURI(location.hash.slice(1)) || window.__MONODOCS_DATA__.initialRoute;\n" +
    '    document.querySelectorAll("article.page").forEach(function (page) {\n' +
    '      page.hidden = page.getAttribute("data-route") !== route;\n    });\n  }\n' +
    '  window.addEventListener("hashchange", show);\n  show();\n})();\n',
  "monodocs.config.yml": "html:\n  theme: ./theme\n",
};

describe.skipIf(!chromium)("a custom theme with its own template, style, and script", () => {
  it("gets the bar, the marks, and the navigation", async () => {
    const { dir, html } = await builtDiff(
      "theme",
      { ...customTheme, "docs/a.md": "# A\n\nOld.\n", "docs/b.md": "# B\n\nKeep.\n" },
      {
        ...customTheme,
        "docs/a.md": "# A\n\nNew.\n",
        "docs/b.md": "# B\n\nKeep.\n\nAdded.\n",
      },
    );
    const browser = await sharedBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 900 });
      await page.goto(`${pathToFileURL(html).href}#/a`);
      await sleep(300);
      const shown = await page.evaluate(() => {
        const bar = document.querySelector(".monodocs-diff-bar")!;
        const band = (selector: string) =>
          getComputedStyle(document.querySelector(`article:not([hidden]) ${selector}`)!)
            .backgroundColor !== "rgba(0, 0, 0, 0)";
        return {
          theme:
            document.getElementById("side") !== null && getComputedStyle(document.body).fontFamily,
          bar: `${getComputedStyle(bar).position} ${Math.round(bar.getBoundingClientRect().top)}`,
          views: [...bar.querySelectorAll("[data-monodocs-diff-view]")].length,
          del: band('[data-monodocs-diff-block="del"]'),
          ins: band('[data-monodocs-diff-block="ins"]'),
        };
      });
      expect(shown).toEqual({ theme: "serif", bar: "fixed 0", views: 3, del: true, ins: true });
      expect(await walk(page, 4)).toEqual([
        "#/a P:Old.",
        "#/a P:New.",
        "#/b P:Added.",
        "#/a P:Old.",
      ]);
      // And the views: the new version's own hides the earlier column, and walks its own changes.
      await page.click('[data-monodocs-diff-view="current"]');
      expect(
        await page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector("article:not([hidden]) .monodocs-diff-earlier")!,
            ).display,
        ),
      ).toBe("none");
      expect(await walk(page, 3)).toEqual(["#/a P:New.", "#/b P:Added.", "#/a P:New."]);
    } finally {
      await closePages(browser);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
