import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build";
import type { BlockEdit, PageComparison } from "./diff/compare";

/**
 * Comparing two versions (roadmap 7.3.3): pages matched by route and by `aliases`, blocks classified
 * and compared by what they read as, aligned by Myers' algorithm.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-compare-"));
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

/** The comparison of an earlier and a new version. */
async function compare(earlier: Files, current: Files): Promise<PageComparison[]> {
  await write(then, earlier);
  await write(now, current);
  let result: PageComparison[] | undefined;
  await expect(
    buildSite(
      { outputFile: join(base, "out.html"), diff: { dir: "../then", label: "v1" } },
      { onCompared: (pages) => (result = pages) },
    ),
  ).rejects.toMatchObject({ code: "diff/unsupported" });
  return result!;
}

/** A page's edits that are not `equal`, as `-kind text` / `+kind text`. */
function changes(page: PageComparison | undefined): string[] {
  const short = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);
  return (page?.edits ?? [])
    .filter((edit: BlockEdit) => edit.op !== "equal")
    .map((edit) =>
      edit.op === "delete"
        ? `-${edit.old.kind} ${short(edit.old.key)}`
        : edit.op === "insert"
          ? `+${edit.new.kind} ${short(edit.new.key)}`
          : "",
    );
}

/** The comparison of one page, both versions of it written as `earlier` and `current`. */
async function onePage(path: string, earlier: string, current: string, config: Files = {}) {
  const pages = await compare({ [path]: earlier, ...config }, { [path]: current, ...config });
  const relative = path.replace(/^docs\//, "");
  return pages.find((p) => p.state === "matched" && p.new.relativePath === relative)!;
}

describe("matching pages", () => {
  it("finds added, deleted, moved, merged, and changed pages, a route match before an alias", async () => {
    const pages = await compare(
      {
        "docs/same.md": "# Same\n\nText.\n",
        "docs/changed.md": "# Changed\n\nOld text.\n",
        "docs/gone.md": "# Gone\n",
        "docs/old-place.md": "# Moved\n\nText.\n",
        "docs/merge-a.md": "# A\n",
        "docs/merge-b.md": "# B\n",
        "docs/kept.md": "# Kept\n",
      },
      {
        "docs/same.md": "# Same\n\nText.\n",
        "docs/changed.md": "# Changed\n\nNew text.\n",
        "docs/new.md": "# New\n",
        "docs/new-place.md": "---\naliases:\n  - /old-place\n---\n\n# Moved\n\nText.\n",
        "docs/merged.md": "---\naliases:\n  - /merge-a\n  - /merge-b\n---\n\n# Merged\n",
        // An alias naming a route a page still has does not take it.
        "docs/kept.md": "# Kept\n",
        "docs/claims.md": "---\naliases:\n  - /kept\n---\n\n# Claims\n",
      },
    );
    const summary = pages.map((p) =>
      p.state === "matched"
        ? `${p.new.route} ${p.changed ? "changed" : "same"}${p.movedFrom ? ` from ${p.movedFrom}` : ""}`
        : p.state === "added"
          ? `+${p.new.route}`
          : `-${p.old.route}${p.mergedInto ? ` into ${p.mergedInto.route}` : ""}`,
    );
    expect(summary.sort()).toEqual(
      [
        "+/claims",
        "+/new",
        "-/gone",
        "-/merge-b into /merged",
        "/changed changed",
        "/kept same",
        "/merged changed from /merge-a",
        "/new-place same from /old-place",
        "/same same",
      ].sort(),
    );
  });

  it("lists a page whose only change is the title written in its front matter", async () => {
    const page = await onePage(
      "docs/a.md",
      "---\ntitle: Old\n---\n\nText.\n",
      "---\ntitle: New\n---\n\nText.\n",
    );
    expect(page.changed).toBe(true);
    expect(page.titleChanged).toEqual({ from: "Old" });
    expect(changes(page)).toEqual([]);
  });

  it("changes nothing for sidebar.titleTransform or sidebar.titleFrom alone", async () => {
    const pages = await compare(
      { "docs/a-b.md": "# Heading\n\nText.\n" },
      {
        "docs/a-b.md": "# Heading\n\nText.\n",
        "monodocs.config.yml":
          "sidebar:\n  titleFrom: filename\n  titleTransform:\n    page:\n      type: stripNumberPrefix\n",
      },
    );
    expect(pages.every((p) => p.state === "matched" && !p.changed)).toBe(true);
  });
});

describe("comparing blocks", () => {
  it("marks a heading whose level changed, and a paragraph turned into a heading", async () => {
    expect(changes(await onePage("docs/a.md", "# A\n\n## Two\n", "# A\n\n### Two\n"))).toEqual([
      "-h2 Two",
      "+h3 Two",
    ]);
    expect(changes(await onePage("docs/b.md", "# B\n\nTwo\n", "# B\n\n## Two\n"))).toEqual([
      "-p Two",
      "+h2 Two",
    ]);
  });

  it("leaves a link's target and emphasis out, and reads a ticked checkbox", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.md",
          "# A\n\nSee [here](a.md) now.\n",
          "# A\n\nSee *[here](b.md)* now.\n",
        ),
      ),
    ).toEqual([]);
    expect(
      changes(await onePage("docs/b.md", "# B\n\n- [ ] task\n", "# B\n\n- [x] task\n")),
    ).toEqual(["-li [ ] task", "+li [x] task"]);
  });

  it("reads a paragraph moved into an admonition as a deletion and an addition", async () => {
    expect(
      changes(await onePage("docs/a.md", "# A\n\nCareful.\n", "# A\n\n> [!WARNING]\n> Careful.\n")),
    ).toEqual(["-p Careful.", "+p Careful."]);
  });

  it("reads an image replaced under the same name, embedded or not", async () => {
    for (const embed of [true, false]) {
      const config = { "monodocs.config.yml": `assets:\n  embedImages: ${embed}\n` };
      await write(then, { "docs/i.png": "OLD" });
      await write(now, { "docs/i.png": "NEW" });
      const page = await onePage(
        "docs/a.md",
        "# A\n\n![x](i.png)\n",
        "# A\n\n![x](i.png)\n",
        config,
      );
      expect(
        changes(page).map((c) => c.slice(0, 6)),
        `embed ${embed}`,
      ).toEqual(["-image", "+image"]);
    }
  });

  it("changes no block for a table's frame, grid, stripes, width, or a block's role", async () => {
    const before = "= A\n\n|===\n|a |b\n|1 |2\n|===\n\nText.\n";
    const after =
      "= A\n\n[frame=ends,grid=rows,stripes=even,width=50%]\n|===\n|a |b\n|1 |2\n|===\n\n[.lead]\nText.\n";
    expect(changes(await onePage("docs/a.adoc", before, after))).toEqual([]);
  });

  it("changes the row whose cell span moved, with the same texts", async () => {
    const before = "= A\n\n[cols=3*]\n|===\n2+|a |b\n|===\n";
    const after = "= A\n\n[cols=3*]\n|===\n|a 2+|b\n|===\n";
    expect(changes(await onePage("docs/a.adoc", before, after)).map((c) => c.slice(0, 3))).toEqual([
      "-tr",
      "+tr",
    ]);
  });

  it("changes only the item that gains a second paragraph, and not a nested item's parent", async () => {
    expect(
      changes(
        await onePage("docs/a.md", "# A\n\n- one\n- two\n", "# A\n\n- one\n\n  More.\n- two\n"),
      ),
    ).toEqual(["+p More."]);
    expect(
      changes(
        await onePage("docs/b.md", "# B\n\n- one\n  - inner\n- two\n", "# B\n\n- one\n- two\n"),
      ),
    ).toEqual(["-li inner"]);
  });

  it("changes only the item turned into a task, in Markdown and in AsciiDoc", async () => {
    expect(
      changes(await onePage("docs/a.md", "# A\n\n- one\n- two\n", "# A\n\n- [ ] one\n- two\n")),
    ).toEqual(["-li one", "+li [ ] one"]);
    expect(
      changes(await onePage("docs/b.adoc", "= B\n\n* one\n* two\n", "= B\n\n* [ ] one\n* two\n")),
    ).toEqual(["-li one", "+li [ ] one"]);
  });

  it("adds only the heading that splits an AsciiDoc section", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.adoc",
          "= A\n\n== One\n\nFirst.\n\nSecond.\n",
          "= A\n\n== One\n\nFirst.\n\n=== Half\n\nSecond.\n",
        ),
      ),
    ).toEqual(["+h3 Half"]);
  });

  it("changes the caption alone when it is fixed, and shows the figure once", async () => {
    await write(then, { "docs/i.png": "PNG" });
    await write(now, { "docs/i.png": "PNG" });
    expect(
      changes(
        await onePage(
          "docs/a.adoc",
          "= A\n\n.A figur\nimage::i.png[]\n",
          "= A\n\n.A figure\nimage::i.png[]\n",
        ),
      ),
    ).toEqual(["-title Figure . A figur", "+title Figure . A figure"]);
  });

  it("never makes whitespace between elements a block", async () => {
    const page = await onePage("docs/a.md", "# A\n\nOne.\n\n\n\nTwo.\n", "# A\n\nOne.\n\nTwo.\n");
    expect(changes(page)).toEqual([]);
    expect(
      page.edits!.every((edit) =>
        edit.op === "equal" ? edit.new.key !== "" || edit.new.kind === "hr" : true,
      ),
    ).toBe(true);
  });
});

