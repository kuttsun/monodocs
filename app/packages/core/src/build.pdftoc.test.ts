import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";
import { MonodocsError } from "./diagnostics";
import { pageText as rawPageText } from "./pdfText.testutil";
import type { PageLike } from "./pipeline/browser";
import { buildPdfToc, pdfTocHtml, resolveDestPages, tocTargets } from "./pipeline/pdfToc";
import {
  createPuppeteerPdfGenerator,
  printWithToc,
  type PdfGenerator,
  type PdfRenderOptions,
} from "./pipeline/renderPdf";
import type { Page, SidebarNode } from "./types";

/**
 * A sheet's text without the footer band's "n / total", the sheet's own number among the body's
 * sheets (the cover has none). Whether the band's glyphs are readable depends on the browser
 * build — they are on the CI runners and not in the development image — and the extracted text
 * has no separators, so the exact string is removed rather than a pattern that could also take a
 * table line's number with it.
 */
const sheetCounts = new WeakMap<Uint8Array, number>();

async function pageText(bytes: Uint8Array, index: number, cover = 0): Promise<string> {
  // Counted once per PDF: loading it for every sheet made the long-table test time out on Windows.
  let count = sheetCounts.get(bytes);
  if (count === undefined) {
    count = (await PDFDocument.load(bytes)).getPageCount();
    sheetCounts.set(bytes, count);
  }
  const total = count - cover;
  return (await rawPageText(bytes, index)).replace(`${index - cover + 1} / ${total}`, "");
}

/**
 * `pdf.toc` (roadmap 24.9): a table of contents on paper, whose page numbers are read back from
 * the PDF that is delivered and verified against it.
 */
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-pdftoc-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function page(id: string, headings: Page["headings"]): Page {
  return {
    id,
    route: `/${id}`,
    sourcePath: "",
    relativePath: `${id}.md`,
    format: "markdown",
    title: id,
    aliases: [],
    rawSource: "",
    html: "",
    text: "",
    headings,
    anchors: [],
    links: [],
    assets: [],
  };
}

describe("the entries", () => {
  const pages = [
    page("a", [
      { level: 1, id: "a", text: "A" },
      { level: 2, id: "a-x", text: "X", number: "1.1" },
      { level: 3, id: "a-y", text: "Y", number: "1.1.1" },
    ]),
    page("b", [{ level: 2, id: "b-z", text: "Z" }]),
  ];
  const sidebar: SidebarNode[] = [
    { type: "page", title: "A", route: "/a", pageId: "a", number: "1" },
    {
      type: "dir",
      title: "guide",
      path: "guide",
      number: "2",
      children: [{ type: "page", title: "B", route: "/b", pageId: "b", number: "2.1" }],
    },
  ];

  it("follow the sidebar, with headings down to the depth under each page", () => {
    const toc = buildPdfToc(sidebar, pages, 2, "Contents");
    expect(toc.entries).toEqual([
      { depth: 1, number: "1", title: "A", target: { route: "/a" } },
      { depth: 2, number: "1.1", title: "X", target: { route: "/a", id: "a-x" } },
      // A directory points at its first page, as its bookmark does.
      { depth: 1, number: "2", title: "guide", target: { route: "/b" } },
      { depth: 2, number: "2.1", title: "B", target: { route: "/b" } },
      { depth: 3, number: undefined, title: "Z", target: { route: "/b", id: "b-z" } },
    ]);
    expect(buildPdfToc(sidebar, pages, 3, "Contents").entries.map((e) => e.title)).toContain("Y");
    // One destination per element, however many lines point at it.
    expect(tocTargets(toc)).toEqual({
      targets: [
        { route: "/a" },
        { route: "/a", id: "a-x" },
        { route: "/b" },
        { route: "/b", id: "b-z" },
      ],
      targetIndex: [0, 1, 2, 2, 3],
    });
  });

  it("are escaped, and the column is a fixed width in tabular figures", () => {
    const html = pdfTocHtml(
      {
        title: "<b>Contents</b>",
        entries: [{ depth: 1, title: '<img src=x onerror="x">', target: { route: "/" } }],
      },
      ["12"],
      4,
      "mdtoc-",
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain('<span class="monodocs-toc-page">12</span>');
    expect(html).toMatch(/\.monodocs-toc-page\{flex:none;width:4ch;[^}]*tabular-nums/);
  });
});

/** A PDF of `sheets` blank pages whose destination `mdtoc-n` lands on `lands[n]` (1-based). */
async function fakePdf(sheets: number, lands: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < sheets; i++) doc.addPage();
  const dests = doc.context.obj({});
  lands.forEach((sheet, n) => {
    const target = doc.getPages()[sheet - 1]!.ref;
    (dests as PDFDict).set(
      PDFName.of(`mdtoc-${n}`),
      doc.context.obj([target, PDFName.of("XYZ"), PDFNumber.of(0), PDFNumber.of(0), null]),
    );
  });
  doc.catalog.set(PDFName.of("Dests"), dests);
  return doc.save();
}

