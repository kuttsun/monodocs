import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite, type PreparedSite } from "./build";
import { loadConfig, REMOVED_KEY_TRANSLATIONS, translateKeys } from "./config";
import { loadEarlierConfig } from "./diff/earlier";
import { EARLIER_FIELDS, earlierBuildConfig } from "./diff/earlierConfig";
import { sharedClockAttributes } from "./diff/earlierLocation";
import { isLfsPointer } from "./diff/lfsPointer";

/**
 * Building the earlier version (roadmap 7.3.2): with its own configuration for what the document
 * contains and the new one for how it looks, removed keys read as their replacements, and its hard
 * errors shown in the earlier version.
 */
let base: string;
let now: string;
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-earlier-"));
  now = join(base, "now");
  then = join(base, "then");
  for (const root of [now, then]) {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "index.md"), "# Index\n\nA page.\n");
  }
  vi.spyOn(process, "cwd").mockReturnValue(now);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

const diff = { dir: "../then", label: "v1.2" };

/** What a build with a difference rejects with. */
async function failure(): Promise<{ code?: string; message: string }> {
  try {
    await buildSite({ outputFile: join(base, "out.html"), diff });
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("the build did not stop");
}

/** The build got through both versions and wrote the difference. */
async function expectBothBuilt(): Promise<void> {
  const out = join(base, "out.html");
  await expect(buildSite({ outputFile: out, diff })).resolves.toMatchObject({ outputs: [out] });
}

describe("the configuration the earlier version is built with", () => {
  it("takes from the earlier configuration what the document contains, and nothing else", () => {
    expect([...EARLIER_FIELDS].sort()).toEqual(
      [
        "configFilePath",
        "warnings",
        "inputDir",
        "rootDir",
        "markdownExtensions",
        "asciidocExtensions",
        "include",
        "exclude",
        "asciidocAttributes",
        "lineBreak",
        "sidebarMode",
        "sidebarItems",
        "sidebarTitleFrom",
        "sidebarTitleTransform",
        "sidebarFlattenSingleChild",
        "mathEnabled",
        "mermaidEnabled",
      ].sort(),
    );
  });

  it("turns numbering off, reads onLargeImage: error as warn, and keeps the new look", async () => {
    await writeFile(
      join(now, "monodocs.config.yml"),
      "title: Now\nnumbering:\n  sections: 3\nassets:\n  onLargeImage: error\nmath:\n  enabled: false\n",
    );
    await writeFile(
      join(then, "monodocs.config.yml"),
      "title: Then\nsources:\n  lineBreak: break\n",
    );
    const current = await loadConfig({}, now);
    const earlier = await loadEarlierConfig({}, now, diff);
    const built = earlierBuildConfig(current, earlier);
    expect(built.title).toBe("Now");
    expect(built.numberingSections).toBe(false);
    expect(built.onLargeImage).toBe("warn");
    expect(built.mathEnabled).toBe(true);
    expect(built.inputDir).toBe(earlier.inputDir);
    expect(built.lineBreak).toBe("break");
  });
});

describe("keys a major release removed", () => {
  it("maps sidebar.exclude to sources.exclude, ready for 1.0's removal", () => {
    expect(REMOVED_KEY_TRANSLATIONS).toContainEqual({
      from: "sidebar.exclude",
      to: "sources.exclude",
    });
    expect(translateKeys({ sidebar: { exclude: ["a/**"], mode: "folder" } })).toEqual({
      value: { sidebar: { mode: "folder" }, sources: { exclude: ["a/**"] } },
      moved: [{ from: "sidebar.exclude", to: "sources.exclude" }],
    });
    // A replacement already written is left beside the old key, to be reported as it is anywhere.
    const both = { sidebar: { exclude: ["a/**"] }, sources: { exclude: ["b/**"] } };
    expect(translateKeys(both)).toEqual({ value: both, moved: [] });
  });

  it("reports a problem with a translated key under the name the file gives it", async () => {
    await writeFile(join(then, "monodocs.config.yml"), "sidebar:\n  exclude: 3\n");
    const error = await failure();
    expect(error.code).toBe("config/invalid");
    expect(error.message).toContain("sidebar.exclude");
    expect(error.message).not.toContain("sources.exclude");
  });

  it("builds an earlier version whose configuration uses sidebar.exclude", async () => {
    await writeFile(join(then, "monodocs.config.yml"), "sidebar:\n  exclude: ['drafts/**']\n");
    const earlier = await loadEarlierConfig({}, now, diff);
    expect(earlier.exclude).toContain("drafts/**");
    expect(earlier.warnings).toEqual([]);
    await expectBothBuilt();
  });

  it("is an error for a key the current monodocs does not accept, shown as label:path", async () => {
    await writeFile(join(then, "monodocs.config.yml"), "nonsense: true\n");
    const error = await failure();
    expect(error.code).toBe("config/invalid");
    expect(error.message).toContain("v1.2:monodocs.config.yml");
    expect(error.message).not.toContain(then);
  });
});

describe("building the earlier version", () => {
  it("builds an earlier AsciiDoc version with :sectnums: against numbering.sections", async () => {
    await writeFile(join(now, "monodocs.config.yml"), "numbering:\n  sections: 3\n");
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n:sectnums:\n\n== One\n\nText.\n");
    await expectBothBuilt();
  });

  it("builds an earlier image too large for onLargeImage: error", async () => {
    await writeFile(
      join(now, "monodocs.config.yml"),
      "assets:\n  maxInlineSize: 10B\n  onLargeImage: error\n",
    );
    await writeFile(join(then, "docs", "big.png"), Buffer.alloc(64));
    await writeFile(join(then, "docs", "index.md"), "# Index\n\n![big](big.png)\n");
    await expectBothBuilt();
  });

  it("stops at a hard error in the earlier build, its paths shown in the earlier version", async () => {
    // Two pages on one route is an error in any version.
    await writeFile(join(then, "docs", "guide.md"), "# Guide\n");
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n");
    const error = await failure();
    expect(error.code).toBe("page/duplicate-route");
    expect(error.message).toContain("In the earlier version (v1.2)");
    expect(error.message).not.toContain(then);
  });

  it("says a message with no path is the earlier version's, and rewrites the tree itself", async () => {
    await writeFile(
      join(then, "monodocs.config.yml"),
      "sidebar:\n  exclude: ['a/**']\nsources:\n  exclude: ['b/**']\n",
    );
    expect((await failure()).message).toContain("In the earlier version (v1.2)");
    // The earlier version has no pages, and its root is the tree itself.
    await rm(join(then, "monodocs.config.yml"));
    await rm(join(then, "docs"), { recursive: true });
    await writeFile(join(then, "monodocs.config.yml"), "root: .\n");
    await writeFile(join(now, "monodocs.config.yml"), "root: .\n");
    const error = await failure();
    expect(error.code).toBe("input/no-sources");
    expect(error.message).toContain("v1.2:.");
    expect(error.message).not.toContain(then);
  });

  it("does not stop at what the earlier build only warns about", async () => {
    await writeFile(
      join(then, "docs", "index.md"),
      "# Index\n\n![](missing.png)\n\n[x](nowhere.md)\n",
    );
    await expectBothBuilt();
  });
});

/** A pointer as git-lfs writes it, for an object that is not here. */
const POINTER = `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize 2048\n`;

describe("an LFS pointer the earlier build reads", () => {
  it("knows a pointer, with ext lines, and not a page quoting its first line", () => {
    expect(isLfsPointer(POINTER)).toBe(true);
    expect(isLfsPointer(POINTER.replace(/\n/g, "\r\n"))).toBe(true);
    const withExt = POINTER.replace("oid", `ext-0-foo sha256:${"b".repeat(64)}\noid`);
    expect(isLfsPointer(withExt)).toBe(true);
    // An extension's name is not only letters and digits; `git lfs pointer --check` takes this.
    expect(isLfsPointer(withExt.replace("ext-0-foo", "ext-0-my-filter"))).toBe(true);
    expect(isLfsPointer("version https://git-lfs.github.com/spec/v1\n")).toBe(false);
    expect(isLfsPointer(`# LFS\n\n${POINTER}`)).toBe(false);
  });

  it("is diff/lfs-pointer for a page, an image, and an include that are pointers", async () => {
    const cases: [string, string | Buffer][] = [
      ["docs/index.md", POINTER],
      ["docs/image.png", POINTER],
      ["docs/_part.adoc", POINTER],
    ];
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n\ninclude::_part.adoc[]\n");
    for (const [path, content] of cases) {
      await writeFile(join(then, "docs", "index.md"), "# Index\n\n![](image.png)\n");
      await writeFile(join(then, "docs", "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      await writeFile(join(then, "docs", "_part.adoc"), "Included.\n");
      await writeFile(join(then, path), content);
      const error = await failure();
      expect(error.code, path).toBe("diff/lfs-pointer");
      expect(error.message, path).toContain(`v1.2:${path}`);
    }
  });

  it("leaves a pointer the build never reads, and a page quoting one, as they are", async () => {
    await writeFile(join(then, "docs", "archive.zip"), POINTER);
    await writeFile(
      join(then, "docs", "index.md"),
      "# Index\n\n```\nversion https://git-lfs.github.com/spec/v1\n```\n\n[archive](archive.zip)\n",
    );
    await expectBothBuilt();
  });
});

/** Each version's pages, from a build with a difference. */
async function prepared(): Promise<Record<"new" | "earlier", PreparedSite>> {
  const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
  await expect(
    buildSite(
      { outputFile: join(base, "out.html"), diff },
      { onPrepared: (version, site) => (sites[version] = site) },
    ),
  ).resolves.toBeDefined();
  return sites as Record<"new" | "earlier", PreparedSite>;
}

const textOf = (site: PreparedSite, path: string) =>
  site.pages.find((page) => page.relativePath === path)!.text;

describe("where and when the earlier version was built", () => {
  it("writes {docdir} as the new location, and still reads the earlier files through it", async () => {
    const page = [
      "= Guide",
      "",
      "Here: {docdir}",
      "",
      "include::{docdir}/_part.adoc[]",
      "",
      "image::{docdir}/image.png[Image]",
      "",
    ].join("\n");
    for (const [root, word] of [
      [now, "NOW"],
      [then, "THEN"],
    ] as const) {
      await writeFile(join(root, "docs", "guide.adoc"), page);
      await writeFile(join(root, "docs", "_part.adoc"), `Included from ${word}.\n`);
      await writeFile(join(root, "docs", "image.png"), Buffer.from(word));
    }
    const sites = await prepared();
    const earlier = sites.earlier.pages.find((p) => p.relativePath === "guide.adoc")!;
    const slashed = (path: string) => path.replace(/\\/g, "/");
    expect(slashed(earlier.text)).toContain(`Here: ${slashed(join(now, "docs"))}`);
    expect(slashed(earlier.html)).not.toContain(slashed(then));
    // The include is the earlier version's own, and no line was dropped.
    expect(earlier.text).toContain("Included from THEN.");
    // An image written with `{docdir}` has an absolute target, which no build reads (it is left as
    // an external reference), so it is compared by its `src`: the new location in both versions.
    const src = (html: string) => /<img src="([^"]*)"/.exec(html)?.[1];
    const fresh = sites.new.pages.find((p) => p.relativePath === "guide.adoc")!;
    expect(slashed(src(earlier.html)!)).toBe(slashed(join(now, "docs", "image.png")));
    expect(src(earlier.html)).toBe(src(fresh.html));
    expect(textOf(sites.new, "guide.adoc")).toBe(earlier.text.replace("THEN", "NOW"));
  });

  it("gives the same earlier pages wherever the earlier version sits", async () => {
    // Two copies of one version, as two extractions of a ref would be; one named like the other
    // with more after it, which the rewriting must not take for it.
    const page = "= Guide\n\nHere: {docdir}, and {docdir}2 is not it.\n";
    await writeFile(join(then, "docs", "guide.adoc"), page);
    const copy = `${then}2`;
    await mkdir(join(copy, "docs"), { recursive: true });
    await writeFile(join(copy, "docs", "index.md"), "# Index\n\nA page.\n");
    await writeFile(join(copy, "docs", "guide.adoc"), page);
    const texts: string[] = [];
    for (const dir of ["../then", "../then2"]) {
      const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
      await expect(
        buildSite(
          { outputFile: join(base, "out.html"), diff: { dir, label: "v1.2" } },
          { onPrepared: (version, site) => (sites[version] = site) },
        ),
      ).resolves.toBeDefined();
      texts.push(textOf(sites.earlier!, "guide.adoc"));
    }
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]!.replace(/\\/g, "/")).toContain(`${join(now, "docs").replace(/\\/g, "/")}2`);
  });

  it("gives both builds one instant for {doctime} and {localtime}", async () => {
    for (const root of [now, then]) {
      await writeFile(
        join(root, "docs", "time.adoc"),
        "= Time\n\n{docdate} {doctime} {localdate} {localtime} {docyear}\n",
      );
    }
    const sites = await prepared();
    expect(textOf(sites.earlier, "time.adoc")).toBe(textOf(sites.new, "time.adoc"));
  });

  it("leaves a document's own :docdate: as it wrote it", async () => {
    await writeFile(join(then, "docs", "own.adoc"), "= Own\n:docdate: 1999-09-09\n\n{docdate}\n");
    expect(textOf((await prepared()).earlier, "own.adoc")).toContain("1999-09-09");
  });

  it("writes the instant as Asciidoctor would, and leaves SOURCE_DATE_EPOCH to it", async () => {
    expect(sharedClockAttributes(new Date(), { SOURCE_DATE_EPOCH: "1000000000" })).toEqual({});
    // Measured in UTC, where Asciidoctor writes the zone as `UTC` (@asciidoctor/core 4).
    const at = new Date(Date.UTC(2001, 8, 9, 1, 46, 40));
    if (at.getTimezoneOffset() !== 0) return;
    expect(sharedClockAttributes(at, {})).toEqual({
      docdate: "2001-09-09@",
      doctime: "01:46:40 UTC@",
      localdate: "2001-09-09@",
      localtime: "01:46:40 UTC@",
    });
  });
});

