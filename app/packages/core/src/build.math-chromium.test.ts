import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  it("draws what KaTeX writes for MathML 3 as MathML Core lays it out", async () => {
    const page2 = join(dir, "b");
    await mkdir(page2, { recursive: true });
    await writeFile(
      join(page2, "b.md"),
      [
        "# B",
        // Fenced, so that Markdown's escapes leave TeX's \\\\ and \\! alone.
        ...[
          "\\begin{array}{|c|l:r|}\\hline a&bbbb&c\\\\\\hdashline d&e&f\\\\\\hline\\end{array}",
          "\\begin{aligned} a &= b \\\\ ccc &= d \\end{aligned}",
          "a\\\\b",
          "a\\!b \\quad ab \\quad a\\kern{-0.3em}b",
          "x \\tag{1}",
        ].map((tex) => `\n\`\`\`math\n${tex}\n\`\`\`\n`),
      ].join("\n"),
    );
    const configFile = join(page2, "monodocs.config.yml");
    await writeFile(configFile, "");
    const out2 = join(page2, "out.html");
    await buildSite({ configFile, inputDir: page2, outputFile: out2, format: "html" });
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(out2).href);
      const found = await page.evaluate(() => {
        const displays = [...document.querySelectorAll("#content .math-display")];
        const rect = (e: Element) => e.getBoundingClientRect();
        const style = (e: Element) => getComputedStyle(e);
        // The array: lines between columns and rows, and a frame on all four sides.
        const cells = [...displays[0]!.querySelectorAll("mtd")];
        const frame = displays[0]!.querySelector("mtable")!.parentElement!;
        const array = {
          columnLines: [style(cells[0]!).borderRightStyle, style(cells[1]!).borderRightStyle],
          rowLine: style(cells[0]!).borderBottomStyle,
          frame: ["Top", "Right", "Bottom", "Left"].map(
            (side) => style(frame)[`border${side}Style` as "borderTopStyle"],
          ),
          leftAligned:
            Math.abs(
              rect(cells[4]!.querySelector("mi")!).left - rect(cells[1]!.querySelector("mi")!).left,
            ) < 1,
        };
        // aligned: the first column is right-aligned, the second left-aligned.
        const terms = [...displays[1]!.querySelectorAll("mtd")].map((td) =>
          rect(td.querySelector("mi, mrow")!),
        );
        const aligned = Math.abs(terms[0]!.right - terms[2]!.right) < 1;
        // a\\b: two lines.
        const [a, b] = [...displays[2]!.querySelectorAll("mi")].map(rect);
        const broken = b!.top >= a!.bottom - 1;
        // \\! and a negative kern bring the terms closer than none.
        const letters = [...displays[3]!.querySelectorAll("mi")].map(rect);
        const gap = (i: number) => letters[i + 1]!.left - letters[i]!.right;
        const closer = gap(0) < gap(2) && gap(4) < gap(2);
        // \\tag: the tag at the right edge, the formula apart from it.
        const box = rect(displays[4]!);
        const tag = rect(displays[4]!.querySelector("mtext")!);
        const x = rect(displays[4]!.querySelector("mi")!);
        const tagged = box.right - tag.right < 20 && tag.left - x.right > 50;
        const m = displays[4]!.querySelector("math")!;
        const dbg = {
          box: [box.left, box.right],
          tag: [tag.left, tag.right],
          x: [x.left, x.right],
          math: [rect(m).left, rect(m).right],
          style: m.getAttribute("style"),
          table: displays[4]!.querySelector("mtable")!.getAttribute("style"),
        };
        return { array, aligned, broken, closer, tagged, dbg };
      });
      expect(found.array).toEqual({
        columnLines: ["solid", "dashed"],
        rowLine: "dashed",
        frame: ["solid", "solid", "solid", "solid"],
        leftAligned: true,
      });
      expect(found.aligned).toBe(true);
      expect(found.broken).toBe(true);
      expect(found.closer).toBe(true);
      process.stdout.write("DBG " + JSON.stringify(found.dbg) + "\n");
      expect(found.tagged).toBe(true);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("draws \\overline and \\underline as wide as their term, whatever the font", async () => {
    const lines = join(dir, "lines");
    await mkdir(lines, { recursive: true });
    await writeFile(
      join(lines, "l.md"),
      "# L\n\n$$\\overline{a+b+c} \\quad \\underline{a+b+c}$$\n\n$$x^2 \\quad \\overline{x^2}$$\n",
    );
    const configFile = join(lines, "monodocs.config.yml");
    await writeFile(configFile, "");
    const built = join(lines, "out.html");
    await buildSite({ configFile, inputDir: lines, outputFile: built, format: "html" });
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(built).href);
      const drawn = await page.evaluate(() =>
        [
          ...document
            .querySelector("#content .math-display math")!
            .querySelectorAll(":scope > semantics > mrow > mrow"),
        ]
          .filter((m) => /border-(top|bottom)/.test(m.getAttribute("style") ?? ""))
          .map((line) => {
            const style = getComputedStyle(line);
            const top = parseFloat(style.borderTopWidth) > 0;
            const side = top ? "Top" : "Bottom";
            const term = line.firstElementChild!.getBoundingClientRect();
            const box = line.getBoundingClientRect();
            const scroll = line.closest(".math-display")!.getBoundingClientRect();
            // The line's edge of the box, which the border draws along the whole of it.
            const edge = top ? box.top : box.bottom;
            return {
              side: side.toLowerCase(),
              solid: style[`border${side}Style`] === "solid",
              visible: !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(style[`border${side}Color`]),
              // Set apart from the term, on its side, and not cut off by the scroll box.
              apart: top ? edge < term.top : edge > term.bottom,
              inside: edge >= scroll.top && edge <= scroll.bottom,
              // The term is several letters wide, and the line, the box's edge, as wide as it.
              // As wide as the term, no wider: the line runs along the box's edge.
              wide: term.width > 40 && Math.abs(box.width - term.width) < 0.5,
            };
          }),
      );
      expect(drawn).toEqual([
        { side: "top", solid: true, visible: true, apart: true, inside: true, wide: true },
        { side: "bottom", solid: true, visible: true, apart: true, inside: true, wide: true },
      ]);
      // The term under an overline is cramped, as TeX sets it: its superscript is lower than the
      // same superscript outside one, measured from the base letter. A math font's constants tell
      // the two apart, which the fallback's do not.
      const font = readFileSync(
        new URL("../test-fixtures/fonts/lm-math/opentype/latinmodern-math.otf", import.meta.url),
      ).toString("base64");
      await page.addStyleTag({
        content:
          `@font-face { font-family: "Fixture Math"; src: url(data:font/otf;base64,${font}); }` +
          ' math { font-family: "Fixture Math"; }',
      });
      await page.evaluate(() => document.fonts.ready);
      const raised = await page.evaluate(() => {
        const display = document.querySelectorAll("#content .math-display math")[1]!;
        const [plain, under] = [...display.querySelectorAll("msup")].map((m) => {
          const [base, sup] = [...m.children].map((c) => c.getBoundingClientRect());
          return base!.top - sup!.top;
        });
        const term = [...display.querySelectorAll("mrow")].find((m) =>
          (m.getAttribute("style") ?? "").includes("border-top"),
        )!;
        return { plain, under, shift: getComputedStyle(term).getPropertyValue("math-shift") };
      });
      expect(raised.shift).toBe("compact");
      expect(raised.under).toBeLessThan(raised.plain);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("paints a stretched brace or arrow whole on screen, wherever it falls", async () => {
    // Chromium keeps a horizontally stretched operator's box at the width of the glyph before it
    // stretched, and a raster tile that misses that box skips its part of the brace: on screen, not
    // in the PDF (roadmap 6.4, v0.16). Each operator is moved through a whole tile's width, and a
    // brace three viewports long scrolled along its length, in normal and forced colors; no run of
    // columns inside the operator may be empty.
    const braces = join(dir, "braces");
    await mkdir(braces, { recursive: true });
    const term = "a+b+c+d+e+f+g+h+i+j+k+l+m+n+o";
    const long = Array(7).fill(term).join("+");
    await writeFile(
      join(braces, "b.md"),
      `# B\n\n$$\\overbrace{${term}}^{n}$$\n\n$$\\underbrace{${term}}_{n}$$\n\n` +
        `$$\\overrightarrow{${term}}$$\n\n$$\\overbrace{${long}}^{n}$$\n`,
    );
    const configFile = join(braces, "monodocs.config.yml");
    await writeFile(configFile, "");
    const built = join(braces, "out.html");
    await buildSite({ configFile, inputDir: braces, outputFile: built, format: "html" });
    const font = readFileSync(
      new URL("../test-fixtures/fonts/lm-math/opentype/latinmodern-math.otf", import.meta.url),
    ).toString("base64");
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(built).href);
      await page.addStyleTag({
        content:
          `@font-face { font-family: "Fixture Math"; src: url(data:font/otf;base64,${font}); }` +
          ' math { font-family: "Fixture Math"; }',
      });
      await page.evaluate(() => document.fonts.ready);

      // The longest run of empty columns in a screenshot, read in a canvas of its own. The glyph
      // assembly's own joints leave a few light columns at this scale, so a run longer than 8px is a
      // cut; a skipped tile leaves dozens.
      const longestGap = async (clip: { x: number; y: number; width: number; height: number }) => {
        const png = await page.screenshot({ clip, encoding: "base64" });
        return page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
          // Ink is what differs from the background, the band's most common shade, so that a dark
          // forced-colors scheme is read as well as a light one.
          const shade = (at: number) =>
            data[at]! * 0.3 + data[at + 1]! * 0.59 + data[at + 2]! * 0.11;
          const counts = new Map<number, number>();
          for (let at = 0; at < data.length; at += 4) {
            const key = Math.round(shade(at) / 8);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          const background = [...counts].sort((a, b) => b[1] - a[1])[0]![0] * 8;
          let longest = 0;
          let run = 0;
          for (let x = 0; x < width; x++) {
            let ink = false;
            for (let y = 0; y < height && !ink; y++)
              ink = Math.abs(shade((y * width + x) * 4) - background) > 100;
            run = ink ? 0 : run + 1;
            longest = Math.max(longest, run);
          }
          return longest;
        }, png as string);
      };

      // The band the operator is drawn in, over or under its base, cut to what the scroll box shows.
      const band = (index: number, selector: string, over: boolean) =>
        page.evaluate(
          (i, sel, o) => {
            const display = document.querySelectorAll("#content .math-display")[i]!;
            const op = display.querySelector(sel)!;
            const base = op.firstElementChild!.getBoundingClientRect();
            const all = op.getBoundingClientRect();
            const shown = display.getBoundingClientRect();
            const x = Math.max(base.left, shown.left);
            const right = Math.min(base.right, shown.right);
            return o
              ? { x, y: all.top, width: right - x, height: base.top - all.top }
              : { x, y: base.bottom, width: right - x, height: all.bottom - base.bottom };
          },
          index,
          selector,
          over,
        );

      const cut: string[] = [];
      const check = async (mode: string) => {
        for (const [index, selector, over] of [
          [0, "mover > mover", true],
          [1, "munder > munder", false],
          [2, "mover", true],
        ] as const) {
          for (let shift = -128; shift < 128; shift += 16) {
            // Moved without changing its width, so that it moves by `shift` exactly.
            const moved = await page.evaluate(
              (i, s) => {
                const math = document.querySelectorAll<HTMLElement>("#content .math-display math")[
                  i
                ]!;
                math.style.left = "0px";
                math.style.position = "relative";
                const before = math.getBoundingClientRect().left;
                math.style.left = `${s}px`;
                return math.getBoundingClientRect().left - before;
              },
              index,
              shift,
            );
            expect(moved).toBeCloseTo(shift, 0);
            const gap = await longestGap(await band(index, selector, over));
            if (gap > 8) cut.push(`${mode} ${selector} #${index} at ${shift}px: ${gap}`);
          }
        }
        // The long brace, scrolled along its whole length.
        const scroll = await page.evaluate(() => {
          const display = document.querySelectorAll<HTMLElement>("#content .math-display")[3]!;
          return display.scrollWidth - display.clientWidth;
        });
        expect(scroll).toBeGreaterThan(1500);
        // Every 150px, and the far end, wherever the steps fall.
        const stops = [...Array(Math.floor(scroll / 150) + 1).keys()].map((n) => n * 150);
        for (const x of new Set([...stops, scroll])) {
          const reached = await page.evaluate((left) => {
            const display = document.querySelectorAll<HTMLElement>("#content .math-display")[3]!;
            display.scrollLeft = left;
            return display.scrollLeft;
          }, x);
          expect(reached).toBe(x);
          const gap = await longestGap(await band(3, "mover > mover", true));
          if (gap > 8) cut.push(`${mode} long brace scrolled ${x}px: ${gap}`);
        }
      };

      await check("normal");
      expect(cut).toEqual([]);
      const cdp = await page.createCDPSession();
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "forced-colors", value: "active" }],
      });
      // In forced colors nothing the fix adds may become visible: no outline, and shadows that stay
      // transparent.
      const forced = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('#content mo[stretchy="true"]')!);
        return {
          active: matchMedia("(forced-colors: active)").matches,
          outline: style.outlineStyle,
          shadows: style.boxShadow.match(/rgba?\([^)]*\)/g),
        };
      });
      expect(forced).toEqual({
        active: true,
        outline: "none",
        shadows: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"],
      });
      await check("forced");
      expect(cut).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 240_000);

  it("starts no line with the punctuation after an inline formula, nor ends one with a bracket", async () => {
    const root = join(dir, "breaks");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "b.md"),
      "# B\n\n" +
        "値は $x$、次に $y^2$。また ($z$) とする。**$w$**、その $n$-dimensional の。".repeat(6) +
        "\n",
    );
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, 'lang: "ja"\n');
    const built = join(root, "out.html");
    await buildSite({ configFile, inputDir: root, outputFile: built, format: "html" });
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(built).href);
      const measure = () =>
        page.evaluate(() => {
          const p = document.querySelector("#content article:not([hidden]) p") as HTMLElement;
          const starts = new Set<string>();
          const ends = new Set<string>();
          // Every width the paragraph can take, each giving its own line breaks.
          for (let width = 80; width <= 400; width += 1) {
            p.style.width = `${width}px`;
            let lastMiddle: number | undefined;
            let lastChar: string | undefined;
            const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              // A formula's own text follows the lines too, so that a line it starts or ends is
              // not read as one its neighbour starts or ends; only what is outside is recorded.
              const inFormula = node.parentElement!.closest("math") !== null;
              const text = node as Text;
              for (let i = 0; i < text.data.length; i++) {
                const range = document.createRange();
                range.setStart(text, i);
                range.setEnd(text, i + 1);
                const rect = range.getClientRects()[0];
                if (rect === undefined) continue;
                // A character starts a new line when it sits below the middle of the last one. Its
                // top alone cannot tell: a math font puts a variable's top several pixels lower
                // than the text beside it on the same line.
                if (lastMiddle !== undefined && rect.top > lastMiddle) {
                  if (!inFormula) starts.add(text.data[i]!);
                  if (lastChar !== undefined) ends.add(lastChar);
                }
                lastMiddle = (rect.top + rect.bottom) / 2;
                lastChar = inFormula ? undefined : text.data[i]!;
              }
            }
          }
          return { starts: [...starts].join(""), ends: [...ends].join("") };
        });
      const kept = await measure();
      // Lines do break, at other characters, and never before the punctuation or after the bracket.
      expect(kept.starts.length).toBeGreaterThan(3);
      expect(kept.starts).not.toMatch(/[、。)\-]/);
      expect(kept.ends).not.toMatch(/\(/);
      // Without the spans, the same paragraph breaks there: what the spans prevent does happen.
      await page.evaluate(() => {
        for (const span of document.querySelectorAll('span[style="white-space: nowrap"]')) {
          span.replaceWith(...span.childNodes);
        }
      });
      const loose = await measure();
      expect(loose.starts).toMatch(/[、。)]/);
      expect(loose.ends).toMatch(/\(/);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("copies a formula as its source, and its MathML as HTML", async () => {
    const page3 = join(dir, "c");
    await mkdir(page3, { recursive: true });
    await writeFile(
      join(page3, "c.md"),
      "# C\n\n> Before $a &lt; b$ after.\n>\n> $$\n> x^2\n> $$\n\nPlain text only. $`x\\quad y`$\n",
    );
    const configFile = join(page3, "monodocs.config.yml");
    await writeFile(configFile, "");
    const out3 = join(page3, "out.html");
    await buildSite({ configFile, inputDir: page3, outputFile: out3, format: "html" });
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(out3).href);
      const copied = await page.evaluate(() => {
        const copy = (start: Node, startOffset: number, end: Node, endOffset: number) => {
          const range = document.createRange();
          range.setStart(start, startOffset);
          range.setEnd(end, endOffset);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          const event = new ClipboardEvent("copy", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(event);
          return {
            text: event.clipboardData!.getData("text/plain"),
            html: event.clipboardData!.getData("text/html"),
            handled: event.defaultPrevented,
          };
        };
        const quote = document.querySelector("#content blockquote")!;
        const inline = quote.querySelector(".math-inline")!;
        // From inside the inline formula to the end of the quote: the formula is taken whole.
        const fromInside = copy(
          inline.querySelector("mi")!.firstChild!,
          0,
          quote,
          quote.childNodes.length,
        );
        // Text with no formula is left to the browser.
        const plain = Array.from(document.querySelectorAll("#content p")).find((p) =>
          p.textContent!.includes("Plain text only"),
        )!;
        const none = copy(plain.firstChild!, 0, plain.firstChild!, 5);
        // Between two tokens of one formula, taking none of its shown text: no formula.
        const gapFormula = document.querySelectorAll("#content .math-inline")[1]!;
        const tokens = gapFormula.querySelectorAll("mi");
        const gap = copy(tokens[0]!.firstChild!, 1, tokens[1]!.firstChild!, 0);
        // Two ranges, as Firefox makes them: copied apart, joined by a line break.
        const two = (() => {
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          const r1 = document.createRange();
          r1.selectNodeContents(inline.querySelector("mi")!);
          const r2 = document.createRange();
          r2.setStart(plain.firstChild!, 0);
          r2.setEnd(plain.firstChild!, 5);
          selection.addRange(r1);
          selection.addRange(r2);
          const event = new ClipboardEvent("copy", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(event);
          return { text: event.clipboardData!.getData("text/plain"), ranges: selection.rangeCount };
        })();
        // Entirely inside the formula: the formula.
        const within = copy(
          inline.querySelector("mi")!.firstChild!,
          0,
          inline.querySelector("mi")!.firstChild!,
          1,
        );
        // Up to the formula's very start, which takes none of it: no formula.
        const before = copy(quote.querySelector("p")!.firstChild!, 0, inline, 0);
        // Select all: only the page shown, and no script, in the HTML.
        const range = document.createRange();
        range.selectNodeContents(document.body);
        const all = (() => {
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          const event = new ClipboardEvent("copy", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(event);
          return event.clipboardData!.getData("text/html");
        })();
        // A copy from a text field is the field's own, even with a formula still selected in the page
        // (as Firefox keeps it while a field has focus).
        const input = document.createElement("input");
        input.value = "typed";
        document.body.appendChild(input);
        const keep = document.createRange();
        keep.selectNode(inline);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(keep);
        const field = new ClipboardEvent("copy", {
          clipboardData: new DataTransfer(),
          bubbles: true,
          cancelable: true,
        });
        input.dispatchEvent(field);
        return {
          fromInside,
          none,
          within,
          before,
          all,
          gap,
          two,
          fieldHandled: field.defaultPrevented,
        };
      });
      expect(copied.fromInside.handled).toBe(true);
      expect(copied.fromInside.text).toMatch(/^\$a &lt; b\$ after\.\n+\$\$\nx\^2\n\$\$\n?$/);
      expect(copied.fromInside.html).toContain("<math");
      expect(copied.fromInside.html).not.toContain("style=");
      expect(copied.none.handled).toBe(false);
      expect(copied.within.text).toBe("$a &lt; b$");
      expect(copied.gap.handled).toBe(false);
      // Chromium keeps one range; where a browser keeps both, they are copied apart.
      if (copied.two.ranges > 1) expect(copied.two.text).toBe("$a &lt; b$\nPlain");
      expect(copied.before.handled).toBe(false);
      expect(copied.all).toContain("<math");
      expect(copied.all).not.toContain("<script");
      expect(copied.all).not.toMatch(/<[^>]* hidden[\s=>]/);
      expect(copied.fieldHandled).toBe(false);
      // What the page's styles hide is left out of both formats, as the browser leaves it out, and
      // the page is not touched by the copy.
      const hidden = await page.evaluate(() => {
        const style = document.createElement("style");
        style.textContent = [
          "#content .omitted { display: none; }",
          "#content .veiled { visibility: hidden; }",
          "#content .shown { visibility: visible; }",
          "#content .spaced { white-space: pre-wrap; }",
        ].join("\n");
        document.head.appendChild(style);
        const quote = document.querySelector("#content blockquote")!;
        const p = quote.querySelector("p")!;
        const omitted = document.createElement("span");
        omitted.className = "omitted";
        omitted.textContent = "OMITTED";
        p.appendChild(omitted);
        const veiled = document.createElement("span");
        veiled.className = "veiled";
        veiled.innerHTML = 'VEILED<span class="shown">SHOWN</span>';
        p.appendChild(veiled);
        // Hidden by its own style, with a child the page's styles show again.
        const inline = document.createElement("span");
        inline.style.visibility = "hidden";
        inline.innerHTML = 'INLINE<span class="shown">AGAIN</span>';
        p.appendChild(inline);
        const variable = document.createElement("span");
        variable.setAttribute("style", "--v: hidden; visibility: var(--v)");
        variable.innerHTML = 'VARIABLE<span class="shown">ONCE MORE</span>';
        p.appendChild(variable);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const svgScript = document.createElementNS("http://www.w3.org/2000/svg", "script");
        svgScript.setAttribute("style", "display:block");
        svgScript.textContent = "SVGSCRIPT";
        svg.appendChild(svgScript);
        p.appendChild(svg);
        const details = document.createElement("details");
        details.innerHTML = "<summary>SUMMARY</summary><p>FOLDED</p>";
        quote.appendChild(details);
        const copy = (range: Range) => {
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          const event = new ClipboardEvent("copy", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(event);
          return {
            text: event.clipboardData!.getData("text/plain"),
            html: event.clipboardData!.getData("text/html"),
          };
        };
        const mutations: MutationRecord[] = [];
        const observer = new MutationObserver((records) => mutations.push(...records));
        observer.observe(document.querySelector("#content")!, {
          subtree: true,
          childList: true,
          attributes: true,
        });
        const range = document.createRange();
        range.selectNodeContents(quote);
        const all = copy(range);
        mutations.push(...observer.takeRecords());
        observer.disconnect();
        // Inside one paragraph whose white space the page keeps: kept in the copy.
        const spaced = document.createElement("p");
        spaced.className = "spaced";
        spaced.append("a  b\nc ", quote.querySelector(".math-inline")!.cloneNode(true), " d");
        quote.appendChild(spaced);
        const inner = document.createRange();
        inner.setStart(spaced.firstChild!, 0);
        inner.setEnd(spaced.lastChild!, 2);
        const kept = copy(inner);
        // Inside a details closed after the selection was made: nothing shown, nothing written.
        const closed = document.createElement("details");
        closed.open = true;
        closed.innerHTML = "<summary>S</summary><p>BODY </p>";
        closed
          .querySelector("p")!
          .appendChild(quote.querySelector(".math-inline")!.cloneNode(true));
        quote.appendChild(closed);
        const body = document.createRange();
        body.selectNodeContents(closed.querySelector("p")!);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(body);
        closed.open = false;
        const event = new ClipboardEvent("copy", {
          clipboardData: new DataTransfer(),
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        return { ...all, mutations: mutations.length, kept, closedHandled: event.defaultPrevented };
      });
      expect(hidden.text).not.toContain("OMITTED");
      expect(hidden.html).not.toContain("OMITTED");
      expect(hidden.text).not.toContain("VEILED");
      expect(hidden.html).not.toContain("VEILED");
      expect(hidden.text).toContain("SHOWN");
      expect(hidden.html).toContain("SHOWN");
      expect(hidden.text).not.toContain("INLINE");
      expect(hidden.text).toContain("AGAIN");
      expect(hidden.html).toContain("AGAIN");
      expect(hidden.html).not.toMatch(/visibility:/);
      expect(hidden.text).not.toContain("VARIABLE");
      expect(hidden.text).toContain("ONCE MORE");
      expect(hidden.html).toContain("ONCE MORE");
      expect(hidden.html).not.toContain("SVGSCRIPT");
      expect(hidden.text).not.toContain("SVGSCRIPT");
      expect(hidden.text).toContain("SUMMARY");
      expect(hidden.html).toContain("SUMMARY");
      expect(hidden.text).not.toContain("FOLDED");
      expect(hidden.html).not.toContain("FOLDED");
      expect(hidden.html).toContain("<annotation");
      expect(hidden.mutations).toBe(0);
      expect(hidden.kept.text).toBe("a  b\nc $a &lt; b$ d");
      expect(hidden.kept.html).toMatch(/^<p class="spaced">/);
      expect(hidden.closedHandled).toBe(false);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
