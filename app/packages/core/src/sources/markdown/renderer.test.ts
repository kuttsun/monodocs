import { describe, expect, it } from "vitest";
import { markdownRenderer } from "./renderer";
import type { SourceFile } from "../../types";

function md(raw: string): SourceFile {
  return { absolutePath: "/x/test.md", relativePath: "test.md", raw, format: "markdown" };
}

describe("markdownRenderer.extractMeta", () => {
  it("extracts the first H1 as the title", async () => {
    const meta = await markdownRenderer.extractMeta(md("# Hello\n\nbody\n"));
    expect(meta.title).toBe("Hello");
  });

  it("ignores YAML frontmatter when finding the H1", async () => {
    const meta = await markdownRenderer.extractMeta(md("---\nfoo: bar\n---\n\n# Real Title\n"));
    expect(meta.title).toBe("Real Title");
  });

  it("returns undefined title when there is no H1", async () => {
    const meta = await markdownRenderer.extractMeta(md("## Only h2\n"));
    expect(meta.title).toBeUndefined();
  });
});

describe("markdownRenderer.render", () => {
  it("prefixes heading ids with the page id and collects headings", async () => {
    const rendered = await markdownRenderer.render(md("# Title\n\n## Section\n"), {
      page: {
        id: "setup-install",
        route: "/setup/install",
        relativePath: "setup/install.md",
        format: "markdown",
      },
    });
    expect(rendered.html).toContain('id="setup-install-section"');
    expect(rendered.headings.map((h) => h.id)).toContain("setup-install-section");
  });

  it("renders GFM task lists", async () => {
    const rendered = await markdownRenderer.render(md("- [x] done\n- [ ] todo\n"), {
      page: { id: "p", route: "/p", relativePath: "p.md", format: "markdown" },
    });
    expect(rendered.html).toContain('type="checkbox"');
  });
});
