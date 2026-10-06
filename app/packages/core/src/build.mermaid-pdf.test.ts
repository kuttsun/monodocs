import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { pageText } from "./pdfText.testutil";
import { createPuppeteerPdfGenerator } from "./pipeline/renderPdf";
import { renderHelper } from "./themes/mermaid";

/**
 * A PDF with client-mode diagrams waits for mermaid's run to finish, not for a sign in the DOM:
 * mermaid marks a diagram processed, and puts an empty <svg> in it, before its layout is done, and
 * mermaid 12's ELK layout is asynchronous. A diagram printed too early carries no labels. The race
 * does not reproduce reliably on a fast machine, so this guards the outcome — every diagram, an
 * ELK-laid-out one included, printed with its labels — rather than proving the race away.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-mermaid-pdf-"));
  await writeFile(
    join(dir, "a.md"),
    "# Diagrams\n\n```mermaid\ngraph TD\n  A[QZXJALPHA] --> B[QZXJOMEGA]\n```\n\n" +
      // A larger graph keeps the asynchronous ELK layout busy for longer.
      `\`\`\`mermaid\n---\nconfig:\n  layout: elk\n---\nflowchart LR\n  C[QZXJGAMMA] --> D[QZXJDELTA]\n${Array.from(
        { length: 80 },
        (_, i) => `  N${i} --> N${i + 1}\n  N${i} --> N${(i * 7) % 80}\n`,
      ).join("")}\`\`\`\n`,
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!chromium)("diagrams in a PDF (real Chromium)", () => {
  it("prints every client-mode diagram with its labels", async () => {
    const configFile = join(dir, "monodocs.config.yml");
    await writeFile(configFile, "mermaid:\n  runtime: inline\npdf:\n  bookmarks: false\n");
    const out = join(dir, "out.pdf");
    await buildSite({ inputDir: dir, configFile, outputFile: out, format: "pdf" });
    const text = await pageText(await readFile(out), 0);
    for (const label of ["QZXJALPHA", "QZXJOMEGA", "QZXJGAMMA", "QZXJDELTA"]) {
      expect(text).toContain(label);
    }
  }, 120_000);
});

describe.skipIf(!chromium)("the PDF's wait for client-mode diagrams (real Chromium)", () => {
  it("prints only after the render promise settles, whatever the DOM says before", async () => {
    // A stand-in runtime that marks the diagram processed and gives it an empty <svg> at once, as
    // mermaid does, and draws its label only 1.5 s later. Waiting on the DOM prints too early.
    const html =
      '<html><body><main id="content"><article class="page" data-route="/">' +
      '<div class="mermaid">graph TD</div></article></main><script>' +
      "window.__sdRenderMermaid=function(){" +
      "var el=document.querySelector('.mermaid');el.setAttribute('data-processed','true');" +
      "el.innerHTML='<svg></svg>';" +
      "return new Promise(function(r){setTimeout(function(){" +
      "el.innerHTML='<svg width=\\'300\\' height=\\'40\\'><text x=\\'0\\' y=\\'20\\'>QZXJLATE</text></svg>';" +
      "r();},1500);});};</script></body></html>";
    const generator = createPuppeteerPdfGenerator();
    try {
      const bytes = await generator.render(html, {
        pageSize: "A4",
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
        printBackground: true,
        waitForMermaid: true,
      });
      expect(await pageText(bytes, 0)).toContain("QZXJLATE");
    } finally {
      await generator.close();
    }
  }, 60_000);
});

describe("__sdRenderMermaid", () => {
  it("resolves only when mermaid's run, and every run before it, has finished", async () => {
    // A stand-in mermaid whose run settles only when the test says so.
    const settle: Array<() => void> = [];
    const fake = {
      run: () => new Promise<void>((resolve) => settle.push(resolve)),
    };
    const win: Record<string, unknown> = { fake };
    new Function("window", renderHelper("window.fake"))(win);
    const render = win.__sdRenderMermaid as () => Promise<unknown>;

    let first = false;
    void render().then(() => (first = true));
    await Promise.resolve();
    await Promise.resolve();
    let second = false;
    void render().then(() => (second = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(settle).toHaveLength(2);
    // The second run returns at once on a diagram the first one marked; its promise still waits.
    settle[1]!();
    await new Promise((r) => setTimeout(r, 10));
    expect([first, second]).toEqual([false, false]);
    settle[0]!();
    await new Promise((r) => setTimeout(r, 10));
    expect([first, second]).toEqual([true, true]);
  });

  it("settles even when a run fails", async () => {
    const win: Record<string, unknown> = {
      fake: { run: () => Promise.reject(new Error("parse")) },
    };
    new Function("window", renderHelper("window.fake"))(win);
    await expect((win.__sdRenderMermaid as () => Promise<unknown>)()).resolves.toBeDefined();
  });
});
