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
  it("uses the document title (= Title) as the heading title", async () => {
    const meta = await asciidocRenderer.extractMeta(adoc("= My Title\n\nbody\n"));
    expect(meta.headingTitle).toBe("My Title");
    expect(meta.title).toBeUndefined();
  });

  it("returns undefined heading title when there is no document title", async () => {
    const meta = await asciidocRenderer.extractMeta(adoc("just a paragraph\n"));
    expect(meta.headingTitle).toBeUndefined();
    expect(meta.title).toBeUndefined();
  });

  it("reads :sd-*: attributes as metadata", async () => {
    const meta = await asciidocRenderer.extractMeta(
      adoc("= Doc\n:sd-title: Override\n:sd-order: 7\n:sd-hidden: true\n\nbody\n"),
    );
    expect(meta).toMatchObject({ title: "Override", order: 7, hidden: true });
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
