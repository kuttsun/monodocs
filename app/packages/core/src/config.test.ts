import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, parseSize } from "./config";

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
});
