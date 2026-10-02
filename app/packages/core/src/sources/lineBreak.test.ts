import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { RenderContext, SourceFile } from "../types";
import { createAsciidocRenderer } from "./asciidoc/renderer";
import { EAST_ASIAN_WIDTH_UNICODE_VERSION } from "./eastAsianWidth";
import { isEastAsianWide, joinsAcross, type LineBreak } from "./lineBreak";
import { createMarkdownRenderer, markdownRenderer } from "./markdown/renderer";

const CTX: RenderContext = {
  page: { id: "a", route: "/a", relativePath: "a.md", format: "markdown" },
};

function md(raw: string, lineBreak?: LineBreak) {
  const source: SourceFile = {
    absolutePath: "/docs/a.md",
    relativePath: "a.md",
    raw,
    format: "markdown",
  };
  return createMarkdownRenderer({ lineBreak }).render(source, CTX);
}

function adoc(raw: string, lineBreak?: LineBreak, attributes: Record<string, string> = {}) {
  const source: SourceFile = {
    absolutePath: "/docs/a.adoc",
    relativePath: "a.adoc",
    raw,
    format: "asciidoc",
  };
  return createAsciidocRenderer(attributes, undefined, { lineBreak }).render(source, CTX);
}

describe("the East Asian Width table", () => {
  it("matches the vendored Unicode data file it was generated from", async () => {
    const script = fileURLToPath(
      new URL("../../scripts/generate-east-asian-width.mjs", import.meta.url),
    );
    // Exits 1 when regenerating from the data file would change the table.
    await expect(promisify(execFile)(process.execPath, [script, "--check"])).resolves.toBeDefined();
    expect(EAST_ASIAN_WIDTH_UNICODE_VERSION).toBe("18.0.0");
  });

  it.each([
    ["日", 0x65e5, true],
    ["。", 0x3002, true],
    ["fullwidth Ａ", 0xff21, true],
    ["halfwidth ｱ", 0xff71, true],
    ["an unassigned code point in CJK Extension A, W by the file's default", 0x4dbf, true],
    ["a plane 2 ideograph", 0x20000, true],
    ["Latin a", 0x61, false],
    ["ambiguous ○", 0x25cb, false],
    ["no-break space", 0xa0, false],
  ])("classifies %s", (_name, cp, wide) => {
    expect(isEastAsianWide(cp)).toBe(wide);
  });

  it("does not join across Hangul, which separates words with spaces", () => {
    expect(isEastAsianWide("한".codePointAt(0)!)).toBe(true);
    expect(joinsAcross("한", "국")).toBe(false);
    expect(joinsAcross("日", "한")).toBe(false);
    expect(joinsAcross("日", "本")).toBe(true);
    expect(joinsAcross("日", "a")).toBe(false);
  });
});

describe("space (the default)", () => {
  it("is the renderer with nothing configured, byte for byte", async () => {
    const raw = "日本語の文。\n次の文。\nEnglish\nline\n";
    const configured = await md(raw, "space");
    const unconfigured = await markdownRenderer.render(
      { absolutePath: "/docs/a.md", relativePath: "a.md", raw, format: "markdown" },
      CTX,
    );
    expect(configured).toEqual(unconfigured);
    expect(configured.html).toBe("<p>日本語の文。\n次の文。\nEnglish\nline</p>");
  });
});