describe("round 2: what the earlier build reads and writes of itself", () => {
  it("writes the new location over a tree whose name the HTML escapes, and in the sidebar", async () => {
    const odd = join(base, "R&D");
    await mkdir(join(odd, "docs"), { recursive: true });
    await writeFile(join(odd, "docs", "index.md"), "# Index\n");
    await writeFile(
      join(odd, "docs", "guide.adoc"),
      "= Title {docdir}\n\nHere: {docdir}\n\nimage::{docdir}/i.png[I]\n",
    );
    const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
    await expect(
      buildSite(
        { outputFile: join(base, "out.html"), diff: { dir: "../R&D", label: "v1.2" } },
        { onPrepared: (version, site) => (sites[version] = site) },
      ),
    ).resolves.toBeDefined();
    const page = sites.earlier!.pages.find((p) => p.relativePath === "guide.adoc")!;
    const slashed = (path: string) => path.replace(/\\/g, "/");
    for (const text of [page.html, page.text, page.title]) {
      expect(slashed(text)).not.toContain("R&");
      expect(slashed(text)).not.toContain("R&#x26;");
    }
    const titles = JSON.stringify(sites.earlier!.sidebar);
    expect(titles).not.toContain("R&D");
    expect(slashed(titles)).toContain(slashed(join(now, "docs")));
  });

  it("is diff/lfs-pointer for an image Asciidoctor embeds or writes inline", async () => {
    for (const page of [
      ":data-uri:\n\nimage::i.png[I]",
      "image::s.svg[opts=inline]",
      "See image:s.svg[opts=inline].",
    ]) {
      await writeFile(join(then, "docs", "i.png"), POINTER);
      await writeFile(join(then, "docs", "s.svg"), POINTER);
      await writeFile(join(then, "docs", "guide.adoc"), `= Guide\n\n${page}\n`);
      const error = await failure();
      expect(error.code, page).toBe("diff/lfs-pointer");
      expect(error.message, page).toContain("v1.2:docs/guide.adoc");
    }
  });

  it("does not take a page quoting a whole pointer in a listing for one", async () => {
    await writeFile(join(then, "docs", "guide.adoc"), `= Guide\n\n----\n${POINTER}----\n`);
    await expectBothBuilt();
  });

  it("reads the one instant from the start of the build, not from each build's own clock", async () => {
    for (const root of [now, then]) {
      await writeFile(join(root, "docs", "time.adoc"), "= Time\n\n{docyear} {localyear}\n");
    }
    const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
    await expect(
      buildSite(
        { outputFile: join(base, "out.html"), diff },
        {
          // An instant far from the real clock, which each build would otherwise read.
          now: () => new Date(Date.UTC(2001, 5, 15, 12)),
          onPrepared: (version, site) => (sites[version] = site),
        },
      ),
    ).resolves.toBeDefined();
    for (const version of ["new", "earlier"] as const) {
      expect(textOf(sites[version]!, "time.adoc"), version).toContain("2001 2001");
    }
  });

  it("makes the pre-renderer for an earlier diagram when the new version has Mermaid off", async () => {
    await writeFile(
      join(now, "monodocs.config.yml"),
      "mermaid:\n  enabled: false\n  mode: pre-render\n",
    );
    await writeFile(
      join(then, "docs", "index.md"),
      "# Index\n\n```mermaid\ngraph TD; A-->B\n```\n",
    );
    const calls: string[] = [];
    const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
    await expect(
      buildSite(
        { outputFile: join(base, "out.html"), diff },
        {
          createPrerenderer: () => ({
            async render(id: string) {
              calls.push(id);
              return `<svg id="${id}"><g/></svg>`;
            },
            async close() {},
          }),
          onPrepared: (version, site) => (sites[version] = site),
        },
      ),
    ).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
    expect(sites.earlier!.pages[0]!.html).toContain("<svg");
  });
});

