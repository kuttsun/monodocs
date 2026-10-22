import type { Element, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { describe, expect, it } from "vitest";
import { renameSvgReferences } from "./svgIds";

/** Parse an SVG, rename its references through `map`, and write it back. */
function renamed(svg: string, map: Record<string, string>): string {
  const tree = fromHtml(svg, { fragment: true }) as Root;
  const root = tree.children.find((c): c is Element => c.type === "element")!;
  renameSvgReferences(root, (id) => map[id]);
  return toHtml(tree);
}

describe("renameSvgReferences", () => {
  it("renames a url() in a stylesheet once, not again as a selector", () => {
    const out = renamed("<svg><style>#g { fill: url(#g) } .x{stroke:url( '#g' )}</style></svg>", {
      g: "p-g",
    });
    expect(out).toContain("#p-g { fill: url(#p-g) }");
    expect(out).toContain(".x{stroke:url('#p-g')}");
  });

  it("renames each of several IDs an attribute names", () => {
    const out = renamed('<svg aria-describedby="a b c"><desc id="a"></desc></svg>', {
      a: "p-a",
      c: "p-c",
    });
    expect(out).toContain('aria-describedby="p-a b p-c"');
  });

  it("leaves what is not a known ID as written", () => {
    const out = renamed(
      '<svg><style>#fff { fill: #fff } #r{}</style><rect fill="url(#other)"></rect><a href="https://e.test/#r"></a></svg>',
      { r: "p-r" },
    );
    // A colour is not a selector here only because no ID is called fff; a URL with a fragment is
    // not a reference into the page.
    expect(out).toContain("#fff { fill: #fff } #p-r{}");
    expect(out).toContain('fill="url(#other)"');
    expect(out).toContain('href="https://e.test/#r"');
  });

  it("leaves the IDs themselves to the caller", () => {
    expect(renamed('<svg><g id="r"></g><use href="#r"></use></svg>', { r: "p-r" })).toBe(
      '<svg><g id="r"></g><use href="#p-r"></use></svg>',
    );
  });
});
