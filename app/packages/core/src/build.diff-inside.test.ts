import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build";
import type { Page } from "./types";

/**
 * The difference inside a changed block (roadmap 7.3.6), through the build a user runs: a deleted
 * and an added block next to each other, of one kind and in one place, shown as one block with the
 * words that changed marked inside it, in each column and in the one-column view.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-inside-"));
  now = join(base, "now");
  then = join(base, "then");
  vi.spyOn(process, "cwd").mockReturnValue(now);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

type Files = Record<string, string>;

async function write(root: string, files: Files): Promise<void> {
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, "docs"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

/** The pages a build with a difference writes, by route. */
async function difference(earlier: Files, current: Files): Promise<Map<string, string>> {
  await write(then, earlier);
  await write(now, current);
  let pages: Page[] = [];
  await buildSite(
    { outputFile: join(base, "out.html"), diff: { dir: "../then", label: "v1" } },
    { onWritten: (written) => (pages = written) },
  );
  return new Map(pages.map((page) => [page.route, page.html]));
}

/** A page's earlier column, its new column, and the new column with what one column puts back. */
function columns(html: string): { earlier: string; current: string; inline: string } {
  const earlier = html.slice(
    html.indexOf('<div class="monodocs-diff-earlier">'),
    html.indexOf('<div class="monodocs-diff-current">'),
  );
  const rest = html.slice(html.indexOf('<div class="monodocs-diff-current">'));
  const kept = rest.indexOf("<template data-monodocs-diff-inline=");
  const current = kept === -1 ? rest : rest.slice(0, kept);
  const templates = new Map(
    [...rest.matchAll(/<template data-monodocs-diff-inline="(\d+)">([\s\S]*?)<\/template>/g)].map(
      (match) => [match[1]!, match[2]!],
    ),
  );
  const inline = current.replace(/<!-- monodocs-diff-inline (\d+) -->/g, (_, n: string) =>
    templates.get(n)!,
  );
  return { earlier, current, inline };
}

/** The changed blocks of a column, each as its text with the marks written `[-…-]` and `{+…+}`. */
function marked(column: string): string[] {
  return [
    ...column.matchAll(/<(\w+)[^>]*data-monodocs-diff-block="changed"[^>]*>([\s\S]*?)<\/\1>/g),
  ].map((match) =>
    match[2]!
      .replace(/<del data-monodocs-diff="">/g, "[-")
      .replace(/<ins data-monodocs-diff="">/g, "{+")
      .replace(/<\/del>/g, "-]")
      .replace(/<\/ins>/g, "+}")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, ""),
  );
}

/** The marks of a column's blocks, `+`, `-`, or `~`, with their tags. */
function blockMarks(column: string): string[] {
  return [...column.matchAll(/<(\w+)[^>]*data-monodocs-diff-block="(\w+)"/g)].map(
    (match) => `${match[2] === "ins" ? "+" : match[2] === "del" ? "-" : "~"}${match[1]}`,
  );
}

