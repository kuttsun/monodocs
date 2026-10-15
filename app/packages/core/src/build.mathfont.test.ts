import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import type { Diagnostic } from "./diagnostics";
import { createPuppeteerPrerenderer, type MermaidPrerenderer } from "./pipeline/mermaidPrerender";
import { createPuppeteerPdfGenerator, type PdfGenerator } from "./pipeline/renderPdf";
import {
  MATH_FONT_FAMILY,
  MATH_FONT_FILE,
  htmlHasFormula,
  loadMathFont,
  mathFontHead,
  mermaidHasFormula,
  withMathFont,
} from "./themes/mathFont";

/**
 * The math font monodocs carries for a PDF's formulas (roadmap 6.4, v0.17): where it is put, where
 * it is not, and that a PDF sets its formulas in it whatever the machine has.
 */
const FONT = new URL(`./themes/fonts/${MATH_FONT_FILE}`, import.meta.url);
/** The name Chromium writes into a PDF for the carried font. */
const CARRIED = "NewCMMath-Book";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-mathfont-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the carried math font", () => {
  it("is the unmodified file its README names", () => {
    const readme = readFileSync(new URL("./themes/fonts/README.md", import.meta.url), "utf8");
    const sha = createHash("sha256").update(readFileSync(FONT)).digest("hex");
    expect(readme).toContain(sha);
    expect(readme).toContain("version 8.1.1");
  });

  it("is read from beside the module, as the bundle finds it beside itself", async () => {
    expect(await loadMathFont()).toBe(readFileSync(FONT).toString("base64"));
  });

  it("goes first in <head>, or first in a document without one", () => {
    expect(withMathFont('<!doctype html><html><head lang="x"><title>t</title>', "F")).toBe(
      '<!doctype html><html><head lang="x">F<title>t</title>',
    );
    expect(withMathFont("<!DOCTYPE html><body>b</body>", "F")).toBe(
      "<!DOCTYPE html>F<body>b</body>",
    );
    expect(withMathFont("<p>b</p>", "F")).toBe("F<p>b</p>");
    // A <header> is not a <head>.
    expect(withMathFont("<header>h</header>", "F")).toBe("F<header>h</header>");
  });

  it("is declared under its own family, replacing only the browser's own font for math", () => {
    const head = mathFontHead("QUJD");
    expect(head).toContain(`new FontFace(${JSON.stringify(MATH_FONT_FAMILY)},u)`);
    expect(head).toContain(`:where(math){font-family:"${MATH_FONT_FAMILY}",math;}`);
    expect(head).toContain('atob("QUJD")');
  });

  it("is put in for a formula, in the page or in a diagram's label, and nothing else", () => {
    expect(htmlHasFormula("<p><math><mi>x</mi></math></p>")).toBe(true);
    expect(htmlHasFormula('<math display="block"></math>')).toBe(true);
    expect(htmlHasFormula('<pre class="mermaid" data-x="1">graph LR\n  A["$$x^2$$"]</pre>')).toBe(
      true,
    );
    expect(htmlHasFormula("<p>Plain, with <code>$$x$$</code> in code.</p>")).toBe(false);
    expect(htmlHasFormula('<pre class="mermaid">graph LR\n  A["$x$"]</pre>')).toBe(false);
    expect(htmlHasFormula("<p>&lt;math&gt; in prose</p>")).toBe(false);
    // As mermaid decides: `$$…$$` within one line.
    expect(mermaidHasFormula('A["$$x$$"]')).toBe(true);
    expect(mermaidHasFormula('A["$$x\ny$$"]')).toBe(false);
  });
});

/** A generator that keeps what it was given instead of printing. */
function recordingGenerator() {
  const calls: { html: string; mathFont?: () => Promise<string> }[] = [];
  const generator: PdfGenerator = {
    async render(html, options) {
      calls.push({ html, mathFont: options.mathFont });
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    },
    async close() {},
  };
  return { generator, calls };
}

