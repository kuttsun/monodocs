import { describe, expect, it } from "vitest";
import { markdownRenderer } from "./renderer";
import type { SourceFile } from "../../types";

function md(raw: string): SourceFile {
  return { absolutePath: "/x/test.md", relativePath: "test.md", raw, format: "markdown" };
}

describe("markdownRenderer.extractMeta", () => {
  it("extracts the first H1 as the heading title", async () => {
    const meta = await markdownRenderer.extractMeta(md("# Hello\n\nbody\n"));
    expect(meta.headingTitle).toBe("Hello");
    expect(meta.title).toBeUndefined();
  });

  it("ignores YAML frontmatter when finding the H1", async () => {
    const meta = await markdownRenderer.extractMeta(md("---\nfoo: bar\n---\n\n# Real Title\n"));
    expect(meta.headingTitle).toBe("Real Title");
  });

  it("returns undefined heading title when there is no H1", async () => {
    const meta = await markdownRenderer.extractMeta(md("## Only h2\n"));
    expect(meta.headingTitle).toBeUndefined();
    expect(meta.title).toBeUndefined();
  });

  it("reads order / hidden / description from frontmatter", async () => {
    const meta = await markdownRenderer.extractMeta(
      md("---\ntitle: T\norder: 5\nhidden: true\ndescription: d\n---\n\n# H\n"),
    );
    expect(meta).toMatchObject({ title: "T", order: 5, hidden: true, description: "d" });
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

  it("renders GFM footnotes and prefixes their ids without collisions across pages", async () => {
    const src = "# T\n\nclaim[^1]\n\n[^1]: a footnote.\n";
    const a = await markdownRenderer.render(md(src), {
      page: { id: "a", route: "/a", relativePath: "a.md", format: "markdown" },
    });
    const b = await markdownRenderer.render(md(src), {
      page: { id: "b", route: "/b", relativePath: "b.md", format: "markdown" },
    });

    // 脚注が出力されている。
    expect(a.html.toLowerCase()).toContain("footnote");

    // 全 id / 内部アンカーが page id で prefix されている。
    const ids = (html: string) => [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const idsA = ids(a.html);
    const idsB = ids(b.html);
    expect(idsA.length).toBeGreaterThan(1); // 見出し + 脚注関連
    expect(idsA.every((id) => id.startsWith("a-"))).toBe(true);
    expect(idsB.every((id) => id.startsWith("b-"))).toBe(true);
    // 別ページ間で id が衝突しない。
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);

    // ページ内アンカー（href="#X"）は同一ドキュメント内の id を指す。
    const anchors = [...a.html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((target) => idsA.includes(target))).toBe(true);
  });
});