describe("round 3: where highlighting would cut the location", () => {
  it("writes the new location in a highlighted listing, the same wherever the version sits", async () => {
    const page = [
      "= Code",
      "",
      '[source,js,subs="attributes+"]',
      "----",
      "const p = {docdir}/x;",
      "----",
      "",
      '[source,python,subs="attributes+"]',
      "----",
      "open({docdir}/z)",
      "----",
      "",
    ].join("\n");
    await writeFile(join(then, "docs", "code.adoc"), page);
    const copy = join(base, "then-x");
    await mkdir(join(copy, "docs"), { recursive: true });
    await writeFile(join(copy, "docs", "index.md"), "# Index\n\nA page.\n");
    await writeFile(join(copy, "docs", "code.adoc"), page);
    const htmls: string[] = [];
    for (const dir of ["../then", "../then-x"]) {
      const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
      await expect(
        buildSite(
          { outputFile: join(base, "out.html"), diff: { dir, label: "v1.2" } },
          { onPrepared: (version, site) => (sites[version] = site) },
        ),
      ).resolves.toBeDefined();
      const html = sites.earlier!.pages.find((p) => p.relativePath === "code.adoc")!.html;
      // Highlighted: the location went in before the tokens were cut.
      expect(html).toContain("<span");
      htmls.push(html);
    }
    expect(htmls[0]).toBe(htmls[1]);
    expect(htmls[0]!.replace(/<[^>]+>/g, "")).not.toContain("then");
  });
});