describe("a pre-rendered diagram with a formula in a label", () => {
  it("is drawn again for the PDF, and the HTML keeps the one drawn for it", async () => {
    const root = join(dir, "variants");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "a.md"),
      '# A\n\n```mermaid\ngraph LR\n  A["$$x$$"]\n```\n\n```mermaid\ngraph LR\n  B\n```\n',
    );
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, "mermaid:\n  mode: pre-render\n");
    const drawn: string[] = [];
    const prerenderer: MermaidPrerenderer = {
      async render(id) {
        drawn.push(id);
        return `<svg id="${id}"><text>html ${id}</text></svg>`;
      },
      pdfVariants: () =>
        new Map([
          [
            '<svg id="mermaid-0"><text>html mermaid-0</text></svg>',
            '<svg id="mermaid-0">pdf</svg>',
          ],
        ]),
      async close() {},
    };
    const { generator, calls } = recordingGenerator();
    await buildSite(
      { configFile, inputDir: root, outputFile: join(root, "out"), format: "both" },
      { mermaidPrerenderer: prerenderer, pdfGenerator: generator },
    );
    const html = await readFile(join(root, "out", "docs.html"), "utf8");
    expect(html).toContain("html mermaid-0");
    expect(html).not.toContain(MATH_FONT_FAMILY);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.html).toContain('<svg id="mermaid-0">pdf</svg>');
    expect(calls[0]!.html).not.toContain("html mermaid-0");
    // The diagram with no formula is the same in both.
    expect(calls[0]!.html).toContain("html mermaid-1");
    // The generator is handed the font, to put in if the document has a formula.
    expect(await calls[0]!.mathFont!()).toContain(MATH_FONT_FAMILY);
  });
});

// What only a browser can answer.
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

/** Whether fontconfig is there to be given a font through `~/.fonts`; it is not on Windows. */
function hasFontconfig(): boolean {
  try {
    execFileSync("fc-list", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The fonts a PDF embeds, by the name in each font descriptor. Chromium embeds an OpenType font with
 * CFF outlines as a Type 3 font, which `pdffonts` lists unnamed, but its descriptor keeps the name.
 */
async function embeddedFonts(file: string): Promise<string[]> {
  const doc = await PDFDocument.load(await readFile(file));
  const names = new Set<string>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.get(PDFName.of("Type"))?.toString() !== "/FontDescriptor") continue;
    // A subset's name carries a six-letter tag: /ABCDEF+Name.
    const name = object.get(PDFName.of("FontName"))?.toString() ?? "";
    names.add(name.replace(/^\/([A-Z]{6}\+)?/, ""));
  }
  return [...names].sort();
}

/** A math font other than the carried one: a name with "Math" in it, or Cambria's. */
const otherMathFonts = (fonts: string[]) =>
  fonts.filter((f) => f !== CARRIED && (/math/i.test(f) || /cambria/i.test(f)));

function fontWarnings(warnings: Diagnostic[]): Diagnostic[] {
  return warnings.filter((w) => w.code.startsWith("font/"));
}

const MATH_FIXTURE = fileURLToPath(new URL("../../../../examples/math", import.meta.url));
const LATIN_MODERN = fileURLToPath(
  new URL("../test-fixtures/fonts/lm-math/opentype/latinmodern-math.otf", import.meta.url),
);

async function buildPdf(name: string, config: string, input?: string, page?: string) {
  const root = join(dir, name);
  const docs = input ?? join(root, "docs");
  await mkdir(root, { recursive: true });
  if (page !== undefined) {
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), page);
  }
  const configFile = join(root, "monodocs.config.yml");
  await writeFile(configFile, `pdf:\n  bookmarks: false\n${config}`);
  const out = join(root, "docs.pdf");
  const result = await buildSite({ inputDir: docs, configFile, outputFile: out, format: "pdf" });
  return { out, result, root };
}