describe("break", () => {
  it("turns a newline inside a Markdown paragraph into <br>", async () => {
    const r = await md("first  \nsecond\nthird\n\n```\ncode\nlines\n```\n\n`a`\nb\n", "break");
    expect(r.html).toContain("<p>first<br>\nsecond<br>\nthird</p>");
    // Code is another node type and keeps its newlines.
    expect(r.html).toContain("<pre><code>code\nlines\n</code></pre>");
    expect(r.html).toContain("<p><code>a</code><br>\nb</p>");
  });

  it("leaves a multi-line heading as one line, as Asciidoctor does for a title", async () => {
    const r = await md("日本\n語\n===\n\n本文\n続き\n", "break");
    expect(r.html).toContain(">日本\n語</h1>");
    expect(r.html).toContain("<p>本文<br>\n続き</p>");
  });

  it("does not carry the spaces around the newline into either line", async () => {
    const r = await md("one \ntwo\n", "break");
    expect(r.html).toBe("<p>one<br>\ntwo</p>");
  });

  it("sets Asciidoctor's hard-break mode as a default", async () => {
    const r = await adoc("first\nsecond\n", "break");
    expect(r.html).toContain("<p>first<br>\nsecond</p>");
  });

  it.each([":hardbreaks-option!:", ":hardbreaks!:"])(
    "yields to an AsciiDoc document that writes %s",
    async (unset) => {
      const r = await adoc(`= Title\n${unset}\n\nfirst\nsecond\n`, "break");
      expect(r.html).toContain("<p>first\nsecond</p>");
    },
  );

  it("is not set for AsciiDoc under the other values", async () => {
    for (const value of ["space", "join"] as const) {
      const r = await adoc("first\nsecond\n", value);
      expect(r.html).toContain("<p>first\nsecond</p>");
    }
  });
});

describe("join", () => {
  it("removes a newline between two East Asian characters and nowhere else", async () => {
    const r = await md("日本語の文。\n次の文。\nEnglish\nline\n한국어\n문장\n", "join");
    expect(r.html).toBe("<p>日本語の文。次の文。\nEnglish\nline\n한국어\n문장</p>");
  });

  it("joins across inline elements, including the spaces around the newline", async () => {
    const r = await md("**強調**\nです。[リンク](b.md) \t\n先\n", "join");
    expect(r.html).toBe('<p><strong>強調</strong>です。<a href="b.md">リンク</a>先</p>');
  });

  it("handles CRLF, astral characters, and a break that straddles several elements", async () => {
    const r = await md("日本\r\n語。𠮷\n𠮷。*強*\n**_調_**\n終\n", "join");
    expect(r.html).toBe("<p>日本語。𠮷𠮷。<em>強</em><strong><em>調</em></strong>終</p>");
  });

  it("leaves an alert marker on its own line", async () => {
    const r = await md("> [!NOTE]\n> 本文\n> 続き\n", "join");
    expect(r.html).toContain("<p>[!NOTE]\n本文続き</p>");
  });

  it("joins across kbd and samp", async () => {
    const r = await adoc(":experimental:\n\nkbd:[漢]\nを押す\n", "join");
    expect(r.html).toContain("<kbd>漢</kbd>を押す");
  });

  it("keeps an explicit hard break", async () => {
    const r = await md("前\\\n後\n", "join");
    expect(r.html).toBe("<p>前<br>\n後</p>");
  });

  it("does not touch code or join across it", async () => {
    const r = await md("```\n行一\n行二\n```\n\n`コード`\nです\n", "join");
    expect(r.html).toContain("<pre><code>行一\n行二\n</code></pre>");
    expect(r.html).toContain("<p><code>コード</code>\nです</p>");
  });

  it("does not join across blocks", async () => {
    const r = await md("- 一\n- 二\n\n段落\n\n次\n", "join");
    expect(r.html).toBe("<ul>\n<li>一</li>\n<li>二</li>\n</ul>\n<p>段落</p>\n<p>次</p>");
  });

  it("applies to AsciiDoc the same way", async () => {
    const r = await adoc("日本語の文。\n次の文。\nEnglish\nline\n", "join");
    expect(r.html).toContain("<p>日本語の文。次の文。\nEnglish\nline</p>");
  });
});

describe("the page's text for search", () => {
  it.each([
    ["space", "日本語の文。 次の文。"],
    ["break", "日本語の文。\n 次の文。"],
    ["join", "日本語の文。次の文。"],
  ] as const)("agrees with the HTML under %s, in both formats", async (value, text) => {
    expect((await md("日本語の文。\n次の文。\n", value)).text).toBe(text);
    expect((await adoc("日本語の文。\n次の文。\n", value)).text).toBe(text);
  });
});
