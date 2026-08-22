import { describe, expect, it } from "vitest";
import { markdownRenderer } from "./renderer";
import { isPageBreakMarker } from "./pageBreak";
import type { SourceFile } from "../../types";

function md(raw: string): SourceFile {
  return { absolutePath: "/x/test.md", relativePath: "test.md", raw, format: "markdown" };
}

async function html(raw: string): Promise<string> {
  const rendered = await markdownRenderer.render(md(raw), {
    page: { id: "p", route: "/", relativePath: "test.md", format: "markdown" },
  });
  return rendered.html;
}

describe("the page-break marker in Markdown", () => {
  it("accepts the two documented spellings", async () => {
    for (const marker of [
      '<div class="page-break"></div>',
      "<div class='page-break'></div>",
      '<div style="page-break-after: always"></div>',
      '<div style="page-break-after:always"></div>',
      '<div style="page-break-after: always;"></div>',
      '<div  class = "page-break" ></div>',
    ]) {
      expect(isPageBreakMarker(marker), marker).toBe(true);
      // Every spelling normalises to the class form, which is the one Asciidoctor emits for `<<<`,
      // so a single print rule serves both formats.
      expect(await html(`A\n\n${marker}\n\nB\n`), marker).toContain(
        '<div class="page-break"></div>',
      );
    }
  });

  it("rejects everything else, which stays dropped like any other raw HTML", async () => {
    for (const rejected of [
      '<DIV class="page-break"></DIV>',
      '<div class="page-break foo"></div>',
      '<div class="page-breaks"></div>',
      '<div id="x" class="page-break"></div>',
      '<div class="page-break" onclick="alert(1)"></div>',
      '<div class="page-break"/>',
      '<div class="page-break"> </div>',
      '<div class="page-break">text</div>',
      '<span class="page-break"></span>',
      '<div style="page-break-after: always; color: red"></div>',
      '<div style="break-after: page"></div>',
      "<!-- page-break -->",
    ]) {
      expect(isPageBreakMarker(rejected), rejected).toBe(false);
      const out = await html(`A\n\n${rejected}\n\nB\n`);
      expect(out, rejected).not.toContain("page-break");
      expect(out, rejected).toContain("<p>A</p>");
    }
  });

  it("is a block of its own, not something inside another block", async () => {
    // A marker inside a blockquote, a list item, or a table cell would ask Chromium to break inside
    // a block the print stylesheet keeps together, so it is not a marker there.
    for (const raw of [
      '> <div class="page-break"></div>\n',
      '- <div class="page-break"></div>\n',
      '| a |\n| --- |\n| <div class="page-break"></div> |\n',
      '# <div class="page-break"></div>\n',
    ]) {
      expect(await html(raw), raw).not.toContain('class="page-break"');
    }
  });

  it("does not turn raw HTML back on", async () => {
    const out = await html(
      '<script>alert(1)</script>\n\n<div class="page-break"></div>\n\n<img src=x onerror=y>\n',
    );
    expect(out).toContain('<div class="page-break"></div>');
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
  });

  it("contributes nothing to the search text", async () => {
    const rendered = await markdownRenderer.render(
      md('A\n\n<div class="page-break"></div>\n\nB\n'),
      {
        page: { id: "p", route: "/", relativePath: "test.md", format: "markdown" },
      },
    );
    expect(rendered.text).not.toContain("page-break");
  });
});
