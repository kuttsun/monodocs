import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
/** The entries of the difference's own sidebar, the one side by side shows. */
function sidebarEntries(html: string): string[] {
  const start = html.indexOf(
    '<div class="monodocs-diff-sidebar" data-monodocs-diff-sidebar="both"',
  );
  const nav = html.slice(start, html.indexOf('<div class="monodocs-diff-sidebar"', start + 1));
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
    // A deleted page is a page of its own, linked.
    expect(list).toContain('<a href="#//deleted/gone">Gone</a>');
    expect(list).not.toContain("No changes.");
    expect(data.pages[0]!.headings.map((h) => `${h.level} ${h.text}`)).toEqual([
      "2 Added pages",
      "2 Moved pages",
      "2 Changed pages",
      "2 Deleted pages",
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
    // A version that is only whitespace names nothing: the argument names the earlier one.
    await rm(out());
    const blank = await built(
      { ...files, "monodocs.config.yml": "document:\n  version: ' '\n" },
      { ...files, "monodocs.config.yml": "document:\n  version: '2.0'\n" },
    );
    expect(article(blank.html, "//changes")).toContain(">Changes v1 → 2.0</h1>");
    expect(list).toContain("<p>Unchanged pages: 1</p>\n<p>No changes.</p>");
    expect(siteData(html).pages.find((p) => p.route === "/a")?.diff).toBeUndefined();
  });

  it("names the page that took a merged page's route", async () => {
    const { html } = await built(
      { "docs/a.md": "# A\n", "docs/b.md": "# B\n" },
      { "docs/c.md": "---\naliases: [/a, /b]\n---\n\n# C\n" },
    );
    const list = article(html, "//changes");
    expect(list).toContain('<a href="#//deleted/b">B</a> (Merged into: <a href="#/c">C</a>)');
  });

  it.skipIf(process.platform === "win32")(
    "reports a page whose name gives it the list's route as page/duplicate-route",
    async () => {
      await write(then, { "docs/a.md": "# A\n" });
      await write(now, { "docs/a.md": "# A\n", "docs/\\changes.md": "# Changes\n" });
      await expect(
        buildSite({ outputFile: out(), diff: { dir: "../then", label: "v1" } }),
      ).rejects.toMatchObject({ code: "page/duplicate-route" });
    },
  );

  it("avoids the IDs a custom theme's template has", async () => {
    const theme = join(base, "theme");
    const shipped = join(dirname(fileURLToPath(import.meta.url)), "themes", "default");
    await mkdir(theme);
    for (const file of ["style.css", "app.js"]) {
      await writeFile(join(theme, file), await readFile(join(shipped, file)));
    }
    const template = await readFile(join(shipped, "template.html"), "utf8");
    await writeFile(
      join(theme, "template.html"),
      template.replace("<body", "<div id=diff-changes></div><div id='earlier-x'></div><body"),
    );
    const config = { "monodocs.config.yml": `html:\n  theme: ${theme}\n` };
    const { html } = await built(
      { ...config, "docs/a.md": "# A\n" },
      { ...config, "docs/a.md": "# A\n\nNew.\n" },
    );
    expect(html).toContain('<article class="page" data-route="//changes" id="page-diff-changes-x"');
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

describe("the two versions side by side", () => {
  it("writes a changed page as the earlier page beside the new one, pairs and marks in each", async () => {
    const { html } = await built(
      { "docs/a.md": "# A\n\nKeep.\n\nGone.\n\n[Link](b.md)\n", "docs/b.md": "# B\n" },
      { "docs/a.md": "# A\n\nKeep.\n\nNew.\n\n[Link](b.md)\n", "docs/b.md": "# B\n" },
    );
    const page = article(html, "/a");
    const earlier = page.slice(
      page.indexOf('class="monodocs-diff-earlier"'),
      page.indexOf('class="monodocs-diff-current"'),
    );
    const current = page.slice(page.indexOf('class="monodocs-diff-current"'));
    expect(earlier).toContain(
      '<p data-monodocs-diff-block="del"><del data-monodocs-diff="">Gone.</del></p>',
    );
    expect(current).toContain(
      '<p data-monodocs-diff-block="ins"><ins data-monodocs-diff="">New.</ins></p>',
    );
    expect(earlier).toContain('<p data-monodocs-diff-pair="2">Keep.</p>');
    expect(current).toContain('<p data-monodocs-diff-pair="2">Keep.</p>');
    // The earlier column has no address: no ID, no link.
    expect(earlier).not.toMatch(/\sid="/);
    expect(earlier).toContain('<p data-monodocs-diff-pair="3">Link</p>');
    expect(current).toContain('<h1 id="a-a" data-monodocs-diff-pair="1">A</h1>');
    // A page that did not change is not doubled.
    expect(article(html, "/b")).not.toContain("monodocs-diff-columns");
    const all = ids(html);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
  });

  it("writes a sidebar for each view, the earlier one in that version's order and titles", async () => {
    const { html } = await built(
      {
        "docs/a.md": "# A\n",
        "docs/b.md": "# B\n",
        "docs/old.md": "---\ntitle: Old\n---\n\nText.\n",
      },
      {
        "docs/a.md": "# A\n",
        "docs/c.md": "# C\n",
        "docs/new.md": "---\ntitle: New\naliases: [/old]\n---\n\nText.\n",
      },
    );
    const sidebar = (view: string) => {
      const start = html.indexOf(
        `<div class="monodocs-diff-sidebar" data-monodocs-diff-sidebar="${view}"`,
      );
      const end = html.indexOf('<div class="monodocs-diff-sidebar"', start + 1);
      const part = html.slice(start, end === -1 ? html.indexOf("</nav>", start) : end);
      return [...part.matchAll(/data-route="([^"]*)">([^<]*)/g)].map((m) => `${m[1]} ${m[2]}`);
    };
    expect(sidebar("both")).toEqual([
      "//changes Changes v1",
      "/a A",
      "//deleted/b B",
      "/c C",
      "/new New",
    ]);
    // Neither version's own lists the list of changes, which is the side-by-side view's.
    expect(sidebar("current")).toEqual(["/a A", "/c C", "/new New"]);
    // The earlier version's: its titles, its order, the deleted page's own, a moved page's new route.
    expect(sidebar("earlier")).toEqual(["/a A", "//deleted/b B", "/new Old"]);
  });

  it("makes a deleted page a page of its own where it stood in the earlier sidebar", async () => {
    const { html } = await built(
      { "docs/a.md": "# A\n", "docs/b.md": "# B\n\nText.\n", "docs/c.md": "# C\n" },
      { "docs/a.md": "# A\n", "docs/c.md": "# C\n" },
    );
    expect(sidebarEntries(html).map((entry) => entry.split(" ")[0])).toEqual([
      "//changes",
      "/a",
      "//deleted/b",
      "/c",
    ]);
    expect(html).toContain(
      '<li class="sidebar-page" data-monodocs-diff-page="deleted"><a href="#//deleted/b" data-route="//deleted/b">B<span class="monodocs-diff-mark" aria-hidden="true">−</span><span class="monodocs-diff-label">Deleted</span></a></li>',
    );
    const page = article(html, "//deleted/b");
    expect(page).toContain('data-monodocs-diff-page="deleted"');
    expect(page).toContain("<p>Text.</p>");
    expect(page).toContain('<div class="monodocs-diff-note"><p>This page was deleted.</p></div>');
    expect(siteData(html).pages.find((p) => p.route === "//deleted/b")).toMatchObject({
      hidden: true,
      diff: "deleted",
      title: "B",
    });
  });

  it.skipIf(process.platform === "win32")(
    "reports a page whose name gives it a deleted page's route as page/duplicate-route",
    async () => {
      await write(then, { "docs/a.md": "# A\n", "docs/b.md": "# B\n" });
      await write(now, { "docs/a.md": "# A\n", "docs/\\deleted\\b.md": "# X\n" });
      await expect(
        buildSite({ outputFile: out(), diff: { dir: "../then", label: "v1" } }),
      ).rejects.toMatchObject({ code: "page/duplicate-route" });
    },
  );

  it("brings the bar and its script with a difference, and neither without one", async () => {
    const { html } = await built({ "docs/a.md": "# A\n" }, { "docs/a.md": "# A\n\nNew.\n" });
    expect(html).toContain('<div class="monodocs-diff-bar" role="toolbar"');
    expect(html).toContain(
      'data-monodocs-diff-view="both" aria-pressed="true" title="Show the difference with the two versions side by side">Side by side</button>',
    );
    expect(html).toContain("data-monodocs-diff-pair");
    expect(html).toMatch(/<script>\(function \(\) \{\n {2}var root = document\.documentElement;/);
    await buildSite({ outputFile: out() });
    const plain = await readFile(out(), "utf8");
    expect(plain).not.toContain("monodocs-diff");
  });
});

describe("a moved page whose title changed", () => {
  it("is listed with its earlier title", async () => {
    const { html } = await built(
      { "docs/old.md": "---\ntitle: Before\n---\n\nText.\n" },
      { "docs/new.md": "---\ntitle: After\naliases: [/old]\n---\n\nText.\n" },
    );
    expect(article(html, "//changes")).toContain(
      '<a href="#/new">After</a> (<code>/old</code> → <code>/new</code>) (The title changed. Its earlier title: Before)',
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
    expect(html).toContain('<li class="sidebar-page" data-monodocs-diff-page="added">');
    expect(html).toContain(
      '<span class="monodocs-diff-mark" aria-hidden="true">+</span><span class="monodocs-diff-label">Added</span>',
    );
    // An added page: its note in the earlier column, beside the page.
    expect(article(html, "/zadded")).toMatch(
      /data-monodocs-diff-page="added">\n<div class="monodocs-diff-columns"><div class="monodocs-diff-earlier">\n<p class="monodocs-diff-column-title">Earlier version <span class="monodocs-diff-version">v1<\/span><\/p>\n<div class="monodocs-diff-note"><p>This page was added.<\/p><\/div>/,
    );
    expect(article(html, "/moved")).toContain(
      'data-monodocs-diff-page="moved">\n<div class="monodocs-diff-note"><p>This page moved. Its earlier route: <code>/moved-old</code></p></div>',
    );
    expect(article(html, "/changed")).toContain(
      'data-monodocs-diff-page="changed">\n<div class="monodocs-diff-columns">',
    );
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
      [
        ...html
          // The body alone: the sidebar shows them once a view, and the script spells the markup.
          .slice(html.indexOf('<main id="content"'), html.indexOf("</main>"))
          .matchAll(/<span class="section-number"[^>]*>([^<]*)<\/span> ([^<]*)/g),
      ]
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
    // Moved to another path, the same image is still one file.
    await rm(out());
    const moved = await built(
      { "docs/dot.png": png, "docs/a.md": "# A\n\n![dot](dot.png)\n" },
      { "docs/img/dot.png": png, "docs/a.md": "# A\n\n![dot](img/dot.png)\n" },
    );
    expect(moved.result.sizes[0]!.breakdown!.images.files).toBe(1);
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
  it("brings the runtime for an earlier diagram in a table cell", async () => {
    const cell = "= A\n\n|===\na|\n[source,mermaid]\n----\ngraph TD\n  A-->B\n----\n|===\n";
    const { html } = await built({ "docs/a.adoc": cell }, { "docs/a.adoc": "= A\n\nText.\n" });
    expect(html).toMatch(/mermaid[\s\S]*\.run\(/);
  });

  it("brings the runtime for a deleted diagram when the new version has none", async () => {
    const { html } = await built(
      { "docs/a.md": "# A\n\n```mermaid\ngraph TD\n  A-->B\n```\n" },
      { "docs/a.md": "# A\n" },
    );
    expect(html).toContain('<del data-monodocs-diff=""><pre class="mermaid"');
    expect(html).toMatch(/mermaid[\s\S]*\.run\(/);
  });
});
