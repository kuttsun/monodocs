import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { blocksOf, sameBlock } from "./blocks";
import { alignBlocks, type BlockEdit } from "./compare";
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

const EARLIER = { svgIdPrefix: "earlier-", earlierDiagramPrefix: "mermaid-earlier-" };
const INLINE = { svgIdPrefix: "inline-", earlierDiagramPrefix: undefined };

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
    const { earlier } = writeColumns(next, old, edits, EARLIER, INLINE);
    const run = '<span class="monodocs-diff-run" data-monodocs-diff-pair="1">Shared text</span>';
    expect(toHtml(earlier)).toContain(run);
    expect(toHtml(next)).toContain(run);
  });

  it("writes a deleted block into the new tree and takes it back out, a numbered comment in its place", () => {
    const old = parser.parse("<div><p>Old.</p>Shared <em>text</em> here<p>Gone.</p></div>");
    const next = parser.parse("<div><p>New.</p>Shared <em>text</em> here</div>");
    const before = blocksOf(old);
    const after = blocksOf(next);
    const edits = diffSequences(before, after, sameBlock).map((edit): BlockEdit =>
      edit.op === "equal"
        ? { op: "equal", old: before[edit.old]!, new: after[edit.new]! }
        : edit.op === "delete"
          ? { op: "delete", old: before[edit.old]! }
          : { op: "insert", new: after[edit.new]! },
    );
    const { earlier, inline } = writeColumns(next, old, edits, EARLIER, INLINE);
    // The new tree keeps its own blocks and a comment for each deleted one, after the whole run.
    expect(toHtml(next)).toBe(
      '<div><!-- monodocs-diff-inline 0 --><p data-monodocs-diff-block="ins"><ins data-monodocs-diff="">New.</ins></p>' +
        '<span class="monodocs-diff-run" data-monodocs-diff-pair="1">Shared <em>text</em> here</span>' +
        "<!-- monodocs-diff-inline 1 --></div>",
    );
    expect(inline.map((node) => toHtml(node))).toEqual([
      '<p data-monodocs-diff-block="del"><del data-monodocs-diff="">Old.</del></p>',
      '<p data-monodocs-diff-block="del"><del data-monodocs-diff="">Gone.</del></p>',
    ]);
    // The earlier column is marked as before, its pair kept.
    expect(toHtml(earlier)).toContain(
      '<p data-monodocs-diff-block="del"><del data-monodocs-diff="">Gone.</del></p>',
    );
  });
});

