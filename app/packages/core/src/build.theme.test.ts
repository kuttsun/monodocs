import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";
import { loadConfig } from "./config";
import { watchSite } from "./watch";

let dir: string;
let docs: string;
let theme: string;
let out: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-theme-e2e-"));
  docs = join(dir, "docs");
  theme = join(dir, "my-theme");
  out = join(dir, "dist", "manual.html");
  await mkdir(docs, { recursive: true });
  await mkdir(theme, { recursive: true });
  await writeFile(join(docs, "index.md"), "# Home\n\nBody text.\n");
  // 設定ファイルからの相対パスで指定する（入力ディレクトリ基準ではない）。
  await writeFile(join(dir, "monodocs.config.yml"), 'html:\n  theme: "./my-theme"\n');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("buildSite (custom theme)", () => {
  it("resolves html.theme relative to the config file", async () => {
    const config = await loadConfig({}, dir);
    expect(config.theme).toBe(theme);
  });

  it("uses a style-only theme and keeps the default template and client", async () => {
    await writeFile(join(theme, "style.css"), ":root { --custom-theme: 1; }\nbody { color: red; }");
    await buildSite({
      inputDir: docs,
      configFile: join(dir, "monodocs.config.yml"),
      outputFile: out,
      format: "html",
    });
    const html = await readFile(out, "utf8");

    expect(html).toContain("--custom-theme: 1;");
    // 既定テーマの CSS には差し替わっている（テーマの style.css が丸ごと置き換える）。
    expect(html).not.toContain("/* ---- search results ---- */");
    // template / app.js は既定のまま動く。
    expect(html).toContain('<nav id="sidebar-nav">');
    expect(html).toContain("__MONODOCS_DATA__");
  });

  it("uses a full custom theme including template and client script", async () => {
    await writeFile(
      join(theme, "template.html"),
      [
        "<!doctype html>",
        '<html lang="en"><head><title>{{title}}</title><style>{{style}}</style></head>',
        '<body class="custom-body"><aside>{{sidebar}}</aside><main id="content">{{pages}}</main>',
        "<script>window.__MONODOCS_DATA__ = {{siteDataJson}};</script>",
        "<script>{{appJs}}</script>{{bodyScripts}}</body></html>",
      ].join("\n"),
    );
    await writeFile(join(theme, "app.js"), "/* custom client marker */");

    await buildSite({
      inputDir: docs,
      configFile: join(dir, "monodocs.config.yml"),
      outputFile: out,
      format: "html",
    });
    const html = await readFile(out, "utf8");

    expect(html).toContain('<body class="custom-body">');
    expect(html).toContain("/* custom client marker */");
    expect(html).toContain("<h1");
    // 既定テーマのクライアントは使われない。
    expect(html).not.toContain("monodocs:content-width");
  });

  it("reports a broken theme as an error", async () => {
    const broken = join(dir, "broken-theme");
    await mkdir(broken, { recursive: true });
    await writeFile(join(broken, "template.html"), "<html><body>{{pages}}</body></html>");
    await writeFile(join(dir, "broken.config.yml"), 'html:\n  theme: "./broken-theme"\n');

    await expect(
      buildSite({
        inputDir: docs,
        configFile: join(dir, "broken.config.yml"),
        outputFile: out,
        format: "html",
      }),
    ).rejects.toThrow(/missing required tokens/);
  });

  it("follows the theme directory in watch, including after the config switches themes", async () => {
    const watchDir = join(dir, "watch-case");
    const watchDocs = join(watchDir, "docs");
    const themeA = join(watchDir, "theme-a");
    const themeB = join(watchDir, "theme-b");
    const watchOut = join(watchDir, "out.html");
    await mkdir(watchDocs, { recursive: true });
    await mkdir(themeA, { recursive: true });
    await mkdir(themeB, { recursive: true });
    await writeFile(join(watchDocs, "index.md"), "# Home\n");
    await writeFile(join(themeA, "style.css"), "body { --a: 1; }");
    await writeFile(join(themeB, "style.css"), "body { --b: 1; }");
    const configFile = join(watchDir, "monodocs.config.yml");
    await writeFile(configFile, 'html:\n  theme: "./theme-a"\n');

    let resolveNext: (() => void) | null = null;
    let onErrorOnce: ((error: Error) => void) | null = null;
    function nextRebuild(): Promise<void> {
      return new Promise<void>((res) => {
        resolveNext = res;
      });
    }
    const handle = await watchSite(
      { inputDir: watchDocs, configFile, outputFile: watchOut },
      {
        onRebuild: () => {
          const r = resolveNext;
          resolveNext = null;
          r?.();
        },
        onError: (error) => {
          const r = onErrorOnce;
          onErrorOnce = null;
          r?.(error);
        },
      },
    );

    try {
      expect(await readFile(watchOut, "utf8")).toContain("--a: 1");

      // テーマ側の編集で再ビルドされる。
      let done = nextRebuild();
      await writeFile(join(themeA, "style.css"), "body { --a: 2; }");
      await done;
      expect(await readFile(watchOut, "utf8")).toContain("--a: 2");

      // 設定でテーマを差し替えたら、監視先も新しいテーマへ移る。
      done = nextRebuild();
      await writeFile(configFile, 'html:\n  theme: "./theme-b"\n');
      await done;
      expect(await readFile(watchOut, "utf8")).toContain("--b: 1");

      done = nextRebuild();
      await writeFile(join(themeB, "style.css"), "body { --b: 2; }");
      await done;
      expect(await readFile(watchOut, "utf8")).toContain("--b: 2");

      // 壊れたテンプレートへ切り替えるとビルドは失敗するが、監視先はそのテーマへ移る。
      // 直したときに再ビルドされなければ、テーマ制作の用途で使えない。
      let failed: Error | null = null;
      const errorSeen = new Promise<void>((res) => {
        onErrorOnce = (error) => {
          failed = error;
          res();
        };
      });
      await writeFile(join(themeB, "template.html"), "<html><body>{{pages}}</body></html>");
      await errorSeen;
      expect(String(failed)).toMatch(/missing required tokens/);

      done = nextRebuild();
      await writeFile(
        join(themeB, "template.html"),
        [
          "<html><head><style>{{style}}</style></head>",
          "<body data-fixed><aside>{{sidebar}}</aside><main>{{pages}}</main>",
          "<script>window.__MONODOCS_DATA__ = {{siteDataJson}};</script>",
          "<script>{{appJs}}</script>{{bodyScripts}}</body></html>",
        ].join("\n"),
      );
      await done;
      expect(await readFile(watchOut, "utf8")).toContain("data-fixed");
    } finally {
      handle.close();
    }
  }, 20000);

  it("keeps validate independent of the theme", async () => {
    // validate は出力を書かないため、テーマが壊れていても入力の検証は通す。
    const result = await validateSite({
      inputDir: docs,
      configFile: join(dir, "broken.config.yml"),
    });
    expect(result.errors).toEqual([]);
  });
});
