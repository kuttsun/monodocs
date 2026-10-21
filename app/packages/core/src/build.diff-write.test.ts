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
import type { Page } from "./types";

/**
 * Writing the difference into the new version's tree (roadmap 7.3.4): added blocks marked in place,
 * deleted ones cloned where they stood, without an address, and the output valid HTML.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-write-"));
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

/** The new version's pages with the difference written into them, by route. */
async function difference(
  earlier: Files,
  current: Files,
  options: { prerender?: boolean } = {},
): Promise<Map<string, string>> {
  // Each call starts from empty versions, so calls in one test do not see each other's files.
  for (const root of [now, then]) {
    await rm(root, { recursive: true, force: true });
    await mkdir(join(root, "docs"), { recursive: true });
  }
  await write(then, earlier);
  await write(now, current);
  let pages: Page[] = [];
  await buildSite(
    { outputFile: join(base, "out.html"), diff: { dir: "../then", label: "v1" } },
    {
      onWritten: (written) => (pages = written),
      ...(options.prerender === true ? { mermaidPrerenderer: fakePrerenderer() } : {}),
    },
  ).catch((error: { code?: string }) => {
    if (error.code !== "diff/unsupported") throw error;
  });
  return new Map(pages.map((page) => [page.route, page.html]));
}

/** One page's HTML, both versions of it written as `earlier` and `current`. */
async function onePage(path: string, earlier: string, current: string, files: Files = {}) {
  const pages = await difference({ [path]: earlier, ...files }, { [path]: current, ...files });
  return [...pages.values()][0]!;
}

const parser = unified().use(rehypeParse, { fragment: true });

function parse(html: string): HastRoot {
  return parser.parse(html);
}

/** The marked blocks of a page, as `+tag text` and `-tag text`, in order. */
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

function toText(node: Element | HastRoot): string {
  let out = "";
  visit(node, "text", (text) => {
    out += text.value;
  });
  return out;
}

/** Every ID on the page. */
function ids(html: string): string[] {
  const out: string[] = [];
  visit(parse(html), "element", (node) => {
    if (typeof node.properties.id === "string") out.push(node.properties.id);
  });
  return out;
}

/** What the content model forbids, among what the difference could break. */
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
      const caption = children.findIndex((c) => c.tagName === "caption");
      if (caption > 0) out.push("caption not first");
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

describe("marking blocks", () => {
  it("marks an added block in place and writes a deleted one where it stood", async () => {
    const html = await onePage(
      "docs/a.md",
      "# A\n\nOne.\n\nTwo.\n\nThree.\n",
      "# A\n\nOne.\n\nNew.\n\nThree.\n",
    );
    expect(marks(html)).toEqual(["-p Two.", "+p New."]);
    expect(html).toContain(
      '<p data-monodocs-diff-block="del"><del data-monodocs-diff="">Two.</del></p>',
    );
    expect(html).toContain(
      '<p data-monodocs-diff-block="ins"><ins data-monodocs-diff="">New.</ins></p>',
    );
    expect(html.indexOf("One.")).toBeLessThan(html.indexOf("Two."));
    expect(html.indexOf("Two.")).toBeLessThan(html.indexOf("New."));
    expectValid(html);
  });

  it("leaves a document's own struck text and raw <ins> as they are", async () => {
    const markdown = await onePage(
      "docs/a.md",
      "# A\n\nKeep ~~old~~.\n\nGone.\n",
      "# A\n\nKeep ~~old~~.\n",
    );
    expect(markdown).toContain("<p>Keep <del>old</del>.</p>");
    expect(marks(markdown)).toEqual(["-p Gone."]);
    const asciidoc = await onePage(
      "docs/a.adoc",
      "= A\n\nKeep +++<ins>raw</ins>+++.\n\nGone.\n",
      "= A\n\nKeep +++<ins>raw</ins>+++.\n",
    );
    expect(asciidoc).toContain("<p>Keep <ins>raw</ins>.</p>");
    expect(marks(asciidoc)).toEqual(["-p Gone."]);
  });

  it("marks each cell of a row, and an image by wrapping it", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const html = await onePage(
      "docs/a.md",
      "# A\n\n| h | i |\n|---|---|\n| 1 | x |\n",
      "# A\n\n| h | i |\n|---|---|\n| 1 | x |\n| 2 | y |\n\n![dot](dot.png)\n",
      { "docs/dot.png": png },
    );
    expect(html).toContain(
      '<tr data-monodocs-diff-block="ins">\n<td><ins data-monodocs-diff="">2</ins></td>',
    );
    expect(html).toMatch(
      /<ins data-monodocs-diff=""><img src="data:[^"]+" alt="dot" data-monodocs-diff-block="ins"><\/ins>/,
    );
    expectValid(html);
  });
});

