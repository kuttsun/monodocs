import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Root } from "hast";
import { visit } from "unist-util-visit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preparePages } from "./build";
import { loadConfig } from "./config";
import { isGenerated } from "./pipeline/generatedNumbers";

/**
 * Generated numbers are marked so comparison leaves them out (roadmap 7.3.2): split into text nodes
 * of their own, marked on `data`, the bytes unchanged.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-generated-"));
  await mkdir(join(dir, "docs"));
  await writeFile(join(dir, "docs", "i.png"), "PNG");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ADOC = `= Doc
:sectnums:
:xrefstyle: short

== Intro

See <<sec-two>> and <<app-a>> and <<fig-one>> and <<tab-one>>.
Note.footnote:[First note.]

[#fig-one]
.A figure
image::i.png[I]

[#tab-one]
.A table
|===
|a |b
|===

.An example
====
Body.
====

[#sec-two]
== Two

=== Two point one

[appendix]
[#app-a]
== Extra
`;

/** Every marked number on a page, in document order. */
async function marked(
  files: Record<string, string>,
  math = true,
): Promise<Record<string, string[]>> {
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, "docs", name), body);
  const config = await loadConfig({ inputDir: join(dir, "docs") }, dir);
  const site = await preparePages({ ...config, mathEnabled: math }, dir, { record: true });
  const out: Record<string, string[]> = {};
  for (const page of site.pages) {
    const found: string[] = [];
    visit(site.trees!.get(page.id) as Root, "text", (node) => {
      if (isGenerated(node)) found.push(node.value);
    });
    out[page.relativePath] = found;
  }
  return out;
}

describe("marking generated numbers", () => {
  for (const math of [true, false]) {
    it(`marks every number Asciidoctor writes, and only those (math ${math ? "on" : "off"})`, async () => {
      const found = await marked({ "a.adoc": ADOC }, math);
      expect(found["a.adoc"]).toEqual([
        "1. ",
        "Section 2",
        "Appendix A",
        "Figure 1",
        "Table 1",
        "1",
        "Figure 1. ",
        "Table 1. ",
        "Example 1. ",
        "2. ",
        "2.1. ",
        "Appendix A: ",
        "1",
      ]);
    });
  }

  it("finds a caption the document renamed", async () => {
    const found = await marked({
      "r.adoc":
        "= R\n:figure-caption: 図\n:appendix-caption: 付録\n\n.絵\nimage::i.png[I]\n\n[appendix]\n== 追加\n",
    });
    expect(found["r.adoc"]).toEqual(["図 1. ", "付録 A: "]);
  });

  it("leaves a number the author wrote", async () => {
    const found = await marked({
      "l.adoc": "= L\n\n== 1. Literal\n\n.Figure 1. by hand\n----\nx\n----\n",
    });
    // No :sectnums:, so the heading's number is the author's; a listing has no caption by default.
    expect(found["l.adoc"]).toEqual([]);
  });

  it("marks GFM's footnote numbers", async () => {
    const found = await marked({
      "b.md": "# B\n\nText[^1] and more[^n].\n\n[^1]: One.\n[^n]: Named.\n",
    });
    expect(found["b.md"]).toEqual(["1", "2"]);
  });

  it("changes no byte of the page", async () => {
    await writeFile(join(dir, "docs", "a.adoc"), ADOC);
    const config = await loadConfig({ inputDir: join(dir, "docs") }, dir);
    const plain = await preparePages(config, dir, {});
    const recorded = await preparePages(config, dir, { record: true });
    expect(recorded.pages.map((p) => p.html)).toEqual(plain.pages.map((p) => p.html));
  });

  it("marks an appendix's subsections, and its letter with the caption turned off", async () => {
    const found = await marked({
      "p.adoc": "= P\n:sectnums:\n\n[appendix]\n== Extra\n\n=== Sub\n",
      "q.adoc": "= Q\n:sectnums:\n:appendix-caption!:\n\n[appendix]\n== Extra\n\n=== Sub\n",
    });
    expect(found["p.adoc"]).toEqual(["Appendix A: ", "A.1. "]);
    expect(found["q.adoc"]).toEqual(["A. ", "A.1. "]);
  });

  it("marks only the sections numbered before :sectnums! turned numbering off", async () => {
    const found = await marked({
      "c.adoc": "= C\n:sectnums:\n\n== One\n\n:sectnums!:\n\n== Refs\n",
    });
    expect(found["c.adoc"]).toEqual(["1. "]);
  });

  it("marks a named footnote referred to again", async () => {
    const found = await marked({
      "f.adoc": "= F\n\nOne.footnote:n1[Shared.] Two.footnote:n1[]\n",
    });
    expect(found["f.adoc"]).toEqual(["1", "1", "1"]);
  });

  it("does not take a section's own title for a reference to a numbered block", async () => {
    const found = await marked({
      "t.adoc": "= T\n\nSee <<sum>>.\n\n[#sum]\n== Table 1 summary\n",
    });
    expect(found["t.adoc"]).toEqual([]);
  });

  it("counts no heading that is not a section, and marks no section past sectnumlevels", async () => {
    const found = await marked({
      "d.adoc":
        "= D\n:sectnums:\n\n== One\n\n=== One A\n\n[discrete]\n==== Float\n\n=== One B\n\n== Two\n",
      "n.adoc": "= N\n:sectnums:\n:sectnumlevels: 1\n\n== One\n\n=== Sub\n",
    });
    expect(found["d.adoc"]).toEqual(["1. ", "1.1. ", "1.2. ", "2. "]);
    expect(found["n.adoc"]).toEqual(["1. "]);
  });

  it("marks a book's chapter and part numbers with their signifiers", async () => {
    const found = await marked({
      "b.adoc":
        "= B\n:doctype: book\n:sectnums:\n:partnums:\n:chapter-signifier: Chapter\n:part-signifier: Part\n:xrefstyle: short\n\n= Part One\n\n[#intro]\n== Intro\n\nSee <<next>>.\n\n[#next]\n== Next\n",
    });
    expect(found["b.adoc"]).toEqual(["Part I: ", "Chapter 1. ", "Chapter 2", "Chapter 2. "]);
  });

  // monodocs has Asciidoctor write the body only (`standalone: false`), so its own table of
  // contents is not in the page; the reader's comes from monodocs.
  it("marks a reference with no signifier", async () => {
    const found = await marked({
      "t.adoc":
        "= T\n:sectnums:\n:toc:\n:xrefstyle: short\n:!section-refsig:\n\n== One\n\nSee <<two>>.\n\n[#two]\n== Two\n",
    });
    expect(found["t.adoc"]).toEqual(["1. ", "2", "2. "]);
  });

  it("leaves a caption and a reference text the author wrote", async () => {
    const found = await marked({
      "m.adoc":
        '= M\n:sectnums:\n\n[caption="Mine: "]\n.Titled\n====\nBody.\n====\n\nSee <<two,Section 9 is about apples>>.\n\n[#two]\n== Two\n',
    });
    expect(found["m.adoc"]).toEqual(["1. "]);
  });

  it("marks the counter GFM puts on a footnote referred to again", async () => {
    const found = await marked({ "g.md": "# G\n\nA[^a] and again[^a].\n\n[^a]: Note.\n" });
    expect(found["g.md"]).toEqual(["1", "1", "2"]);
  });
});
