import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";

// An SVG an AsciiDoc page writes inline had its IDs prefixed with the page ID while every reference
// to them inside it kept the old names (#223).

let dir: string;
let html: string;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" aria-labelledby="t">
  <title id="t">T</title><style>#r { fill: red } .c { stroke: url(#g) }</style>
  <defs><linearGradient id="g"/><clipPath id="clip"><rect width="9" height="9"/></clipPath></defs>
  <rect id="r" fill="url(#g)" clip-path="url('#clip')" style="stroke: url(#g)" width="5" height="5"/>
  <use href="#r"/><use xlink:href="#r"/><a href="#r"><text>link</text></a>
  <use href="#elsewhere"/>
</svg>
`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-inline-svg-"));
  const docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "a.svg"), SVG);
  await writeFile(join(docs, "a.adoc"), "= A\n\nimage::a.svg[a,opts=inline]\n");
  const outputFile = join(dir, "out.html");
  await buildSite({ inputDir: docs, outputFile });
  html = await readFile(outputFile, "utf8");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The inline SVG as written into the page. */
function inlineSvg(): string {
  const svg = /<svg[^>]*aria-labelledby[\s\S]*?<\/svg>/.exec(html)?.[0];
  expect(svg).toBeDefined();
  return svg ?? "";
}

describe("an inline SVG in an AsciiDoc page", () => {
  it("prefixes its IDs", () => {
    const svg = inlineSvg();
    for (const id of ["a-t", "a-g", "a-clip", "a-r"]) expect(svg).toContain(`id="${id}"`);
  });

  it("renames every reference to them with the IDs", () => {
    const svg = inlineSvg();
    expect(svg).toContain('aria-labelledby="a-t"');
    expect(svg).toContain('fill="url(#a-g)"');
    // The quote inside the attribute is written as a character reference.
    expect(svg).toContain('clip-path="url(&#x27;#a-clip&#x27;)"');
    expect(svg).toContain('style="stroke: url(#a-g)"');
    expect(svg).toContain("#a-r { fill: red }");
    expect(svg).toContain(".c { stroke: url(#a-g) }");
    expect(svg.match(/<use href="#a-r"/g)).toHaveLength(1);
    expect(svg).toContain('xlink:href="#a-r"');
    expect(svg).toContain('<a href="#a-r"');
    // Nothing is left naming the old IDs.
    expect(svg).not.toMatch(/url\((?:&#x27;)?#(?:g|clip)\b|"#r"|#r\s*\{|labelledby="t"/);
  });

  it("leaves a reference to an ID the page does not have as written", () => {
    expect(inlineSvg()).toContain('<use href="#elsewhere"');
  });
});
