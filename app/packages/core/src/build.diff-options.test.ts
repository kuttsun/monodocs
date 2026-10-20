import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite, validateSite } from "./build";
import { loadEarlierConfig } from "./diff/earlier";
import { serveSite } from "./serve";
import type { BuildOptions } from "./types";
import { watchSite } from "./watch";

/**
 * Naming the earlier version (roadmap 7.3.1): `diff.dir` stands for the current directory, every
 * path the command line names is mapped through it, and every path the earlier version resolves
 * stays inside `diff.tree`. Nothing writes the difference yet, so a build that gets that far is
 * `diff/unsupported` rather than a build that accepted `diff` and ignored it (7.3).
 */
let base: string;
/** The current version, and the current directory of every build here. */
let now: string;
/** The earlier version's counterpart of `now`. */
let then: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-options-"));
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

/** The code a call rejects with. */
async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

const diff = (extra: Partial<NonNullable<BuildOptions["diff"]>> = {}) => ({
  dir: then,
  label: "v1.2",
  ...extra,
});

describe("naming the earlier version", () => {
  it("resolves the earlier version and stops at diff/unsupported, writing nothing", async () => {
    const out = join(base, "out.html");
    await expect(buildSite({ outputFile: out, diff: diff() })).rejects.toMatchObject({
      code: "diff/unsupported",
      message: expect.stringContaining("v1.2"),
    });
    await expect(import("node:fs").then((fs) => fs.existsSync(out))).resolves.toBe(false);
  });

  it("is diff/dir-not-found for a directory that does not exist or is a file", async () => {
    expect(await codeOf(buildSite({ diff: diff({ dir: join(base, "missing") }) }))).toBe(
      "diff/dir-not-found",
    );
    await writeFile(join(base, "file"), "");
    expect(await codeOf(buildSite({ diff: diff({ dir: join(base, "file") }) }))).toBe(
      "diff/dir-not-found",
    );
  });

  it("refuses a PDF, from -f or output.format, and diff.pdf", async () => {
    for (const format of ["pdf", "both"] as const) {
      expect(await codeOf(buildSite({ format, diff: diff() }))).toBe("diff/unsupported");
    }
    await writeFile(join(now, "monodocs.config.yml"), "output:\n  format: pdf\n");
    expect(await codeOf(buildSite({ diff: diff() }))).toBe("diff/unsupported");
    await rm(join(now, "monodocs.config.yml"));
    expect(await codeOf(buildSite({ format: "html", diff: diff({ pdf: "bars" }) }))).toBe(
      "diff/unsupported",
    );
  });

  it("is refused by watchSite and serveSite, and reported by validateSite", async () => {
    expect(await codeOf(watchSite({ diff: diff() }))).toBe("diff/unsupported");
    expect(await codeOf(serveSite({ diff: diff() }))).toBe("diff/unsupported");
    const result = await validateSite({ diff: diff() });
    expect(result.errors.map((d) => d.code)).toEqual(["diff/unsupported"]);
  });
});

