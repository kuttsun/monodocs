import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";
import { buildPdfCover } from "./pipeline/pdfCover";
import { cssString, watermarkRules } from "./pipeline/watermark";
import { pageText } from "./pdfText.testutil";

/**
 * `pdf.watermark` (roadmap 24.10): one line of text behind every printed sheet, emitted by core so
 * a theme cannot drop it, escaped rather than inserted, and absent on screen.
 */
let dir: string;
let docs: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-watermark-"));
  docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  // Enough to run over several sheets. The body has none of the capitals the watermark is made
  // of, so finding them on a sheet means the watermark was drawn there.
  const filler = Array.from({ length: 120 }, () => "Filler paragraph of text here.").join("\n\n");
  await writeFile(join(docs, "index.md"), `# Home\n\n${filler}\n`);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function configFile(body: string): Promise<string> {
  const path = join(dir, `config-${Math.random().toString(36).slice(2)}.yml`);
  await writeFile(path, body);
  return path;
}

async function html(body: string, extra: { theme?: string } = {}): Promise<string> {
  const out = join(dir, "out.html");
  const config = extra.theme ? `${body}html:\n  theme: ${extra.theme}\n` : body;
  await buildSite({ inputDir: docs, configFile: await configFile(config), outputFile: out });
  return readFile(out, "utf8");
}

describe("the watermark rule", () => {
  it("is absent unless asked for, and false means none", async () => {
    expect(await html("")).not.toContain("html::after");
    expect(await html("pdf:\n  watermark: false\n")).not.toContain("html::after");
  });

  it("is print-only and carries the text", async () => {
    const out = await html('pdf:\n  watermark: "DRAFT"\n');
    const rule =
      /@media print \{\s*html::after \{[^}]*content: "DRAFT" !important;[^}]*\}\s*\}/.exec(out);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain("position: fixed");
  });

  it("survives a theme that replaces style.css", async () => {
    const theme = join(dir, "theme");
    await mkdir(theme, { recursive: true });
    await writeFile(join(theme, "style.css"), "body { color: black; }\n");
    const out = await html('pdf:\n  watermark: "CONFIDENTIAL"\n', { theme });
    expect(out).toContain('content: "CONFIDENTIAL" !important;');
  });

  it("escapes the text so it cannot end the string or the style element", () => {
    expect(cssString('a"b\\c')).toBe('"a\\22 b\\5c c"');
    expect(cssString("</style><script>")).not.toMatch(/[<>]/);
    expect(cssString("社外秘 DRAFT-1")).toBe('"社外秘 DRAFT-1"');
    expect(watermarkRules('x"; } body { display: none; } x{content:"')).not.toContain('"; }');
  });

  it("is on the cover too", () => {
    const cover = buildPdfCover({
      title: "T",
      parts: { authors: [] },
      lang: "en",
      pageLabel: "Cover",
      watermark: "DRAFT",
    });
    expect(cover.html).toContain('content: "DRAFT" !important;');
  });

  it.each([["   "], ["two\nlines"], ["two\u2028lines"], [""]])("refuses %j", async (value) => {
    await expect(
      loadConfig(
        { configFile: await configFile(`pdf:\n  watermark: ${JSON.stringify(value)}\n`) },
        dir,
      ),
    ).rejects.toThrow(/watermark/);
  });
});

const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

describe.skipIf(!chromium)("the watermark in a PDF (real Chromium)", () => {
  it("is drawn on every sheet, the cover included", async () => {
    const out = join(dir, "out.pdf");
    await buildSite({
      inputDir: docs,
      configFile: await configFile(
        'title: Cover\npdf:\n  watermark: "QZXJ"\n  bookmarks: false\n  cover:\n    enabled: true\n',
      ),
      outputFile: out,
      format: "pdf",
    });
    const bytes = await readFile(out);
    const { PDFDocument } = await import("pdf-lib");
    const total = (await PDFDocument.load(bytes)).getPageCount();
    expect(total).toBeGreaterThan(3);
    for (let i = 0; i < total; i++) {
      expect(await pageText(bytes, i), `sheet ${i + 1}`).toContain("QZXJ");
    }
  }, 120_000);

  it("puts its text through the font check, which does not see generated content", async () => {
    // A codepoint no font draws, used only in the watermark: the body alone checks clean.
    const out = join(dir, "tofu.pdf");
    const result = await buildSite({
      inputDir: docs,
      configFile: await configFile(
        'pdf:\n  bookmarks: false\n  watermark: "DRAFT \\U00050000"\n  cover:\n    enabled: true\n',
      ),
      outputFile: out,
      format: "pdf",
    });
    const missing = result.warnings.filter((w) => w.code === "font/missing");
    // Once for the body's sheets and once for the cover's, each checked on its own page.
    expect(missing).toHaveLength(2);
    for (const warning of missing) expect(warning.message).toContain("U+50000");
  }, 120_000);

  it("is not drawn when unset", async () => {
    const out = join(dir, "plain.pdf");
    await buildSite({
      inputDir: docs,
      configFile: await configFile("pdf:\n  bookmarks: false\n"),
      outputFile: out,
      format: "pdf",
    });
    const bytes = await readFile(out);
    const { PDFDocument } = await import("pdf-lib");
    const total = (await PDFDocument.load(bytes)).getPageCount();
    for (let i = 0; i < total; i++) expect(await pageText(bytes, i)).not.toContain("QZXJ");
  }, 120_000);

  it.each([
    [
      "paints its content area",
      "html, body, #content, .page { background: #fff; } body { margin: 0; }",
    ],
    [
      "hides generated content in print",
      "@media print { *::before, *::after { display: none !important; content: none !important; } }",
    ],
  ])(
    "stays visible under a theme that %s",
    async (name, css) => {
      // Drawn glyphs are not visible glyphs: under a negative z-index the watermark was still in the
      // PDF and hidden behind a theme's background. So this compares what is painted, in print.
      const theme = join(dir, `theme-${name.replace(/\W+/g, "-")}`);
      await mkdir(theme, { recursive: true });
      await writeFile(join(theme, "style.css"), `${css}\n`);
      const puppeteer = (await import("puppeteer-core")).default;
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: chromium as string,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      try {
        const shots: string[] = [];
        for (const watermark of ["", 'pdf:\n  watermark: "QZXJ"\n']) {
          const page = await browser.newPage();
          await page.setViewport({ width: 800, height: 1000 });
          await page.setContent(await html(watermark, { theme }), { waitUntil: "load" });
          await page.emulateMediaType("print");
          shots.push(await page.screenshot({ type: "png", encoding: "base64" }));
          await page.close();
        }
        // Count the pixels the watermark changed, decoded in the browser. A watermark hidden but for
        // a corner changes a few hundred; the whole line, tens of thousands.
        const page = await browser.newPage();
        const changed = await page.evaluate(
          async (a: string, b: string) => {
            const pixels = async (src: string) => {
              const img = new Image();
              img.src = `data:image/png;base64,${src}`;
              await img.decode();
              const canvas = document.createElement("canvas");
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0);
              return ctx.getImageData(0, 0, img.width, img.height).data;
            };
            const [pa, pb] = [await pixels(a), await pixels(b)];
            let count = 0;
            for (let i = 0; i < pa.length; i += 4) {
              if (Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) > 8) count++;
            }
            return count;
          },
          shots[0]!,
          shots[1]!,
        );
        expect(changed).toBeGreaterThan(10_000);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
