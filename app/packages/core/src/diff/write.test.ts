import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { blocksOf, sameBlock } from "./blocks";
import type { BlockEdit } from "./compare";
import { diffSequences } from "./myers";
import {
  assertNoEarlierId,
  earlierIdPrefix,
  elementIds,
  writeColumns,
  writeDifference,
} from "./write";

const parser = unified().use(rehypeParse, { fragment: true });

/** The new version's HTML with the difference from `earlier` written into it. */
function written(
  earlier: HastRoot | string,
  current: string,
  svgIdPrefix = "earlier-",
  diagramPrefix: string | null = "mermaid-earlier-",
): string {
  const earlierDiagramPrefix = diagramPrefix ?? undefined;
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
  writeDifference(next, old, edits, { svgIdPrefix, earlierDiagramPrefix });
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
    // An empty ID names nothing: it is dropped rather than kept.
    expect(written('<p>Keep.</p><div><svg><g id=""></g></svg></div>', "<p>Keep.</p>")).toContain(
      '<svg data-monodocs-diff-block="del"><g></g></svg>',
    );
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
      '<svg id="mermaid-earlier-3"><style>#mermaid-earlier-3 .a{} #earlier-mermaid-earlier-3-actor0{}</style>' +
        '<line id="earlier-mermaid-earlier-3-actor0"></line><g id="earlier-mermaid-earlier-3-root-0" fill="url(#earlier-mermaid-earlier-3-actor0)"><use href="#earlier-mermaid-earlier-3-actor0"></use></g></svg>',
    );
  });

  it("reads IDs from tags alone, and gives two diagrams' IDs their own names", () => {
    const old = parser.parse('<p>Keep.</p><div class="mermaid"></div><div class="mermaid"></div>');
    const diagrams = old.children.filter(
      (child) => child.type === "element" && child.tagName === "div",
    ) as { children: ElementContent[]; data?: unknown }[];
    diagrams.forEach((diagram, n) => {
      diagram.children.push({
        type: "raw",
        value: `<svg id="mermaid-earlier-${n}"><line id="actor0"></line><text>user id = 5, set id="x"</text></svg>`,
      } as never);
      diagram.data = { monodocsSource: { kind: "mermaid", source: `sequenceDiagram ${n}` } };
    });
    const html = written(old, "<p>Keep.</p>");
    expect(html).toContain('<line id="earlier-mermaid-earlier-0-actor0">');
    expect(html).toContain('<line id="earlier-mermaid-earlier-1-actor0">');
    expect(html.match(/user id = 5, set id="x"/g)?.length).toBe(2);
  });

  it("renames a diagram's own ID too when a new ID shares the earlier diagrams' prefix", () => {
    const old = parser.parse('<p>Keep.</p><div class="mermaid"></div>');
    const diagram = old.children.find(
      (child) => child.type === "element" && child.tagName === "div",
    ) as { children: ElementContent[]; data?: unknown };
    diagram.children.push({
      type: "raw",
      value: '<svg id="mermaid-earlier-0"><style>#mermaid-earlier-0 .a{}</style></svg>',
    } as never);
    diagram.data = { monodocsSource: { kind: "mermaid", source: "graph TD" } };
    const html = written(old, "<p>Keep.</p>", "earlier-", null);
    expect(html).toContain(
      '<svg id="earlier-mermaid-earlier-0-mermaid-earlier-0"><style>#earlier-mermaid-earlier-0-mermaid-earlier-0 .a{}</style>',
    );
  });

  it("keeps no link inside a deleted SVG or diagram, but keeps references within it", () => {
    const inline =
      '<svg viewBox="0 0 1 1"><a href="#/other"><text>t</text></a><a href="#p-x"><rect id="p-x"></rect></a></svg>';
    const html = written(`<p>Keep.</p><div>${inline}</div>`, "<p>Keep.</p>");
    expect(html).toContain("<a><text>t</text></a>");
    expect(html).toContain('<a href="#earlier-p-x">');
    const old = parser.parse('<p>Keep.</p><div class="mermaid"></div>');
    const diagram = old.children.find(
      (child) => child.type === "element" && child.tagName === "div",
    ) as { children: ElementContent[]; data?: unknown };
    diagram.children.push({
      type: "raw",
      value:
        '<svg id="mermaid-earlier-0"><a xlink:href="https://example.com" href="page.html"><g></g></a></svg>',
    } as never);
    diagram.data = { monodocsSource: { kind: "mermaid", source: "graph TD" } };
    expect(written(old, "<p>Keep.</p>")).toContain(
      '<svg id="mermaid-earlier-0"><a><g></g></a></svg>',
    );
  });

  it("renames the attributes that name a renamed ID, so a diagram keeps its accessible name", () => {
    const old = parser.parse('<p>Keep.</p><div class="mermaid"></div>');
    const diagram = old.children.find(
      (child) => child.type === "element" && child.tagName === "div",
    ) as { children: ElementContent[]; data?: unknown };
    diagram.children.push({
      type: "raw",
      value:
        '<svg id="mermaid-earlier-3" aria-labelledby="chart-title-mermaid-earlier-3" aria-describedby="chart-desc-mermaid-earlier-3 other">' +
        '<title id="chart-title-mermaid-earlier-3">T</title><desc id="chart-desc-mermaid-earlier-3">D</desc></svg>',
    } as never);
    diagram.data = { monodocsSource: { kind: "mermaid", source: "graph TD" } };
    const html = written(old, "<p>Keep.</p>");
    const title = "earlier-mermaid-earlier-3-chart-title-mermaid-earlier-3";
    const desc = "earlier-mermaid-earlier-3-chart-desc-mermaid-earlier-3";
    expect(html).toContain(`aria-labelledby="${title}" aria-describedby="${desc} other"`);
    expect(html).toContain(`<title id="${title}">`);
    expect(html).toContain(`<desc id="${desc}">`);
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

describe("two columns", () => {
  it("pairs text between blocks by an element of its own in each column", () => {
    const old = parser.parse("<div><p>Old.</p>Shared text<p>End.</p></div>");
    const next = parser.parse("<div><p>New.</p>Shared text<p>End.</p></div>");
    const before = blocksOf(old);
    const after = blocksOf(next);
    const edits = diffSequences(before, after, sameBlock).map((edit): BlockEdit =>
      edit.op === "equal"
        ? { op: "equal", old: before[edit.old]!, new: after[edit.new]! }
        : edit.op === "delete"
          ? { op: "delete", old: before[edit.old]! }
          : { op: "insert", new: after[edit.new]! },
    );
    const earlier = writeColumns(next, old, edits, {
      svgIdPrefix: "earlier-",
      earlierDiagramPrefix: "mermaid-earlier-",
    });
    const run = '<span class="monodocs-diff-run" data-monodocs-diff-pair="1">Shared text</span>';
    expect(toHtml(earlier)).toContain(run);
    expect(toHtml(next)).toContain(run);
  });
});