describe.skipIf(!chromium)("a PDF's formulas in a real browser", () => {
  it("sets the math fixture in the carried font, letters and stretched symbols alike", async () => {
    const { out, result } = await buildPdf("fixture", 'lang: "ja"\n', MATH_FIXTURE);
    const fonts = await embeddedFonts(out);
    expect(fonts).toContain(CARRIED);
    expect(otherMathFonts(fonts)).toEqual([]);
    expect(fontWarnings(result.warnings).filter((w) => w.code !== "font/missing")).toEqual([]);
    // The fixture's prose and `\text{速度}` are Japanese, set in a text font, which a machine without
    // CJK fonts lacks (the GitHub Linux runner as it comes); nothing else may be reported. There the
    // prose fills the check's 40 findings before the formulas are reached, so this shows only that
    // what was named is Japanese; the formulas are checked where CJK fonts are installed (the
    // development image, pr-ci.yml, release.yml, so no CI run takes this path) and by the glyphs read
    // below. U+00B7, which Script_Extensions counts as Han, is a math character here (`\cdotp`).
    const japanese = /(?!\u00B7)[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\uFF01-\uFF60]/u;
    for (const w of fontWarnings(result.warnings)) {
      const named = [...w.message.matchAll(/U\+([0-9A-F]{4,6})/g)].map((m) =>
        String.fromCodePoint(parseInt(m[1]!, 16)),
      );
      expect(named.filter((c) => !japanese.test(c))).toEqual([]);
    }

    // Every glyph of every formula, read off the page the PDF is printed from: from the carried
    // font, apart from the text in \text{}.
    const html = join(dir, "fixture", "docs.html");
    await buildSite({
      inputDir: MATH_FIXTURE,
      configFile: join(dir, "fixture", "monodocs.config.yml"),
      outputFile: html,
      format: "html",
    });
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.emulateMediaType("print");
      const source = await readFile(html, "utf8");
      await page.setContent(withMathFont(source, mathFontHead(await loadMathFont())), {
        waitUntil: "load",
      });
      const cdp = await page.createCDPSession();
      const { root } = (await cdp.send("DOM.getDocument", { depth: -1 })) as {
        root: { nodeId: number };
      };
      await cdp.send("CSS.enable");
      const { nodeIds } = (await cdp.send("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: "math mi, math mo, math mn, math ms, math mtext",
      })) as { nodeIds: number[] };
      expect(nodeIds.length).toBeGreaterThan(300);
      const elsewhere = new Set<string>();
      for (const nodeId of nodeIds) {
        const { fonts } = (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })) as {
          fonts: { familyName: string; glyphCount: number }[];
        };
        for (const font of fonts) {
          if (font.glyphCount > 0 && !/^NewComputerModern ?Math$/.test(font.familyName)) {
            const { outerHTML } = (await cdp.send("DOM.getOuterHTML", { nodeId })) as {
              outerHTML: string;
            };
            elsewhere.add(`${font.familyName}: ${outerHTML}`);
          }
        }
      }
      // Only the Japanese of \text{速度}, in a text font.
      for (const entry of elsewhere) expect(entry).toMatch(/<mtext>[^<]*\p{Script=Han}/u);
    } finally {
      await browser.close();
    }
  }, 240_000);

  it("sets them in the carried font on a machine with a math font of its own", async () => {
    // Linux is given Latin Modern Math through ~/.fonts; Windows has Cambria Math.
    const home = process.env.HOME;
    if (hasFontconfig()) {
      const fonts = join(dir, "home", ".fonts");
      await mkdir(fonts, { recursive: true });
      await copyFile(LATIN_MODERN, join(fonts, "latinmodern-math.otf"));
      process.env.HOME = join(dir, "home");
    }
    try {
      const page = "# Home\n\n$x + \\alpha = \\left( \\frac{a}{b} \\right)$\n";
      const carried = await buildPdf("own-carried", "", undefined, page);
      expect(await embeddedFonts(carried.out)).toContain(CARRIED);
      expect(otherMathFonts(await embeddedFonts(carried.out))).toEqual([]);
      expect(fontWarnings(carried.result.warnings)).toEqual([]);

      // The machine's own font was there to be used: a theme that asks for it gets it.
      const theme = join(dir, "own-machine", "my-theme");
      await mkdir(theme, { recursive: true });
      await writeFile(
        join(theme, "style.css"),
        readFileSync(new URL("./themes/default/style.css", import.meta.url), "utf8") +
          "\nmath { font-family: math; }\n",
      );
      const machine = await buildPdf(
        "own-machine",
        'html:\n  theme: "./my-theme"\n',
        undefined,
        page,
      );
      const used = await embeddedFonts(machine.out);
      expect(used).not.toContain(CARRIED);
      expect(otherMathFonts(used).length).toBeGreaterThan(0);
    } finally {
      process.env.HOME = home;
    }
  }, 240_000);

  it("loads no font for a document with no formula, whose PDF embeds what it did before", async () => {
    const root = join(dir, "plain");
    await mkdir(root, { recursive: true });
    const html =
      "<!doctype html><html><head><title>t</title></head><body>" +
      "<p>Plain, with <code>$$x$$</code> in code.</p></body></html>";
    const options = {
      pageSize: "A4",
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      printBackground: true,
      waitForMermaid: false,
    };
    const generator = createPuppeteerPdfGenerator();
    let read = 0;
    try {
      const plain = await generator.render(html, options);
      const offered = await generator.render(html, {
        ...options,
        mathFont: async () => {
          read++;
          return mathFontHead(await loadMathFont());
        },
      });
      await writeFile(join(root, "plain.pdf"), plain);
      await writeFile(join(root, "offered.pdf"), offered);
    } finally {
      await generator.close();
    }
    expect(read).toBe(0);
    expect(await embeddedFonts(join(root, "offered.pdf"))).toEqual(
      await embeddedFonts(join(root, "plain.pdf")),
    );
  }, 120_000);

  // `both` with pre-render is the path that draws a diagram twice: once for the HTML, once in the
  // carried font for the PDF, swapped into the page the PDF is printed from.
  const LABEL_CASES = [
    { mode: "client", format: "pdf" },
    { mode: "pre-render", format: "pdf" },
    { mode: "pre-render", format: "both" },
  ] as const;
  for (const { mode, format } of LABEL_CASES) {
    it(`sets a Mermaid label's formula in the carried font and fits it in its box (${mode}, ${format})`, async () => {
      const page =
        '# D\n\n```mermaid\ngraph LR\n  A["$$\\int_0^1 f(x)\\,dx + \\sqrt{y}$$"] --> B[plain]\n```\n';
      const config = `mermaid:\n  mode: ${mode}\n`;
      const pdf = await buildPdf(`label-${mode}-${format}`, config, undefined, page);
      if (format === "both") {
        const both = join(pdf.root, "both");
        await buildSite({
          inputDir: join(pdf.root, "docs"),
          configFile: join(pdf.root, "monodocs.config.yml"),
          outputFile: both,
          format: "both",
        });
        expect(await embeddedFonts(join(both, "docs.pdf"))).toContain(CARRIED);
      } else {
        expect(await embeddedFonts(pdf.out)).toContain(CARRIED);
      }
      // The PDF-only build lays the label out in the carried font and measures it there, so nothing
      // is reported of it, on a machine with no math font too.
      expect(fontWarnings(pdf.result.warnings)).toEqual([]);

      // The page the PDF is printed from, as the generator is handed it (the pre-rendered SVG the
      // one drawn for the PDF), laid out as it lays it out: the font first, then the diagrams. The
      // label's formula must lie inside the box Mermaid drew around it.
      const { generator, calls } = recordingGenerator();
      await buildSite(
        {
          inputDir: join(pdf.root, "docs"),
          configFile: join(pdf.root, "monodocs.config.yml"),
          outputFile: join(pdf.root, "recorded"),
          format,
        },
        { pdfGenerator: generator },
      );
      const printed = calls[0]!.html;
      if (format === "both") {
        // The PDF prints the copy drawn in the carried font; the HTML keeps the one drawn for it.
        const written = await readFile(join(pdf.root, "recorded", "docs.html"), "utf8");
        const svgOf = (html: string) => /<svg id="mermaid-0"[\s\S]*?<\/svg>/.exec(html)?.[0];
        expect(svgOf(written)).toBeDefined();
        expect(svgOf(printed)).toBeDefined();
        expect(svgOf(printed)).not.toBe(svgOf(written));
        expect(written).not.toContain(svgOf(printed)!);
      }
      const puppeteer = await import("puppeteer-core");
      const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] });
      try {
        const tab = await browser.newPage();
        await tab.setContent(withMathFont(printed, mathFontHead(await loadMathFont())), {
          waitUntil: "load",
        });
        await tab.waitForSelector("#content .mermaid svg foreignObject math", { timeout: 30_000 });
        const fit = await tab.evaluate(() => {
          const math = document.querySelector("#content .mermaid svg foreignObject math")!;
          const box = math.closest("foreignObject")!.getBoundingClientRect();
          const drawn = math.getBoundingClientRect();
          return {
            family: getComputedStyle(math).fontFamily,
            inside:
              drawn.left >= box.left - 0.5 &&
              drawn.right <= box.right + 0.5 &&
              drawn.top >= box.top - 0.5 &&
              drawn.bottom <= box.bottom + 0.5,
            width: drawn.width,
          };
        });
        expect(fit.family).toContain("monodocs carried math");
        expect(fit.width).toBeGreaterThan(0);
        expect(fit.inside).toBe(true);
      } finally {
        await browser.close();
      }
    }, 240_000);
  }

  it("reports a character the carried font lacks in a pre-rendered label as the PDF's", async () => {
    // A code point no font draws, as text inside a label's formula: the carried font has no glyph
    // for it either, so the PDF's copy carries the tofu, and the warning says so.
    const page = '# D\n\n```mermaid\ngraph LR\n  A["$$x + \\text{\u{50000}}$$"]\n```\n';
    const { result } = await buildPdf(
      "label-tofu",
      "mermaid:\n  mode: pre-render\n",
      undefined,
      page,
    );
    const warnings = fontWarnings(result.warnings);
    expect(warnings.every((w) => w.code === "font/missing")).toBe(true);
    // The pre-render check speaks of the PDF's copy, and nothing of an HTML this build does not
    // write; the PDF's own check measures the same label on the page it prints.
    const prerender = warnings.filter((w) => /pre-render/.test(w.message));
    expect(prerender).toHaveLength(1);
    expect(prerender[0]!.message).toMatch(/lays out for the PDF/);
    for (const w of warnings) {
      expect(w.message).toContain("U+50000");
      // The formula's letter is not among them: the carried font draws it.
      expect(w.message).not.toContain("U+1D465");
    }
  }, 120_000);

  it("reads no font for a pre-rendered diagram without a formula", async () => {
    let read = 0;
    const prerenderer = createPuppeteerPrerenderer({
      colorScheme: "light",
      mathFont: {
        head: async () => {
          read++;
          return mathFontHead(await loadMathFont());
        },
        mode: "only",
      },
    });
    try {
      expect(await prerenderer.render("mermaid-0", "graph LR\n  A --> B")).toContain("<svg");
      expect(read).toBe(0);
      expect(await prerenderer.render("mermaid-1", 'graph LR\n  A["$$x$$"]')).toContain("<math");
      expect(read).toBe(1);
    } finally {
      await prerenderer.close();
    }
  }, 120_000);

  it("adds nothing to the HTML", async () => {
    const root = join(dir, "html");
    const docs = join(root, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(
      join(docs, "index.md"),
      '# H\n\n$x$\n\n```mermaid\ngraph LR\n  A["$$x^2$$"]\n```\n',
    );
    for (const mode of ["client", "pre-render"]) {
      const configFile = join(root, `${mode}.yml`);
      await writeFile(configFile, `mermaid:\n  mode: ${mode}\n`);
      await buildSite({
        inputDir: docs,
        configFile,
        outputFile: join(root, `${mode}.html`),
        format: "html",
      });
      await buildSite({ inputDir: docs, configFile, outputFile: join(root, mode), format: "both" });
      const alone = await readFile(join(root, `${mode}.html`), "utf8");
      expect(await readFile(join(root, mode, "docs.html"), "utf8")).toBe(alone);
      expect(alone).not.toContain(MATH_FONT_FAMILY);
      expect(alone).not.toContain("FontFace");
    }
  }, 240_000);
});
