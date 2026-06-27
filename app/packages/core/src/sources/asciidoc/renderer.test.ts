import { describe, expect, it } from "vitest";
import { asciidocRenderer } from "./renderer";
import type { RenderContext, SourceFile } from "../../types";

function adoc(raw: string): SourceFile {
  return { absolutePath: "/x/t.adoc", relativePath: "t.adoc", raw, format: "asciidoc" };
}

const ctx: RenderContext = {
  page: { id: "p", route: "/p", relativePath: "t.adoc", format: "asciidoc" },
};

describe("asciidocRenderer.extractMeta", () => {
  it("uses the document title (= Title)", async () => {
    const meta = await asciidocRenderer.extractMeta(adoc("= My Title\n\nbody\n"));
    expect(meta.title).toBe("My Title");
  });

  it("returns undefined when there is no document title", async () => {
    const meta = await asciidocRenderer.extractMeta(adoc("just a paragraph\n"));
    expect(meta.title).toBeUndefined();
  });
});

describe("asciidocRenderer.render", () => {
  it("converts to HTML and prefixes section ids with the page id", async () => {
    const rendered = await asciidocRenderer.render(adoc("= T\n\n== Section\n\ncontent\n"), ctx);
    expect(rendered.html).toContain('id="p-_section"');
    expect(rendered.headings.some((h) => h.id === "p-_section")).toBe(true);
  });

  it("rewrites in-document cross references to the prefixed id", async () => {
    const rendered = await asciidocRenderer.render(
      adoc("= T\n\n== Section\n\n<<_section,go>>\n"),
      ctx,
    );
    expect(rendered.html).toContain('href="#p-_section"');
  });
});
