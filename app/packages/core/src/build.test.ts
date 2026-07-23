import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";

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
    const result = await buildSite({
      inputDir: docs,
      outputFile: out,
      format: "html",
      generatorVersion: "1.2.3",
    });

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
    expect(html).toContain(">monodocs v1.2.3</a>");
  });

  it("throws when the input directory does not exist", async () => {
    await expect(
      buildSite({ inputDir: join(dir, "nope"), outputFile: out, format: "html" }),
    ).rejects.toThrow(/not found/i);
  });

  it("accepts pdf / both output formats (v0.5: no longer 'not supported')", async () => {
    // validate は出力を書かず format に依存しないため、pdf / both でもエラーにならない。
    // 実際の PDF 生成（Chromium）は build.pdf.test.ts で検証する。
    expect((await validateSite({ inputDir: docs, format: "pdf" })).errors).toEqual([]);
    expect((await validateSite({ inputDir: docs, format: "both" })).errors).toEqual([]);
  });

  it("applies page and directory title transforms separately from the config file", async () => {
    const tdir = await mkdtemp(join(tmpdir(), "monodocs-title-transform-"));
    const tdocs = join(tdir, "docs");
    const tout = join(tdir, "dist", "manual.html");
    const configFile = join(tdir, "monodocs.config.yml");
    await mkdir(join(tdocs, "01_section"), { recursive: true });
    await writeFile(join(tdocs, "01_section", "req.md"), "# REQ-001: Intro\n");
    await writeFile(
      configFile,
      [
        `input: ${JSON.stringify(tdocs)}`,
        "output:",
        `  path: ${JSON.stringify(tout)}`,
        "sidebar:",
        "  titleTransform:",
        "    page:",
        "      type: regex",
        "      pattern: '^REQ-\\d+:\\s*'",
        '      replacement: ""',
        '      flags: "i"',
        "    directory:",
        "      type: stripNumberPrefix",
        "",
      ].join("\n"),
    );

    try {
      await buildSite({ configFile });
      const html = await readFile(tout, "utf8");
      const nav = html.match(/<nav id="sidebar-nav">([\s\S]*?)<\/nav>/)?.[1] ?? "";
      expect(nav).toContain('<span class="sidebar-dir-title">section</span>');
      expect(nav).not.toContain('<span class="sidebar-dir-title">01_section</span>');
      expect(nav).toContain("Intro");
      expect(nav).not.toContain("REQ-001");
    } finally {
      await rm(tdir, { recursive: true, force: true });
    }
  });

  it("applies configured content width to the generated HTML", async () => {
    const tdir = await mkdtemp(join(tmpdir(), "monodocs-content-width-"));
    const tdocs = join(tdir, "docs");
    const tout = join(tdir, "dist", "manual.html");
    const configFile = join(tdir, "monodocs.config.yml");
    await mkdir(tdocs, { recursive: true });
    await writeFile(join(tdocs, "index.md"), "# Top\n");
    await writeFile(
      configFile,
      [
        `input: ${JSON.stringify(tdocs)}`,
        "output:",
        `  path: ${JSON.stringify(tout)}`,
        "html:",
        "  contentWidth: full",
        "  contentWidthToggle: false",
        "  contentWidthDefault: wide",
        "  imageLightbox: false",
        "  branding: false",
        "",
      ].join("\n"),
    );

    try {
      await buildSite({ configFile });
      const html = await readFile(tout, "utf8");
      expect(html).toContain("--content-max-width: none;");
      expect(html).not.toContain('id="content-width-toggle"');
      expect(html).not.toContain('id="image-lightbox"');
      expect(html).not.toContain('class="document-footer"');
      expect(html).toContain('"contentWidthDefault":"wide"');
    } finally {
      await rm(tdir, { recursive: true, force: true });
    }
  });
});
