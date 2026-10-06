import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { pageText } from "./pdfText.testutil";

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
