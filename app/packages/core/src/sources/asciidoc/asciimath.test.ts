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
});