describe("generated numbers are not differences", () => {
  for (const math of [true, false]) {
    it(`shows only the inserted section, figure, footnote, and appendix as added (math ${math ? "on" : "off"})`, async () => {
      const config = { "monodocs.config.yml": `math:\n  enabled: ${math}\n` };
      await write(then, { "docs/i.png": "PNG" });
      await write(now, { "docs/i.png": "PNG" });
      const head = "= A\n:sectnums:\n:xrefstyle: short\n\n";
      const earlier =
        head +
        "== One\n\nSee <<two>>, <<fig>>, <<app>>.footnote:[First.]\n\n[#two]\n== Two\n\n[#fig]\n.Fig\nimage::i.png[]\n\n[appendix]\n[#app]\n== Extra\n";
      const current =
        head +
        "== Zero\n\nNew.footnote:[Zeroth.]\n\n.New fig\nimage::i.png[]\n\n== One\n\nSee <<two>>, <<fig>>, <<app>>.footnote:[First.]\n\n[#two]\n== Two\n\n[#fig]\n.Fig\nimage::i.png[]\n\n[appendix]\n== Inserted\n\n[appendix]\n[#app]\n== Extra\n";
      // Only what was inserted: every number that moved on is left out.
      const found = changes(await onePage("docs/a.adoc", earlier, current, config));
      expect(found.map((c) => (c.startsWith("+image") ? "+image" : c))).toEqual([
        "+h2 . Zero",
        "+p New.",
        "+image",
        "+title Figure . New fig",
        "+h2 Appendix : Inserted",
        "+text . Zeroth.",
      ]);
    });
  }

  it("shows only the inserted GFM footnote, and only the inserted section under numbering.sections", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.md",
          "# A\n\nB[^b].\n\n[^b]: Bee.\n",
          "# A\n\nA[^a] and B[^b].\n\n[^a]: Ay.\n[^b]: Bee.\n",
        ),
      ),
    ).toEqual(["-p B.", "+p A and B.", "+li Ay. ↩"]);
    const config = { "monodocs.config.yml": "numbering:\n  sections: 3\n" };
    expect(
      changes(
        await onePage(
          "docs/b.md",
          "# B\n\n## One\n\n## Two\n",
          "# B\n\n## New\n\n## One\n\n## Two\n",
          config,
        ),
      ),
    ).toEqual(["+h2 New"]);
  });
});

