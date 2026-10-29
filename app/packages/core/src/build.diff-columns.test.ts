import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Element, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite, EARLIER_MERMAID_ID_PREFIX } from "./build";
import type { PageComparison } from "./diff/compare";
import type { Page } from "./types";

/**
 * The difference as v0.18 ships it: the two versions side by side (roadmap 7.3.4), each changed
 * page written as the earlier column beside the new one. build.diff-write.test.ts writes the same
 * kinds of fixtures into one column, the writing kept for the markup PDF (7.3.5); here they go
 * through the build a user runs, and each column is checked as it is written.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-columns-"));
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

const fakePrerenderer = () => ({
  async render(id: string) {
    return `<svg id="${id}"><defs><marker id="${id}-arrow"></marker></defs><path marker-end="url(#${id}-arrow)"></path></svg>`;
  },
  async close() {},
});

type Difference = {
  /** The document's pages as written, by route; the list of changes is `//changes`. */
  pages: Map<string, string>;
  comparison: PageComparison[];
};

/** A build with a difference, side by side as a user gets it. */
async function difference(
  earlier: Files,
  current: Files,
  options: { prerender?: boolean } = {},
): Promise<Difference> {
  // Each call starts from empty versions, so calls in one test do not see each other's files.
  for (const root of [now, then]) {
    await rm(root, { recursive: true, force: true });
    await mkdir(join(root, "docs"), { recursive: true });
  }
  await write(then, earlier);
  await write(now, current);
  let pages: Page[] = [];
  let comparison: PageComparison[] = [];
  await buildSite(
    { outputFile: join(base, "out.html"), diff: { dir: "../then", label: "v1" } },
    {
      onWritten: (written) => (pages = written),
      onCompared: (compared) => (comparison = compared),
      ...(options.prerender === true ? { mermaidPrerenderer: fakePrerenderer() } : {}),
    },
  );
  return { pages: new Map(pages.map((page) => [page.route, page.html])), comparison };
}

const EARLIER_START = '<div class="monodocs-diff-earlier">\n';
const CURRENT_START = '</div><div class="monodocs-diff-current">\n';

/**
 * A page's two columns, each the HTML written for it (after the column's heading), or undefined
 * when the page is not written side by side.
 */
function columns(html: string): { earlier: string; current: string } | undefined {
  const start = html.indexOf(EARLIER_START);
  if (start === -1) return undefined;
  const middle = html.indexOf(CURRENT_START, start);
  const body = (from: number, to: number) => {
    const part = html.slice(from, to);
    const head = /^<p class="monodocs-diff-column-title">.*?<\/p>\n/.exec(part)![0];
    return part.slice(head.length);
  };
  const earlier = body(start + EARLIER_START.length, middle).replace(/\n$/, "");
  const end = html.lastIndexOf("\n</div></div>");
  const current = body(middle + CURRENT_START.length, end);
  return { earlier, current };
}

/** One page's two columns, both versions of it written as `earlier` and `current`. */
async function onePage(
  path: string,
  earlier: string,
  current: string,
  files: Files = {},
): Promise<{ earlier: string; current: string }> {
  const { pages } = await difference({ [path]: earlier, ...files }, { [path]: current, ...files });
  const route = `/${path.replace(/^docs\//, "").replace(/\.(?:md|adoc)$/, "")}`;
  return columns(pages.get(route)!)!;
}

const parser = unified().use(rehypeParse, { fragment: true });

function parse(html: string): HastRoot {
  return parser.parse(html);
}

function toText(node: Element | HastRoot): string {
  let out = "";
  visit(node, "text", (text) => {
    out += text.value;
  });
  return out;
}

/** The marked blocks of a column, as `+tag text` and `-tag text`, in order. */
function marks(html: string): string[] {
  const out: string[] = [];
  visit(parse(html), "element", (node) => {
    const mark = node.properties.dataMonodocsDiffBlock;
    if (mark === undefined) return;
    const text = toText(node).replace(/\s+/g, " ").trim();
    out.push(`${mark === "ins" ? "+" : "-"}${node.tagName} ${text}`);
  });
  return out;
}

/** Every ID in the HTML. */
function ids(html: string): string[] {
  const out: string[] = [];
  visit(parse(html), "element", (node) => {
    if (typeof node.properties.id === "string") out.push(node.properties.id);
  });
  return out;
}

