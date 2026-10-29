import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Element } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite, type BuildInternals } from "./build";
import type { BlockEdit, PageComparison } from "./diff/compare";
import type { Page } from "./types";

/**
 * v0.18 criteria the other diff tests left open (roadmap 7.3.x): images the build does not read,
 * nested list items, an AsciiDoc heading's level, where and when the earlier version was built, a
 * numbering that changed between the versions, a build without a difference, and the numbers a
 * difference shows.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-criteria-"));
  now = join(base, "now");
  then = join(base, "then");
  for (const root of [now, then]) await mkdir(join(root, "docs"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(now);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

/** The comparison of the earlier version at `dir` with the new one, as both stand on disk. */
async function compared(
  dir = "../then",
  internals: BuildInternals = {},
): Promise<PageComparison[]> {
  let result: PageComparison[] | undefined;
  await expect(
    buildSite(
      { outputFile: out(), diff: { dir, label: "v1" } },
      { ...internals, onCompared: (pages) => (result = pages) },
    ),
  ).resolves.toBeDefined();
  return result!;
}

/** Each page as `route state`, a matched one `changed` or `same`. */
function states(pages: PageComparison[]): string[] {
  return pages
    .map((p) =>
      p.state === "matched"
        ? `${p.new.route} ${p.changed ? "changed" : "same"}`
        : p.state === "added"
          ? `+${p.new.route}`
          : `-${p.old.route}`,
    )
    .sort();
}

/** A page's edits that are not `equal`, as `-kind text` / `+kind text`. */
function changes(page: PageComparison | undefined): string[] {
  return (page?.edits ?? [])
    .filter((edit: BlockEdit) => edit.op !== "equal")
    .map((edit) =>
      edit.op === "delete"
        ? `-${edit.old.kind} ${edit.old.key}`
        : edit.op === "insert"
          ? `+${edit.new.kind} ${edit.new.key}`
          : "",
    );
}

/** The comparison of one page, both versions of it written as `earlier` and `current`. */
async function onePage(path: string, earlier: string, current: string, config: Files = {}) {
  await write(then, { [path]: earlier, ...config });
  await write(now, { [path]: current, ...config });
  const relative = path.replace(/^docs\//, "");
  return (await compared()).find((p) => p.state === "matched" && p.new.relativePath === relative)!;
}

/** The new version's pages with the difference written into one column, by route. */
async function writtenInline(): Promise<Map<string, string>> {
  let pages: Page[] = [];
  await buildSite(
    { outputFile: out(), diff: { dir: "../then", label: "v1" } },
    { writeInline: true, onWritten: (written) => (pages = written) },
  );
  return new Map(pages.map((page) => [page.route, page.html]));
}

const parser = unified().use(rehypeParse, { fragment: true });

function textOf(node: Element): string {
  let text = "";
  visit(node, "text", (t) => void (text += t.value));
  return text.replace(/\s+/g, " ").trim();
}

/** The marked blocks of a page, as `+tag text` and `-tag text`, in order. */
function marks(html: string): string[] {
  const found: string[] = [];
  visit(parser.parse(html), "element", (node) => {
    const mark = node.properties.dataMonodocsDiffBlock;
    if (mark !== undefined)
      found.push(`${mark === "ins" ? "+" : "-"}${node.tagName} ${textOf(node)}`);
  });
  return found;
}

describe("an image the build does not read (item 6)", () => {
  const pages: Files = {
    "docs/a.md": "# A\n\n![o](../outside/o.png) ![m](missing.png)\n\nText.\n",
    "docs/b.adoc": "= B\n\nimage::../outside/o.png[o]\n\nSee image:missing.png[m] here.\n",
  };

  it("is no difference outside the root or missing, with --diff-from-dir", async () => {
    // Both versions on disk, each with the image outside its root, the same bytes in both.
    for (const root of [now, then]) await write(root, { ...pages, "outside/o.png": "OUT" });
    expect(states(await compared())).toEqual(["/a same", "/b same"]);
  });

  it("is no difference where the earlier version lacks the image outside its root, as --diff-from leaves it", async () => {
    // `--diff-from` writes out only the earlier root and configuration (gitVersion.ts), so the
    // image outside the root is in the new version alone; program.diff.test.ts runs it from git.
    await write(now, { ...pages, "outside/o.png": "OUT" });
    await write(then, pages);
    expect(states(await compared())).toEqual(["/a same", "/b same"]);
  });
});

describe("a nested list item (item 8)", () => {
  it("leaves its parent unmarked when it is added, and when it is deleted", async () => {
    const flat = "# B\n\n- one\n- two\n";
    const nested = "# B\n\n- one\n  - inner\n- two\n";
    expect(changes(await onePage("docs/b.md", flat, nested))).toEqual(["+li inner"]);
    const added = [...(await writtenInline()).values()].find((html) => html.includes("inner"))!;
    expect(marks(added)).toEqual(["+li inner"]);

    await write(then, { "docs/b.md": nested });
    await write(now, { "docs/b.md": flat });
    const deleted = [...(await writtenInline()).values()].find((html) => html.includes("inner"))!;
    expect(marks(deleted)).toEqual(["-li inner"]);
  });
});

describe("an AsciiDoc heading's level (item 10)", () => {
  it("changes that heading alone", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.adoc",
          "= A\n\n== One\n\nFirst.\n\n== Two\n\nSecond.\n",
          "= A\n\n== One\n\nFirst.\n\n=== Two\n\nSecond.\n",
        ),
      ),
    ).toEqual(["-h2 Two", "+h3 Two"]);
  });
});

