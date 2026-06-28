import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postprocessPages } from "./postprocess";
import type { Page } from "../types";

function page(p: { relativePath: string; route: string; html: string; sourcePath?: string }): Page {
  return {
    id: p.route.replace(/\W+/g, "-"),
    route: p.route,
    sourcePath: p.sourcePath ?? `/docs/${p.relativePath}`,
    relativePath: p.relativePath,
    format: "markdown",
    title: "T",
    rawSource: "",
    html: p.html,
    text: "",
    headings: [],
    links: [],
    assets: [],
  };
}

const baseOptions = {
  inputDir: "/docs",
  sourceExtensions: [".md", ".markdown", ".adoc", ".asciidoc", ".asc"],
  embedImages: false,
  maxInlineSize: 5 * 1024 * 1024,
  onLargeImage: "warn" as const,
  mermaidEnabled: true,
  codeHighlight: false,
};

describe("postprocessPages - link rewriting", () => {
  it("rewrites doc links to hash routes and warns on unresolved", async () => {
    const pages: Page[] = [
      page({
        relativePath: "index.md",
        route: "/",
        html:
          '<a href="setup/install.adoc">i</a>' +
          '<a href="https://example.com">ext</a>' +
          '<a href="missing.md">m</a>' +
          '<a href="#frag">f</a>',
      }),
      page({ relativePath: "setup/install.adoc", route: "/setup/install", html: "<p>x</p>" }),
    ];

    const result = await postprocessPages(pages, baseOptions);

    expect(pages[0]!.html).toContain('href="#/setup/install"');
    expect(pages[0]!.html).toContain('href="https://example.com"');
    expect(pages[0]!.html).toContain('href="#frag"');
    expect(result.warnings.some((w) => w.includes("missing.md"))).toBe(true);
  });

  it("rewrites AsciiDoc-style .html cross links", async () => {
    const pages: Page[] = [
      page({ relativePath: "a.adoc", route: "/a", html: '<a href="b.html">b</a>' }),
      page({ relativePath: "b.adoc", route: "/b", html: "<p>b</p>" }),
    ];
    await postprocessPages(pages, baseOptions);
    expect(pages[0]!.html).toContain('href="#/b"');
  });

  it("resolves configured custom extensions", async () => {
    const pages: Page[] = [
      page({ relativePath: "a.md", route: "/a", html: '<a href="b.mdx">b</a>' }),
      page({ relativePath: "b.mdx", route: "/b", html: "<p>b</p>" }),
    ];
    await postprocessPages(pages, { ...baseOptions, sourceExtensions: [".md", ".mdx"] });
    expect(pages[0]!.html).toContain('href="#/b"');
  });

  it("drops heading anchors with a warning", async () => {
    const pages: Page[] = [
      page({ relativePath: "index.md", route: "/", html: '<a href="g.md#sec">g</a>' }),
      page({ relativePath: "g.md", route: "/g", html: "<p>g</p>" }),
    ];
    const result = await postprocessPages(pages, baseOptions);
    expect(pages[0]!.html).toContain('href="#/g"');
    expect(result.warnings.some((w) => w.includes("Heading anchor"))).toBe(true);
  });
});

describe("postprocessPages - mermaid", () => {
  it('converts mermaid code blocks to <pre class="mermaid">', async () => {
    const pages: Page[] = [
      page({
        relativePath: "d.md",
        route: "/d",
        html: '<pre><code class="language-mermaid">graph TD\n  A --> B</code></pre>',
      }),
    ];
    const result = await postprocessPages(pages, baseOptions);
    expect(result.hasMermaid).toBe(true);
    expect(pages[0]!.html).toContain('class="mermaid"');
    expect(pages[0]!.html).toContain("graph TD");
  });

  it("leaves mermaid as-is when disabled", async () => {
    const pages: Page[] = [
      page({
        relativePath: "d.md",
        route: "/d",
        html: '<pre><code class="language-mermaid">graph TD</code></pre>',
      }),
    ];
    const result = await postprocessPages(pages, { ...baseOptions, mermaidEnabled: false });
    expect(result.hasMermaid).toBe(false);
    expect(pages[0]!.html).toContain("language-mermaid");
  });
});

