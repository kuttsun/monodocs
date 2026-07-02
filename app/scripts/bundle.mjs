// monodocs CLI を依存込みの単一 CJS ファイルにバンドルする。
//
// 単一実行ファイル（SEA）の入力になるほか、`node dist/monodocs.cjs ...` として
// そのまま実行もできる（ホストに node があれば任意ディレクトリを配信できる）。
//
// テーマアセット（template.html / style.css / app.js）と mermaid inline ランタイムは
// 実行時にファイルシステムから読むため、バンドル単体では参照できない。そこで banner で
// `globalThis.__MONODOCS_ASSETS__` に埋め込み、loadTheme / mermaidRuntimeScript が
// それを優先して使う（src 側の埋め込みフォールバックは themes/index.ts を参照）。
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const coreSrc = resolve(appRoot, "packages/core/src");
const themeDir = resolve(coreSrc, "themes/default");
const entry = resolve(appRoot, "packages/cli/src/index.ts");
const outfile = resolve(appRoot, "dist/monodocs.cjs");

// 既定テーマのアセットを読み込んで埋め込む。
const [template, style, appJs] = await Promise.all([
  readFile(resolve(themeDir, "template.html"), "utf8"),
  readFile(resolve(themeDir, "style.css"), "utf8"),
  readFile(resolve(themeDir, "app.js"), "utf8"),
]);

// mermaid の inline ランタイム（config の mermaid.runtime: inline 用。既定 cdn では未使用）。
// node_modules を持たないホストでも inline を選べるよう同梱する。
const require = createRequire(resolve(coreSrc, "themes/mermaid.ts"));
const mermaidInline = await readFile(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");

const assets = {
  themes: { default: { template, style, appJs } },
  mermaidInline,
};

await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs", // SEA は CommonJS の main を要求する
  target: "node22",
  outfile,
  // cjs 出力では import.meta.url が空になり、fileURLToPath が読み込み時に throw する。
  // 実行ファイル自身のパスから URL を作って代替する（埋め込みアセット優先なので通常は未使用だが、
  // モジュール読み込み時の評価で壊れないようにする）。
  banner: {
    js:
      `globalThis.__MONODOCS_ASSETS__=${JSON.stringify(assets)};` +
      `var __monodocsImportMetaUrl=require("node:url").pathToFileURL(__filename).href;`,
  },
  define: { "import.meta.url": "__monodocsImportMetaUrl" },
  // puppeteer-core は optionalDependency で mermaid.mode: pre-render のときだけ動的 import する。
  // バンドルには含めない（Chromium 起動用に実体ファイルを要し、自己完結バンドルに載せられない）。
  // → このバンドル（単一 .cjs / SEA）は node_modules を持たないため pre-render 非対応。
  //   実行時に import("puppeteer-core") が失敗し、mermaidPrerender.ts が案内メッセージを出す。
  external: ["puppeteer-core"],
  // dist の tsc ビルドに依存せず、core を src から直接バンドルする。
  alias: { "@monodocs/core": resolve(coreSrc, "index.ts") },
  logLevel: "info",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`bundle: ${outfile} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
