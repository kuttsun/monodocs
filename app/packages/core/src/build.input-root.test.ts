import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";

/**
 * `root` and `sources.include` exist so that a repository shaped the way repositories are
 * shaped — a `README.md` at the top and pages under `docs/` — can be built as one document
 * (roadmap.md 12.5). The root stays single, because it answers four questions at once, and the
 * selection is what becomes configurable.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-input-root-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 1x1 transparent PNG. Small enough to inline, real enough for the embedder to accept. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** A repository with its readme at the top and its pages one directory down. */
async function writeRepository(): Promise<void> {
  await mkdir(join(dir, "docs"), { recursive: true });
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "README.md"), "# Readme\n\nThe top of the repository.\n");
  await writeFile(join(dir, "docs", "index.md"), "# Docs\n\nThe documentation index.\n");
  await writeFile(join(dir, "docs", "guide.md"), "# Guide\n\nA guide page.\n");
}

async function writeConfig(body: string): Promise<string> {
  const path = join(dir, "monodocs.config.yml");
  await writeFile(path, body);
  return path;
}

describe("root and sources.include", () => {
  it("builds one document from a readme at the top and pages under docs", async () => {
    await writeRepository();
    const configFile = await writeConfig(
      'root: "."\nsources:\n  include:\n    - "README.md"\n    - "docs/**"\n',
    );
    const out = join(dir, "out.html");

    const result = await buildSite({ configFile, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    expect(result.pages).toBe(3);
    // Routes come from the path relative to the root, which is what makes this one tree rather
    // than two. `docs/index.md` is `/docs` here, not `/` — the cost 12.5 records as the honest one.
    expect(html).toContain('data-route="/README"');
    expect(html).toContain('data-route="/docs"');
    expect(html).toContain('data-route="/docs/guide"');
    expect(html).toContain("The top of the repository.");
    expect(html).toContain("A guide page.");
  });

  it("resolves an image against the root rather than against the directory holding the page", async () => {
    await writeRepository();
    await writeFile(join(dir, "assets", "logo.png"), PNG);
    await writeFile(join(dir, "README.md"), "# Readme\n\n![Logo](./assets/logo.png)\n");
    const configFile = await writeConfig(
      'root: "."\nsources:\n  include:\n    - "README.md"\n    - "docs/**"\n',
    );
    const out = join(dir, "out.html");

    await buildSite({ configFile, outputFile: out, format: "html" });

    expect(await readFile(out, "utf8")).toContain("data:image/png;base64,");
  });

  it("subtracts exclude last, so an include cannot hand back a draft", async () => {
    await writeRepository();
    await mkdir(join(dir, "docs", "drafts"), { recursive: true });
    await writeFile(join(dir, "docs", "drafts", "wip.md"), "# WIP\n\nNot for readers.\n");
    const configFile = await writeConfig(
      'root: "."\n' +
        "sources:\n" +
        "  include:\n" +
        '    - "README.md"\n' +
        '    - "docs/**"\n' +
        "  exclude:\n" +
        '    - "docs/drafts/**"\n',
    );
    const out = join(dir, "out.html");

    const result = await buildSite({ configFile, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    expect(result.pages).toBe(3);
    expect(html).not.toContain("Not for readers.");
  });

  it("keeps applying the built-in exclude list, which an include cannot hand back", async () => {
    await writeRepository();
    await writeFile(join(dir, "docs", "_fragment.md"), "Fragment, not a page.\n");
    const configFile = await writeConfig('root: "."\nsources:\n  include:\n    - "docs/**"\n');
    const out = join(dir, "out.html");

    const result = await buildSite({ configFile, outputFile: out, format: "html" });

    expect(result.pages).toBe(2);
    expect(await readFile(out, "utf8")).not.toContain("Fragment, not a page.");
  });

  /**
   * The built-in patterns are anchored at the root, and always have been: `_partials/**` matches a
   * directory at the top of the root and `**\/_*` matches a file whose own name starts with `_`.
   * Moving the root up therefore moves what `_partials/**` covers, exactly as a nested
   * `sub/_partials/` is not covered today. It is a consequence of the root moving rather than a
   * hole `root` opens, and `sources.exclude` is where a document says what it actually wants.
   */
  it("anchors the built-in patterns at the root, so a nested partials directory needs naming", async () => {
    await writeRepository();
    await mkdir(join(dir, "docs", "_partials"), { recursive: true });
    await writeFile(join(dir, "docs", "_partials", "note.md"), "Fragment under a directory.\n");
    const out = join(dir, "out.html");

    const included = await buildSite({
      configFile: await writeConfig('root: "."\nsources:\n  include:\n    - "docs/**"\n'),
      outputFile: out,
      format: "html",
    });
    expect(included.pages).toBe(3);

    const named = await buildSite({
      configFile: await writeConfig(
        'root: "."\n' +
          "sources:\n" +
          "  include:\n" +
          '    - "docs/**"\n' +
          "  exclude:\n" +
          '    - "docs/_partials/**"\n',
      ),
      outputFile: out,
      format: "html",
    });
    expect(named.pages).toBe(2);
    expect(await readFile(out, "utf8")).not.toContain("Fragment under a directory.");
  });

  it("leaves a directory no include pattern can reach out of the bundle", async () => {
    await writeRepository();
    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(dir, "node_modules", "pkg", "readme.md"), "# Vendored\n\nNot ours.\n");
    const configFile = await writeConfig(
      'root: "."\nsources:\n  include:\n    - "README.md"\n    - "docs/**"\n',
    );
    const out = join(dir, "out.html");

    const result = await buildSite({ configFile, outputFile: out, format: "html" });

    expect(result.pages).toBe(3);
    expect(await readFile(out, "utf8")).not.toContain("Not ours.");
  });

  it("selects nothing outside the include patterns", async () => {
    await writeRepository();
    await writeFile(join(dir, "CHANGELOG.md"), "# Changelog\n\nRelease notes.\n");
    const configFile = await writeConfig(
      'root: "."\nsources:\n  include:\n    - "README.md"\n    - "docs/**"\n',
    );
    const out = join(dir, "out.html");

    const result = await buildSite({ configFile, outputFile: out, format: "html" });

    expect(result.pages).toBe(3);
    expect(await readFile(out, "utf8")).not.toContain("Release notes.");
  });
});

describe("a configuration writing neither key", () => {
  it("builds exactly as it did before, with routes relative to the input directory", async () => {
    await writeRepository();
    const out = join(dir, "out.html");

    const result = await buildSite({
      inputDir: join(dir, "docs"),
      outputFile: out,
      format: "html",
    });
    const html = await readFile(out, "utf8");

    expect(result.pages).toBe(2);
    // `docs/index.md` is the root of this document, so its route is `/` — the meaning every
    // existing configuration has and the one `root` defaulting to `input` preserves.
    expect(html).toContain('data-route="/"');
    expect(html).toContain('data-route="/guide"');
    expect(html).not.toContain('data-route="/docs/"');
  });

  it("resolves the root to the input directory", async () => {
    await writeRepository();
    const config = await loadConfig({ inputDir: join(dir, "docs") }, dir);
    expect(config.rootDir).toBe(join(dir, "docs"));
    expect(config.include).toEqual([]);
  });

  it("resolves the root of a single-file input to the directory holding it", async () => {
    await writeRepository();
    const config = await loadConfig({ inputDir: join(dir, "docs", "guide.md") }, dir);
    expect(config.rootDir).toBe(join(dir, "docs"));
  });
});

describe("input and root together", () => {
  it("accepts them when they name the same directory", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "./docs"\ninput: "./docs"\n');

    const config = await loadConfig({ configFile }, dir);

    expect(config.rootDir).toBe(join(dir, "docs"));
    expect(config.inputDir).toBe(join(dir, "docs"));
  });

  it("accepts a single file whose directory is the root", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "./docs"\ninput: "./docs/guide.md"\n');

    const config = await loadConfig({ configFile }, dir);

    expect(config.rootDir).toBe(join(dir, "docs"));
    expect(config.inputDir).toBe(join(dir, "docs", "guide.md"));
  });

  it("refuses an input naming a different directory, rather than merging two roots", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "."\ninput: "./docs"\n');

    await expect(loadConfig({ configFile }, dir)).rejects.toThrow(/input and root/i);
  });

  it("refuses an input outside the root", async () => {
    await writeRepository();
    await mkdir(join(dir, "elsewhere"), { recursive: true });
    // `./elsewhere`, not `../elsewhere`: a path in the configuration is relative to the file
    // holding it, so the second would name a directory beside the temporary tree that does not
    // exist — and a path that does not exist is left to the build to report as missing.
    const configFile = await writeConfig('root: "./docs"\ninput: "./elsewhere"\n');

    await expect(loadConfig({ configFile }, dir)).rejects.toThrow(/input and root/i);
  });

  it("refuses an input given on the command line that disagrees with the configured root", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "."\n');

    await expect(loadConfig({ configFile, inputDir: join(dir, "docs") }, dir)).rejects.toThrow(
      /input and root/i,
    );
  });
});

