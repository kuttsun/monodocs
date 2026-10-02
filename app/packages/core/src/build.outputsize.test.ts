import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import type { PdfGenerator } from "./pipeline/renderPdf";
import { sizeReportLines } from "./pipeline/outputSize";

/**
 * Output size and budget (roadmap 20.5): the build reports what it wrote, measured on disk, with
 * a breakdown whose parts sum to the file, and a budget that warns or fails.
 */
let dir: string;

// A 1x1 PNG, a larger one, the larger one under another name, and the larger one with three more
// bytes — whose data URI therefore starts with the larger one's whole URI.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
// A length divisible by three, so its base64 is a prefix of LONGER's.
const BIG = Buffer.concat([PNG, Buffer.alloc(4096 + ((3 - ((PNG.length + 4096) % 3)) % 3), 1)]);
const LONGER = Buffer.concat([BIG, Buffer.alloc(3, 2)]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-size-"));
  await mkdir(join(dir, "img"));
  await writeFile(join(dir, "img", "small.png"), PNG);
  await writeFile(join(dir, "img", "big.png"), BIG);
  await writeFile(join(dir, "img", "same.png"), BIG);
  await writeFile(join(dir, "img", "longer.png"), LONGER);
  await writeFile(
    join(dir, "a.md"),
    "# A\n\n![s](img/small.png)\n\n![b](img/big.png)\n\n![b again](img/big.png)\n\n" +
      "![same bytes](img/same.png)\n\n![l](img/longer.png)\n\n" +
      "```ts\nconst x = 1;\n```\n\n```mermaid\ngraph TD; A-->B\n```\n",
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

let pdfRenders = 0;

async function build(
  configBody: string,
  format: "html" | "both" = "html",
  onBudget?: "warn" | "error",
) {
  const configFile = join(dir, "monodocs.config.yml");
  await writeFile(configFile, configBody);
  const out = join(dir, format === "html" ? "out.html" : "out");
  pdfRenders = 0;
  const gen: PdfGenerator = {
    async render() {
      pdfRenders++;
      return new TextEncoder().encode("%PDF-1.4 fake");
    },
    async close() {},
  };
  return buildSite(
    { configFile, inputDir: dir, outputFile: out, format, onBudget },
    { pdfGenerator: gen },
  );
}

describe("the size report", () => {
  it("measures the written file, and its parts sum to it", async () => {
    const result = await build("mermaid:\n  runtime: inline\n");
    const [size] = result.sizes;
    const html = await readFile(size!.path, "utf8");
    expect(size!.bytes).toBe((await stat(size!.path)).size);

    const parts = size!.breakdown!;
    expect(parts.images.bytes + parts.mermaid + parts.pageData + parts.document).toBe(size!.bytes);
    expect(parts.mermaid).toBeGreaterThan(100_000);
    expect(parts.pageData).toBeGreaterThan(0);
    expect(parts.document).toBeGreaterThan(0);

    // Every embedded copy is counted once: three of the larger image (two references and an
    // identical file), and the longer one is not also counted as a copy of the image it starts with.
    const uri = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
    expect(uri(LONGER).startsWith(uri(BIG))).toBe(true);
    expect(parts.images.bytes).toBe(uri(PNG).length + 3 * uri(BIG).length + uri(LONGER).length);
    expect(parts.images.files).toBe(4);
    // The largest is one copy's size, not the sum of its references.
    expect(parts.images.largest).toEqual({ path: "img/longer.png", bytes: uri(LONGER).length });
    for (const part of Object.values(parts)) {
      expect(typeof part === "number" ? part : part.bytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the CDN runtime no Mermaid line, and Shiki none ever", async () => {
    const result = await build("mermaid:\n  runtime: cdn\n");
    expect(result.sizes[0]!.breakdown!.mermaid).toBe(0);
    // The page has highlighted code, and the report has only these lines.
    const labels = sizeReportLines(result.sizes).map((l) => l.trim().split(/\s{2,}/)[0]);
    expect(labels).toEqual(["out.html", "images", "page data", "document"]);
    expect(sizeReportLines(result.sizes)[1]).toContain("largest: img/longer.png");
  });

  it("measures a PDF as one file", async () => {
    const result = await build("", "both");
    expect(result.sizes.map((s) => basename(s.path))).toEqual(["docs.html", "docs.pdf"]);
    expect(result.sizes[1]).toEqual({ path: result.sizes[1]!.path, bytes: 13 });
  });
});

describe("assets.budget", () => {
  it("is not checked when unset", async () => {
    const result = await build("");
    expect(result.warnings.map((w) => w.code)).not.toContain("output/over-budget");
  });

  it("warns by default when an output exceeds it, and stays quiet under it", async () => {
    const over = await build("assets:\n  budget: 1KB\n");
    expect(over.warnings.filter((w) => w.code === "output/over-budget")).toHaveLength(1);
    expect(over.warnings.find((w) => w.code === "output/over-budget")!.message).toMatch(
      /out\.html is .* over assets\.budget \(1\.0 KB\)/,
    );
    const under = await build("assets:\n  budget: 50MB\n");
    expect(under.warnings.map((w) => w.code)).not.toContain("output/over-budget");
  });

  it("checks the PDF too", async () => {
    const result = await build("assets:\n  budget: 10\n", "both");
    const over = result.warnings.filter((w) => w.code === "output/over-budget");
    expect(over.map((w) => w.message.split(" ")[0])).toEqual(["docs.html", "docs.pdf"]);
  });

  it("fails the build under onBudget: error, leaving the file for inspection", async () => {
    const failure = build("assets:\n  budget: 1KB\n  onBudget: error\n");
    await expect(failure).rejects.toMatchObject({ code: "output/over-budget" });
    // A failed build returns no result, so the breakdown to act on travels in the message.
    await expect(failure).rejects.toThrow(/largest: img\/longer\.png/);
    expect((await stat(join(dir, "out.html"))).size).toBeGreaterThan(1024);
  });

  it("fails on an HTML over budget before rendering the PDF from it", async () => {
    await expect(
      build("assets:\n  budget: 1KB\n  onBudget: error\n", "both"),
    ).rejects.toMatchObject({ code: "output/over-budget" });
    expect(pdfRenders).toBe(0);
  });

  it("can be relaxed to warn by the caller, as watch and serve do", async () => {
    const result = await build("assets:\n  budget: 1KB\n  onBudget: error\n", "html", "warn");
    expect(result.warnings.map((w) => w.code)).toContain("output/over-budget");
  });

  it("rejects a budget it cannot read", async () => {
    await expect(build("assets:\n  budget: lots\n")).rejects.toThrow(/assets\.budget/);
  });
});