describe("where and when the earlier version was built (item 26)", () => {
  /** A page reading through `{docdir}`, and its include and image, relative and through it. */
  const located = (word: string): Files => ({
    "docs/guide.adoc": [
      "= Guide",
      "",
      "Here: {docdir}",
      "",
      "include::_part.adoc[]",
      "",
      "include::{docdir}/_located.adoc[]",
      "",
      "image::i.png[Relative]",
      "",
      "image::{docdir}/j.png[Located]",
      "",
      "Last line.",
      "",
    ].join("\n"),
    "docs/_part.adoc": "Included relatively.\n",
    "docs/_located.adoc": `Included through docdir${word}.\n`,
    "docs/i.png": "PNG",
    "docs/j.png": "PNG",
  });

  it("is no difference for an unchanged page using {docdir}, its includes and images read from the earlier version", async () => {
    await write(now, located(""));
    await write(then, located(""));
    expect(states(await compared())).toEqual(["/guide same"]);
  });

  it("reads the include written with {docdir} from the earlier version, dropping no line", async () => {
    // Only the earlier version's included file differs: the one change is that paragraph, so the
    // earlier build read its own file through `{docdir}` and kept every other line.
    await write(now, located(""));
    await write(then, located(" then"));
    const page = (await compared()).find((p) => p.state === "matched")!;
    expect(changes(page)).toEqual([
      "-p Included through docdir then.",
      "+p Included through docdir.",
    ]);
  });

  it("gives the same bytes for two builds of the same version at two places", async () => {
    // Two extractions of one ref land in two temporary directories; a real `--diff-from` twice is
    // in program.diff.test.ts.
    await write(now, { ...located(""), "docs/other.md": "# Other\n\nNew.\n" });
    await write(then, { ...located(" then"), "docs/other.md": "# Other\n\nOld.\n" });
    await cp(then, `${then}2`, { recursive: true });
    const bytes: Buffer[] = [];
    for (const dir of ["../then", "../then2"]) {
      await buildSite({ outputFile: out(), diff: { dir, label: "v1" } });
      bytes.push(await readFile(out()));
    }
    expect(bytes[0]!.includes("Included through docdir then.")).toBe(true);
    expect(bytes[1]!.equals(bytes[0]!)).toBe(true);
  });

  /**
   * Fake only `Date`, and move it on an hour every millisecond of real time, so that each read of
   * the clock during a build — the new one's, then the earlier one's — gives another hour.
   */
  function racingClock(): () => void {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2001, 5, 15, 12)) });
    const timer = setInterval(() => vi.setSystemTime(Date.now() + 3_600_000), 1);
    return () => clearInterval(timer);
  }

  const timed: Files = {
    "docs/time.adoc": "= Time\n\n{docdate} {doctime} {localdate} {localtime} {docyear}\n",
  };

  it("is no difference for an unchanged page using {doctime} and {localtime}", async () => {
    await write(now, timed);
    await write(then, timed);
    const stop = racingClock();
    try {
      expect(states(await compared())).toEqual(["/time same"]);
    } finally {
      stop();
    }
  });

  it("gives the same bytes for two builds with a difference when SOURCE_DATE_EPOCH is set", async () => {
    await write(now, { ...timed, "docs/other.md": "# Other\n\nNew.\n" });
    await write(then, { ...timed, "docs/other.md": "# Other\n\nOld.\n" });
    const twice = async (): Promise<Buffer[]> => {
      const stop = racingClock();
      try {
        const bytes: Buffer[] = [];
        for (let i = 0; i < 2; i++) {
          await buildSite({ outputFile: out(), diff: { dir: "../then", label: "v1" } });
          bytes.push(await readFile(out()));
        }
        return bytes;
      } finally {
        stop();
      }
    };
    // Without it, the clock shows: two builds an hour apart differ.
    const [plainA, plainB] = await twice();
    expect(plainB!.equals(plainA!)).toBe(false);
    vi.stubEnv("SOURCE_DATE_EPOCH", "1000000000");
    const [first, second] = await twice();
    expect(second!.equals(first!)).toBe(true);
    expect(first!.toString("utf8")).toContain("2001-09-09");
  });
});

