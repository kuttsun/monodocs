import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, preparePages } from "./build";
import { loadConfig } from "./config";
import type { MermaidPrerenderer } from "./pipeline/mermaidPrerender";

let dir: string;
let docs: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-mmd-"));
  docs = join(dir, "docs");
  out = join(dir, "dist", "manual.html");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# 図\n\n```mermaid\ngraph TD\n  A --> B\n```\n");
  await writeFile(join(docs, "monodocs.config.yml"), "mermaid:\n  mode: pre-render\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 呼び出しを記録し canned SVG を返す偽レンダラ。 */
function fakeRenderer(): MermaidPrerenderer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async render(id: string) {
      calls.push(id);
      return `<svg id="${id}"><g/></svg>`;
    },
    async close() {},
  };
}

describe("buildSite - mermaid pre-render (browserless via injected renderer)", () => {
  it("plumbs config.mermaidMode into postprocess and embeds SVG", async () => {
    const config = await loadConfig({ inputDir: docs }, dir);
    expect(config.mermaidMode).toBe("pre-render");
    const renderer = fakeRenderer();
    const prepared = await preparePages(config, dir, { mermaidPrerenderer: renderer });
    expect(renderer.calls).toEqual(["mermaid-0"]);
    expect(prepared.hasMermaid).toBe(true);
    expect(prepared.pages[0]!.html).toContain('<figure class="mermaid"><svg id="mermaid-0">');
    expect(prepared.pages[0]!.html).not.toContain("language-mermaid");
  });
});

// 実 Chromium が要るため、存在するときだけ end-to-end で描画とゲートを確認する。
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

describe.skipIf(!chromium)("buildSite - mermaid pre-render (real Chromium)", () => {
  it("renders diagrams to SVG and injects no client runtime", async () => {
    await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");
    // ビルド時に SVG 化されて埋め込まれる。
    expect(html).toContain("<svg");
    expect(html).toContain('<figure class="mermaid">');
    // pre-render では client ランタイム（cdn / inline bundle）を注入しない。
    expect(html).not.toContain("cdn.jsdelivr.net/npm/mermaid");
    expect(html).not.toContain("mermaid.initialize");
  });
});
