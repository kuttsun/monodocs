import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite, EARLIER_MERMAID_ID_PREFIX, preparePages, type PreparedSite } from "./build";
import { loadConfig } from "./config";
import { recordedData } from "./pipeline/postprocess";

/**
 * What the output does not show is kept for comparison without being written (roadmap 7.3.2): a
 * code block's source under Shiki's spans, a diagram's source, an image's bytes as a hash — on the
 * nodes' `data`, which the serialiser does not write.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-record-"));
  now = join(base, "now");
  then = join(base, "then");
  for (const root of [now, then]) await mkdir(join(root, "docs"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(now);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

const diff = { dir: "../then", label: "v1.2" };
const POINTER = `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize 2048\n`;

/** Each version's prepared site from a build with a difference, which stops before writing. */
async function prepared(
  internals: Parameters<typeof buildSite>[1] = {},
): Promise<Record<"new" | "earlier", PreparedSite>> {
  const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
  await expect(
    buildSite(
      { outputFile: join(base, "out.html"), diff },
      { ...internals, onPrepared: (version, site) => (sites[version] = site) },
    ),
  ).rejects.toMatchObject({ code: "diff/unsupported" });
  return sites as Record<"new" | "earlier", PreparedSite>;
}

/** The elements of a page's recorded tree that match. */
function elements(site: PreparedSite, path: string, match: (node: Element) => boolean): Element[] {
  const page = site.pages.find((p) => p.relativePath === path)!;
  const tree = site.trees!.get(page.id) as Root;
  const found: Element[] = [];
  visit(tree, "element", (node) => {
    if (match(node)) found.push(node);
  });
  return found;
}

const sources = (site: PreparedSite, path: string) =>
  elements(site, path, (n) => recordedData(n).monodocsSource !== undefined).map(
    (n) => recordedData(n).monodocsSource,
  );
const images = (site: PreparedSite, path: string) =>
  elements(site, path, (n) => recordedData(n).monodocsImage !== undefined).map(
    (n) => recordedData(n).monodocsImage,
  );

describe("recording what comparison needs", () => {
  it("keeps a code block's source and language under the highlighting, in both builds", async () => {
    for (const root of [now, then]) {
      await writeFile(
        join(root, "docs", "index.md"),
        "# Index\n\n```js\nconst a = 1;\n```\n\n```\nplain\n```\n",
      );
    }
    const sites = await prepared();
    for (const version of ["new", "earlier"] as const) {
      expect(sites[version].pages[0]!.html, version).toContain("shiki");
      expect(sources(sites[version], "index.md"), version).toEqual([
        { kind: "code", source: "const a = 1;\n", lang: "js" },
        { kind: "code", source: "plain\n" },
      ]);
    }
  });

  it("keeps a diagram's source, under its SVG and in client mode", async () => {
    const page = "# Index\n\n```mermaid\ngraph TD; A-->B\n```\n";
    for (const root of [now, then]) await writeFile(join(root, "docs", "index.md"), page);
    const client = await prepared();
    expect(sources(client.earlier, "index.md")).toEqual([
      { kind: "mermaid", source: "graph TD; A-->B\n" },
    ]);

    await writeFile(join(now, "monodocs.config.yml"), "mermaid:\n  mode: pre-render\n");
    const ids: string[] = [];
    const prerendered = await prepared({
      createPrerenderer: () => ({
        async render(id: string) {
          ids.push(id);
          return `<svg id="${id}"><g/></svg>`;
        },
        async close() {},
      }),
    });
    for (const version of ["new", "earlier"] as const) {
      expect(prerendered[version].pages[0]!.html, version).toContain("<svg");
      expect(sources(prerendered[version], "index.md"), version).toEqual([
        { kind: "mermaid", source: "graph TD; A-->B\n" },
      ]);
    }
    // The earlier build's diagrams are numbered apart from the new one's.
    expect(ids).toEqual(["mermaid-0", `${EARLIER_MERMAID_ID_PREFIX}0`]);
  });

  it("hashes an image's bytes, embedded or not, and an image replaced under its name differs", async () => {
    for (const embed of [true, false]) {
      await writeFile(join(now, "monodocs.config.yml"), `assets:\n  embedImages: ${embed}\n`);
      for (const [root, bytes] of [
        [now, "NEW"],
        [then, "OLD"],
      ] as const) {
        await writeFile(join(root, "docs", "index.md"), "# Index\n\n![a](a.png) ![b](b.png)\n");
        await writeFile(join(root, "docs", "a.png"), "SAME");
        await writeFile(join(root, "docs", "b.png"), bytes);
      }
      const sites = await prepared();
      const [newA, newB] = images(sites.new, "index.md");
      const [oldA, oldB] = images(sites.earlier, "index.md");
      expect(newA, `embed ${embed}`).toEqual(oldA);
      expect(newA).toHaveProperty("hash");
      expect(newB).not.toEqual(oldB);
    }
  });

  it("records an image the build does not read by its src", async () => {
    await mkdir(join(then, "outside"), { recursive: true });
    await writeFile(join(then, "outside", "o.png"), "OUT");
    await writeFile(
      join(then, "docs", "index.md"),
      "# Index\n\n![e](https://example.invalid/e.png) ![o](../outside/o.png) ![m](missing.png)\n",
    );
    await writeFile(join(now, "docs", "index.md"), "# Index\n");
    const sites = await prepared();
    expect(images(sites.earlier, "index.md")).toEqual([
      { src: "https://example.invalid/e.png" },
      { src: "../outside/o.png" },
      { src: "missing.png" },
    ]);
  });

  it("is diff/lfs-pointer for an earlier image left unembedded", async () => {
    await writeFile(join(now, "monodocs.config.yml"), "assets:\n  embedImages: false\n");
    await writeFile(join(now, "docs", "index.md"), "# Index\n");
    await writeFile(join(then, "docs", "index.md"), "# Index\n\n![a](a.png)\n");
    await writeFile(join(then, "docs", "a.png"), POINTER);
    await expect(buildSite({ outputFile: join(base, "out.html"), diff })).rejects.toMatchObject({
      code: "diff/lfs-pointer",
    });
  });
});

