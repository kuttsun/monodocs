import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toHtml } from "hast-util-to-html";
import { describe, expect, it } from "vitest";
import { renderFormula, styledCharacter } from "./mathRender";

/** A formula's MathML as HTML, or the reason it could not be rendered. */
function render(tex: string, display = false) {
  const result = renderFormula(tex, display);
  return "error" in result
    ? { error: result.error }
    : { html: toHtml(result.math), unsupported: result.unsupported };
}

describe("renderFormula", () => {
  it("renders MathML only: no KaTeX markup, script, or stylesheet", () => {
    const { html } = render("\\frac{a}{b} + \\sqrt{x}");
    expect(html).toMatch(/^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML">/);
    expect(html).toContain("<mfrac>");
    expect(html).toContain('<annotation encoding="application/x-tex">');
    for (const absent of ["katex", "<script", "<style", "<link", "style="]) {
      expect(html).not.toContain(absent);
    }
  });

  it("marks a display formula as a block", () => {
    expect(render("x", true).html).toMatch(/^<math [^>]*display="block"/);
  });

  it("leaves none of KaTeX's classes, which only its stylesheet gives a meaning to", () => {
    for (const tex of [
      "\\begin{equation} x \\end{equation}",
      "\\begin{align} a &= b \\\\ c &= d \\end{align}",
      "\\begin{pmatrix} 1 & 2 \\end{pmatrix}",
      "x \\tag{1}",
    ]) {
      expect(render(tex, true).html, tex).not.toContain("class=");
    }
  });

  it("says when a formula is numbered, since the number needs KaTeX's stylesheet", () => {
    const numbered = (tex: string) => {
      const result = renderFormula(tex, true);
      return "math" in result && result.numbered;
    };
    expect(numbered("\\begin{equation} x \\end{equation}")).toBe(true);
    expect(numbered("\\begin{align} a &= b \\end{align}")).toBe(true);
    expect(numbered("\\begin{equation*} x \\end{equation*}")).toBe(false);
    expect(numbered("x \\tag{1}")).toBe(false);
  });

  it("does not render links, images, or HTML attributes, and names the commands", () => {
    for (const [tex, command] of [
      ["\\href{http://a}{x}", "\\href"],
      ["\\url{http://a}", "\\url"],
      ["\\includegraphics{a.png}", "\\includegraphics"],
      ["\\htmlClass{c}{x}", "\\htmlClass"],
      ["\\htmlId{i}{x}", "\\htmlId"],
      ["\\htmlStyle{color:red}{x}", "\\htmlStyle"],
      ["\\htmlData{a=b}{x}", "\\htmlData"],
    ]) {
      expect(renderFormula(tex!, false), tex).toEqual({ notAllowed: [command] });
    }
  });

  it("caps the sizes a formula may ask for", () => {
    const { html } = render("\\rule{100000em}{1em}");
    expect(html).not.toContain('width="100000em"');
    expect(html).toContain('width="100em"');
    expect(render("\\rule{9999999999999999999999em}{1em}").html).toContain('width="100em"');
    expect(render("a \\kern{-100000em} b").html).not.toMatch(/"-?1000+em"/);
    expect(render("\\raisebox{100000cm}{x}").html).toContain('voffset="100em"');
    expect(render("\\raisebox{-100000pt}{x}").html).toContain('voffset="-100em"');
    expect(render("\\raisebox{2cm}{x}").html).toContain('voffset="2cm"');
  });

  it("returns KaTeX's reason for a formula it cannot parse", () => {
    expect(render("x^{")).toEqual({ error: expect.stringContaining("Expected '}'") });
  });
});

describe("mathvariant", () => {
  it("maps each style to Unicode's mathematical alphanumerics, holes included", () => {
    expect(
      [
        ["bold", "E"],
        ["double-struck", "R"],
        ["double-struck", "1"],
        ["script", "L"],
        ["script", "A"],
        ["fraktur", "C"],
        ["fraktur", "g"],
        ["italic", "h"],
        ["italic", "x"],
        ["bold-italic", "α"],
        ["bold", "Ω"],
        ["bold", "ϑ"],
        ["sans-serif", "a"],
        ["bold-sans-serif", "9"],
        ["monospace", "0"],
        ["bold-script", "Z"],
        ["bold-fraktur", "a"],
        ["sans-serif-italic", "z"],
        ["sans-serif-bold-italic", "ω"],
      ].map(([variant, ch]) => styledCharacter(variant!, ch!)),
    ).toEqual([
      "𝐄",
      "ℝ",
      "𝟙",
      "ℒ",
      "𝒜",
      "ℭ",
      "𝔤",
      "ℎ",
      "𝑥",
      "𝜶",
      "𝛀",
      "𝛝",
      "𝖺",
      "\u{1D7F5}",
      "𝟶",
      "\u{1D4E9}",
      "𝖆",
      "𝘻",
      "\u{1D7C2}",
    ]);
  });

  it("has no form where Unicode has none", () => {
    expect(styledCharacter("italic", "1")).toBeUndefined();
    expect(styledCharacter("script", "α")).toBeUndefined();
    expect(styledCharacter("bold", "速")).toBeUndefined();
  });

  it("leaves no mathvariant but normal in the output, for every style command KaTeX has", () => {
    const commands = [
      "\\mathbf{Ex}",
      "\\mathbb{RN}",
      "\\mathcal{L}",
      "\\mathscr{F}",
      "\\mathfrak{g}",
      "\\mathsf{a}",
      "\\mathtt{x}",
      "\\mathit{Ab}",
      "\\mathrm{d}",
      "\\boldsymbol{\\alpha}",
      "\\bm{v}",
      "\\textbf{ab}",
      "\\textit{ab}",
      "\\textsf{ab}",
      "\\texttt{ab}",
      "\\mathsfit{a}",
      "\\operatorname{sin}",
    ];
    for (const tex of commands) {
      const { html } = render(tex);
      const variants = [...html!.matchAll(/mathvariant="([^"]*)"/g)].map((m) => m[1]);
      expect(
        variants.filter((v) => v !== "normal"),
        tex,
      ).toEqual([]);
    }
    expect(render("\\mathbf{E} + \\mathbb{R}").html).toContain("𝐄");
    expect(render("\\mathbf{E} + \\mathbb{R}").html).toContain("ℝ");
  });

  it("applies a style a token inherits from the element around it", () => {
    const html = render("\\textbf{a \\textit{b}}").html!;
    expect(
      [...html.matchAll(/<mtext>([^<]*)<\/mtext>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/\s/gu, " "),
    ).toBe("𝐚 𝒃");
    expect(render("\\boldsymbol{x + \\alpha}").html).toContain("𝒙");
  });

  it("reports the letters and digits a style has no Unicode form for, and keeps them", () => {
    expect(render("\\mathit{123}")).toMatchObject({
      unsupported: [{ variant: "italic", chars: "123" }],
    });
    const bold = render("\\textbf{速度 v}");
    expect(bold.unsupported).toEqual([{ variant: "bold", chars: "速度" }]);
    expect(bold.html).toContain("<mtext>速度</mtext>");
    expect(bold.html).toContain("<mtext>𝐯</mtext>");
  });
});

describe("the KaTeX monodocs renders with", () => {
  it("is the version the Mermaid runtime bundles, so the notices name one KaTeX", () => {
    const pkg = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { version: string };
    const installed = pkg(require.resolve("katex/package.json")).version;
    const notices = readFileSync(join(__dirname, "../themes/mermaid-notices.txt"), "utf8");
    expect(notices).toContain(`katex@${installed} `);
  });
});
