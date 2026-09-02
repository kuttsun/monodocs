import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanSourceFiles } from "./scan";
import type { SourceFormat } from "./types";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-scan-"));
  await mkdir(join(dir, "sub"), { recursive: true });
  await writeFile(join(dir, "a.md"), "# a\n");
  await writeFile(join(dir, "sub", "b.ad"), "= b\n"); // カスタム asciidoc 拡張子
  await writeFile(join(dir, "_skip.md"), "# skip\n"); // _ 始まりは除外
  await writeFile(join(dir, "ignore.txt"), "nope\n"); // 対象外拡張子
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scanSourceFiles", () => {
  it("resolves format from the configured extension map (custom extensions work)", async () => {
    const extensions = new Map<string, SourceFormat>([
      [".md", "markdown"],
      [".ad", "asciidoc"],
    ]);

    const files = await scanSourceFiles(dir, { extensions, exclude: ["**/_*"] });
    const byPath = Object.fromEntries(files.map((f) => [f.relativePath, f.format]));

    expect(byPath).toEqual({ "a.md": "markdown", "sub/b.ad": "asciidoc" });
  });

  it("takes everything under the root when include is absent or empty", async () => {
    const extensions = new Map<string, SourceFormat>([[".md", "markdown"]]);

    const absent = await scanSourceFiles(dir, { extensions, exclude: [] });
    const empty = await scanSourceFiles(dir, { extensions, include: [], exclude: [] });

    expect(absent.map((f) => f.relativePath)).toEqual(["_skip.md", "a.md"]);
    expect(empty.map((f) => f.relativePath)).toEqual(absent.map((f) => f.relativePath));
  });

  it("selects with include and then subtracts exclude, in that order", async () => {
    const extensions = new Map<string, SourceFormat>([
      [".md", "markdown"],
      [".ad", "asciidoc"],
    ]);

    const selected = await scanSourceFiles(dir, {
      extensions,
      include: ["a.md", "sub/**"],
      exclude: [],
    });
    expect(selected.map((f) => f.relativePath)).toEqual(["a.md", "sub/b.ad"]);

    // An include covering a path cannot hand it back once exclude names it.
    const subtracted = await scanSourceFiles(dir, {
      extensions,
      include: ["a.md", "sub/**"],
      exclude: ["sub/**"],
    });
    expect(subtracted.map((f) => f.relativePath)).toEqual(["a.md"]);
  });

  it("does not walk a directory no include pattern can reach", async () => {
    const extensions = new Map<string, SourceFormat>([[".md", "markdown"]]);
    // A directory that cannot be read at all: reaching it throws EACCES, so a clean result is what
    // proves the walk pruned it rather than merely filtered its contents out afterwards. The proof
    // holds where the mode does — the development image runs as uid 1000, not root. On Windows the
    // mode does not restrict anything, so the assertion still passes but establishes only the
    // filtering, which is why the pruning is not asserted through timing or a spy instead.
    const unreadable = join(dir, "unreadable");
    await mkdir(unreadable, { recursive: true });
    await writeFile(join(unreadable, "c.md"), "# c\n");
    await chmod(unreadable, 0o000);

    try {
      const files = await scanSourceFiles(dir, { extensions, include: ["a.md"], exclude: [] });
      expect(files.map((f) => f.relativePath)).toEqual(["a.md"]);
    } finally {
      await chmod(unreadable, 0o700);
      await rm(unreadable, { recursive: true, force: true });
    }
  });
});
