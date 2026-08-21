import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig, PDF_DENSITY_PRESETS, PDF_DENSITY_SCREEN } from "./config";
import { Window } from "happy-dom";
import { loadTheme } from "./themes/index";

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

type ScreenRule = { selector: string; value: (property: string) => string | undefined };

/**
 * The rules the default theme states **for the screen**: every rule outside an `@media` block, read
 * through a real CSSOM rather than by matching text.
 *
 * Both halves of that matter. The baseline is a claim about what the document looks like on screen,
 * so a declaration that lives only inside the theme's own `@media print` block must not satisfy it.
 * And a stylesheet is not a regular language: a comment can hold a `{`, a declaration can be
 * repeated with the later one winning, and a value can carry a `;` inside a URL. Parsing it as a
 * browser does is what keeps this test from passing for a reason that has nothing to do with the
 * question it asks.
 */
async function screenRules(): Promise<ScreenRule[]> {
  const { style } = await loadTheme("default");
  const window = new Window();
  const element = window.document.createElement("style");
  element.textContent = style;
  window.document.head.appendChild(element);

  const rules: ScreenRule[] = [];
  for (const rule of window.document.styleSheets[0].cssRules) {
    // An `@media` rule has no selector of its own, which is also how its contents are left out.
    if (!("selectorText" in rule) || !("style" in rule)) continue;
    const declarations = rule.style as { getPropertyValue: (property: string) => string };
    rules.push({
      selector: String(rule.selectorText).replace(/\s+/g, " ").trim(),
      value: (property) => declarations.getPropertyValue(property) || undefined,
    });
  }
  return rules;
}

/** What the screen gives `property` for exactly this selector; the last rule wins, as it does in CSS. */
function screenValue(rules: ScreenRule[], selector: string, property: string): string | undefined {
  return rules
    .filter((rule) => rule.selector === selector)
    .map((rule) => rule.value(property))
    .filter((value) => value !== undefined)
    .at(-1);
}

/**
 * Selectors that decide the size the document is set at: `rem` follows `html` / `:root`, and body
 * text follows `body`. Named as a pattern rather than a list of the ones the theme happens to use,
 * so that `html { font-size: 15px }` — a rule the theme does not have today — is still caught.
 */
const ROOT_SELECTOR = /^(html|:root|body)( *, *(html|:root|body))*$/;

