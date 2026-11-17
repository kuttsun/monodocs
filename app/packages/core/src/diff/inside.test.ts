import type { Element, ElementContent, Root, Text } from "hast";
import { describe, expect, it } from "vitest";
import { blocksOf } from "./blocks";
import { Atoms, extract, insideDifference, linesOf, type TextPlan } from "./inside";
import { formatDifference } from "./text";

const h = (
  tagName: string,
  properties: Element["properties"],
  children: ElementContent[] = [],
  data?: Element["data"],
): Element => ({ type: "element", tagName, properties, children, ...(data ? { data } : {}) });
const text = (value: string, data?: Text["data"]): Text => ({
  type: "text",
  value,
  ...(data ? { data } : {}),
});
const root = (...children: ElementContent[]): Root => ({ type: "root", children });
const blocks = (tree: Root) => blocksOf(tree, "page");
const inside = (a: Root, b: Root) => insideDifference(blocks(a)[0]!, blocks(b)[0]!);
const asText = (plan: ReturnType<typeof inside>) =>
  formatDifference({ whole: false, segments: (plan as TextPlan).segments });

describe("extract", () => {
  it("collapses whitespace by White_Space, trims it, and maps each unit to its text node", () => {
    const a = text("  one 　 ");
    const b = text("two  ");
    const out = extract([a, h("b", {}, [b])], new Atoms(), "page");
    expect(out.text).toBe("one two");
    expect(out.origin).toHaveLength(7);
    expect(out.origin[0]).toEqual({ node: a, start: 2, end: 3 });
    // The space stands for all the whitespace after "one", in the node it is in.
    expect(out.origin[3]).toEqual({ space: [{ node: a, start: 5, end: 8 }] });
    expect(out.origin[4]).toEqual({ node: b, start: 0, end: 1 });
  });

  it("maps a space whose whitespace spans two text nodes to both", () => {
    const a = text("a ");
    const b = text(" b");
    const out = extract([a, h("em", {}, [b])], new Atoms(), "page");
    expect(out.text).toBe("a b");
    expect(out.origin[1]).toEqual({
      space: [
        { node: a, start: 1, end: 2 },
        { node: b, start: 0, end: 1 },
      ],
    });
  });

  it("leaves generated numbers and section-number elements out", () => {
    const out = extract(
      [
        h("span", { dataMonodocsSectionNumber: "1.2" }, [text("1.2")]),
        text("2.3", { monodocsGenerated: true } as Text["data"]),
        text(". ", { monodocsGeneratedSeparator: true } as Text["data"]),
        text("Title"),
      ],
      new Atoms(),
      "page",
    );
    expect(out.text).toBe("Title");
  });

  it("takes the space after a generated number, and none where nothing follows it but text", () => {
    const word = text("Figure ");
    const number = () => text("1", { monodocsGenerated: true } as Text["data"]);
    const after = text(" again");
    const out = extract([h("a", {}, [word, number()]), after], new Atoms(), "page");
    expect(out.text).toBe("Figure again");
    expect(out.origin[6]).toEqual({ space: [{ node: after, start: 0, end: 1 }] });
    expect(
      extract([h("a", {}, [text("Figure "), number()]), text(".")], new Atoms(), "page").text,
    ).toBe("Figure.");
  });

  it("writes what is not text as one private-use character per key, the same for the same key", () => {
    const atoms = new Atoms();
    const math = (tex: string) => h("span", { className: ["math"], dataMathTex: tex }, [text("x")]);
    const out = extract(
      [
        text("a"),
        math("x^2"),
        h("br", {}),
        h("img", { src: "i.png", alt: "I" }),
        h("sup", {}, [h("a", { dataFootnoteRef: "" }, [text("1")])]),
        h("input", { type: "checkbox", checked: true }),
        math("x^2"),
      ],
      atoms,
      "page",
    );
    const chars = [...out.text];
    expect(chars).toHaveLength(7);
    expect(chars[0]).toBe("a");
    for (const ch of chars.slice(1)) expect(ch.codePointAt(0)!).toBeGreaterThanOrEqual(0xf0000);
    // The same formula is the same character; different things differ.
    expect(chars[1]).toBe(chars[6]);
    expect(new Set(chars.slice(1, 6)).size).toBe(5);
    expect(out.origin[1]).toMatchObject({ atom: { tagName: "span" } });
  });

  it("starts the private-use characters above any the text already holds", () => {
    const atoms = new Atoms("\u{F0005}");
    expect(atoms.of("k").codePointAt(0)).toBe(0xf0006);
    expect(atoms.of("k")).toBe(atoms.of("k"));
    // Plane 15 ends in two noncharacters: the next character is Plane 16's first.
    const edge = new Atoms("\u{FFFFC}");
    expect(edge.of("a").codePointAt(0)).toBe(0xffffd);
    expect(edge.of("b").codePointAt(0)).toBe(0x100000);
    expect(new Atoms("\u{FFFFD}").of("a").codePointAt(0)).toBe(0x100000);
    expect(new Atoms("\u{FFFFE}").of("a").codePointAt(0)).toBe(0x100000);
  });

  it("says when it runs out of characters, rather than reusing one", () => {
    const atoms = new Atoms("\u{10FFFC}");
    expect(atoms.of("a").codePointAt(0)).toBe(0x10fffd);
    expect(atoms.overflowed).toBe(false);
    atoms.of("b");
    expect(atoms.overflowed).toBe(true);
  });

  it("reads plain text as the block's key does", () => {
    for (const tree of [
      root(h("p", {}, [text(" A  paragraph, "), h("em", {}, [text("with")]), text(" emphasis. ")])),
      root(
        h("ul", {}, [
          h("li", {}, [h("p", {}, [text("Item")]), h("ul", {}, [h("li", {}, [text("Nested")])])]),
        ]),
      ),
      root(
        h("h2", {}, [h("span", { dataMonodocsSectionNumber: "1" }, [text("1")]), text(" Heading")]),
      ),
    ]) {
      for (const block of blocks(tree)) {
        expect(extract(block.own!, new Atoms(), "page").text, block.key).toBe(block.key);
      }
    }
  });
});

