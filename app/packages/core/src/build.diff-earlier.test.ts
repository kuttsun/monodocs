import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build";
import { loadConfig, REMOVED_KEY_TRANSLATIONS, translateKeys } from "./config";
import { loadEarlierConfig } from "./diff/earlier";
import { EARLIER_FIELDS, earlierBuildConfig } from "./diff/earlierConfig";
import { isLfsPointer } from "./diff/lfsPointer";

/**
 * Building the earlier version (roadmap 7.3.2): with its own configuration for what the document
 * contains and the new one for how it looks, removed keys read as their replacements, and its hard
 * errors shown in the earlier version. Nothing compares the two yet, so a build that gets through
 * both stops at `diff/unsupported` with `diff.notWritten`.
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

/** The build got through both versions and stopped where nothing writes the difference yet. */
async function expectBothBuilt(): Promise<void> {
  const error = await failure();
  expect(error.code).toBe("diff/unsupported");
  expect(error.message).toContain("v1.2");
  expect(error.message).toContain("does not write the difference");
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
      sidebar: { mode: "folder" },
      sources: { exclude: ["a/**"] },
    });
    // A replacement already written is left beside the old key, to be reported as it is anywhere.
    const both = { sidebar: { exclude: ["a/**"] }, sources: { exclude: ["b/**"] } };
    expect(translateKeys(both)).toEqual(both);
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
