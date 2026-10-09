import { describe, expect, it } from "vitest";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import type { FigureAlign } from "../config";
import type { SourceFormat } from "../types";
import { markFigures } from "./figures";

/** Mark a fragment and return it serialised, so the assertions read as the HTML that ships. */
function mark(html: string, format: SourceFormat, fallback: FigureAlign = "center"): string {
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html);
  markFigures(tree, format, fallback);
  return unified().use(rehypeStringify).stringify(tree);
}

describe("markFigures: Markdown", () => {
  it("marks a paragraph holding one image, bare or linked, with the configured alignment", () => {
    expect(mark('<p><img src="a.png" alt="A"></p>', "markdown", "right")).toBe(
      '<p data-monodocs-figure="right"><img src="a.png" alt="A"></p>',
    );
    expect(mark('<p>\n<a href="x"> <img src="a.png" alt="A"> </a>\n</p>', "markdown")).toContain(
      '<p data-monodocs-figure="center">',
    );
  });

  it("leaves an image beside text, beside another image, or in a link with text alone", () => {
    // These are icons and badge rows, which sit in the line they were written in.
    for (const html of [
      '<p>Press <img src="a.png" alt="A"> to start.</p>',
      '<p><img src="a.png" alt="A"> <img src="b.png" alt="B"></p>',
      '<p><a href="x"><img src="a.png" alt="A"> Home</a></p>',
      '<p><em><img src="a.png" alt="A"></em></p>',
      "<p>Text only.</p>",
    ]) {
      expect(mark(html, "markdown"), html).not.toContain("data-monodocs-figure");
    }
  });
});

describe("markFigures: AsciiDoc", () => {
  it("marks an image block with its align=, and with the configured alignment without one", () => {
    const block = (cls: string) =>
      `<div class="${cls}"><div class="content"><img src="a.png" alt="A"></div></div>`;
    expect(mark(block("imageblock text-right"), "asciidoc", "left")).toContain(
      'data-monodocs-figure="right"',
    );
    expect(mark(block("imageblock text-center"), "asciidoc", "left")).toContain(
      'data-monodocs-figure="center"',
    );
    expect(mark(block("imageblock"), "asciidoc", "left")).toContain('data-monodocs-figure="left"');
    // float= is not alignment: Asciidoctor writes `right`, which leaves the block unaligned.
    expect(mark(block("imageblock right"), "asciidoc", "center")).toContain(
      'data-monodocs-figure="center"',
    );
  });

  it("reads only the three align classes, not a role named like an object property", () => {
    for (const role of ["constructor", "toString", "__proto__"]) {
      const html = `<div class="imageblock ${role}"><div class="content"><img src="a.png" alt="A"></div></div>`;
      expect(mark(html, "asciidoc", "right"), role).toContain('data-monodocs-figure="right"');
    }
  });

  it("leaves an inline image, even one alone in its paragraph", () => {
    const html =
      '<div class="paragraph"><p><span class="image"><img src="a.png" alt="A"></span></p></div>';
    expect(mark(html, "asciidoc")).not.toContain("data-monodocs-figure");
  });

  it("does not read Markdown's rule into an AsciiDoc page", () => {
    // A passthrough can write a bare `<p><img></p>`; AsciiDoc's own figure is the image block.
    expect(mark('<p><img src="a.png" alt="A"></p>', "asciidoc")).not.toContain(
      "data-monodocs-figure",
    );
  });
});

describe("markFigures: diagrams", () => {
  it("marks a Mermaid block in either format, before and after it is drawn", () => {
    for (const format of ["markdown", "asciidoc"] as const) {
      expect(mark('<pre class="mermaid">graph LR\nA-->B</pre>', format, "right")).toContain(
        'data-monodocs-figure="right"',
      );
      expect(mark('<figure class="mermaid"><svg></svg></figure>', format, "left")).toContain(
        'data-monodocs-figure="left"',
      );
    }
  });
});

describe("markFigures: what the key does not reach", () => {
  it("marks nothing in a table cell, which has an alignment of its own", () => {
    const cell =
      '<table><tr><td class="tableblock halign-right"><div class="content">' +
      '<div class="imageblock"><div class="content"><img src="a.png" alt="A"></div></div>' +
      "</div></td></tr></table>";
    expect(mark(cell, "asciidoc")).not.toContain("data-monodocs-figure");
    expect(
      mark('<table><tr><td><p><img src="a.png" alt="A"></p></td></tr></table>', "markdown"),
    ).not.toContain("data-monodocs-figure");
  });
});

describe("markFigures: an AsciiDoc diagram's title", () => {
  it("goes with the diagram, and a listing's title without one stays", () => {
    const listing = (inner: string) =>
      `<div class="listingblock"><div class="title">Flow</div><div class="content">${inner}</div></div>`;
    expect(mark(listing('<pre class="mermaid">graph LR</pre>'), "asciidoc", "right")).toContain(
      '<div class="title" data-monodocs-figure="right">Flow</div>',
    );
    expect(mark(listing("<pre><code>npm i</code></pre>"), "asciidoc")).not.toContain(
      "data-monodocs-figure",
    );
  });
});
