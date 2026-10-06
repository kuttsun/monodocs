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
    // Within the cap, a unit CSS has stays, so that an absolute length stays absolute, and TeX's
    // other units become points, which MathML Core reads.
    expect(render("\\raisebox{2cm}{x}").html).toContain('voffset="2cm"');
    expect(render("\\raisebox{72bp}{x}").html).toContain('voffset="72.27pt"');
    // KaTeX's px: 1200px is 120.45em, 1000px 100.375em, 990px 99.37em.
    expect(render("\\raisebox{1200px}{x}").html).toContain('voffset="100em"');
    expect(render("\\raisebox{-1200px}{x}").html).toContain('voffset="-100em"');
    expect(render("\\raisebox{990px}{x}").html).toContain('voffset="993.7125pt"');
    expect(render(`\\raisebox{${"9".repeat(400)}em}{x}`).html).toContain('voffset="100em"');
    expect(render(`\\raisebox{-${"9".repeat(400)}em}{x}`).html).toContain('voffset="-100em"');
  });

  it("draws the enclosures MathML Core has no menclose for, and returns those CSS cannot draw", () => {
    const drawn = (tex: string) => {
      const result = renderFormula(tex, false);
      if (!("math" in result)) throw new Error("not rendered");
      return { html: toHtml(result.math), notations: result.notations };
    };
    for (const tex of ["\\cancel{x}", "\\bcancel{x}", "\\xcancel{x}", "\\sout{abc}"]) {
      const { html, notations } = drawn(tex);
      expect(html, tex).not.toContain("menclose");
      expect(html, tex).toContain("background-image: linear-gradient(");
      expect(notations).toEqual([]);
    }
    expect(drawn("\\xcancel{x}").html.match(/linear-gradient\(/g)).toHaveLength(2);
    // A stripe runs across its gradient: \\cancel's "/" is a gradient to the bottom right.
    expect(drawn("\\cancel{x}").html).toContain("linear-gradient(to bottom right");
    expect(drawn("\\bcancel{x}").html).toContain("linear-gradient(to top right");
    expect(drawn("\\boxed{x}").html).toContain("border-left: 0.06em solid");
    expect(drawn("\\angl{n}").html).toMatch(/border-top: [^;]*; border-right/);
    expect(drawn("\\phase{x}").notations).toEqual(["phasorangle"]);
    expect(drawn("\\phase{x}").html).not.toContain("menclose");
  });

  it("writes every length in a unit CSS has, and the mpadded forms MathML Core reads otherwise", () => {
    const lengths = render("\\mkern18mu \\kern1dd \\kern2sp \\colorbox{red}{abcdefgh}").html!;
    expect(lengths).not.toMatch(/="[-+]?[\d.]+(?:mu|dd|bp|cc|sp|nd|nc|px)"/);
    // \colorbox grows its content by 3pt on each side: padding, in points, not a size.
    expect(lengths).toMatch(/<mpadded mathbackground="red" style="padding: 3pt 3pt 3pt 3pt">/);
    expect(lengths).not.toMatch(/<mpadded[^>]*width=/);
    // \raisebox makes room on the side the content moves to.
    expect(render("\\raisebox{3em}{x}").html).toMatch(/voffset="3em" style="padding-top: 3em"/);
    expect(render("\\raisebox{-3em}{x}").html).toMatch(
      /voffset="-3em" style="padding-bottom: 3em"/,
    );
    // \mathllap and \mathclap move their content by its own width.
    expect(render("a\\mathllap{XYZ}b").html).toContain('style="transform: translateX(-100%)"');
    expect(render("a\\mathclap{XYZ}b").html).toContain('style="transform: translateX(-50%)"');
    expect(render("a\\mathllap{XYZ}b").html).not.toContain('width"');
  });

  it("rewrites what KaTeX writes for MathML 3 into what MathML Core lays out", () => {
    const array = render(
      "\\begin{array}{|c|l:r|}\\hline a&b&c\\\\\\hdashline d&e&f\\\\\\hline\\end{array}",
      true,
    ).html!;
    // Lines and spacing as cell CSS; the frame's sides put right (KaTeX names them crosswise).
    expect(array).not.toMatch(/columnlines|rowlines|columnspacing|rowspacing/);
    expect(array).toContain("border-right: 0.06em solid");
    expect(array).toContain("border-right: 0.06em dashed");
    expect(array).toContain("border-bottom: 0.06em dashed");
    expect(array).toContain("text-align: -webkit-left");
    expect(array).toContain('columnalign="center left right"');
    // A short row gets its missing cells, so that a column's line reaches it.
    const short = render("\\begin{array}{c|c} a \\\\ b & c \\end{array}", true).html!;
    expect(short.match(/border-right: 0.06em solid/g)).toHaveLength(2);
    // \\cancel around a table is not a frame: no edge spacing is added for it.
    expect(render("\\cancel{\\begin{matrix} a & b \\end{matrix}}", true).html).toMatch(
      /<mtd style="padding-left: 0;/,
    );
    // A line break's extra height is room below its line.
    expect(render("a\\\\[2em]b", true).html).toContain('style="padding: 0 0 2em 0"');
    // Line breaks at the top become rows; one deeper in is reported.
    expect(render("a\\\\b", true).html).toMatch(
      /<mtable><mtr><mtd[^>]*><mrow><mi>a<\/mi><\/mrow><\/mtd><\/mtr><mtr>/,
    );
    const nested = renderFormula("\\frac{a\\\\b}{c}", true);
    expect("math" in nested && nested.constructs).toEqual([expect.stringContaining("line break")]);
    // A negative space pulls the terms together.
    expect(render("a\\!b").html).toContain('<mspace width="0em" style="margin-left: -0.1667em">');
    expect(render("a\\kern{-0.3em}b").html).toContain("margin-left: -0.3em");
    // A brace is an accent, as in TeX.
    expect(render("\\overbrace{abc}^{n}").html).toMatch(/<mover accent="true">/);
    expect(render("\\underbrace{abc}_{n}").html).toMatch(/<munder accentunder="true">/);
    // An arrow's label is padded in em, so the padding follows the label's size.
    expect(render("\\xrightarrow{abc}").html).toMatch(/padding: [^"]*em/);
    // A symbol takes bold or italic from CSS, having no styled character.
    expect(render("\\boldsymbol{+}").html).toMatch(
      /<mo [^>]*style="font-weight: bold; font-style: italic">\+<\/mo>/,
    );
    // A \\tag's table and every box down to it span the line.
    expect(render("x \\tag{1}", true).html).toMatch(/^<math [^>]*style="width: 100%"/);
  });

  it("reports what MathML Core cannot draw as KaTeX means it", () => {
    const constructs = (tex: string) => {
      const result = renderFormula(tex, true);
      return "math" in result ? result.constructs : undefined;
    };
    expect(constructs("\\vcenter{x}")).toEqual(["\\vcenter"]);
    // \\mathchoice is reported where KaTeX can pick the wrong branch: in a script or a fraction.
    expect(constructs("\\mathchoice{D}{T}{S}{SS}")).toEqual([]);
    expect(constructs("x^{\\mathchoice{D}{T}{S}{SS}}")).toEqual(["\\mathchoice"]);
    expect(constructs("x^{a\\bmod b}")).toEqual(["\\mathchoice"]);
    expect(constructs("\\frac{\\mathchoice{D}{T}{S}{SS}}{2}")).toEqual(["\\mathchoice"]);
    expect(constructs("\\html@mathml{x^{\\mathchoice{D}{T}{S}{SS}}}{x}")).toEqual([]);
    expect(constructs("\\overlinesegment{AB}")).toEqual([
      expect.stringContaining("\\overlinesegment"),
    ]);
    expect(render("\\overlinesegment{AB}").html).not.toContain("undefined");
    expect(constructs("\\frac{a}{b} + \\begin{array}{c} x \\end{array}")).toEqual([]);
    expect(constructs("\\boldsymbol{\\rightarrow}")).toEqual([
      expect.stringContaining("\\boldsymbol"),
    ]);
    expect(constructs("\\bm{=}")).toEqual([expect.stringContaining("\\boldsymbol")]);
    expect(constructs("\\boldsymbol{x + y}")).toEqual([]);
    expect(constructs("\\bm{=} \\tag{1}")).toEqual([expect.stringContaining("\\boldsymbol")]);
    expect(constructs("\\begin{align*} a &\\bm{=} b \\end{align*}")).toEqual([
      expect.stringContaining("\\boldsymbol"),
    ]);
    expect(constructs("\\boldsymbol{\\mathrm{=}}")).toEqual([]);
    expect(constructs("\\boldsymbol{\\mathrm{\\bm{=}}}")).toEqual([
      expect.stringContaining("\\boldsymbol"),
    ]);
    expect(constructs("\\begin{array}{c} a \\\\[2em] b \\end{array}")).toEqual([
      expect.stringContaining("inside an environment"),
    ]);
    expect(constructs("a \\\\[-0.2em] b")).toEqual([expect.stringContaining("negative height")]);
    expect(constructs("\\def\\row{\\\\}\\begin{array}{c}a\\row[2em]b\\end{array}")).toEqual([
      expect.stringContaining("inside an environment"),
    ]);
    expect(constructs("\\def\\arraystretch{0.7}\\begin{array}{c}a\\\\b\\end{array}")).toEqual([
      "\\arraystretch below 1",
    ]);
    expect(
      render("\\def\\arraystretch{0.7}\\begin{array}{c}a\\\\b\\end{array}", true).html,
    ).not.toMatch(/padding-(?:top|bottom): -/);
    expect(constructs("\\html@mathml{\\bm{=}}{x}")).toEqual([]);
    expect(render("a\\\\[-0.2em]b", true).html).not.toContain("-0.2em 0");
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
