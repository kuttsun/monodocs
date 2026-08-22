import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-pagebreak-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** One short page, small enough that only a forced break can put it on a second sheet. */
async function writeDoc(
  name: string,
  file: string,
  body: string,
  config?: string,
): Promise<string> {
  const docs = join(dir, name);
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, file), body, "utf8");
  if (config !== undefined) await writeFile(join(docs, "monodocs.config.yml"), config, "utf8");
  return docs;
}

const MARKER = '<div class="page-break"></div>';

describe("the page-break rule in the generated stylesheet", () => {
  it("is emitted by core, so replacing the theme's style.css cannot delete it", async () => {
    // `.page` is core's own markup rather than the theme's, which is the half of the selector a
    // custom template cannot take away. The rule is unconditional: it is syntax, not a setting.
    const docs = await writeDoc("css", "index.md", "# T\n\nA\n");
    const out = join(dir, "out.html");
    await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    // The whole block, so that "inside @media print" is part of what is asserted rather than left
    // to a selector string that would also match a screen rule.
    expect(html).toContain(
      "@media print {\n" +
        "  #content .page-break,\n  .page .page-break {\n" +
        "    break-after: page;\n    page-break-after: always;\n  }\n}\n",
    );
  });
});

describe("the heading rule in the generated stylesheet", () => {
  it("is written only when pdf.pageBreakLevel is set", async () => {
    const off = join(dir, "off.html");
    await buildSite({
      inputDir: await writeDoc("off", "index.md", "# T\n\n## A\n"),
      outputFile: off,
      format: "html",
    });
    expect(await readFile(off, "utf8")).not.toContain("data-monodocs-pdf-break-before");

    const on = join(dir, "on.html");
    await buildSite({
      inputDir: await writeDoc(
        "on",
        "index.md",
        "# T\n\nintro\n\n## A\n",
        "pdf:\n  pageBreakLevel: 2\n",
      ),
      outputFile: on,
      format: "html",
    });
    const html = await readFile(on, "utf8");
    // The whole block, as with the marker rule: "inside print" is part of the claim, and the space
    // the density would leave above the heading goes with the heading to the top of the sheet.
    expect(html).toContain(
      "@media print {\n" +
        "  #content [data-monodocs-pdf-break-before],\n" +
        "  .page [data-monodocs-pdf-break-before] {\n" +
        "    break-before: page;\n    page-break-before: always;\n    margin-top: 0;\n  }\n}\n",
    );
    expect(html).toContain("data-monodocs-pdf-break-before");
  }, 60_000);

  it("marks the headings post-processing chose, in both formats", async () => {
    const level = "pdf:\n  pageBreakLevel: 2\n";
    const md = join(dir, "md.html");
    await buildSite({
      inputDir: await writeDoc("md", "index.md", "# T\n\n## A\n\na\n\n## B\n", level),
      outputFile: md,
      format: "html",
    });
    const adoc = join(dir, "adoc.html");
    await buildSite({
      inputDir: await writeDoc("adoc", "index.adoc", "= T\n\n== A\n\na\n\n== B\n", level),
      outputFile: adoc,
      format: "html",
    });

    // One marked heading in each: the first section is the one only the page title precedes, and
    // the flat body Markdown produces and the `.sect1` nesting Asciidoctor produces agree on it.
    for (const [name, file] of [
      ["markdown", md],
      ["asciidoc", adoc],
    ] as const) {
      const html = await readFile(file, "utf8");
      // The attribute with its value: the two bare ones belong to the rule's selector.
      const marks = html.split('data-monodocs-pdf-break-before=""').length - 1;
      expect(marks, name).toBe(1);
      expect(html.slice(html.indexOf('data-monodocs-pdf-break-before=""')), name).toContain("B");
    }
  }, 60_000);
});

