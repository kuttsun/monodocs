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
async function writeDoc(name: string, file: string, body: string): Promise<string> {
  const docs = join(dir, name);
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, file), body, "utf8");
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

/**
 * The claim is a sheet count, and only a real print run produces one. Chromium only, like the other
 * PDF tests.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

async function sheets(name: string, file: string, body: string): Promise<number> {
  const docs = await writeDoc(name, file, body);
  const out = join(dir, `${name}.pdf`);
  await buildSite({ inputDir: docs, outputFile: out, format: "pdf" });
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(await readFile(out))).getPageCount();
}

describe.skipIf(!chromium)("the page-break marker on paper", () => {
  it("starts a new sheet in both formats", async () => {
    // The control is the same document without the marker: one sheet. Without it, a test that
    // asserted two sheets would also pass on a document that needed two anyway. It is also the
    // regression test for the blank sheet a short document used to end with — measured to come from
    // the full-viewport-height rules meeting the bookmark destination anchor in paged media, and
    // released by the print block turning both of them off.
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
