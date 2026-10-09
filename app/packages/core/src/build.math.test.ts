import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";

/**
 * Markdown math rendered at build time (roadmap 6.4): MathML only, the heading IDs math had no part
 * in before, the lists of headings and the search text reading the TeX, a diagnostic for what cannot
 * be rendered, and `math.enabled: false` giving back the output of the release before.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-math-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function build(markdown: string, configBody = "") {
  await writeFile(join(dir, "a.md"), markdown);
  const configFile = join(dir, "monodocs.config.yml");
  await writeFile(configFile, configBody);
  const out = join(dir, "out.html");
  const result = await buildSite({ configFile, inputDir: dir, outputFile: out, format: "html" });
  return { html: await readFile(out, "utf8"), result };
}

interface PageData {
  title: string;
  text: string;
  headings: { id: string; text: string }[];
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function pageData(html: string): PageData {
  const json = /window\.__MONODOCS_DATA__ = (\{.*\});/.exec(html)![1]!;
  return (JSON.parse(json) as { pages: PageData[] }).pages[0]!;
}

const DOC = [
  "# Energy $E=mc^2$",
  "",
  "## Let $x$ be real",
  "",
  "## Cost $\\frac{a}{b}$",
  "",
  "Inline $a &lt; b$ and $`\\sqrt{2}`$ here.",
  "",
  "$$",
  "\\sum_{k=1}^{n} k",
  "$$",
  "",
  "```math",
  "\\mathbb{R}",
  "```",
  "",
].join("\n");

describe("Markdown math", () => {
  it("renders each formula to MathML, with no KaTeX stylesheet or script", async () => {
    const { html } = await build(DOC);
    expect(html.match(/<math /g)).toHaveLength(7);
    expect(html).not.toMatch(/katex/i);
    expect(html).toContain("ℝ");
    expect(html).not.toMatch(/mathvariant="(?!normal")/);
  });

  it("keeps each formula's source and TeX on the element around it", async () => {
    const { html } = await build(DOC);
    const attributes = (name: string) =>
      [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => decode(m[1]!));
    expect(attributes("data-math-source")).toEqual([
      "$E=mc^2$",
      "$x$",
      "$\\frac{a}{b}$",
      "$a &lt; b$",
      "$`\\sqrt{2}`$",
      "$$\n\\sum_{k=1}^{n} k\n$$",
      "```math\n\\mathbb{R}\n```",
    ]);
    expect(attributes("data-math-tex")).toEqual([
      "E=mc^2",
      "x",
      "\\frac{a}{b}",
      "a < b",
      "\\sqrt{2}",
      "\n\\sum_{k=1}^{n} k\n",
      "\\mathbb{R}",
    ]);
  });

  it("makes heading IDs from the TeX, as before math was rendered", async () => {
    const { html } = await build(DOC);
    const ids = [...html.matchAll(/<h[1-6] id="a-([^"]*)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["energy-emc2", "let-x-be-real", "cost-fracab"]);
  });

  it("shows a formula in a heading or title as $TeX$, and indexes the TeX", async () => {
    const { html } = await build(DOC);
    const page = pageData(html);
    expect(page.title).toBe("Energy $E=mc^2$");
    expect(page.headings.map((h) => h.text)).toEqual(["Let $x$ be real", "Cost $\\frac{a}{b}$"]);
    expect(page.text).toContain("Inline a < b and \\sqrt{2} here.");
    expect(page.text).toContain("\\sum_{k=1}^{n} k");
    // The MathML is not read as text: no italic code points, no TeX annotation twice.
    expect(page.text).not.toContain("𝑥");
    expect(page.text.split("\\frac{a}{b}")).toHaveLength(2);
  });

  it("lists each formula's TeX with its section for search, and nothing on a page without one", async () => {
    const { html } = await build(DOC);
    const formulas = (pageData(html) as PageData & { formulas?: unknown }).formulas;
    expect(formulas).toEqual([
      { tex: "E=mc^2" },
      { tex: "x", section: "a-let-x-be-real" },
      { tex: "\\frac{a}{b}", section: "a-cost-fracab" },
      { tex: "a < b", section: "a-cost-fracab" },
      { tex: "\\sqrt{2}", section: "a-cost-fracab" },
      { tex: "\\sum_{k=1}^{n} k", section: "a-cost-fracab" },
      { tex: "\\mathbb{R}", section: "a-cost-fracab" },
    ]);
    const plain = await build("# T\n\nNo formula here.\n");
    expect(pageData(plain.html)).not.toHaveProperty("formulas");
  });

  it("reports a formula KaTeX cannot parse, with the file and line, and shows it as written", async () => {
    const { html, result } = await build("# T\n\nBroken $x^{$ here.\n");
    const found = result.warnings.filter((w) => w.code === "math/parse-failed");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: "a.md", line: 3 });
    expect(found[0]!.message).toContain("$x^{$");
    expect(html).toContain('<span class="math-error">$x^{$</span>');
    expect(html).not.toContain("katex-error");
  });

  it("reports a link or an HTML command, and shows the formula as written", async () => {
    const { html, result } = await build("# T\n\nSee $\\htmlClass{c}{x}$ here.\n");
    const found = result.warnings.filter((w) => w.code === "math/command-not-allowed");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("\\htmlClass");
    expect(html).toContain('<span class="math-error">$\\htmlClass{c}{x}$</span>');
  });

  it("reports a numbered environment, whose number cannot be drawn", async () => {
    const { result } = await build("# T\n\n$$\\begin{equation} x \\end{equation}$$\n");
    expect(result.warnings.map((w) => w.code)).toContain("math/numbering-unsupported");
    // A tag inside a numbered environment is dropped by KaTeX, so the advice is a starred one.
    const tagged = await build("# T\n\n$$\\begin{equation} x \\tag{1}\\end{equation}$$\n");
    const found = tagged.result.warnings.find((w) => w.code === "math/numbering-unsupported");
    expect(found!.message).toContain("starred environment, with \\tag{} after it");
    const starredTag = await build("# T\n\n$$\\begin{align*} a &= b \\tag{1}\\end{align*}$$\n");
    expect(starredTag.result.warnings.map((w) => w.code)).toContain("math/numbering-unsupported");
    const after = await build("# T\n\n$$\\begin{equation*} x \\end{equation*} \\tag{1}$$\n");
    expect(after.result.warnings.map((w) => w.code)).not.toContain("math/numbering-unsupported");
    expect(after.html).toMatch(/<mtext>\(1\)<\/mtext>/);
  });

  it("reports an enclosure it cannot draw", async () => {
    const { result } = await build("# T\n\n$\\phase{x}$ and $\\cancel{y}$\n");
    const found = result.warnings.filter((w) => w.code === "math/notation-unsupported");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("phasorangle");
  });

  it("reports a construct the browser cannot draw as written", async () => {
    const { result } = await build("# T\n\n$\\vcenter{x}$\n");
    const found = result.warnings.filter((w) => w.code === "math/construct-unsupported");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("\\vcenter");
  });

  it("renders a formula in a table cell", async () => {
    const { html } = await build("# T\n\n| a |\n|---|\n| $x\\|y$ |\n");
    expect(html).toMatch(
      /<td><span class="math math-inline" data-math-source="\$x\\\|y\$" data-math-tex="x\|y"><math/,
    );
  });

  it("names a heading by its TeX in the heading-level warning", async () => {
    const { result } = await build("# T\n\n### Energy $E=mc^2$\n");
    const found = result.warnings.find((w) => w.code === "heading/level-skipped");
    expect(found!.message).toContain("Energy $E=mc^2$");
  });

  it("names the skipped heading itself when two headings share an ID", async () => {
    await writeFile(join(dir, "b.adoc"), "= T\n\n[[dup]]\n== First\n\n[[dup]]\n==== Second\n");
    const { result } = await build("# A\n");
    const found = result.warnings.filter((w) => w.code === "heading/level-skipped");
    expect(found.map((w) => w.message)).toEqual([expect.stringContaining('"Second"')]);
  });

  it("keeps a formula a boundary under lineBreak: join", async () => {
    const { html } = await build("# T\n\n日本語の\n$x$\nです。\n", "sources:\n  lineBreak: join\n");
    expect(html).toMatch(/日本語の\n<span class="math math-inline"[^]*<\/span>\nです。/);
  });

  it("reports a style Unicode has no form for", async () => {
    const { result } = await build("# T\n\n$\\mathit{123}$\n");
    const found = result.warnings.filter((w) => w.code === "math/style-unsupported");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('"123"');
  });

  it("with math.enabled: false, prints the formulas as text, as the release before did", async () => {
    const off = await build(DOC, "math:\n  enabled: false\n");
    expect(off.html).not.toContain("<math");
    // No formula element (the theme's script names the attribute, which is not one).
    expect(off.html).not.toMatch(/data-math-(?:source|tex)="/);
    expect(pageData(off.html).title).toBe("Energy $E=mc^2$");
    expect(pageData(off.html).headings.map((h) => h.text)).toEqual([
      "Let $x$ be real",
      "Cost $\\frac{a}{b}$",
    ]);
    // A fenced math block is code again.
    expect(off.html).toContain("<span>\\mathbb{R}</span>");
  });

  it("reads raw HTML that looks like a formula as the HTML it is", async () => {
    await writeFile(
      join(dir, "b.adoc"),
      '= B\n\n++++\n<span class="math" data-math-tex="replacement">Visible</span>\n++++\n',
    );
    const { html } = await build("# A\n");
    const json = /window\.__MONODOCS_DATA__ = (\{.*\});/.exec(html)![1]!;
    const texts = (JSON.parse(json) as { pages: { text: string }[] }).pages.map((p) => p.text);
    expect(texts.join("\n")).toContain("Visible");
    expect(texts.join("\n")).not.toContain("replacement");
  });

  it("builds a fixture without formulas byte for byte as with math off", async () => {
    // examples/ja has `$` in code and shell lines, and no formula outside its math page.
    const fixture = fileURLToPath(new URL("../../../../examples/ja", import.meta.url));
    const noMathPage = "sources:\n  exclude:\n    - markdown/math.md\n";
    const outputs: string[] = [];
    for (const body of [noMathPage, `${noMathPage}math:\n  enabled: false\n`]) {
      const configFile = join(dir, "monodocs.config.yml");
      await writeFile(configFile, body);
      const out = join(dir, "fixture.html");
      await buildSite({ configFile, inputDir: fixture, outputFile: out, format: "html" });
      outputs.push(await readFile(out, "utf8"));
    }
    expect(outputs[0]).toBe(outputs[1]);
  }, 120_000);

  it("keeps the punctuation next to an inline formula on its line", async () => {
    const { html } = await build("# A\n\n値は ($x$) と $y$、 $z$。そして $w$ です。\n");
    const kept = [
      ...html.matchAll(/<span style="white-space: nowrap">(.*?<\/math><\/span>)(.*?)<\/span>/g),
    ].map((m) => m[1]!.match(/^[^<]*/)![0] + "F" + m[2]!);
    // `(` before x and `)` after it, `、` after y, `。` after z; nothing around w, which a space follows.
    expect(kept).toEqual(["(F)", "F、", "F。"]);
    // The formulas themselves are as they were: their source and TeX, and nothing else inside.
    expect(html).toContain('data-math-source="$y$"');
    expect(html).not.toMatch(/<span class="math math-inline"[^>]*>[^<]*[、。]/);
  });

  it("keeps the punctuation after strong text or a footnote reference ending in a formula", async () => {
    const { html } = await build(
      "# A\n\n値は **$x$**、次に $y$[^1]。そして $n$-dimensional と $p$%。\n\n[^1]: 注。\n",
    );
    const nowrap = '<span style="white-space: nowrap">';
    // Strong text ending in a formula, and the 、 after it.
    expect(html).toContain(`${nowrap}<strong><span class="math math-inline"`);
    expect(html).toMatch(/<\/math><\/span><\/strong>、<\/span>/);
    // A footnote reference after a formula, and the 。 after both.
    expect(html).toMatch(/<\/math><\/span><sup>.*?<\/sup>。<\/span>/);
    // A hyphen and a percent sign, which do not start a line in text.
    expect(html).toMatch(/<\/math><\/span>-<\/span>dimensional/);
    expect(html).toMatch(/<\/math><\/span>%。<\/span>/);
  });

  it("keeps no more than a formula from wrapping, strong text with words in it included", async () => {
    const { html } = await build("# A\n\n値は (**$a$ と $b$ が正のときに成り立つ長い文**) の。\n");
    // The strong text wraps as it did; only the formulas are what they always were, unbreakable.
    expect(html).not.toContain('<span style="white-space: nowrap">(<strong>');
    expect(html).toMatch(/<strong>.*と.*<\/strong>\) の/);
  });

  it("builds the math fixture, its Markdown and AsciiDoc pages giving the same formulas", async () => {
    // examples/math: the formulas v0.14 measured and the accents v0.16 added, 8 inline and 15
    // display, on each page.
    const fixture = fileURLToPath(new URL("../../../../examples/math", import.meta.url));
    const out = join(dir, "math.html");
    const result = await buildSite({
      configFile: join(fixture, "monodocs.config.yml"),
      inputDir: fixture,
      outputFile: out,
      format: "html",
    });
    expect(result.warnings).toEqual([]);
    const html = await readFile(out, "utf8");
    const json = /window\.__MONODOCS_DATA__ = (\{.*\});/.exec(html)![1]!;
    const pages = (JSON.parse(json) as { pages: { title: string; formulas?: { tex: string }[] }[] })
      .pages;
    const formulas = (title: string) =>
      pages.find((p) => p.title.includes(title))!.formulas!.map((f) => f.tex);
    // The 21 formulas v0.14 measured (roadmap 6.4) and the 2 accent formulas v0.16 added, kept apart
    // from the fixture so that a change to both of its pages alike is still caught.
    const measured = [
      String.raw`E = mc^2`,
      String.raw`\alpha + \beta = \gamma`,
      String.raw`x_{i,j}^{2}`,
      String.raw`\sqrt[3]{x}`,
      String.raw`\frac{a}{b}`,
      String.raw`\hat{\theta},\ \bar{x},\ \vec{v},\ \dot{x}`,
      String.raw`\forall x \in \mathbb{R},\ \exists n \in \mathbb{N}`,
      String.raw`\acute{e},\ \grave{a}`,
      String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
      String.raw`e^{i\pi} + 1 = 0`,
      String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`,
      String.raw`\sum_{k=1}^{n} k = \frac{n(n+1)}{2}`,
      String.raw`A = \begin{pmatrix} a_{11} & a_{12} & \cdots & a_{1n} \\ a_{21} & a_{22} & \cdots & a_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ a_{m1} & a_{m2} & \cdots & a_{mn} \end{pmatrix}`,
      String.raw`f(x) = \begin{cases} x^2 & (x \ge 0) \\ -x & (x < 0) \end{cases}`,
      String.raw`\begin{aligned} (a+b)^2 &= (a+b)(a+b) \\ &= a^2 + 2ab + b^2 \end{aligned}`,
      String.raw`\lim_{n \to \infty} \left( 1 + \frac{1}{n} \right)^n = e`,
      String.raw`\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}`,
      String.raw`P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}`,
      String.raw`\left[ \frac{1}{1 + \frac{1}{1 + \frac{1}{x}}} \right]`,
      String.raw`\operatorname{softmax}(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}`,
      String.raw`\text{速度}\ v = \frac{\Delta x}{\Delta t} \quad [\mathrm{m/s}]`,
      String.raw`e^x = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \frac{x^4}{4!} + \frac{x^5}{5!} + \frac{x^6}{6!} + \frac{x^7}{7!} + \frac{x^8}{8!} + \frac{x^9}{9!} + \frac{x^{10}}{10!} + \cdots`,
      String.raw`\widehat{xyz},\ \widetilde{xyz},\ \widecheck{xyz},\ \utilde{xyz},\ \overrightarrow{AB},\ \overbrace{a+b+c}^{n},\ \underbrace{a+b+c}_{n}`,
    ];
    expect(formulas("Markdown")).toEqual(measured);
    expect(formulas("AsciiDoc")).toEqual(formulas("Markdown"));
    const article = (title: string) =>
      html.split(/<article /).find((a) => a.includes(`>数式（${title}）</h1>`))!;
    for (const title of ["Markdown", "AsciiDoc"]) {
      const page = article(title);
      expect(page.match(/class="math math-inline"/g)).toHaveLength(8);
      expect(page.match(/class="math math-display"/g)).toHaveLength(15);
      // \mathbf and \mathbb come out as their own letters, which a plain variable is not.
      for (const letter of ["\u{1D404}", "\u{1D401}", "\u{1D433}", "\u211D", "\u2115"]) {
        expect([title, page.includes(letter)]).toEqual([title, true]);
      }
    }
    expect(new Set(html.match(/mathvariant="[^"]*"/g))).toEqual(new Set(['mathvariant="normal"']));
  }, 120_000);
});
