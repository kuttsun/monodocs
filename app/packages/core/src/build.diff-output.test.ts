import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build";
import { changesPageId, changesTitle } from "./diff/changes";
import { sizeReportLines } from "./pipeline/outputSize";
import type { BuildResult } from "./types";

/**
 * The document a difference is read in (roadmap 7.3.4): the list of changes as its first page, the
 * pages' states and notes, the sidebar's marks, the labels, `siteDataJson`, and the size report.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-output-"));
  now = join(base, "now");
  then = join(base, "then");
  for (const root of [now, then]) await mkdir(join(root, "docs"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(now);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

type Files = Record<string, string | Buffer>;

async function write(root: string, files: Files): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

const out = () => join(base, "out.html");

/** The output of a build with a difference, and its result. */
async function built(
  earlier: Files,
  current: Files,
  options: { label?: string } = {},
): Promise<{ html: string; result: BuildResult }> {
  await write(then, earlier);
  await write(now, current);
  const result = await buildSite({
    outputFile: out(),
    diff: { dir: "../then", label: options.label ?? "v1" },
  });
  return { html: await readFile(out(), "utf8"), result };
}

type SiteData = {
  initialRoute: string;
  labels: Record<string, string>;
  pages: {
    route: string;
    title: string;
    hidden: boolean;
    diff?: string;
    number?: string;
    headings: { text: string; level: number }[];
  }[];
};

function siteData(html: string): SiteData {
  const json =
    /<script[^>]*id="monodocs-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1] ??
    /window\.__MONODOCS_DATA__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(html)?.[1];
  return JSON.parse(json!.replace(/\\u003c/g, "<")) as SiteData;
}

/** An article's HTML, by route. */
function article(html: string, route: string): string {
  const start = html.indexOf(`<article class="page" data-route="${route}"`);
  return html.slice(start, html.indexOf("</article>", start));
}

