import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILT_IN_THEMES, loadTheme } from "./index";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-theme-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 必須トークンを備えた最小のテンプレート。 */
const MINIMAL_TEMPLATE = [
  "<!doctype html>",
  "<html><head><style>{{style}}</style></head>",
  "<body><aside>{{sidebar}}</aside><main>{{pages}}</main>",
  "<script>window.__MONODOCS_DATA__ = {{siteDataJson}};</script>",
  "<script>{{appJs}}</script>{{bodyScripts}}</body></html>",
].join("\n");

describe("loadTheme", () => {
  it("loads the built-in default theme", async () => {
    const theme = await loadTheme();
    expect(BUILT_IN_THEMES).toContain("default");
    expect(theme.template).toContain("{{pages}}");
    expect(theme.style).toContain("#sidebar");
    expect(theme.appJs).toContain("__MONODOCS_DATA__");
  });

  it("rejects an unknown built-in name with the available names", async () => {
    await expect(loadTheme("fancy")).rejects.toThrow(/Unknown theme: fancy.*default/s);
  });

  it("loads a custom theme directory", async () => {
    await writeFile(join(dir, "template.html"), MINIMAL_TEMPLATE);
    await writeFile(join(dir, "style.css"), "body { color: rebeccapurple; }");
    await writeFile(join(dir, "app.js"), "/* custom client */");

    const theme = await loadTheme(dir);
    expect(theme.template).toBe(MINIMAL_TEMPLATE);
    expect(theme.style).toContain("rebeccapurple");
    expect(theme.appJs).toBe("/* custom client */");
  });

  it("falls back to the default theme for files the custom theme omits", async () => {
    // 配色だけ変えるテーマ。app.js（ルーティング・検索・目次）は既定のまま使う。
    await writeFile(join(dir, "style.css"), "body { color: rebeccapurple; }");

    const theme = await loadTheme(dir);
    const fallback = await loadTheme("default");
    expect(theme.style).toContain("rebeccapurple");
    expect(theme.template).toBe(fallback.template);
    expect(theme.appJs).toBe(fallback.appJs);
  });

  it("rejects a directory that holds none of the theme files", async () => {
    await writeFile(join(dir, "readme.md"), "not a theme");
    await expect(loadTheme(dir)).rejects.toThrow(/none of template\.html/);
  });

  it("rejects a missing theme directory separately from an empty one", async () => {
    await expect(loadTheme(join(dir, "nope"))).rejects.toThrow(/Theme directory not found/);

    await writeFile(join(dir, "not-a-dir"), "");
    await expect(loadTheme(join(dir, "not-a-dir"))).rejects.toThrow(/not a directory/);
  });

  it("rejects a template that drops tokens the document needs", async () => {
    await writeFile(join(dir, "template.html"), "<html><body>{{pages}}</body></html>");
    await expect(loadTheme(dir)).rejects.toThrow(
      /missing required tokens.*\{\{style\}\}.*\{\{appJs\}\}/s,
    );
  });
});
