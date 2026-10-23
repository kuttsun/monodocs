import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import type { PdfGenerator, PdfRenderOptions } from "./pipeline/renderPdf";

// A GFM alert whose body is only an image lost the image (#221): the paragraph the marker sat in
// was dropped for having no text, with the image inside it.

let dir: string;
let docs: string;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-alerts-"));
  docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "i.svg"), svg);
  await writeFile(
    join(docs, "index.md"),
    "# Notes\n\n> [!NOTE]\n> ![x](i.svg)\n\n> [!TIP]\n> ![y](i.svg)\n> after\n\n" +
      "> [!WARNING]\n> Text ![z](i.svg)\n",
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The body of each admonition, in document order. */
function admonitionBodies(html: string): string[] {
  return [...html.matchAll(/<div class="admonition-content">([\s\S]*?)<\/div><\/div>/g)].map(
    (m) => m[1] ?? "",
  );
}

function expectImagesKept(html: string): void {
  const bodies = admonitionBodies(html);
  expect(bodies).toHaveLength(3);
  const embedded = /<img src="data:image\/svg\+xml;base64,[^"]*" alt="(\w)"/;
  expect(bodies.map((body) => embedded.exec(body)?.[1])).toEqual(["x", "y", "z"]);
  expect(bodies[1]).toContain("after");
  expect(bodies[2]).toContain("Text ");
}

describe("a GFM alert whose body opens with an image", () => {
  it("keeps the image in HTML", async () => {
    const outputFile = join(dir, "out.html");
    const result = await buildSite({ inputDir: docs, outputFile });
    expect(result.warnings).toEqual([]);
    expectImagesKept(await readFile(outputFile, "utf8"));
  });

  it("keeps the image in a PDF", async () => {
    const calls: { html: string; options: PdfRenderOptions }[] = [];
    const gen: PdfGenerator = {
      async render(html, options) {
        calls.push({ html, options });
        return new TextEncoder().encode("%PDF-1.4 fake");
      },
      async close() {},
    };
    await buildSite(
      { inputDir: docs, outputFile: join(dir, "out.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    expectImagesKept(calls[0]!.html);
  });
});