describe("the words inside a changed block (7.3.6)", () => {
  it("shows the pairs measured on 2026-10-14 as recorded, and a rewritten one whole", async () => {
    const pairs: [string, string][] = [
      ["設定ファイルの既定値を変更した。", "設定ファイルの初期値を変更した。"],
      ["The build embeds no timestamp of its own.", "The build embeds no date of its own."],
      [
        "Set the output directory before running the build.",
        "Set the output folder before starting the build.",
      ],
      ["出力を書き出さずに検証する", "出力を書き出さずに、ビルド時と同じ処理で検証する"],
      ["設定を読み込んで出力先を決める", "入力を読んで出力の形式を定める"],
    ];
    const page = (texts: string[]) => `# A\n\n${texts.map((text) => `${text}\n`).join("\n")}`;
    const pages = await difference(
      {
        "docs/a.md": page([...pairs.map(([old]) => old), "旧版の設定で組み、新版の見た目で出す。"]),
      },
      {
        "docs/a.md": page([
          ...pairs.map(([, next]) => next),
          "新版の設定で組み直し、旧版と比べる。",
        ]),
      },
    );
    const { earlier, inline } = columns(pages.get("/a")!);
    expect(marked(inline)).toEqual([
      "設定ファイルの[-既定-]{+初期+}値を変更した。",
      "The build embeds no [-timestamp-]{+date+} of its own.",
      "Set the output [-directory-]{+folder+} before [-running-]{+starting+} the build.",
      "出力を書き出さずに{+、ビルド時と同じ処理で+}検証する",
      "[-設定-]{+入力+}を読[-み込-]んで出力[-先を決-]{+の形式を定+}める",
    ]);
    // The rewritten paragraph keeps less than half of itself: a deletion and an addition.
    expect(blockMarks(inline)).toEqual(["~p", "~p", "~p", "~p", "~p", "-p", "+p"]);
    // The earlier column reads as the earlier paragraphs, its deleted words marked in place.
    expect(marked(earlier)).toEqual([
      "設定ファイルの[-既定-]値を変更した。",
      "The build embeds no [-timestamp-] of its own.",
      "Set the output [-directory-] before [-running-] the build.",
      "出力を書き出さずに検証する",
      "[-設定-]を読[-み込-]んで出力[-先を決-]める",
    ]);
  });

  it("marks one word changed in Japanese mixed with English", async () => {
    const pages = await difference(
      { "docs/a.md": "# A\n\n設定ファイルの path を変更する。\n" },
      { "docs/a.md": "# A\n\n設定ファイルの folder を変更する。\n" },
    );
    expect(marked(columns(pages.get("/a")!).inline)).toEqual([
      "設定ファイルの [-path-]{+folder+} を変更する。",
    ]);
  });

  it("leaves a heading's renumbering out of what changed inside it", async () => {
    // A section added at the start, an unchanged one between: the heading after both is numbered 3
    // where it was 2.
    const pages = await difference(
      { "docs/a.adoc": "= A\n:sectnums:\n\n== One\n\nKeep.\n\n== Install the tool\n\nText.\n" },
      {
        "docs/a.adoc":
          "= A\n:sectnums:\n\n== Zero\n\nNew.\n\n== One\n\nKeep.\n\n== Install the CLI\n\nText.\n",
      },
    );
    const { earlier, inline } = columns(pages.get("/a")!);
    expect(marked(inline)).toEqual(["3. Install the [-tool-]{+CLI+}"]);
    // The earlier column's heading has no number, as any earlier heading has none (19.1).
    expect(marked(earlier)).toEqual(["Install the [-tool-]"]);
  });

  it("deletes a cross-reference's number with the words around it", async () => {
    const figure = "[[f]]\n.Cap\nimage::x.png[]\n\n";
    const pages = await difference(
      {
        "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}See <<f>> for the shape of the thing here.\n`,
      },
      { "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}For the shape of the thing here.\n` },
    );
    const { earlier, inline } = columns(pages.get("/a")!);
    expect(marked(inline)).toEqual(["[-See Figure 1 for -]{+For +}the shape of the thing here."]);
    expect(marked(earlier)).toEqual(["[-See -][-Figure 1-][- for -]the shape of the thing here."]);
    // At the range's end, and added: the number goes with its reference.
    const atEnd = await difference(
      {
        "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}The shape of the thing is shown in <<f>>\n`,
      },
      { "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}The shape of the thing is shown\n` },
    );
    expect(marked(columns(atEnd.get("/a")!).inline)).toEqual([
      "The shape of the thing is shown[- in Figure 1-]",
    ]);
    expect(marked(columns(atEnd.get("/a")!).earlier)).toEqual([
      "The shape of the thing is shown[- in -][-Figure 1-]",
    ]);
    const added = await difference(
      { "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}The shape of the thing is here now.\n` },
      {
        "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}The shape of the thing is in <<f>> now.\n`,
      },
    );
    expect(marked(columns(added.get("/a")!).current)).toEqual([
      "The shape of the thing is {+in +}{+Figure 1+}{+ +}now.",
    ]);
  });

  it("changes the words after a reference that ends with its number, the reference untouched", async () => {
    const figure = "[[f]]\n.Cap\nimage::x.png[]\n\n";
    const page = (text: string) => ({
      "docs/a.adoc": `= A\n:xrefstyle: short\n\n${figure}${text}\n`,
    });
    const one = async (earlier: string, current: string) => {
      const pages = await difference(page(earlier), page(current));
      const { earlier: left, inline } = columns(pages.get("/a")!);
      return { inline: marked(inline), earlier: marked(left) };
    };
    expect(await one("The shape is shown in <<f>> again", "The shape is shown in <<f>>")).toEqual({
      inline: ["The shape is shown in Figure 1[- again-]"],
      earlier: ["The shape is shown in Figure 1[- again-]"],
    });
    expect(await one("The shape is shown in <<f>>", "The shape is shown in <<f>> again")).toEqual({
      inline: ["The shape is shown in Figure 1{+ again+}"],
      earlier: ["The shape is shown in Figure 1"],
    });
    expect(await one("The shape is shown in <<f>> again.", "The shape is shown in <<f>>.")).toEqual(
      {
        inline: ["The shape is shown in Figure 1[- again-]."],
        earlier: ["The shape is shown in Figure 1[- again-]."],
      },
    );
  });

  it("leaves a changed caption label out of the earlier column with its number", async () => {
    const figure = "[[f]]\n.Shape of the thing on the page\nimage::x.png[]\n";
    const pages = await difference(
      { "docs/a.adoc": `= A\n\n${figure}` },
      { "docs/a.adoc": `= A\n:figure-caption: Fig\n\n${figure}` },
    );
    const { earlier, inline } = columns(pages.get("/a")!);
    expect(marked(inline)).toEqual(["[-Figure-]{+Fig+} 1. Shape of the thing on the page"]);
    expect(marked(earlier)).toEqual(["Shape of the thing on the page"]);
    // The label taken off, and changed with the title's first word: the separator goes too.
    const off = await difference(
      { "docs/a.adoc": `= A\n\n${figure}` },
      { "docs/a.adoc": `= A\n:figure-caption!:\n\n${figure}` },
    );
    expect(marked(columns(off.get("/a")!).earlier)).toEqual(["Shape of the thing on the page"]);
    const both = await difference(
      { "docs/a.adoc": `= A\n\n${figure}` },
      {
        "docs/a.adoc": `= A\n:figure-caption: Fig\n\n${figure.replace("Shape", "Form")}`,
      },
    );
    expect(marked(columns(both.get("/a")!).earlier)).toEqual([
      "[-Shape-] of the thing on the page",
    ]);
  });

  it("keeps a linked word before a reference that is a number alone, as before", async () => {
    const page = (extra: string) => ({
      "docs/a.adoc":
        "= A\n:sectnums:\n:xrefstyle: short\n:section-refsig!:\n\n== Intro\n\n" +
        `https://example.com[Docs] <<_next>> are here.\n\n${extra}\n\n== Next\n\nBody.\n`,
    });
    const pages = await difference(page("Old words."), page("New words."));
    expect(columns(pages.get("/a")!).earlier).toMatch(
      /<p data-monodocs-diff-pair="\d+">Docs +are here\.<\/p>/,
    );
  });

  it("changes a reference's words alone when only some of them changed", async () => {
    const page = (caption: string) => ({
      "docs/a.adoc": `= A\n:xrefstyle: short\n:figure-caption: ${caption}\n\n[[f]]\n.Cap\nimage::x.png[]\n\nSee <<f>> for the shape of the thing here.\n`,
    });
    const pages = await difference(page("The figure"), page("The diagram"));
    expect(marked(columns(pages.get("/a")!).inline)).toContain(
      "See The [-figure-]{+diagram+} 1 for the shape of the thing here.",
    );
  });

  it("counts a changed block once in the list of changes, and shows it once in one column", async () => {
    const pages = await difference(
      { "docs/a.md": "# A\n\nOld word here.\n\nKeep.\n" },
      { "docs/a.md": "# A\n\nNew word here.\n\nKeep.\n" },
    );
    expect(pages.get("//changes")).toContain(
      '<li><a href="#/a">A</a> — Added 0 / Deleted 0 / Changed 1</li>',
    );
    const { inline } = columns(pages.get("/a")!);
    expect(blockMarks(inline)).toEqual(["~p"]);
    expect(marked(inline)).toEqual(["[-Old-]{+New+} word here."]);
  });
});

describe("each kind in its own unit (7.3.6)", () => {
  it("compares code by line, highlighted or not, and in another language not at all", async () => {
    const code = (lang: string, b: string) =>
      `# A\n\n\`\`\`${lang}\nconst a = 1;\nconst b = ${b};\nconst c = 3;\n\`\`\`\n`;
    for (const config of [{}, { "monodocs.config.yml": "highlight:\n  enabled: false\n" }]) {
      const pages = await difference(
        { "docs/a.md": code("js", "2"), ...config },
        { "docs/a.md": code("js", "20"), ...config },
      );
      const { earlier, inline } = columns(pages.get("/a")!);
      expect(blockMarks(inline)).toEqual(["~pre"]);
      // Each line marked whole, its line break with it.
      const lines = (column: string) => marked(column).map((text) => text.replace(/\n$/, ""));
      expect(lines(inline)).toEqual([
        "const a = 1;\n[-const b = 2;\n-]{+const b = 20;\n+}const c = 3;",
      ]);
      expect(lines(earlier)).toEqual(["const a = 1;\n[-const b = 2;\n-]const c = 3;"]);
    }
    // A block without a language, highlighting on and off.
    for (const config of [{}, { "monodocs.config.yml": "highlight:\n  enabled: false\n" }]) {
      const pages = await difference(
        { "docs/a.md": code("", "2"), ...config },
        { "docs/a.md": code("", "20"), ...config },
      );
      const lines = marked(columns(pages.get("/a")!).inline).map((text) => text.replace(/\n$/, ""));
      expect(lines).toEqual(["const a = 1;\n[-const b = 2;\n-]{+const b = 20;\n+}const c = 3;"]);
    }
    // The language changed: a deletion and an addition.
    const pages = await difference(
      { "docs/a.md": code("js", "2") },
      { "docs/a.md": code("ts", "2") },
    );
    expect(blockMarks(columns(pages.get("/a")!).inline)).toEqual(["-pre", "+pre"]);
  });

  it("compares a table row cell by cell", async () => {
    const table = (count: string) => `# A\n\n| Part | Count |\n|---|---|\n| Bolt | ${count} |\n`;
    const pages = await difference(
      { "docs/a.md": table("4 pieces") },
      { "docs/a.md": table("6 pieces") },
    );
    const { inline } = columns(pages.get("/a")!);
    expect(blockMarks(inline)).toEqual(["~tr"]);
    expect(marked(inline).map((text) => text.replace(/\s+/g, " ").trim())).toEqual([
      "Bolt [-4-]{+6+} pieces",
    ]);
  });

  it("shows a display formula old and new whole, the earlier one before the new", async () => {
    const pages = await difference(
      { "docs/a.md": "# A\n\n$$\na^2\n$$\n" },
      { "docs/a.md": "# A\n\n$$\na^3\n$$\n" },
    );
    const { inline } = columns(pages.get("/a")!);
    expect(blockMarks(inline)).toEqual(["~span"]);
    expect(inline).toMatch(
      /<del data-monodocs-diff=""><span class="[^"]*math-display[^"]*"[^>]*data-math-tex="\s*a\^2\s*"[\s\S]*?<\/del><span class="[^"]*math-display[^"]*"[^>]*data-monodocs-diff-block="changed"/,
    );
  });
});