describe("round 4", () => {
  it("is diff/lfs-pointer for an SVG :data-uri: embeds as an object", async () => {
    await writeFile(join(then, "docs", "s.svg"), POINTER);
    await writeFile(
      join(then, "docs", "guide.adoc"),
      "= Guide\n:data-uri:\n\nimage::s.svg[opts=interactive]\n",
    );
    expect((await failure()).code).toBe("diff/lfs-pointer");
  });

  it("writes a new location the HTML must escape, escaped there and as it is in the text", async () => {
    const odd = join(base, "n&w");
    await mkdir(join(odd, "docs"), { recursive: true });
    await writeFile(join(odd, "docs", "index.md"), "# Index\n");
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n\nHere: {docdir}\n");
    vi.spyOn(process, "cwd").mockReturnValue(odd);
    const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
    await expect(
      buildSite(
        { outputFile: join(base, "out.html"), diff },
        { onPrepared: (version, site) => (sites[version] = site) },
      ),
    ).resolves.toBeDefined();
    const page = sites.earlier!.pages.find((p) => p.relativePath === "guide.adoc")!;
    const slashed = (path: string) => path.replace(/\\/g, "/");
    expect(slashed(page.text)).toContain(`Here: ${slashed(join(odd, "docs"))}`);
    expect(page.html).not.toMatch(/n&w/);
    expect(page.html).toMatch(/n&(amp|#x26);w/);
  });
});

describe("round 5", () => {
  it("writes the new location in a title before sidebar.titleTransform changes its characters", async () => {
    const config =
      "sidebar:\n  titleTransform:\n    page:\n      type: regex\n      pattern: '[-/\\\\]'\n      replacement: ' '\n      flags: g\n";
    for (const root of [now, then]) {
      await writeFile(join(root, "monodocs.config.yml"), config);
      await writeFile(join(root, "docs", "guide.adoc"), "= Guide {docdir}\n");
    }
    const sites = await prepared();
    const title = (site: PreparedSite) =>
      site.pages.find((p) => p.relativePath === "guide.adoc")!.title;
    // The same title as the new version's: the location went in before the transform ran.
    expect(title(sites.earlier)).toBe(title(sites.new));
  });
});

describe("cross-review round 1", () => {
  it("writes the new location once when the new version sits inside the earlier one's tree", async () => {
    const inner = join(then, "inner");
    await mkdir(join(inner, "docs"), { recursive: true });
    await writeFile(join(inner, "docs", "index.md"), "# Index\n");
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide {docdir}\n\nHere: {docdir}\n");
    vi.spyOn(process, "cwd").mockReturnValue(inner);
    const sites: Partial<Record<"new" | "earlier", PreparedSite>> = {};
    await expect(
      buildSite(
        { outputFile: join(base, "out.html"), diff: { dir: "..", label: "v1.2" } },
        { onPrepared: (version, site) => (sites[version] = site) },
      ),
    ).resolves.toBeDefined();
    const page = sites.earlier!.pages.find((p) => p.relativePath === "guide.adoc")!;
    const slashed = (path: string) => path.replace(/\\/g, "/");
    expect(slashed(page.text)).toContain(`Here: ${slashed(join(inner, "docs"))}\n`.trimEnd());
    expect(slashed(page.text)).not.toContain("inner/inner");
    expect(slashed(page.html)).not.toContain("inner/inner");
    expect(slashed(page.title)).toBe(`Guide ${slashed(join(inner, "docs"))}`);
    expect(slashed(JSON.stringify(sites.earlier!.sidebar))).not.toContain("inner/inner");
  });

  it("does not let Asciidoctor print the earlier build's warnings", async () => {
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n\ninclude::missing.adoc[]\n");
    const printed: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      printed.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "error").mockImplementation((...args) => void printed.push(args.join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...args) => void printed.push(args.join(" ")));
    await expectBothBuilt();
    expect(printed.join("\n")).not.toContain("missing.adoc");
  });
});

describe("cross-review round 3", () => {
  it("does not check an include Asciidoctor leaves unread past max-include-depth", async () => {
    await writeFile(
      join(then, "monodocs.config.yml"),
      "sources:\n  asciidoc:\n    attributes:\n      max-include-depth: 0\n",
    );
    await writeFile(join(then, "docs", "_part.adoc"), POINTER);
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n\ninclude::_part.adoc[]\n");
    await expectBothBuilt();
  });
});

describe("cross-review round 4", () => {
  it("gives a docdate the configuration sets its own year and datetime", async () => {
    for (const root of [now, then]) {
      await writeFile(
        join(root, "monodocs.config.yml"),
        "sources:\n  asciidoc:\n    attributes:\n      docdate: '1999-09-09'\n",
      );
      await writeFile(join(root, "docs", "time.adoc"), "= Time\n\n{docyear} {docdatetime}\n");
    }
    const sites = await prepared();
    for (const version of ["new", "earlier"] as const) {
      expect(textOf(sites[version], "time.adoc"), version).toMatch(/1999 1999-09-09 /);
    }
    expect(textOf(sites.earlier, "time.adoc")).toBe(textOf(sites.new, "time.adoc"));
  });

  it("checks an include nested under one Asciidoctor reads", async () => {
    await writeFile(join(then, "docs", "_outer.adoc"), "include::_part.adoc[]\n");
    await writeFile(join(then, "docs", "_part.adoc"), POINTER);
    await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n\ninclude::_outer.adoc[]\n");
    expect((await failure()).code).toBe("diff/lfs-pointer");
  });
});

describe("cross-review round 5", () => {
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "leaves an include it cannot read to Asciidoctor, as any build does",
    async () => {
      await writeFile(join(then, "docs", "_part.adoc"), "Included.\n");
      await chmod(join(then, "docs", "_part.adoc"), 0o000);
      await writeFile(join(then, "docs", "guide.adoc"), "= Guide\n\ninclude::_part.adoc[]\n");
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        await expectBothBuilt();
      } finally {
        await chmod(join(then, "docs", "_part.adoc"), 0o644);
      }
    },
  );
});