/** A page whose prints land the destinations as `prints` says, recording what it was given. */
function fakePage(prints: number[][]): {
  page: PageLike;
  set: string[];
  print: () => Promise<Uint8Array>;
} {
  const set: string[] = [];
  let n = 0;
  return {
    set,
    page: {
      setContent: async () => {},
      addScriptTag: async () => undefined,
      evaluate: async (script: string) => {
        set.push(script);
        return undefined;
      },
      waitForFunction: async () => undefined,
      pdf: async () => new Uint8Array(),
    },
    // Each print has one more sheet than the last, so a test can tell which one came back.
    print: () => {
      const k = n++;
      return fakePdf(9 + k, prints[Math.min(k, prints.length - 1)]!);
    },
  };
}

describe("the passes", () => {
  const toc = {
    title: "Contents",
    entries: [
      { depth: 1, title: "A", target: { route: "/a" } },
      { depth: 2, title: "X", target: { route: "/a", id: "a-x" } },
    ],
  };

  it("reads the sheets back and returns the print that carries them", async () => {
    const fake = fakePage([
      [2, 3],
      [2, 3],
    ]);
    const pdf = await printWithToc(fake.page, toc, fake.print);
    // The second print — the one carrying the numbers, and verified — not the first.
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(10);
    expect(await resolveDestPages(pdf, ["mdtoc-0", "mdtoc-1"])).toEqual([2, 3]);
    // One rewrite of the column, carrying the numbers the first print was read as.
    expect(fake.set).toHaveLength(1);
    expect(fake.set[0]).toContain('monodocs-toc-page\\">2<');
    expect(fake.set[0]).toContain('monodocs-toc-page\\">3<');
  });

  it("prints again when filling the column in moved a section", async () => {
    const fake = fakePage([
      [2, 3],
      [2, 4],
      [2, 4],
    ]);
    const pdf = await printWithToc(fake.page, toc, fake.print);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(11);
    expect(fake.set).toHaveLength(2);
    expect(fake.set[1]).toContain('monodocs-toc-page\\">4<');
  });

  it("fails rather than ship numbers that never settled", async () => {
    const fake = fakePage([
      [2, 3],
      [2, 4],
      [2, 3],
      [2, 4],
    ]);
    const error = await printWithToc(fake.page, toc, fake.print).catch((e) => e);
    expect(error).toBeInstanceOf(MonodocsError);
    expect((error as MonodocsError).code).toBe("pdf/toc-not-converged");
  });

  it("fails when an entry has no destination", async () => {
    const fake = fakePage([[2]]);
    const error = await printWithToc(fake.page, toc, fake.print).catch((e) => e);
    expect((error as MonodocsError).code).toBe("pdf/toc-unresolved");
    expect((error as Error).message).toContain("a-x");
  });
});