describe("an earlier :sectnums: against numbering.sections (item 27)", () => {
  it("builds, and no deleted heading carries a number", async () => {
    await write(then, {
      "docs/g.adoc":
        "= G\n:sectnums:\n\n== One\n\nA.\n\n=== One sub\n\nX.\n\n== Two\n\nB.\n\n=== Two sub\n\nC.\n",
    });
    await write(now, {
      "monodocs.config.yml": "numbering:\n  sections: 3\n",
      "docs/g.adoc": "= G\n\n== Two\n\nB.\n\n=== Two sub\n\nC.\n",
    });
    // Side by side, as the HTML shows it.
    await expect(
      buildSite({ outputFile: out(), diff: { dir: "../then", label: "v1" } }),
    ).resolves.toBeDefined();
    const html = await readFile(out(), "utf8");
    const start = html.indexOf('<article class="page" data-route="/g"');
    const page = html.slice(start, html.indexOf("</article>", start));
    const earlier = page.slice(0, page.indexOf('<div class="monodocs-diff-current">'));
    const deleted = marks(earlier).filter((mark) => /^-h[2-6] /.test(mark));
    expect(deleted).toContain("-h2 One");
    expect(deleted).toContain("-h3 One sub");
    for (const mark of deleted) expect(mark.replace(/^\S+ /, ""), mark).not.toMatch(/\d/);
    expect(earlier).not.toContain("section-number");
    // In one column, as the markup PDF will.
    const inline = (await writtenInline()).get("/g")!;
    const inlineDeleted = marks(inline).filter((mark) => /^-h[2-6] /.test(mark));
    expect(inlineDeleted).toContain("-h2 One");
    for (const mark of inlineDeleted) expect(mark.replace(/^\S+ /, ""), mark).not.toMatch(/\d/);
  });

  it("pairs the headings that stayed, although the scheme numbering them changed", async () => {
    // Asciidoctor writes `1. Two` and `1.1. Two sub`, numbering.sections an element of its own. The
    // separators are generated as the numbers are, so neither is read as part of the heading.
    await write(then, {
      "docs/g.adoc": "= G\n:sectnums:\n\n== One\n\nA.\n\n== Two\n\nB.\n\n=== Two sub\n\nC.\n",
    });
    await write(now, {
      "monodocs.config.yml": "numbering:\n  sections: 3\n",
      "docs/g.adoc": "= G\n\n== One\n\nA.\n\n== Two\n\nB.\n\n=== Two sub\n\nC.\n",
    });
    const page = (await compared()).find((p) => p.state === "matched" && p.new.route === "/g");
    expect(page).toBeDefined();
    expect(changes(page)).toEqual([]);
  });
});

