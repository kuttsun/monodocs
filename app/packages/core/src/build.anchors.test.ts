import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";

// ファイルを跨いだ見出しアンカー（`other.md#sec` / `xref:other.adoc#sec`）が、
// 単一 HTML 内で一意化された要素 ID へ解決されることを end-to-end で確認する。

let dir: string;
let docs: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-anchors-"));
  docs = join(dir, "docs");
  out = join(dir, "dist", "docs.html");
  await mkdir(docs, { recursive: true });

  await writeFile(
    join(docs, "index.md"),
    [
      "# ホーム",
      "",
      "[詳細](guide.md#使い方の詳細)",
      "[脚注へ](guide.md#user-content-fn-1)",
      "[AsciiDoc へ](ref.adoc#_details)",
      "[存在しない](guide.md#nope)",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(docs, "guide.md"),
    ["# 使い方", "", "本文[^1]", "", "## 使い方の詳細", "", "[^1]: 注記", ""].join("\n"),
  );
  await writeFile(
    join(docs, "ref.adoc"),
    ["= Ref", "", "xref:guide.md#使い方の詳細[詳細へ]", "", "== Details", "", "本文", ""].join(
      "\n",
    ),
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSite (cross-file heading anchors)", () => {
  it("resolves anchors across files and formats", async () => {
    const result = await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    // Markdown → Markdown の見出しアンカー。
    expect(html).toContain('href="#guide-使い方の詳細"');
    // 見出し以外（remark-gfm の脚注）のアンカーも解決できる。
    expect(html).toContain('href="#guide-user-content-fn-1"');
    // Markdown → AsciiDoc（Asciidoctor 既定の `_details`）。
    expect(html).toContain('href="#ref-_details"');
    // AsciiDoc の xref（`guide.html#...` として出力される）→ Markdown の見出し。
    expect(html).toContain('href="#guide-使い方の詳細"');
    // 解決先の要素が実在する（router / PDF がこの ID を引ける）。
    expect(html).toContain('id="guide-使い方の詳細"');
    expect(html).toContain('id="ref-_details"');

    // 存在しないアンカーはページ先頭へ落として警告する。
    expect(html).toContain('href="#/guide"');
    expect(result.warnings.some((w) => w.message.includes('Unresolved anchor "#nope"'))).toBe(true);
  });
});

describe("validateSite (cross-file heading anchors)", () => {
  it("reports an unresolved anchor with its source location", async () => {
    const result = await validateSite({ inputDir: docs });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((w) => w.message)).toContain(
      'Unresolved anchor "#nope" in "guide.md#nope"; linked to page top in "index.md:6".',
    );
    // The same finding a build warns about, reported with a code a CI job can filter on (25.5).
    const anchor = result.diagnostics.find((d) => d.code === "link/unresolved-anchor");
    expect(anchor?.path).toBe("index.md");
    expect(anchor?.line).toBe(6);
  });
});