describe("what the build hands the PDF generator", () => {
  async function tocOption(config: string) {
    const root = join(dir, `gen-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "index.md"), "# Home\n\n## Part\n");
    const configFile = join(root, "c.yml");
    await writeFile(configFile, config);
    const calls: PdfRenderOptions[] = [];
    const gen: PdfGenerator = {
      async render(_html, options) {
        calls.push(options);
        return new TextEncoder().encode("%PDF-1.4 fake");
      },
      async close() {},
    };
    await buildSite(
      { inputDir: root, configFile, outputFile: join(root, "o.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    return calls[0]!.toc;
  }

  it("is nothing unless enabled", async () => {
    expect(await tocOption("")).toBeUndefined();
  });

  // Checked here rather than on the sheet: the test's text extraction does not decode the CJK
  // font Chromium selects under lang: ja.
  it("titles the table from the document's labels", async () => {
    expect((await tocOption("pdf:\n  toc:\n    enabled: true\n"))?.title).toBe("Contents");
    expect((await tocOption("lang: ja\npdf:\n  toc:\n    enabled: true\n"))?.title).toBe("目次");
    expect(
      (await tocOption("html:\n  labels:\n    contents: Index\npdf:\n  toc:\n    enabled: true\n"))
        ?.title,
    ).toBe("Index");
  });
});

describe("the configuration", () => {
  async function load(body: string) {
    const configFile = join(dir, `c-${Math.random().toString(36).slice(2)}.yml`);
    await writeFile(configFile, body);
    return loadConfig({ configFile }, dir);
  }

  it("is off by default with a depth of 2", async () => {
    expect((await load("")).pdfToc).toEqual({ enabled: false, depth: 2 });
    expect((await load("pdf:\n  toc:\n    enabled: true\n    depth: 4\n")).pdfToc).toEqual({
      enabled: true,
      depth: 4,
    });
  });

  it.each(["depth: 1", "depth: 7", "depth: 2.5", "levels: 3"])("refuses %s", async (line) => {
    await expect(load(`pdf:\n  toc:\n    ${line}\n`)).rejects.toThrow();
  });
});

const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

/** Enough paragraphs to push what follows onto later sheets. */
function filler(n: number, word: string): string {
  return Array.from({ length: n }, (_, i) => `${word} paragraph ${i} of plain text.`).join("\n\n");
}

describe.skipIf(!chromium)("a printed table of contents (real Chromium)", () => {
  async function buildPdf(name: string, config: string): Promise<Uint8Array> {
    const root = join(dir, name);
    const files: Record<string, string> = {
      "index.md": `# Opening\n\n${filler(20, "lorem")}\n\n## Alpha section\n\n${filler(60, "ipsum")}\n\n## Beta section\n\n${filler(5, "dolor")}\n`,
      "guide/install.md": `# Install\n\n## Gamma section\n\n${filler(70, "sit")}\n\n### Delta detail\n\n${filler(5, "amet")}\n`,
      "guide/usage.adoc": `= Usage\n\n== Epsilon section\n\n日本語の本文です。\n\n== Zeta section\n\nText.\n`,
    };
    for (const [path, body] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), body);
    }
    const configFile = join(dir, `${name}.yml`);
    await writeFile(configFile, config);
    const out = join(dir, `${name}.pdf`);
    await buildSite({ inputDir: root, configFile, outputFile: out, format: "pdf" });
    return readFile(out);
  }

  /** The body sheet (1-based, after `cover` sheets) on which `text` first appears, past the table. */
  async function sheetOf(bytes: Uint8Array, text: string, cover: number, from: number) {
    const total = (await PDFDocument.load(bytes)).getPageCount();
    for (let i = cover + from; i < total; i++) {
      if ((await pageText(bytes, i, cover)).includes(text)) return i - cover + 1;
    }
    return undefined;
  }

  it("prints the sheet each section starts on, agreeing with page breaks, a cover, and numbering", async () => {
    const bytes = await buildPdf(
      "all",
      "title: Manual\nnumbering:\n  sections: 3\n" +
        "pdf:\n  pageBreakLevel: 2\n  cover:\n    enabled: true\n  toc:\n    enabled: true\n    depth: 3\n",
    );
    const cover = 1;
    const tocText = await pageText(bytes, cover, cover);
    expect(tocText).toContain("Contents");

    // Every line of the table, in order: pages, the directory (pointing at its first page), and
    // headings down to depth 3. The extracted text has no separators between lines, so the whole
    // table is compared rather than each line matched on its own.
    const lines: [string, string][] = [
      ["1", "Opening"],
      ["1.1", "Alpha section"],
      ["1.2", "Beta section"],
      ["2", "guide"],
      ["2.1", "Install"],
      ["2.1.1", "Gamma section"],
      ["2.1.1.1", "Delta detail"],
      ["2.2", "Usage"],
      ["2.2.1", "Epsilon section"],
      ["2.2.2", "Zeta section"],
    ];
    let expected = "Contents";
    for (const [number, title] of lines) {
      // The sheet the line points at, found independently by reading the body after the table:
      // the heading as printed there, number and all. The directory has no heading of its own;
      // it points at its first page.
      const heading = title === "guide" ? "2.1 Install" : `${number} ${title}`;
      const sheet = await sheetOf(bytes, heading, cover, 1);
      expect(sheet, title).toBeDefined();
      expected += `${number} ${title}${sheet}`;
    }
    expect(tocText).toBe(expected);

    // The bookmarks and the viewer's page labels agree with the table: the first bookmark opens the
    // sheet the table lists for "1 Opening", and the labels number the body — the table's own
    // sheets included — from 1 after the cover, so the viewer shows the number the table prints.
    const doc = await PDFDocument.load(bytes);
    const outlines = doc.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    const firstMark = outlines.lookup(PDFName.of("First"), PDFDict);
    const markDest = firstMark.lookup(PDFName.of("Dest"), PDFArray).get(0);
    const markSheet = doc.getPages().findIndex((p) => p.ref === markDest) - cover + 1;
    expect(markSheet).toBe(await sheetOf(bytes, "1 Opening", cover, 1));
    const nums = doc.catalog
      .lookup(PDFName.of("PageLabels"), PDFDict)
      .lookup(PDFName.of("Nums"), PDFArray);
    expect(nums.get(2)?.toString()).toBe(String(cover));
    const bodyLabel = nums.lookup(3, PDFDict);
    expect(bodyLabel.get(PDFName.of("S"))?.toString()).toBe("/D");
    expect(bodyLabel.get(PDFName.of("St"))?.toString() ?? "1").toBe("1");
    // pageBreakLevel put each h2 on a sheet of its own, so the sheets differ.
    expect(await sheetOf(bytes, "1.2 Beta section", cover, 1)).toBeGreaterThan(
      (await sheetOf(bytes, "1.1 Alpha section", cover, 1))!,
    );
  });

  /** Write `files` under a fresh root and build them to PDF with `config`. */
  async function buildFiles(name: string, files: Record<string, string>, config: string) {
    const root = join(dir, name);
    for (const [path, body] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), body);
    }
    const configFile = join(dir, `${name}.yml`);
    await writeFile(configFile, config);
    const out = join(dir, `${name}.pdf`);
    await buildSite({ inputDir: root, configFile, outputFile: out, format: "pdf" });
    return readFile(out);
  }

  it("finds a heading inside its own page when another page has an element with the same ID", async () => {
    // Page IDs join route segments with "-", so both headings are `setup-install-guide`. The first
    // match across the document would be the wrong heading, verified against itself.
    const bytes = await buildFiles(
      "same-id",
      {
        "setup.md": "# Setup\n\n## Install Guide\n\nShort.\n",
        "setup/install.md": `# Install\n\n${filler(80, "lorem")}\n\n## Guide\n\nEnd.\n`,
      },
      "numbering:\n  sections: 2\npdf:\n  toc:\n    enabled: true\n",
    );
    const guide = await sheetOf(bytes, "2.1.1 Guide", 0, 1);
    expect(guide).toBeGreaterThan(3);
    expect(await pageText(bytes, 0)).toMatch(new RegExp(`2\\.1\\.1 Guide${guide}$`));
  });

  it("fails before printing when a line's section is not in the document", async () => {
    const generator = createPuppeteerPdfGenerator();
    try {
      const error = await generator
        .render(
          '<html><body><main id="content"><article class="page" data-route="/">' +
            '<h1 id="index">Home</h1></article></main></body></html>',
          {
            pageSize: "A4",
            margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
            printBackground: true,
            waitForMermaid: false,
            toc: {
              title: "Contents",
              entries: [
                { depth: 1, title: "Home", target: { route: "/" } },
                { depth: 2, title: "Gone", target: { route: "/", id: "index-gone" } },
              ],
            },
          },
        )
        .catch((e) => e);
      expect((error as MonodocsError).code).toBe("pdf/toc-unresolved");
      expect((error as Error).message).toContain("index-gone");
    } finally {
      await generator.close();
    }
  });

  it("names its anchors so that no ID in the document can be taken for one", async () => {
    // The heading "3" on page `mdtoc` has the ID `mdtoc-3`, which is the name the fourth line's
    // anchor would otherwise get. Chromium resolves a link to the first element with an ID.
    const bytes = await buildFiles(
      "anchor-name",
      {
        "mdtoc.md": "# M\n\n## 3\n\nShort.\n",
        "z.md": `# Z\n\n${filler(80, "lorem")}\n\n## Last\n\nEnd.\n`,
      },
      "pdf:\n  toc:\n    enabled: true\n",
    );
    const last = await sheetOf(bytes, "Last", 0, 1);
    expect(last).toBeGreaterThan(3);
    expect(await pageText(bytes, 0)).toMatch(new RegExp(`Last${last}$`));
  });

  it("tells apart two headings in one page that share an ID", async () => {
    // Asciidoctor only warns about the second [[dup]].
    const bytes = await buildFiles(
      "dup-in-page",
      {
        "c.adoc": `= C\n\n[[dup]]\n== First\n\n${filler(80, "lorem")}\n\n[[dup]]\n== Second\n\nEnd.\n`,
      },
      "pdf:\n  toc:\n    enabled: true\n",
    );
    const first = await sheetOf(bytes, "First", 0, 1);
    const second = await sheetOf(bytes, "Second", 0, 1);
    expect(second).toBeGreaterThan(first!);
    expect(await pageText(bytes, 0)).toBe(`ContentsC${first}First${first}Second${second}`);
  });

  it("leaves out a heading that a collapsed block keeps off the paper", async () => {
    const bytes = await buildFiles(
      "collapsed",
      {
        "doc.adoc":
          "= Doc\n\n== Shown\n\nText.\n\n.Click\n[%collapsible]\n====\n[discrete]\n== Folded\n\nInside.\n====\n",
      },
      "pdf:\n  toc:\n    enabled: true\n",
    );
    const toc = await pageText(bytes, 0);
    expect(toc).toContain("Shown");
    expect(toc).not.toContain("Folded");
  });

  // A longer timeout: it builds a 40-sheet PDF and reads every sheet, and the Windows runner is slow.
  it("numbers every line of a table that runs over several sheets", async () => {
    const files: Record<string, string> = {};
    for (let p = 0; p < 6; p++) {
      let body = `# Page ${p}\n\n`;
      for (let h = 0; h < 30; h++) body += `## Heading ${p}-${h}\n\n${filler(3, "text")}\n\n`;
      files[`p${p}.md`] = body;
    }
    const bytes = await buildFiles("long", files, "pdf:\n  toc:\n    enabled: true\n");
    // Every sheet's text, read once.
    const total = (await PDFDocument.load(bytes)).getPageCount();
    const sheets: string[] = [];
    for (let i = 0; i < total; i++) sheets.push(await pageText(bytes, i));
    // The table takes the sheets before the first page. Headings are matched with what follows
    // them, so "Heading 0-1" is not found inside "Heading 0-10".
    const sheetOfText = (text: string, from: number) =>
      sheets.findIndex((sheet, i) => i >= from && new RegExp(`${text}(?!\\d)`).test(sheet)) + 1;
    const tableSheets = sheetOfText("Heading 0-0", 1) - 1;
    expect(tableSheets).toBeGreaterThan(1);
    const table = sheets.slice(0, tableSheets).join("");

    let expected = "Contents";
    for (let p = 0; p < 6; p++) {
      expected += `Page ${p}${sheetOfText(`Page ${p}`, tableSheets)}`;
      for (let h = 0; h < 30; h++) {
        expected += `Heading ${p}-${h}${sheetOfText(`Heading ${p}-${h}`, tableSheets)}`;
      }
    }
    expect(table).toBe(expected);
  }, 60_000);

  it("lists to depth 2 by default and prints nothing when off", async () => {
    const on = await buildPdf("depth", "pdf:\n  toc:\n    enabled: true\n");
    const text = await pageText(on, 0);
    expect(text).toContain("Contents");
    expect(text).toContain("Alpha section");
    expect(text).not.toContain("Delta detail");

    const off = await buildPdf("off", "");
    expect(await pageText(off, 0)).not.toContain("Contents");
  });
});
