import katex from "katex";
import { describe, expect, it } from "vitest";
import { createAsciiMathParser } from "./math";

/** The text KaTeX draws for some TeX, from its MathML, or the error it raises. */
function drawn(tex: string): string {
  const html = katex.renderToString(tex, { output: "mathml", throwOnError: true, strict: "error" });
  return html
    .replace(/<annotation[\s\S]*/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/⁡/g, "");
}

describe("asciimath to TeX (v0.16)", () => {
  const parser = createAsciiMathParser();

  it("writes the capitalised functions as operators KaTeX has", () => {
    for (const name of "Sin Cos Tan Sinh Cosh Tanh Cot Sec Csc Arcsin Arccos Arctan Log Ln".split(
      " ",
    )) {
      const tex = parser.parse(`${name}(x)`);
      expect(tex).toContain(`\\operatorname{${name}}`);
      expect(drawn(tex)).toBe(`${name}(x)`);
    }
  });

  it("writes >->> as the arrow it names", () => {
    expect(drawn(parser.parse("a >->> b"))).toBe("a⤖b");
    expect(drawn(parser.parse("a twoheadrightarrowtail b"))).toBe("a⤖b");
  });

  it("keeps the characters TeX reads as markup as characters", () => {
    expect(drawn(parser.parse("a & b # c $ d ~ e % f"))).toBe("a&b#c$d~e%f");
    // Longer symbols that start with one of them still win.
    expect(drawn(parser.parse("a ~~ b ~= c"))).toBe("a≈b≅c");
  });

  it("escapes what text cannot take as it is", () => {
    for (const text of ["a % b", "a & b # c", "$5 ~ 6", "x^2_y", "a \\ b", "{x}"]) {
      expect(drawn(parser.parse(`text(${text})`))).toBe(text.replace(/ /g, " "));
      expect(drawn(parser.parse(`"${text}"`))).toBe(text.replace(/ /g, " "));
    }
  });

  it("draws the styles ASCIIMathML defines as it does, and refuses those KaTeX cannot draw", () => {
    const variant = (tex: string) =>
      /mathvariant="([^"]+)"/.exec(katex.renderToString(tex, { output: "mathml" }))?.[1];
    for (const [asciimath, style] of [
      ["mathbf(A)", "bold"],
      ["bold(A)", "bold"],
      ["mathsf(A)", "sans-serif"],
      ["sfit(A)", "sans-serif-italic"],
      ["bbit(A)", "bold-italic"],
    ]) {
      expect([asciimath, variant(parser.parse(asciimath!))]).toEqual([asciimath, style]);
    }
    // A single letter is italic without a mathvariant, so these are checked as the TeX they become.
    expect(parser.parse("italic(A) mathit(B)")).toBe("\\mathit{A} \\mathit{B}");
    expect(drawn(parser.parse("overarc(AB)"))).toContain("⏠");
    // `bbit` is read whole, not as `bb` followed by `it`.
    expect(parser.parse("bbit(A)")).toBe("\\boldsymbol{A}");
    for (const asciimath of ["bbsf(A)", "bbsfit(A)", "bbcc(A)", "bbfr(A)"]) {
      expect(() => drawn(parser.parse(asciimath))).toThrow(/Undefined control sequence/);
    }
    // ASCIIMathML's class and id are left out, since a symbol is matched inside a word.
    expect(drawn(parser.parse("t_(mid) + width"))).toBe("tmid+width");
  });

  it("reads brackets in time however deeply they nest", () => {
    // Twenty levels of `|(` took minutes before each position was remembered within a parse.
    const nested = "|(".repeat(20) + "x" + ")|".repeat(20);
    const started = performance.now();
    expect(drawn(parser.parse(nested))).toContain("x");
    expect(performance.now() - started).toBeLessThan(2000);
    // And a parse leaves nothing behind for the next one.
    expect(parser.parse("a/b")).toBe("\\frac{a}{b}");
  });

  it("keeps text from KaTeX's ligatures, and brackets made of ~ and | as brackets", () => {
    // Dashes stay as typed. KaTeX's text font draws a quote character as a typographic quote whatever
    // its escape, so two stay two rather than becoming one double quote.
    expect(drawn(parser.parse("text(a--b c---d)"))).toBe("a--b\u00A0c---d");
    expect(drawn(parser.parse("text(x'')"))).toBe("x’’");
    expect(drawn(parser.parse("|~ x ~|"))).toBe("⌈x⌉");
  });
});
