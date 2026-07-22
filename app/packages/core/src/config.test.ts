import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseContentWidth, parseSize } from "./config";

describe("parseSize", () => {
  it("parses sizes with units", () => {
    expect(parseSize("5MB", 0)).toBe(5 * 1024 * 1024);
    expect(parseSize("500KB", 0)).toBe(500 * 1024);
    expect(parseSize("1024", 0)).toBe(1024);
    expect(parseSize(2048, 0)).toBe(2048);
  });

  it("returns the fallback when undefined", () => {
    expect(parseSize(undefined, 42)).toBe(42);
  });

  it("throws on invalid or non-positive values", () => {
    expect(() => parseSize("abc", 0)).toThrow();
    expect(() => parseSize(0, 0)).toThrow();
    expect(() => parseSize(-5, 0)).toThrow();
  });
});

describe("parseContentWidth", () => {
  it("parses fixed widths", () => {
    expect(parseContentWidth("1100px")).toBe("1100px");
    expect(parseContentWidth("72rem")).toBe("72rem");
    expect(parseContentWidth("80ch")).toBe("80ch");
    expect(parseContentWidth(1200)).toBe("1200px");
  });

  it("maps full to CSS max-width none", () => {
    expect(parseContentWidth("full")).toBe("none");
    expect(parseContentWidth(" FULL ")).toBe("none");
    expect(parseContentWidth("none")).toBe("none");
  });

  it("returns the fallback when undefined", () => {
    expect(parseContentWidth(undefined, "900px")).toBe("900px");
  });

  it("throws on invalid, unsafe, or non-positive values", () => {
    expect(() => parseContentWidth("abc")).toThrow();
    expect(() => parseContentWidth("calc(100% - 2rem)")).toThrow();
    expect(() => parseContentWidth("860px; color: red")).toThrow();
    expect(() => parseContentWidth(0)).toThrow();
    expect(() => parseContentWidth("-5px")).toThrow();
  });
});

