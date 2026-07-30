import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";

let dir: string;
let docs: string;
let out: string;

const CONFIG = [
  "sidebar:",
  "  mode: custom",
  "  items:",
  '    - title: "Start here"',
  '      path: "guide/usage.md"',
  '    - title: "Setup"',
  "      children:",
  '        - path: "setup/install.adoc"',
  '        - path: "index.md"',
  "",
].join("\n");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-sidebar-custom-"));
  docs = join(dir, "docs");
  out = join(dir, "dist", "docs.html");
  await mkdir(join(docs, "setup"), { recursive: true });
  await mkdir(join(docs, "guide"), { recursive: true });
  await writeFile(join(docs, "index.md"), "# Home\n");
  await writeFile(join(docs, "setup", "install.adoc"), "= Install\n\nInstall steps.\n");
  await writeFile(join(docs, "guide", "usage.md"), "# Usage\n\nHow to use it.\n");
  // items に載せないページ（route では到達できるので警告のみ）。
  await writeFile(join(docs, "faq.md"), "# FAQ\n");
  await writeFile(join(docs, "monodocs.config.yml"), CONFIG);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 生成 HTML に埋め込まれたクライアント用データを取り出す。 */
function siteData(html: string): { pages: { route: string }[] } {
  const json = html.match(/__MONODOCS_DATA__ = (.*);/)?.[1] ?? "{}";
  return JSON.parse(json.replace(/\\u003c/g, "<"));
}

describe("buildSite (custom sidebar)", () => {
  it("renders the configured structure, order, and titles", async () => {
    const result = await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");
    const sidebar = html.slice(html.indexOf('<nav id="sidebar-nav">'), html.indexOf("</nav>"));

    // 設定した順序（フォルダ構造でもファイル名順でもない）。
    expect(sidebar.indexOf("Start here")).toBeLessThan(sidebar.indexOf("Setup"));
    // グループはディレクトリと同じ見た目のノードになる。
    expect(sidebar).toContain('<li class="sidebar-dir"><span class="sidebar-dir-title">Setup');
    // title 省略時はページ自身のタイトル。
    expect(sidebar).toContain(">Install</a>");
    expect(sidebar).toContain(">Home</a>");
    // items に無いページはサイドバーに出ない。
    expect(sidebar).not.toContain(">FAQ</a>");
    // ただしページ自体は生成され、route で到達できる。
    expect(html).toContain('data-route="/faq"');

    expect(result.warnings.some((w) => w.includes("Not listed") && w.includes("faq.md"))).toBe(
      true,
    );
  });

  it("makes the page order follow the sidebar", async () => {
    await buildSite({ inputDir: docs, outputFile: out, format: "html" });
    const html = await readFile(out, "utf8");

    // 前後ナビ・PDF のページ順・初期表示ページはこの並びに従う。未掲載ページは末尾。
    expect(siteData(html).pages.map((p) => p.route)).toEqual([
      "/guide/usage",
      "/setup/install",
      "/",
      "/faq",
    ]);
    // 先頭の article が最初のサイドバー項目になる。
    expect(html.indexOf('data-route="/guide/usage"')).toBeLessThan(html.indexOf('data-route="/"'));
  });

  it("reports a missing sidebar path as an error", async () => {
    const broken = join(dir, "broken");
    await mkdir(broken, { recursive: true });
    await writeFile(join(broken, "index.md"), "# Home\n");
    await writeFile(
      join(broken, "monodocs.config.yml"),
      'sidebar:\n  mode: custom\n  items:\n    - path: "missing.md"\n',
    );

    const result = await validateSite({ inputDir: broken });
    expect(result.errors.some((e) => e.includes("Sidebar item not found: missing.md"))).toBe(true);
  });
});
