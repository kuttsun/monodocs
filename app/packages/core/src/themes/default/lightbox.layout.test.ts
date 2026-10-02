import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../../build";

/**
 * How large a diagram ends up in the lightbox is CSS layout (aspect-ratio, padding, viewport
 * units), which happy-dom does not compute. Like layout.test.ts, this runs only where a real
 * Chromium exists.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

const SLOT = "<p>DIAGRAM_SLOT</p>";

let dir: string;
let html: string;

beforeAll(async () => {
  if (!chromium) return;
  dir = await mkdtemp(join(tmpdir(), "monodocs-lightbox-"));
  const docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# Diagram\n\nDIAGRAM_SLOT\n");
  const out = join(dir, "docs.html");
  await buildSite({ inputDir: docs, outputFile: out, format: "html" });
  html = await readFile(out, "utf8");
  expect(html).toContain(SLOT);
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Opens a pre-render-shaped diagram with the given viewBox and measures the dialog. */
async function open(viewBox: [number, number], title: string) {
  const [w, h] = viewBox;
  const svg =
    `<svg id="mermaid-0" width="100%" viewBox="0 0 ${w} ${h}" style="max-width: ${w}px;">` +
    (title ? `<title>${title}</title>` : "") +
    `<rect width="${w}" height="${h}" fill="#888"></rect></svg>`;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium as string,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setContent(html.replace(SLOT, `<figure class="mermaid">${svg}</figure>`), {
      waitUntil: "load",
    });
    await page.click("#content .mermaid");
    return await page.evaluate(() => {
      const dialog = document.getElementById("image-lightbox") as HTMLDialogElement;
      const rect = document.querySelector("#image-lightbox-diagram svg")!.getBoundingClientRect();
      return {
        open: dialog.open,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        dialogScrolls: dialog.scrollHeight > dialog.clientHeight,
      };
    });
  } finally {
    await browser.close();
  }
}

describe.skipIf(!chromium)("diagram lightbox layout (real Chromium)", () => {
  it.each([
    ["very tall", [100, 2500] as [number, number], ""],
    ["very wide", [2500, 100] as [number, number], ""],
    ["captioned", [400, 300] as [number, number], "Flow"],
  ])(
    "fits a %s diagram in the viewport without collapsing it",
    async (_name, box, title) => {
      const r = await open(box, title);
      expect(r.open).toBe(true);
      // The padding must not eat the diagram: the drawn box keeps the diagram's proportions.
      expect(r.width).toBeGreaterThan(10);
      expect(r.height).toBeGreaterThan(10);
      expect(r.width / r.height).toBeCloseTo(box[0] / box[1], 1);
      expect(r.right).toBeLessThanOrEqual(1280);
      expect(r.bottom).toBeLessThanOrEqual(800);
      expect(r.dialogScrolls).toBe(false);
    },
    60_000,
  );
});
