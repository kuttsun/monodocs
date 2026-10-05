import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";
import { MonodocsError } from "./diagnostics";
import { sidebarToOutline } from "./pipeline/pdfOutline";
import { numberSidebar } from "./pipeline/sectionNumbers";
import type { SidebarNode } from "./types";

/**
 * `numbering.sections` (roadmap 19.1): one numbering across a document of Markdown and AsciiDoc
 * files, taken from the sidebar, shown in the headings, the sidebar, and the client data — and
 * never in an address.
 */
let dir: string;

type ClientHeading = { id: string; text: string; level: number; number?: string };
type ClientPage = {
  route: string;
  title: string;
  number?: string;
  headings: ClientHeading[];
  text: string;
};

const FILES: Record<string, string> = {
  "index.md": "# Home\n\nIntro.\n\n## Overview\n\n### Detail\n\n## Scope\n",
  "guide/install.md": "# Install\n\n## Requirements\n\n#### Deep\n",
  "guide/usage.adoc":
    "= Usage\n\n== Basics\n\n=== Options\n\n[discrete]\n== Aside\n\n== Advanced\n\nSee <<_basics>>.\n",
  "secret.md": "---\nhidden: true\n---\n# Secret\n\n## Inside\n",
  "zeta.md": "# Zeta\n\n## Last\n\nLink to [usage](guide/usage.adoc#_options).\n",
};

async function tree(name: string, files: Record<string, string>): Promise<string> {
  const root = join(dir, name);
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}

async function build(input: string, config: string): Promise<string> {
  const suffix = Math.random().toString(36).slice(2);
  const configFile = join(dir, `config-${suffix}.yml`);
  await writeFile(configFile, config);
  const out = join(dir, `out-${suffix}.html`);
  await buildSite({ inputDir: input, configFile, outputFile: out });
  return readFile(out, "utf8");
}

function siteData(html: string): { pages: ClientPage[] } {
  const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
  return JSON.parse(json) as { pages: ClientPage[] };
}

/** Every element ID and every link target in the document: the addresses numbering must not touch. */
function addresses(html: string): { ids: string[]; hrefs: string[]; routes: string[] } {
  return {
    ids: [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!),
    hrefs: [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!),
    routes: [...html.matchAll(/\sdata-route="([^"]*)"/g)].map((m) => m[1]!),
  };
}

