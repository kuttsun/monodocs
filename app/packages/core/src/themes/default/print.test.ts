import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../../build";

/**
 * Column widths are a layout computation, so they need a real engine: happy-dom reports zero for
 * every box and would pass whatever the stylesheet said. Chromium only when it is present, like
 * build.pdf.test.ts and layout.test.ts.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

let dir: string;
let html: string;

beforeAll(async () => {
  if (!chromium) return;
  dir = await mkdtemp(join(tmpdir(), "monodocs-print-"));
  const docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  // A schedule: short labels in the first column, whole sentences in the second. This is the shape
  // that `table-layout: fixed` mangles, because equal shares leave the label column half empty
  // while the sentences wrap in a column that is narrower than it needs to be.
  await writeFile(
    join(docs, "plan.md"),
    [
      "# Plan",
      "",
      "| Period | What happens |",
      "| --- | --- |",
      "| 2026-09 | The first cohort of documents is converted and handed to the reviewers. |",
      "| 2026-10 | Feedback is folded back in and the second cohort follows the same route. |",
      "",
    ].join("\n"),
  );
  const out = join(dir, "docs.html");
  await buildSite({ inputDir: docs, outputFile: out, format: "html" });
  html = await readFile(out, "utf8");
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Measure the header cells of the first content table under the print stylesheet. */
async function printedColumnWidths(): Promise<{ widths: number[]; tableWidth: number }> {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium as string,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 at 96dpi
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMediaType("print");
    return await page.evaluate(() => {
      const table = document.querySelector("#content table") as HTMLTableElement;
      const cells = [...table.querySelectorAll("thead th")] as HTMLElement[];
      return {
        widths: cells.map((c) => c.getBoundingClientRect().width),
        tableWidth: table.getBoundingClientRect().width,
      };
    });
  } finally {
    await browser.close();
  }
}

describe.skipIf(!chromium)("printed tables", () => {
  it("gives each column the width its contents need", async () => {
    const { widths, tableWidth } = await printedColumnWidths();

    expect(widths).toHaveLength(2);
    // `table-layout: fixed` with no <col> widths splits the page evenly whatever the contents are:
    // a two-word label column would take half the page. Content-driven widths keep it well under.
    expect(widths[0]! / tableWidth).toBeLessThan(0.35);
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
  }, 60_000);

  it("still fits the table inside the page rather than overflowing it", async () => {
    const { widths, tableWidth } = await printedColumnWidths();
    const content = 794; // viewport width; #content spans it with no max-width in print

    // The reason the print block reshapes tables at all: paper has no horizontal scrollbar, so
    // anything past the page edge is simply gone from the PDF.
    expect(tableWidth).toBeLessThanOrEqual(content);
    expect(widths[0]! + widths[1]!).toBeLessThanOrEqual(tableWidth + 1);
  }, 60_000);
});