/** What the content model forbids, among what the difference could break (as build.diff-write). */
function violations(html: string): string[] {
  const only: Record<string, string[]> = {
    ul: ["li"],
    ol: ["li"],
    tr: ["td", "th"],
    tbody: ["tr"],
    thead: ["tr"],
    tfoot: ["tr"],
    table: ["caption", "colgroup", "thead", "tbody", "tfoot"],
    colgroup: ["col"],
  };
  const phrasing = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "summary"]);
  const blockLevel = /^(?:div|p|ul|ol|li|table|h[1-6]|pre|section|blockquote|dl|figure|details)$/;
  const out: string[] = [];
  visit(parse(html), "element", (node) => {
    const children = node.children.filter((c): c is Element => c.type === "element");
    const allowed = only[node.tagName];
    for (const child of children) {
      if (allowed !== undefined && !allowed.includes(child.tagName)) {
        out.push(`${child.tagName} in ${node.tagName}`);
      }
      if (phrasing.has(node.tagName) && blockLevel.test(child.tagName)) {
        out.push(`${child.tagName} in ${node.tagName}`);
      }
    }
    for (const tag of ["caption", "thead", "tfoot", "summary", "figcaption"]) {
      if (children.filter((c) => c.tagName === tag).length > 1)
        out.push(`two ${tag} in ${node.tagName}`);
    }
    if (node.tagName === "table") {
      // caption, colgroup, thead, tbody, tfoot, in that order.
      const order = ["caption", "colgroup", "thead", "tbody", "tfoot"];
      const ranks = children.map((c) => order.indexOf(c.tagName));
      if (ranks.some((rank, i) => i > 0 && rank < ranks[i - 1]!)) {
        out.push(`table parts out of order: ${children.map((c) => c.tagName).join(" ")}`);
      }
    }
  });
  return out;
}

/** Whether the HTML parses back to the tree it was written from. */
function reparses(html: string): boolean {
  return toHtml(parse(html), { allowDangerousHtml: true }) === html;
}

function expectValid(html: string): void {
  expect(reparses(html)).toBe(true);
  expect(violations(html)).toEqual([]);
  const all = ids(html);
  expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
}

/** The first table's grid: each row's cell texts by the column they stand in, spans laid out. */
function grid(html: string): string[][] {
  let table: Element | undefined;
  visit(parse(html), "element", (node) => {
    if (table === undefined && node.tagName === "table") table = node;
  });
  const rows: Element[] = [];
  visit(table!, "element", (node) => {
    if (node.tagName === "tr") rows.push(node);
  });
  const out: string[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.children) {
      if (cell.type !== "element" || (cell.tagName !== "td" && cell.tagName !== "th")) continue;
      while (out[r]![c] !== undefined) c++;
      const text = toText(cell).trim();
      const rowspan = Number(cell.properties.rowSpan ?? 1);
      const colspan = Number(cell.properties.colSpan ?? 1);
      for (let dr = 0; dr < rowspan && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < colspan; dc++) out[r + dr]![c + dc] = text;
      }
      c += colspan;
    }
  });
  return out;
}

