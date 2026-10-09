import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import type { FigureAlign } from "./config";

/**
 * Where a figure lands is a layout computation, so it needs a real engine: happy-dom reports zero
 * for every box. Chromium only when it is present, like print.test.ts and layout.test.ts.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

/** A solid 120 × 60 PNG, narrow enough that each alignment puts it somewhere different. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const MARKDOWN = [
  "# Markdown",
  "",
  "![figure](a.png)",
  "",
  "[![linked](a.png)](https://example.invalid/)",
  "",
  "Press ![icon](a.png) to start.",
  "",
  "```mermaid",
  "graph LR",
  "  A-->B",
  "```",
  "",
].join("\n");

const ASCIIDOC = [
  "= AsciiDoc",
  "",
  "image::a.png[unaligned]",
  "",
  "image::a.png[left,align=left]",
  "",
  ".Caption",
  "image::a.png[right,align=right]",
  "",
  "Press image:a.png[icon] to start.",
  "",
  ".Flow",
  "[source,mermaid]",
  "----",
  "graph LR",
  "  A-->B",
  "----",
  "",
  '[cols="1"]',
  "|===",
  "a|image::a.png[cell]",
  "|===",
  "",
].join("\n");

const DIAGRAM = (id: string) =>
  `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" width="360" height="80" style="max-width: 360px;"></svg>`;

type Box = { left: number; right: number };
type Placement = {
  boxes: Record<string, { figure: Box; column: Box }>;
  /** The computed text-align of the image block's title and of the diagram block's. */
  captions: { image: string; diagram: string };
};

let dir: string;
const html = new Map<FigureAlign, string>();
const measured = new Map<string, Placement>();

beforeAll(async () => {
  if (!chromium) return;
  dir = await mkdtemp(join(tmpdir(), "monodocs-figures-"));
  for (const align of ["left", "center", "right"] as const) {
    const docs = join(dir, align);
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "a.png"), png(120, 60));
    await writeFile(join(docs, "markdown.md"), MARKDOWN);
    await writeFile(join(docs, "asciidoc.adoc"), ASCIIDOC);
    await writeFile(
      join(docs, "monodocs.config.yml"),
      `figures:\n  align: ${align}\nmermaid:\n  mode: pre-render\n`,
    );
    const out = join(dir, `${align}.html`);
    // A drawing of a fixed size stands in for Mermaid's, which keeps the 5 MB client runtime out
    // of the six pages loaded below. Client mode draws into the same `.mermaid > svg`.
    await buildSite(
      { inputDir: docs, outputFile: out, format: "html" },
      { mermaidPrerenderer: { render: async (id) => DIAGRAM(id), close: async () => {} } },
    );
    html.set(align, await readFile(out, "utf8"));
  }
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    for (const media of ["screen", "print"] as const) {
      for (const align of ["left", "center", "right"] as const) {
        measured.set(`${align} ${media}`, await placements(browser, align, media));
      }
    }
  } finally {
    await browser.close();
  }
}, 300_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/**
 * Each image by its page and alt text, and each diagram by `diagram` and its page, with the column
 * it is placed across: the page's content box, or a table cell's for an image in one. The page's
 * box rather than the block's own, so a margin the block keeps from the browser shows up. Every
 * page is shown at once, as print does.
 */
async function placements(
  browser: import("puppeteer-core").Browser,
  align: FigureAlign,
  media: "screen" | "print",
): Promise<Placement> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.setContent(html.get(align)!, { waitUntil: "load" });
    await page.emulateMediaType(media);
    await page.evaluate(() => {
      for (const article of document.querySelectorAll("article.page")) article.hidden = false;
    });
    return await page.evaluate(() => {
      const column = (el: Element): { left: number; right: number } => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          left: box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
          right: box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
        };
      };
      const boxes: Record<string, { figure: Box; column: Box }> = {};
      for (const img of document.querySelectorAll<HTMLImageElement>("article.page img")) {
        const page = img.closest("article.page")!;
        const { left, right } = img.getBoundingClientRect();
        boxes[`${page.getAttribute("data-route")} ${img.alt}`] = {
          figure: { left, right },
          column: column(img.closest("td") ?? page),
        };
      }
      for (const diagram of document.querySelectorAll(".mermaid")) {
        const page = diagram.closest("article.page")!;
        const { left, right } = diagram.querySelector("svg")!.getBoundingClientRect();
        boxes[`diagram ${page.getAttribute("data-route")}`] = {
          figure: { left, right },
          column: column(page),
        };
      }
      const align = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!).textAlign;
      return {
        boxes,
        captions: {
          image: align(".imageblock.text-right .title"),
          diagram: align(".listingblock > .title"),
        },
      };
    });
  } finally {
    await page.close();
  }
}

