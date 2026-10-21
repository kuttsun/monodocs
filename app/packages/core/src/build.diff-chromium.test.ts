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

      // That view is the earlier version, plain, until the box marks its changes.
      const marked = () =>
        page.evaluate(() => {
          const block = document.querySelector(
            "article:not([hidden]) .monodocs-diff-earlier [data-monodocs-diff-block]",
          )!;
          const badge = document.querySelector(
            '[data-monodocs-diff-sidebar="earlier"] .monodocs-diff-mark',
          )!;
          return {
            band: getComputedStyle(block).backgroundColor !== "rgba(0, 0, 0, 0)",
            badge: getComputedStyle(badge).display !== "none",
            box:
              getComputedStyle(document.querySelector(".monodocs-diff-marks")!).display !== "none",
          };
        });
      await page.goto(`${pathToFileURL(out).href}#/a`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await page.click('[data-monodocs-diff-view="earlier"]');
      expect(await marked()).toEqual({ band: false, badge: false, box: true });
      await page.click("[data-monodocs-diff-marks-toggle]");
      expect(await marked()).toEqual({ band: true, badge: true, box: true });
      await page.click('[data-monodocs-diff-view="both"]');
      expect((await marked()).box).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