describe("loadConfig: sidebar.collapseDepth / toc.maxLevel", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "monodocs-config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeConfig(yaml: string): Promise<void> {
    await writeFile(join(dir, "monodocs.config.yml"), yaml);
  }

  it("defaults to no auto-collapse and h3 TOC depth", async () => {
    const config = await loadConfig({}, dir);
    expect(config.sidebarCollapseDepth).toBeUndefined();
    expect(config.tocMaxLevel).toBe(3);
    expect(config.sidebarTitleTransform).toEqual({
      page: { type: "none" },
      directory: { type: "none" },
    });
    expect(config.sidebarFlattenSingleChild).toBe(false);
    expect(config.sidebarTitleFrom).toBe("heading");
    expect(config.contentWidth).toBe("860px");
    expect(config.contentWidthToggle).toBe(true);
    expect(config.contentWidthDefault).toBe("standard");
    expect(config.colorScheme).toBe("light");
  });

  it("finds the default config in the input directory", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(
      join(docs, "monodocs.config.yml"),
      'title: "Input Config"\noutput:\n  path: "./dist/input.html"\n',
    );

    const config = await loadConfig({ inputDir: docs }, join(dir, "elsewhere"));
    expect(config.configFilePath).toBe(join(docs, "monodocs.config.yml"));
    expect(config.title).toBe("Input Config");
    expect(config.outputFile).toBe(join(docs, "dist", "input.html"));
  });

  it("does not use a parent config when an input directory is given", async () => {
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeConfig('title: "Parent Config"\noutput:\n  path: "./dist/parent.html"\n');

    const config = await loadConfig({ inputDir: docs }, join(dir, "elsewhere"));
    expect(config.configFilePath).toBeUndefined();
    expect(config.title).toBe("Documentation");
    expect(config.outputFile).toBe(join(dir, "elsewhere", "dist", "manual.html"));
  });

  it("reads sidebar.titleTransform.page from the config file", async () => {
    await writeConfig("sidebar:\n  titleTransform:\n    page:\n      type: stripNumberPrefix\n");
    const config = await loadConfig({}, dir);
    expect(config.sidebarTitleTransform).toEqual({
      page: { type: "stripNumberPrefix" },
      directory: { type: "none" },
    });
  });

  it("reads sidebar.titleTransform.directory from the config file", async () => {
    await writeConfig(
      "sidebar:\n  titleTransform:\n    directory:\n      type: stripNumberPrefix\n",
    );
    const config = await loadConfig({}, dir);
    expect(config.sidebarTitleTransform).toEqual({
      page: { type: "none" },
      directory: { type: "stripNumberPrefix" },
    });
  });

  it("reads sidebar.titleTransform regex with flags from the config file", async () => {
    await writeConfig(
      'sidebar:\n  titleTransform:\n    page:\n      type: regex\n      pattern: "^REQ-\\\\d+: "\n      replacement: ""\n      flags: "i"\n',
    );
    const config = await loadConfig({}, dir);
    expect(config.sidebarTitleTransform).toEqual({
      page: {
        type: "regex",
        pattern: "^REQ-\\d+: ",
        replacement: "",
        flags: "i",
      },
      directory: { type: "none" },
    });
  });

  it("rejects an invalid sidebar.titleTransform regex pattern", async () => {
    await writeConfig(
      'sidebar:\n  titleTransform:\n    page:\n      type: regex\n      pattern: "[bad"\n      replacement: ""\n',
    );
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects invalid sidebar.titleTransform regex flags", async () => {
    await writeConfig(
      'sidebar:\n  titleTransform:\n    page:\n      type: regex\n      pattern: "^REQ"\n      replacement: ""\n      flags: "gg"\n',
    );
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects the old flat sidebar.titleTransform shape", async () => {
    await writeConfig("sidebar:\n  titleTransform:\n    type: stripNumberPrefix\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects the removed sidebar.stripNumberPrefix key", async () => {
    await writeConfig("sidebar:\n  stripNumberPrefix: true\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects unknown sidebar keys", async () => {
    await writeConfig("sidebar:\n  titleTranform:\n    page:\n      type: none\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("reads sidebar.titleFrom from the config file", async () => {
    await writeConfig("sidebar:\n  titleFrom: filename\n");
    const config = await loadConfig({}, dir);
    expect(config.sidebarTitleFrom).toBe("filename");
  });

  it("rejects an invalid sidebar.titleFrom", async () => {
    await writeConfig("sidebar:\n  titleFrom: nope\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("reads sidebar.flattenSingleChild from the config file", async () => {
    await writeConfig("sidebar:\n  flattenSingleChild: true\n");
    const config = await loadConfig({}, dir);
    expect(config.sidebarFlattenSingleChild).toBe(true);
  });

  it("reads collapseDepth and maxLevel from the config file", async () => {
    await writeConfig("sidebar:\n  collapseDepth: 1\ntoc:\n  maxLevel: 4\n");
    const config = await loadConfig({}, dir);
    expect(config.sidebarCollapseDepth).toBe(1);
    expect(config.tocMaxLevel).toBe(4);
  });

  it("accepts collapseDepth 0 (collapse every directory)", async () => {
    await writeConfig("sidebar:\n  collapseDepth: 0\n");
    const config = await loadConfig({}, dir);
    expect(config.sidebarCollapseDepth).toBe(0);
  });

  it("rejects negative collapseDepth", async () => {
    await writeConfig("sidebar:\n  collapseDepth: -1\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects maxLevel out of the 2-6 range", async () => {
    await writeConfig("toc:\n  maxLevel: 7\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("reads html.contentWidth from the config file", async () => {
    await writeConfig("html:\n  contentWidth: 1100px\n");
    const config = await loadConfig({}, dir);
    expect(config.contentWidth).toBe("1100px");
  });

  it("reads html.contentWidth full from the config file", async () => {
    await writeConfig("html:\n  contentWidth: full\n");
    const config = await loadConfig({}, dir);
    expect(config.contentWidth).toBe("none");
  });

  it("can disable html.contentWidthToggle", async () => {
    await writeConfig("html:\n  contentWidthToggle: false\n");
    const config = await loadConfig({}, dir);
    expect(config.contentWidthToggle).toBe(false);
  });

  it("reads html.contentWidthDefault from the config file", async () => {
    await writeConfig("html:\n  contentWidthDefault: wide\n");
    const config = await loadConfig({}, dir);
    expect(config.contentWidthDefault).toBe("wide");
  });

  it("rejects an invalid html.contentWidthDefault", async () => {
    await writeConfig("html:\n  contentWidthDefault: full\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects invalid html.contentWidth", async () => {
    await writeConfig("html:\n  contentWidth: '860px; color: red'\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("reads html.colorScheme from the config file", async () => {
    await writeConfig("html:\n  colorScheme: dark\n");
    const config = await loadConfig({}, dir);
    expect(config.colorScheme).toBe("dark");
  });

  it("rejects an invalid html.colorScheme", async () => {
    await writeConfig("html:\n  colorScheme: sepia\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("defaults PDF settings to A4 / 20-15-20-15mm / printBackground / bookmarks", async () => {
    const config = await loadConfig({}, dir);
    expect(config.pdfPageSize).toBe("A4");
    expect(config.pdfMargin).toEqual({
      top: "20mm",
      right: "15mm",
      bottom: "20mm",
      left: "15mm",
    });
    expect(config.pdfPrintBackground).toBe(true);
    expect(config.pdfBookmarks).toBe(true);
  });

  it("reads pdf.bookmarks: false from the config file", async () => {
    await writeConfig("pdf:\n  bookmarks: false\n");
    expect((await loadConfig({}, dir)).pdfBookmarks).toBe(false);
  });

  it("reads pdf settings and fills omitted margins with defaults", async () => {
    await writeConfig(
      "pdf:\n  pageSize: Letter\n  printBackground: false\n  margin:\n    top: 10mm\n    bottom: 30mm\n",
    );
    const config = await loadConfig({}, dir);
    expect(config.pdfPageSize).toBe("Letter");
    expect(config.pdfPrintBackground).toBe(false);
    expect(config.pdfMargin).toEqual({
      top: "10mm",
      right: "15mm",
      bottom: "30mm",
      left: "15mm",
    });
  });

  it("rejects unknown keys under pdf", async () => {
    await writeConfig("pdf:\n  orientation: landscape\n");
    await expect(loadConfig({}, dir)).rejects.toThrow();
  });

  it("rejects an invalid --format value (raw CLI string)", async () => {
    await expect(loadConfig({ format: "docx" as unknown as "html" }, dir)).rejects.toThrow(
      /invalid output format/i,
    );
  });

  it("uses a format-appropriate default output path", async () => {
    expect((await loadConfig({ format: "html" }, dir)).outputFile).toBe(
      join(dir, "dist", "manual.html"),
    );
    expect((await loadConfig({ format: "pdf" }, dir)).outputFile).toBe(
      join(dir, "dist", "manual.pdf"),
    );
    // both はディレクトリ扱いの既定（build 側で manual.html / manual.pdf を生成）。
    expect((await loadConfig({ format: "both" }, dir)).outputFile).toBe(join(dir, "dist"));
  });
});
