import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import type { PdfGenerator, PdfRenderOptions } from "./pipeline/renderPdf";

// Image file names with a space or characters outside ASCII (#212). The Markdown renderer
// percent-encodes them in `src`; Asciidoctor does not. Both must be embedded.

let dir: string;
let docs: string;

const svg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${fill}"/></svg>`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-image-names-"));
  docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "図.svg"), svg("red"));
  await writeFile(join(docs, "a b.svg"), svg("blue"));
  await writeFile(join(docs, "index.md"), "# Markdown\n\n![x](図.svg) ![y](<a b.svg>)\n");
  await writeFile(
    join(docs, "guide.adoc"),
    "= AsciiDoc\n\nimage::図.svg[x]\n\nimage::a b.svg[y]\n",
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakePdfGenerator() {
  const calls: { html: string; options: PdfRenderOptions }[] = [];
  const gen: PdfGenerator = {
    async render(html, options) {
      calls.push({ html, options });
      return new TextEncoder().encode("%PDF-1.4 fake");
    },
    async close() {},
  };
  return { gen, calls };
}

function expectEmbedded(html: string): void {
  // Two images on each of the two pages.
  expect(html.match(/<img [^>]*src="data:image\/svg\+xml;base64,/g)).toHaveLength(4);
  expect(html).not.toMatch(/src="(?:%E5%9B%B3|図|a%20b|a b)\.svg"/);
}

describe("images whose names contain a space or non-ASCII characters", () => {
  it("are embedded in HTML", async () => {
    const outputFile = join(dir, "out.html");
    const result = await buildSite({ inputDir: docs, outputFile });
    expect(result.warnings.filter((w) => w.code.startsWith("image/"))).toEqual([]);
    expectEmbedded(await readFile(outputFile, "utf8"));
  });

  it("are embedded in a PDF", async () => {
    const { gen, calls } = fakePdfGenerator();
    const result = await buildSite(
      { inputDir: docs, outputFile: join(dir, "out.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    expect(result.warnings.filter((w) => w.code.startsWith("image/"))).toEqual([]);
    expectEmbedded(calls[0]!.html);
  });
});