describe("postprocessPages - code highlight (shiki)", () => {
  it("highlights fenced code blocks with shiki dual themes", async () => {
    const pages: Page[] = [
      page({
        relativePath: "c.md",
        route: "/c",
        html: '<pre><code class="language-js">const x = 1;</code></pre>',
      }),
    ];
    await postprocessPages(pages, { ...baseOptions, codeHighlight: true });
    expect(pages[0]!.html).toContain("shiki");
    // dual theme（ライト inline + ダーク用 CSS 変数）。
    expect(pages[0]!.html).toContain("--shiki-dark");
  }, 20000);

  it("does not highlight mermaid blocks", async () => {
    const pages: Page[] = [
      page({
        relativePath: "d.md",
        route: "/d",
        html: '<pre><code class="language-mermaid">graph TD\n  A --> B</code></pre>',
      }),
    ];
    await postprocessPages(pages, { ...baseOptions, codeHighlight: true });
    expect(pages[0]!.html).toContain('class="mermaid"');
    expect(pages[0]!.html).not.toContain("shiki");
  }, 20000);

  it("falls back to plaintext for unknown languages", async () => {
    const pages: Page[] = [
      page({
        relativePath: "e.md",
        route: "/e",
        html: '<pre><code class="language-totally-unknown-lang">data</code></pre>',
      }),
    ];
    // 未対応言語でも例外を投げず、shiki の出力に置き換わる。
    await postprocessPages(pages, { ...baseOptions, codeHighlight: true });
    expect(pages[0]!.html).toContain("shiki");
  }, 20000);

  it("leaves code blocks untouched when disabled", async () => {
    const pages: Page[] = [
      page({
        relativePath: "c.md",
        route: "/c",
        html: '<pre><code class="language-js">const x = 1;</code></pre>',
      }),
    ];
    await postprocessPages(pages, { ...baseOptions, codeHighlight: false });
    expect(pages[0]!.html).toContain('class="language-js"');
    expect(pages[0]!.html).not.toContain("shiki");
  });
});

describe("postprocessPages - image embedding", () => {
  let root: string;
  let docs: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "single-docs-img-"));
    docs = join(root, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    await writeFile(join(root, "secret.svg"), "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("inlines local images as data URIs", async () => {
    const pages: Page[] = [
      page({
        relativePath: "index.md",
        route: "/",
        sourcePath: join(docs, "index.md"),
        html: '<img src="logo.svg" alt="logo">',
      }),
    ];
    await postprocessPages(pages, { ...baseOptions, inputDir: docs, embedImages: true });
    expect(pages[0]!.html).toContain("data:image/svg+xml;base64,");
  });

  it("refuses to embed images outside the input directory", async () => {
    const pages: Page[] = [
      page({
        relativePath: "index.md",
        route: "/",
        sourcePath: join(docs, "index.md"),
        html: '<img src="../secret.svg">',
      }),
    ];
    const result = await postprocessPages(pages, {
      ...baseOptions,
      inputDir: docs,
      embedImages: true,
    });
    expect(result.warnings.some((w) => w.includes("outside input directory"))).toBe(true);
    expect(pages[0]!.html).not.toContain("data:image");
  });

  it("warns on missing images and leaves external untouched", async () => {
    const pages: Page[] = [
      page({
        relativePath: "index.md",
        route: "/",
        sourcePath: join(docs, "index.md"),
        html: '<img src="nope.png"><img src="https://x/y.png">',
      }),
    ];
    const result = await postprocessPages(pages, {
      ...baseOptions,
      inputDir: docs,
      embedImages: true,
    });
    expect(result.warnings.some((w) => w.includes("nope.png"))).toBe(true);
    expect(pages[0]!.html).toContain('src="https://x/y.png"');
  });
});
