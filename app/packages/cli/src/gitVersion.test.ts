import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractEarlierVersion } from "./gitVersion";

/**
 * `--diff-from <ref>` writes out the files a checkout of that ref would give, and only those the
 * earlier version reads (roadmap 7.3.1). Each test builds a repository of its own.
 */
let base: string;
let repo: string;

/** git with an identity; the machine's own configuration is set aside in `beforeEach`. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "monodocs",
      GIT_AUTHOR_EMAIL: "monodocs@example.invalid",
      GIT_COMMITTER_NAME: "monodocs",
      GIT_COMMITTER_EMAIL: "monodocs@example.invalid",
    },
  });
}

async function write(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

/** Every file under `dir`, relative with `/`, and its bytes. */
function files(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (name === ".git") continue;
      if (statSync(path).isDirectory()) walk(path);
      else out.set(relative(dir, path).split(sep).join("/"), readFileSync(path, "latin1"));
    }
  };
  walk(dir);
  return out;
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-git-version-"));
  repo = join(base, "repo");
  await mkdir(repo);
  // A developer's own settings — `commit.gpgsign`, a global attributes file — would change what
  // these repositories are, so both the helper and the extraction run without them.
  await writeFile(join(base, "gitconfig"), "");
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(base, "gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  git(repo, "init", "-q", "-b", "main");
  // The machine's own line-ending setting would make a checkout and the extraction agree for the
  // wrong reason; with it off, only the repository's attributes decide.
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "core.safecrlf", "false");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(base, { recursive: true, force: true });
});

/**
 * A repository whose `v1` has pages, an `export-ignore` file, and CRLF line endings for Markdown
 * under its root, a file of code outside it, and whose later commit drops the attributes and adds
 * a page.
 */
