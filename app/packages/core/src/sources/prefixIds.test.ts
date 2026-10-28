import type { Element, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { describe, expect, it } from "vitest";
import { prefixIdsAndCollect } from "./prefixIds";

describe("prefixIdsAndCollect and an inline SVG", () => {
  // An old ID can be another ID's new name: on page `a`, `r` becomes `a-r`, and `a-r` becomes
  // `a-a-r`. A reference renamed twice would land on the wrong element.
  it("renames each reference inside the SVG once", () => {
    const tree = fromHtml(
      '<p id="a-r">outside</p><a href="#r">to r</a>' +
        '<svg><g id="r"></g><a href="#r"></a><use href="#a-r"></use>' +
        '<svg><a href="#r"></a></svg></svg>',
      { fragment: true },
    ) as Root;
    prefixIdsAndCollect(tree, "a");
    const html = toHtml(tree);
    const svg = tree.children.find(
      (c): c is Element => c.type === "element" && c.tagName === "svg",
    );
    const inside = toHtml(svg!);
    expect(inside.match(/<a href="#a-r">/g)).toHaveLength(2);
    expect(inside).toContain('<use href="#a-a-r">');
    expect(inside).not.toContain("#a-a-a-r");
    // Outside the SVG the link is renamed once too.
    expect(html).toContain('<a href="#a-r">to r</a>');
  });
});