describe("patterns that cannot mean what they look like", () => {
  /**
   * picomatch combines the patterns of an array with OR, so `["docs/**", "!docs/drafts/**"]`
   * matches everything: the second matches every path outside `docs/drafts`, which is most of
   * them. The pruning reads a pattern's static prefix, and for `!foo/**` that prefix is `foo`, so
   * it would walk exactly the directory the author meant to leave out. Refused rather than
   * misread — `include` selects and `exclude` subtracts, last.
   */
  it("refuses a negated pattern in sources.include", async () => {
    await writeRepository();
    const configFile = await writeConfig(
      'root: "."\nsources:\n  include:\n    - "docs/**"\n    - "!docs/drafts/**"\n',
    );

    await expect(loadConfig({ configFile }, dir)).rejects.toThrow(/negated pattern/i);
  });

  it("refuses a negated pattern in sources.exclude", async () => {
    await writeRepository();
    const configFile = await writeConfig('sources:\n  exclude:\n    - "!drafts/**"\n');

    await expect(loadConfig({ configFile }, dir)).rejects.toThrow(/negated pattern/i);
  });

  it("refuses one written with leading whitespace", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "."\nsources:\n  include:\n    - " !docs/**"\n');

    await expect(loadConfig({ configFile }, dir)).rejects.toThrow(/negated pattern/i);
  });
});