async function writeHistory(): Promise<void> {
  await write(join(repo, ".gitattributes"), "*.md text eol=crlf\ndocs/ignored.md export-ignore\n");
  await write(join(repo, "monodocs.config.yml"), "title: V1\ninput: docs\n");
  await write(join(repo, "docs", "index.md"), "# Index\n\nA page.\n");
  await write(join(repo, "docs", "ignored.md"), "# Ignored\n\nLeft out of an archive.\n");
  await write(join(repo, "docs", "[draft]", "a.md"), "# Draft\n");
  await write(join(repo, "src", "main.ts"), "export {};\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "v1");
  git(repo, "tag", "v1");
  await write(join(repo, ".gitattributes"), "* -text\n");
  await write(join(repo, "docs", "later.md"), "# Later\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "later");
}

/** The tree a fresh clone at `ref` checks out, which is what the extraction must equal. */
function checkout(ref: string): string {
  const clone = join(base, `clone-${ref}`);
  git(
    base,
    "clone",
    "-q",
    "-c",
    "advice.detachedHead=false",
    "-c",
    "core.autocrlf=false",
    "--branch",
    ref,
    repo,
    clone,
  );
  return clone;
}

describe("extracting a ref", () => {
  it("gives the files a checkout gives under the root, and the configuration, and nothing else", async () => {
    await writeHistory();
    const statusBefore = git(repo, "status", "--porcelain", "--ignored");
    const earlier = await extractEarlierVersion("v1", {}, { cwd: repo });
    try {
      const tree = earlier.diff.tree!;
      const expected = files(checkout("v1"));
      const got = files(tree);
      // Under the root: every file, `export-ignore` included, with v1's line endings.
      for (const [path, bytes] of expected) {
        if (path.startsWith("docs/")) expect(got.get(path), path).toBe(bytes);
      }
      expect(got.get("docs/index.md")).toBe("# Index\r\n\r\nA page.\r\n");
      expect(got.has("docs/ignored.md")).toBe(true);
      expect(got.has("docs/[draft]/a.md")).toBe(true);
      expect(got.has("docs/later.md")).toBe(false);
      // Outside the root: the configuration file, and nothing more.
      expect([...got.keys()].filter((path) => !path.startsWith("docs/"))).toEqual([
        "monodocs.config.yml",
      ]);
      expect(earlier.diff).toMatchObject({ dir: tree, label: "v1" });
    } finally {
      earlier.dispose();
    }
    expect(existsSync(earlier.diff.tree!)).toBe(false);
    expect(git(repo, "status", "--porcelain", "--ignored")).toBe(statusBefore);
  });

  it("works from a subdirectory, mapping the current directory into the earlier version", async () => {
    await writeHistory();
    const cwd = join(repo, "docs");
    const earlier = await extractEarlierVersion("v1", { inputDir: "[draft]" }, { cwd });
    try {
      expect(earlier.diff.dir).toBe(join(earlier.diff.tree!, "docs"));
      expect(readFileSync(join(earlier.diff.dir, "[draft]", "a.md"), "utf8")).toBe("# Draft\r\n");
    } finally {
      earlier.dispose();
    }
  });

  it("extracts a single-file input with the configuration beside it", async () => {
    await writeHistory();
    const earlier = await extractEarlierVersion("v1", { inputDir: "docs/index.md" }, { cwd: repo });
    try {
      expect(existsSync(join(earlier.diff.dir, "docs", "index.md"))).toBe(true);
    } finally {
      earlier.dispose();
    }
  });

  it("is diff/outside-version for a -c the earlier version lacks", async () => {
    await writeHistory();
    await write(join(repo, "custom.yml"), "title: Now\n");
    await expect(
      extractEarlierVersion("v1", { configFile: "custom.yml" }, { cwd: repo }),
    ).rejects.toMatchObject({ code: "diff/outside-version" });
  });

  it("is diff/outside-version for a -c or a root that leaves the repository", async () => {
    await writeHistory();
    await write(join(base, "outside.yml"), "title: Outside\n");
    await expect(
      extractEarlierVersion("v1", { configFile: "../outside.yml" }, { cwd: repo }),
    ).rejects.toMatchObject({ code: "diff/outside-version" });
    await write(join(repo, "monodocs.config.yml"), "root: ..\n");
    git(repo, "commit", "-q", "-am", "root outside");
    await expect(extractEarlierVersion("HEAD", {}, { cwd: repo })).rejects.toMatchObject({
      code: "diff/outside-version",
    });
  });

  it("extracts the file an earlier configuration's input names, and what is beside it", async () => {
    await write(join(repo, "monodocs.config.yml"), "input: docs/index.md\n");
    await write(join(repo, "docs", "index.md"), "# Index\n\n![](img.png)\n");
    await write(join(repo, "docs", "img.png"), "png");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "file input");
    const earlier = await extractEarlierVersion("HEAD", {}, { cwd: repo });
    try {
      expect(existsSync(join(earlier.diff.dir, "docs", "index.md"))).toBe(true);
      expect(existsSync(join(earlier.diff.dir, "docs", "img.png"))).toBe(true);
    } finally {
      earlier.dispose();
    }
  });

  it.skipIf(process.platform === "win32")(
    "works when the temporary directory is reached through a link",
    async () => {
      await writeHistory();
      const real = join(base, "real-tmp");
      const link = join(base, "link-tmp");
      await mkdir(real);
      await symlink(real, link);
      vi.stubEnv("TMPDIR", link);
      const earlier = await extractEarlierVersion("v1", {}, { cwd: repo });
      try {
        expect(existsSync(join(earlier.diff.dir, "docs", "index.md"))).toBe(true);
      } finally {
        earlier.dispose();
      }
    },
  );

  it.skipIf(process.platform !== "linux")(
    "writes out a file whose name is not UTF-8, as a checkout does",
    async () => {
      await write(join(repo, "monodocs.config.yml"), "input: docs\n");
      await write(join(repo, "docs", "index.md"), "# Index\n");
      const name = Buffer.concat([
        Buffer.from(join(repo, "docs") + "/"),
        Buffer.from([0xff, 0x2e]),
      ]);
      writeFileSync(name, "bytes");
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "latin1 name");
      const earlier = await extractEarlierVersion("HEAD", {}, { cwd: repo });
      try {
        const docs = Buffer.from(join(earlier.diff.dir, "docs"));
        const names = readdirSync(docs, { encoding: "buffer" });
        expect(names.some((n) => n.equals(Buffer.from([0xff, 0x2e])))).toBe(true);
      } finally {
        earlier.dispose();
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "reads a document directory committed as a link through to its target, as a checkout does",
    async () => {
      await write(join(repo, "manual", "index.md"), "# Manual\n");
      await symlink("manual", join(repo, "docs"));
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "linked docs");
      for (const options of [{}, { inputDir: "docs" }]) {
        const earlier = await extractEarlierVersion("HEAD", options, { cwd: repo });
        try {
          expect(readFileSync(join(earlier.diff.dir, "docs", "index.md"), "utf8")).toBe(
            "# Manual\n",
          );
        } finally {
          earlier.dispose();
        }
      }
    },
  );

  it("leaves a submodule as an empty directory, as a checkout without --recurse-submodules", async () => {
    await write(join(repo, "monodocs.config.yml"), "input: docs\n");
    await write(join(repo, "docs", "index.md"), "# Index\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "pages");
    const head = git(repo, "rev-parse", "HEAD").trim();
    git(repo, "update-index", "--add", "--cacheinfo", `160000,${head},docs/vendor`);
    git(repo, "commit", "-q", "-m", "submodule");
    const earlier = await extractEarlierVersion("HEAD", {}, { cwd: repo });
    try {
      const vendor = join(earlier.diff.dir, "docs", "vendor");
      expect(statSync(vendor).isDirectory()).toBe(true);
      expect(readdirSync(vendor)).toEqual([]);
    } finally {
      earlier.dispose();
    }
  });

  it("finds a path written in another case where git ignores case, as the new build does", async () => {
    await writeHistory();
    // Unset is false, and `git config` says so by failing.
    const ignoreCase = (() => {
      try {
        return git(repo, "config", "--bool", "core.ignorecase").trim() === "true";
      } catch {
        return false;
      }
    })();
    if (!ignoreCase) return;
    const earlier = await extractEarlierVersion("v1", { inputDir: "Docs" }, { cwd: repo });
    try {
      expect(existsSync(join(earlier.diff.dir, "Docs", "index.md"))).toBe(true);
    } finally {
      earlier.dispose();
    }
  });

  it("removes the temporary directory when the extraction fails", async () => {
    await writeHistory();
    let removed: (() => void) | undefined;
    // A temporary directory of its own, so another test's extraction is not counted as this one's.
    const temp = join(base, "tmp");
    await mkdir(temp);
    for (const name of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(name, temp);
    const before = readdirSync(temp).filter((name) => name.startsWith("monodocs-diff-"));
    await expect(
      extractEarlierVersion(
        "v1",
        { configFile: "missing.yml" },
        {
          cwd: repo,
          onTemporary: (dispose) => (removed = dispose),
        },
      ),
    ).rejects.toMatchObject({ code: "diff/outside-version" });
    expect(removed).toBeDefined();
    const after = readdirSync(temp).filter((name) => name.startsWith("monodocs-diff-"));
    expect(after.filter((name) => !before.includes(name))).toEqual([]);
  });
});

describe("failures that name their cause", () => {
  it("is diff/ref-not-found for a ref that names no commit", async () => {
    await writeHistory();
    await expect(extractEarlierVersion("v9", {}, { cwd: repo })).rejects.toMatchObject({
      code: "diff/ref-not-found",
    });
  });

  it("is diff/ref-not-found for a reflog entry past its end, and an upstream that is not set", async () => {
    await writeHistory();
    for (const ref of ["HEAD@{99}", "@{upstream}"]) {
      await expect(extractEarlierVersion(ref, {}, { cwd: repo })).rejects.toMatchObject({
        code: "diff/ref-not-found",
      });
    }
  });

  it("names fetch-depth: 0 in a shallow clone without the ref", async () => {
    await writeHistory();
    const shallow = join(base, "shallow");
    git(base, "clone", "-q", "--depth", "1", pathToFileURL(repo).href, shallow);
    await expect(extractEarlierVersion("v1", {}, { cwd: shallow })).rejects.toMatchObject({
      code: "diff/ref-not-found",
      message: expect.stringContaining("fetch-depth: 0"),
    });
  });

  it("is diff/not-a-repository outside a work tree", async () => {
    const outside = join(base, "outside");
    await mkdir(outside);
    // A repository above the temporary directory would otherwise be found.
    vi.stubEnv("GIT_CEILING_DIRECTORIES", base);
    await expect(extractEarlierVersion("v1", {}, { cwd: outside })).rejects.toMatchObject({
      code: "diff/not-a-repository",
    });
  });

  it("is diff/not-a-repository inside .git, which is no work tree", async () => {
    await writeHistory();
    await expect(
      extractEarlierVersion("v1", {}, { cwd: join(repo, ".git") }),
    ).rejects.toMatchObject({ code: "diff/not-a-repository" });
  });

  it("is diff/git-unavailable when git is not on PATH", async () => {
    vi.stubEnv("PATH", join(base, "no-bin"));
    await expect(extractEarlierVersion("v1", {}, { cwd: repo })).rejects.toMatchObject({
      code: "diff/git-unavailable",
    });
  });

  it("is diff/git-failed when a required filter cannot run, as a checkout would fail", async () => {
    await write(join(repo, ".gitattributes"), "*.png filter=lfs diff=lfs merge=lfs -text\n");
    await write(join(repo, "docs", "index.md"), "# Index\n");
    // A pointer, committed as it is: the clean filter is not configured yet.
    await write(
      join(repo, "docs", "image.png"),
      "version https://git-lfs.github.com/spec/v1\noid sha256:" + "0".repeat(64) + "\nsize 1\n",
    );
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "lfs");
    // The filter as `git lfs install` writes it, with the program gone.
    git(repo, "config", "filter.lfs.required", "true");
    git(repo, "config", "filter.lfs.smudge", "monodocs-no-such-program smudge -- %f");
    git(repo, "config", "filter.lfs.process", "monodocs-no-such-program filter-process");
    await expect(extractEarlierVersion("HEAD", {}, { cwd: repo })).rejects.toMatchObject({
      code: "diff/git-failed",
    });
  });
});
