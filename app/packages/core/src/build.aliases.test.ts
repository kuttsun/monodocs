import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";
import { toAliasRoute } from "./route";

/**
 * A hash route is a link a reader can copy, and in a document that travels as a single file it is
 * the only way one person tells another where to look. It therefore outlives the file, sitting in a
 * chat log or a ticket, and renaming the page behind it breaks every copy silently (roadmap.md
 * 15.5). An alias is an old route the page still answers to.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-aliases-"));
  await mkdir(join(dir, "guide"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function build(): Promise<string> {
  const out = join(dir, "out.html");
  await buildSite({ inputDir: dir, outputFile: out, format: "html" });
  return readFile(out, "utf8");
}

/** The alias table as the client receives it, read back out of the delivered document. */
function aliasTable(html: string): Record<string, string> {
  const match = html.match(/window\.__MONODOCS_DATA__\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error("site data not found in the output");
  return (JSON.parse(match[1]) as { aliases?: Record<string, string> }).aliases ?? {};
}

describe("normalising an alias", () => {
  it("reduces the spellings of one route to one alias", () => {
    expect(toAliasRoute("/setup/install")).toBe("/setup/install");
    expect(toAliasRoute("setup/install")).toBe("/setup/install");
    expect(toAliasRoute("setup/install.md")).toBe("/setup/install");
    expect(toAliasRoute("setup/install.adoc")).toBe("/setup/install");
    expect(toAliasRoute("/setup/")).toBe("/setup");
    expect(toAliasRoute("setup/index.md")).toBe("/setup");
    expect(toAliasRoute("index.md")).toBe("/");
    expect(toAliasRoute("/")).toBe("/");
    expect(toAliasRoute("  /setup/install  ")).toBe("/setup/install");
  });

  /**
   * An alias is usually a route rather than a path, and a route can end in something that looks
   * like an extension: `/v1.2` is the route of `v1.2.md`. Stripping whatever `extname` finds would
   * turn it into `/v1` — an alias pointing at a page that does not exist, colliding with whatever
   * `/v1.3` normalised to.
   */
  it("strips a source extension and not whatever looks like one", () => {
    expect(toAliasRoute("/v1.2")).toBe("/v1.2");
    expect(toAliasRoute("/v1.3")).toBe("/v1.3");
    expect(toAliasRoute("v1.2.md")).toBe("/v1.2");
    expect(toAliasRoute("/release-2024.10")).toBe("/release-2024.10");
    // The configured set decides, so a document using custom extensions is normalised by them.
    expect(toAliasRoute("/page.txt", [".txt"])).toBe("/page");
    expect(toAliasRoute("/page.md", [".txt"])).toBe("/page.md");
  });
});

describe("a route that itself contains a dot", () => {
  it("can be reached through an alias, and the two do not collide", async () => {
    await writeFile(join(dir, "index.md"), "# Home\n");
    await writeFile(
      join(dir, "guide", "current.md"),
      "---\ntitle: Current\naliases:\n  - /v1.2\n  - /v1.3\n---\n\n# Current\n",
    );

    expect(aliasTable(await build())).toEqual({
      "/v1.2": "/guide/current",
      "/v1.3": "/guide/current",
    });
  });
});

describe("declaring an alias", () => {
  it("reads a frontmatter list in Markdown", async () => {
    await writeFile(
      join(dir, "guide", "install.md"),
      "---\ntitle: Installation\naliases:\n  - /setup/install\n  - /getting-started/install\n---\n\n# Installation\n",
    );

    expect(aliasTable(await build())).toEqual({
      "/setup/install": "/guide/install",
      "/getting-started/install": "/guide/install",
    });
  });

  it("reads a comma-separated :sd-aliases: in AsciiDoc", async () => {
    await writeFile(
      join(dir, "guide", "install.adoc"),
      "= Installation\n:sd-aliases: /setup/install, /getting-started/install\n\nBody.\n",
    );

    expect(aliasTable(await build())).toEqual({
      "/setup/install": "/guide/install",
      "/getting-started/install": "/guide/install",
    });
  });

  it("normalises what the author wrote before publishing the table", async () => {
    await writeFile(
      join(dir, "guide", "install.md"),
      "---\ntitle: Installation\naliases:\n  - setup/install.md\n  - /old/\n---\n\n# Installation\n",
    );

    expect(aliasTable(await build())).toEqual({
      "/setup/install": "/guide/install",
      "/old": "/guide/install",
    });
  });

  it("keeps the aliases of a hidden page, because a link someone holds is not navigation", async () => {
    await writeFile(join(dir, "index.md"), "# Home\n");
    await writeFile(
      join(dir, "guide", "old.md"),
      "---\ntitle: Old\nhidden: true\naliases:\n  - /archive/old\n---\n\n# Old\n",
    );

    expect(aliasTable(await build())).toEqual({ "/archive/old": "/guide/old" });
  });

  it("publishes an empty table when no page declares one", async () => {
    await writeFile(join(dir, "index.md"), "# Home\n");

    expect(aliasTable(await build())).toEqual({});
  });
});

describe("what an alias is not", () => {
  it("reaches neither the sidebar nor the previous/next order nor the search index", async () => {
    await writeFile(join(dir, "index.md"), "# Home\n");
    await writeFile(
      join(dir, "guide", "install.md"),
      "---\ntitle: Installation\naliases:\n  - /setup/install\n---\n\n# Installation\n",
    );

    const html = await build();
    const match = html.match(/window\.__MONODOCS_DATA__\s*=\s*(\{[\s\S]*?\});/);
    const data = JSON.parse(match![1]) as { pages: { route: string }[] };

    // The sidebar and the client's page list are built from pages, and an alias is not a page.
    expect(data.pages.map((p) => p.route).sort()).toEqual(["/", "/guide/install"]);
    expect(html).not.toContain('data-route="/setup/install"');
    expect(html).not.toContain('<article class="page" data-route="/setup/install"');
  });
});

describe("collisions", () => {
  it("lets a real route win over an alias, and says so", async () => {
    await writeFile(join(dir, "index.md"), "# Home\n");
    await writeFile(join(dir, "guide", "install.md"), "# Installation\n");
    await writeFile(
      join(dir, "guide", "setup.md"),
      "---\ntitle: Setup\naliases:\n  - /guide/install\n---\n\n# Setup\n",
    );

    const result = await validateSite({ inputDir: dir });
    const shadowed = result.diagnostics.filter((d) => d.code === "page/alias-shadowed");

    expect(shadowed).toHaveLength(1);
    expect(shadowed[0].severity).toBe("warning");
    expect(shadowed[0].message).toContain("/guide/install");
    // Dropped rather than published, so the table cannot send a reader away from a real page.
    expect(aliasTable(await build())).toEqual({});
  });

  it("refuses two pages claiming one alias", async () => {
    await writeFile(join(dir, "guide", "a.md"), "---\ntitle: A\naliases:\n  - /old\n---\n\n# A\n");
    await writeFile(join(dir, "guide", "b.md"), "---\ntitle: B\naliases:\n  - /old\n---\n\n# B\n");

    await expect(buildSite({ inputDir: dir, outputFile: join(dir, "out.html") })).rejects.toThrow(
      /Alias collision/i,
    );
  });

  it("refuses them whatever spelling each one used", async () => {
    await writeFile(
      join(dir, "guide", "a.md"),
      "---\ntitle: A\naliases:\n  - /old/page\n---\n\n# A\n",
    );
    await writeFile(
      join(dir, "guide", "b.md"),
      "---\ntitle: B\naliases:\n  - old/page.md\n---\n\n# B\n",
    );

    await expect(buildSite({ inputDir: dir, outputFile: join(dir, "out.html") })).rejects.toThrow(
      /Alias collision/i,
    );
  });

  /**
   * Shadowing is decided first, so once both are dropped there is nothing left to be ambiguous
   * about. Reporting an error for a pair that has no effect would be noise.
   */
  it("warns twice rather than failing when both claims are shadowed by a real route", async () => {
    await writeFile(join(dir, "index.md"), "# Home\n");
    await writeFile(join(dir, "guide", "a.md"), "---\ntitle: A\naliases:\n  - /\n---\n\n# A\n");
    await writeFile(
      join(dir, "guide", "b.md"),
      "---\ntitle: B\naliases:\n  - index.md\n---\n\n# B\n",
    );

    const result = await validateSite({ inputDir: dir });

    expect(result.diagnostics.filter((d) => d.code === "page/alias-shadowed")).toHaveLength(2);
    expect(aliasTable(await build())).toEqual({});
  });

  it("does not mind one page listing the same alias twice", async () => {
    await writeFile(
      join(dir, "guide", "a.md"),
      "---\ntitle: A\naliases:\n  - /old\n  - old\n---\n\n# A\n",
    );

    expect(aliasTable(await build())).toEqual({ "/old": "/guide/a" });
  });
});