describe("a changed text block (v0.20)", () => {
  /** Both versions' HTML with their blocks aligned and paired, the difference written in. */
  function changed(earlier: string, current: string) {
    const parse = () => ({ old: parser.parse(earlier), next: parser.parse(current) });
    // One column's markup, deletions in place.
    const one = parse();
    writeDifference(one.next, one.old, alignBlocks(blocksOf(one.old), blocksOf(one.next)), EARLIER);
    // Two columns, the deletions taken out of the new one.
    const two = parse();
    const edits = alignBlocks(blocksOf(two.old), blocksOf(two.next));
    const columns = writeColumns(two.next, two.old, edits, EARLIER, INLINE);
    return {
      inline: toHtml(one.next),
      earlier: toHtml(columns.earlier),
      current: toHtml(two.next),
      detached: columns.inline.map((node) => toHtml(node)),
    };
  }

  it("marks the added words, and writes the deleted ones from the earlier block before them", () => {
    const out = changed(
      '<p>Keep the <strong id="s">bold old</strong> words here.</p>',
      '<p>Keep the <strong id="s">bold new</strong> words here.</p>',
    );
    // Deleted bold text stays bold: written inside the new bold run, it takes no second one.
    expect(out.inline).toBe(
      '<p data-monodocs-diff-block="changed">Keep the <strong id="s">bold <del data-monodocs-diff="">old</del><ins data-monodocs-diff="">new</ins></strong> words here.</p>',
    );
    // The earlier column marks its deleted words where they stand; the new one takes them out to
    // a template, a comment in their place.
    expect(out.earlier).toBe(
      '<p data-monodocs-diff-pair="1" data-monodocs-diff-block="changed">Keep the <strong>bold <del data-monodocs-diff="">old</del></strong> words here.</p>',
    );
    expect(out.current).toBe(
      '<p data-monodocs-diff-pair="1" data-monodocs-diff-block="changed">Keep the <strong id="s">bold <!-- monodocs-diff-inline 0 --><ins data-monodocs-diff="">new</ins></strong> words here.</p>',
    );
    expect(out.detached).toEqual(['<del data-monodocs-diff="">old</del>']);
  });

  it("keeps deleted words inside the link they were in, and never links them", () => {
    const out = changed(
      '<p>See <a href="#x" id="l">the old guide</a> now.</p>',
      '<p>See <a href="#x" id="l">the new guide</a> now.</p>',
    );
    expect(out.inline).toBe(
      '<p data-monodocs-diff-block="changed">See <a href="#x" id="l">the <del data-monodocs-diff="">old</del><ins data-monodocs-diff="">new</ins> guide</a> now.</p>',
    );
  });

  it("puts a deletion before the next equal word, outside a link that starts there", () => {
    expect(changed("<p>One two three four five.</p>", "<p>One three four five.</p>").inline).toBe(
      '<p data-monodocs-diff-block="changed">One <del data-monodocs-diff="">two </del>three four five.</p>',
    );
    expect(
      changed(
        '<p>Read the <a href="#g">guide</a> first.</p>',
        '<p>Read <a href="#g">guide</a> first.</p>',
      ).inline,
    ).toBe(
      '<p data-monodocs-diff-block="changed">Read <del data-monodocs-diff="">the </del><a href="#g">guide</a> first.</p>',
    );
  });

  it("puts a deletion at an item's end before the list nested in it", () => {
    const out = changed(
      "<ul><li>Install the tool now<ul><li>x</li></ul></li></ul>",
      "<ul><li>Install the tool<ul><li>x</li></ul></li></ul>",
    );
    expect(out.inline).toBe(
      '<ul><li data-monodocs-diff-block="changed">Install the tool<del data-monodocs-diff=""> now</del><ul><li>x</li></ul></li></ul>',
    );
    expect(out.earlier).toBe(
      '<ul><li data-monodocs-diff-pair="1" data-monodocs-diff-block="changed">Install the tool<del data-monodocs-diff=""> now</del><ul><li data-monodocs-diff-pair="2">x</li></ul></li></ul>',
    );
  });

  it("marks what is not text whole, and writes nothing for a deleted footnote reference", () => {
    expect(
      changed(
        '<p>Press <img src="https://e.test/a.png" alt="A"> to start the build.</p>',
        '<p>Press <img src="https://e.test/b.png" alt="B"> to start the build.</p>',
      ).inline,
    ).toBe(
      '<p data-monodocs-diff-block="changed">Press <del data-monodocs-diff=""><img src="https://e.test/a.png" alt="A"></del><ins data-monodocs-diff=""><img src="https://e.test/b.png" alt="B"></ins> to start the build.</p>',
    );
    const footnote = changed(
      '<p>One<sup><a href="#fn-a" data-footnote-ref id="r">1</a></sup> and two words.</p>',
      "<p>One and two words.</p>",
    );
    expect(footnote.inline).toBe('<p data-monodocs-diff-block="changed">One and two words.</p>');
    expect(footnote.earlier).toBe(
      '<p data-monodocs-diff-pair="1" data-monodocs-diff-block="changed">One and two words.</p>',
    );
    expect(footnote.detached).toEqual([]);
  });

  it("keeps the earlier column's spaces round a deleted word set in bold", () => {
    const out = changed(
      "<p>Keep this <b>very</b> important sentence here.</p>",
      "<p>Keep this important sentence here.</p>",
    );
    expect(out.earlier).toBe(
      '<p data-monodocs-diff-pair="1" data-monodocs-diff-block="changed">Keep this <b><del data-monodocs-diff="">very</del></b><del data-monodocs-diff=""> </del>important sentence here.</p>',
    );
    // Deleted bold text written where nothing is bold stays bold, and keeps no ID.
    expect(out.detached).toEqual(['<del data-monodocs-diff=""><b>very</b> </del>']);
    // A space deleted alone is written, so the change shows.
    expect(
      changed("<p>設定 ファイルを変更した。</p>", "<p>設定ファイルを変更した。</p>").inline,
    ).toBe(
      '<p data-monodocs-diff-block="changed">設定<del data-monodocs-diff=""> </del>ファイルを変更した。</p>',
    );
  });

  it("keeps a deletion at an item's start or end inside the paragraph the item's text is in", () => {
    expect(
      changed(
        "<ul><li><p>Very foo bar baz qux</p></li></ul>",
        "<ul><li><p>foo bar baz qux</p></li></ul>",
      ).current,
    ).toBe(
      '<ul><li data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><p><!-- monodocs-diff-inline 0 -->foo bar baz qux</p></li></ul>',
    );
    expect(
      changed(
        "<ul><li><p>foo bar baz qux end</p></li></ul>",
        "<ul><li><p>foo bar baz qux</p></li></ul>",
      ).inline,
    ).toBe(
      '<ul><li data-monodocs-diff-block="changed"><p>foo bar baz qux<del data-monodocs-diff=""> end</del></p></li></ul>',
    );
    expect(
      changed(
        "<dl><dt>T</dt><dd><p>Old text here and more</p></dd></dl>",
        "<dl><dt>T</dt><dd><p>text here and more</p></dd></dl>",
      ).inline,
    ).toBe(
      '<dl><dt>T</dt><dd data-monodocs-diff-block="changed"><p><del data-monodocs-diff="">Old </del>text here and more</p></dd></dl>',
    );
  });

  it("puts a deletion before the code or bold run its replacement starts, not inside it", () => {
    expect(
      changed(
        "<p>Use <code>foo</code> to start the build.</p>",
        "<p>Use <code>bar</code> to start the build.</p>",
      ).inline,
    ).toBe(
      '<p data-monodocs-diff-block="changed">Use <del data-monodocs-diff=""><code>foo</code></del><code><ins data-monodocs-diff="">bar</ins></code> to start the build.</p>',
    );
    // In the middle of the run, the deletion is inside it, and takes no second one.
    expect(
      changed(
        "<p>Run the <code>build --old</code> command before you start.</p>",
        "<p>Run the <code>build --new</code> command before you start.</p>",
      ).inline,
    ).toBe(
      '<p data-monodocs-diff-block="changed">Run the <code>build --<del data-monodocs-diff="">old</del><ins data-monodocs-diff="">new</ins></code> command before you start.</p>',
    );
  });

  it("leaves a deleted block holding only a footnote reference as stage 1 writes it", () => {
    expect(
      changed('<p>Keep.</p><p><sup><a href="#f" data-footnote-ref>1</a></sup></p>', "<p>Keep.</p>")
        .earlier,
    ).toBe(
      '<p data-monodocs-diff-pair="1">Keep.</p><p data-monodocs-diff-block="del"><del data-monodocs-diff=""></del></p>',
    );
  });

  it("clones a character outside the BMP once, and an element of another class around it", () => {
    expect(
      changed(
        "<p>担当者は𠮷田さんから佐藤さんに変わった。</p>",
        "<p>担当者は佐藤さんに変わった。</p>",
      ).detached,
    ).toEqual(['<del data-monodocs-diff="">𠮷田さんから</del>']);
    expect(
      changed(
        '<p><span class="big">Some <span class="line-through">old</span> words in it</span></p>',
        '<p><span class="big">Some words in it</span></p>',
      ).inline,
    ).toBe(
      '<p data-monodocs-diff-block="changed"><span class="big">Some <del data-monodocs-diff=""><span class="line-through">old</span> </del>words in it</span></p>',
    );
  });

  it("gives text between blocks an element to carry its mark", () => {
    const out = changed(
      "<p>Text one</p>tail words here<p>end</p>",
      "<p>Text one</p>tail word here<p>end</p>",
    );
    expect(out.inline).toBe(
      '<p>Text one</p><span class="monodocs-diff-run" data-monodocs-diff-block="changed">tail <del data-monodocs-diff="">words</del><ins data-monodocs-diff="">word</ins> here</span><p>end</p>',
    );
    expect(out.current).toContain(
      '<span class="monodocs-diff-run" data-monodocs-diff-pair="2" data-monodocs-diff-block="changed">tail <!-- monodocs-diff-inline 0 --><ins data-monodocs-diff="">word</ins> here</span>',
    );
  });
});