describe("where a deleted block goes", () => {
  it("puts a deleted nested item at its own depth, at every depth", async () => {
    const earlier = "# A\n\n- one\n  - two\n    - three\n    - four\n  - five\n- six\n";
    for (const [gone, current] of [
      ["one", "# A\n\n- two\n  - three\n  - four\n- five\n- six\n"],
      ["five", "# A\n\n- one\n  - two\n    - three\n    - four\n- six\n"],
      ["four", "# A\n\n- one\n  - two\n    - three\n  - five\n- six\n"],
    ] as const) {
      const html = await onePage("docs/a.md", earlier, current);
      expectValid(html);
      const tree = parse(html);
      let depth = -1;
      visit(tree, "element", (node, _, parent) => {
        if (node.tagName !== "li" || node.properties.dataMonodocsDiffBlock !== "del") return;
        if (!toText(node).includes(gone)) return;
        let d = 0;
        for (let at = parent; at !== undefined;) {
          if (at.type === "element" && at.tagName === "ul") d++;
          at = findParent(tree, at);
        }
        depth = d;
      });
      expect(depth, gone).toBe(gone === "one" ? 1 : gone === "five" ? 2 : 3);
    }
  });

  it("puts a deleted row in its table and a deleted note's paragraph in the note", async () => {
    const html = await onePage(
      "docs/a.md",
      "# A\n\n| h |\n|---|\n| 1 |\n| 2 |\n| 3 |\n\n> [!NOTE]\n> Keep.\n>\n> Gone.\n",
      "# A\n\n| h |\n|---|\n| 1 |\n| 3 |\n\n> [!NOTE]\n> Keep.\n",
    );
    expect(marks(html)).toEqual(["-tr 2", "-p Gone."]);
    expect(html.indexOf(">1<")).toBeLessThan(html.indexOf(">2<"));
    expect(html.indexOf(">2<")).toBeLessThan(html.indexOf(">3<"));
    expect(html).toMatch(
      /<div class="admonition-content">[\s\S]*Keep\.[\s\S]*Gone\.[\s\S]*<\/div><\/div>/,
    );
    expectValid(html);
  });

  it("clones the containers a deleted block had and the new version lacks", async () => {
    const html = await onePage(
      "docs/a.adoc",
      "= A\n\nKeep.\n\n[NOTE]\n====\nWhole note.\n====\n\n--\nAnonymous.\n--\n",
      "= A\n\nKeep.\n",
    );
    expect(marks(html)).toEqual(["-p Whole note.", "-p Anonymous."]);
    expect(html).toMatch(/<div class="admonition admonition-note"><p class="admonition-title">/);
    expect(html).toContain('<div class="openblock">');
    expectValid(html);
  });

  it("joins a deleted caption to the table's one caption, before the new text", async () => {
    const html = await onePage(
      "docs/a.adoc",
      "= A\n\n.Old caption\n[cols=2]\n|===\n|H1 |H2\n\n|a |b\n|===\n",
      "= A\n\n.New caption\n[cols=2]\n|===\n|H1 |H3\n\n|a |b\n|===\n",
    );
    expect(marks(html)).toEqual([
      "+caption Old captionTable 1. New caption",
      "-del Old caption",
      "-tr H1 H2",
      "+tr H1 H3",
    ]);
    expect(html).toMatch(
      /<caption[^>]*><del[^>]*>Old caption<\/del><ins[^>]*>Table 1\. New caption<\/ins><\/caption>/,
    );
    expect(html).toContain("<colgroup>");
    expectValid(html);
  });

  it("writes a deleted title and summary, and keeps their containers valid", async () => {
    const html = await onePage(
      "docs/a.adoc",
      "= A\n\n.Old title\n----\ncode\n----\n\n.Details\n[%collapsible]\n====\nHidden.\n====\n",
      "= A\n\n----\ncode\n----\n",
    );
    expect(marks(html)).toEqual(["-div Old title", "-summary Details", "-p Hidden."]);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>/);
    expectValid(html);
  });

  it("places a deleted row after the rows a new cell spans", async () => {
    const html = await onePage(
      "docs/a.adoc",
      "= A\n\n[cols=2]\n|===\n.2+|span |a\n|b\n|c |d\n|===\n",
      "= A\n\n[cols=2]\n|===\n.2+|span |a\n|b2\n|c |d\n|===\n",
    );
    expect(marks(html)).toEqual(["+tr b2", "-tr b"]);
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
      m[1]!
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    expect(rows).toEqual(["span a", "b2", "b", "c d"]);
    expectValid(html);
  });
});