/** Where `figure` sits in `column`, to the pixel. */
function sits({ figure, column }: { figure: Box; column: Box }): FigureAlign | "elsewhere" {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  if (near(figure.left, column.left)) return "left";
  if (near(figure.right, column.right)) return "right";
  if (near(figure.left + figure.right, column.left + column.right)) return "center";
  return "elsewhere";
}

describe.skipIf(!chromium)("figure alignment, measured", () => {
  for (const media of ["screen", "print"] as const) {
    for (const align of ["left", "center", "right"] as const) {
      it(`puts every unaligned figure at the ${align} under figures.align: ${align} (${media})`, () => {
        const { boxes, captions } = measured.get(`${align} ${media}`)!;
        expect(sits(boxes["/markdown figure"]!)).toBe(align);
        expect(sits(boxes["/markdown linked"]!)).toBe(align);
        expect(sits(boxes["/asciidoc unaligned"]!)).toBe(align);
        expect(sits(boxes["diagram /markdown"]!)).toBe(align);
        expect(sits(boxes["diagram /asciidoc"]!)).toBe(align);
        // An AsciiDoc align= wins over the key, whatever the key says.
        expect(sits(boxes["/asciidoc left"]!)).toBe("left");
        expect(sits(boxes["/asciidoc right"]!)).toBe("right");
        // A block title goes with its image, and with its diagram.
        expect(captions.image).toBe("right");
        expect(captions.diagram).toBe(align);
      });
    }

    it(`leaves an inline image, and one in a table cell, where the key does not reach (${media})`, () => {
      const [left, center, right] = (["left", "center", "right"] as const).map((align) =>
        measured.get(`${align} ${media}`)!,
      );
      for (const key of ["/markdown icon", "/asciidoc icon"]) {
        // Preceded by "Press ", so it is neither at the start of the line nor centred on it.
        expect(sits(left!.boxes[key]!), key).toBe("elsewhere");
      }
      // Nothing in a table cell is a figure: an image block in one sits as the cell's content
      // does, whatever the key says.
      for (const key of ["/markdown icon", "/asciidoc icon", "/asciidoc cell"]) {
        expect(center!.boxes[key]!.figure, key).toEqual(left!.boxes[key]!.figure);
        expect(right!.boxes[key]!.figure, key).toEqual(left!.boxes[key]!.figure);
      }
    });
  }
});

describe.skipIf(!chromium)("a diagram the client runtime draws", () => {
  it("is placed inside its block, and its source is not centred before it is drawn", async () => {
    const docs = join(dir, "client");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), MARKDOWN.replace("![figure](a.png)", ""));
    await writeFile(join(docs, "a.png"), png(120, 60));
    // The CDN runtime keeps the 5 MB inline one out; with no network it never loads, so the
    // block keeps its source, and the test draws into it what the runtime would.
    await writeFile(
      join(docs, "monodocs.config.yml"),
      "figures:\n  align: right\nmermaid:\n  runtime: cdn\n",
    );
    const out = join(dir, "client.html");
    await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromium,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setContent(await readFile(out, "utf8"), { waitUntil: "domcontentloaded" });
      const result = await page.evaluate((svg) => {
        const pre = document.querySelector("pre.mermaid")!;
        const source = getComputedStyle(pre).textAlign;
        pre.innerHTML = svg;
        const box = pre.getBoundingClientRect();
        const style = getComputedStyle(pre);
        const drawn = pre.querySelector("svg")!.getBoundingClientRect();
        return {
          source,
          gap:
            box.right -
            parseFloat(style.paddingRight) -
            parseFloat(style.borderRightWidth) -
            drawn.right,
        };
      }, DIAGRAM("m"));
      expect(["start", "left"]).toContain(result.source);
      // Inside the block's own padding: the block is the grey box the diagram is drawn in.
      expect(Math.abs(result.gap)).toBeLessThanOrEqual(1);
    } finally {
      await browser.close();
    }
  }, 120_000);
});

