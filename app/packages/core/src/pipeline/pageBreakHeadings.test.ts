import { describe, expect, it } from "vitest";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import type { Root as HastRoot } from "hast";
import { markPageBreakHeadings, PAGE_BREAK_ATTRIBUTE } from "./pageBreakHeadings";

const parser = unified().use(rehypeParse, { fragment: true });
const serializer = unified().use(rehypeStringify);

/** The page body, marked, as HTML — the same round trip postprocess performs. */
function mark(html: string, level = 2): string {
  const tree = parser.parse(html) as HastRoot;
  markPageBreakHeadings(tree, level);
  return serializer.stringify(tree);
}

/** Which headings came back marked, by their text. */
function marked(html: string, level = 2): string[] {
  const out = mark(html, level);
  return [
    ...out.matchAll(new RegExp(`<h[1-6][^>]*${PAGE_BREAK_ATTRIBUTE}[^>]*>([^<]*)<`, "g")),
  ].map((m) => m[1] as string);
}

describe("which headings start a new sheet", () => {
  it("leaves the heading that only the page title precedes", () => {
    // Otherwise every page opens with a sheet holding one line.
    expect(marked("<h1>T</h1><h2>A</h2><p>a</p><h2>B</h2>")).toEqual(["B"]);
  });

  it("leaves a heading with nothing at all before it", () => {
    // A page whose title comes from the file name has no h1 to skip past.
    expect(marked("<h2>A</h2><p>a</p><h2>B</h2>")).toEqual(["B"]);
  });

  it("breaks before the first section when an introduction precedes it", () => {
    // "The first heading of the page" would be the wrong rule: the introduction belongs on the
    // title's sheet, and the section after it belongs on its own.
    expect(marked("<h1>T</h1><p>intro</p><h2>A</h2>")).toEqual(["A"]);
  });

  it("walks through Asciidoctor's section wrappers", () => {
    const asciidoc =
      "<h1>T</h1>" +
      '<div class="sect1"><h2>A</h2><div class="sectionbody"><div class="paragraph"><p>a</p></div>' +
      '<div class="sect2"><h3>A1</h3><div class="sectionbody"><p>a1</p></div></div></div></div>' +
      '<div class="sect1"><h2>B</h2><div class="sectionbody"><p>b</p></div></div>';
    expect(marked(asciidoc, 3)).toEqual(["A1", "B"]);
    // At level 2 the h3 is not a candidate, and the h2 after it still is.
    expect(marked(asciidoc, 2)).toEqual(["B"]);
  });

  it("takes the level as the deepest that breaks", () => {
    const body = "<h1>T</h1><p>x</p><h2>A</h2><h3>B</h3><h4>C</h4>";
    expect(marked(body, 2)).toEqual(["A"]);
    expect(marked(body, 3)).toEqual(["A", "B"]);
    expect(marked(body, 4)).toEqual(["A", "B", "C"]);
  });

  it("does not touch a heading inside a block the print layout keeps together", () => {
    // Asking Chromium to hold a block together and to break inside it at once is not a request
    // with an answer, so a heading in a blockquote, a table, an admonition, or a figure is out.
    const body =
      "<h1>T</h1><p>x</p>" +
      "<blockquote><h2>Q</h2></blockquote>" +
      '<div class="admonition"><h2>N</h2></div>' +
      "<table><tbody><tr><td><h2>C</h2></td></tr></tbody></table>" +
      "<figure><h2>F</h2></figure>" +
      "<h2>Real</h2>";
    expect(marked(body)).toEqual(["Real"]);
  });

  it("leaves a heading that a manual marker already broke before", () => {
    // Measured: Chromium does not collapse two forced breaks, so marking this one would put a
    // blank sheet between the marker and the heading.
    expect(marked('<h1>T</h1><p>x</p><div class="page-break"></div><h2>A</h2>')).toEqual([]);
    // …but a marker further back does not stop the next heading breaking.
    expect(marked('<h1>T</h1><div class="page-break"></div><p>x</p><h2>A</h2>')).toEqual(["A"]);
  });

  it("walks a document that is mostly headings in one pass", () => {
    // The shape that made the first version quadratic: every heading asked what preceded it by
    // slicing the flow. The claim here is the result rather than the timing — 199 of the 200
    // sections break, the first being the one only the page title precedes.
    const body =
      "<h1>T</h1>" + Array.from({ length: 200 }, (_, i) => `<h2>S${i}</h2><p>p</p>`).join("");
    expect(marked(body)).toHaveLength(199);
  });

  it("marks with an empty attribute and touches nothing else", () => {
    const out = mark('<h1>T</h1><p>x</p><h2 id="a" class="k">A</h2>');
    expect(out).toContain(`<h2 id="a" class="k" ${PAGE_BREAK_ATTRIBUTE}="">A</h2>`);
    expect(out).toContain("<h1>T</h1>");
  });
});
