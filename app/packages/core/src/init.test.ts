import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { initSite } from "./init";
import { DEFAULT_MESSAGE_LANG, MESSAGE_LANGS, setMessageLang } from "./messages";

/**
 * `monodocs init` was specified in the roadmap from the first version and never built, so until
 * v0.10 the first thing a new user did was write a configuration file for a schema they had not
 * read yet. What it writes therefore has to build unedited — a scaffold that needs fixing before it
 * runs is worse than no scaffold, because the author cannot tell their own mistake from its.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-init-"));
});

afterEach(async () => {
  setMessageLang(DEFAULT_MESSAGE_LANG);
  await rm(dir, { recursive: true, force: true });
});

const configPath = () => join(dir, "monodocs.config.yml");
const pagePath = () => join(dir, "docs", "index.md");

describe("monodocs init", () => {
  it("writes exactly the configuration and the first page", async () => {
    const result = await initSite(dir);

    expect(result.created).toEqual(["monodocs.config.yml", "docs/index.md"]);
    expect(existsSync(configPath())).toBe(true);
    expect(existsSync(pagePath())).toBe(true);
  });

  it("writes a configuration that builds without editing", async () => {
    await initSite(dir);

    // Only the configuration is named: input and output come from the file itself, which is what
    // the author gets when they run `monodocs build` in the directory init just wrote.
    const result = await buildSite({ configFile: configPath() });

    expect(result.pages).toBe(1);
    expect(result.warnings).toEqual([]);
    const html = await readFile(join(dir, "dist", "docs.html"), "utf8");
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("On this page");
  });

  it("keeps the scaffold short rather than dumping every key", async () => {
    await initSite(dir);
    const config = await readFile(configPath(), "utf8");

    // A dump would need regenerating with every option added, and teaches the reader to keep keys
    // they have not understood. The reference is a link instead.
    expect(config).toContain("https://kuttsun.github.io/monodocs/docs/configuration");
    for (const absent of ["sidebar:", "assets:", "mermaid:", "html:", "pdf:", "search:"]) {
      expect(config, absent).not.toContain(absent);
    }
  });

  it("follows the message language, in the scaffold's own lang as well", async () => {
    setMessageLang("ja");
    await initSite(dir);

    const config = await readFile(configPath(), "utf8");
    expect(config).toContain("# monodocs の設定ファイル。");
    // The page text is Japanese, so `lang` has to say so: a document declaring one language and
    // displaying another is the mismatch v0.10 exists to end (23.4).
    expect(config).toContain('lang: "ja"');
    expect(await readFile(pagePath(), "utf8")).toContain("# ドキュメント");

    const result = await buildSite({ configFile: configPath() });
    expect(result.pages).toBe(1);
    const html = await readFile(join(dir, "dist", "docs.html"), "utf8");
    expect(html).toContain('<html lang="ja"');
    expect(html).toContain("このページの内容");
  });

  // Over the shipped languages rather than over the two spelled out above: a scaffold is a
  // configuration and a page written by hand in each language, so the next language added is
  // exactly where a stray quote or a key that no longer exists would land.
  it.each(MESSAGE_LANGS)("writes a scaffold that builds in %s", async (lang) => {
    setMessageLang(lang);
    await initSite(dir);

    const result = await buildSite({ configFile: configPath() });

    expect(result.pages).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("writes neither file when the configuration is already there", async () => {
    await writeFile(configPath(), "title: Mine\n");

    await expect(initSite(dir)).rejects.toThrow(/monodocs\.config\.yml/);
    // The page is the file it could have written safely; writing it would leave half a scaffold
    // beside a configuration the author wrote themselves.
    expect(existsSync(pagePath())).toBe(false);
    expect(await readFile(configPath(), "utf8")).toBe("title: Mine\n");
  });

  it("writes neither file when the first page is already there", async () => {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(pagePath(), "# Mine\n");

    await expect(initSite(dir)).rejects.toThrow(/docs\/index\.md/);
    expect(existsSync(configPath())).toBe(false);
    expect(await readFile(pagePath(), "utf8")).toBe("# Mine\n");
  });

  it("names everything it found, not only the first one", async () => {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(configPath(), "title: Mine\n");
    await writeFile(pagePath(), "# Mine\n");

    await expect(initSite(dir)).rejects.toThrow(/monodocs\.config\.yml, docs\/index\.md/);
  });

  it("writes into an existing docs directory, which it does not overwrite", async () => {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "docs", "guide.md"), "# Guide\n");

    await initSite(dir);

    // A directory is not a file it would overwrite, and the page it adds sits beside what is there.
    expect(existsSync(pagePath())).toBe(true);
    const result = await buildSite({ configFile: configPath() });
    expect(result.pages).toBe(2);
  });
});