describe("root has to be a directory", () => {
  it("refuses a root naming a file, which would half work", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "./README.md"\n');

    await expect(loadConfig({ configFile }, dir)).rejects.toThrow(/must name a directory/i);
  });

  it("leaves a root that does not exist to the build, which reports it as missing", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "./nowhere"\n');

    const config = await loadConfig({ configFile }, dir);
    expect(config.rootDir).toBe(join(dir, "nowhere"));
    await expect(
      buildSite({ configFile, outputFile: join(dir, "out.html"), format: "html" }),
    ).rejects.toThrow(/not found/i);
  });

  it("reports a missing single-file input as missing rather than as disagreeing with the root", async () => {
    await writeRepository();
    const configFile = await writeConfig('root: "./docs"\ninput: "./docs/missing.md"\n');

    // The path does not exist, so nothing can tell a file from a directory — comparing it would
    // turn a missing file into an argument about roots.
    const config = await loadConfig({ configFile }, dir);
    expect(config.inputDir).toBe(join(dir, "docs", "missing.md"));
    await expect(
      buildSite({ configFile, outputFile: join(dir, "out.html"), format: "html" }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("root without input", () => {
  it("points the build at the root rather than at the default ./docs", async () => {
    await mkdir(join(dir, "pages"), { recursive: true });
    await writeFile(join(dir, "pages", "index.md"), "# Pages\n\nNo docs directory here.\n");
    const configFile = await writeConfig('root: "."\nsources:\n  include:\n    - "pages/**"\n');
    const out = join(dir, "out.html");

    const result = await buildSite({ configFile, outputFile: out, format: "html" });

    expect(result.pages).toBe(1);
    expect(await readFile(out, "utf8")).toContain("No docs directory here.");
  });
});
