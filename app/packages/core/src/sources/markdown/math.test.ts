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

describe("Markdown math against GitHub's captured output", () => {
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

  it("leaves the text around the formulas as GitHub does", () => {
    const mismatches: string[] = [];
    for (const c of CAPTURED) {
      if (!c.batched || c.input in DIFFERENCES) continue;
      const actual = textOf(parse(c.input));
      const expected = githubTextOf(c.html);
      if (actual !== expected)
        mismatches.push(
          `${JSON.stringify(c.input)}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
        );
    }
    expect(mismatches.join("\n")).toBe("");
  });
});

describe("a formula's source", () => {
  const sources = (input: string) => {
    const out: string[] = [];
    const walk = (node: Nodes) => {
      if (node.type === "inlineMath" || node.type === "math") out.push(node.data.source);
      else if ("children" in node) node.children.forEach((c) => walk(c as Nodes));
    };
    walk(parse(input));
    return out;
  };

  it("is taken from the Markdown, not rebuilt, for every captured formula", () => {
    const missing: string[] = [];
    for (const c of CAPTURED) {
      for (const source of sources(c.input)) {
        if (!c.input.includes(source))
          missing.push(`${JSON.stringify(c.input)}: ${JSON.stringify(source)}`);
      }
    }
    expect(missing).toEqual([]);
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
  });

  it("drops the prefixes of a quote or a list from a formula across lines", () => {
    expect(sources("> $$a\n> b$$")).toEqual(["$$a\nb$$"]);
    expect(sources("> > $$x\n> > y$$")).toEqual(["$$x\ny$$"]);
    expect(sources("> ```math\n> a\n> ```")).toEqual(["```math\na\n```"]);
    expect(sources("- x\n\n  ~~~~math\n  a\n  b\n  ~~~~")).toEqual(["~~~~math\na\nb\n~~~~"]);
  });

  it("keeps a fence that runs to the end of the document as it is", () => {
    expect(sources("```math\na")).toEqual(["```math\na"]);
  });
});

describe("what a formula leaves behind", () => {
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

  it("changes nothing in a document without formulas", () => {
    const input = "# T\n\nIt costs $5 and \\$10, *a $b$ c*, `$x$`, [$y$](u).\n\n```js\n$z$\n```\n";
    const plain = unified().use(remarkParse).use(remarkGfm);
    const strip = (n: unknown): unknown =>
      JSON.parse(JSON.stringify(n, (k, v) => (k === "position" ? undefined : v)));
    expect(strip(parse(input))).toEqual(strip(plain.runSync(plain.parse(input))));
  });
});
