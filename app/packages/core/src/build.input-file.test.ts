import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";

/**
 * Pointing a tool that produces a single file at a single file is the obvious thing to try, and
 * it used to fail with Node's own `ENOTDIR ... scandir`, which says neither what was wrong nor
 * what to do instead. The file is now an input in its own right, with its directory as the base
 * for everything it refers to.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-file-input-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 1x1 transparent PNG. Small enough to inline, real enough for the embedder to accept. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("a single file as the input", () => {
  it("builds one page from one Markdown file", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "plan.md"), "# Plan\n\nBody text.\n");
    const out = join(dir, "plan.html");

    const result = await buildSite({
      inputDir: join(docs, "plan.md"),
      outputFile: out,
      format: "html",
    });

    expect(result.pages).toBe(1);
    expect(result.outputs).toEqual([out]);
    expect(await readFile(out, "utf8")).toContain("Body text.");
  });

  it("builds one page from one AsciiDoc file", async () => {
    await writeFile(join(dir, "plan.adoc"), "= Plan\n\nBody text.\n");
    const out = join(dir, "plan.html");

    const result = await buildSite({
      inputDir: join(dir, "plan.adoc"),
      outputFile: out,
      format: "html",
    });

    expect(result.pages).toBe(1);
    expect(await readFile(out, "utf8")).toContain("Body text.");
  });

  it("reads the configuration that sits next to the file", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "plan.md"), "# Plan\n\nBody.\n");
    await writeFile(join(docs, "monodocs.config.yml"), 'title: "Business Plan"\nlang: en\n');
    const out = join(dir, "plan.html");

    await buildSite({ inputDir: join(docs, "plan.md"), outputFile: out, format: "html" });

    const html = await readFile(out, "utf8");
    expect(html).toContain("Business Plan");
    expect(html).toContain('<html lang="en"');
  });

  it("resolves what the file refers to against the directory holding it", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "plan.md"), "# Plan\n\n![shot](./shot.png)\n");
    await writeFile(join(docs, "shot.png"), PNG);
    const out = join(dir, "plan.html");

    const result = await buildSite({
      inputDir: join(docs, "plan.md"),
      outputFile: out,
      format: "html",
    });

    // Embedded rather than left as a relative src: the base directory is the file's parent.
    expect(await readFile(out, "utf8")).toContain("data:image/png;base64,");
    expect(result.warnings).toEqual([]);
  });

  it("bundles a file the exclude list would otherwise hide", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    // `_`-prefixed files are fragments when a directory is scanned. Naming one is a choice.
    await writeFile(join(docs, "_draft.md"), "# Draft\n\nStill a page when asked for.\n");
    const out = join(dir, "draft.html");

    const result = await buildSite({
      inputDir: join(docs, "_draft.md"),
      outputFile: out,
      format: "html",
    });

    expect(result.pages).toBe(1);
    expect(await readFile(out, "utf8")).toContain("Still a page when asked for.");
  });

  it("validates a single file as well", async () => {
    await writeFile(join(dir, "plan.md"), "# Plan\n\n[gone](./missing.md)\n");

    const result = await validateSite({ inputDir: join(dir, "plan.md") });

    expect(result.errors).toEqual([]);
    expect(result.pages).toBe(1);
    expect(result.warnings.join("\n")).toMatch(/missing\.md/);
  });

  it("says what is wrong when the file is not a source it can read", async () => {
    await writeFile(join(dir, "notes.txt"), "plain text\n");

    await expect(
      buildSite({ inputDir: join(dir, "notes.txt"), outputFile: join(dir, "out.html") }),
    ).rejects.toThrow(/supported extensions.*\.md/s);
  });

  it("still reports a path that does not exist as not found", async () => {
    await expect(
      buildSite({ inputDir: join(dir, "nope.md"), outputFile: join(dir, "out.html") }),
    ).rejects.toThrow(/not found/i);
  });
});
