import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";
import { watchSite } from "./watch";

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
    expect(result.warnings.map((w) => w.message).join("\n")).toMatch(/missing\.md/);
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

  it("keeps watching a single file across an editor's save-by-rename", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    const file = join(docs, "plan.md");
    await writeFile(file, "# First\n");
    const out = join(dir, "dist", "plan.html");

    let rebuilds = 0;
    let resolveNext: (() => void) | null = null;
    const nextRebuild = () =>
      new Promise<void>((res) => {
        resolveNext = res;
      });
    const handle = await watchSite(
      { inputDir: file, outputFile: out },
      {
        onRebuild: () => {
          rebuilds++;
          const r = resolveNext;
          resolveNext = null;
          r?.();
        },
      },
    );

    try {
      expect(rebuilds).toBe(1);

      // An ordinary in-place write.
      let next = nextRebuild();
      await writeFile(file, "# Second\n");
      await next;
      expect(await readFile(out, "utf8")).toContain("Second");

      // What many editors actually do: write a temporary file and rename it over the original.
      next = nextRebuild();
      const temp = join(docs, "plan.md.tmp");
      await writeFile(temp, "# Third\n");
      await rename(temp, file);
      await next;
      expect(await readFile(out, "utf8")).toContain("Third");

      // The edit *after* the replacement is the one that matters: a watch bound to the inode is
      // holding the file that was renamed away, and everything from here on is silent. On Linux
      // libuv already watches the parent directory and filters by name, so this passes either
      // way there; the backends that attach to the file itself are why watch.ts does the same
      // thing explicitly.
      next = nextRebuild();
      await writeFile(file, "# Fourth\n");
      await next;
      expect(await readFile(out, "utf8")).toContain("Fourth");

      // A sibling file is not this watch's business, so it must not trigger a rebuild.
      const before = rebuilds;
      await writeFile(join(docs, "other.md"), "# Other\n");
      await new Promise((res) => setTimeout(res, 400));
      expect(rebuilds).toBe(before);
    } finally {
      handle.close();
    }
  }, 15000);
});

describe("watching the configuration", () => {
  /**
   * Watches a directory input whose configuration sits outside it, so only the configuration's own
   * watch can see the configuration change. `nextRebuild` resolves on the rebuild after it is called.
   */
  async function watchWithConfig(configFile: string) {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Index\n");
    const out = join(dir, "dist", "docs.html");
    let resolveNext: (() => void) | null = null;
    const nextRebuild = () =>
      new Promise<void>((res) => {
        resolveNext = res;
      });
    const handle = await watchSite(
      { inputDir: docs, configFile, outputFile: out },
      {
        onRebuild: () => {
          const r = resolveNext;
          resolveNext = null;
          r?.();
        },
      },
    );
    return { handle, nextRebuild, out };
  }

  it("keeps watching the configuration across an editor's save-by-rename", async () => {
    const config = join(dir, "monodocs.config.yml");
    await writeFile(config, "title: First\n");
    const { handle, nextRebuild, out } = await watchWithConfig(config);
    try {
      // Saved by writing a temporary file and renaming it over the configuration.
      let next = nextRebuild();
      await writeFile(join(dir, "monodocs.config.yml.tmp"), "title: Second\n");
      await rename(join(dir, "monodocs.config.yml.tmp"), config);
      await next;
      expect(await readFile(out, "utf8")).toContain("<title>Second");
      // And edited in place after that: a watch bound to the replaced inode would miss it.
      next = nextRebuild();
      await writeFile(config, "title: Third\n");
      await next;
      expect(await readFile(out, "utf8")).toContain("<title>Third");
    } finally {
      handle.close();
    }
  }, 15000);

  // A symbolic link needs a privilege Windows does not grant by default.
  it.skipIf(process.platform === "win32")(
    "sees an edit to the file a symbolic link to the configuration points at",
    async () => {
      // The file lives in another directory, as a configuration shared across a repository would:
      // an edit to it raises nothing in the directory holding the link.
      const shared = join(dir, "shared");
      await mkdir(shared, { recursive: true });
      const target = join(shared, "base.yml");
      await writeFile(target, "title: First\n");
      const config = join(dir, "monodocs.config.yml");
      await symlink(target, config);
      const { handle, nextRebuild, out } = await watchWithConfig(config);
      try {
        const next = nextRebuild();
        await writeFile(target, "title: Second\n");
        await next;
        expect(await readFile(out, "utf8")).toContain("<title>Second");
      } finally {
        handle.close();
      }
    },
    15000,
  );
});
