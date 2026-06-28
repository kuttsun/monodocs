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

  it("strips a numeric order prefix from filename-derived titles when enabled", async () => {
    const { pages } = await buildPages([plain("01_intro.md")], [markdownRenderer], {
      stripNumberPrefix: true,
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