/**
 * The claim is a sheet count, and only a real print run produces one. Chromium only, like the other
 * PDF tests.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

async function sheets(name: string, file: string, body: string, config?: string): Promise<number> {
  const docs = await writeDoc(name, file, body, config);
  const out = join(dir, `${name}.pdf`);
  await buildSite({ inputDir: docs, outputFile: out, format: "pdf" });
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(await readFile(out))).getPageCount();
}

describe.skipIf(!chromium)("the page-break marker on paper", () => {
  it("starts a new sheet in both formats", async () => {
    // The control is the same document without the marker: one sheet. Without it, a test that
    // asserted two sheets would also pass on a document that needed two anyway.
    expect(await sheets("plain", "index.md", "# T\n\nA\n\nB\n")).toBe(1);
    expect(await sheets("md-class", "index.md", `# T\n\nA\n\n${MARKER}\n\nB\n`)).toBe(2);
    expect(
      await sheets(
        "md-style",
        "index.md",
        '# T\n\nA\n\n<div style="page-break-after: always"></div>\n\nB\n',
      ),
    ).toBe(2);
    // AsciiDoc has had this syntax all along; Asciidoctor emits the same class the rule matches.
    expect(await sheets("adoc", "index.adoc", "= T\n\nA\n\n<<<\n\nB\n")).toBe(2);
  }, 240_000);

  it("puts a document that fits on one sheet on one sheet, on paper wider than the breakpoint", async () => {
    // The blank sheet a short document used to end with came from the full-height rules meeting the
    // destination anchor `pdf.bookmarks` inserts. A4 is the control in the test above; A3 is here
    // because the first fix for it sat in a width media query, which A4 enters in print emulation
    // and A3 does not — measured, that version put this document on one sheet at A4 and two at A3.
    expect(await sheets("a3", "index.md", "# T\n\nA\n\nB\n", "pdf:\n  pageSize: A3\n")).toBe(1);
  }, 120_000);

  it("leaves a blank sheet for a marker with nothing behind it, and for two in a row", async () => {
    // Documented behaviour, so it is measured rather than assumed: a break with nothing after it is
    // a blank sheet, which is how a blank sheet is asked for. `branding: false` removes the footer
    // that would otherwise be the thing following the marker, so what is measured is the marker.
    const noBranding = "html:\n  branding: false\n";
    expect(await sheets("tail", "index.md", `# T\n\nA\n\n${MARKER}\n`, noBranding)).toBe(2);
    expect(
      await sheets("twice", "index.md", `# T\n\nA\n\n${MARKER}\n\n${MARKER}\n\nB\n`, noBranding),
    ).toBe(3);
  }, 120_000);

  it("puts each section on its own sheet under pdf.pageBreakLevel", async () => {
    // The assertion that fails in both directions: one sheet means the feature is dead, three means
    // the heading only the page title precedes was marked and the title is alone on a sheet.
    const body = "# T\n\n## A\n\na\n\n## B\n\nb\n";
    expect(await sheets("level-off", "index.md", body)).toBe(1);
    expect(await sheets("level-2", "index.md", body, "pdf:\n  pageBreakLevel: 2\n")).toBe(2);
    // An introduction on the title's sheet means the first section starts its own.
    expect(
      await sheets(
        "level-intro",
        "index.md",
        "# T\n\nintro\n\n## A\n\na\n",
        "pdf:\n  pageBreakLevel: 2\n",
      ),
    ).toBe(2);
    // AsciiDoc, and a deeper level: A is skipped, A1 and B each start a sheet.
    expect(
      await sheets(
        "level-3-adoc",
        "index.adoc",
        "= T\n\n== A\n\na\n\n=== A1\n\na1\n\n== B\n\nb\n",
        "pdf:\n  pageBreakLevel: 3\n",
      ),
    ).toBe(3);
  }, 240_000);

  it("does not put a blank sheet between a marker ending a page and the page after it", async () => {
    // Measured: the marker is an empty box, so `break-before` moves the box itself onto the new
    // sheet and this document costs three. `break-after` is why it costs two, and this test is
    // what keeps the rule from being flipped back on the analogy with the page boundary above it.
    const docs = join(dir, "twofile");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "a.md"), `# T\n\nA\n\n${MARKER}\n`, "utf8");
    await writeFile(join(docs, "b.md"), "# U\n\nB\n", "utf8");
    const out = join(dir, "twofile.pdf");
    await buildSite({ inputDir: docs, outputFile: out, format: "pdf" });
    const { PDFDocument } = await import("pdf-lib");

    expect((await PDFDocument.load(await readFile(out))).getPageCount()).toBe(2);
  }, 120_000);
});
