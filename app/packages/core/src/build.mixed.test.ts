import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";

let dir: string;
let docs: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "single-docs-mixed-"));
  docs = join(dir, "docs");
  out = join(dir, "dist", "manual.html");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# ホーム\n\nようこそ。\n");
  await writeFile(join(docs, "overview.adoc"), "= Overview\n\n== Intro\n\nhello from asciidoc\n");
  // include 用とみなしてページ化しないこと（拡張子非依存の除外確認）。
  await writeFile(join(docs, "_skip.adoc"), "= Skipped\n");
  await writeFile(join(docs, "_also-skip.asciidoc"), "= Also skipped\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSite (mixed Markdown + AsciiDoc)", () => {
  it("builds both formats into one HTML with a shared sidebar", async () => {
    const result = await buildSite({ inputDir: docs, outputFile: out, format: "html" });

    expect(result.pages).toBe(2); // _skip.adoc / _also-skip.asciidoc は除外される

    const html = await readFile(out, "utf8");
    // 両フォーマットのページが含まれる
    expect(html).toContain('data-route="/"');
    expect(html).toContain('data-route="/overview"');
    // AsciiDoc の `= Overview` がタイトルとして使われる
    expect(html).toContain("Overview");
    expect(html).toContain("ホーム");
    // AsciiDoc 見出しも page id で prefix される
    expect(html).toContain('id="overview-_intro"');
    // 同じサイドバーに両方のリンクが出る
    expect(html).toContain('href="#/"');
    expect(html).toContain('href="#/overview"');
    // 除外ファイルは含まれない（.adoc / .asciidoc とも）
    expect(html).not.toContain("Skipped");
    expect(html).not.toContain("Also skipped");
  });
});
