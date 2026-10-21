import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { blocksOf, sameBlock } from "./blocks";
import type { BlockEdit } from "./compare";
import { diffSequences } from "./myers";
import { assertNoEarlierId, earlierIdPrefix, elementIds, writeDifference } from "./write";

const parser = unified().use(rehypeParse, { fragment: true });

/** The new version's HTML with the difference from `earlier` written into it. */
function written(earlier: HastRoot | string, current: string, svgIdPrefix = "earlier-"): string {
  const old = typeof earlier === "string" ? parser.parse(earlier) : earlier;
  const next = parser.parse(current);
  const before = blocksOf(old);
  const after = blocksOf(next);
  const edits = diffSequences(before, after, sameBlock).map((edit): BlockEdit =>
    edit.op === "equal"
      ? { op: "equal", old: before[edit.old]!, new: after[edit.new]! }
      : edit.op === "delete"
        ? { op: "delete", old: before[edit.old]! }
        : { op: "insert", new: after[edit.new]! },
  );
  writeDifference(next, old, edits, { svgIdPrefix, earlierDiagramPrefix: "mermaid-earlier-" });
  return toHtml(next, { allowDangerousHtml: true });
}

describe("an SVG in deleted content", () => {
  it("renames every ID and every reference to one, so each still resolves inside it", () => {
    const svg =
      '<svg viewBox="0 0 10 10" aria-labelledby="p-t">' +
      '<title id="p-t">T</title><style>#p-r { fill: red } #p-rx { fill: blue }</style>' +
      '<defs><linearGradient id="p-g"></linearGradient></defs>' +
      '<rect id="p-r" fill="url(#p-g)" style="stroke: url(\'#p-g\')"></rect>' +
      '<use href="#p-r"></use><use xlink:href="#p-r"></use><use href="#elsewhere"></use></svg>';
    const html = written(`<p>Keep.</p><div>${svg}</div>`, "<p>Keep.</p>");
    expect(html).toContain('aria-labelledby="earlier-p-t"');
    expect(html).toContain('<title id="earlier-p-t">');
    expect(html).toContain("#earlier-p-r { fill: red } #p-rx { fill: blue }");
    expect(html).toContain('<linearGradient id="earlier-p-g">');
    expect(html).toContain('fill="url(#earlier-p-g)"');
    expect(html).toContain("stroke: url(&#x27;#earlier-p-g&#x27;)");
    expect(html).toContain('<use href="#earlier-p-r">');
    expect(html).toContain('<use xlink:href="#earlier-p-r">');
    // A reference to an ID the SVG does not have is not its own, and is left alone.
    expect(html).toContain('<use href="#elsewhere">');
  });
});

describe("the check that no earlier ID survives", () => {
  it("fails the build on an ID that carries neither earlier prefix", () => {
    const options = { svgIdPrefix: "earlier-", earlierDiagramPrefix: "mermaid-earlier-" };
    const node = (id: string, raw = false): Element => ({
      type: "element",
      tagName: "div",
      properties: raw ? {} : { id },
      children: raw ? [{ type: "raw", value: `<svg id="${id}"></svg>` } as never] : [],
    });
    expect(() => assertNoEarlierId(node("a-x"), options)).toThrow(
      expect.objectContaining({ code: "internal/unexpected" }),
    );
    expect(() => assertNoEarlierId(node("mermaid-3", true), options)).toThrow(
      expect.objectContaining({ code: "internal/unexpected" }),
    );
    expect(() => assertNoEarlierId(node("earlier-a-x"), options)).not.toThrow();
    expect(() => assertNoEarlierId(node("mermaid-earlier-3", true), options)).not.toThrow();
  });

  it("renames the IDs Mermaid writes without the diagram's prefix, and references to them", () => {
    const old = parser.parse('<p>Keep.</p><div class="mermaid"></div>');
    const diagram = old.children.find(
      (child) => child.type === "element" && child.tagName === "div",
    ) as { children: ElementContent[]; data?: unknown };
    diagram.children.push({
      type: "raw",
      value:
        '<svg id="mermaid-earlier-3"><style>#mermaid-earlier-3 .a{} #actor0{}</style>' +
        '<line id="actor0"></line><g id="root-0" fill="url(#actor0)"><use href="#actor0"></use></g></svg>',
    } as never);
    diagram.data = { monodocsSource: { kind: "mermaid", source: "sequenceDiagram" } };
    const html = written(old, "<p>Keep.</p>");
    expect(html).toContain(
      '<svg id="mermaid-earlier-3"><style>#mermaid-earlier-3 .a{} #earlier-actor0{}</style>' +
        '<line id="earlier-actor0"></line><g id="earlier-root-0" fill="url(#earlier-actor0)"><use href="#earlier-actor0"></use></g></svg>',
    );
  });

  it("passes an earlier diagram's own prefix", () => {
    const old = parser.parse('<p>Keep.</p><div class="mermaid"></div>');
    const diagram = old.children.find(
      (child) => child.type === "element" && child.tagName === "div",
    ) as { children: ElementContent[]; data?: unknown };
    diagram.children.push({ type: "raw", value: '<svg id="mermaid-earlier-3"></svg>' } as never);
    diagram.data = { monodocsSource: { kind: "mermaid", source: "graph TD" } };
    expect(written(old, "<p>Keep.</p>")).toContain('<svg id="mermaid-earlier-3">');
  });
});

describe("the prefix of a deleted SVG's IDs", () => {
  it("is the first no ID of the new version starts with", () => {
    const tree = (html: string) => elementIds([parser.parse(html)]);
    expect(earlierIdPrefix(tree('<p id="a-x"></p>'), ["a"])).toBe("earlier-");
    expect(earlierIdPrefix(tree('<p id="earlier-x"></p>'), ["earlier"])).toBe("earlier-2-");
    expect(
      earlierIdPrefix(tree('<p id="earlier-x"></p><p id="earlier-2-y"></p>'), ["earlier"]),
    ).toBe("earlier-3-");
    expect(earlierIdPrefix(tree('<div class="mermaid"><svg id="earlier-1"></svg></div>'), [])).toBe(
      "earlier-2-",
    );
    // A page called `earlier` has the article ID `page-earlier`, which does not take the prefix.
    expect(earlierIdPrefix([], ["earlier"])).toBe("earlier-");
  });
});
