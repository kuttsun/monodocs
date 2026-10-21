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
});

describe.skipIf(!chromium)("the difference in a real browser", () => {
  it("lines up every unchanged pair, walks every change, and switches the view", async () => {
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
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

      // The earlier version's view hides the new column and counts what it shows: the four
      // deletions, and the added and deleted pages by the earlier column.
      await page.click('[data-monodocs-diff-view="earlier"]');
      const earlier = await page.evaluate(() => ({
        view: document.documentElement.getAttribute("data-monodocs-diff-view"),
        count: document.querySelector(".monodocs-diff-count")!.textContent,
        current: [...document.querySelectorAll(".monodocs-diff-current")].every(
          (node) => getComputedStyle(node).display === "none",
        ),
      }));
      expect(earlier).toEqual({ view: "earlier", count: "– / 6", current: true });

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
      await browser.close();
    }
  });
});

describe.skipIf(!chromium)("the in-page table of contents of a changed page", () => {
  it("lists both versions' headings, marks the added and deleted, and counts each section", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-diff-toc-"));
    try {
      await write(join(dir, "then"), {
        "docs/a.md": "# A\n\n## Kept\n\nOne.\n\nTwo.\n\n## Gone\n\nOld.\n",
      });
      await write(join(dir, "now"), {
        "docs/a.md": "# A\n\n## Kept\n\nOne.\n\nNew.\n\n## Added\n\nFresh.\n",
      });
      const html = join(dir, "out.html");
      vi.spyOn(process, "cwd").mockReturnValue(join(dir, "now"));
      await buildSite({ outputFile: html, diff: { dir: "../then", label: "v1" } });
      vi.restoreAllMocks();
      const puppeteer = await import("puppeteer-core");
      const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
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
        expect(await settled(["Kept2", "−Gone2", "+Added2"])).toEqual([
          "Kept2",
          "−Gone2",
          "+Added2",
        ]);
        // The new version's own view, plain: its headings alone, unmarked.
        await page.click('[data-monodocs-diff-view="current"]');
        expect(await settled(["Kept", "Added"])).toEqual(["Kept", "Added"]);
        // A heading in the list opens its section.
        await page.click('[data-monodocs-diff-toc="1"]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const opened = await page.evaluate(() => {
          const heading = [...document.querySelectorAll(".monodocs-diff-current h2")].find(
            (h) => h.textContent === "Added",
          )!;
          const box = heading.getBoundingClientRect();
          return {
            inView: box.top >= 0 && box.bottom <= window.innerHeight,
            active: document.querySelector("#toc-nav a.active")?.textContent?.trim(),
          };
        });
        expect(opened).toEqual({ inView: true, active: "Added" });
      } finally {
        await browser.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
