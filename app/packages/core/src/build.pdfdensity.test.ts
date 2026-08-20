import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig, PDF_DENSITY_PRESETS } from "./config";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-density-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeDocs(config: string): Promise<string> {
  const docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  const rows = Array.from(
    { length: 40 },
    (_, i) =>
      `| 2026-${String((i % 12) + 1).padStart(2, "0")} | Step ${i}: the work planned for this ` +
      `period, described in a sentence long enough to wrap. |`,
  );
  await writeFile(
    join(docs, "plan.md"),
    [
      "# Plan",
      "",
      ...Array.from(
        { length: 12 },
        (_, i) =>
          `## Section ${i}\n\nA paragraph of body text that runs long enough to occupy several ` +
          `lines on the page, so that leading and type size both show up in the page count.\n`,
      ),
      "| Period | What happens |",
      "| --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
  await writeFile(join(docs, "monodocs.config.yml"), config);
  return docs;
}

describe("pdf.density resolution", () => {
  it("defaults to the theme's own values, which are the normal preset", async () => {
    await writeFile(join(dir, "monodocs.config.yml"), "title: t\n");
    expect((await loadConfig({}, dir)).pdfDensity).toEqual(PDF_DENSITY_PRESETS.normal);
  });

  it("reads a preset by name", async () => {
    await writeFile(join(dir, "monodocs.config.yml"), "pdf:\n  density: compact\n");
    expect((await loadConfig({}, dir)).pdfDensity).toEqual(PDF_DENSITY_PRESETS.compact);
  });

  it("starts the object form from base and replaces only what it names", async () => {
    await writeFile(
      join(dir, "monodocs.config.yml"),
      "pdf:\n  density:\n    base: compact\n    fontSize: 12px\n",
    );
    const { pdfDensity } = await loadConfig({}, dir);
    expect(pdfDensity).toEqual({ ...PDF_DENSITY_PRESETS.compact, fontSize: "12px" });
  });

  it("takes normal as the base when the object names none", async () => {
    await writeFile(join(dir, "monodocs.config.yml"), "pdf:\n  density:\n    lineHeight: 1.4\n");
    const { pdfDensity } = await loadConfig({}, dir);
    expect(pdfDensity).toEqual({ ...PDF_DENSITY_PRESETS.normal, lineHeight: "1.4" });
  });

  it("accepts a line height written as a number or a string", async () => {
    await writeFile(join(dir, "monodocs.config.yml"), 'pdf:\n  density:\n    lineHeight: "1.4"\n');
    expect((await loadConfig({}, dir)).pdfDensity.lineHeight).toBe("1.4");
  });

  it("refuses values that are not plainly a number and a unit", async () => {
    // These reach the generated CSS, so anything that could carry a second declaration with it
    // has to be refused rather than passed through.
    for (const yaml of [
      "pdf:\n  density: cramped\n",
      // Number() would take these; CSS has no such spellings, and the declaration they produce
      // is invalid rather than merely surprising.
      'pdf:\n  density:\n    lineHeight: "0x10"\n',
      'pdf:\n  density:\n    lineHeight: "1e2"\n',
      'pdf:\n  density:\n    lineHeight: "Infinity"\n',
      "pdf:\n  density:\n    fontSize: 12\n",
      "pdf:\n  density:\n    fontSize: calc(100% - 2px)\n",
      'pdf:\n  density:\n    fontSize: "12px; color: red"\n',
      "pdf:\n  density:\n    lineHeight: 0\n",
      "pdf:\n  density:\n    lineHeight: 1.4rem\n",
      "pdf:\n  density:\n    tableCellPadding: 0.3rem 0.4rem 0.5rem\n",
      "pdf:\n  density:\n    headingSpacing: wide\n",
      "pdf:\n  density:\n    base: cramped\n",
      "pdf:\n  density:\n    fontsize: 12px\n",
    ]) {
      await writeFile(join(dir, "monodocs.config.yml"), yaml);
      await expect(loadConfig({}, dir), yaml).rejects.toThrow();
    }
  });
});

/** Build one document at the given `pdf.density` fragment and return the generated HTML. */
async function buildHtml(name: string, density: string): Promise<string> {
  const docs = await writeDocs(density === "" ? "title: t\n" : `title: t\n${density}`);
  const out = join(dir, `${name}.html`);
  await buildSite({ inputDir: docs, outputFile: out, format: "html" });
  return readFile(out, "utf8");
}

/**
 * The stylesheet the build appended, if any. The theme has an `@media print` block of its own, so
 * the injected one is the last; taking everything from there is what lets a test say the whole
 * block, rather than name a few strings it hopes are the only ones.
 */
function densityBlock(html: string): string {
  const at = html.lastIndexOf("@media print {");
  const block = html.slice(at);
  const end = block.indexOf("\n}\n");
  return end === -1 ? block : block.slice(0, end + 2);
}

describe("pdf.density in the generated stylesheet", () => {
  it("produces a byte-identical document for the default, for normal, and for base: normal", async () => {
    const implicit = await buildHtml("implicit", "");
    const named = await buildHtml("named", "pdf:\n  density: normal\n");
    const based = await buildHtml("based", "pdf:\n  density:\n    base: normal\n");

    // Not "no font-size line" but no difference at all. `normal` is a record of what the theme
    // already does, so asking for it must add nothing — including a redundant rule that would
    // pin the reader's own base font size when they print the HTML from a browser.
    expect(named).toBe(implicit);
    expect(based).toBe(implicit);
    expect(implicit).not.toContain("@media print {\n  :root");
  });

  it("writes exactly the rules that differ from normal, and no others", async () => {
    const html = await buildHtml("one", "pdf:\n  density:\n    lineHeight: 1.4\n");

    expect(densityBlock(html)).toBe("@media print {\n  body {\n    line-height: 1.4;\n  }\n}");
  });

  it("writes the whole set for a preset, scoped to print", async () => {
    const html = await buildHtml("compact", "pdf:\n  density: compact\n");
    const { fontSize, lineHeight, headingSpacing, tableCellPadding } = PDF_DENSITY_PRESETS.compact;

    expect(densityBlock(html)).toBe(
      "@media print {\n" +
        `  :root {\n    font-size: ${fontSize};\n  }\n` +
        `  body {\n    line-height: ${lineHeight};\n  }\n` +
        "  #content h1,\n  #content h2,\n  #content h3,\n" +
        `  .page h1,\n  .page h2,\n  .page h3 {\n    margin-top: ${headingSpacing};\n  }\n` +
        "  #content th,\n  #content td,\n  .page th,\n  .page td {\n" +
        `    padding: ${tableCellPadding};\n  }\n}`,
    );
    // Nothing moved outside the print block: the document on screen is untouched.
    expect(html.slice(0, html.lastIndexOf("@media print {"))).not.toContain(
      `font-size: ${fontSize};`,
    );
  });

  it("reaches a theme that lays the pages out somewhere other than #content", async () => {
    // `.page` is core's own markup rather than the theme's, so it is the half of each selector
    // that a custom template cannot take away.
    const html = await buildHtml("themed", "pdf:\n  density: tight\n");
    expect(densityBlock(html)).toContain(".page th,\n  .page td {");
    expect(densityBlock(html)).toContain(".page h1,\n  .page h2,\n  .page h3 {");
    expect(html).toContain('<article class="page"');
  });
});

/**
 * The claim the feature exists for is a page count, and only a real print run produces one.
 * Chromium only, like the other PDF tests.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

async function pageCount(density: string): Promise<number> {
  const docs = await writeDocs(density === "" ? "title: t\n" : `pdf:\n  density: ${density}\n`);
  const out = join(dir, `${density || "default"}.pdf`);
  await buildSite({ inputDir: docs, outputFile: out, format: "pdf" });
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(await readFile(out))).getPageCount();
}

describe.skipIf(!chromium)("pdf.density on paper", () => {
  it("puts the same document on fewer sheets as the density tightens", async () => {
    const normal = await pageCount("");
    const compact = await pageCount("compact");
    const tight = await pageCount("tight");

    // The ladder has to be monotonic to be worth naming: each step is fewer sheets, or the names
    // promise something the output does not deliver.
    expect(compact).toBeLessThan(normal);
    expect(tight).toBeLessThanOrEqual(compact);
    // And the document is still there — a density that dropped content would also "fit".
    expect(tight).toBeGreaterThan(0);
  }, 120_000);

  it("leaves the default alone", async () => {
    // `normal` written out explicitly must land on exactly the same paper as saying nothing,
    // because it is the same values; if it ever diverges, the preset table has drifted.
    expect(await pageCount("normal")).toBe(await pageCount(""));
  }, 120_000);
});