describe("linesOf", () => {
  it("splits plain code and highlighted code into the same lines", () => {
    const plain = h("pre", {}, [h("code", {}, [text("let a = 1;\nlet b = 2;\n")])]);
    const line = (s: string) => h("span", { className: ["line"] }, [h("span", {}, [text(s)])]);
    const shiki = h("pre", { className: ["shiki"] }, [
      h("code", {}, [line("let a = 1;"), text("\n"), line("let b = 2;")]),
    ]);
    expect(linesOf(plain).map((l) => l.text)).toEqual(["let a = 1;", "let b = 2;"]);
    expect(linesOf(shiki).map((l) => l.text)).toEqual(["let a = 1;", "let b = 2;"]);
    expect(linesOf(h("pre", {}, [])).map((l) => l.text)).toEqual([""]);
    // A carriage return before a line break is not part of the line.
    expect(linesOf(h("pre", {}, [text("a\r\nb\r\n")])).map((l) => l.text)).toEqual(["a", "b"]);
    // A generated number is not part of the line, as the key's source leaves it out.
    const numbered = h("pre", {}, [
      text("see "),
      text("3", { monodocsGenerated: true } as Text["data"]),
      text("\nkept\n"),
    ]);
    expect(linesOf(numbered).map((l) => l.text)).toEqual(["see ", "kept"]);
    const broken = h("pre", {}, [
      text("same"),
      h("br", {}),
      text("old"),
      h("br", {}),
      text("tail"),
    ]);
    expect(linesOf(broken).map((l) => l.text)).toEqual(["same", "old", "tail"]);
  });
});