describe("a changed code block, row, formula, or diagram (v0.20)", () => {
  function changed(earlier: string, current: string) {
    const old = parser.parse(earlier);
    const next = parser.parse(current);
    const columns = writeColumns(
      next,
      old,
      alignBlocks(blocksOf(old), blocksOf(next)),
      EARLIER,
      INLINE,
    );
    return {
      earlier: toHtml(columns.earlier),
      current: toHtml(next),
      detached: columns.inline.map((node) => toHtml(node)),
    };
  }

  it("marks code by line, a deleted line cloned before the line after it", () => {
    const plain = changed(
      "<pre><code>a();\nb();\nc();\n</code></pre>",
      "<pre><code>a();\nB();\nc();\nd();\n</code></pre>",
    );
    expect(plain.earlier).toBe(
      '<pre data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><code>a();\n<del data-monodocs-diff="">b();\n</del>c();\n</code></pre>',
    );
    expect(plain.current).toBe(
      '<pre data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><code>a();\n<!-- monodocs-diff-inline 0 --><ins data-monodocs-diff="">B();\n</ins>c();\n<ins data-monodocs-diff="">d();\n</ins></code></pre>',
    );
    expect(plain.detached).toEqual(['<del data-monodocs-diff="">b();\n</del>']);
    // Highlighted: each line its span and the line break after it.
    const line = (code: string) => `<span class="line"><span>${code}</span></span>`;
    const shiki = changed(
      `<pre class="shiki"><code>${line("a();")}\n${line("b();")}\n${line("c();")}</code></pre>`,
      `<pre class="shiki"><code>${line("a();")}\n${line("c();")}\n${line("e();")}</code></pre>`,
    );
    expect(shiki.current).toBe(
      `<pre class="shiki" data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><code>${line("a();")}\n<!-- monodocs-diff-inline 0 -->${line("c();")}\n<ins data-monodocs-diff="">${line("e();")}</ins></code></pre>`,
    );
    expect(shiki.detached).toEqual([`<del data-monodocs-diff="">${line("b();")}\n</del>`]);
  });

  it("marks a line split by an element spanning lines in parts, and keeps the element in its clone", () => {
    const split = changed(
      "<pre><code>p\nx <strong>a\nb</strong>\nc\nd\ne\n</code></pre>",
      "<pre><code>p\ny <strong>a\nb</strong>\nc\nd\ne\n</code></pre>",
    );
    // The parts stay inline (their class), so the line is still one line.
    expect(split.current).toBe(
      '<pre data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><code>p\n<!-- monodocs-diff-inline 0 --><ins data-monodocs-diff="" class="monodocs-diff-part">y </ins><strong><ins data-monodocs-diff="" class="monodocs-diff-part">a\n</ins>b</strong>\nc\nd\ne\n</code></pre>',
    );
    expect(split.detached).toEqual(['<del data-monodocs-diff="">x <strong>a\n</strong></del>']);
    // A deleted line inside a link spanning lines keeps the link's content, not the link.
    expect(
      changed(
        '<pre><code><a href="https://example.com">a\nb</a>\nc\n</code></pre>',
        "<pre><code>A\nb\nc\n</code></pre>",
      ).detached,
    ).toEqual(['<del data-monodocs-diff="">a\n</del>']);
    // An empty new block: the deleted line goes into its code.
    expect(
      changed(
        '<pre><code class="language-text">\nb\n</code></pre>',
        '<pre><code class="language-text"></code></pre>',
      ).detached,
    ).toEqual(['<del data-monodocs-diff="">b\n</del>']);
    // A block of one line: the deleted line stays inside its code.
    expect(
      changed(
        '<pre><code class="language-js">x\na\n</code></pre>',
        '<pre><code class="language-js">a\n</code></pre>',
      ).current,
    ).toBe(
      '<pre data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><code class="language-js"><!-- monodocs-diff-inline 0 -->a\n</code></pre>',
    );
  });

  it("marks a row cell by cell: a cell unchanged, compared, or rewritten whole", () => {
    const row = changed(
      "<table><tbody><tr><td>Bolt</td><td>4 pieces</td><td>abc</td></tr></tbody></table>",
      "<table><tbody><tr><td>Bolt</td><td>6 pieces</td><td>xyz</td></tr></tbody></table>",
    );
    expect(row.earlier).toBe(
      '<table><tbody><tr data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><td>Bolt</td><td><del data-monodocs-diff="">4</del> pieces</td><td><del data-monodocs-diff="">abc</del></td></tr></tbody></table>',
    );
    expect(row.current).toBe(
      '<table><tbody><tr data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><td>Bolt</td><td><!-- monodocs-diff-inline 0 --><ins data-monodocs-diff="">6</ins> pieces</td><td><!-- monodocs-diff-inline 1 --><ins data-monodocs-diff="">xyz</ins></td></tr></tbody></table>',
    );
  });

  it("shows a display formula old and new whole, the earlier one cloned before the new", () => {
    const formula = changed(
      '<div class="math-display" data-math-tex="a"><span>A</span></div>',
      '<div class="math-display" data-math-tex="b"><span>B</span></div>',
    );
    expect(formula.earlier).toBe(
      '<div class="math-display" data-math-tex="a" data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><del data-monodocs-diff=""><span>A</span></del></div>',
    );
    expect(formula.current).toBe(
      '<!-- monodocs-diff-inline 0 --><div class="math-display" data-math-tex="b" data-monodocs-diff-pair="1" data-monodocs-diff-block="changed"><ins data-monodocs-diff=""><span>B</span></ins></div>',
    );
    // A block deleted before it goes before the copy, not between the two.
    const between = changed(
      '<blockquote><p>Gone words.</p><div class="math-display" data-math-tex="a"><span>A</span></div></blockquote>',
      '<p>New words.</p><blockquote><div class="math-display" data-math-tex="b"><span>B</span></div></blockquote>',
    );
    // In one column: the deleted paragraph, then the earlier formula right before the new one.
    const one = between.current.replace(
      /<!-- monodocs-diff-inline (\d+) -->/g,
      (_, n: string) => between.detached[Number(n)]!,
    );
    expect(one.indexOf("Gone words")).toBeLessThan(one.indexOf('data-math-tex="a"'));
    expect(one).toMatch(/<\/div><\/del><div class="math-display" data-math-tex="b"/);
    // And a block deleted after it goes after both.
    const after = changed(
      '<div class="math-display" data-math-tex="a"><span>A</span></div><p>Gone words.</p><p>Keep.</p>',
      '<div class="math-display" data-math-tex="b"><span>B</span></div><p>Keep.</p>',
    );
    const both = after.current.replace(
      /<!-- monodocs-diff-inline (\d+) -->/g,
      (_, n: string) => after.detached[Number(n)]!,
    );
    expect(both).toMatch(/<\/div><\/del><div class="math-display" data-math-tex="b"/);
    expect(both.indexOf('data-math-tex="b"')).toBeLessThan(both.indexOf("Gone words"));
    // No mark or pair of its own: the one-column view shows it beside the changed block.
    expect(formula.detached).toEqual([
      '<del data-monodocs-diff=""><div class="math-display" data-math-tex="a"><span>A</span></div></del>',
    ]);
  });
});