/** The number written at the start of the heading carrying `id`, or undefined. */
function headingNumber(html: string, id: string): string | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<h[1-6] id="${escaped}"[^>]*><span class="section-number">([^<]*)</span> `,
  ).exec(html);
  return match?.[1];
}

let docs: string;
let off: string;
let on: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-numbering-"));
  docs = await tree("docs", FILES);
  off = await build(docs, "");
  on = await build(docs, "numbering:\n  sections: 3\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("numbering.sections", () => {
  it("is off by default, and false builds what leaving it out builds", async () => {
    expect(off).not.toMatch(/<span class="section-number">\d/);
    expect(await build(docs, "numbering:\n  sections: false\n")).toBe(off);
  });

  it("numbers continuously across Markdown and AsciiDoc in sidebar order", () => {
    const pages = siteData(on).pages;
    const numbers = (route: string) =>
      Object.fromEntries(
        pages
          .find((page) => page.route === route)!
          .headings.map((heading) => [heading.text, heading.number]),
      );

    expect(pages.map((page) => [page.route, page.number])).toEqual([
      ["/", "1"],
      ["/guide/install", "2.1"],
      ["/guide/usage", "2.2"],
      ["/secret", undefined],
      ["/zeta", "3"],
    ]);
    expect(numbers("/")).toEqual({ Overview: "1.1", Detail: "1.1.1", Scope: "1.2" });
    // An h4 is deeper than `sections: 3`, so it is not numbered.
    expect(numbers("/guide/install")).toEqual({ Requirements: "2.1.1", Deep: undefined });
    // A discrete heading is not a section: unnumbered, and the count passes over it.
    expect(numbers("/guide/usage")).toEqual({
      Basics: "2.2.1",
      Options: "2.2.1.1",
      Aside: undefined,
      Advanced: "2.2.2",
    });
    expect(numbers("/zeta")).toEqual({ Last: "3.1" });
  });

  it("puts the number in an element at the start of the heading, h1 carrying the page's", () => {
    const pages = siteData(on).pages;
    const usage = pages.find((page) => page.route === "/guide/usage")!;
    for (const heading of usage.headings) {
      expect(headingNumber(on, heading.id)).toBe(heading.number);
    }
    // The page title: the AsciiDoc document title and a Markdown h1 alike.
    expect(on).toMatch(/<h1[^>]*><span class="section-number">2\.2<\/span> Usage<\/h1>/);
    expect(on).toMatch(/<h1[^>]*><span class="section-number">1<\/span> Home<\/h1>/);
  });

  it("leaves routes, page IDs, heading IDs, and links exactly as they were", () => {
    expect(addresses(on)).toEqual(addresses(off));
    const ids = (html: string) =>
      siteData(html).pages.map((page) => [page.route, page.headings.map((h) => h.id)]);
    expect(ids(on)).toEqual(ids(off));
  });

  it("keeps the number out of the search text and the title", () => {
    const strip = (html: string) =>
      siteData(html).pages.map((page) => ({
        title: page.title,
        text: page.text,
        headings: page.headings.map((h) => h.text),
      }));
    expect(strip(on)).toEqual(strip(off));
  });

  it("shows the number in the sidebar, for directories and pages", () => {
    expect(on).toContain(
      '<span class="sidebar-dir-title"><span class="section-number">2</span> guide</span>',
    );
    expect(on).toContain(
      'data-route="/guide/usage"><span class="section-number">2.2</span> Usage</a>',
    );
  });

  it("does not number a page that has no place in the sidebar", () => {
    const secret = siteData(on).pages.find((page) => page.route === "/secret")!;
    expect(secret.headings.every((heading) => heading.number === undefined)).toBe(true);
    expect(on).toMatch(/<h1[^>]*>Secret<\/h1>/);
  });

  it("stops at the configured level", async () => {
    const pages = siteData(await build(docs, "numbering:\n  sections: 2\n")).pages;
    const home = pages.find((page) => page.route === "/")!;
    expect(home.headings.map((heading) => heading.number)).toEqual(["1.1", undefined, "1.2"]);
  });

  it("counts a skipped level as zero", async () => {
    const pages = siteData(await build(docs, "numbering:\n  sections: 4\n")).pages;
    const install = pages.find((page) => page.route === "/guide/install")!;
    expect(install.headings.map((heading) => heading.number)).toEqual(["2.1.1", "2.1.1.0.1"]);
  });

  it("follows the sidebar a reader sees: flattened, or written in sidebar.items", async () => {
    const flat = siteData(
      await build(
        await tree("flat", { "a.md": "# A\n", "only/one.md": "# One\n\n## Inner\n" }),
        "numbering:\n  sections: 2\nsidebar:\n  flattenSingleChild: true\n",
      ),
    ).pages;
    expect(flat.map((page) => [page.route, page.number])).toEqual([
      ["/a", "1"],
      ["/only/one", "2"],
    ]);
    expect(flat[1]!.headings[0]!.number).toBe("2.1");

    const custom = siteData(
      await build(
        docs,
        "numbering:\n  sections: 2\nsidebar:\n  mode: custom\n  items:\n" +
          "    - path: zeta.md\n" +
          "    - title: Group\n      children:\n        - path: guide/usage.adoc\n" +
          "        - path: index.md\n",
      ),
    ).pages;
    expect(custom.map((page) => [page.route, page.number])).toEqual([
      ["/zeta", "1"],
      ["/guide/usage", "2.1"],
      ["/", "2.2"],
      // Unlisted: still reachable by its route, and unnumbered.
      ["/guide/install", undefined],
      ["/secret", undefined],
    ]);
  });

  it("carries the number into the PDF bookmarks", () => {
    const sidebar: SidebarNode[] = [
      { type: "page", title: "Home", route: "/", pageId: "index" },
      {
        type: "dir",
        title: "guide",
        path: "guide",
        children: [{ type: "page", title: "Usage", route: "/guide/usage", pageId: "guide-usage" }],
      },
    ];
    const outline = sidebarToOutline(numberSidebar(sidebar).sidebar);
    expect(outline.map((node) => node.title)).toEqual(["1 Home", "2 guide"]);
    expect(outline[1]!.children[0]!.title).toBe("2.1 Usage");
    expect(sidebarToOutline(sidebar)[0]!.title).toBe("Home");
  });

  it("refuses an unknown value", async () => {
    for (const value of ["1", "7", "true", '"3"']) {
      await expect(build(docs, `numbering:\n  sections: ${value}\n`)).rejects.toThrow(
        /numbering\.sections|sections/,
      );
    }
    await expect(build(docs, "numbering:\n  depth: 3\n")).rejects.toThrow(/depth/);
  });
});

describe(":sectnums: while numbering is on", () => {
  const cases: [string, string, string][] = [
    ["in the header", "= T\n:sectnums:\n\n== A\n", ""],
    [
      "turned on above one section only",
      "= T\n\n== A\n\n:sectnums:\n== B\n\n:sectnums!:\n== C\n",
      "",
    ],
    [
      "set in sources.asciidoc.attributes",
      "= T\n\n== A\n",
      "sources:\n  asciidoc:\n    attributes:\n      sectnums: ''\n",
    ],
  ];

  for (const [name, source, extra] of cases) {
    it(`is refused ${name}, naming the configuration key and the file`, async () => {
      const root = await tree(`sectnums-${name.replace(/\W+/g, "-")}`, { "doc.adoc": source });
      const error = await build(root, `numbering:\n  sections: 3\n${extra}`).catch((e) => e);
      expect(error).toBeInstanceOf(MonodocsError);
      expect((error as MonodocsError).code).toBe("numbering/sectnums");
      expect((error as Error).message).toContain("numbering.sections");
      expect((error as Error).message).toContain("doc.adoc");

      // Allowed when numbering is off: the attribute is the author's own numbering then.
      await expect(build(root, extra)).resolves.toContain("<h2");
    });
  }

  it("is reported by validate as an error carrying the code and the path", async () => {
    const root = await tree("sectnums-validate", { "doc.adoc": "= T\n:sectnums:\n\n== A\n" });
    const configFile = join(dir, "sectnums-validate.yml");
    await writeFile(configFile, "numbering:\n  sections: 2\n");
    const result = await validateSite({ inputDir: root, configFile });
    expect(result.errors.map((d) => [d.code, d.path])).toEqual([
      ["numbering/sectnums", "doc.adoc"],
    ]);
  });

  it("leaves a discrete heading alone", async () => {
    const root = await tree("sectnums-discrete", { "doc.adoc": "= T\n\n[discrete]\n== D\n" });
    await expect(build(root, "numbering:\n  sections: 3\n")).resolves.toContain("<h2");
  });
});