describe("round 1: what else is recorded", () => {
  it("records sources from AsciiDoc, a listing with no language, and a mermaid block with Mermaid off", async () => {
    const page =
      "= A\n\n[source,js]\n----\nconst a = 1;\n----\n\n----\nplain\n----\n\n[source,mermaid]\n----\ngraph TD; A-->B\n----\n";
    for (const root of [now, then]) await writeFile(join(root, "docs", "a.adoc"), page);
    await writeFile(join(then, "monodocs.config.yml"), "mermaid:\n  enabled: false\n");
    const sites = await prepared();
    expect(sources(sites.new, "a.adoc")).toEqual([
      { kind: "code", source: "const a = 1;", lang: "js" },
      { kind: "code", source: "plain" },
      { kind: "mermaid", source: "graph TD; A-->B" },
    ]);
    // Off in the earlier version, so there it is code in that language.
    expect(sources(sites.earlier, "a.adoc")[2]).toEqual({
      kind: "code",
      source: "graph TD; A-->B",
      lang: "mermaid",
    });
  });

  it("hashes what :data-uri: embeds, as an img and as an object", async () => {
    for (const root of [now, then]) {
      await writeFile(
        join(root, "docs", "a.adoc"),
        "= A\n:data-uri:\n\nimage::p.png[P]\n\nimage::s.svg[S,opts=interactive]\n",
      );
      await writeFile(join(root, "docs", "p.png"), "PNG");
      await writeFile(join(root, "docs", "s.svg"), "<svg/>");
    }
    await writeFile(join(then, "docs", "s.svg"), "<svg><g/></svg>");
    const sites = await prepared();
    const [newP, newS] = images(sites.new, "a.adoc");
    const [oldP, oldS] = images(sites.earlier, "a.adoc");
    expect(newP).toHaveProperty("hash");
    expect(newP).toEqual(oldP);
    expect(newS).toHaveProperty("hash");
    expect(newS).not.toEqual(oldS);
  });

  it("finds an image whose name Markdown percent-encoded", async () => {
    await writeFile(join(now, "docs", "index.md"), "# I\n");
    await writeFile(
      join(then, "docs", "index.md"),
      "# I\n\n![x](図.png) ![y](<a b.png>) ![z](a%23b.png)\n",
    );
    await writeFile(join(then, "docs", "図.png"), "PNG");
    await writeFile(join(then, "docs", "a b.png"), "PNG");
    await writeFile(join(then, "docs", "a#b.png"), "PNG");
    const sites = await prepared();
    for (const image of images(sites.earlier, "index.md")) expect(image).toHaveProperty("hash");
  });
});

describe("a build without a difference", () => {
  it("writes every page as it does without recording, and keeps no trees", async () => {
    await writeFile(
      join(now, "docs", "index.md"),
      "# Index\n\n```js\nconst a = 1;\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\n![a](a.png)\n",
    );
    await writeFile(join(now, "docs", "a.png"), "PNG");
    const config = await loadConfig({}, now);
    const plain = await preparePages(config, now, {});
    const recorded = await preparePages(config, now, { record: true });
    expect(plain.trees).toBeUndefined();
    expect(recorded.trees?.size).toBe(1);
    expect(recorded.pages.map((p) => p.html)).toEqual(plain.pages.map((p) => p.html));
    // And with the diagrams pre-rendered.
    const fake = () => ({
      async render(id: string) {
        return `<svg id="${id}"><g/></svg>`;
      },
      async close() {},
    });
    const pre = { ...config, mermaidMode: "pre-render" as const };
    const plainPre = await preparePages(pre, now, { mermaidPrerenderer: fake() });
    const recordedPre = await preparePages(pre, now, { mermaidPrerenderer: fake(), record: true });
    expect(recordedPre.pages.map((p) => p.html)).toEqual(plainPre.pages.map((p) => p.html));
  });
});
