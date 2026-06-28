import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";

let dir: string;
let docs: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-"));
  docs = join(dir, "docs");
  out = join(dir, "dist", "manual.html");
  await mkdir(join(docs, "setup"), { recursive: true });
  await writeFile(join(docs, "index.md"), "# トップ\n\nようこそ。\n");
  await writeFile(join(docs, "setup", "install.md"), "# インストール\n\n## Steps\n\n本文。\n");
  // `_` 始まりは include 用とみなしページ化しない（除外確認用）。
  await writeFile(join(docs, "_partial.md"), "# 除外される\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSite (e2e)", () => {
  it("generates a single HTML with all (non-excluded) pages", async () => {
    const result = await buildSite({ inputDir: docs, outputFile: out, format: "html" });

    expect(result.pages).toBe(2); // _partial.md は除外される
    expect(result.outputs).toEqual([out]);

    const html = await readFile(out, "utf8");
    expect(html).toContain('data-route="/"');
    expect(html).toContain('data-route="/setup/install"');
    expect(html).toContain("トップ");
    expect(html).toContain("インストール");
    expect(html).not.toContain("除外される");
    // 見出し ID は page id で prefix される
    expect(html).toContain('id="setup-install-steps"');
    // サイドバーの hash route リンク
    expect(html).toContain('href="#/setup/install"');
  });

  it("throws when the input directory does not exist", async () => {
    await expect(
      buildSite({ inputDir: join(dir, "nope"), outputFile: out, format: "html" }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws for unsupported output formats", async () => {
    await expect(buildSite({ inputDir: docs, outputFile: out, format: "pdf" })).rejects.toThrow(
      /not supported/i,
    );
  });
});
