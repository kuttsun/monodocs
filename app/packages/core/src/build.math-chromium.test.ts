import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";

/**
 * What only a browser can show about a formula's drawing (roadmap 6.4): a strike lies over the term
 * it cancels, so a background in the term cannot hide it, and is printed with backgrounds off; and a
 * wide display formula scrolls on screen but is not cut at a scroll on paper.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

let dir: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-math-chromium-"));
  await writeFile(
    join(dir, "a.md"),
    "# T\n\n$$\\cancel{\\colorbox{white}{abcdefghijkl}}$$\n\n$$\\rule{80em}{0.1em}+x$$\n\n" +
      "$$a\\raisebox{3em}{x}b$$\n\n$$a\\raisebox{-3em}{x}b$$\n\n" +
      "$$a\\mathllap{XYZ}b \\quad c\\mathclap{XYZ}d$$\n",
  );
  const configFile = join(dir, "monodocs.config.yml");
  await writeFile(configFile, "");
  out = join(dir, "out.html");
  await buildSite({ configFile, inputDir: dir, outputFile: out, format: "html" });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!chromium)("formulas in a real browser", () => {
  it("lays a strike over the term, printed with backgrounds off, and scrolls only on screen", async () => {
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(out).href);
      const strike = await page.evaluate(() => {
        const math = document.querySelectorAll("#content .math-display math")[0]!;
        const overlay = [...math.querySelectorAll("mrow")].find((m) =>
          (m.getAttribute("style") ?? "").includes("position: absolute"),
        )!;
        const box = overlay.getBoundingClientRect();
        const text = math.querySelector("mtext")!.getBoundingClientRect();
        const colored = math.querySelector("mpadded")!.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          onTop: top === overlay,
          area: box.width * box.height,
          // The coloured box holds the whole term, and the strike crosses all of it.
          boxCoversText: colored.left <= text.left && colored.right >= text.right,
          strikeCoversBox: box.left <= colored.left + 0.5 && box.right >= colored.right - 0.5,
          printAdjust: getComputedStyle(overlay).printColorAdjust,
          mathPrintAdjust: getComputedStyle(math).printColorAdjust,
        };
      });
      expect(strike.onTop).toBe(true);
      expect(strike.area).toBeGreaterThan(0);
      expect(strike.boxCoversText).toBe(true);
      expect(strike.strikeCoversBox).toBe(true);
      expect(strike.printAdjust).toBe("exact");
      expect(strike.mathPrintAdjust).toBe("exact");

      const overflow = () =>
        page.evaluate(() => {
          const wide = document.querySelectorAll("#content .math-display")[1]!;
          return getComputedStyle(wide).overflowX;
        });
      expect(await overflow()).toBe("auto");
      const placed = await page.evaluate(() => {
        const displays = document.querySelectorAll("#content .math-display");
        // The moved term lies inside the display's box, which cuts off what lies outside it.
        const inside = (display: Element) => {
          const box = display.getBoundingClientRect();
          const term = display.querySelector("mpadded mi, mpadded mtext")!.getBoundingClientRect();
          return term.top >= box.top && term.bottom <= box.bottom;
        };
        const laps = displays[4]!.querySelectorAll("mpadded");
        const edges = [...laps].map((pad) => {
          const own = pad.getBoundingClientRect();
          const text = pad.querySelector("mi, mtext")!.parentElement!.getBoundingClientRect();
          return { at: own.left, left: text.left, right: text.right };
        });
        return { raised: inside(displays[2]!), lowered: inside(displays[3]!), edges };
      });
      // A raised or lowered term is not cut off by the display's scroll box.
      expect(placed.raised).toBe(true);
      expect(placed.lowered).toBe(true);
      // \\mathllap ends where it stands; \\mathclap is centred on it.
      const [llap, clap] = placed.edges;
      expect(Math.abs(llap!.right - llap!.at)).toBeLessThan(1);
      expect(Math.abs((clap!.left + clap!.right) / 2 - clap!.at)).toBeLessThan(1);

      await page.emulateMediaType("print");
      expect(await overflow()).toBe("visible");
    } finally {
      await browser.close();
    }
  }, 60_000);
});
