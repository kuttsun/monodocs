import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { literalGroups, scanSourceFiles } from "./scan";
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

  it("matches parentheses and + as characters, so no pattern can backtrack on a group", async () => {
    // GHSA-fc5q-39xc-vjpf: a group with a repeating quantifier backtracks exponentially. Extended
    // globs are off and `(`, `)`, `+` are literal: `@(a).md` and `(a|b).md` do not match `a.md`.
    const extensions = new Map<string, SourceFormat>([[".md", "markdown"]]);
    const none = await scanSourceFiles(dir, {
      extensions,
      include: ["@(a).md", "(a|b).md"],
      exclude: [],
    });
    expect(none).toEqual([]);
    // A file named with them is matched as written.
    const named = await mkdtemp(join(tmpdir(), "monodocs-scan-literal-"));
    try {
      await writeFile(join(named, "notes (old).md"), "# Old\n");
      await writeFile(join(named, "c++.md"), "# C++\n");
      await writeFile(join(named, `${"a".repeat(28)}!.md`), "# Long\n");
      const literal = await scanSourceFiles(named, {
        extensions,
        include: ["notes (old).md", "c++.md", "*.md"],
        exclude: ["(*a)+!.md", "{*a,*a}+!.md", "+(*a)!.md"],
      });
      // The crafted patterns take no time and match nothing; every file is kept.
      expect(literal.map((f) => f.relativePath).sort()).toEqual(
        [`${"a".repeat(28)}!.md`, "c++.md", "notes (old).md"].sort(),
      );
      // A backslash the author escaped protects nothing: the `(` after it is escaped all the same,
      // so no group can be reached that way (a name holding `\\` cannot be made on Windows, so the
      // escaping is checked directly).
      expect(literalGroups(String.raw`[\]\\(a*a*|\\)*!.md`)).toBe(
        String.raw`[\]\\\(a*a*|\\\)*!.md`,
      );
      expect(literalGroups(String.raw`notes \(old\).md`)).toBe(String.raw`notes \(old\).md`);
      expect(literalGroups("c++.md")).toBe(String.raw`c\+\+.md`);
      // A directory named with them is walked whichever way the pattern writes them.
      await mkdir(join(named, "docs (old)"));
      await writeFile(join(named, "docs (old)", "page.md"), "# Page\n");
      for (const pattern of ["docs (old)/page.md", String.raw`docs \(old\)/page.md`]) {
        const walked = await scanSourceFiles(named, {
          extensions,
          include: [pattern],
          exclude: [],
        });
        expect(
          walked.map((f) => f.relativePath),
          pattern,
        ).toEqual(["docs (old)/page.md"]);
      }
      const only = await scanSourceFiles(named, {
        extensions,
        include: ["notes (old).md"],
        exclude: [],
      });
      expect(only.map((f) => f.relativePath)).toEqual(["notes (old).md"]);
    } finally {
      await rm(named, { recursive: true, force: true });
    }
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
