import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-lang-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 設定ファイルつきの入力を用意してビルドし、生成 HTML と警告を返す。 */
async function build(name: string, configYaml: string) {
  const root = join(dir, name);
  const docs = join(root, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# Home\n\nBody.\n");
  await writeFile(join(docs, "guide.md"), "# Guide\n\nMore.\n");
  const configFile = join(root, "monodocs.config.yml");
  await writeFile(configFile, configYaml);
  const out = join(root, "dist", "docs.html");
  const result = await buildSite({ inputDir: docs, configFile, outputFile: out, format: "html" });
  return { html: await readFile(out, "utf8"), warnings: result.warnings, root, configFile };
}

/** 生成 HTML に埋め込まれた `__MONODOCS_DATA__` を取り出す。 */
function siteData(html: string): { labels: Record<string, string> } {
  const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
  return JSON.parse(json.replace(/\\u003c/g, "<"));
}

describe("document language and UI labels", () => {
  it("declares en and shows English labels by default", async () => {
    const { html, warnings } = await build("default", "title: T\n");
    expect(html).toContain('<html lang="en"');
    expect(html).toContain(">On this page<");
    expect(siteData(html).labels.noResults).toBe("No results");
    expect(warnings.map((w) => w.message).join("\n")).not.toContain("label table");
  });

  it("declares ja and shows Japanese labels under lang: ja", async () => {
    // 従来は <html lang="ja"> と英語ラベルという、どちらの読者にも合わない組み合わせだった。
    const { html, warnings } = await build("ja", 'title: T\nlang: "ja"\n');
    expect(html).toContain('<html lang="ja"');
    expect(html).toContain(">このページの内容<");
    expect(html).toContain('aria-label="ドキュメントを検索"');
    expect(html).toContain('placeholder="検索…"');
    // 動的に書かれる文言も同じ表から来る。
    expect(siteData(html).labels.noResults).toBe("該当なし");
    expect(warnings.map((w) => w.message).join("\n")).not.toContain("label table");
  });

  it("declares a tag with no shipped table, falls back to English, and warns once naming it", async () => {
    const { html, warnings } = await build("fr", 'title: T\nlang: "fr"\n');
    // 属性は書いたとおり。ラベルだけ落とす。
    expect(html).toContain('<html lang="fr"');
    expect(html).toContain(">On this page<");
    const matching = warnings.filter((w) => w.code === "lang/no-label-table");
    expect(matching).toHaveLength(1);
    expect(matching[0]?.message).toContain('"fr"');
  });

  it("replaces individual labels through html.labels", async () => {
    const { html } = await build(
      "overrides",
      'title: T\nlang: "ja"\nhtml:\n  labels:\n    tocTitle: "目次"\n    noResults: "見つかりません"\n',
    );
    expect(html).toContain(">目次<");
    // 差し替えていないものは ja の表のまま。
    expect(html).toContain('aria-label="ドキュメントを検索"');
    expect(siteData(html).labels.noResults).toBe("見つかりません");
  });

  it("lets html.labels supply a language monodocs does not ship", async () => {
    const { html } = await build(
      "french",
      'title: T\nlang: "fr"\nhtml:\n  labels:\n    tocTitle: "Sur cette page"\n',
    );
    expect(html).toContain('<html lang="fr"');
    expect(html).toContain(">Sur cette page<");
  });

  it("rejects an unknown key under html.labels instead of ignoring it", async () => {
    const root = join(dir, "typo");
    await mkdir(root, { recursive: true });
    const configFile = join(root, "monodocs.config.yml");
    // 黙って既定のまま残ると「書いたのに効かない」という最も気づきにくい失敗になる。
    await writeFile(configFile, 'html:\n  labels:\n    tocTitel: "On this page"\n');
    await expect(loadConfig({ configFile }, root)).rejects.toThrow(/Invalid config file/);
  });

  it("rejects a lang that is not a language tag", async () => {
    const root = join(dir, "badlang");
    await mkdir(root, { recursive: true });
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, 'lang: "en_US"\n');
    await expect(loadConfig({ configFile }, root)).rejects.toThrow(/Invalid config file/);
  });

  it("escapes a label so a configuration key cannot become an injection point", async () => {
    const { html } = await build(
      "escape",
      'title: T\nhtml:\n  labels:\n    tocTitle: "</div><script>alert(1)</script>"\n' +
        '    searchLabel: "a\\" onfocus=\\"alert(1)"\n' +
        // ラベルはトークンごとに別経路で埋まる。幅トグルの初期 title は他のラベルとは
        // 別のトークンなので、まとめてエスケープする側から漏れやすい。
        '    useWideContent: "b\\" autofocus onfocus=\\"alert(2)"\n',
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;/div&gt;&lt;script&gt;");
    // 属性から抜け出せていない。
    expect(html).not.toContain('a" onfocus="alert(1)"');
    expect(html).toContain("&quot; onfocus=&quot;");
    // 幅トグルの title 属性から抜け出せていない。JSON 側には同じ文字列がデータとして
    // 載る（そこでは JS 文字列リテラルなので無害）ため、属性の形を名指しで見る。
    expect(html).not.toContain('title="b" autofocus');
    expect(html).toContain("b&quot; autofocus onfocus=&quot;alert(2)");
    // JSON 側も同じ値を安全な形で載せる（`<` は \u003c）。
    expect(html).not.toMatch(/__MONODOCS_DATA__ = .*<script>/);
  });

  it("gives a template-only theme the labels, and leaves what it spells out itself alone", async () => {
    const root = join(dir, "theme-template");
    const docs = join(root, "docs");
    const theme = join(root, "my-theme");
    await mkdir(docs, { recursive: true });
    await mkdir(theme, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Home\n\nBody.\n");
    // トークンを使った箇所は解決され、自分で書いた文字列はそのまま残る。
    // `{{lang}}` は任意トークンなので、書かなければ自分の <html lang> を保つ。
    await writeFile(
      join(theme, "template.html"),
      '<!doctype html>\n<html lang="de"{{htmlAttrs}}>\n<head><title>{{title}}</title>' +
        "<style>{{style}}</style></head>\n<body{{bodyAttrs}}>\n" +
        '<nav id="sidebar-nav">{{sidebar}}</nav>\n' +
        '<div class="toc-title">{{labelTocTitle}}</div>\n' +
        '<div class="hand-written">Auf dieser Seite</div>\n' +
        '<main id="content">{{pages}}</main>\n' +
        "<script>window.__MONODOCS_DATA__ = {{siteDataJson}};</script>\n" +
        "<script>{{appJs}}</script>{{bodyScripts}}\n</body>\n</html>\n",
    );
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, 'lang: "ja"\nhtml:\n  theme: "./my-theme"\n');
    const out = join(root, "dist", "docs.html");
    await buildSite({ inputDir: docs, configFile, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    expect(html).toContain(">このページの内容<");
    // 自分で書いた静的テキストには手を触れない。どれがラベルのつもりだったかは知りようがない。
    expect(html).toContain(">Auf dieser Seite<");
    // {{lang}} を書かなかったテンプレートは、書いた <html lang> を保つ。
    expect(html).toContain('<html lang="de"');
    // それでも解決済みラベルはデータとしては必ず届く（唯一の無条件保証）。
    expect(siteData(html).labels.tocTitle).toBe("このページの内容");
  });

  it("gives a client-only theme the labels as data, and applies nothing for it", async () => {
    const root = join(dir, "theme-client");
    const docs = join(root, "docs");
    const theme = join(root, "my-theme");
    await mkdir(docs, { recursive: true });
    await mkdir(theme, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Home\n\nBody.\n");
    await writeFile(join(theme, "app.js"), "/* own client */\n");
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, 'lang: "ja"\nhtml:\n  theme: "./my-theme"\n');
    const out = join(root, "dist", "docs.html");
    await buildSite({ inputDir: docs, configFile, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    // 既定テンプレートは残るのでトークン由来のラベルは入る。
    expect(html).toContain(">このページの内容<");
    // 配送は保証する。適用はそのテーマの責任。
    expect(siteData(html).labels.copied).toBe("コピーしました");
    expect(html).toContain("/* own client */");
  });
});