describe("mapping the command line's paths", () => {
  it("maps the input argument, a file included, through diff.dir", async () => {
    await writeFile(join(then, "docs", "plan.md"), "# Plan\n");
    const config = await loadEarlierConfig({ inputDir: "docs/plan.md" }, now, diff());
    expect(config.inputDir).toBe(join(then, "docs", "plan.md"));
    expect(config.rootDir).toBe(join(then, "docs"));
  });

  it("is diff/outside-version for an input the earlier version does not have", async () => {
    await mkdir(join(now, "guide"));
    await expect(loadEarlierConfig({ inputDir: "guide" }, now, diff())).rejects.toMatchObject({
      code: "diff/outside-version",
      message: expect.stringContaining("guide"),
    });
  });

  it("is diff/outside-version for a -c the earlier version lacks, never the defaults", async () => {
    await writeFile(join(now, "custom.yml"), "title: Now\n");
    await expect(
      loadEarlierConfig({ configFile: "custom.yml" }, now, diff()),
    ).rejects.toMatchObject({
      code: "diff/outside-version",
      message: expect.stringContaining("custom.yml"),
    });
  });

  it("is diff/outside-version for a -c or an input that leaves the tree", async () => {
    await writeFile(join(base, "outside.yml"), "title: Outside\n");
    for (const options of [{ configFile: "../outside.yml" }, { inputDir: ".." }]) {
      expect(await codeOf(loadEarlierConfig(options, now, diff()))).toBe("diff/outside-version");
    }
  });

  it("is diff/outside-version for an earlier root or input that leaves the tree", async () => {
    for (const body of ["root: ..\n", "input: ../now/docs\n"]) {
      await writeFile(join(then, "monodocs.config.yml"), body);
      expect(await codeOf(loadEarlierConfig({}, now, diff()))).toBe("diff/outside-version");
    }
  });

  it("reports a current directory the earlier version lacks, not an empty version", async () => {
    // The tree is there; the current directory's counterpart in it is not.
    const missing = diff({ dir: join(then, "renamed"), tree: then });
    for (const options of [{ inputDir: "." }, {}]) {
      await expect(loadEarlierConfig(options, now, missing)).rejects.toMatchObject({
        code: "diff/outside-version",
        message: expect.stringContaining("renamed"),
      });
    }
  });

  it("is diff/outside-version for an earlier input that is not there", async () => {
    await rm(join(then, "docs"), { recursive: true });
    await expect(loadEarlierConfig({}, now, diff())).rejects.toMatchObject({
      code: "diff/outside-version",
      message: expect.stringContaining("docs"),
    });
  });

  it.skipIf(process.platform === "win32")(
    "is diff/outside-version for a configuration that links out of the tree, never the defaults",
    async () => {
      await symlink("../nowhere.yml", join(then, "monodocs.config.yml"));
      expect(await codeOf(loadEarlierConfig({}, now, diff()))).toBe("diff/outside-version");
    },
  );

  it("is diff/outside-version where the earlier version has a file for a directory", async () => {
    await rm(join(then, "docs"), { recursive: true });
    await writeFile(join(then, "docs"), "a file, once");
    await mkdir(join(now, "docs", "guide"));
    expect(await codeOf(loadEarlierConfig({ inputDir: "docs/guide" }, now, diff()))).toBe(
      "diff/outside-version",
    );
    const inDocs = diff({ dir: join(then, "docs"), tree: then });
    expect(await codeOf(loadEarlierConfig({}, join(now, "docs"), inDocs))).toBe(
      "diff/outside-version",
    );
  });

  it.skipIf(process.platform === "win32")(
    "reads a missing link's target from where the link really is",
    async () => {
      await mkdir(join(then, "a", "b", "c"), { recursive: true });
      await symlink("../../..", join(then, "a", "b", "c", "up"));
      await symlink("../nowhere.yml", join(then, "monodocs.config.yml"));
      expect(await codeOf(loadEarlierConfig({ inputDir: "a/b/c/up" }, now, diff()))).toBe(
        "diff/outside-version",
      );
    },
  );

  it("is diff/outside-version for a root out of the tree that the input disagrees with", async () => {
    // Found beside the input, as the new configuration would be; its root is two levels up.
    await writeFile(join(then, "docs", "monodocs.config.yml"), "root: ../..\n");
    expect(await codeOf(loadEarlierConfig({ inputDir: "docs" }, now, diff()))).toBe(
      "diff/outside-version",
    );
  });

  it.skipIf(process.platform === "win32")(
    "reads a backslash in a missing link's target as a character on POSIX",
    async () => {
      // `..\..` is one name here, not a way back in: the link leaves the tree.
      await symlink("../escape\\../then/missing.yml", join(then, "monodocs.config.yml"));
      expect(await codeOf(loadEarlierConfig({}, now, diff()))).toBe("diff/outside-version");
    },
  );

  it("allows what leaves diff.dir but stays inside diff.tree", async () => {
    await writeFile(join(then, "monodocs.config.yml"), "root: ..\n");
    const config = await loadEarlierConfig({}, now, diff({ tree: base }));
    expect(config.rootDir).toBe(base);
  });

  it("reads the earlier version's own configuration, with or without the new one", async () => {
    // Without -c, an earlier version with no configuration builds with the defaults...
    await writeFile(join(now, "monodocs.config.yml"), "title: Now\n");
    expect((await loadEarlierConfig({}, now, diff())).title).not.toBe("Now");
    // ...and one with a file the new version lacks builds with it.
    await rm(join(now, "monodocs.config.yml"));
    await writeFile(join(then, "monodocs.config.yml"), "title: Then\n");
    expect((await loadEarlierConfig({}, now, diff())).title).toBe("Then");
  });

  it("finds the configuration beside a mapped input, as the new one is found", async () => {
    await writeFile(join(then, "docs", "monodocs.config.yml"), "title: Beside\n");
    expect((await loadEarlierConfig({ inputDir: "docs" }, now, diff())).title).toBe("Beside");
  });
});