describe.skipIf(!chromium)("figures under a theme of its own", () => {
  it("are placed by the mark whatever the theme says of the block, its title, or float=", async () => {
    // What a theme written before 0.16 could hold: the default theme's old centring, a title
    // aligned on its own, and the float the `right` class of `float=right` invites.
    const theme = join(dir, "theme");
    await mkdir(theme, { recursive: true });
    await writeFile(
      join(theme, "style.css"),
      [
        "#content .imageblock .content { text-align: center; }",
        "#content .imageblock > .title { text-align: left; }",
        "#content .imageblock.right { float: right; }",
      ].join("\n"),
    );
    const docs = join(dir, "themed");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "a.png"), png(120, 60));
    await writeFile(
      join(docs, "index.adoc"),
      [
        "= Themed",
        "",
        ".Caption",
        "image::a.png[right,align=right]",
        "",
        "image::a.png[floated,float=right]",
        "",
        "After the floated block.",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(docs, "monodocs.config.yml"),
      `figures:\n  align: left\nhtml:\n  theme: ${theme}\n`,
    );
    const out = join(dir, "themed.html");
    await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromium,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setContent(await readFile(out, "utf8"), { waitUntil: "load" });
      const result = await page.evaluate(() => {
        const article = document.querySelector("article.page")!;
        const box = article.getBoundingClientRect();
        const style = getComputedStyle(article);
        const column = {
          left: box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
          right: box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
        };
        const rect = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        return {
          column,
          right: rect("img[alt='right']"),
          caption: getComputedStyle(document.querySelector(".imageblock .title")!).textAlign,
          floated: rect("img[alt='floated']"),
          after: rect(".imageblock.right + .paragraph p"),
        };
      });
      expect(Math.abs(result.right.right - result.column.right)).toBeLessThanOrEqual(1);
      expect(result.caption).toBe("right");
      // Placed by the key, not floated: at the left, and the next paragraph starts below it.
      expect(Math.abs(result.floated.left - result.column.left)).toBeLessThanOrEqual(1);
      expect(result.after.top).toBeGreaterThanOrEqual(result.floated.bottom);
    } finally {
      await browser.close();
    }
  }, 120_000);
});

describe("the figure rules in the generated stylesheet", () => {
  it("are emitted by core, so a theme replacing style.css cannot delete them", async () => {
    const docs = await mkdtemp(join(tmpdir(), "monodocs-figures-css-"));
    try {
      await writeFile(join(docs, "index.md"), "# T\n\nA\n");
      const theme = join(docs, "theme");
      await mkdir(theme, { recursive: true });
      await writeFile(join(theme, "style.css"), "body { color: black; }\n");
      await writeFile(join(docs, "monodocs.config.yml"), `html:\n  theme: ${theme}\n`);
      const out = join(docs, "out.html");
      await buildSite({ inputDir: docs, outputFile: out, format: "html" });
      const built = await readFile(out, "utf8");
      // The theme's own stylesheet is the one in use, and the rules are there anyway.
      expect(built).toContain("body { color: black; }");
      expect(built).toContain(
        '#content [data-monodocs-figure="center"]:not(.mermaid),\n' +
          '.page [data-monodocs-figure="center"]:not(.mermaid) {\n  text-align: center;\n}',
      );
      expect(built).toContain(
        "#content [data-monodocs-figure] > .content,\n" +
          "#content [data-monodocs-figure] > .title,\n" +
          ".page [data-monodocs-figure] > .content,\n" +
          ".page [data-monodocs-figure] > .title {\n  text-align: inherit;\n}",
      );
    } finally {
      await rm(docs, { recursive: true, force: true });
    }
  });
});
