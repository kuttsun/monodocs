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
