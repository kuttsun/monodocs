import { existsSync } from "node:fs";
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
      expect(hidden.html).not.toMatch(/visibility:\s*(?:hidden|collapse)/);
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