/** The sidebar entries, as their text, in order. */
function sidebarEntries(html: string): string[] {
  const nav = html.slice(
    html.indexOf('<nav id="sidebar-nav"'),
    html.indexOf("</nav>", html.indexOf('<nav id="sidebar-nav"')),
  );
  return [...nav.matchAll(/<a href="[^"]*" data-route="([^"]*)">([\s\S]*?)<\/a>/g)].map(
    (m) => `${m[1]} ${m[2]!.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|")}`,
  );
}

const parser = unified().use(rehypeParse);

function ids(html: string): string[] {
  const out: string[] = [];
  visit(parser.parse(html), "element", (node) => {
    if (typeof node.properties.id === "string") out.push(node.properties.id);
  });
  return out;
}

describe("the list of changes", () => {
  it("is the first page, opens the document, and lists each kind of change in sidebar order", async () => {
    const { html } = await built(
      {
        "docs/same.md": "# Same\n\nText.\n",
        "docs/changed.md": "# Changed\n\nOld.\n\nKeep.\n",
        "docs/gone.md": "# Gone\n\nGone text.\n",
        "docs/old-place.md": "# Moved\n\nText.\n",
        "docs/retitled.md": "---\ntitle: Old title\n---\n\nText.\n",
      },
      {
        "docs/same.md": "# Same\n\nText.\n",
        "docs/changed.md": "# Changed\n\nNew.\n\nKeep.\n\nMore.\n",
        "docs/new-place.md": "---\naliases: [/old-place]\n---\n\n# Moved\n\nText.\n",
        "docs/retitled.md": "---\ntitle: New title\n---\n\nText.\n",
        "docs/added.md": "# Added\n\nText.\n",
      },
    );
    const data = siteData(html);
    expect(data.initialRoute).toBe("//changes");
    expect(data.pages[0]).toMatchObject({ route: "//changes", title: "Changes v1", hidden: true });
    const list = article(html, "//changes");
    expect(list).toContain('<h1 id="diff-changes">Changes v1</h1>');
    const order = [
      "Added pages",
      "Moved pages",
      "Changed pages",
      "Deleted pages",
      "Unchanged pages: 1",
    ];
    for (let i = 1; i < order.length; i++) {
      expect(list.indexOf(order[i - 1]!)).toBeLessThan(list.indexOf(order[i]!));
    }
    expect(list).toContain('<a href="#/added">Added</a>');
    expect(list).toContain(
      '<a href="#/new-place">Moved</a> (<code>/old-place</code> → <code>/new-place</code>)',
    );
    expect(list).toContain('<a href="#/changed">Changed</a> — Added 2 / Deleted 1');
    expect(list).toContain(
      '<a href="#/retitled">New title</a> (The title changed. Its earlier title: Old title) — Added 0 / Deleted 0',
    );
    // A deleted page under its title, its blocks marked deleted.
    expect(list).toMatch(
      /<h3 id="diff-changes-deleted-1">Gone<\/h3>\n<h1 data-monodocs-diff-block="del">/,
    );
    expect(list).toContain(
      '<p data-monodocs-diff-block="del"><del data-monodocs-diff="">Gone text.</del></p>',
    );
    expect(list).not.toContain("No changes.");
    // Its table of contents reads the sections in order, each deleted page under its own.
    expect(data.pages[0]!.headings.map((h) => `${h.level} ${h.text}`)).toEqual([
      "2 Added pages",
      "2 Moved pages",
      "2 Changed pages",
      "2 Deleted pages",
      "3 Gone",
    ]);
  });

  it("says when nothing changed, and names both versions in its title", async () => {
    const files = { "docs/a.md": "# A\n\nText.\n" };
    const { html } = await built(
      { ...files, "monodocs.config.yml": "document:\n  version: '1.0'\n" },
      { ...files, "monodocs.config.yml": "document:\n  version: '2.0'\n" },
    );
    const list = article(html, "//changes");
    expect(list).toContain(">Changes 1.0 → 2.0</h1>");
    expect(list).toContain("<p>Unchanged pages: 1</p>\n<p>No changes.</p>");
    expect(siteData(html).pages.find((p) => p.route === "/a")?.diff).toBeUndefined();
  });

  it("names the page that took a merged page's route", async () => {
    const { html } = await built(
      { "docs/a.md": "# A\n", "docs/b.md": "# B\n" },
      { "docs/c.md": "---\naliases: [/a, /b]\n---\n\n# C\n" },
    );
    const list = article(html, "//changes");
    expect(list).toContain('<p>Merged into <a href="#/c">C</a></p>');
  });

  it("takes its title from the label and whichever version has a name", () => {
    expect(changesTitle("Changes", { from: "1.0", to: "2.0" })).toBe("Changes 1.0 → 2.0");
    expect(changesTitle("Changes", { from: "v1" })).toBe("Changes v1");
    expect(changesTitle("Changes", { to: "2.0" })).toBe("Changes 2.0");
    expect(changesTitle("Changes", {})).toBe("Changes");
  });

  it("gets a page ID no page has and no element ID starts with", async () => {
    expect(changesPageId(["a"], ["a-x"])).toBe("diff-changes");
    expect(changesPageId(["diff-changes"], [])).toBe("diff-changes-x");
    expect(changesPageId([], ["diff-changes-x"])).toBe("diff-changes-x-x");
    expect(changesPageId([], ["page-diff-changes"])).toBe("diff-changes-x");
    const { html } = await built(
      {
        "docs/diff-changes.md": "# Diff changes\n\n## X\n",
        "docs/b.md": "# B\n\n## Diff changes\n",
      },
      {
        "docs/diff-changes.md": "# Diff changes\n\n## X\n",
        "docs/b.md": "# B\n\n## Diff changes\n\nNew.\n",
      },
    );
    const all = ids(html);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
    expect(html).toContain(
      '<article class="page" data-route="//changes" id="page-diff-changes-x-x"',
    );
  });
});

describe("pages and the sidebar carry their state", () => {
  it("marks an added, a moved, and a changed page, and puts the list first and unnumbered", async () => {
    const config = { "monodocs.config.yml": "numbering:\n  sections: 3\n" };
    const { html } = await built(
      {
        ...config,
        "docs/changed.md": "# Changed\n\nOld.\n",
        "docs/moved-old.md": "# Moved\n\nText.\n",
      },
      {
        ...config,
        "docs/changed.md": "# Changed\n\nNew.\n",
        "docs/moved.md": "---\naliases: [/moved-old]\n---\n\n# Moved\n\nText.\n",
        "docs/zadded.md": "# Added\n",
      },
    );
    expect(sidebarEntries(html)).toEqual([
      "//changes Changes v1",
      "/changed |1| Changed|•|Changed|",
      "/moved |2| Moved|→|Moved|",
      "/zadded |3| Added|+|Added|",
    ]);
    expect(html).toContain(
      '<span class="monodocs-diff-mark" aria-hidden="true">+</span><span class="monodocs-diff-label">Added</span>',
    );
    expect(article(html, "/zadded")).toContain(
      'data-monodocs-diff-page="added">\n<div class="monodocs-diff-note"><p>This page was added.</p></div>',
    );
    expect(article(html, "/moved")).toContain(
      'data-monodocs-diff-page="moved">\n<div class="monodocs-diff-note"><p>This page moved. Its earlier route: <code>/moved-old</code></p></div>',
    );
    expect(article(html, "/changed")).toContain('data-monodocs-diff-page="changed">\n<h1');
    const data = siteData(html);
    expect(data.pages.map((p) => [p.route, p.diff ?? "", p.number ?? ""])).toEqual([
      ["//changes", "", ""],
      ["/changed", "changed", "1"],
      ["/moved", "moved", "2"],
      ["/zadded", "added", "3"],
    ]);
  });

  it("keeps every number what the same page gets in a build without a difference", async () => {
    const config = { "monodocs.config.yml": "numbering:\n  sections: 3\n" };
    const files = {
      ...config,
      "docs/01-a.md": "# A\n\n## One\n\n## Two\n",
      "docs/02-b.md": "# B\n\n## Three\n",
    };
    await write(now, files);
    await buildSite({ outputFile: out() });
    const plain = await readFile(out(), "utf8");
    const numbers = (html: string) =>
      [...html.matchAll(/<span class="section-number"[^>]*>([^<]*)<\/span> ([^<]*)/g)]
        .map((m) => `${m[1]} ${m[2]}`)
        .filter((line) => !line.endsWith(" "));
    const { html } = await built(
      {
        ...config,
        "docs/01-a.md": "# A\n\n## Gone\n\n## One\n\n## Two\n",
        "docs/02-b.md": "# B\n\n## Three\n",
      },
      files,
    );
    expect(numbers(html)).toEqual(numbers(plain));
  });
});

describe("labels", () => {
  it("follow lang and html.labels, and join siteDataJson only with a difference", async () => {
    const config = {
      "monodocs.config.yml": "lang: ja\nhtml:\n  labels:\n    diffChanges: 改訂の一覧\n",
    };
    const { html } = await built(
      { ...config, "docs/a.md": "# A\n" },
      { ...config, "docs/a.md": "# A\n\nNew.\n" },
    );
    expect(article(html, "//changes")).toContain(">改訂の一覧 v1</h1>");
    expect(html).toContain("変更されたページ");
    expect(siteData(html).labels).toMatchObject({
      diffChanges: "改訂の一覧",
      diffNext: "次の変更",
    });

    // Without a difference, the same configuration writes what a build without the label writes.
    await buildSite({ outputFile: out() });
    const withLabel = await readFile(out(), "utf8");
    await writeFile(join(now, "monodocs.config.yml"), "lang: ja\n");
    await buildSite({ outputFile: out() });
    expect(withLabel).toBe(await readFile(out(), "utf8"));
    expect(Object.keys(siteData(withLabel).labels).some((key) => key.startsWith("diff"))).toBe(
      false,
    );
  });

  it("refuses a key no table has, as before", async () => {
    await write(now, {
      "docs/a.md": "# A\n",
      "monodocs.config.yml": "html:\n  labels:\n    diffChangez: x\n",
    });
    await expect(buildSite({ outputFile: out() })).rejects.toMatchObject({
      code: "config/invalid",
    });
  });
});

describe("the same input gives the same bytes", () => {
  it("gives the same HTML for the same two versions", async () => {
    const earlier = { "docs/a.md": "# A\n\nOld.\n", "docs/b.md": "# B\n" };
    const current = { "docs/a.md": "# A\n\nNew.\n", "docs/c.md": "# C\n" };
    const first = (await built(earlier, current)).html;
    await rm(out());
    const second = (await built(earlier, current)).html;
    expect(second).toBe(first);
  });
});

describe("the size report", () => {
  it("adds a difference line, and its lines add up to the file", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const { result } = await built(
      {
        "docs/dot.png": png,
        "docs/a.md": "# A\n\n![dot](dot.png)\n\nGone.\n",
        "docs/b.md": "# B\n\nGone.\n",
      },
      { "docs/dot.png": png, "docs/a.md": "# A\n\n![dot](dot.png)\n", "docs/b.md": "# B\n" },
    );
    const size = result.sizes[0]!;
    const parts = size.breakdown!;
    expect(size.bytes).toBe((await stat(out())).size);
    expect(
      parts.images.bytes + parts.mermaid + parts.pageData + parts.difference! + parts.document,
    ).toBe(size.bytes);
    // The image is in both versions and in the new one once: counted once, under images.
    expect(parts.images.files).toBe(1);
    expect(parts.difference).toBeGreaterThan(0);
    expect(sizeReportLines(result.sizes).some((line) => line.trim().startsWith("difference"))).toBe(
      true,
    );
  });

  it("has no difference line without a difference", async () => {
    await write(now, { "docs/a.md": "# A\n" });
    const result = await buildSite({ outputFile: out() });
    expect(result.sizes[0]!.breakdown!.difference).toBeUndefined();
    expect(sizeReportLines(result.sizes).some((line) => line.includes("difference"))).toBe(false);
  });
});

describe("diagrams", () => {
  it("brings the runtime for a deleted diagram when the new version has none", async () => {
    const { html } = await built(
      { "docs/a.md": "# A\n\n```mermaid\ngraph TD\n  A-->B\n```\n" },
      { "docs/a.md": "# A\n" },
    );
    expect(html).toContain('<del data-monodocs-diff=""><pre class="mermaid"');
    expect(html).toMatch(/mermaid[\s\S]*\.run\(/);
  });
});
