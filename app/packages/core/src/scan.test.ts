import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
