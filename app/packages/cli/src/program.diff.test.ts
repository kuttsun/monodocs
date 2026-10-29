import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "./program";

/** The options that name an earlier version exist on `build` alone (roadmap 7.3.1). */
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((message: string) => void errors.push(message));
  await createProgram().parseAsync(["node", "monodocs", ...args]);
  return errors;
}

describe("--diff-from and --diff-from-dir", () => {
  it("cannot be used together", async () => {
    const errors = await run("build", "--diff-from", "v1", "--diff-from-dir", "../v1");
    expect(errors.join("\n")).toContain("--diff-from and --diff-from-dir");
    expect(process.exitCode).toBe(1);
  });

  it("are refused with a PDF before git is run", async () => {
    vi.stubEnv("PATH", "");
    const errors = await run("build", "-f", "pdf", "--diff-from", "v1");
    expect(errors.join("\n")).toContain("HTML only");
    vi.unstubAllEnvs();
  });

  it("are unknown to watch, serve, and validate", async () => {
    // Commander prints its own line before throwing; the code is what is checked.
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    for (const command of ["watch", "serve", "validate"]) {
      for (const option of ["--diff-from", "--diff-from-dir"]) {
        await expect(
          createProgram().parseAsync(["node", "monodocs", command, option, "v1"]),
        ).rejects.toMatchObject({
          code: "commander.unknownOption",
        } satisfies Partial<CommanderError>);
      }
    }
  });

  it("leave no temporary directory behind when the build ends", async () => {
    const base = await mkdtemp(join(tmpdir(), "monodocs-program-diff-"));
    try {
      await writeFile(join(base, "gitconfig"), "");
      const env = {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(base, "gitconfig"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "monodocs",
        GIT_AUTHOR_EMAIL: "monodocs@example.invalid",
        GIT_COMMITTER_NAME: "monodocs",
        GIT_COMMITTER_EMAIL: "monodocs@example.invalid",
      };
      const git = (...args: string[]) => execFileSync("git", args, { cwd: base, env });
      await mkdir(join(base, "docs"));
      await writeFile(join(base, "docs", "index.md"), "# Index\n");
      git("init", "-q", "-b", "main");
      git("add", "-A");
      git("commit", "-q", "-m", "v1");
      vi.spyOn(process, "cwd").mockReturnValue(base);
      // A temporary directory of its own, so another test's extraction running alongside is not
      // counted as this one's.
      const temp = join(base, "tmp");
      await mkdir(temp);
      for (const name of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(name, temp);
      const temporaries = () =>
        readdirSync(temp).filter((name) => name.startsWith("monodocs-diff-"));
      const before = temporaries();
      const errors = await run("build", "--diff-from", "HEAD", "-o", join(base, "out.html"));
      expect(errors).toEqual([]);
      expect(process.exitCode).toBeUndefined();
      expect(temporaries().filter((name) => !before.includes(name))).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await rm(base, { recursive: true, force: true });
    }
  });

  it("stop at an LFS pointer under the root that a page reads, and at no other", async () => {
    const base = await mkdtemp(join(tmpdir(), "monodocs-program-lfs-"));
    try {
      await writeFile(join(base, "gitconfig"), "");
      const env = {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(base, "gitconfig"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "monodocs",
        GIT_AUTHOR_EMAIL: "monodocs@example.invalid",
        GIT_COMMITTER_NAME: "monodocs",
        GIT_COMMITTER_EMAIL: "monodocs@example.invalid",
      };
      const git = (...args: string[]) => execFileSync("git", args, { cwd: base, env });
      const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize 2048\n`;
      await mkdir(join(base, "docs"));
      await mkdir(join(base, "assets"));
      // Committed as git-lfs would leave them without its filter: the pointers themselves.
      await writeFile(join(base, "docs", "archive.zip"), pointer);
      await writeFile(join(base, "assets", "outside.png"), pointer);
      await writeFile(join(base, "docs", "index.md"), "# Index\n\n[archive](archive.zip)\n");
      git("init", "-q", "-b", "main");
      git("add", "-A");
      git("commit", "-q", "-m", "unread pointers");
      git("tag", "unread");
      await writeFile(join(base, "docs", "image.png"), pointer);
      await writeFile(join(base, "docs", "index.md"), "# Index\n\n![](image.png)\n");
      git("add", "-A");
      git("commit", "-q", "-m", "a pointer a page reads");
      vi.spyOn(process, "cwd").mockReturnValue(base);
      const out = join(base, "out.html");
      // A pointer the build never reads, and one outside the root, are left as they are.
      expect(await run("build", "docs", "--diff-from", "unread", "-o", out)).toEqual([]);
      vi.restoreAllMocks();
      vi.spyOn(process, "cwd").mockReturnValue(base);
      const errors = await run("build", "docs", "--diff-from", "HEAD", "-o", out);
      expect(errors.join("\n")).toContain("HEAD:docs/image.png");
      expect(errors.join("\n")).toContain("LFS pointer");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

/**
 * A repository in a temporary directory with `files` committed and tagged `tag`, the current
 * directory pointed at it. git runs there with none of the machine's configuration.
 */
async function repository(files: Record<string, string>, tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "monodocs-program-ref-"));
  await writeFile(join(base, "gitconfig"), "");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(base, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "monodocs",
    GIT_AUTHOR_EMAIL: "monodocs@example.invalid",
    GIT_COMMITTER_NAME: "monodocs",
    GIT_COMMITTER_EMAIL: "monodocs@example.invalid",
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: base, env });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), content);
  }
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", tag);
  git("tag", tag);
  vi.spyOn(process, "cwd").mockReturnValue(base);
  return base;
}

describe("--diff-from a ref", () => {
  it("builds with -f html", async () => {
    const base = await repository({ "docs/index.md": "# Index\n\nOld.\n" }, "v1.2");
    try {
      await writeFile(join(base, "docs", "index.md"), "# Index\n\nNew.\n");
      const out = join(base, "out.html");
      expect(await run("build", "-f", "html", "--diff-from", "v1.2", "-o", out)).toEqual([]);
      expect(process.exitCode).toBeUndefined();
      const html = await readFile(out, "utf8");
      expect(html).toContain('<h1 id="diff-changes">Changes v1.2</h1>');
      expect(html).toContain('<del data-monodocs-diff="">Old.</del>');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("finds no difference in an unchanged image outside the root, which it does not extract, or a missing one", async () => {
    // Only the root is extracted (gitVersion.test.ts), so the earlier version has no outside/o.png.
    const base = await repository(
      {
        "outside/o.png": "OUT",
        "docs/a.md": "# A\n\n![o](../outside/o.png) ![m](missing.png)\n",
        "docs/b.adoc": "= B\n\nimage::../outside/o.png[o]\n\nSee image:missing.png[m] here.\n",
      },
      "v1",
    );
    try {
      const out = join(base, "out.html");
      expect(await run("build", "--diff-from", "v1", "-o", out)).toEqual([]);
      expect(await readFile(out, "utf8")).toContain(
        "<p>Unchanged pages: 2</p>\n<p>No changes.</p>",
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("gives the same bytes twice from the same ref, for a page using {docdir}", async () => {
    const base = await repository(
      {
        "docs/guide.adoc":
          "= Guide\n\nHere: {docdir}\n\ninclude::{docdir}/_part.adoc[]\n\nimage::{docdir}/i.png[I]\n\nimage::i.png[J]\n",
        "docs/_part.adoc": "Included.\n",
        "docs/i.png": "PNG",
        "docs/other.md": "# Other\n\nOld.\n",
      },
      "v1",
    );
    try {
      await writeFile(join(base, "docs", "other.md"), "# Other\n\nNew.\n");
      // Each build extracts the ref into a temporary directory of its own.
      const outputs: string[] = [];
      for (const name of ["one.html", "two.html"]) {
        expect(await run("build", "--diff-from", "v1", "-o", join(base, name))).toEqual([]);
        outputs.push(await readFile(join(base, name), "utf8"));
      }
      expect(outputs[0]).toContain("<p>Unchanged pages: 1</p>");
      expect(outputs[0]).toContain("Included.");
      expect(outputs[1]).toBe(outputs[0]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
