import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";

let dir: string;
let docs: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "single-docs-v03-"));
  docs = join(dir, "docs");
  out = join(dir, "dist", "manual.html");
  await mkdir(join(docs, "images"), { recursive: true });
  await writeFile(
    join(docs, "index.md"),
    [
      "---",
      "title: ホーム",
      "order: 1",
      "---",
      "",
      "# ホーム",
      "",
      "![ロゴ](images/logo.svg)",
      "",
      "[使い方](guide.md) / [秘密](secret.md)",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(docs, "guide.md"),
    "---\norder: 2\n---\n\n# 使い方\n\n```mermaid\ngraph TD\n  A --> B\n```\n",
  );
  await writeFile(join(docs, "secret.md"), "---\nhidden: true\n---\n\n# 秘密\n");
  await writeFile(
    join(docs, "images", "logo.svg"),
    "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSite (v0.3 features)", () => {
  it("rewrites links, embeds images, transforms mermaid, and honors hidden", async () => {
    await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    // リンク変換: guide.md -> #/guide
    expect(html).toContain('href="#/guide"');
    // 画像 data URI 埋め込み
    expect(html).toContain("data:image/svg+xml;base64,");
    // Mermaid 変換 + CDN ランタイム注入
    expect(html).toContain('class="mermaid"');
    expect(html).toContain("cdn.jsdelivr.net/npm/mermaid");
    expect(html).toContain("mermaid.initialize");
    // hidden ページはサイドバーに出ない（サイドバー内に #/secret リンクが無い）。
    // 本文リンク（index -> secret）は解決されるため、判定はサイドバー範囲に限定する。
    const nav = html.match(/<nav id="sidebar-nav">([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect(nav).toContain('href="#/guide"');
    expect(nav).not.toContain("/secret");
    // hidden でもページ自体（article）は存在し、本文リンクは解決される。
    expect(html).toContain('data-route="/secret"');
    expect(html).toContain('href="#/secret"');
  });
});

describe("validateSite", () => {
  it("reports unresolved links as warnings", async () => {
    const vdir = await mkdtemp(join(tmpdir(), "single-docs-val-"));
    await mkdir(join(vdir, "docs"), { recursive: true });
    await writeFile(join(vdir, "docs", "index.md"), "# Home\n\n[broken](nope.md)\n");

    const result = await validateSite({ inputDir: join(vdir, "docs") });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("nope.md"))).toBe(true);

    await rm(vdir, { recursive: true, force: true });
  });

  it("reports a hard error when the input directory is missing", async () => {
    const result = await validateSite({ inputDir: join(dir, "does-not-exist") });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