describe("insideDifference", () => {
  const p = (...children: ElementContent[]) => root(h("p", {}, children));

  it("pairs two paragraphs that keep half of themselves, with their tokens compared", () => {
    const plan = inside(
      p(text("Set the output directory first.")),
      p(text("Set the output folder first.")),
    );
    expect(plan?.kind).toBe("text");
    expect(asText(plan)).toBe("Set the output [-directory-]{+folder+} first.");
  });

  it("does not pair blocks whose kinds or chains differ, or that keep less than half", () => {
    expect(
      inside(p(text("Same words here")), root(h("h2", {}, [text("Same words here")]))),
    ).toBeUndefined();
    expect(
      inside(
        p(text("Same words here")),
        root(h("blockquote", {}, [h("p", {}, [text("Same words here!")])])),
      ),
    ).toBeUndefined();
    expect(
      inside(
        p(text("旧版の設定で組み、新版の見た目で出す。")),
        p(text("新版の設定で組み直し、旧版と比べる。")),
      ),
    ).toBeUndefined();
  });

  it("keeps what is not text a token of its own, beside a combining mark", () => {
    const img = () => h("img", { src: "i.png", alt: "I" });
    // The mark after the image is deleted: the image is kept, not deleted and added again.
    const plan = inside(
      p(text("Look "), img(), text("\u0301 here")),
      p(text("Look "), img(), text(" here")),
    );
    expect(plan?.kind).toBe("text");
    const segments = (plan as TextPlan).segments;
    expect(segments.filter((s) => s.op !== "equal").map((s) => s.text)).toEqual(["\u0301"]);
  });

  it("does not pair blocks that read the same inside, though their keys differ", () => {
    // NEXT LINE is whitespace by White_Space, which the key's \s does not read as such.
    expect(inside(p(text("one two three")), p(text("one\u0085two three")))).toBeUndefined();
  });

  it("compares the text of a list item without what is nested in it", () => {
    const item = (own: string, nested: string) =>
      root(h("ul", {}, [h("li", {}, [text(own), h("ul", {}, [h("li", {}, [text(nested)])])])]));
    expect(asText(inside(item("Install the tool", "x"), item("Install the CLI", "y")))).toBe(
      "Install the [-tool-]{+CLI+}",
    );
  });

  it("compares code by line when the language agrees", () => {
    const code = (lang: string, body: string) =>
      root(
        h("pre", {}, [h("code", {}, [text(body)])], {
          monodocsSource: { kind: "code", lang, source: body },
        }),
      );
    const plan = inside(code("js", "a();\nb();\nc();\n"), code("js", "a();\nB();\nc();\n"));
    expect(plan?.kind).toBe("code");
    if (plan?.kind === "code") {
      expect(plan.edits.map((e) => e.op)).toEqual(["equal", "delete", "insert", "equal"]);
    }
    expect(inside(code("js", "a();\nb();\n"), code("ts", "a();\nb();\n"))).toBeUndefined();
    // A generated number highlighting left unmarked: the lines are compared in the source, which
    // leaves it out, so the line it is in is equal and the pair keeps two lines of three.
    const numbered = (rendered: string, source: string) =>
      root(
        h("pre", {}, [h("code", {}, [text(rendered)])], {
          monodocsSource: { kind: "code", lang: "js", source },
        }),
      );
    const renumbered = inside(
      numbered("see(1);\nold();\ntail();\n", "see();\nold();\ntail();\n"),
      numbered("see(2);\nnew();\ntail();\n", "see();\nnew();\ntail();\n"),
    );
    expect(renumbered?.kind === "code" && renumbered.edits.map((e) => e.op)).toEqual([
      "equal",
      "delete",
      "insert",
      "equal",
    ]);
    // Less than half of the lines kept: not paired.
    expect(inside(code("js", "a\nb\nc\n"), code("js", "x\ny\nc\n"))).toBeUndefined();
  });

  it("compares a row cell by cell when its cells agree in number, kind, and span", () => {
    const row = (...cells: [string, string, number?][]) =>
      root(
        h("table", {}, [
          h("tbody", {}, [
            h(
              "tr",
              {},
              cells.map(([tag, value, span]) =>
                h(tag, span ? { colSpan: span } : {}, [text(value)]),
              ),
            ),
          ]),
        ]),
      );
    const plan = inside(
      row(["td", "Bolt"], ["td", "4 pieces"]),
      row(["td", "Bolt"], ["td", "6 pieces"]),
    );
    expect(plan?.kind).toBe("row");
    if (plan?.kind === "row") {
      expect(plan.cells[0]).toBe("same");
      expect(asText(plan.cells[1] as TextPlan)).toBe("[-4-]{+6+} pieces");
    }
    // A cell rewritten whole is shown whole; the row is still paired.
    const rewritten = inside(
      row(["td", "Bolt"], ["td", "abc"]),
      row(["td", "Bolt"], ["td", "xyz"]),
    );
    expect(rewritten?.kind === "row" && rewritten.cells[1]).toBe("whole");
    expect(inside(row(["td", "a"], ["td", "b"]), row(["td", "a"], ["th", "b"]))).toBeUndefined();
    // A row whose cells read the same here is not a pair with nothing inside.
    expect(
      inside(row(["td", "a b"], ["td", "c"]), row(["td", "a\u0085b"], ["td", "c"])),
    ).toBeUndefined();
    expect(inside(row(["td", "a"], ["td", "b"]), row(["td", "a"], ["td", "b", 2]))).toBeUndefined();
    // Out of private-use characters, a cell with a changed image is not read as the same.
    const imaged = (src: string, value: string) =>
      root(
        h("table", {}, [
          h("tbody", {}, [
            h("tr", {}, [
              h("td", {}, [text("\u{10FFFD}"), h("img", { src, alt: "" })]),
              h("td", {}, [text(value)]),
            ]),
          ]),
        ]),
      );
    const overflowed = inside(imaged("a.png", "abc"), imaged("b.png", "xyz"));
    expect(overflowed?.kind === "row" && overflowed.cells).toEqual(["whole", "whole"]);
    expect(inside(row(["td", "a"], ["td", "b"]), row(["td", "a"]))).toBeUndefined();
  });

  it("compares a cell that holds blocks as the row's key does, whole when it changed", () => {
    const row = (blocky: string, plain: string) =>
      root(
        h("table", {}, [
          h("tbody", {}, [
            h("tr", {}, [
              h("td", {}, [h("div", { className: ["paragraph"] }, [h("p", {}, [text(blocky)])])]),
              h("td", {}, [text(plain)]),
            ]),
          ]),
        ]),
      );
    const kept = inside(row("Kept block", "one two three"), row("Kept block", "one two four"));
    expect(kept?.kind === "row" && kept.cells[0]).toBe("same");
    const changed = inside(row("Old block", "one two three"), row("New block", "one two four"));
    expect(changed?.kind === "row" && changed.cells[0]).toBe("whole");
  });

  it("shows a display formula and a diagram whole, and does not pair an image", () => {
    const formula = (tex: string) =>
      root(h("div", { className: ["math-display"], dataMathTex: tex }, []));
    expect(inside(formula("a"), formula("b"))).toEqual({ kind: "whole" });
    const image = (src: string) => root(h("img", { src, alt: "" }));
    expect(inside(image("a.png"), image("b.png"))).toBeUndefined();
  });
});