/** The references inside each SVG that name an ID the same SVG does not have. */
function unresolvedInSvgs(html: string): string[] {
  const out: string[] = [];
  visit(parse(html), "element", (svg) => {
    if (svg.tagName !== "svg") return;
    const own = new Set<string>();
    const named: string[] = [];
    visit(svg, "element", (node) => {
      for (const [key, value] of Object.entries(node.properties)) {
        if (key === "id" && typeof value === "string") own.add(value);
        else if ((key === "href" || key === "xLinkHref") && typeof value === "string") {
          if (value.startsWith("#")) named.push(value.slice(1));
        } else if (key === "ariaLabelledBy" || key === "ariaDescribedBy") {
          named.push(...(Array.isArray(value) ? value.map(String) : String(value).split(/\s+/)));
        } else if (typeof value === "string") {
          for (const m of value.matchAll(/url\(\s*['"]?#([^'")\s]+)/g)) named.push(m[1]!);
        }
      }
      if (node.tagName === "style") {
        for (const m of toText(node).matchAll(/#([A-Za-z_][\w-]*)/g)) named.push(m[1]!);
        for (const m of toText(node).matchAll(/url\(\s*['"]?#([^'")\s]+)/g)) named.push(m[1]!);
      }
    });
    if (own.size === 0) out.push("an SVG without IDs");
    out.push(...named.filter((id) => !own.has(id)));
  });
  return out;
}

describe("matching pages, for AsciiDoc", () => {
  it("lists added, deleted, moved, merged, and changed pages and marks them, a route before an alias", async () => {
    const { pages, comparison } = await difference(
      {
        "docs/same.adoc": "= Same\n\nText.\n",
        "docs/changed.adoc": "= Changed\n\nOld text.\n\nKeep.\n",
        "docs/gone.adoc": "= Gone\n\nGone text.\n",
        "docs/old-place.adoc": "= Moved\n\nText.\n",
        "docs/merge-a.adoc": "= A\n\nAy.\n",
        "docs/merge-b.adoc": "= B\n\nBee.\n",
        "docs/kept.adoc": "= Kept\n",
        "docs/retitled.adoc": "= Heading\n:sd-title: Old title\n\nText.\n",
      },
      {
        "docs/same.adoc": "= Same\n\nText.\n",
        "docs/changed.adoc": "= Changed\n\nNew text.\n\nKeep.\n",
        "docs/new.adoc": "= New\n",
        "docs/new-place.adoc": "= Moved\n:sd-aliases: /old-place\n\nText.\n",
        "docs/merged.adoc": "= Merged\n:sd-aliases: /merge-a, /merge-b\n\nAy.\n",
        // An alias naming a route a page still has does not take it.
        "docs/kept.adoc": "= Kept\n",
        "docs/claims.adoc": "= Claims\n:sd-aliases: /kept\n",
        // Only the title its attribute gives changes.
        "docs/retitled.adoc": "= Heading\n:sd-title: New title\n\nText.\n",
      },
    );
    const summary = comparison.map((p) =>
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
        "/retitled changed",
        "/same same",
      ].sort(),
    );

    // The list of changes.
    const list = pages.get("//changes")!;
    const section = (id: string) => {
      const start = list.indexOf(`<h2 id="diff-changes-${id}">`);
      return list.slice(start, list.indexOf("</ul>", start));
    };
    expect(section("added")).toContain(
      '<li><a href="#/claims">Claims</a></li>\n<li><a href="#/new">New</a></li>',
    );
    expect(section("moved")).toContain(
      '<li><a href="#/merged">Merged</a> (<code>/merge-a</code> → <code>/merged</code>) — Added 1 / Deleted 1</li>\n<li><a href="#/new-place">Moved</a> (<code>/old-place</code> → <code>/new-place</code>)</li>',
    );
    expect(section("changed")).toContain(
      '<li><a href="#/changed">Changed</a> — Added 1 / Deleted 1</li>\n<li><a href="#/retitled">New title</a> (The title changed. Its earlier title: Old title)</li>',
    );
    expect(section("deleted")).toContain(
      '<li><a href="#//deleted/gone">Gone</a></li>\n<li><a href="#//deleted/merge-b">B</a> (Merged into: <a href="#/merged">Merged</a>)</li>',
    );
    expect(list).toContain("<p>Unchanged pages: 2</p>");
    expect(list).not.toContain("/kept");

    // The marks within pages, in each column.
    const changed = columns(pages.get("/changed")!)!;
    expect(marks(changed.earlier)).toEqual(["-p Old text."]);
    expect(marks(changed.current)).toEqual(["+p New text."]);
    expect(changed.earlier).toContain('<p data-monodocs-diff-pair="2">Keep.</p>');
    expect(changed.current).toContain('<p data-monodocs-diff-pair="2">Keep.</p>');
    const merged = pages.get("/merged")!;
    expect(merged).toMatch(
      /^<div class="monodocs-diff-note"><p>This page moved\. Its earlier route: <code>\/merge-a<\/code><\/p><\/div>\n<div class="monodocs-diff-columns">/,
    );
    expect(marks(columns(merged)!.earlier)).toEqual(["-h1 A"]);
    expect(marks(columns(merged)!.current)).toEqual(["+h1 Merged"]);
    // Moved or retitled without a block changed: a note, and the page once.
    for (const [route, note] of [
      ["/new-place", "This page moved. Its earlier route: <code>/old-place</code>"],
      ["/retitled", "The title changed. Its earlier title: Old title"],
    ] as const) {
      const html = pages.get(route)!;
      expect(html, route).toContain(`<div class="monodocs-diff-note"><p>${note}</p></div>`);
      expect(columns(html), route).toBeUndefined();
      expect(marks(html), route).toEqual([]);
    }
    // Added: its note in the earlier column, the page unmarked beside it.
    for (const route of ["/new", "/claims"]) {
      const added = columns(pages.get(route)!)!;
      expect(added.earlier, route).toBe(
        '<div class="monodocs-diff-note"><p>This page was added.</p></div>\n',
      );
      expect(marks(added.current), route).toEqual([]);
    }
    // Deleted: the earlier page in its column, the note beside it.
    const gone = columns(pages.get("//deleted/gone")!)!;
    expect(gone.earlier).toContain("<p>Gone text.</p>");
    expect(gone.current).toContain("This page was deleted.");
    // Matched by route, not claimed by the alias: the page as it is.
    expect(pages.get("/kept")).toBe('<h1 id="kept">Kept</h1>\n');
    expect(pages.get("/same")).not.toContain("monodocs-diff");
  });
});

describe("generated numbers, side by side", () => {
  for (const math of [true, false]) {
    const config = (more = "") => ({
      "monodocs.config.yml": `math:\n  enabled: ${math}\n${more}`,
    });

    it(`shows a deleted figure and appendix with no number beside the new ones (math ${math ? "on" : "off"})`, async () => {
      const files = { ...config(), "docs/i.png": "I", "docs/j.png": "J" };
      const head = "= A\n:sectnums:\n\n";
      const page = await onePage(
        "docs/a.adoc",
        head +
          "== One\n\n.Fig gone\nimage::i.png[]\n\n.Fig kept\nimage::j.png[]\n\n[appendix]\n== Gone app\n\nx.\n\n[appendix]\n== Kept app\n\ny.\n",
        head + "== One\n\n.Fig kept\nimage::j.png[]\n\n[appendix]\n== Kept app\n\ny.\n",
        files,
      );
      expect(marks(page.earlier).map((m) => (m.startsWith("-img") ? "-img" : m))).toEqual([
        "-img",
        "-div Fig gone",
        "-h2 Gone app",
        "-p x.",
      ]);
      expect(marks(page.current)).toEqual([]);
      // The new ones keep their numbers; the earlier column shows none, deleted or not.
      expect(page.current).toContain(">Figure 1. Fig kept</div>");
      expect(page.current).toContain(">Appendix A: Kept app</h2>");
      expect(page.earlier).not.toMatch(/Figure \d|Appendix [A-Z]|\d\. /);
      expect(page.earlier).toContain('<del data-monodocs-diff="">Fig gone</del>');
      expect(page.earlier).toContain('<del data-monodocs-diff="">Gone app</del>');
    });

    it(`keeps a cross-reference written as Section 2.3 or Appendix B unchanged (math ${math ? "on" : "off"})`, async () => {
      const head = "= A\n:sectnums:\n:xrefstyle: short\n\n";
      const rest =
        "== One\n\nSee <<t>> and <<b>>.\n\n== Two\n\n=== Two one\n\n=== Two two\n\n[#t]\n=== Target\n\n[appendix]\n== First\n\n";
      const page = await onePage(
        "docs/a.adoc",
        `${head}${rest}[appendix]\n[#b]\n== Second\n`,
        `${head}== Zero\n\n${rest}[appendix]\n== Inserted\n\n[appendix]\n[#b]\n== Second\n`,
        config(),
      );
      // Only the inserted section and appendix: every number that moved on is left out.
      expect(marks(page.earlier)).toEqual([]);
      expect(marks(page.current)).toEqual(["+h2 1. Zero", "+h2 Appendix B: Inserted"]);
      // Each column reads as its version wrote it, the cross-reference paired across the two.
      expect(page.earlier).toContain(
        '<p data-monodocs-diff-pair="3">See Section 2.3 and Appendix B.</p>',
      );
      expect(page.current).toContain(
        '<p data-monodocs-diff-pair="3">See <a href="#a-t">Section 3.3</a> and <a href="#a-b">Appendix C</a>.</p>',
      );
    });

    it(`shows only the inserted GFM footnote and numbering.sections section (math ${math ? "on" : "off"})`, async () => {
      const page = await onePage(
        "docs/a.md",
        "# A\n\n## One\n\nB[^b].\n\n## Two\n\n[^b]: Bee.\n",
        "# A\n\n## New\n\n## One\n\nA[^a].\n\nB[^b].\n\n## Two\n\n[^a]: Ay.\n[^b]: Bee.\n",
        config("numbering:\n  sections: 3\n"),
      );
      expect(marks(page.earlier)).toEqual([]);
      expect(marks(page.current)).toEqual(["+h2 1.1 New", "+p A1.", "+li Ay. ↩"]);
      // The renumbered sections, reference, and footnote are pairs, not changes.
      expect(page.current).toMatch(
        /<p data-monodocs-diff-pair="\d+">B<sup><a [^>]*data-footnote-ref[^>]*>2<\/a><\/sup>\.<\/p>/,
      );
      expect(page.current).toMatch(
        /<h2 id="a-one" data-monodocs-diff-pair="\d+"><span class="section-number"[^>]*>1\.2<\/span> One<\/h2>/,
      );
    });
  }
});

describe("a table with a rowspan, side by side", () => {
  it("keeps every value of a changed row under a span in its column, in both columns", async () => {
    for (const [earlier, current, before, after] of [
      [
        "[cols=2]\n|===\n.2+|span |a\n|b\n|c |d\n|===\n",
        "[cols=2]\n|===\n.2+|span |a\n|b2\n|c |d\n|===\n",
        [
          ["span", "a"],
          ["span", "b"],
          ["c", "d"],
        ],
        [
          ["span", "a"],
          ["span", "b2"],
          ["c", "d"],
        ],
      ],
      [
        "[cols=3]\n|===\n|x .2+|span |y\n|b |c\n|e |f |g\n|===\n",
        "[cols=3]\n|===\n|x .2+|span |y\n|b2 |c\n|e |f |g\n|===\n",
        [
          ["x", "span", "y"],
          ["b", "span", "c"],
          ["e", "f", "g"],
        ],
        [
          ["x", "span", "y"],
          ["b2", "span", "c"],
          ["e", "f", "g"],
        ],
      ],
    ] as const) {
      const page = await onePage("docs/a.adoc", `= A\n\n${earlier}`, `= A\n\n${current}`);
      expect(marks(page.earlier).map((m) => m.slice(0, 3))).toEqual(["-tr"]);
      expect(marks(page.current).map((m) => m.slice(0, 3))).toEqual(["+tr"]);
      expect(grid(page.earlier)).toEqual(before);
      expect(grid(page.current)).toEqual(after);
      for (const column of [page.earlier, page.current]) {
        expect(column.match(/rowspan="\d+"/g)).toEqual(['rowspan="2"']);
        expectValid(column);
      }
    }
  });
});

describe("the earlier column is valid HTML", () => {
  it("re-parses and keeps every content model, for a nested list at every depth", async () => {
    const earlier = "# A\n\n- one\n  - two\n    - three\n    - four\n  - five\n- six\n";
    for (const [gone, current] of [
      ["one", "# A\n\n- two\n  - three\n  - four\n- five\n- six\n"],
      ["five", "# A\n\n- one\n  - two\n    - three\n    - four\n- six\n"],
      ["four", "# A\n\n- one\n  - two\n    - three\n  - five\n- six\n"],
    ] as const) {
      const page = await onePage("docs/a.md", earlier, current);
      expect(
        marks(page.earlier).some((m) => m.startsWith(`-li ${gone}`)),
        gone,
      ).toBe(true);
      expectValid(page.earlier);
      expectValid(page.current);
    }
  });

  it("re-parses and keeps every content model, for an AsciiDoc table with a caption, header, and colgroup", async () => {
    const table = (caption: string, header: string) =>
      `.${caption}\n[cols=2,options=header]\n|===\n|H1 |${header}\n\n|a |b\n|===\n`;
    // The caption and the header row changed.
    const changed = await onePage(
      "docs/a.adoc",
      `= A\n\nKeep.\n\n${table("Old caption", "H2")}`,
      `= A\n\nKeep.\n\n${table("New caption", "H3")}`,
    );
    expect(marks(changed.earlier)).toEqual(["-caption Old caption", "-tr H1 H2"]);
    expect(changed.earlier).toMatch(
      /<table[^>]*>\n?<caption[\s\S]*<\/caption>\n?<colgroup>[\s\S]*<\/colgroup>\n?<thead>[\s\S]*<\/thead>\n?<tbody>/,
    );
    expectValid(changed.earlier);
    // The whole table deleted.
    const deleted = await onePage(
      "docs/a.adoc",
      `= A\n\nKeep.\n\n${table("Old table", "H2")}`,
      "= A\n\nKeep.\n",
    );
    expect(marks(deleted.earlier)).toEqual(["-caption Old table", "-tr H1 H2", "-tr a b"]);
    expect(deleted.earlier).toMatch(/<caption[\s\S]*<\/caption>\n?<colgroup>[\s\S]*<thead>/);
    expectValid(deleted.earlier);
  });

  it("re-parses and keeps every content model, for an anonymous block, a div.title, and a summary", async () => {
    const page = await onePage(
      "docs/a.adoc",
      "= A\n\nKeep.\n\n--\nAnonymous.\n--\n\n.Old title\n----\ncode\n----\n\n.Details\n[%collapsible]\n====\nHidden.\n====\n",
      "= A\n\nKeep.\n\n----\ncode\n----\n",
    );
    expect(marks(page.earlier)).toEqual([
      "-p Anonymous.",
      "-div Old title",
      "-summary Details",
      "-p Hidden.",
    ]);
    expect(page.earlier).toContain('<div class="openblock">');
    expect(page.earlier).toMatch(/<details[^>]*>\n?<summary[^>]*>/);
    expectValid(page.earlier);
    expectValid(page.current);
  });

  it("re-parses and keeps every content model, for a deleted page holding all of them", async () => {
    const { pages } = await difference(
      {
        "docs/a.adoc": "= A\n",
        "docs/b.adoc":
          "= B\n\n* one\n** two\n\n.Caption\n[cols=2,options=header]\n|===\n|H1 |H2\n\n|a |b\n|===\n\n--\nAnonymous.\n--\n\n.Title\n----\ncode\n----\n\n.Details\n[%collapsible]\n====\nHidden.\n====\n",
      },
      { "docs/a.adoc": "= A\n" },
    );
    const earlier = columns(pages.get("//deleted/b")!)!.earlier;
    for (const part of ["<ul>", "<caption", "<colgroup>", "<thead>", "openblock", "<summary"]) {
      expect(earlier).toContain(part);
    }
    expectValid(earlier);
  });
});

describe("IDs, side by side", () => {
  it("gives a heading only the earlier column has no ID, nor any other earlier block", async () => {
    for (const [path, earlier, current] of [
      ["docs/a.md", "# A\n\n## Kept\n\n## Gone\n\nText.\n", "# A\n\n## Kept\n\nText.\n"],
      ["docs/a.adoc", "= A\n\n== Kept\n\n== Gone\n\nText.\n", "= A\n\n== Kept\n\nText.\n"],
    ] as const) {
      const page = await onePage(path, earlier, current);
      expect(marks(page.earlier), path).toEqual(["-h2 Gone"]);
      expect(page.earlier, path).toMatch(
        /<h2 data-monodocs-diff-block="del"><del[^>]*>Gone<\/del><\/h2>/,
      );
      expect(ids(page.earlier), path).toEqual([]);
      expect(ids(page.current).length, path).toBeGreaterThan(0);
    }
  });

  it("gives the pre-rendered diagrams of both versions IDs of their own, each resolving in its SVG", async () => {
    const diagram = (text: string) => `\`\`\`mermaid\ngraph TD\n  A-->${text}\n\`\`\`\n`;
    const config = { "monodocs.config.yml": "mermaid:\n  mode: pre-render\n" };
    const { pages } = await difference(
      { "docs/a.md": `# A\n\n${diagram("B")}`, "docs/b.md": `# B\n\n${diagram("C")}`, ...config },
      { "docs/a.md": `# A\n\n${diagram("X")}`, "docs/b.md": `# B\n\n${diagram("Y")}`, ...config },
      { prerender: true },
    );
    const html = [...pages.values()].join("\n");
    const all = ids(html);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
    const earlier = ["/a", "/b"].map((route) => columns(pages.get(route)!)!.earlier).join("\n");
    expect(ids(earlier).sort()).toEqual([
      `${EARLIER_MERMAID_ID_PREFIX}0`,
      `${EARLIER_MERMAID_ID_PREFIX}0-arrow`,
      `${EARLIER_MERMAID_ID_PREFIX}1`,
      `${EARLIER_MERMAID_ID_PREFIX}1-arrow`,
    ]);
    expect(unresolvedInSvgs(html)).toEqual([]);
  });

  it("renames the IDs of an inline SVG moved within an AsciiDoc page, every reference resolving", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" aria-labelledby="t">' +
      '<title id="t">Box</title><style>#r { stroke: black; }</style>' +
      '<defs><linearGradient id="g"/></defs><rect id="r" width="5" height="5" fill="url(#g)"/>' +
      '<use href="#r" x="5"/></svg>';
    const { pages } = await difference(
      { "docs/a.adoc": "= A\n\nimage::a.svg[a,opts=inline]\n\nText.\n", "docs/a.svg": svg },
      { "docs/a.adoc": "= A\n\nText.\n\nimage::a.svg[a,opts=inline]\n", "docs/a.svg": svg },
    );
    const html = pages.get("/a")!;
    const page = columns(html)!;
    expect(marks(page.earlier).length).toBeGreaterThan(0);
    expectValid(html);
    const earlierIds = ids(page.earlier);
    expect(earlierIds.length).toBe(3);
    // No ID of the earlier tree is left as it was: each is renamed, and none is one the new has.
    for (const id of earlierIds) expect(ids(page.current)).not.toContain(id);
    expect(earlierIds.every((id) => id.startsWith("earlier-"))).toBe(true);
    // Each kind of reference was renamed with them: `aria-labelledby`, a selector, `url(#…)`, `href`.
    for (const reference of [
      'aria-labelledby="earlier-a-t"',
      "<style>#earlier-a-r {",
      'fill="url(#earlier-a-g)"',
      'href="#earlier-a-r"',
    ]) {
      expect(page.earlier).toContain(reference);
    }
    expect(unresolvedInSvgs(html)).toEqual([]);
  });
});

describe("a document's own struck and inserted text", () => {
  /** The `<del>` and `<ins>` the document wrote, with no mark of the difference, by their text. */
  function own(html: string): string[] {
    const out: string[] = [];
    visit(parse(html), "element", (node) => {
      if (node.tagName !== "del" && node.tagName !== "ins") return;
      if (node.properties.dataMonodocsDiff !== undefined) return;
      out.push(`${node.tagName} ${toText(node)}`);
    });
    return out;
  }

  it("keeps Markdown's ~~struck~~ text, unmarked, in both columns", async () => {
    const page = await onePage(
      "docs/a.md",
      "# A\n\nKeep ~~old~~.\n\nWas ~~x~~ a.\n",
      "# A\n\nKeep ~~old~~.\n\nNow ~~x~~ b.\n",
    );
    for (const column of [page.earlier, page.current]) {
      expect(column).toContain('<p data-monodocs-diff-pair="2">Keep <del>old</del>.</p>');
      expect(own(column)).toEqual(["del old", "del x"]);
    }
    expect(marks(page.earlier)).toEqual(["-p Was x a."]);
    expect(marks(page.current)).toEqual(["+p Now x b."]);
  });

  it("keeps an AsciiDoc page's raw <ins>, unmarked, in both columns", async () => {
    const page = await onePage(
      "docs/a.adoc",
      "= A\n\nKeep +++<ins>raw</ins>+++.\n\nWas +++<ins>r</ins>+++ a.\n",
      "= A\n\nKeep +++<ins>raw</ins>+++.\n\nNow +++<ins>r</ins>+++ b.\n",
    );
    for (const column of [page.earlier, page.current]) {
      expect(column).toContain('<p data-monodocs-diff-pair="2">Keep <ins>raw</ins>.</p>');
      expect(own(column)).toEqual(["ins raw", "ins r"]);
    }
    expect(marks(page.earlier)).toEqual(["-p Was r a."]);
    expect(marks(page.current)).toEqual(["+p Now r b."]);
  });
});