describe("a build without a difference (item 30)", () => {
  const pages: Files = {
    "docs/dot.png": Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
    "docs/01-intro.md":
      "# Intro\n\nA paragraph with a footnote[^a] and `code`, with $e = mc^2$.\n\n$$\n\\frac{a}{b}\n$$\n\n[^a]: The note.\n\n## Lists\n\n- one\n  - inner\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> [!NOTE]\n> Careful.\n\n```js\nconst a = 1;\n```\n\n![Dot](dot.png)\n\nSee [the guide](02-guide.adoc).\n",
    "docs/_part.adoc": "Included text.\n",
    "docs/03-more.md": "# More\n\n## Section\n\nText.\n",
  };
  const guide = (head: string) =>
    `= Guide\n${head}:xrefstyle: short\n\n== One\n\nSee <<two>> and <<fig>>.footnote:[A footnote.]\n\ninclude::_part.adoc[]\n\n[#two]\n== Two\n\n[#fig]\n.A figure\nimage::dot.png[Dot]\n\nNOTE: Mind this.\n\n[source,ts]\n----\nlet b = 2;\n----\n\n[appendix]\n== Extra\n\nText.\n`;
  /** A theme of an `app.js` alone, which leaves the default theme's template and stylesheet. */
  const APP_STUB = "/* app */\n";

  /**
   * Two documents, one with numbering.sections and one with :sectnums:, lang: ja, and a label of
   * the author's, built by monodocs 0.17.2 (the release before this feature) with that theme: each
   * output's size and SHA-256. 0.17.2 and this build differ only in the default theme's `app.js`
   * (measured on `examples/en`, `ja`, and `math`: the search hook alone), so replacing it leaves
   * every other byte to compare, siteDataJson with its labels among them. A change made on purpose
   * to what a build writes changes these measures too: build the fixtures with the commit before
   * that change, check that the change is the only difference, and take the new measures.
   */
  const fixtures = [
    {
      name: "numbering.sections",
      config: "title: Fixture\nnumbering:\n  sections: 3\n",
      html: "html:\n  theme: ./theme\n",
      guide: guide(""),
      before: {
        size: 60061,
        sha256: "fb32d545bc7df941e3f6cc6c021a49d515df9d236a69429b989276a5ae8c0558",
      },
    },
    {
      name: ":sectnums: and a label",
      config: "title: Fixture\nlang: ja\n",
      html: "html:\n  theme: ./theme\n  labels:\n    searchPlaceholder: 検索\n",
      guide: guide(":sectnums:\n"),
      before: {
        size: 59200,
        sha256: "b37cb68198922d2ae2aa79bd0db1f8150becca13b7ba6f91b6c50386d5e53d1d",
      },
    },
  ];

  for (const fixture of fixtures) {
    it(`gives the bytes 0.17.2 gave but for the default theme's app.js (${fixture.name})`, async () => {
      await write(now, {
        ...pages,
        "docs/02-guide.adoc": fixture.guide,
        "monodocs.config.yml": fixture.config + fixture.html,
        "theme/app.js": APP_STUB,
      });
      await buildSite({ outputFile: out() });
      const stubbed = await readFile(out());
      expect(stubbed.length).toBe(fixture.before.size);
      expect(createHash("sha256").update(stubbed).digest("hex")).toBe(fixture.before.sha256);

      // With the default theme, the output is that one with the default app.js where the stub
      // was: the theme's app.js is all the measures above leave out.
      await rm(join(now, "theme"), { recursive: true });
      await write(now, {
        "monodocs.config.yml":
          fixture.config + fixture.html.replace("  theme: ./theme\n", "").replace(/^html:\n$/, ""),
      });
      await buildSite({ outputFile: out() });
      const appJs = await readFile(
        fileURLToPath(new URL("./themes/default/app.js", import.meta.url)),
        "utf8",
      );
      const html = stubbed.toString("utf8");
      expect(html.split(APP_STUB).length).toBe(2);
      expect(await readFile(out(), "utf8")).toBe(html.replace(APP_STUB, () => appJs));
    });
  }

  it("writes the labels 0.17.2 wrote in siteDataJson", async () => {
    await write(now, {
      "docs/a.md": "# A\n",
      "monodocs.config.yml": "lang: ja\nhtml:\n  labels:\n    searchPlaceholder: 検索\n",
    });
    await buildSite({ outputFile: out() });
    const html = await readFile(out(), "utf8");
    const json = /window\.__MONODOCS_DATA__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(html)![1]!;
    // As the 0.17.2 output of the second fixture above has them, in that order.
    const labels = (JSON.parse(json) as { labels: Record<string, string> }).labels;
    expect(Object.entries(labels)).toEqual(
      Object.entries({
        openSidebar: "Open sidebar",
        closeSidebar: "Close sidebar",
        searchPlaceholder: "検索",
        searchLabel: "Search documents",
        clearSearch: "Clear search",
        searchResults: "Search results",
        noResults: "No results",
        contentWidthToggle: "Toggle content width",
        useWideContent: "Use wide content",
        useStandardContent: "Use standard content width",
        darkModeToggle: "Toggle dark mode",
        tocLabel: "Table of contents",
        tocTitle: "On this page",
        pageNavLabel: "Page navigation",
        prev: "← Prev",
        next: "Next →",
        wrapToggle: "Toggle word wrap",
        copyCode: "Copy code",
        copy: "Copy",
        copied: "Copied!",
        copyFailed: "Copy failed",
        openImagePreview: "Open image preview",
        imagePreview: "Image preview",
        closeImagePreview: "Close image preview",
        actualSize: "Actual size",
        fitToScreen: "Fit to screen",
        generatedBy: "Generated by",
        version: "Version",
        cover: "Cover",
        contents: "Contents",
      }),
    );
  });
});

