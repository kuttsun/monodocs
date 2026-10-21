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

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
  await shared?.close();
});

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