describe("numbers", () => {
  it("keeps every new item's number when an item of an ordered list is deleted", async () => {
    const html = await onePage(
      "docs/a.md",
      "# A\n\n1. one\n2. two\n3. three\n",
      "# A\n\n1. one\n2. three\n",
    );
    expect(html).toContain('<li value="1">one</li>');
    expect(html).toContain('<li value="2">three</li>');
    expect(html).toMatch(/<li data-monodocs-diff-block="del"><del[^>]*>two<\/del><\/li>/);
  });

  it("keeps references and footnotes agreeing when a footnote is deleted", async () => {
    const html = await onePage(
      "docs/a.md",
      "# A\n\nOne[^a] and two[^b].\n\n[^a]: First.\n[^b]: Second.\n",
      "# A\n\nOne and two[^b].\n\n[^b]: Second.\n",
    );
    // A reference is a generated number: dropping one changes no paragraph.
    expect(marks(html)).toEqual(["-li First."]);
    expect(html).toMatch(/<sup><a [^>]*data-footnote-ref[^>]*>1<\/a><\/sup>/);
    expect(html).toMatch(/<li id="a-user-content-fn-b" value="1">/);
  });

  it("writes no generated number in deleted content, but keeps a cross-reference's text", async () => {
    const html = await onePage(
      "docs/a.adoc",
      "= A\n:sectnums:\n\n== One\n\nSee <<two>>.\n\n[[two]]\n== Two\n\n.Caption\nimage::x.png[Alt]\n",
      "= A\n:sectnums:\n\n[[two]]\n== Two\n",
    );
    expect(marks(html)).toEqual(["-h2 One", "-p See Two.", "-span Alt (x.png)", "-div Caption"]);
    // The deleted figure goes into the new section's body, not a second one.
    expect(html.match(/class="sectionbody"/g)?.length).toBe(2);
    expectValid(html);
    // A cross-reference's text keeps the number written in it.
    const numbered = await onePage(
      "docs/a.adoc",
      "= A\n:sectnums:\n:xrefstyle: short\n\n== One\n\nSee <<two>>.\n\n[[two]]\n== Two\n",
      "= A\n:sectnums:\n:xrefstyle: short\n\n[[two]]\n== Two\n",
    );
    expect(marks(numbered)).toEqual(["-h2 One", "-p See Section 2."]);
  });
});

describe("deleted content has no address", () => {
  it("keeps no ID or link outside an SVG", async () => {
    const html = await onePage(
      "docs/a.md",
      "# A\n\n## Gone\n\nSee [the site](https://example.com) and [B](b.md).\n",
      "# A\n",
      { "docs/b.md": "# B\n" },
    );
    expect(marks(html)).toEqual(["-h2 Gone", "-p See the site and B."]);
    const deleted = html.slice(html.indexOf("Gone") - 60);
    expect(deleted).not.toMatch(/\sid="/);
    expect(deleted).not.toContain("<a ");
  });

  it("renames the IDs inside an inline SVG moved within an AsciiDoc page", async () => {
    // How each reference is renamed is pinned in diff/write.test.ts.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<defs><linearGradient id="g"/></defs><rect id="r" width="5" height="5"/></svg>';
    const html = await onePage(
      "docs/a.adoc",
      "= A\n\nimage::a.svg[a,opts=inline]\n\nText.\n",
      "= A\n\nText.\n\nimage::a.svg[a,opts=inline]\n",
      { "docs/a.svg": svg },
    );
    expectValid(html);
    expect(ids(html).sort()).toEqual(["a", "a-g", "a-r", "earlier-a-g", "earlier-a-r"]);
  });

  it("gives the diagrams of both versions IDs of their own", async () => {
    const diagram = (text: string) => `\`\`\`mermaid\ngraph TD\n  A-->${text}\n\`\`\`\n`;
    const config = { "monodocs.config.yml": "mermaid:\n  mode: pre-render\n" };
    const pages = await difference(
      { "docs/a.md": `# A\n\n${diagram("B")}`, "docs/b.md": `# B\n\n${diagram("C")}`, ...config },
      { "docs/a.md": `# A\n\n${diagram("X")}`, "docs/b.md": `# B\n\n${diagram("Y")}`, ...config },
      { prerender: true },
    );
    const html = [...pages.values()].join("\n");
    expectValid(html);
    expect(ids(html).sort()).toEqual([
      "a-a",
      "b-b",
      "mermaid-0",
      "mermaid-0-arrow",
      "mermaid-1",
      "mermaid-1-arrow",
      `${EARLIER_MERMAID_ID_PREFIX}0`,
      `${EARLIER_MERMAID_ID_PREFIX}0-arrow`,
      `${EARLIER_MERMAID_ID_PREFIX}1`,
      `${EARLIER_MERMAID_ID_PREFIX}1-arrow`,
    ]);
    expect(html).toMatch(
      /<figure class="mermaid"[^>]*data-monodocs-diff-block="del"><del data-monodocs-diff=""><svg id="mermaid-earlier-0">/,
    );
  });

  it("keeps an embedded image's data, and shows one left as a file by its alt and path", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const files = { "docs/dot.png": png };
    const embedded = await onePage("docs/a.md", "# A\n\n![dot](dot.png)\n", "# A\n", files);
    expect(embedded).toMatch(/<del data-monodocs-diff=""><img src="data:image\/png;base64,/);
    const external = await onePage("docs/a.md", "# A\n\n![dot](dot.png)\n", "# A\n", {
      ...files,
      "monodocs.config.yml": "assets:\n  embedImages: false\n",
    });
    expect(external).toContain('<del data-monodocs-diff="">dot (dot.png)</del>');
    expect(external).not.toContain("<img");
  });
});

function findParent(tree: HastRoot, node: Element | HastRoot): Element | HastRoot | undefined {
  let found: Element | HastRoot | undefined;
  visit(tree, (candidate) => {
    if ("children" in candidate && (candidate.children as unknown[]).includes(node)) {
      found = candidate as Element | HastRoot;
    }
  });
  return found;
}