describe("pdf.density resolution", () => {
  it("defaults to normal, which is set for paper rather than for the screen", async () => {
    await writeFile(join(dir, "monodocs.config.yml"), "title: t\n");
    const { pdfDensity } = await loadConfig({}, dir);

    expect(pdfDensity).toEqual(PDF_DENSITY_PRESETS.normal);
    // The point of the default: it is not what the document looks like on screen. Were the two ever
    // to coincide again, printing would silently be back to web leading and nothing would say so.
    expect(pdfDensity).not.toEqual(PDF_DENSITY_SCREEN);
  });

  it("keeps relaxed identical to the screen setting", async () => {
    // `relaxed` exists to name the screen values, which is also what makes it emit nothing. If it
    // ever drifts from them it stops being either of those things.
    expect(PDF_DENSITY_PRESETS.relaxed).toEqual(PDF_DENSITY_SCREEN);
  });

  it("keeps the screen baseline in step with the theme's own stylesheet", async () => {
    // The baseline is a hand-copy of three declarations in style.css, and everything downstream is
    // written as the difference from it: retune the theme without this test and `relaxed` quietly
    // stops meaning "the same as on screen", while the default stops emitting a rule it needs to.
    // Comparing the constant against the stylesheet is what makes that a failure rather than a
    // surprise on paper.
    const rules = await screenRules();

    expect(screenValue(rules, "body", "line-height")).toBe(PDF_DENSITY_SCREEN.lineHeight);
    expect(screenValue(rules, "#content h1, #content h2, #content h3", "margin-top")).toBe(
      PDF_DENSITY_SCREEN.headingSpacing,
    );
    expect(screenValue(rules, "#content th, #content td", "padding")).toBe(
      PDF_DENSITY_SCREEN.tableCellPadding,
    );
    // `fontSize` is the one value with no declaration behind it: the theme sets no root font size,
    // and 16px is what a browser uses when nothing does. Any rule that set one would mean the
    // baseline is no longer "whatever the reader's browser uses", so this asks the whole stylesheet
    // rather than the three selectors the theme happens to write today.
    const rootFontSizes = rules
      .filter((rule) => ROOT_SELECTOR.test(rule.selector))
      .filter((rule) => rule.value("font-size") !== undefined)
      .map((rule) => rule.selector);
    expect(rootFontSizes).toEqual([]);
    // And the root rules really are in hand: without this, the assertion above would also pass if
    // the parse had found no rules at all.
    expect(screenValue(rules, "html, body", "height")).toBe("100%");
    expect(rules.filter((rule) => ROOT_SELECTOR.test(rule.selector)).length).toBeGreaterThan(0);
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

    expect(named).toBe(implicit);
    expect(based).toBe(implicit);
  });

  it("adds no print block at all for relaxed, which is the screen setting under a name", async () => {
    const plain = await buildHtml("relaxed", "pdf:\n  density: relaxed\n");
    const based = await buildHtml("relaxed-base", "pdf:\n  density:\n    base: relaxed\n");

    // Not "no font-size line" but nothing appended whatsoever: the only `@media print` blocks in
    // the document are the theme's own. Counting them is what says that, rather than naming a few
    // strings the test hopes are the only ones.
    const { style } = await loadTheme("default");
    const blocks = (html: string) => html.split("@media print {").length - 1;
    expect(blocks(plain)).toBe(blocks(style));
    expect(based).toBe(plain);
  });

  it("leaves the reader's own base font size alone at the default density", async () => {
    // The default buys its sheets from leading and heading spacing, not from type size, so the one
    // rule it must not write is the one that would pin 16px on someone printing from a browser.
    const block = densityBlock(await buildHtml("default-block", ""));

    expect(block).not.toContain("font-size");
    expect(block).toContain(`line-height: ${PDF_DENSITY_PRESETS.normal.lineHeight};`);
    expect(block).toContain(`margin-top: ${PDF_DENSITY_PRESETS.normal.headingSpacing};`);
  });

  it("writes exactly the rules that differ from the screen, and no others", async () => {
    const html = await buildHtml(
      "one",
      "pdf:\n  density:\n    base: relaxed\n    lineHeight: 1.4\n",
    );

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
    const relaxed = await pageCount("relaxed");
    const normal = await pageCount("");
    const compact = await pageCount("compact");
    const tight = await pageCount("tight");

    // Each step is *fewer* sheets, not "no more than": the documentation says a step down saves
    // paper, and `<=` would let a preset that changed nothing on this document pass as if it had.
    // The fixture is sized so every step crosses a page boundary (7, 5, 4, 3 sheets); a change that
    // stops it doing so is a change to the presets worth failing on. The ladder runs in both
    // directions from the default, which is the whole reason `relaxed` is on it.
    expect(normal).toBeLessThan(relaxed);
    expect(compact).toBeLessThan(normal);
    expect(tight).toBeLessThan(compact);
    // And the document is still there — a density that dropped content would also "fit".
    expect(tight).toBeGreaterThan(0);
  }, 180_000);

  it("saves sheets at the default without shrinking the type", async () => {
    // The claim the retuned default rests on. `relaxed` and `normal` set the same 16px body; the
    // difference between them is leading, heading spacing, and cell padding alone.
    expect(PDF_DENSITY_PRESETS.normal.fontSize).toBe(PDF_DENSITY_SCREEN.fontSize);
    expect(await pageCount("")).toBeLessThan(await pageCount("relaxed"));
  }, 180_000);

  it("leaves the default alone", async () => {
    // `normal` written out explicitly must land on exactly the same paper as saying nothing,
    // because it is the same values; if it ever diverges, the preset table has drifted.
    expect(await pageCount("normal")).toBe(await pageCount(""));
  }, 120_000);
});