describe("the numbers a difference shows under numbering.sections (item 31)", () => {
  /** Every number shown, as `where route number text`: in the body, and in each sidebar. */
  function shown(document: string): string[] {
    const between = (from: string, to: string) => {
      const start = document.indexOf(from);
      return document.slice(start, document.indexOf(to, start));
    };
    const found: string[] = [];
    const body = between('<main id="content"', "</main>");
    for (const article of body.split('<article class="page" data-route="').slice(1)) {
      const route = article.slice(0, article.indexOf('"'));
      for (const m of article.matchAll(
        /<span class="section-number"[^>]*>([^<]*)<\/span> ([^<]*)/g,
      )) {
        found.push(`body ${route} ${m[1]} ${m[2]}`);
      }
    }
    const nav = between('<nav id="sidebar-nav">', "</nav>");
    const sidebars = nav.includes("data-monodocs-diff-sidebar")
      ? nav.split('data-monodocs-diff-sidebar="').slice(1)
      : [`plain"${nav}`];
    for (const sidebar of sidebars) {
      const view = sidebar.slice(0, sidebar.indexOf('"'));
      for (const m of sidebar.matchAll(
        /data-route="([^"]*)"><span class="section-number">([^<]*)<\/span> ([^<]*)/g,
      )) {
        found.push(`${view} ${m[1]} ${m[2]} ${m[3]}`);
      }
    }
    return found;
  }

  it("are the numbers each page gets without a difference, in the body and every sidebar", async () => {
    const config = { "monodocs.config.yml": "numbering:\n  sections: 3\n" };
    await write(now, {
      ...config,
      "docs/01-a.md": "# A\n\n## A one\n\nText.\n",
      "docs/03-c.md": "# C\n\n## C one\n\nNew text.\n\n## C two\n",
      "docs/04-d.md": "# D\n\n## D one\n",
    });
    await buildSite({ outputFile: out() });
    const plain = shown(await readFile(out(), "utf8"));
    // A page deleted between two numbered ones, a changed page after it, and an added page.
    await write(then, {
      ...config,
      "docs/01-a.md": "# A\n\n## A one\n\nText.\n",
      "docs/02-b.md": "# B\n\n## B one\n",
      "docs/03-c.md": "# C\n\n## C one\n\nOld text.\n\n## C two\n",
    });
    await buildSite({ outputFile: out(), diff: { dir: "../then", label: "v1" } });
    const withDifference = shown(await readFile(out(), "utf8"));

    // Each page is numbered in the body, and in the sidebar of each view that shows the new one.
    const places = new Set(withDifference.map((line) => line.split(" ").slice(0, 2).join(" ")));
    for (const route of ["/01-a", "/03-c", "/04-d"]) {
      for (const where of ["body", "both", "current"]) {
        expect(places.has(`${where} ${route}`), `${where} ${route}`).toBe(true);
      }
    }
    const without = new Set(plain.map((line) => line.replace(/^\S+ /, "")));
    for (const line of withDifference) {
      expect(without.has(line.replace(/^\S+ /, "")), line).toBe(true);
    }
    // The earlier version's view, and the deleted page, show none.
    expect(
      withDifference.filter((line) => line.startsWith("earlier ") || line.includes("//deleted")),
    ).toEqual([]);
  });
});
