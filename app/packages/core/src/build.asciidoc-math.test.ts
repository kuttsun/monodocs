import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";

/**
 * AsciiDoc math (roadmap 6.4): latexmath, and stem when it means latexmath, rendered as Markdown's
 * formulas are, through markers the converter puts in place of Asciidoctor's output; asciimath left as
 * Asciidoctor writes it, with a warning; `math.enabled: false` giving back the output before.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-adoc-math-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function build(adoc: string, configBody = "") {
  await writeFile(join(dir, "a.adoc"), adoc);
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

function pageData(html: string): PageData {
  const json = /window\.__MONODOCS_DATA__ = (\{.*\});/.exec(html)![1]!;
  return (JSON.parse(json) as { pages: PageData[] }).pages[0]!;
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const attributes = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => decode(m[1]!));

const DOC = [
  "= Energy latexmath:[E=mc^2]",
  ":stem: latexmath",
  "",
  "== Let latexmath:[x] be real",
  "",
  "== Lt latexmath:[a < b]",
  "",
  "Inline stem:[\\sqrt{2}] and latexmath:[[a,b\\]].",
  "",
  "[[eq1]]",
  ".The sum",
  "[latexmath.wide]",
  "++++",
  "\\sum_{k=1}^{n} k",
  "++++",
  "",
  "[stem]",
  "++++",
  "a < b",
  "++++",
  "",
].join("\n");

describe("AsciiDoc math", () => {
  it("renders latexmath, and stem meaning latexmath, to MathML", async () => {
    const { html } = await build(DOC);
    expect(html.match(/<math /g)).toHaveLength(7);
    expect(html).not.toContain("\\(");
    expect(html).not.toMatch(/katex/i);
  });

  it("records each formula's TeX, and a source rebuilt as latexmath", async () => {
    const { html } = await build(DOC);
    expect(attributes(html, "data-math-tex")).toEqual([
      "E=mc^2",
      "x",
      "a < b",
      "\\sqrt{2}",
      "[a,b]",
      "\\sum_{k=1}^{n} k",
      "a < b",
    ]);
    expect(attributes(html, "data-math-source")).toEqual([
      "latexmath:[E=mc^2]",
      "latexmath:[x]",
      "latexmath:[a < b]",
      "latexmath:[\\sqrt{2}]",
      "latexmath:[[a,b\\]]",
      "[latexmath]\n++++\n\\sum_{k=1}^{n} k\n++++",
      "[latexmath]\n++++\na < b\n++++",
    ]);
  });

  it("keeps a block's ID, title, and roles around the formula", async () => {
    const { html } = await build(DOC);
    expect(html).toMatch(
      /<div id="a-eq1" class="stemblock wide">\s*<div class="title">The sum<\/div>\s*<div class="math math-display"/,
    );
  });

  it("keeps Asciidoctor's heading IDs, and shows a formula in a heading or title as $TeX$", async () => {
    const { html } = await build(DOC);
    const page = pageData(html);
    expect(page.headings.map((h) => [h.id, h.text])).toEqual([
      ["a-_let_x_be_real", "Let $x$ be real"],
      ["a-_lt_a_b", "Lt $a < b$"],
    ]);
    expect(page.title).toBe("Energy $E=mc^2$");
    expect(page.text).toContain("Inline \\sqrt{2} and [a,b].");
    expect(page.text).not.toContain("𝑥");
  });

  it("leaves asciimath as Asciidoctor writes it, and warns", async () => {
    const { html, result } = await build(
      "= T\n\nstem:[x^2] and asciimath:[y]\n\n[stem]\n++++\nsqrt(2)\n++++\n",
    );
    expect(html).toContain("\\$x^2\\$");
    expect(html).not.toContain("<math");
    const found = result.warnings.filter((w) => w.code === "math/asciimath-not-rendered");
    expect(found.map((w) => w.message)).toEqual([
      expect.stringContaining("asciimath:[x^2]"),
      expect.stringContaining("asciimath:[y]"),
      expect.stringContaining("[asciimath]"),
    ]);
    expect(found[0]).toMatchObject({ path: "a.adoc" });
  });

  it("resolves stem as Asciidoctor does", async () => {
    const formulas = async (adoc: string) => attributes((await build(adoc)).html, "data-math-tex");
    expect(await formulas("= T\n\n[stem,latexmath]\n++++\nx\n++++\n")).toEqual(["x"]);
    expect(await formulas("= T\n:stem: tex\n\nstem:[y]\n")).toEqual(["y"]);
    expect(await formulas("= T\n:stem: latex\n\nstem:[z]\n")).toEqual(["z"]);
    expect(await formulas("= T\n:stem:\n\nstem:[w]\n")).toEqual([]);
    expect(await formulas("= T\n:stem: latexmath\n\n[stem,asciimath]\n++++\nv\n++++\n")).toEqual(
      [],
    );
  });

  it("renders a formula in an AsciiDoc table cell", async () => {
    const { html } = await build("= T\n:stem: latexmath\n\n|===\na|stem:[y]\n|===\n");
    expect(html).toMatch(/<td[^>]*>[\s\S]*<span class="math math-inline"[^>]*><math /);
  });

  it("takes a block's own \\[...\\] as the delimiters Asciidoctor would have added", async () => {
    const { html, result } = await build("= T\n\n[latexmath]\n++++\n\\[x+1\\]\n++++\n");
    expect(attributes(html, "data-math-tex")).toEqual(["x+1"]);
    expect(result.warnings.map((w) => w.code)).not.toContain("math/parse-failed");
  });

  it("reports a formula KaTeX cannot parse, naming the file without a line", async () => {
    const { html, result } = await build("= T\n\nBroken latexmath:[x^{] here.\n");
    const found = result.warnings.filter((w) => w.code === "math/parse-failed");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/^a\.adoc: /);
    expect(found[0]!.message).toContain("latexmath:[x^{]");
    expect(html).toContain('<span class="math-error">latexmath:[x^{]</span>');
  });

  it("reports a broken formula in a section title once, however often the title is shown", async () => {
    const { result } = await build(
      "= T\n:toc:\n\n== Lt latexmath:[x^{]\n\nSee <<_lt_x>> and <<_lt_x>>.\n",
    );
    expect(result.warnings.filter((w) => w.code === "math/parse-failed")).toHaveLength(1);
  });

  it("does not strip the delimiters of two display formulas in one block", async () => {
    const { result } = await build("= T\n\n[latexmath]\n++++\n\\[a\\] + \\[b\\]\n++++\n");
    const found = result.warnings.find((w) => w.code === "math/parse-failed");
    expect(found!.message).toContain("\\[a\\] + \\[b\\]");
  });

  it("keeps a document's htmlsyntax, with or without formulas", async () => {
    const adoc = '= T\n\nifeval::["{htmlsyntax}" == "xml"]\nXML content\nendif::[]\n';
    const config = "sources:\n  asciidoc:\n    attributes:\n      htmlsyntax: xml\n";
    const on = await build(adoc, config);
    expect(on.html).toContain("XML content");
  });

  it("decodes character references once, as HTML does, and never fails the build on one", async () => {
    const { html, result } = await build(
      "= T\n\n[latexmath,subs=none]\n++++\n\\text{&#x110000;} &alpha;\n++++\n\n" +
        "[asciimath,subs=none]\n++++\n&#38;lt; &#x110000;\n++++\n",
    );
    expect(attributes(html, "data-math-tex")).toEqual(["\\text{\uFFFD} α"]);
    const asciimath = result.warnings.find((w) => w.code === "math/asciimath-not-rendered");
    expect(asciimath!.message).toContain("&lt; \uFFFD");
  });

  it("agrees with the HTML parser on every reference, so no formula is lost to one", async () => {
    const { html } = await build(
      "= T\n\nlatexmath:a[\\text{&#128;}] and latexmath:a[&#000000945;]\n",
    );
    expect(attributes(html, "data-math-tex")).toEqual(["\\text{€}", "α"]);
  });

  it("keeps every heading ID, whatever its formulas hold", async () => {
    // Asciidoctor reads raw brackets as a tag when it makes an ID, across formulas too; an inline
    // formula is marked with characters, not a tag, so the title it makes the ID from is unchanged.
    const adoc =
      "= Compare latexmath:a[a < b]\n\n== H latexmath:a[a < b] latexmath:[x] latexmath:a[c > d]\n\n" +
      "See <<_h_a_d>>.\n";
    const on = await build(adoc);
    const off = await build(adoc, "math:\n  enabled: false\n");
    const ids = (html: string) => [...html.matchAll(/<h2 id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids(on.html)).toEqual(ids(off.html));
    expect(on.result.warnings.map((w) => w.code)).not.toContain("link/unresolved-anchor");
    // The title, the heading, and the xref's text taken from the heading.
    expect(attributes(on.html, "data-math-tex")).toEqual([
      "a < b",
      "a < b",
      "x",
      "c > d",
      "a < b",
      "x",
      "c > d",
    ]);
    expect(pageData(on.html).title).toBe("Compare $a &lt; b$");
  });

  it("writes a formula the HTML around it broke apart as Asciidoctor does, and warns", async () => {
    // Inside strong text, the formula's own `</strong>` closes it and splits the formula's marker.
    const adoc = "= T\n\n*b latexmath:a[\\text{</strong>}] c* and latexmath:[x]\n";
    const on = await build(adoc);
    expect(attributes(on.html, "data-math-tex")).toEqual(["x"]);
    expect(on.html).toContain("\\(\\text{");
    expect(on.html).not.toMatch(/[\uE000-\uE01F]/);
    const found = on.result.warnings.filter((w) => w.code === "math/construct-unsupported");
    expect(found.map((w) => w.message)).toEqual([
      expect.stringContaining("latexmath:[\\text{</strong>}]"),
    ]);
  });

  it("keeps the ID of a heading whose formula has its own substitutions", async () => {
    const adoc = "= T\n\n== Symbol latexmath:a[&#945;]\n\nSee <<_symbol>>.\n";
    const ids = (html: string) => [...html.matchAll(/<h2 id="([^"]*)"/g)].map((m) => m[1]);
    const on = await build(adoc);
    const off = await build(adoc, "math:\n  enabled: false\n");
    expect(ids(on.html)).toEqual(ids(off.html));
    // The heading, and the xref's text taken from it.
    expect(attributes(on.html, "data-math-tex")).toEqual(["α", "α"]);
  });

  it("writes the source of an asciimath block as written", async () => {
    const { result } = await build("= T\n\n[asciimath]\n++++\na < b\n++++\n");
    const found = result.warnings.find((w) => w.code === "math/asciimath-not-rendered");
    expect(found!.message).toContain("[asciimath]\n++++\na < b\n++++");
  });

  it("shows a formula with < or quotes in the title as $TeX$", async () => {
    const { html } = await build('= Q latexmath:[a < b, "c"]\n\ntext\n');
    expect(pageData(html).title).toBe('Q $a &lt; b, "c"$');
  });

  it("leaves private-use characters an author wrote alone", async () => {
    const adoc = "= T\n\nA\uE000B\uE002C \uE001\uE003\n";
    const on = await build(adoc);
    const off = await build(adoc, "math:\n  enabled: false\n");
    expect(pageData(on.html).text).toBe(pageData(off.html).text);
    expect(on.html).toContain("A\uE000B\uE002C");
  });

  it("writes markers back wherever HTML put them: attribute values, lists, names, and comments", async () => {
    const adoc =
      "= T\n\n[subs=macros]\n++++\n" +
      '<span class="latexmath:[x]">T</span>\n' +
      '<span title="latexmath:a[x"y]">U</span>\n' +
      '<span title="latexmath:a[&#38;lt;]">V</span>\n' +
      "<!-- latexmath:[x] -->\n++++\n";
    const on = await build(adoc);
    const off = await build(adoc, "math:\n  enabled: false\n");
    expect(on.html).not.toMatch(/[\uE000-\uE01F]/);
    // As with math off: the attribute's value keeps its reference decoded once, not twice.
    const titles = (html: string) => [...html.matchAll(/title="([^"]*)"/g)].map((m) => m[1]);
    expect(titles(on.html)).toEqual(titles(off.html));
    expect(on.html).toContain("<!-- \\(x\\) -->");
  });

  it("writes markers back where no element can go, and in a template", async () => {
    const adoc =
      "= T\n\n[subs=macros]\n++++\n" +
      '<script>window.label = "latexmath:[x]";</script>\n' +
      "<style>/* latexmath:[y] */</style>\n" +
      '<template><span title="latexmath:[x]">latexmath:[y]</span><template>latexmath:[z]</template></template>\n' +
      "++++\n";
    const on = await build(adoc);
    const off = await build(adoc, "math:\n  enabled: false\n");
    expect(on.html).not.toMatch(/[\uE000-\uE01F]/);
    const block = (html: string) =>
      /<script>window\.label[\s\S]*?<\/template><\/template>/.exec(html)![0];
    expect(block(on.html)).toBe(block(off.html));
  });

  it("writes a display formula back as Asciidoctor writes it, in a template or as text", async () => {
    for (const [open, close] of [
      ["<template>", "</template>"],
      ["<textarea>", "</textarea>"],
      ["<script>let s = `", "`;</script>"],
    ]) {
      for (const tex of ["x", "a < b", "\\[a\\] + \\[b\\]"]) {
        const adoc = `= T\n\n++++\n${open}\n++++\n\n[latexmath]\n++++\n${tex}\n++++\n\n++++\n${close}\n++++\n`;
        const on = await build(adoc);
        const off = await build(adoc, "math:\n  enabled: false\n");
        expect(on.html, `${open} ${tex}`).not.toMatch(/[\uE000-\uE01F]/);
        const tag = open.slice(1, open.search(/[ >]/));
        const part = (html: string) => new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`).exec(html)![0];
        expect(part(on.html), `${open} ${tex}`).toBe(part(off.html));
      }
    }
  });

  it("does not point a block formula's diagnostic at a line of Asciidoctor's HTML", async () => {
    const { result } = await build("= T\n\n[latexmath]\n++++\nx^{\n++++\n");
    const found = result.warnings.find((w) => w.code === "math/parse-failed");
    expect(found!.line).toBeUndefined();
    expect(found!.message).toMatch(/^a\.adoc: /);
  });

  it("does not let a passthrough's unclosed tag change what a formula is", async () => {
    const { html } = await build('= T\n\n+++<span data-math-tex="\\alpha" +++latexmath:[x] tail\n');
    // The span is the author's own raw HTML, not a formula: nothing renders \\alpha.
    expect(html).not.toContain("<mi>α</mi>");
    expect(html).not.toContain("𝛼");
    // A malformed tag that swallows a block marker keeps what it took in; it is not a formula.
    const swallowed = await build(
      "= T\n\n+++<div x=y +++\n\n[latexmath]\n++++\nx\n++++\n\ntail and more\n",
    );
    expect(swallowed.html).toContain("tail and more");
  });

  it("does not take raw HTML that spells a marker for a formula", async () => {
    const { html } = await build(
      '= T\n\n++++\n<span class="math math-inline" data-math-tex="x" data-monodocs-math="guess">Visible</span>\n++++\n',
    );
    expect(html).not.toContain("<math");
    expect(pageData(html).text).toContain("Visible");
  });

  it("with math.enabled: false, writes what Asciidoctor wrote before, and does not warn", async () => {
    const { html, result } = await build(DOC + "\nasciimath:[y]\n", "math:\n  enabled: false\n");
    expect(html).not.toContain("<math");
    expect(html).toContain("\\(x\\)");
    expect(html).toContain("\\[\\sum_{k=1}^{n} k\\]");
    expect(pageData(html).title).toBe("Energy \\(E=mc^2\\)");
    expect(result.warnings.map((w) => w.code)).not.toContain("math/asciimath-not-rendered");
  });
});