describe("what each block is compared by", () => {
  it("compares code by its source and language, not its highlighting", async () => {
    expect(
      changes(await onePage("docs/a.md", "# A\n\n```js\nx\n```\n", "# A\n\n```ts\nx\n```\n")),
    ).toEqual(["-code lang:js\nx\n", "+code lang:ts\nx\n"]);
    expect(
      changes(await onePage("docs/b.md", "# B\n\n```js\nx\n```\n", "# B\n\n```js\nx\n```\n")),
    ).toEqual([]);
  });

  it("compares a diagram by its source, and a display formula by its TeX", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.md",
          "# A\n\n```mermaid\ngraph TD; A-->B\n```\n",
          "# A\n\n```mermaid\ngraph TD; A-->C\n```\n",
        ),
      ),
    ).toEqual(["-diagram graph TD; A-->B\n", "+diagram graph TD; A-->C\n"]);
    expect(
      changes(await onePage("docs/b.md", "# B\n\n$$\na+b\n$$\n", "# B\n\n$$\na+c\n$$\n")),
    ).toEqual(["-formula a+b", "+formula a+c"]);
    // Reflowed, the TeX is the same.
    expect(
      changes(await onePage("docs/c.md", "# C\n\n$$\na+b\n$$\n", "# C\n\n$$ a+b $$\n")),
    ).toEqual([]);
  });

  it("reads an inline formula as its TeX and an inline image as its bytes", async () => {
    expect(
      changes(await onePage("docs/a.md", "# A\n\nSee $a$ here.\n", "# A\n\nSee $b$ here.\n")),
    ).toEqual(["-p See \\(a\\) here.", "+p See \\(b\\) here."]);
    await write(then, { "docs/i.png": "OLD" });
    await write(now, { "docs/i.png": "NEW" });
    const page = await onePage(
      "docs/b.md",
      "# B\n\nSee ![i](i.png) here.\n",
      "# B\n\nSee ![i](i.png) here.\n",
    );
    expect(changes(page).map((c) => c.slice(0, 2))).toEqual(["-p", "+p"]);
  });

  it("reads an admonition's kind: every paragraph of a note turned into a warning changes", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.md",
          "# A\n\n> [!NOTE]\n> One.\n>\n> Two.\n",
          "# A\n\n> [!WARNING]\n> One.\n>\n> Two.\n",
        ),
      ),
    ).toEqual(["-p One.", "-p Two.", "+p One.", "+p Two."]);
  });

  it("reads emphasis added inside an AsciiDoc one-line admonition or footnote as no change", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.adoc",
          "= A\n\nNOTE: Use this carefully.\n\nText.footnote:[See this.]\n",
          "= A\n\nNOTE: Use *this* carefully.\n\nText.footnote:[See _this_.]\n",
        ),
      ),
    ).toEqual([]);
  });

  it("compares an SVG written inline, and one embedded as an object, by its content", async () => {
    const svg = (shape: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${shape}</svg>`;
    await write(then, { "docs/i.svg": svg('<rect width="5" height="5"/>') });
    await write(now, { "docs/i.svg": svg('<circle r="5"/>') });
    for (const [name, macro] of [
      ["block", "image::i.svg[pic,opts=inline]"],
      ["inline", "See image:i.svg[x,opts=inline] here."],
      ["object", ":data-uri:\n\nimage::i.svg[pic,opts=interactive]"],
    ] as const) {
      const page = await onePage(`docs/${name}.adoc`, `= A\n\n${macro}\n`, `= A\n\n${macro}\n`);
      expect(page.changed, name).toBe(true);
    }
  });

  it("never makes whitespace between AsciiDoc elements a block", async () => {
    const page = await onePage("docs/a.adoc", "= A\n\nOne.\n\n\n\nTwo.\n", "= A\n\nOne.\n\nTwo.\n");
    expect(changes(page)).toEqual([]);
  });

  it("reads a front-matter title written with {docdir} as the same title", async () => {
    const page = await onePage(
      "docs/a.adoc",
      "= A\n:sd-title: In {docdir}\n\nText.\n",
      "= A\n:sd-title: In {docdir}\n\nText.\n",
    );
    expect(page.titleChanged).toBeUndefined();
    expect(page.changed).toBe(false);
  });

  it("reads an inline SVG the same on a page that moved, whose IDs carry another prefix", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="g"><rect id="r" width="5" height="5"/></g><use href="#r"/></svg>';
    await write(then, { "docs/a.svg": svg });
    await write(now, { "docs/a.svg": svg });
    const pages = await compare(
      {
        "docs/old.adoc":
          "= Page\n\nimage::a.svg[a,opts=inline]\n\nText image:a.svg[b,opts=inline] end.\n",
      },
      {
        "docs/new.adoc":
          "= Page\n:sd-aliases: /old\n\nimage::a.svg[a,opts=inline]\n\nText image:a.svg[b,opts=inline] end.\n",
      },
    );
    const moved = pages.find((p) => p.state === "matched")!;
    expect(moved.state === "matched" && moved.movedFrom).toBe("/old");
    expect(changes(moved)).toEqual([]);
  });

  it("compares a video and an embedded player by what they play", async () => {
    expect(
      changes(
        await onePage(
          "docs/v.adoc",
          "= V\n\nvideo::a.mp4[]\n",
          "= V\n\nvideo::b.mp4[]\n\nvideo::xyz[youtube]\n",
        ),
      ).map((c) => c.split(" ")[0]),
    ).toEqual(["-video", "+video", "+iframe"]);
  });

  it("reads the blocks in an AsciiDoc table cell: code with its language", async () => {
    expect(
      changes(
        await onePage(
          "docs/t.adoc",
          "= T\n\n|===\na|\n[source,js]\n----\nx\n----\n|===\n",
          "= T\n\n|===\na|\n[source,ts]\n----\nx\n----\n|===\n",
        ),
      ).map((c) => c.slice(0, 3)),
    ).toEqual(["-tr", "+tr"]);
  });

  it("compares the words in a table cell beside an image", async () => {
    await write(then, { "docs/i.png": "PNG" });
    await write(now, { "docs/i.png": "PNG" });
    const table = (cell: string) => `# T\n\n| a |\n|---|\n| ${cell} |\n`;
    expect(
      changes(
        await onePage(
          "docs/t.md",
          table("See ![i](i.png) here"),
          table("Do not use ![i](i.png) ever"),
        ),
      ).map((c) => c.slice(0, 3)),
    ).toEqual(["-tr", "+tr"]);
  });

  it("adds only the title given to a one-line admonition", async () => {
    expect(
      changes(
        await onePage(
          "docs/a.adoc",
          "= A\n\nNOTE: Use this carefully.\n",
          "= A\n\n.Heads up\nNOTE: Use this carefully.\n",
        ),
      ),
    ).toEqual(["+title Heads up"]);
  });

  it("reads an image wrapped in a link as the same image", async () => {
    await write(then, { "docs/i.png": "PNG" });
    await write(now, { "docs/i.png": "PNG" });
    expect(
      changes(
        await onePage(
          "docs/a.md",
          "# A\n\n![x](i.png)\n",
          "# A\n\n[![x](i.png)](https://example.invalid)\n",
        ),
      ),
    ).toEqual([]);
    expect(
      changes(
        await onePage(
          "docs/b.adoc",
          "= B\n\nimage::i.png[x]\n",
          "= B\n\nimage::i.png[x,link=https://example.invalid]\n",
        ),
      ),
    ).toEqual([]);
  });

  it("reads an inline image in an AsciiDoc one-line admonition as part of its sentence", async () => {
    await write(then, { "docs/i.png": "PNG" });
    await write(now, { "docs/i.png": "PNG" });
    expect(
      changes(
        await onePage(
          "docs/a.adoc",
          "= A\n\nNOTE: Press image:i.png[] now.\n",
          "= A\n\nNOTE: Press image:i.png[] later.\n",
        ),
      ).map((c) => c.slice(0, 18)),
    ).toEqual(["-text Press [image", "+text Press [image"]);
  });

  it("reads a list item that holds only an image as an item", async () => {
    await write(then, { "docs/i.png": "PNG" });
    await write(now, { "docs/i.png": "PNG" });
    expect(
      changes(
        await onePage("docs/l.md", "# L\n\n- ![i](i.png)\n", "# L\n\n- ![i](i.png) cap\n"),
      ).map((c) => c.slice(0, 3)),
    ).toEqual(["-li", "+li"]);
  });
});
