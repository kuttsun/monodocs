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
    // A URL with a fragment is not a reference into the page.
    expect(out).toContain("#fff { fill: #fff } #p-r{}");
    expect(out).toContain('fill="url(#other)"');
    expect(out).toContain('href="https://e.test/#r"');
  });

  it("leaves the IDs themselves to the caller", () => {
    expect(renamed('<svg><g id="r"></g><use href="#r"></use></svg>', { r: "p-r" })).toBe(
      '<svg><g id="r"></g><use href="#p-r"></use></svg>',
    );
  });

  it("renames a selector but not a colour spelled like an ID", () => {
    const out = renamed(
      "<svg><style>#bad { fill: #bad } @media print { #bad, .x #add > g { stroke: #add } }</style></svg>",
      { bad: "p-bad", add: "p-add" },
    );
    expect(out).toContain("#p-bad { fill: #bad }");
    expect(out).toContain("@media print { #p-bad, .x #p-add > g { stroke: #add } }");
  });

  it("leaves a #id in a string or a comment alone", () => {
    const out = renamed('<svg><style>/* #r */ #r::after { content: "#r" }</style></svg>', {
      r: "p-r",
    });
    expect(out).toContain('/* #r */ #p-r::after { content: "#r" }');
  });

  it("reads an ID written with escapes or outside ASCII, and writes the new one so CSS reads it", () => {
    const out = renamed("<svg><style>#_レイヤー_1{} #a\\:b{} #ab図{} #\\31 0{}</style></svg>", {
      _レイヤー_1: "p-_レイヤー_1",
      "a:b": "p-a:b",
      ab: "p-ab",
      "10": "p-10",
    });
    expect(out).toContain("#p-_レイヤー_1{}");
    expect(out).toContain("#p-a\\:b{}");
    // `ab図` is one name, not `ab` followed by a character.
    expect(out).toContain("#ab図{}");
    expect(out).toContain("#p-10{}");
  });

  it("leaves SMIL references as written", () => {
    const out = renamed(
      '<svg><animate begin="r.click" end="r.end"></animate>' +
        '<animate attributeName="href" values="#r"></animate></svg>',
      { r: "p-r" },
    );
    expect(out).toContain('begin="r.click" end="r.end"');
    expect(out).toContain('values="#r"');
  });

  it("reads an escaped ID inside url() as a selector's is read", () => {
    const out = renamed(
      '<svg><style>.x{fill:url(#a\\:b)}</style><rect fill="url(#a\\:b)"></rect></svg>',
      {
        "a:b": "p-a:b",
      },
    );
    expect(out).toContain(".x{fill:url(#p-a:b)}");
    expect(out).toContain('fill="url(#p-a:b)"');
  });

  it("leaves url() in text for a reader alone", () => {
    const out = renamed('<svg><text title="see url(#g)" fill="url(#g)"></text></svg>', {
      g: "p-g",
    });
    expect(out).toContain('title="see url(#g)"');
    expect(out).toContain('fill="url(#p-g)"');
  });

  it("renames the target of an href attribute selector with the href", () => {
    const out = renamed(
      `<svg><style>[href="#r"]{} a[xlink\\:href='#r']{} [title="#r"]{}</style><use href="#r"></use></svg>`,
      { r: "p-r" },
    );
    expect(out).toContain(`[href="#p-r"]{} a[xlink\\:href='#p-r']{} [title="#r"]{}`);
  });

  it("does not take a colour in an @media nested in a declaration block for a selector", () => {
    const out = renamed("<svg><style>.a { @media print { fill: #bad } }</style></svg>", {
      bad: "p-bad",
    });
    expect(out).toContain("fill: #bad");
  });

  it("reads past a `)` inside a quoted url() to the selectors after it", () => {
    const out = renamed(
      '<svg><style>.x { background: url("data:x,rgb(0,0,0)") } #r { fill: red }\n#r2 {}</style></svg>',
      { r: "p-r", r2: "p-r2" },
    );
    expect(out).toContain('url("data:x,rgb(0,0,0)") } #p-r { fill: red }\n#p-r2 {}');
  });

  it("does not take an escaped # in a name for an ID selector", () => {
    expect(renamed("<svg><style>.a\\#r{} #r{}</style></svg>", { r: "p-r" })).toContain(
      ".a\\#r{} #p-r{}",
    );
  });

  it("reads url() in any case", () => {
    const out = renamed('<svg><style>.x{fill:URL(#g)}</style><rect fill="URL(#g)"></rect></svg>', {
      g: "p-g",
    });
    expect(out).toContain(".x{fill:url(#p-g)}");
    expect(out).toContain('fill="url(#p-g)"');
  });

  it("renames the value of an attribute selector on id", () => {
    const out = renamed(
      `<svg><style>[id=r]{} [ id = "r" ]{} [id^="r"]{} [id~=r]{} [id^=ro]{} [id$=r]{}</style></svg>`,
      { r: "p-r" },
    );
    // A value that is an ID follows it; one that is only part of an ID cannot be known to.
    expect(out).toContain(
      `[id=p-r]{} [ id = "p-r" ]{} [id^="p-r"]{} [id~=p-r]{} [id^=ro]{} [id$=r]{}`,
    );
  });

  it("renames an unquoted [id=…] value written with an escape", () => {
    expect(renamed("<svg><style>[id=\\31 0]{}</style></svg>", { "10": "p-10" })).toContain(
      "[id=p-10]{}",
    );
  });

  it("does not take a colour in an at-rule's prelude for a selector", () => {
    const out = renamed("<svg><style>@supports (fill: #abc) { #abc {} }</style></svg>", {
      abc: "p-abc",
    });
    expect(out).toContain("@supports (fill: #abc) { #p-abc {} }");
  });

  it("writes a renamed ID into an unquoted url() so the URL still reads", () => {
    const out = renamed('<svg><rect fill="url(#a\\(b)"></rect></svg>', { "a(b": "p-a(b" });
    expect(out).toContain('fill="url(#p-a\\(b)"');
  });

  it("keeps its place in a stylesheet a comment splits", () => {
    const tree = fromHtml("<svg><style>.x { fill: red</style></svg>", { fragment: true }) as Root;
    const svg = tree.children.find((c): c is Element => c.type === "element")!;
    const style = svg.children.find((c): c is Element => c.type === "element")!;
    // As the parser leaves `<style>.x { fill: red<!-- c --> ; stroke: #bad } #bad {}</style>`.
    style.children.push({ type: "comment", value: " c " });
    style.children.push({ type: "text", value: " ; stroke: #bad } #bad {}" });
    renameSvgReferences(svg, (id) => (id === "bad" ? "p-bad" : undefined));
    expect(toHtml(tree)).toContain("stroke: #bad } #p-bad {}");
  });

  it("renames a selector an at-rule's prelude names", () => {
    const out = renamed(
      "<svg><style>@scope (#r) { g {} } @supports selector(#r) { #r {} }</style></svg>",
      { r: "p-r" },
    );
    expect(out).toContain("@scope (#p-r) { g {} } @supports selector(#p-r) { #p-r {} }");
  });

  it("reads an escape past the last code point as CSS does, rather than throwing", () => {
    const out = renamed("<svg><style>#\\ffffff {fill:red} #\\d800 {} #r {}</style></svg>", {
      r: "p-r",
    });
    expect(out).toContain("#\\ffffff {fill:red} #\\d800 {} #p-r {}");
  });
});
