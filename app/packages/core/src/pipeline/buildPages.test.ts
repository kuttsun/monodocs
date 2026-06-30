import { describe, expect, it } from "vitest";
import { buildPages } from "./buildPages";
import { markdownRenderer } from "../sources/markdown/renderer";
import type { SourceFile } from "../types";

function src(relativePath: string): SourceFile {
  return {
    absolutePath: "/docs/" + relativePath,
    relativePath,
    raw: "# T\n",
    format: "markdown",
  };
}

describe("buildPages collision detection", () => {
  it("throws on route collision (setup.md vs setup/index.md)", async () => {
    await expect(
      buildPages([src("setup.md"), src("setup/index.md")], [markdownRenderer]),
    ).rejects.toThrow(/route collision/i);
  });

  it("throws on page id collision (a-b.md vs a/b.md)", async () => {
    // route は /a-b と /a/b で異なるが page id はどちらも "a-b" になる。
    await expect(buildPages([src("a-b.md"), src("a/b.md")], [markdownRenderer])).rejects.toThrow(
      /page id collision/i,
    );
  });

  it("builds distinct pages without collision", async () => {
    const { pages } = await buildPages(
      [src("index.md"), src("guide/usage.md")],
      [markdownRenderer],
    );
    expect(pages.map((p) => p.id).sort()).toEqual(["guide-usage", "index"]);
  });
});

describe("buildPages title derivation", () => {
  /** H1 も frontmatter も無いので、タイトルはファイル名から導出される。 */
  function plain(relativePath: string): SourceFile {
    return {
      absolutePath: "/docs/" + relativePath,
      relativePath,
      raw: "no heading here\n",
      format: "markdown",
    };
  }

  it("strips a numeric order prefix from filename-derived titles when configured", async () => {
    const { pages } = await buildPages([plain("01_intro.md")], [markdownRenderer], {
      titleTransform: { type: "stripNumberPrefix" },
    });
    expect(pages[0]?.title).toBe("intro");
    // route は順序付けのため prefix を保持する。
    expect(pages[0]?.route).toBe("/01_intro");
  });

  it("keeps the numeric prefix in the title by default", async () => {
    const { pages } = await buildPages([plain("01_intro.md")], [markdownRenderer]);
    expect(pages[0]?.title).toBe("01_intro");
  });
});

describe("buildPages titleFrom", () => {
  function withRaw(relativePath: string, raw: string): SourceFile {
    return { absolutePath: "/docs/" + relativePath, relativePath, raw, format: "markdown" };
  }

  it("uses the H1 over the filename by default", async () => {
    const { pages } = await buildPages(
      [withRaw("getting-started.md", "# Hello\n")],
      [markdownRenderer],
    );
    expect(pages[0]?.title).toBe("Hello");
  });

  it("uses the filename even when an H1 exists with titleFrom: filename", async () => {
    const { pages, warnings } = await buildPages(
      [withRaw("getting-started.md", "# Hello\n")],
      [markdownRenderer],
      { titleFrom: "filename" },
    );
    expect(pages[0]?.title).toBe("getting-started");
    // ファイル名は指定された取得元なので、タイトル欠落の警告は出さない。
    expect(warnings).toHaveLength(0);
  });

  it("still respects an explicit frontmatter title with titleFrom: filename", async () => {
    const { pages } = await buildPages(
      [withRaw("getting-started.md", "---\ntitle: Explicit\n---\n\n# Hello\n")],
      [markdownRenderer],
      { titleFrom: "filename" },
    );
    expect(pages[0]?.title).toBe("Explicit");
  });

  it("composes with stripNumberPrefix transform (filename title, prefix kept in route)", async () => {
    const { pages } = await buildPages([withRaw("01_intro.md", "# Hello\n")], [markdownRenderer], {
      titleFrom: "filename",
      titleTransform: { type: "stripNumberPrefix" },
    });
    expect(pages[0]?.title).toBe("intro");
    expect(pages[0]?.route).toBe("/01_intro");
  });

  it("applies titleTransform to the H1 when titleFrom is heading", async () => {
    const { pages } = await buildPages([withRaw("intro.md", "# 01_Intro\n")], [markdownRenderer], {
      titleTransform: { type: "stripNumberPrefix" },
    });
    expect(pages[0]?.title).toBe("Intro");
  });

  it("does not apply titleTransform to explicit frontmatter titles", async () => {
    const { pages } = await buildPages(
      [withRaw("01_intro.md", "---\ntitle: 01_Explicit\n---\n\n# 02_Heading\n")],
      [markdownRenderer],
      { titleTransform: { type: "stripNumberPrefix" } },
    );
    expect(pages[0]?.title).toBe("01_Explicit");
  });

  it("applies regex titleTransform to implicit titles", async () => {
    const { pages } = await buildPages(
      [withRaw("intro.md", "# REQ-001: Intro\n")],
      [markdownRenderer],
      {
        titleTransform: { type: "regex", pattern: "^REQ-\\d+:\\s*", replacement: "" },
      },
    );
    expect(pages[0]?.title).toBe("Intro");
  });

  it("supports regex titleTransform flags", async () => {
    const { pages } = await buildPages(
      [withRaw("intro.md", "# req-001: REQ-002: Guide\n")],
      [markdownRenderer],
      {
        titleTransform: {
          type: "regex",
          pattern: "REQ-\\d+:\\s*",
          replacement: "",
          flags: "gi",
        },
      },
    );
    expect(pages[0]?.title).toBe("Guide");
  });
});
