import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes, Root } from "mdast";
import { describe, expect, it } from "vitest";
import { remarkMath } from "./math";

/**
 * The Markdown math rules are pinned to GitHub's output as captured on 2026-10-06 (roadmap 6.4), not
 * to the live renderer. Every captured input is parsed here and its formulas — inline or display,
 * and the TeX — compared with GitHub's, except the inputs listed under DIFFERENCES, where monodocs
 * differs on purpose and the expected result is stated instead.
 */

interface Case {
  input: string;
  html: string;
  batched?: boolean;
}

const DATA = join(__dirname, "../../../scripts/data");
const load = (name: string): Case[] =>
  (JSON.parse(readFileSync(join(DATA, name), "utf8")) as { cases: Case[] }).cases;
const CAPTURED = [
  ...load("github-math-2026-10-06.json"),
  ...load("github-math-probes-2026-10-06.json"),
];

interface Formula {
  display: boolean;
  tex: string;
}

function parse(input: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  return processor.runSync(processor.parse(input), input) as Root;
}

function formulasOf(tree: Nodes): Formula[] {
  const out: Formula[] = [];
  const walk = (node: Nodes) => {
    if (node.type === "inlineMath") out.push({ display: node.data.display, tex: node.value });
    else if (node.type === "math") out.push({ display: true, tex: node.value });
    else if ("children" in node) node.children.forEach((c) => walk(c as Nodes));
  };
  walk(tree);
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** GitHub's formulas, read as the capture's `reading` note says. */
function githubFormulas(html: string): Formula[] {
  return [
    ...html.matchAll(
      /<math-renderer class="js-(inline|display)-math"[^>]*>([\s\S]*?)<\/math-renderer>/g,
    ),
  ].map((m) => {
    const display = m[1] === "display";
    const text = display ? decode(m[2]!) : decode(decode(m[2]!));
    const width = text.length >= 4 && text.startsWith("$$") && text.endsWith("$$") ? 2 : 1;
    return { display, tex: text.slice(width, text.length - width) };
  });
}

/** A paragraph's text with each formula as ⟦TeX⟧, for comparing what is left around them. */
function textOf(tree: Root): string {
  const walk = (node: Nodes): string => {
    if (node.type === "inlineMath") return `⟦${node.value}⟧`;
    if (node.type === "text" || node.type === "inlineCode") return node.value;
    if (node.type === "break") return "\n";
    if (node.type === "image") return "";
    if ("children" in node) return node.children.map((c) => walk(c as Nodes)).join("");
    return "";
  };
  return walk(tree);
}

function githubTextOf(html: string): string {
  return decode(
    html
      // GitHub escapes the text after an inline formula once more, as it does the formula: a reader
      // sees `&amp;` there. That is not followed; the text is compared as the author wrote it.
      .replace(
        /(<math-renderer class="js-inline-math"[^>]*>[\s\S]*?<\/math-renderer>)([^<]+)/g,
        (_, formula, text) => formula + decode(text),
      )
      .replace(
        /<math-renderer class="js-(inline|display)-math"[^>]*>([\s\S]*?)<\/math-renderer>/g,
        (_, kind, body) => {
          const text = kind === "display" ? decode(body) : decode(decode(body));
          const width = text.length >= 4 && text.startsWith("$$") && text.endsWith("$$") ? 2 : 1;
          // Escape again so that the outer decode gives the TeX back.
          return `⟦${text.slice(width, text.length - width)}⟧`
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        },
      )
      .replace(/<br>\n/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

/**
 * Inputs where monodocs differs from GitHub on purpose (roadmap 6.4), with what it gives instead.
 *
 * - `\$`: never a delimiter; inside a formula it stays `\$`.
 * - A display paragraph is one that holds only text: mixed with markup, GitHub rewrites the markup
 *   into the formula, and monodocs reads the paragraph by the inline rules.
 * - Raw HTML blocks and a `<div>` inside a paragraph: monodocs drops raw HTML from Markdown.
 */
const DIFFERENCES: Record<string, Formula[]> = {
  "Between \\$5 and 10$ or so.": [],
  "Cost $x = \\$4$ here": [{ display: false, tex: "x = \\$4" }],
  "a $\\$$ b": [{ display: false, tex: "\\$" }],
  "w $$x\\$$ w": [],
  "w $x\\$ w": [],
  "w $\\$ w$ w": [{ display: false, tex: "\\$ w" }],
  "w \\$`x`$ w": [],
  "$$a *b* c$$": [],
  "$$a **b** c$$": [],
  "$$a ~~b~~ c$$": [],
  "$$a _b_ c$$": [],
  "$$a ***b*** c$$": [],
  "$$a *b $y$ c* d$$": [],
  "$$a ![i](u) c$$": [],
  "$$a <em>b</em> c$$": [],
  "$$a *b\nc* d$$": [],
  "$$a *b_c* d$$": [],
  "$$x$$ *w* $$y$$": [
    { display: false, tex: "x" },
    { display: false, tex: "y" },
  ],
  "$$x$$ *$y$* $$z$$": [
    { display: false, tex: "x" },
    { display: false, tex: "z" },
  ],
  "$$ <span>a</span> $$": [],
  "$$x$$ <span>w</span> $$y$$": [
    { display: false, tex: "x" },
    { display: false, tex: "y" },
  ],
  "<details><summary>$x$</summary>\n\n$y$\n\n</details>": [{ display: false, tex: "y" }],
  "w <div>$x$</div> w": [{ display: false, tex: "x" }],
};

/** Inputs whose formulas match GitHub's but whose text around them does not, and why. */
const TEXT_DIFFERENCES: Record<string, string> = {
  // GitHub drops the `$$` after `y`: text lost, which is not followed.
  "$$x\n$$y$$": "GitHub loses text",
};

describe("Markdown math against GitHub's captured output", () => {
  it("reads both captures in full", () => {
    // A data file emptied, or GitHub's markup no longer matched, would let every case pass vacuously.
    expect(CAPTURED).toHaveLength(2839);
    expect(CAPTURED.filter((c) => githubFormulas(c.html).length > 0)).toHaveLength(928);
  });

  it("lists every difference against an input that was captured", () => {
    const inputs = new Set(CAPTURED.map((c) => c.input));
    expect(Object.keys(DIFFERENCES).filter((k) => !inputs.has(k))).toEqual([]);
  });

  it("finds the formulas GitHub finds, inline or display, with the same TeX", () => {
    const mismatches: string[] = [];
    for (const c of CAPTURED) {
      const expected = DIFFERENCES[c.input] ?? githubFormulas(c.html);
      const actual = formulasOf(parse(c.input));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `${JSON.stringify(c.input)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
        );
      }
    }
    expect(mismatches.join("\n")).toBe("");
  });

  it("leaves the text around the formulas as GitHub does, for every one-paragraph input", () => {
    const mismatches: string[] = [];
    let compared = 0;
    for (const c of CAPTURED) {
      if (
        c.input in DIFFERENCES ||
        c.input in TEXT_DIFFERENCES ||
        !/^<p>[\s\S]*<\/p>$/.test(c.html) ||
        c.html.indexOf("</p>") !== c.html.length - 4
      )
        continue;
      compared++;
      const actual = textOf(parse(c.input));
      const expected = githubTextOf(c.html);
      if (actual !== expected)
        mismatches.push(
          `${JSON.stringify(c.input)}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
        );
    }
    expect(mismatches.join("\n")).toBe("");
    expect(compared).toBeGreaterThan(2700);
  });
});

/** Every formula with its source and the Markdown at its position. */
function formulasWithSource(input: string) {
  const out: { source: string; at: string | undefined }[] = [];
  const walk = (node: Nodes) => {
    if (node.type === "inlineMath" || node.type === "math") {
      const p = node.position;
      out.push({ source: node.data.source, at: p && input.slice(p.start.offset, p.end.offset) });
    } else if ("children" in node) node.children.forEach((c) => walk(c as Nodes));
  };
  walk(parse(input));
  return out;
}

const sources = (input: string) => formulasWithSource(input).map((f) => f.source);

describe("a formula's source", () => {
  it("is the Markdown at the formula's own position, for every captured formula", () => {
    const wrong: string[] = [];
    for (const c of CAPTURED) {
      for (const f of formulasWithSource(c.input)) {
        const at = f.at?.replace(/(?:\r\n|\r|\n)[ \t>]*/g, "\n");
        if (f.source !== at) wrong.push(`${JSON.stringify(c.input)}: ${JSON.stringify(f)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("is the formula as written, delimiters and character references included", () => {
    expect(sources("Let $x$ be $&alpha;$ and $a &lt; b$.")).toEqual([
      "$x$",
      "$&alpha;$",
      "$a &lt; b$",
    ]);
    expect(sources("Use $`a+b`$ and $``x``$ here.")).toEqual(["$`a+b`$", "$``x``$"]);
    expect(sources("w $x <!-- c --> y$ w")).toEqual(["$x <!-- c --> y$"]);
    expect(sources("Cost $x = \\$4$ here")).toEqual(["$x = \\$4$"]);
    expect(sources("w $\\{x\\}$ w")).toEqual(["$\\{x\\}$"]);
    expect(sources("$$a  \nc$$")).toEqual(["$$a  \nc$$"]);
  });

  it("drops the prefixes of a quote or a list from a formula across lines, and nothing else", () => {
    expect(sources("> $$a\n> b$$")).toEqual(["$$a\nb$$"]);
    expect(sources("> > $$x\n> > y$$")).toEqual(["$$x\ny$$"]);
    expect(sources("> ```math\n> a\n> ```")).toEqual(["```math\na\n```"]);
    expect(sources("- x\n\n  ~~~~math\n  a\n  b\n  ~~~~")).toEqual(["~~~~math\na\nb\n~~~~"]);
    // A line of the formula that itself starts with `>`, written escaped or as a reference.
    expect(sources("> $$a\n> \\>b$$")).toEqual(["$$a\n\\>b$$"]);
    expect(sources("> $$a\n> &gt;b$$")).toEqual(["$$a\n&gt;b$$"]);
    expect(sources("> a $x$ \\>\n> &gt; $y$ b")).toEqual(["$x$", "$y$"]);
  });

  it("keeps a comment inside a formula as mdast holds it", () => {
    expect(sources("$$x <!--\n  c --> y$$")).toEqual(["$$x <!--\nc --> y$$"]);
    expect(sources("$x <!--\r\nc --> y$ b")).toEqual(["$x <!--\nc --> y$"]);
  });

  it("keeps a fence that runs to the end of the document as it is", () => {
    expect(sources("```math\na")).toEqual(["```math\na"]);
    expect(sources("````math\na\n```")).toEqual(["````math\na\n```"]);
    expect(sources("~~~math\na\n```")).toEqual(["~~~math\na\n```"]);
  });

  it("reads CRLF line endings as LF, in the TeX and in the source", () => {
    const tree = parse("$$a\r\nb$$\r\n\r\n```math\r\nc\r\nd\r\n```\r\n");
    expect(formulasOf(tree)).toEqual([
      { display: true, tex: "a\nb" },
      { display: true, tex: "c\nd" },
    ]);
    expect(sources("$$a\r\nb$$\r\n\r\n```math\r\nc\r\nd\r\n```\r\n")).toEqual([
      "$$a\nb$$",
      "```math\nc\nd\n```",
    ]);
  });
});

describe("what a formula leaves behind", () => {
  it("never reads `\\$` as a delimiter, also in the texts GFM splits around an autolink", () => {
    expect(formulasOf(parse("x<br>www.x.com a \\$x$ b"))).toEqual([]);
    expect(formulasOf(parse("Price:$www.x.com a \\$x$ b"))).toEqual([]);
    // GFM finds these emails after mdast is built, as micromark does not after `_` or `.`.
    expect(formulasOf(parse("w \\_a@b.com\\$x$ y"))).toEqual([]);
    expect(formulasOf(parse("w \\.a@b.com\\$x$ y"))).toEqual([]);
    expect(formulasOf(parse("**<br>www.x.com and $x$ \\$5**"))).toEqual([
      { display: false, tex: "x" },
    ]);
    expect(formulasWithSource("x<br>www.x.com a $x$ b")).toEqual([{ source: "$x$", at: "$x$" }]);
    expect(formulasWithSource("x<br>a $x$ www.x.com b $y$")).toEqual([
      { source: "$x$", at: "$x$" },
      { source: "$y$", at: "$y$" },
    ]);
  });

  it("leaves no empty text and no overlapping position around a code-span formula", () => {
    const input = "$`a`$ and w$`b`$w";
    const paragraph = parse(input).children[0] as { children: Nodes[] };
    expect(
      paragraph.children.map((c) => [
        c.type,
        input.slice(c.position!.start.offset, c.position!.end.offset),
      ]),
    ).toEqual([
      ["inlineMath", "$`a`$"],
      ["text", " and w"],
      ["inlineMath", "$`b`$"],
      ["text", "w"],
    ]);
  });

  it("prints `\\$` outside a formula as a dollar sign", () => {
    expect(textOf(parse("It costs \\$5 and $x$ \\$6."))).toBe("It costs $5 and ⟦x⟧ $6.");
  });

  it("keeps an HTML comment outside a formula and drops one inside", () => {
    const tree = parse("a <!-- k --> $x <!-- c --> y$ b");
    const types = (tree.children[0] as { children: Nodes[] }).children.map((c) =>
      c.type === "html" ? c.value : c.type,
    );
    expect(types).toEqual(["text", "<!-- k -->", "text", "inlineMath", "text"]);
  });
});

describe("the plugin used before remark-parse", () => {
  it("still finds the formulas, after mdast is built", () => {
    const processor = unified().use(remarkMath).use(remarkParse).use(remarkGfm);
    const input = "Let $x$ be \\$5 and $$y$$.";
    expect(formulasOf(processor.runSync(processor.parse(input), input) as Root)).toEqual([
      { display: false, tex: "x" },
      { display: false, tex: "y" },
    ]);
  });
});

describe("a document without formulas", () => {
  const plain = unified().use(remarkParse).use(remarkGfm);
  const unchanged = (input: string) =>
    expect(parse(input), JSON.stringify(input)).toEqual(plain.runSync(plain.parse(input), input));

  it("parses to the very tree it gets without the plugin, positions included", () => {
    unchanged("# T\n\nIt costs $5 and \\$10, *a $b$ c*, `$x$`, [$y$](u).\n\n```js\n$z$\n```\n");
    // GFM finds these autolinks after mdast is built; `\$` must not cut them short.
    unchanged("<br>www.example.com/a\\$b");
    unchanged("<b>www.x.com/a\\$b</b>");
    unchanged("Price:$www.x.com/a\\$b");
    unchanged("> x www.x.com> a");
  });

  it("does so for every captured input without a formula", () => {
    let checked = 0;
    for (const c of CAPTURED) {
      if (formulasOf(parse(c.input)).length > 0) continue;
      unchanged(c.input);
      checked++;
    }
    expect(checked).toBeGreaterThan(1800);
  });

  it("does so for generated snippets of dollar signs, escapes, links, and markup", () => {
    const pieces = [
      "$",
      "\\$",
      "$$",
      "www.x.com/",
      "a",
      "1",
      " ",
      "\n",
      "> ",
      "&amp;",
      "<!-- c -->",
      "`",
      "*",
      "_",
      "\r\n",
      "𝑥",
      "(",
      ")",
      "<b>",
      "~~",
      "- ",
      "|",
      "[l](u)",
      "&#36;",
      "\\",
    ];
    let seed = 1;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let checked = 0;
    for (let n = 0; n < 3000; n++) {
      let input = "";
      const length = 2 + Math.floor(random() * 12);
      for (let k = 0; k < length; k++) input += pieces[Math.floor(random() * pieces.length)];
      if (formulasOf(parse(input)).length > 0) continue;
      unchanged(input);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
