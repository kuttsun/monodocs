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
